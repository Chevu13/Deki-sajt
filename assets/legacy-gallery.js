/* Dodatne slike u galerijama originalnih 6 Framer stranica.
 *
 * Framer komponenta tih stranica ima tacno sedam imenovanih polja za sliku
 * (hero + sest u galeriji) — vidi __framer__handoverData u samoj stranici.
 * Sedmo polje ne postoji, pa se sedma slika ne moze dodati ni kroz HTML ni
 * kroz payload: React posle hidracije prezida galeriju iz svojih propova i
 * svaki dodat markup nestane.
 *
 * Zato se dodatne slike ubacuju POSLE hidracije, iz ovog skripta. Klonira se
 * postojeci slajd (da razmak, dimenzije i zaobljenja ostanu identicni) i u
 * njemu se zameni slika. Framer svoje slajdove pusta fade-in animacijom preko
 * Framer Motion-a; klon u toj animaciji ne ucestvuje, pa mu se skida pocetno
 * skriveno stanje i dodaje sopstveni fade preko IntersectionObserver-a.
 *
 * Spisak dodatnih slika pise CMS panel u <script id="cms-extra-media"> u samoj
 * stranici. Prazan spisak znaci da skript ne radi nista.
 */

(function () {
  "use strict";

  var DATA_ID = "cms-extra-media";
  var MARK = "data-cms-extra";

  function readConfig() {
    var node = document.getElementById(DATA_ID);
    if (!node) return null;
    try {
      var data = JSON.parse(node.textContent || "{}");
      var images = Array.isArray(data.images) ? data.images.filter(function (i) { return i && i.src; }) : [];
      var known = Array.isArray(data.gallery) ? data.gallery : [];
      return images.length ? { images: images, known: known } : null;
    } catch (err) {
      console.error("cms-extra-media: neispravan JSON", err);
      return null;
    }
  }

  // Kontejner galerije se ne trazi po Framer klasi — one se menjaju sa svakim
  // exportom. Trazi se najdublji element koji sadrzi sve poznate slike
  // galerije, sto ostaje tacno i posle novog exporta.
  function findTrack(known) {
    if (!known.length) return null;

    var nodes = known
      .map(function (match) {
        var img = document.querySelector('img[src*="' + match + '"]');
        return img;
      })
      .filter(Boolean);

    if (nodes.length < 2) return null;

    var candidate = nodes[0].parentElement;
    while (candidate && candidate !== document.body) {
      var holdsAll = nodes.every(function (node) {
        return candidate.contains(node);
      });
      if (holdsAll) break;
      candidate = candidate.parentElement;
    }
    if (!candidate || candidate === document.body) return null;

    // Slajd je ono dete kontejnera koje sadrzi poslednju poznatu sliku.
    var last = nodes[nodes.length - 1];
    var slide = last;
    while (slide && slide.parentElement !== candidate) slide = slide.parentElement;
    if (!slide) return null;

    return { track: candidate, slide: slide };
  }

  function buildSlide(template, image, index) {
    var node = template.cloneNode(true);
    node.setAttribute(MARK, String(index));

    node.querySelectorAll("img").forEach(function (img) {
      img.setAttribute("src", image.src);
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.setAttribute("alt", image.alt || "");
      img.setAttribute("loading", "lazy");
    });
    node.querySelectorAll("video, source").forEach(function (el) {
      el.remove();
    });

    // Framer ostavlja slajd sakriven dok ga njegova scroll animacija ne pusti;
    // klon nije deo te animacije, pa bi ostao nevidljiv zauvek.
    node.style.setProperty("opacity", "0");
    node.style.setProperty("transform", "translateY(20px)");
    node.style.setProperty("transition", "opacity .6s ease, transform .6s ease");
    node.style.setProperty("will-change", "opacity, transform");
    return node;
  }

  function reveal(node) {
    node.style.setProperty("opacity", "1");
    node.style.setProperty("transform", "none");
  }

  function apply(config) {
    var found = findTrack(config.known);
    if (!found) return false;

    // Provera je broj slajdova, ne "postoji li ijedan": ako React prezida
    // listu i pojede deo dodatih, ostatak se skida i ubacuju se svi ponovo.
    var existing = found.track.querySelectorAll("[" + MARK + "]");
    if (existing.length === config.images.length) return true;
    Array.prototype.forEach.call(existing, function (node) {
      node.remove();
    });

    // Framer svoje slajdove otkriva sopstvenom scroll matematikom sticky
    // sekcije, a ne prostim presecanjem sa viewport-om — na to se ne moze
    // zakaciti. IntersectionObserver se koristi samo da fade lepse ispadne kad
    // proradi; bezuslovni tajmer garantuje da slika nikad ne ostane nevidljiva.
    var observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (!entry.isIntersecting) return;
              reveal(entry.target);
              observer.unobserve(entry.target);
            });
          })
        : null;

    config.images.forEach(function (image, index) {
      var node = buildSlide(found.slide, image, index);
      found.track.appendChild(node);
      if (observer) observer.observe(node);
      setTimeout(function () {
        reveal(node);
        if (observer) observer.unobserve(node);
      }, 1500);
    });

    return true;
  }

  function start() {
    var config = readConfig();
    if (!config) return;

    // Hidracija nije trenutna, a React usput zameni ceo podrazumevani markup.
    // Pokusava se dok galerija ne bude u DOM-u, pa se onda jos prati da li je
    // React prezidao listu (npr. kad se promeni breakpoint) i vraca se dodato.
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (apply(config) || tries > 40) clearInterval(timer);
    }, 250);

    var pending = false;
    var watcher = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        apply(config);
      }, 200);
    });
    watcher.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
