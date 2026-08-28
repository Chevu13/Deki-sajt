/* Slike na naslovnoj i About stranici — da ih Framer ne secka.
 *
 * Framer svaku takvu fotografiju stavlja u okvir zadate visine, uveca je
 * (`scale(1.2)` na heroju, `scale(1.4)` na About-u), pomera uz skrol i secka sa
 * `object-fit: cover`. Dok su slike birane uz taj okvir to je izgledalo
 * namerno; cim se kroz panel ubaci fotografija drugog odnosa stranica, secenje
 * pojede ono sto je vazno — glavu, dno, sta zatekne.
 *
 * Uvecanje i pomeranje se sklanjaju svuda: ona su cist gubitak kadra. Sa
 * `scale(1.4)` se vidi jedva 70% okvira, i to pomereno gore-dole uz skrol.
 *
 * Dalje se ta dva mesta razlikuju:
 *
 *   About  — slike stoje u mrezi cije su visine deo dizajna. Fotografija se
 *            uklapa unutra CELA (`contain`), sa pozadinom sajta oko sebe. To je
 *            tacno ono sto je trazeno: nista se ne secka, ni na telefonu ni na
 *            4K ekranu.
 *
 *   Hero   — preko njega stoji naslov, apsolutno pozicioniran u odnosu na okvir
 *            visok ceo ekran. Probano: ako se okviru pusti visina da prati odnos
 *            fotografije, na telefonu ispadne traka od ~190px i tekst se prelije
 *            van nje. Ako se fotografija uklopi cela u tako visok okvir, ostane
 *            pola ekrana prazno. Zato hero zadrzava `cover` — ali bez uvecanja i
 *            pomeranja, pa se vidi najveci i centriran isecak koji okvir
 *            dopusta.
 *
 * Framer inline stil prepisuje na svakom kadru, pa pravila moraju da idu kroz
 * stylesheet sa `!important`: samo tako nadjacaju inline vrednost koju on stalno
 * vraca.
 */

(function () {
  "use strict";

  var STYLE_ID = "cms-media-style";
  var CSS =
    "[data-cms-media]{transform:none!important}" +
    '[data-cms-media="fit"] img{object-fit:contain!important;' +
    // assets/lqip.css stavlja zamucenu sitnu verziju slike kao background
    // SAME slike. Uz `cover` se ne vidi, ali uz `contain` bi ispunila trake sa
    // strane — a to je pikselizovan razmaz. Trake ostaju u boji stranice.
    "object-position:center center!important;background-image:none!important}";

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
      if (!box || box.hasAttribute("data-cms-media")) return;
      box.setAttribute("data-cms-media", img.closest("header") ? "frame" : "fit");
    });
  }

  function start() {
    apply();

    // Framer posle hidracije zna da prezida deo stranice; tada se oznake gube,
    // pa se postavljaju ponovo. Ista provera hvata i sliku zamenjenu iz panela.
    if (window.MutationObserver) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          apply();
        });
      }).observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener("load", apply);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
