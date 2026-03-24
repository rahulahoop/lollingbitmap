'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Route → file mapping
const PAGES = {
    roaring: path.join(__dirname, 'pages/roaring.html'),
    woco: path.join(__dirname, 'pages/woco.html'),
};

function indexHtml() {
    const links = Object.keys(PAGES)
        .map(name => `  <li><a href="/${name}">/${name}</a></li>`)
        .join('\n');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>pages</title></head><body><ul>\n${links}\n</ul></body></html>`;
}

const server = http.createServer((req, res) => {
    if (req.url === '/up') {
        res.writeHead(200);
        res.end('OK');
        return;
    }

    if (req.url === '/') {
        const html = indexHtml();
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': Buffer.byteLength(html, 'utf8'),
        });
        res.end(html, 'utf8');
        return;
    }

    const name = req.url.slice(1);
    const filePath = PAGES[name];
    if (filePath) {
        if (!fs.existsSync(filePath)) {
            res.writeHead(503);
            res.end(`/${name} not ready yet — check back shortly.`);
            return;
        }
        const html = fs.readFileSync(filePath, 'utf8');
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
    console.log(`pages running at http://localhost:${PORT}`);
});
