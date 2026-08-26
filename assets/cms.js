// Vanilla JS for CMS-generated work pages. Intentionally independent of
// Framer's bundle (script_main.mjs) — these pages don't load it.
(function () {
  "use strict";

  // Mobile menu overlay
  var menuBtn = document.querySelector("[data-cms-menu-open]");
  var overlay = document.querySelector("[data-cms-menu-overlay]");
  var closeBtn = document.querySelector("[data-cms-menu-close]");
  if (menuBtn && overlay && closeBtn) {
    menuBtn.addEventListener("click", function () {
      overlay.classList.add("is-open");
    });
    closeBtn.addEventListener("click", function () {
      overlay.classList.remove("is-open");
    });
    overlay.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        overlay.classList.remove("is-open");
      });
    });
  }

  // Ulazne animacije: sve sa data-cms-reveal krece sakriveno (vidi cms.css) i
  // otkriva se kad udje u sliku. Na ovim stranicama nema Lenis smooth scrolla
  // koji na Framer stranicama razbija IntersectionObserver, pa je observer
  // ovde pouzdan.
  var reveal = document.querySelectorAll("[data-cms-reveal]");
  if (reveal.length) {
    var show = function (node) {
      node.classList.add("is-in");
    };

    if (typeof IntersectionObserver === "function") {
      var seen = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            show(entry.target);
            seen.unobserve(entry.target);
          });
        },
        // Krece malo pre nego sto element stigne do ivice, da animacija ne
        // pocinje tek kad je vec pola u slici.
        { rootMargin: "0px 0px -12% 0px", threshold: 0.01 }
      );
      reveal.forEach(function (node) {
        seen.observe(node);
      });
    } else {
      reveal.forEach(show);
    }

    // Osigurac: sadrzaj ne sme da ostane nevidljiv ako observer zakaze. Otkriva
    // se samo ono sto je tada stvarno u slici — kad bi se otkrilo sve, ostatak
    // stranice bi izgubio animaciju pri skrolu.
    setTimeout(function () {
      reveal.forEach(function (node) {
        if (node.classList.contains("is-in")) return;
        var rect = node.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) show(node);
      });
    }, 3000);
  }

  // Gallery prev/next buttons (scroll-snap does the rest natively)
  var track = document.querySelector("[data-cms-gallery-track]");
  var prevBtn = document.querySelector("[data-cms-gallery-prev]");
  var nextBtn = document.querySelector("[data-cms-gallery-next]");
  if (track && prevBtn && nextBtn) {
    var scrollByOne = function (dir) {
      var item = track.querySelector("li");
      var step = item ? item.getBoundingClientRect().width + 10 : track.clientWidth;
      track.scrollBy({ left: dir * step, behavior: "smooth" });
    };
    prevBtn.addEventListener("click", function () {
      scrollByOne(-1);
    });
    nextBtn.addEventListener("click", function () {
      scrollByOne(1);
    });
  }

})();
