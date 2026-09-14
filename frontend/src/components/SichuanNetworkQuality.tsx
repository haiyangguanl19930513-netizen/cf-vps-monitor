import { useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import { fetchPingTaskSeries, formatPingMs, type PingTaskSeries } from '../utils/pingChart';
import {
  calculatePingQuality,
  formatPacketLoss,
  getSichuanNetworkSeries,
  identifySichuanCarrier,
  SICHUAN_NETWORK_PRESETS,
} from '../utils/sichuanNetwork';

const RANGE_HOURS = 1;
const REFRESH_INTERVAL_MS = 60_000;

interface SichuanNetworkQualityProps {
  uuid: string;
  includeHidden?: boolean;
}

function qualityState(latency: number | null, loss: number | null) {
  if (loss !== null && loss >= 10) return 'bad';
  if (loss !== null && loss > 0) return 'warn';
  if (latency !== null && latency >= 350) return 'bad';
  if (latency !== null && latency >= 250) return 'warn';
  if (latency !== null) return 'good';
  return 'empty';
}

export default function SichuanNetworkQuality({ uuid, includeHidden = false }: SichuanNetworkQualityProps) {
  const [series, setSeries] = useState<PingTaskSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid) return;
    const controller = new AbortController();

    const load = async () => {
      try {
        const nextSeries = await fetchPingTaskSeries(uuid, {
          maxTasks: SICHUAN_NETWORK_PRESETS.length,
          rangeHours: RANGE_HOURS,
          includeHidden,
          taskFilter: (task) => identifySichuanCarrier(task) !== null,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setSeries(nextSeries);
          setError(null);
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : '三网数据加载失败');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    const refreshWhenVisible = () => {
      if (!document.hidden) void load();
    };
    void load();
    const timer = window.setInterval(refreshWhenVisible, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [includeHidden, uuid]);

  const rows = useMemo(() => SICHUAN_NETWORK_PRESETS.map((preset) => {
    const item = getSichuanNetworkSeries(series, preset.carrier);
    const stats = item
      ? calculatePingQuality(item.records, item.task.intervalSec)
      : { averageMs: null, lossPercent: null, totalSamples: 0, lostSamples: 0, latestAt: null };
    return { preset, item, stats };
  }), [series]);

  return (
    <section className="node-network-quality" aria-label="四川三网延迟与丢包">
      <div className="node-network-quality-header">
        <span className="node-network-quality-title"><Activity size={13} />四川三网</span>
        <span className="node-network-quality-period" title={error || '根据探针最近一小时的 ICMP 记录统计'}>
          {error ? '加载失败' : '近1小时'}
        </span>
      </div>
      <div className="node-network-quality-grid">
        {rows.map(({ preset, item, stats }) => {
          const state = qualityState(stats.averageMs, stats.lossPercent);
          const latency = loading && !item ? '…' : stats.averageMs === null ? '—' : formatPingMs(stats.averageMs);
          const loss = loading && !item ? '…' : formatPacketLoss(stats.lossPercent);
          const title = item
            ? `${preset.name} ${item.task.target} · ${stats.totalSamples} 个估算样本`
            : `${preset.name}尚未配置，请在后台“延迟监测”中添加`;
          return (
            <div className="node-network-quality-item" data-quality={state} key={preset.carrier} title={title}>
              <span className="node-network-quality-carrier">{preset.label}</span>
              <strong className="node-network-quality-latency">{latency}</strong>
              <span className="node-network-quality-loss">丢包 {loss}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
