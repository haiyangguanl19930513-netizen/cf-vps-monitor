import type { NormalizedPingTask, PingRecord, PingTaskSeries } from './pingChart.ts';

export type SichuanCarrier = 'telecom' | 'unicom' | 'mobile';

export interface SichuanNetworkPreset {
  carrier: SichuanCarrier;
  label: string;
  name: string;
  target: string;
}

export const SICHUAN_NETWORK_PRESETS: readonly SichuanNetworkPreset[] = [
  { carrier: 'telecom', label: '电信', name: '四川电信', target: '61.139.2.69' },
  { carrier: 'unicom', label: '联通', name: '四川联通', target: '119.6.6.6' },
  { carrier: 'mobile', label: '移动', name: '四川移动', target: '211.137.96.205' },
] as const;

const carrierByTarget = new Map(
  SICHUAN_NETWORK_PRESETS.map((preset) => [preset.target, preset.carrier]),
);

export function identifySichuanCarrier(task: Pick<NormalizedPingTask, 'label' | 'target'>): SichuanCarrier | null {
  const target = task.target.trim().replace(/^\[|\]$/g, '').split(':')[0];
  const targetCarrier = carrierByTarget.get(target);
  if (targetCarrier) return targetCarrier;

  const label = `${task.label} ${task.target}`.toLowerCase();
  if (!label.includes('四川') && !label.includes('sichuan')) return null;
  if (label.includes('电信') || label.includes('telecom') || label.includes('chinanet')) return 'telecom';
  if (label.includes('联通') || label.includes('unicom')) return 'unicom';
  if (label.includes('移动') || label.includes('mobile') || label.includes('cmcc')) return 'mobile';
  return null;
}

export interface PingQualityStats {
  averageMs: number | null;
  lossPercent: number | null;
  totalSamples: number;
  lostSamples: number;
  latestAt: number | null;
}

/**
 * Ping 历史会压缩连续不变的结果，并至少每 30 分钟写一次心跳。
 * 按任务间隔恢复每段状态的样本权重，才能避免把一次连续丢包误算成单个样本。
 */
export function calculatePingQuality(records: PingRecord[], intervalSec: number): PingQualityStats {
  const chronological = records
    .map((record) => ({ time: Date.parse(record.time), value: Number(record.value) }))
    .filter((record) => Number.isFinite(record.time) && Number.isFinite(record.value))
    .sort((a, b) => a.time - b.time);

  if (chronological.length === 0) {
    return { averageMs: null, lossPercent: null, totalSamples: 0, lostSamples: 0, latestAt: null };
  }

  const boundedIntervalSec = Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : 60;
  const intervalMs = boundedIntervalSec * 1000;
  const maxCompressedSamples = Math.max(1, Math.ceil((30 * 60) / boundedIntervalSec));
  let totalSamples = 0;
  let lostSamples = 0;
  let successfulSamples = 0;
  let weightedLatency = 0;

  chronological.forEach((record, index) => {
    const next = chronological[index + 1];
    const elapsedSamples = next
      ? Math.round((next.time - record.time) / intervalMs)
      : 1;
    const sampleWeight = Math.max(1, Math.min(maxCompressedSamples, elapsedSamples));
    totalSamples += sampleWeight;
    if (record.value < 0) {
      lostSamples += sampleWeight;
      return;
    }
    successfulSamples += sampleWeight;
    weightedLatency += record.value * sampleWeight;
  });

  return {
    averageMs: successfulSamples > 0 ? weightedLatency / successfulSamples : null,
    lossPercent: totalSamples > 0 ? (lostSamples / totalSamples) * 100 : null,
    totalSamples,
    lostSamples,
    latestAt: chronological[chronological.length - 1]?.time ?? null,
  };
}

export function getSichuanNetworkSeries(series: PingTaskSeries[], carrier: SichuanCarrier) {
  return series.find((item) => identifySichuanCarrier(item.task) === carrier) || null;
}

export function formatPacketLoss(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value === 0) return '0%';
  if (value > 0 && value < 1) return '<1%';
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}
