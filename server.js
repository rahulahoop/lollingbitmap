'use strict';

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

function runBenchmark(cb) {
    const child = spawn(process.execPath, ['--expose-gc', 'benchmark.js'], {
        cwd: __dirname,
        stdio: 'inherit',
    });
    child.on('close', cb);
}

// Healthcheck
app.get('/up', (req, res) => {
    res.status(200).send('OK');
});

// Serve results.html
app.get('/', (req, res) => {
    const resultsPath = path.join(__dirname, 'results.html');
    if (!fs.existsSync(resultsPath)) {
        return res.status(503).send('Benchmark has not run yet. Visit <a href="/run">/run</a> to start it.');
    }
    res.sendFile(resultsPath);
});

// Re-run benchmark and refresh results.html
app.get('/run', (req, res) => {
    console.log('Running benchmark...');
    runBenchmark((code) => {
        if (code !== 0) {
            return res.status(500).send(`Benchmark exited with code ${code}`);
        }
        res.sendFile(path.join(__dirname, 'results.html'));
    });
});

function startServer() {
    app.listen(PORT, () => {
        console.log(`lollingbitmap running at http://localhost:${PORT}`);
    });
}

// Run benchmark on startup only if results.html doesn't already exist
if (fs.existsSync(path.join(__dirname, 'results.html'))) {
    startServer();
} else {
    console.log('Running benchmark on startup...');
    runBenchmark((code) => {
        if (code !== 0) {
            console.error(`Startup benchmark exited with code ${code}`);
            process.exit(1);
        }
        startServer();
    });
}
