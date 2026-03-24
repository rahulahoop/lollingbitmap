'use strict';

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const RESULTS = path.join(__dirname, 'results.html');

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
        const html = fs.readFileSync(RESULTS, 'utf8');
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': Buffer.byteLength(html, 'utf8'),
        });
        res.end(html, 'utf8');
        return;
    }
    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`lollingbitmap running at http://localhost:${PORT}`);
});
