#!/usr/bin/env node
// Mirrors a NocodeXport-exported Framer site into this repo as plain static
// files. Run this every time you re-publish in Framer and re-export via
// NocodeXport, pointing it at the fresh export URL:
//
//   node scripts/resync.mjs https://<your-export>.rehosted.page
//
// Then review `git diff`, commit, and push — Vercel redeploys automatically.

import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
if (!BASE) {
  console.error("Usage: node scripts/resync.mjs <export-base-url>");
  process.exit(1);
}

const OUT = path.resolve(import.meta.dirname, "..");
const ANIM_DIR = path.join(OUT, "assets/animate");

const visitedAssets = new Set();
const failedAssets = [];

function outPathForPage(urlPath) {
  let p = urlPath;
  if (p.endsWith("/")) p += "index.html";
  return path.join(OUT, p);
}

function outPathForAsset(urlPath) {
  return path.join(OUT, urlPath);
}

async function fetchText(urlPath) {
  const res = await fetch(BASE + urlPath);
  if (!res.ok) throw new Error(`${res.status} ${urlPath}`);
  return await res.text();
}

async function fetchBuffer(urlPath) {
  const res = await fetch(BASE + urlPath);
  if (!res.ok) throw new Error(`${res.status} ${urlPath}`);
  return Buffer.from(await res.arrayBuffer());
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function extractAssetPaths(text) {
  const found = new Set();
  const attrRe = /(?:src|href|poster)=["']([^"']+)["']/g;
  let m;
  while ((m = attrRe.exec(text))) found.add(m[1]);

  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  while ((m = urlRe.exec(text))) found.add(m[1]);

  const srcsetRe = /srcset=["']([^"']+)["']/g;
  while ((m = srcsetRe.exec(text))) {
    for (const part of m[1].split(",")) {
      const u = part.trim().split(/\s+/)[0];
      if (u) found.add(u);
    }
  }

  const importRe = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
  while ((m = importRe.exec(text))) found.add(m[1]);

  const genericAssetRe = /["'](\/assets\/[^"']+)["']/g;
  while ((m = genericAssetRe.exec(text))) found.add(m[1]);

  return [...found];
}

function normalizeAssetUrl(raw, fromPath) {
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.startsWith("mailto:") || raw.startsWith("#")) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    if (raw.startsWith(BASE)) raw = raw.slice(BASE.length);
    else return null;
  }
  let [pth] = raw.split("#");
  if (!pth.startsWith("/")) {
    const base = fromPath.endsWith("/") ? fromPath : path.posix.dirname(fromPath) + "/";
    pth = path.posix.normalize(base + pth);
  }
  return pth;
}

async function downloadAsset(urlPath) {
  const [cleanPath] = urlPath.split("?");
  if (visitedAssets.has(cleanPath)) return;
  visitedAssets.add(cleanPath);

  const outFile = outPathForAsset(cleanPath);
  try {
    let buf;
    let textForScan = null;
    const isTextAsset = /\.(mjs|js|css|json|svg|html)$/i.test(cleanPath);
    if (isTextAsset) {
      textForScan = await fetchText(cleanPath);
      buf = Buffer.from(textForScan, "utf8");
    } else {
      buf = await fetchBuffer(cleanPath);
    }
    ensureDirFor(outFile);
    fs.writeFileSync(outFile, buf);
    console.log(`asset  ${cleanPath} (${buf.length}b)`);

    if (textForScan) {
      for (const r of extractAssetPaths(textForScan)) {
        const norm = normalizeAssetUrl(r, cleanPath);
        if (norm && norm.startsWith("/assets/")) await downloadAsset(norm);
      }
    }
  } catch (e) {
    failedAssets.push(`${cleanPath} :: ${e.message}`);
    console.log(`FAILED ${cleanPath} :: ${e.message}`);
  }
}

