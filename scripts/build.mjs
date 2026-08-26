#!/usr/bin/env node
// Generates work/<slug>/index.html for each project in content/work/*.md,
// and fully regenerates work/index.html (hero + a card grid mixing the
// original 6 Framer-authored projects with CMS-managed ones).
//
// work/index.html used to be an original Framer/React page. Early testing
// showed that injecting new markup into it got silently stripped after
// Framer's JS hydrated the page (React reconciles the DOM against its own
// tree and removes anything it doesn't recognize). So work/index.html is
// now itself a CMS-generated page like the individual project pages — no
// Framer JS runtime, plain HTML/CSS/vanilla JS, fully under this script's
// control. The other original pages (home/about/contact/privacy-policy/404,
// and the 6 original project pages) are never touched by this script.
//
// Run via `npm run build` — Vercel runs this automatically on every push.

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content/work");
const LEGACY_FILE = path.join(ROOT, "content/legacy-work.json");
const WORK_LIST_FILE = path.join(ROOT, "work/index.html");
const SITEMAP_FILE = path.join(ROOT, "sitemap.xml");
const SITE_URL = "https://www.dtumenko.com";
// Strelica u uglu kartice — isti fajl koji Framer koristi na naslovnoj.
const CARD_ARROW = "/assets/images/image-01d98f11.svg";

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// Svi linkovi u template-ima su apsolutni ("/work", "/about", …). Relativni su
// ovde bili greska: vercel.json ima trailingSlash: false, pa /work nema kosu
// crtu na kraju i "./cro-sea-villas" se racuna od korena — /cro-sea-villas
// umesto /work/cro-sea-villas, dakle 404. Apsolutne putanje rade isto na svakoj
// dubini, pa nema ni prepravljanja nav/footer partiala po dubini stranice.

function loadProjects() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(CONTENT_DIR, f), "utf8");
      const { data, content } = matter(raw);
      return { ...data, project_overview: data.project_overview || content.trim() };
    })
    .filter((p) => (p.status || "Live") === "Live" && p.slug);
}

// Framer stranice se ne generisu odavde, ali im kartica na /work dolazi iz
// legacy-work.json — pa `status: "Draft"` sklanja projekat sa liste i iz
// sitemap-a. Sama stranica ostaje na svom URL-u (staticki export).
function loadLegacyProjects() {
  if (!fs.existsSync(LEGACY_FILE)) return [];
  return JSON.parse(fs.readFileSync(LEGACY_FILE, "utf8")).filter(
    (project) => (project.status || "Live") === "Live"
  );
}

function renderGalleryItems(gallery) {
  if (!Array.isArray(gallery) || gallery.length === 0) return "";
  return gallery
    .map((item) => {
      if (item.type === "video") {
        return `      <div class="cms-project__figure"><video src="${escapeHtml(item.src)}" muted loop playsinline controls preload="metadata"></video></div>`;
      }
      return `      <div class="cms-project__figure"><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt || "")}" loading="lazy"></div>`;
    })
    .join("\n");
}

// Framer usluge redja jednu ispod druge, ne kao nabrajanje kroz zarez.
function renderServiceList(services) {
  if (!services) return "";
  const list = (Array.isArray(services) ? services : [services]).filter(Boolean);
  if (!list.length) return "";
  const items = list
    .map((service) => `        <li>${escapeHtml(service)}</li>`)
    .join("\n");
  return `      <ul class="cms-info__services">\n${items}\n      </ul>`;
}

// "croseavillas.hr" otkucano bez protokola bi kao href bilo relativno i vodilo
// na /work/<slug>/croseavillas.hr. Framer je to sam normalizovao, pa i mi.
function normalizeUrl(url) {
  const trimmed = String(url).trim();
  if (!trimmed || /^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith("/")) return trimmed;
  if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function renderLiveLinkBlock(liveLink) {
  if (!liveLink) return "";
  const href = normalizeUrl(liveLink);
  // Framer ovde uvek pise "Live Work", ne sam URL.
  return `      <a class="cms-info__link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Live Work</a>`;
}

// {{CANONICAL}} feeds <link rel="canonical">, og:url and the JSON-LD block in
// templates/_head.html. canonicalPath is the clean, root-absolute path of the
// generated page ("/work", "/work/<slug>") — matches vercel.json cleanUrls.
function renderHead(headPartial, title, description, canonicalPath, noindex) {
  return headPartial
    .replace(/\{\{TITLE\}\}/g, escapeHtml(title))
    .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(description || ""))
    .replace(/\{\{CANONICAL\}\}/g, escapeHtml(SITE_URL + canonicalPath))
    .replace(
      /\{\{ROBOTS\}\}/g,
      noindex ? '<meta name="robots" content="noindex, nofollow">' : ""
    );
}

