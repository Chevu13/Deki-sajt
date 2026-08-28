/* Slike na naslovnoj i About stranici — da ih Framer ne secka bez potrebe.
 *
 * Framer svaku od tih fotografija stavlja u okvir zadate visine, secka je sa
 * `object-fit: cover` i uz to je JOS uveca — `scale(1.2)` na heroju,
 * `scale(1.4)` na About-u — pa je pomera gore-dole uz skrol.
 *
 * To uvecanje je cist gubitak kadra: sa `scale(1.4)` se od okvira vidi jedva
 * 70%, i to pomereno. Dok su slike birane uz taj okvir izgledalo je namerno;
 * prva fotografija drugog odnosa stranica ubacena kroz panel ostala je bez
 * glave i bez dna.
 *
 * Ovde se sklanja samo to — uvecanje i pomeranje. Slika ostaje `cover`, dakle
 * od ivice do ivice okvira, i centrirana, kako je i bila. Time se vidi najveci
 * moguci isecak koji okvir dopusta, na svakoj sirini ekrana.
 *
 * Probano pa odbaceno:
 *   - `contain` (cela slika u okviru): na velikom monitoru ostaju siroke prazne
 *     trake sa strane, jer okvir postaje mnogo siri od fotografije.
 *   - visina okvira da prati odnos fotografije: na heroju naslov stoji apsolutno
 *     u odnosu na okvir visok ceo ekran, pa se na telefonu prelije van njega.
 *   - kadar zakacen za vrh: spasava glavu na jednoj slici, ali drugoj (grad na
 *     obali, motiv u donjoj polovini) ostavi samo nebo.
 *
 * Framer inline stil prepisuje na svakom kadru, pa pravilo mora da ide kroz
 * stylesheet sa `!important`: samo tako nadjacava inline vrednost koju on stalno
 * vraca.
 */

(function () {
  "use strict";

  var STYLE_ID = "cms-media-style";
  var CSS = "[data-cms-media]{transform:none!important}";

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // Okvir slike je roditelj Framer-ovog omotaca pozadinske slike — on nosi
  // zadatu visinu, uvecanje i pomeraj.
  function boxFor(img) {
    var wrapper = img.parentElement;
    if (!wrapper || !wrapper.hasAttribute("data-framer-background-image-wrapper")) return null;
    return wrapper.parentElement;
  }

  // Uzimaju se samo fotografije koje Framer secka (`cover`) i koje nisu deo
  // kartice projekta — kartice su linkovi i njihovo kadriranje je u redu.
  // Potpis i ostale grafike su vec `contain`, pa ispadaju same.
  function candidates() {
    return Array.prototype.filter.call(document.querySelectorAll("img"), function (img) {
      if (!boxFor(img)) return false;
      if (img.closest("a")) return false;
      return getComputedStyle(img).objectFit === "cover";
    });
  }

  function apply() {
    ensureStyle();

    candidates().forEach(function (img) {
      var box = boxFor(img);
      if (box && !box.hasAttribute("data-cms-media")) box.setAttribute("data-cms-media", "");
    });
  }

  function start() {
    apply();

    if (window.MutationObserver) {
      // Namerno tajmer, ne requestAnimationFrame: Framer na sirokim ekranima
      // menja varijantu sekcije, pa oznake odu sa starim cvorovima i moraju
      // nazad — a rAF ume da bude uspavan dok se kartica ne iscrtava.
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        setTimeout(function () {
          pending = false;
          apply();
        }, 60);
      }).observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener("load", apply);
    window.addEventListener("resize", apply);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
