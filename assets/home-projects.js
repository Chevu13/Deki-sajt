/* Novi projekti u sekciji izabranih radova na naslovnoj.
 *
 * Ta sekcija se renderuje iz Framer CMS kolekcije, koja ima fiksne stavke —
 * projekti dodati kroz /admin u nju ne mogu da udju. Ubacivanje markupa u HTML
 * ne pomaze: React posle hidracije prezida listu iz svojih propova i sve dodato
 * nestane (isto vazi i za galerije, vidi assets/legacy-gallery.js).
 *
 * Zato se kartice dodaju POSLE hidracije, kloniranjem postojece — tako naslovna
 * i novi projekti izgledaju identicno, bez ijedne linije Framer CSS-a ovde.
 *
 * Spisak upisuje scripts/build.mjs u <script id="cms-home-projects"> pri svakom
 * build-u, pa je uvek u skladu sa content/work/*.md.
 */

(function () {
  "use strict";

  var DATA_ID = "cms-home-projects";
  var MARK = "data-cms-home";

  function readProjects() {
    var node = document.getElementById(DATA_ID);
    if (!node) return [];
    try {
      var list = JSON.parse(node.textContent || "[]");
      return Array.isArray(list) ? list.filter(function (p) { return p && p.href; }) : [];
    } catch (err) {
      console.error(DATA_ID + ": neispravan JSON", err);
      return [];
    }
  }

  // Kartice se prepoznaju po linku ka projektu. "View All" vodi na /work bez
  // kose crte, pa ne upada u izbor.
  function findCards() {
    return Array.prototype.filter.call(
      document.querySelectorAll('a[href*="/work/"]'),
      function (link) {
        return !link.hasAttribute(MARK) && link.querySelector("img");
      }
    );
  }

  function findGrid(cards) {
    if (cards.length < 2) return null;

    // Mreza je najblizi predak koji drzi bar dve kartice; svaka kartica je
    // njegovo neposredno dete (ili potomak jednog deteta).
    var node = cards[0].parentElement;
    while (node && node !== document.body) {
      var inside = cards.filter(function (card) {
        return node.contains(card);
      });
      if (inside.length >= 2) break;
      node = node.parentElement;
    }
    if (!node || node === document.body) return null;

    var slot = cards[cards.length - 1];
    while (slot && slot.parentElement !== node) slot = slot.parentElement;
    return slot ? { grid: node, slot: slot } : null;
  }

  function setText(node, value) {
    if (node) node.textContent = value;
  }

  function buildCard(template, project, index) {
    var card = template.cloneNode(true);
    card.setAttribute(MARK, String(index));

    var link = card.matches && card.matches("a[href]") ? card : card.querySelector("a[href]");
    if (link) link.setAttribute("href", project.href);

    card.querySelectorAll("img").forEach(function (img) {
      if (!project.image) return;
      img.setAttribute("src", project.image);
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.setAttribute("alt", project.title || "");
      img.setAttribute("loading", "lazy");
    });

    // Redosled teksta u kartici je: naslov (h3), godina, kratak opis.
    setText(card.querySelector("h1, h2, h3, h4"), project.title || "");
    var paragraphs = card.querySelectorAll("p");
    if (paragraphs[0]) setText(paragraphs[0], project.year || "");
    if (paragraphs[1]) setText(paragraphs[1], project.overview || "");

    // Framer drzi svoje kartice sakrivene dok ih scroll animacija ne pusti;
    // klon nije deo te animacije pa bi ostao nevidljiv.
    card.style.setProperty("opacity", "1");
    card.style.setProperty("transform", "none");
    return card;
  }

  function apply(projects) {
    var cards = findCards();
    if (!cards.length) return false;

    var found = findGrid(cards);
    if (!found) return false;

    var existing = found.grid.querySelectorAll("[" + MARK + "]");
    if (existing.length === projects.length) return true;
    Array.prototype.forEach.call(existing, function (node) {
      node.remove();
    });

    projects.forEach(function (project, index) {
      found.grid.appendChild(buildCard(found.slot, project, index));
    });
    return true;
  }

  function start() {
    var projects = readProjects();
    if (!projects.length) return;

    var tries = 0;
    var timer = setInterval(function () {
      apply(projects);
      if (++tries > 40) clearInterval(timer);
    }, 250);

    var pending = false;
    function schedule() {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        apply(projects);
      }, 200);
    }

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
