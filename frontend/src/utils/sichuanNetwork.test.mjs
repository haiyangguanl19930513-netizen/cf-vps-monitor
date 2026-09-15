import assert from 'node:assert/strict';

const {
  SICHUAN_NETWORK_PRESETS,
  calculatePingQuality,
  formatPacketLoss,
  identifySichuanCarrier,
} = await import('./sichuanNetwork.ts');
const { buildPingLossChartRows } = await import('./pingChart.ts');

assert.deepEqual(
  SICHUAN_NETWORK_PRESETS.map(({ name, target }) => [name, target]),
  [
    ['四川电信', '61.139.2.69'],
    ['四川联通', '119.6.6.6'],
    ['四川移动', '211.137.96.205'],
  ],
);

assert.equal(identifySichuanCarrier({ label: '任意名称', target: '61.139.2.69' }), 'telecom');
assert.equal(identifySichuanCarrier({ label: '四川联通', target: 'example.com' }), 'unicom');
assert.equal(identifySichuanCarrier({ label: 'Sichuan CMCC', target: 'example.com' }), 'mobile');
assert.equal(identifySichuanCarrier({ label: '广东电信', target: 'example.com' }), null);

const compressed = calculatePingQuality([
  { time: '2026-09-14T00:00:00.000Z', value: 100 },
  { time: '2026-09-14T00:03:00.000Z', value: -1 },
  { time: '2026-09-14T00:04:00.000Z', value: 80 },
  { time: '2026-09-14T00:34:00.000Z', value: 90 },
], 60);
assert.equal(compressed.totalSamples, 35);
assert.equal(compressed.lostSamples, 1);
assert.ok(Math.abs((compressed.lossPercent ?? 0) - (100 / 35)) < 0.001);
assert.ok(Math.abs((compressed.averageMs ?? 0) - (2790 / 34)) < 0.001);

const allLost = calculatePingQuality([
  { time: '2026-09-14T00:00:00.000Z', value: -1 },
  { time: '2026-09-14T00:01:00.000Z', value: -1 },
], 60);
assert.equal(allLost.averageMs, null);
assert.equal(allLost.lossPercent, 100);

assert.deepEqual(calculatePingQuality([], 60), {
  averageMs: null,
  lossPercent: null,
  totalSamples: 0,
  lostSamples: 0,
  latestAt: null,
});
assert.equal(formatPacketLoss(0), '0%');
assert.equal(formatPacketLoss(0.4), '<1%');
assert.equal(formatPacketLoss(12.5), '13%');

const lossStart = Date.parse('2026-09-14T00:00:00.000Z');
const lossEnd = Date.parse('2026-09-14T00:01:00.000Z');
assert.deepEqual(buildPingLossChartRows([
  {
    task: { id: 1, key: 'task_1', label: '线路 1', target: 'one.example', type: 'PING', intervalSec: 60, color: '#f00' },
    records: [
      { time: '2026-09-14T00:00:00.000Z', value: 80 },
      { time: '2026-09-14T00:01:00.000Z', value: -1 },
    ],
  },
  {
    task: { id: 2, key: 'task_2', label: '线路 2', target: 'two.example', type: 'PING', intervalSec: 60, color: '#0f0' },
    records: [{ time: '2026-09-14T00:00:00.000Z', value: -1 }],
  },
]), [
  { time: lossStart, task_1: 0, task_2: 100 },
  { time: lossEnd, task_1: 100, task_2: 100 },
]);
