#!/usr/bin/env node
// Pravi content/legacy-images.json — mapu "koja slika stoji gde" za 6
// originalnih Framer stranica, da bi CMS panel mogao da ih prikaze i menja.
//
// Te stranice su staticki Framer export i nemaju Markdown izvor, pa se mapa
// izvlaci iz samog HTML-a. Redosled je na svih 6 stranica identican:
//
//   1.  logo u navigaciji            (preskace se)
//   2.  hero slika projekta          -> Thumb
//   3.-8. sest slika galerije        -> Image 1..6
//   9.  zajednicka footer/CTA slika  (preskace se — ista je na svim stranicama)
//
// `match` je token koji se trazi u HTML-u pri zameni slike: kod Framer slika
// to je hash bez sufiksa velicine (`image-d7d720ef`), jer ista slika stoji u
// `srcset`-u u vise velicina. Kad se slika zameni uploadom, `match` postaje
// puna putanja novog fajla. Panel odrzava ovaj fajl posle svake izmene.
//
// Pokretanje: npm run legacy-images  (potrebno posle novog Framer exporta)

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LEGACY_FILE = path.join(ROOT, "content/legacy-work.json");
const OUT_FILE = path.join(ROOT, "content/legacy-images.json");

// Slike koje se javljaju na svakoj stranici i nisu deo projekta.
const CHROME_IMAGES = new Set([
  "image-9299c3ff", // logo u navigaciji (desktop + mobile varijanta)
  "image-60b39321", // slika u footer/CTA sekciji, identicna na svih 6 stranica
]);

const GALLERY_SLOTS = 6;

function orderedImages(html) {
  const tags = html.match(/<img\b[^>]*>/g) || [];
  const seen = new Set();
  const out = [];

  for (const tag of tags) {
    const src = /\ssrc="(\/assets\/images\/opt\/(image-[a-f0-9]+)-\d+\.webp)"/.exec(tag);
    if (!src) continue;
    const base = src[2];
    if (CHROME_IMAGES.has(base) || seen.has(base)) continue;
    seen.add(base);
    const alt = /\salt="([^"]*)"/.exec(tag);
    out.push({ match: base, src: src[1], alt: alt ? alt[1] : "" });
  }
  return out;
}

function findVideo(html) {
  const match = /<video\b[^>]*\ssrc="(\/assets\/videos\/[^"]+)"/.exec(html);
  if (!match) return null;
  return { match: match[1], src: match[1] };
}

function main() {
  const legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, "utf8"));
  const manifest = {};
  let warnings = 0;

  for (const project of legacy) {
    const file = path.join(ROOT, "work", project.slug, "index.html");
    if (!fs.existsSync(file)) {
      console.warn(`preskacem ${project.slug} — nema work/${project.slug}/index.html`);
      warnings++;
      continue;
    }

    const html = fs.readFileSync(file, "utf8");
    const images = orderedImages(html);

    if (images.length < 1 + GALLERY_SLOTS) {
      console.warn(
        `upozorenje: ${project.slug} ima ${images.length} slika, ocekivano ${1 + GALLERY_SLOTS}`
      );
      warnings++;
    }

    const [thumb, ...gallery] = images;
    manifest[project.slug] = {
      thumb: thumb || null,
      images: gallery.slice(0, GALLERY_SLOTS),
      video: findVideo(html),
    };

    console.log(
      `${project.slug}: thumb + ${Math.min(gallery.length, GALLERY_SLOTS)} slika` +
        (manifest[project.slug].video ? " + video" : "")
    );
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`\nnapisano: content/legacy-images.json`);
  if (warnings) console.log(`upozorenja: ${warnings}`);
}

main();
