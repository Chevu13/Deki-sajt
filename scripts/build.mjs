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

// Nav/footer partials are extracted from a depth-2 page (work/<slug>/).
// work/index.html lives one level shallower (depth 1), so its copies of
// the same nav/footer need their relative hrefs rewritten accordingly.
const DEPTH2_TO_DEPTH1 = {
  "../../": "../",
  "../": "./",
  "../../about": "../about",
  "../../contact": "../contact",
  "../../404": "../404",
  "../../privacy-policy": "../privacy-policy",
};

function toDepth1(html) {
  return html.replace(/href="([^"]+)"/g, (m, p1) =>
    Object.prototype.hasOwnProperty.call(DEPTH2_TO_DEPTH1, p1) ? `href="${DEPTH2_TO_DEPTH1[p1]}"` : m
  );
}

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

function loadLegacyProjects() {
  if (!fs.existsSync(LEGACY_FILE)) return [];
  return JSON.parse(fs.readFileSync(LEGACY_FILE, "utf8"));
}

function renderGalleryItems(gallery) {
  if (!Array.isArray(gallery) || gallery.length === 0) return "";
  return gallery
    .map((item) => {
      if (item.type === "video") {
        return `      <li class="cms-gallery__item"><video src="${escapeHtml(item.src)}" muted loop playsinline controls preload="metadata"></video></li>`;
      }
      return `      <li class="cms-gallery__item"><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt || "")}" loading="lazy"></li>`;
    })
    .join("\n");
}

function renderServices(services) {
  if (!services) return "";
  const list = Array.isArray(services) ? services : [services];
  return list.filter(Boolean).map(escapeHtml).join(", ");
}

function renderLiveLinkBlock(liveLink) {
  if (!liveLink) return "";
  return `    <div>
      <p class="cms-meta__label">Live Link</p>
      <p class="cms-meta__value"><a href="${escapeHtml(liveLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(liveLink)}</a></p>
    </div>
`;
}

function renderHead(headPartial, title, description) {
  return headPartial
    .replace(/\{\{TITLE\}\}/g, escapeHtml(title))
    .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(description || ""));
}

function buildWorkItemPage(project, partials) {
  const head = renderHead(partials.head, `${project.title} — Tumenko Portfolio`, project.overview);

  return partials.workItemTemplate
    .replace("<!--CMS_HEAD-->", head)
    .replace("<!--CMS_NAV-->", partials.nav)
    .replace("<!--CMS_FOOTER-->", partials.footer)
    .replace(/\{\{TITLE\}\}/g, escapeHtml(project.title))
    .replace("{{HERO_IMAGE}}", escapeHtml(project.hero_image || ""))
    .replace("{{GALLERY_ITEMS}}", renderGalleryItems(project.gallery))
    .replace("{{YEAR}}", escapeHtml(project.year || ""))
    .replace("{{OVERVIEW}}", escapeHtml(project.overview || ""))
    .replace("{{SERVICES}}", renderServices(project.services))
    .replace("{{LIVE_LINK_BLOCK}}", renderLiveLinkBlock(project.live_link))
    .replace("{{PROJECT_OVERVIEW}}", escapeHtml(project.project_overview || ""));
}

function buildCardGrid(projects) {
  const cards = projects
    .map(
      (p) => `      <a class="cms-card" href="./${escapeHtml(p.slug)}">
        <div class="cms-card__image"><img src="${escapeHtml(p.hero_image || (p.gallery && p.gallery[0] && p.gallery[0].src) || "")}" alt="${escapeHtml(p.title)}" loading="lazy"></div>
        <p class="cms-card__title">${escapeHtml(p.title)}</p>
        <p class="cms-card__year">${escapeHtml(p.year || "")}</p>
      </a>`
    )
    .join("\n");
  return `    <div class="cms-card-grid">\n${cards}\n    </div>`;
}

function buildWorkListPage(allProjects, partials) {
  const head = renderHead(
    partials.head,
    "Works — Tumenko Portfolio",
    "Selected branding, art direction, and visual identity projects."
  );
  const nav = toDepth1(partials.nav);
  const footer = toDepth1(partials.footer);

  return partials.workListTemplate
    .replace("<!--CMS_HEAD-->", head)
    .replace("<!--CMS_NAV-->", nav)
    .replace("<!--CMS_FOOTER-->", footer)
    .replace("{{CARD_GRID}}", buildCardGrid(allProjects));
}

function main() {
  const cmsProjects = loadProjects();
  const legacyProjects = loadLegacyProjects();
  const allProjects = [...legacyProjects, ...cmsProjects];

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

  fs.writeFileSync(WORK_LIST_FILE, buildWorkListPage(allProjects, partials), "utf8");
  console.log(`built  work/index.html (${legacyProjects.length} legacy + ${cmsProjects.length} CMS project(s))`);

  console.log(`\nDone.`);
}

main();
