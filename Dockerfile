# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:25-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN node --expose-gc benchmark.js

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:25-alpine

WORKDIR /app

# Production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Pre-built results + server
COPY --from=builder /app/results.html ./results.html
COPY benchmark.js ./
COPY server.js ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/up || exit 1

CMD ["node", "server.js"]
