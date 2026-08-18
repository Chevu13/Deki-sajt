#!/usr/bin/env node
// Local dev server that approximates Vercel's behavior closely enough to
// preview the site correctly — plain `python -m http.server` (or any
// generic static server) doesn't implement the vercel.json rewrite that
// makes /assets/animate/*.framercms work, so clicking through the site
// with one of those would reproduce the "Unexpected response length"
// crash that only exists locally, not on the real deploy.
//
// Run: node scripts/dev-server.mjs [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.argv[2]) || 8935;

const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".mp4": "video/mp4", ".txt": "text/plain", ".xml": "application/xml",
};

function framercmsHandler(res, filename, query) {
  const range = query.get("range");
  const filePath = path.join(ROOT, "assets", "animate", `${filename}.framercms`);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404).end("Not found");
    return;
  }
  const full = fs.readFileSync(filePath);
  res.setHeader("Content-Type", "application/octet-stream");
  if (!range) {
    res.writeHead(200).end(full);
    return;
  }
  try {
    const chunks = range.split(",").map((r) => {
      const [from, toInclusive] = r.split("-").map(Number);
      return full.subarray(from, toInclusive + 1);
    });
    res.writeHead(200).end(Buffer.concat(chunks));
  } catch {
    res.writeHead(400).end("Invalid range");
  }
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = decodeURIComponent(parsed.pathname);

  const rewriteMatch = pathname.match(/^\/assets\/animate\/([^/]+)\.framercms$/);
  if (rewriteMatch) {
    framercmsHandler(res, rewriteMatch[1], new URLSearchParams(parsed.query || ""));
    return;
  }

  let filePath = path.join(ROOT, pathname);
  if (pathname.endsWith("/")) filePath = path.join(filePath, "index.html");

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => console.log(`Dev server (Vercel-like) at http://localhost:${PORT}`));
