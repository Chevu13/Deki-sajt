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