async function discoverPages() {
  const robots = await fetchText("/robots.txt");
  const m = robots.match(/Sitemap:\s*(\S+)/i);
  if (!m) throw new Error("Could not find Sitemap: line in /robots.txt");
  const sitemapUrl = m[1];
  const sitemapPath = sitemapUrl.startsWith(BASE) ? sitemapUrl.slice(BASE.length) : new URL(sitemapUrl).pathname;
  const xml = await fetchText(sitemapPath);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((mm) => mm[1]);
  const pages = locs.map((loc) => new URL(loc).pathname);
  return { pages, sitemapPath };
}

// Some page-router JS chunks are only referenced via a runtime manifest
// (id -> hashed filename) built from string concatenation, which static
// regex scanning of HTML can miss. After the page crawl, do extra passes
// over every downloaded .mjs file re-scanning for `*.mjs` filename tokens
// inside assets/animate, so lazily-loaded route/font chunks aren't skipped.
async function resolveTransitiveChunks() {
  const chunkRe = /[\w.\-$]+\.mjs/g;
  async function ensure(filename) {
    const local = path.join(ANIM_DIR, filename);
    if (fs.existsSync(local)) return false;
    try {
      const res = await fetch(`${BASE}/assets/animate/${filename}`);
      if (!res.ok) return false;
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(local, buf);
      console.log(`chunk  ${filename} (${buf.length}b)`);
      return true;
    } catch {
      return false;
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    if (!fs.existsSync(ANIM_DIR)) break;
    const files = fs.readdirSync(ANIM_DIR).filter((f) => f.endsWith(".mjs"));
    const needed = new Set();
    for (const f of files) {
      const t = fs.readFileSync(path.join(ANIM_DIR, f), "utf8");
      let m;
      while ((m = chunkRe.exec(t))) needed.add(m[0]);
    }
    for (const n of needed) {
      if (await ensure(n)) changed = true;
    }
  }
}

async function main() {
  console.log(`Resyncing from ${BASE} ...\n`);
  const { pages, sitemapPath } = await discoverPages();
  console.log(`Found ${pages.length} pages in sitemap.\n`);

  for (const pagePath of pages) {
    try {
      const html = await fetchText(pagePath);
      const outFile = outPathForPage(pagePath);
      ensureDirFor(outFile);
      fs.writeFileSync(outFile, html, "utf8");
      console.log(`page   ${pagePath} -> ${path.relative(OUT, outFile)}`);

      for (const r of extractAssetPaths(html)) {
        const norm = normalizeAssetUrl(r, pagePath);
        if (norm && norm.startsWith("/assets/")) await downloadAsset(norm);
      }
    } catch (e) {
      console.log(`PAGE FAILED ${pagePath} :: ${e.message}`);
    }
  }

  // 404 pages are served with an HTTP 404 status by design; fetch regardless.
  try {
    const res = await fetch(BASE + "/404/");
    const buf = Buffer.from(await res.arrayBuffer());
    const outFile = outPathForPage("/404/");
    ensureDirFor(outFile);
    fs.writeFileSync(outFile, buf);
    console.log("page   /404/ -> 404/index.html");
    for (const r of extractAssetPaths(buf.toString("utf8"))) {
      const norm = normalizeAssetUrl(r, "/404/");
      if (norm && norm.startsWith("/assets/")) await downloadAsset(norm);
    }
  } catch (e) {
    console.log(`PAGE FAILED /404/ :: ${e.message}`);
  }

  const extras = ["/robots.txt", sitemapPath];
  for (const ex of extras) {
    try {
      const buf = await fetchBuffer(ex);
      const outFile = path.join(OUT, ex);
      ensureDirFor(outFile);
      fs.writeFileSync(outFile, buf);
      console.log(`extra  ${ex}`);
    } catch (e) {
      console.log(`EXTRA FAILED ${ex} :: ${e.message}`);
    }
  }

  console.log("\nResolving transitively-referenced JS chunks (fonts, route chunks)...");
  await resolveTransitiveChunks();

  console.log("\n--- DONE ---");
  console.log("Assets touched:", visitedAssets.size);
  if (failedAssets.length) {
    console.log("Failed:", failedAssets.length);
    failedAssets.forEach((f) => console.log(" -", f));
  }
  console.log("\nNext steps: git status / git diff to review, then commit & push.");
}

main();
