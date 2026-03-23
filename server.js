'use strict';

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const RESULTS = path.join(__dirname, 'results.html');
const INTERVAL_MS = parseInt(process.env.BENCHMARK_INTERVAL_MS || '3600000', 10);

function runBenchmark(cb) {
    console.log(`[${new Date().toISOString()}] Running benchmark...`);
    const child = spawn(process.execPath, ['--expose-gc', 'benchmark.js'], {
        cwd: __dirname,
        stdio: 'inherit',
    });
    child.on('close', (code) => {
        if (code !== 0) console.error(`Benchmark exited with code ${code}`);
        else console.log(`[${new Date().toISOString()}] Benchmark complete.`);
        if (cb) cb(code);
    });
}

const server = http.createServer((req, res) => {
    if (req.url === '/up') {
        res.writeHead(200);
        res.end('OK');
        return;
    }
    if (req.url === '/') {
        if (!fs.existsSync(RESULTS)) {
            res.writeHead(503);
            res.end('Benchmark has not run yet — check back shortly.');
            return;
        }
        const html = fs.readFileSync(RESULTS);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
    }
    res.writeHead(404);
    res.end('Not found');
});

function startServer() {
    server.listen(PORT, () => {
        console.log(`lollingbitmap running at http://localhost:${PORT}`);
    });
    setInterval(() => runBenchmark(), INTERVAL_MS);
}

if (fs.existsSync(RESULTS)) {
    startServer();
} else {
    runBenchmark((code) => {
        if (code !== 0) process.exit(1);
        startServer();
    });
}
