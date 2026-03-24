'use strict';

const RoaringBitmap32 = require('roaring/RoaringBitmap32');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const CHARTJS = fs.readFileSync(
  path.join(__dirname, 'node_modules/chart.js/dist/chart.umd.min.js'), 'utf8'
);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SIZES = [1_000, 10_000, 100_000, 1_000_000, 2_000_000];
const LOOKUP_SAMPLE_SIZE = 1_000;

const DISTRIBUTIONS = {
  dense: (size) => Array.from({ length: size }, (_, i) => i),
  sparse: (size) => Array.from({ length: size }, (_, i) => i * 100),
  clustered: (size) => {
    const vals = [];
    const groupSize = 100;
    const numGroups = Math.ceil(size / groupSize);
    for (let g = 0; g < numGroups; g++) {
      const base = g * 10_000;
      for (let j = 0; j < groupSize && vals.length < size; j++) {
        vals.push(base + j);
      }
    }
    return vals;
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gc() {
  if (global.gc) global.gc();
}

function measure(fn) {
  const start = performance.now();
  const result = fn();
  return { elapsed: performance.now() - start, result };
}

function heapUsed() {
  gc();
  return process.memoryUsage().heapUsed;
}

function buildLookupSample(values) {
  const n = LOOKUP_SAMPLE_SIZE;
  const hits = [];
  const step = Math.max(1, Math.floor(values.length / (n / 2)));
  for (let i = 0; i < values.length && hits.length < n / 2; i += step) {
    hits.push(values[i]);
  }
  const max = values[values.length - 1];
  const misses = Array.from({ length: n / 2 }, (_, i) => max + i + 1);
  return [...hits, ...misses];
}

function binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Benchmark runners
// ---------------------------------------------------------------------------

function benchRoaring(values, lookupSample) {
  gc();
  const mem0 = heapUsed();
  const { elapsed: buildMs, result: bitmap } = measure(() => {
    const b = new RoaringBitmap32();
    b.addMany(values);
    b.runOptimize();
    return b;
  });
  const memoryBytes = Math.max(0, heapUsed() - mem0);

  const { elapsed: containsMs } = measure(() => {
    for (const v of lookupSample) bitmap.has(v);
  });

  const { elapsed: iterMs } = measure(() => {
    let sum = 0;
    for (const v of bitmap) sum += v;
    return sum;
  });

  const bitmap2 = bitmap.clone();
  const { elapsed: unionMs } = measure(() => RoaringBitmap32.or(bitmap, bitmap2));
  const { elapsed: intersectMs } = measure(() => RoaringBitmap32.and(bitmap, bitmap2));
  const { elapsed: cardMs } = measure(() => bitmap.size);

  return { buildMs, containsMs, iterMs, unionMs, intersectMs, cardMs, memoryBytes };
}

function benchArray(values, lookupSample) {
  gc();
  const mem0 = heapUsed();
  const { elapsed: buildMs, result: arr } = measure(() => {
    const a = new Int32Array(values);
    a.sort();
    return a;
  });
  const memoryBytes = Math.max(0, heapUsed() - mem0);

  const { elapsed: containsMs } = measure(() => {
    for (const v of lookupSample) binarySearch(arr, v);
  });

  const { elapsed: iterMs } = measure(() => {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    return sum;
  });

  const arr2 = arr.slice();
  const { elapsed: unionMs } = measure(() => {
    // merge-sort union of two sorted Int32Arrays
    const out = new Int32Array(arr.length + arr2.length);
    let i = 0, j = 0, k = 0;
    while (i < arr.length && j < arr2.length) {
      if (arr[i] < arr2[j]) out[k++] = arr[i++];
      else if (arr[i] > arr2[j]) out[k++] = arr2[j++];
      else { out[k++] = arr[i++]; j++; }
    }
    while (i < arr.length) out[k++] = arr[i++];
    while (j < arr2.length) out[k++] = arr2[j++];
    return out.subarray(0, k);
  });

  const { elapsed: intersectMs } = measure(() => {
    // two-pointer intersection
    const out = new Int32Array(Math.min(arr.length, arr2.length));
    let i = 0, j = 0, k = 0;
    while (i < arr.length && j < arr2.length) {
      if (arr[i] === arr2[j]) { out[k++] = arr[i++]; j++; }
      else if (arr[i] < arr2[j]) i++;
      else j++;
    }
    return out.subarray(0, k);
  });

  const { elapsed: cardMs } = measure(() => arr.length);

  return { buildMs, containsMs, iterMs, unionMs, intersectMs, cardMs, memoryBytes };
}

function benchSet(values, lookupSample) {
  gc();
  const mem0 = heapUsed();
  const { elapsed: buildMs, result: s } = measure(() => new Set(values));
  const memoryBytes = Math.max(0, heapUsed() - mem0);

  const { elapsed: containsMs } = measure(() => {
    for (const v of lookupSample) s.has(v);
  });

  const { elapsed: iterMs } = measure(() => {
    let sum = 0;
    for (const v of s) sum += v;
    return sum;
  });

  const s2 = new Set(values);
  const { elapsed: unionMs } = measure(() => new Set([...s, ...s2]));

  const { elapsed: intersectMs } = measure(() => {
    const result = new Set();
    for (const v of s) { if (s2.has(v)) result.add(v); }
    return result;
  });

  const { elapsed: cardMs } = measure(() => s.size);

  return { buildMs, containsMs, iterMs, unionMs, intersectMs, cardMs, memoryBytes };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const results = [];
  const dists = Object.keys(DISTRIBUTIONS);
  const total = SIZES.length * dists.length;
  let done = 0;

  for (const size of SIZES) {
    for (const dist of dists) {
      done++;
      process.stdout.write(`[${done}/${total}] size=${size.toLocaleString()} dist=${dist} ... `);

      const values       = DISTRIBUTIONS[dist](size);
      const lookupSample = buildLookupSample(values);
      const roaring      = benchRoaring(values, lookupSample);
      const array        = benchArray(values, lookupSample);
      const set          = benchSet(values, lookupSample);

      results.push({ size, dist, roaring, array, set });
      console.log('done');
    }
  }

  const html = buildHtml(results);
  fs.mkdirSync('pages', { recursive: true });
  fs.writeFileSync('pages/roaring.html', html, 'utf8');
  console.log('\nWrote pages/roaring.html — open it in your browser.');
}

// ---------------------------------------------------------------------------
// HTML / Chart generation
// ---------------------------------------------------------------------------

function buildHtml(results) {
  const ops = [
    { key: 'buildMs',     label: 'Build',        unit: 'ms', desc: 'Time to construct the data structure from an array of integers' },
    { key: 'containsMs',  label: 'Contains',     unit: 'ms', desc: `Lookup time for ${LOOKUP_SAMPLE_SIZE} random values (50% hits, 50% misses)` },
    { key: 'iterMs',      label: 'Iteration',    unit: 'ms', desc: 'Time to iterate over all elements and sum them' },
    { key: 'unionMs',     label: 'Union',        unit: 'ms', desc: 'Set union of two identical structures' },
    { key: 'intersectMs', label: 'Intersection', unit: 'ms', desc: 'Set intersection of two identical structures' },
    { key: 'cardMs',      label: 'Cardinality',  unit: 'ms', desc: 'Time to retrieve the element count' },
    { key: 'memoryBytes', label: 'Memory',       unit: 'bytes', desc: 'Approximate heap bytes consumed by the structure' },
  ];

  const structures = [
    { key: 'roaring', label: 'RoaringBitmap', color: 'rgba(99, 179, 237, 0.85)',  border: 'rgba(99, 179, 237, 1)' },
    { key: 'array',   label: 'Int32Array',    color: 'rgba(154, 230, 180, 0.85)', border: 'rgba(154, 230, 180, 1)' },
    { key: 'set',     label: 'Set (HashMap)', color: 'rgba(252, 176, 129, 0.85)', border: 'rgba(252, 176, 129, 1)' },
  ];

  const dists = Object.keys(DISTRIBUTIONS);
  const sizes = SIZES;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>RoaringBitmap Benchmark</title>
<script>${CHARTJS}</script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f1117; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; }
  h1 { font-size: 1.6rem; font-weight: 700; margin-bottom: 4px; color: #f7fafc; }
  .subtitle { color: #718096; font-size: 0.9rem; margin-bottom: 24px; }
  .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
  .tab {
    padding: 8px 18px; border-radius: 8px; cursor: pointer;
    background: #1a202c; border: 1px solid #2d3748; color: #a0aec0;
    font-size: 0.85rem; font-weight: 500; transition: all 0.15s;
  }
  .tab:hover { background: #2d3748; color: #e2e8f0; }
  .tab.active { background: #2b6cb0; border-color: #3182ce; color: #fff; }
  .panel { display: none; }
  .panel.active { display: block; }
  .op-desc { color: #718096; font-size: 0.85rem; margin-bottom: 20px; }
  .chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 20px; margin-bottom: 32px; }
  .chart-card {
    background: #1a202c; border: 1px solid #2d3748; border-radius: 12px; padding: 20px;
  }
  .chart-card h3 { font-size: 0.9rem; font-weight: 600; color: #a0aec0; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.05em; }
  canvas { max-height: 260px; }
  .legend { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
  .legend-item { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: #a0aec0; }
  .legend-dot { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
  .section-title { font-size: 1rem; font-weight: 600; color: #e2e8f0; margin: 28px 0 14px; border-bottom: 1px solid #2d3748; padding-bottom: 8px; }
  .dist-cards { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 28px; }
  .dist-card { flex: 1; min-width: 220px; background: #1a202c; border: 1px solid #2d3748; border-radius: 10px; padding: 16px; }
  .dist-card .dist-name { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
  .dist-card.dense  .dist-name { color: #68d391; }
  .dist-card.sparse .dist-name { color: #f6ad55; }
  .dist-card.clustered .dist-name { color: #76e4f7; }
  .dist-card .dist-example { font-family: monospace; font-size: 0.78rem; color: #718096; margin-bottom: 8px; }
  .dist-card .dist-desc { font-size: 0.82rem; color: #a0aec0; line-height: 1.5; }
  .dist-card .dist-note { font-size: 0.78rem; color: #718096; margin-top: 8px; font-style: italic; }
</style>
</head>
<body>
<h1>RoaringBitmap vs Int32Array vs Set</h1>
<p class="subtitle">Benchmark across ${sizes.map(s => s >= 1e6 ? (s/1e6)+'M' : s >= 1e3 ? (s/1e3)+'K' : s).join(', ')} elements &mdash; dense, sparse, and clustered distributions</p>

<div class="legend">
  ${structures.map(s => `<div class="legend-item"><div class="legend-dot" style="background:${s.border}"></div>${s.label}</div>`).join('')}
</div>

<div class="dist-cards">
  <div class="dist-card dense">
    <div class="dist-name">Dense</div>
    <div class="dist-example">0, 1, 2, 3, 4, 5, 6, …</div>
    <div class="dist-desc">Consecutive integers starting at 0. Every possible value in the range is present with no gaps. This is the <strong>best case</strong> for RoaringBitmap — it switches to a run-length encoded container and compresses millions of integers down to just a few bytes (e.g. "run from 0 to N").</div>
    <div class="dist-note">Real-world example: row IDs in a full table scan, frame numbers in a video.</div>
  </div>
  <div class="dist-card sparse">
    <div class="dist-name">Sparse</div>
    <div class="dist-example">0, 100, 200, 300, 400, …</div>
    <div class="dist-desc">Integers spread evenly across a 100× wider range — every 100th value is set. Large gaps mean no run-length compression is possible. RoaringBitmap falls back to array containers per 65 536-value chunk, making it behave more like a sorted array. This is the <strong>hardest case</strong> for bitmap compression.</div>
    <div class="dist-note">Real-world example: sampled user IDs from a large ID space, sparse feature indices in ML.</div>
  </div>
  <div class="dist-card clustered">
    <div class="dist-name">Clustered</div>
    <div class="dist-example">0–99, 10000–10099, 20000–20099, …</div>
    <div class="dist-desc">Groups of 100 consecutive integers separated by gaps of ~9 900. Each cluster compresses well individually, but the gaps prevent a single run from covering everything. RoaringBitmap uses a <strong>mix of run and array containers</strong> — one per 65 536-value chunk — yielding good but not maximum compression.</div>
    <div class="dist-note">Real-world example: activity logs with bursty time windows, geohash buckets, event IDs per session.</div>
  </div>
</div>

<div class="tabs" id="tabs">
  ${ops.map((op, i) => `<div class="tab${i === 0 ? ' active' : ''}" data-panel="${op.key}">${op.label}</div>`).join('\n  ')}
</div>

${ops.map((op, oi) => `
<div class="panel${oi === 0 ? ' active' : ''}" id="panel-${op.key}">
  <p class="op-desc">${op.desc}</p>

  <div class="section-title">By Distribution &mdash; how structure size affects ${op.label.toLowerCase()} time</div>
  <div class="chart-grid">
    ${dists.map(dist => `
    <div class="chart-card">
      <h3>${dist}</h3>
      <canvas id="chart-${op.key}-dist-${dist}"></canvas>
    </div>`).join('')}
  </div>

  <div class="section-title">By Size &mdash; comparison across distributions at each dataset size</div>
  <div class="chart-grid">
    ${sizes.map(size => `
    <div class="chart-card">
      <h3>${size.toLocaleString()} elements</h3>
      <canvas id="chart-${op.key}-size-${size}"></canvas>
    </div>`).join('')}
  </div>
</div>`).join('')}

<script>
const DATA = ${JSON.stringify(results)};
const STRUCTURES = ${JSON.stringify(structures)};
const OPS = ${JSON.stringify(ops)};
const DISTS = ${JSON.stringify(dists)};
const SIZES = ${JSON.stringify(sizes)};

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => {
          const val = ctx.parsed.y;
          const unit = ctx.chart.options._unit || '';
          if (unit === 'bytes') {
            if (val >= 1_000_000) return \` \${ctx.dataset.label}: \${(val/1_000_000).toFixed(2)} MB\`;
            if (val >= 1_000) return \` \${ctx.dataset.label}: \${(val/1_000).toFixed(1)} KB\`;
            return \` \${ctx.dataset.label}: \${val.toFixed(0)} B\`;
          }
          return \` \${ctx.dataset.label}: \${val.toFixed(3)} ms\`;
        }
      }
    }
  },
  scales: {
    x: { ticks: { color: '#718096' }, grid: { color: '#2d3748' } },
    y: { ticks: { color: '#718096' }, grid: { color: '#2d3748' }, beginAtZero: true }
  }
};

function sizeLabel(s) {
  if (s >= 1_000_000) return (s / 1_000_000) + 'M';
  if (s >= 1_000) return (s / 1_000) + 'K';
  return String(s);
}

function lookup(size, dist, struct, key) {
  const row = DATA.find(r => r.size === size && r.dist === dist);
  return row ? row[struct][key] : 0;
}

function makeLineChart(canvasId, op, dist) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  new Chart(el, {
    type: 'line',
    data: {
      labels: SIZES.map(sizeLabel),
      datasets: STRUCTURES.map(st => ({
        label: st.label,
        data: SIZES.map(size => lookup(size, dist, st.key, op.key)),
        borderColor: st.border,
        backgroundColor: st.color,
        tension: 0.3,
        pointRadius: 4,
        fill: false,
      }))
    },
    options: {
      ...chartDefaults,
      _unit: op.unit,
      scales: {
        ...chartDefaults.scales,
        x: { ...chartDefaults.scales.x, title: { display: true, text: 'Dataset size', color: '#718096' } },
        y: { ...chartDefaults.scales.y, title: { display: true, text: op.unit === 'bytes' ? 'Memory' : 'Time (ms)', color: '#718096' } }
      }
    }
  });
}

function makeBarChart(canvasId, op, size) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  new Chart(el, {
    type: 'bar',
    data: {
      labels: DISTS,
      datasets: STRUCTURES.map(st => ({
        label: st.label,
        data: DISTS.map(dist => lookup(size, dist, st.key, op.key)),
        backgroundColor: st.color,
        borderColor: st.border,
        borderWidth: 1,
        borderRadius: 4,
      }))
    },
    options: {
      ...chartDefaults,
      _unit: op.unit,
      scales: {
        ...chartDefaults.scales,
        x: { ...chartDefaults.scales.x, title: { display: true, text: 'Distribution', color: '#718096' } },
        y: { ...chartDefaults.scales.y, title: { display: true, text: op.unit === 'bytes' ? 'Memory' : 'Time (ms)', color: '#718096' } }
      }
    }
  });
}

// Render all charts
for (const op of OPS) {
  for (const dist of DISTS) makeLineChart(\`chart-\${op.key}-dist-\${dist}\`, op, dist);
  for (const size of SIZES) makeBarChart(\`chart-\${op.key}-size-\${size}\`, op, size);
}

// Tab switching
document.getElementById('tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById('panel-' + tab.dataset.panel).classList.add('active');
});
</script>
</body>
</html>`;
}

main().catch(console.error);
