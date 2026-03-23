'use strict';

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const RESULTS = path.join(__dirname, 'results.html');
const INTERVAL_MS = parseInt(process.env.BENCHMARK_INTERVAL_MS || '3600000', 10); // default 1 hour

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

// Healthcheck
app.get('/up', (req, res) => {
    res.status(200).send('OK');
});

// Serve results
app.get('/', (req, res) => {
    if (!fs.existsSync(RESULTS)) {
        return res.status(503).send('Benchmark has not run yet — check back shortly.');
    }
    res.sendFile(RESULTS);
});

function startServer() {
    app.listen(PORT, () => {
        console.log(`lollingbitmap running at http://localhost:${PORT}`);
    });
    // Re-run on a schedule
    setInterval(() => runBenchmark(), INTERVAL_MS);
}

// Run on startup if results don't exist yet, then start the server
if (fs.existsSync(RESULTS)) {
    startServer();
} else {
    runBenchmark((code) => {
        if (code !== 0) process.exit(1);
        startServer();
    });
}
