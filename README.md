# pages

Static pages server. Routes are defined in `server.js` as a mapping from URL path to HTML file in `pages/`.

Live at **[lolling.legume.dad](https://lolling.legume.dad)**

| Route | File |
|-------|------|
| `/roaring` | `pages/roaring.html` — RoaringBitmap vs Int32Array vs Set benchmark |
| `/woco` | `pages/woco.html` |

## Adding a page

1. Drop an HTML file in `pages/`
2. Add an entry to the `PAGES` map in `server.js`

## Running locally

```bash
# Generate roaring benchmark results
node --expose-gc benchmark.js

# Start the server
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

## Deployment

CI pushes to `ghcr.io/rahulahoop/pages` on every push to `main`. Pull and restart on the server:

```bash
docker compose pull && docker compose up -d
```
