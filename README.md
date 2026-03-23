# lollingbitmap

Benchmark visualization comparing [RoaringBitmap](https://github.com/SalvatorePreviti/roaring-node) vs `Int32Array` vs `Set` across dataset sizes and distributions.

Live at **[lolling.legume.dad](https://lolling.legume.dad)**

## What it benchmarks

**Operations:** build, contains, iteration, union, intersection, cardinality, memory usage

**Sizes:** 1K, 10K, 100K, 1M, 2M elements

**Distributions:**
- **Dense** — consecutive integers (0, 1, 2, …) — best case for RoaringBitmap run-length encoding
- **Sparse** — evenly spaced with large gaps (0, 100, 200, …) — array container territory
- **Clustered** — bursts of 100 consecutive values with gaps — realistic mixed workload

## Running locally

```bash
# Run the benchmark and open results.html
node --expose-gc benchmark.js

# Start the web server (runs benchmark on startup if needed, refreshes hourly)
node server.js
```

Requires Node.js >= 25.

## Docker

```bash
# Build (benchmark runs at build time, results baked into image)
docker build .

# Run
docker compose up
```

The benchmark runs during the Docker build so the container starts instantly with pre-computed results. It re-runs hourly in the background to stay fresh.

## Deployment

CI pushes to `ghcr.io/rahulahoop/lollingbitmap` on every push to `main`. Pull and restart on the server:

```bash
docker compose pull && docker compose up -d
```