function buildWorkItemPage(project, partials) {
  const head = renderHead(
    partials.head,
    `${project.title} — Dejan Tumenko`,
    project.overview,
    `/work/${project.slug}`,
    project.noindex
  );

  return partials.workItemTemplate
    .replace("<!--CMS_HEAD-->", head)
    .replace("<!--CMS_NAV-->", partials.nav)
    .replace("<!--CMS_FOOTER-->", partials.footer)
    .replace(/\{\{TITLE\}\}/g, escapeHtml(project.title))
    .replace("{{HERO_IMAGE}}", escapeHtml(project.hero_image || ""))
    .replace("{{GALLERY_ITEMS}}", renderGalleryItems(project.gallery))
    .replace("{{YEAR}}", escapeHtml(project.year || ""))
    .replace("{{SERVICE_LIST}}", renderServiceList(project.services))
    .replace("{{LIVE_LINK_BLOCK}}", renderLiveLinkBlock(project.live_link))
    .replace("{{PROJECT_OVERVIEW}}", escapeHtml(project.project_overview || ""));
}

function buildCardGrid(projects) {
  const cards = projects
    .map(
      (p) => `        <a class="cms-card" href="/work/${escapeHtml(p.slug)}">
          <div class="cms-card__image"><img src="${escapeHtml(p.hero_image || (p.gallery && p.gallery[0] && p.gallery[0].src) || "")}" alt="${escapeHtml(p.title)}" loading="lazy"></div>
          <div class="cms-card__body">
            <div class="cms-card__meta">
              <h3 class="cms-card__title">${escapeHtml(p.title)}</h3>
              <p class="cms-card__year">${escapeHtml(p.year || "")}</p>
            </div>
            <p class="cms-card__overview">${escapeHtml(p.overview || "")}</p>
          </div>
          <img class="cms-card__arrow" src="${CARD_ARROW}" alt="" aria-hidden="true">
        </a>`
    )
    .join("\n");
  return `    <div class="cms-card-grid">\n${cards}\n    </div>`;
}

function buildWorkListPage(allProjects, partials) {
  const head = renderHead(
    partials.head,
    "Works — Dejan Tumenko, Creative Director",
    "Selected branding, art direction, and visual identity projects by Dejan Tumenko, Belgrade-based Creative Director.",
    "/work"
  );
  return partials.workListTemplate
    .replace("<!--CMS_HEAD-->", head)
    .replace("<!--CMS_NAV-->", partials.nav)
    .replace("<!--CMS_FOOTER-->", partials.footer)
    .replace("{{CARD_GRID}}", buildCardGrid(allProjects));
}

// Static pages are hand-authored Framer exports this script never touches, so
// their sitemap entries are declared here; project pages are appended from the
// same data that generates them, which is the whole point — a project added in
// /admin lands in the sitemap on the next Vercel build instead of being
// invisible to crawlers until someone remembers to edit sitemap.xml by hand.
const STATIC_PAGES = [
  { loc: "/", changefreq: "monthly", priority: "1.0" },
  { loc: "/work", changefreq: "monthly", priority: "0.9" },
  { loc: "/about", changefreq: "monthly", priority: "0.8" },
  { loc: "/contact", changefreq: "yearly", priority: "0.6" },
  { loc: "/privacy-policy", changefreq: "yearly", priority: "0.2" },
];

// Reuse the lastmod already published for a URL so untouched pages don't get a
// fresh date on every deploy — only genuinely new URLs get today's.
function existingLastmods() {
  const xml = readIfExists(SITEMAP_FILE);
  const map = new Map();
  const re = /<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g;
  let match;
  while ((match = re.exec(xml))) map.set(match[1], match[2]);
  return map;
}

