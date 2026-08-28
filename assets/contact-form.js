/* Kontakt forma na /contact — salje na api/contact.js.
 *
 * Framer export nosi formu bez `action`: u originalu ju je primao Framer-ov
 * hosting, koji van Framera ne postoji, pa je dugme "posalji" bilo mrtvo.
 *
 * Polja se prepoznaju po `placeholder`-u, ne po `name`: Framer je u export
 * izvezao pokvarene atribute — i prezime, i imejl, i telefon nose
 * `name="Last Name"`. Placeholder je jedino sto ih razlikuje.
 *
 * Slusa se `submit` u capture fazi i odmah se zaustavlja dalje: tako Framer-ov
 * rukovalac ne vidi dogadjaj i ne pokusava svoje slanje.
 */

(function () {
  "use strict";

  var ENDPOINT = "/api/contact";

  // Nevidljiva polja koja popuni samo bot — Framer ih vec ima u formi.
  var HONEYPOTS = [
    "website",
    "company",
    "subject",
    "title",
    "description",
    "feedback",
    "notes",
    "details",
    "remarks",
    "comments",
  ];

  function fieldBy(form, test) {
    return Array.prototype.filter.call(form.querySelectorAll("input, textarea"), test)[0] || null;
  }

  function byPlaceholder(form, text) {
    return fieldBy(form, function (node) {
      return (node.getAttribute("placeholder") || "").toLowerCase().indexOf(text) !== -1;
    });
  }

  function byType(form, type) {
    return fieldBy(form, function (node) {
      return node.getAttribute("type") === type;
    });
  }

  // Kontakt forma je ona koja trazi poruku; formu za newsletter u podnozju
  // (samo imejl) ovaj skript ne dira.
  function contactForm() {
    return Array.prototype.filter.call(document.querySelectorAll("form"), function (form) {
      return !!byPlaceholder(form, "message");
    })[0] || null;
  }

  function status(form) {
    var node = form.querySelector("[data-cms-form-status]");
    if (node) return node;

    node = document.createElement("p");
    node.setAttribute("data-cms-form-status", "");
    node.setAttribute("role", "status");
    node.style.cssText =
      "margin:16px 0 0;font-family:'PT Mono',monospace;font-size:13px;" +
      "line-height:1.4;text-transform:uppercase;color:rgb(238,238,238)";
    form.appendChild(node);
    return node;
  }

  function say(form, text, tone) {
    var node = status(form);
    node.textContent = text;
    node.style.color = tone === "error" ? "rgb(255,138,128)" : "rgb(238,238,238)";
  }

  function values(form) {
    var read = function (node) {
      return node ? node.value : "";
    };
    var payload = {
      firstName: read(byPlaceholder(form, "jane")),
      lastName: read(byPlaceholder(form, "smith")),
      email: read(byType(form, "email") || byPlaceholder(form, "email")),
      phone: read(byType(form, "tel") || byPlaceholder(form, "phone")),
      message: read(byPlaceholder(form, "message")),
    };
    HONEYPOTS.forEach(function (name) {
      var node = form.querySelector('input[name="' + name + '"]');
      if (node) payload[name] = node.value;
    });
    return payload;
  }

  function submitButton(form) {
    return form.querySelector('button[type="submit"], button:not([type])');
  }

  function bind(form) {
    if (form.hasAttribute("data-cms-form")) return;
    form.setAttribute("data-cms-form", "");

    form.addEventListener(
      "submit",
      function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        var payload = values(form);
        if (!payload.email) {
          say(form, "Unesite imejl adresu.", "error");
          return;
        }

        var button = submitButton(form);
        if (button) button.disabled = true;
        say(form, "Slanje…");

        fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then(function (response) {
            return response.json().then(function (data) {
              return { ok: response.ok, data: data };
            });
          })
          .then(function (result) {
            if (!result.ok) throw new Error((result.data && result.data.error) || "Greska");
            form.reset();
            say(form, "Hvala — poruka je poslata.");
          })
          .catch(function (err) {
            say(form, err.message || "Poruka nije poslata. Pokusajte ponovo.", "error");
          })
          .then(function () {
            if (button) button.disabled = false;
          });
      },
      true
    );
  }

  function start() {
    var form = contactForm();
    if (form) bind(form);

    // Framer formu montira posle hidracije, pa se ceka da se pojavi.
    if (window.MutationObserver) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        setTimeout(function () {
          pending = false;
          var found = contactForm();
          if (found) bind(found);
        }, 60);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
