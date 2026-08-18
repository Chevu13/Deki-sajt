// Framer's client-side router fetches .framercms CMS-collection data files
// using a custom `?range=from-to[,from-to...]` query convention (not a
// standard HTTP Range header) and validates the response byte-length
// against the requested range. That convention is Framer's own CDN
// behavior — no static host (Vercel included) implements it natively, so
// plain static serving returns the whole file and Framer's client throws
// "Unexpected response length", which crashes the page (this is what broke
// client-side navigation to /work and to individual project pages, even
// before any of the CMS changes in this repo — the original export depends
// on Framer's infrastructure for this specific feature).
//
// This function reproduces that slicing server-side. A rewrite in
// vercel.json routes /assets/animate/<name>.framercms requests here.
import fs from "node:fs";
import path from "node:path";

export default function handler(req, res) {
  const { filename, range } = req.query;
  if (!filename) {
    res.status(400).send("Missing filename");
    return;
  }

  const filePath = path.join(process.cwd(), "assets", "animate", `${filename}.framercms`);
  if (!fs.existsSync(filePath)) {
    res.status(404).send("Not found");
    return;
  }

  const full = fs.readFileSync(filePath);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  if (!range) {
    res.status(200).send(full);
    return;
  }

  try {
    const chunks = String(range)
      .split(",")
      .map((r) => {
        const [from, toInclusive] = r.split("-").map(Number);
        return full.subarray(from, toInclusive + 1);
      });
    const combined = Buffer.concat(chunks);
    res.status(200).send(combined);
  } catch {
    res.status(400).send("Invalid range");
  }
}
