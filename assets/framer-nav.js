/* Dve ispravke Framer runtime-a na exportovanim stranicama.
 *
 * 1. Klijentska navigacija — iskljucena.
 * 2. Naslov stranice — vracen na onaj iz HTML-a.
 *
 * Framer export nosi svoj router: klik na interni link se presretne i stranica
 * se iscrta na klijentu, iz podataka koje Framer nosi sa sobom. To je bilo u
 * redu dok je sadrzaj dolazio iskljucivo iz Framera.
 *
 * Sada nije: /work i /work/<slug> generise scripts/build.mjs, a sadrzaj
 * originalnih stranica menja CMS panel prepisom samih fajlova. Framer o tim
 * izmenama ne zna nista, pa bi soft-navigacija prikazala staro stanje — nov
 * projekat se ne bi video na /work, zamenjena slika bi ostala stara — sve dok
 * se stranica ne osvezi rucno.
 *
 * Zato se svaki interni link vodi kao obicno ucitavanje stranice. Gubi se
 * Framer-ov prelaz izmedju stranica; dobija se to da se uvek vidi ono sto je
 * stvarno na sajtu.
 */

(function () {
  "use strict";

  function isPlainLeftClick(event) {
    return (
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    );
  }

  function onClick(event) {
    if (!isPlainLeftClick(event)) return;

    var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!link) return;
    if (link.hasAttribute("download")) return;
    if (link.target && link.target !== "_self") return;

    var url;
    try {
      url = new URL(link.href, location.href);
    } catch (err) {
      return;
    }

    if (url.origin !== location.origin) return;
    // Sidro unutar iste stranice ostaje sidro.
    if (url.pathname === location.pathname && url.hash) return;

    // Capture faza + stopImmediatePropagation: Framer-ov rukovalac nikad ne
    // vidi ovaj klik.
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(url.href);
  }

  document.addEventListener("click", onClick, true);

  /* --------------------------------------------------------------- naslov */

  // Framer posle hidracije prepise <title> naslovom iz svojih podataka: na
  // /about je u HTML-u "About — Dejan Tumenko, Creative Director", a runtime ga
  // vrati na genericki "Tumenko — Creative Director". Google izvrsava JS, pa bi
  // indeksirao prepisani naslov i SEO naslovi ne bi znacili nista.
  //
  // Naslov iz HTML-a se zapamti pre nego sto runtime krene i vraca se kad god
  // ga nesto promeni.
  var wantedTitle = document.title;

  function keepTitle() {
    if (document.title !== wantedTitle) document.title = wantedTitle;
  }

  if (window.MutationObserver) {
    // Prati se ceo <head>: Framer ume i da zameni sam <title> element, ne samo
    // njegov tekst.
    new MutationObserver(keepTitle).observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  window.addEventListener("load", keepTitle);
})();