function buildSitemap(allProjects) {
  const known = existingLastmods();
  const today = new Date().toISOString().slice(0, 10);

  const entries = [
    ...STATIC_PAGES,
    // `noindex: true` u frontmatteru drzi stranicu van sitemap-a i dodaje joj
    // meta robots noindex — za privremene/probne stranice na zivom sajtu.
    ...allProjects
      .filter((p) => !p.noindex)
      .map((p) => ({
        loc: `/work/${p.slug}`,
        changefreq: "yearly",
        priority: "0.7",
      })),
  ].map((entry) => {
    // The home page is the only URL published with a trailing slash.
    const loc = SITE_URL + (entry.loc === "/" ? "/" : entry.loc);
    return { ...entry, loc, lastmod: known.get(loc) || today };
  });

  const body = entries
    .map(
      (e) => `  <url>
    <loc>${escapeHtml(e.loc)}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

// Naslovna prikazuje izabrane radove iz Framer CMS kolekcije. Ta kolekcija ima
// fiksne stavke i novi projekti u nju ne mogu da udju — React posle hidracije
// prezida listu iz svojih propova. Zato se novi projekti upisuju ovde, a
// assets/home-projects.js ih posle hidracije doda kloniranjem postojece
// kartice, isto kao sto legacy-gallery.js radi sa slikama.
const HOME_FILE = path.join(ROOT, "index.html");
const HOME_BLOCK_ID = "cms-home-projects";
const HOME_SCRIPT = '<script src="/assets/home-projects.js" defer></script>';

function writeHomeProjects(projects) {
  if (!fs.existsSync(HOME_FILE)) return;

  const payload = projects.map((p) => ({
    title: p.title,
    year: String(p.year || ""),
    overview: p.overview || "",
    href: `/work/${p.slug}`,
    image: p.hero_image || (p.gallery && p.gallery[0] && p.gallery[0].src) || "",
  }));

  const block =
    `<script type="application/json" id="${HOME_BLOCK_ID}">` +
    JSON.stringify(payload).split("</script>").join("<\\/script>") +
    "</script>";

  let html = fs.readFileSync(HOME_FILE, "utf8");
  const before = html;

  const existing = new RegExp(
    `<script type="application/json" id="${HOME_BLOCK_ID}">[\\s\\S]*?</script>`
  );
  html = existing.test(html)
    ? html.replace(existing, block)
    : html.replace("</body>", block + "\n</body>");

  if (!html.includes("/assets/home-projects.js")) {
    html = html.replace("</body>", HOME_SCRIPT + "\n</body>");
  }

  if (html !== before) fs.writeFileSync(HOME_FILE, html, "utf8");
  console.log(`built  index.html (${payload.length} nov(ih) projekata za naslovnu)`);
}

function main() {
  const cmsProjects = loadProjects();
  const legacyProjects = loadLegacyProjects();
  const allProjects = [...legacyProjects, ...cmsProjects];
  // `noindex` znaci "nevidljiva stranica": van sitemap-a, van /work liste,
  // dostupna samo direktnim linkom. Stranica se svejedno generise.
  const listedProjects = allProjects.filter((p) => !p.noindex);

  const partials = {
    head: readIfExists(path.join(ROOT, "templates/_head.html")),
    nav: readIfExists(path.join(ROOT, "templates/_nav.html")),
    footer: readIfExists(path.join(ROOT, "templates/_footer.html")),
    workItemTemplate: readIfExists(path.join(ROOT, "templates/work-item.html")),
    workListTemplate: readIfExists(path.join(ROOT, "templates/work-list.html")),
  };

  for (const [name, value] of Object.entries(partials)) {
    if (!value) {
      console.error(`Missing templates/${name} — aborting.`);
      process.exit(1);
    }
  }

  for (const project of cmsProjects) {
    const outDir = path.join(ROOT, "work", project.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "index.html"), buildWorkItemPage(project, partials), "utf8");
    console.log(`built  work/${project.slug}/index.html`);
  }

  fs.writeFileSync(WORK_LIST_FILE, buildWorkListPage(listedProjects, partials), "utf8");
  console.log(
    `built  work/index.html (${listedProjects.length} kartica, ` +
      `${allProjects.length - listedProjects.length} nelistirano)`
  );

  // Framer je na naslovnu stavio samo cetiri izabrana rada. Sve ostalo — i
  // preostale originalne projekte i one dodate kroz /admin — dopunjuje
  // assets/home-projects.js, pa naslovna prati /work bez rucnog odrzavanja.
  const homeHtml = readIfExists(HOME_FILE);
  const alreadyOnHome = new Set(
    [...homeHtml.matchAll(/href="\.?\/?work\/([a-z0-9-]+)"/g)].map((m) => m[1])
  );
  writeHomeProjects(
    listedProjects.filter((p) => !p.noindex && !alreadyOnHome.has(p.slug))
  );

  const sitemap = buildSitemap(listedProjects);
  fs.writeFileSync(SITEMAP_FILE, sitemap, "utf8");
  console.log(`built  sitemap.xml (${(sitemap.match(/<loc>/g) || []).length} URLs)`);

  console.log(`\nDone.`);
}

main();
