# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM --platform=linux/amd64 node:25-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN node --expose-gc benchmark.js

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM --platform=linux/amd64 node:25-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Pre-built results + server
COPY --from=builder /app/results.html ./results.html
COPY benchmark.js ./
COPY server.js ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:3000/up || exit 1

CMD ["node", "server.js"]
