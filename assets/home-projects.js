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

  // Sloj sa slikom u kartici: Framer mu inline upisuje transform (uvecanje 1.4
  // i pomeraj koji prati skrol) i opacity. Trazi se preko inline transform-a, ne
  // preko Framer klase — klasa se menja pri svakom novom export-u.
  function mediaLayer(root) {
    var img = Array.prototype.filter
      .call(root.querySelectorAll("img"), function (node) {
        return !/\.svg($|\?)/i.test(node.getAttribute("src") || "");
      })[0];
    if (!img) return null;

    var node = img.parentElement;
    while (node && node !== root) {
      if ((node.getAttribute("style") || "").indexOf("transform") !== -1) return node;
      node = node.parentElement;
    }
    return null;
  }

  // Framer taj transform prepisuje na svakom kadru skrola, ali samo svojim
  // karticama — klon u njegovoj animaciji ne ucestvuje, pa bi ostao zamrznut na
  // pocetnoj vrednosti i kadrirao sliku drugacije od ostalih. Zato se vrednost
  // prepisuje sa originala; nema smisla pogadjati formulu kad se moze citati
  // gotov rezultat.
  var watched = null;

  function syncMedia(source, layers) {
    var apply = function () {
      layers.forEach(function (layer) {
        layer.style.transform = source.style.transform;
      });
    };
    apply();
    if (watched) watched.disconnect();
    watched = new MutationObserver(apply);
    watched.observe(source, { attributes: true, attributeFilter: ["style"] });
  }

  // Na hover Framer sliku potamni sa .7225 na .51. To radi njegov React, pa na
  // klonu mora rucno.
  var HOVER_OPACITY = "0.51";

  function bindHover(card, layer) {
    // Slusa se <a>, ne spoljni omotac: omotac je `display: contents`, nema svoj
    // okvir, pa na njemu nema ni prelaza misa.
    var target = card.matches && card.matches("a[href]") ? card : card.querySelector("a[href]");
    if (!target) return;

    var base = getComputedStyle(layer).opacity;
    layer.style.setProperty("transition", "opacity .2s ease");
    target.addEventListener("mouseenter", function () {
      layer.style.setProperty("opacity", HOVER_OPACITY);
    });
    target.addEventListener("mouseleave", function () {
      layer.style.setProperty("opacity", base);
    });
  }

  function buildCard(template, project, index) {
    var card = template.cloneNode(true);
    card.setAttribute(MARK, String(index));

    var link = card.matches && card.matches("a[href]") ? card : card.querySelector("a[href]");
    if (link) link.setAttribute("href", project.href);

    // U kartici su dve slike: mala ikonica (strelica, .svg) i velika slika
    // projekta. Menja se samo ova druga.
    card.querySelectorAll("img").forEach(function (img) {
      if (!project.image) return;
      if (/\.svg($|\?)/i.test(img.getAttribute("src") || "")) return;

      img.setAttribute("src", project.image);
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.setAttribute("alt", project.title || "");
      // Originalne slike ucitava Framer svojom logikom; klon u njoj ne
      // ucestvuje, pa bi uz `lazy` ostao prazan — kartica se nalazi u dugackoj
      // sticky sekciji gde se browserov okidac ne aktivira.
      img.setAttribute("loading", "eager");
      img.removeAttribute("decoding");
    });

    card.querySelectorAll("h1, h2, h3, h4").forEach(function (heading) {
      setText(heading, project.title || "");
    });

    // Framer renderuje desktop i mobilnu varijantu, pa godina stoji dva puta:
    // redosled pasusa je naslov, godina, godina, opis. Zato se ne gadja po
    // indeksu nego po sadrzaju — najduzi pasus je opis, svi ostali su godina.
    var paragraphs = Array.prototype.slice.call(card.querySelectorAll("p"));
    var longest = "";
    paragraphs.forEach(function (p) {
      var text = (p.textContent || "").trim();
      if (text.length > longest.length) longest = text;
    });

    paragraphs.forEach(function (p) {
      var text = (p.textContent || "").trim();
      setText(p, text === longest ? project.overview || "" : project.year || "");
    });

    return card;
  }

  // Framer drzi kartice sakrivene (opacity 0 + pomeraj) dok ih njegova scroll
  // animacija ne pusti. Klon u toj animaciji ne ucestvuje, pa bi ostao nevidljiv
  // zauvek. Stanje ne stoji na spoljnem omotacu — on je `display: contents` i na
  // njemu stil nema efekta — nego na kontejneru unutra.
  //
  // Nadje se taj cvor i preuzme se animacija: isti fade uz pomeraj, samo vodjen
  // IntersectionObserver-om umesto Framer-om.
  function hiddenNodes(root) {
    return [root]
      .concat(Array.prototype.slice.call(root.querySelectorAll("*")))
      .filter(function (node) {
        return getComputedStyle(node).opacity === "0";
      });
  }

  function prime(root) {
    var nodes = hiddenNodes(root);
    nodes.forEach(function (node) {
      node.style.setProperty("transition", "opacity .7s ease, transform .7s ease");
      node.style.setProperty("will-change", "opacity, transform");
    });
    return nodes;
  }

  function reveal(nodes) {
    nodes.forEach(function (node) {
      node.style.setProperty("opacity", "1");
      node.style.setProperty("transform", "none");
    });
  }

  // Okidac je provera polozaja pri skrolu, ne IntersectionObserver: stranica
  // koristi Lenis smooth scroll, uz koji IO na ovim karticama ne okida
  // pouzdano. getBoundingClientRect se racuna u trenutku poziva, pa radi bez
  // obzira na to kako se skroluje.
  function animateIn(card) {
    var nodes = prime(card);
    if (!nodes.length) return;

    // Spoljni omotac je `display: contents` i nema svoj okvir — meri se
    // kontejner koji stvarno zauzima prostor.
    var measured = nodes[0];

    function uSlici() {
      var rect = measured.getBoundingClientRect();
      return rect.top < window.innerHeight * 0.88 && rect.bottom > 0;
    }

    // Provera na svakom frejmu umesto na `scroll` dogadjaj — stranica koristi
    // Lenis smooth scroll, pa se ne oslanjamo na to kako on skroluje.
    //
    // Uslov nije samo "u slici" nego "usla u sliku": odmah po ubacivanju
    // sekcija jos nema punu visinu i sve kartice izgledaju kao da su pri vrhu,
    // pa bi se animacija odigrala van ekrana. Ceka se da kartica bar jednom
    // bude ispod ivice, sto se desi cim raspored slegne.
    //
    // Posle 12s se otkriva bezuslovno — kartica ne sme da ostane nevidljiva ako
    // okidac nikad ne odradi svoje.
    var pocetak = performance.now();
    var bilaVanEkrana = false;

    function tick(sada) {
      var uSlicu = uSlici();
      if (!uSlicu) bilaVanEkrana = true;

      if (sada - pocetak > 12000 || (bilaVanEkrana && uSlicu)) {
        reveal(nodes);
        return;
      }
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function apply(projects) {
    var cards = findCards();
    if (!cards.length) return false;

    var found = findGrid(cards);
    if (!found) return false;

    var existing = found.grid.querySelectorAll("[" + MARK + "]");
    if (existing.length === projects.length) {
      return true;
    }
    Array.prototype.forEach.call(existing, function (node) {
      node.remove();
    });

    var layers = [];
    projects.forEach(function (project, index) {
      var card = buildCard(found.slot, project, index);
      found.grid.appendChild(card);
      // Tek u dokumentu se moze procitati koji cvor nosi skriveno stanje.
      animateIn(card);

      var layer = mediaLayer(card);
      if (layer) {
        layers.push(layer);
        bindHover(card, layer);
      }
    });

    var source = mediaLayer(found.slot);
    if (source && layers.length) syncMedia(source, layers);
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
