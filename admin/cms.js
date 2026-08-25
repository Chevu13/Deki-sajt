/* Framer-style CMS panel for the Tumenko portfolio.
 *
 * Same job Decap CMS did (edit content/work/*.md, commit to GitHub, let
 * Vercel rebuild), but with Framer's CMS UI instead of Decap's: a collection
 * sidebar, a spreadsheet-style item table, and a field-per-row item editor.
 *
 * Data model — one normalized item shape covers two very different sources:
 *
 *   kind "cms"     content/work/<file>.md   fully editable; scripts/build.mjs
 *                                           generates work/<slug>/index.html
 *   kind "legacy"  content/legacy-work.json the 6 original Framer-authored
 *                                           pages. Their HTML is a static
 *                                           Framer export that this panel must
 *                                           never touch, so only the fields
 *                                           that feed the /work list card
 *                                           (title, year, overview, thumb) are
 *                                           editable.
 *
 * Auth is the same GitHub OAuth popup handshake Decap used (api/auth.js +
 * api/callback.js), so no server-side change was needed.
 */

(function () {
  "use strict";

  var CFG = window.CMS_CONFIG || {};
  var DEMO = !!CFG.demo;
  var TOKEN_KEY = "tumenko-cms-token";

  /* ------------------------------------------------------------ helpers */

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "html") node.innerHTML = value;
        else if (key === "text") node.textContent = value;
        else if (key === "style") node.setAttribute("style", value);
        else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2), value);
        else if (key in node && key !== "list" && key !== "type") node[key] = value;
        else node.setAttribute(key, value);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function svg(paths, size) {
    return (
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="' + (size || 1.7) + '" stroke-linecap="round" stroke-linejoin="round">' +
      paths +
      "</svg>"
    );
  }

  var ICONS = {
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    sort: svg('<path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/>'),
    filter: svg('<path d="M4 6h16M7 12h10M10 18h4"/>'),
    dots: svg('<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>'),
    grip: svg('<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>'),
    database: svg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'),
    chevronDown: svg('<path d="m6 9 6 6 6-6"/>', 2),
    close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.7 5.7 3.7 9S14.5 18.3 12 21c-2.5-2.7-3.7-5.7-3.7-9S9.5 5.7 12 3Z"/>'),
    branch: svg('<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7v10M18 11c0 3-4 3-6 4"/>'),
    play: svg('<path d="M8 5.5v13l10-6.5-10-6.5Z"/>'),
    trash: svg('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>'),
    external: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    logout: svg('<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 16l4-4-4-4M20 12H10"/>'),
  };

  var LOGO =
    '<svg class="logo" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M5 2h14v7h-7l7 7v6l-7-7v7H5v-7h7L5 8V2Z"/></svg>';

  function toast(message, isError) {
    var host = document.querySelector(".toasts");
    if (!host) {
      host = el("div", { class: "toasts" });
      document.body.appendChild(host);
    }
    var node = el("div", { class: "toast" + (isError ? " toast--error" : ""), text: message });
    host.appendChild(node);
    setTimeout(function () {
      node.remove();
    }, isError ? 8000 : 3500);
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function b64encode(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function b64decode(b64) {
    var binary = atob(String(b64).replace(/\s/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  var FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

  function parseMarkdown(text) {
    var match = FRONTMATTER.exec(text);
    if (!match) return { data: {}, body: text };
    var data = {};
    try {
      data = window.jsyaml.load(match[1]) || {};
    } catch (err) {
      console.error("Bad frontmatter", err);
    }
    return { data: data, body: match[2] };
  }

  function stringifyMarkdown(data, body) {
    var yaml = window.jsyaml.dump(data, { lineWidth: -1, noRefs: true });
    return "---\n" + yaml + "---\n\n" + String(body || "").trim() + "\n";
  }

  /* -------------------------------------------------------------- stores */

  // Both stores expose the same four methods; everything above this line is
  // storage-agnostic so the demo panel can run the identical UI offline.

  function GitHubStore(token) {
    this.token = token;
    this.legacySha = null;
  }

  GitHubStore.prototype.api = function (path, options) {
    var opts = options || {};
    var headers = {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + this.token,
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (opts.body) headers["Content-Type"] = "application/json";
    return fetch("https://api.github.com" + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (res.status === 404) return null;
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        throw new Error("GitHub prijava je istekla — uloguj se ponovo.");
      }
      return res.json().then(function (json) {
        if (!res.ok) {
          throw new Error((json && json.message) || "GitHub API " + res.status);
        }
        return json;
      });
    });
  };

  GitHubStore.prototype.contentsUrl = function (path) {
    return (
      "/repos/" + CFG.repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/")
    );
  };

  GitHubStore.prototype.user = function () {
    return this.api("/user");
  };

  GitHubStore.prototype.load = function () {
    var self = this;
    var listUrl = this.contentsUrl(CFG.contentDir) + "?ref=" + encodeURIComponent(CFG.branch);

    var cms = this.api(listUrl).then(function (entries) {
      var files = (entries || []).filter(function (entry) {
        return entry.type === "file" && /\.md$/i.test(entry.name);
      });
      return Promise.all(
        files.map(function (entry) {
          return self
            .api(self.contentsUrl(entry.path) + "?ref=" + encodeURIComponent(CFG.branch))
            .then(function (file) {
              var parsed = parseMarkdown(b64decode(file.content));
              return fromMarkdown(parsed, entry.path, file.sha);
            });
        })
      );
    });

    var legacy = this.api(
      this.contentsUrl(CFG.legacyFile) + "?ref=" + encodeURIComponent(CFG.branch)
    ).then(function (file) {
      if (!file) return [];
      self.legacySha = file.sha;
      var rows = JSON.parse(b64decode(file.content));
      return rows.map(fromLegacy);
    });

    return Promise.all([legacy, cms]).then(function (groups) {
      return groups[0].concat(groups[1]);
    });
  };

  GitHubStore.prototype.saveItem = function (item, allItems) {
    var self = this;
    if (item.kind === "legacy") {
      var rows = allItems
        .filter(function (row) {
          return row.kind === "legacy";
        })
        .map(toLegacy);
      return this.api(this.contentsUrl(CFG.legacyFile), {
        method: "PUT",
        body: {
          message: "CMS: izmena kartice " + item.title,
          branch: CFG.branch,
          sha: this.legacySha,
          content: b64encode(JSON.stringify(rows, null, 2) + "\n"),
        },
      }).then(function (res) {
        self.legacySha = res.content.sha;
        return item;
      });
    }

    var path = item.file || CFG.contentDir + "/" + (item.slug || slugify(item.title)) + ".md";
    var payload = toMarkdown(item);
    return this.api(this.contentsUrl(path), {
      method: "PUT",
      body: {
        message: (item.sha ? "CMS: izmena projekta " : "CMS: novi projekat ") + item.title,
        branch: CFG.branch,
        sha: item.sha || undefined,
        content: b64encode(payload),
      },
    }).then(function (res) {
      item.file = path;
      item.sha = res.content.sha;
      return item;
    });
  };

  GitHubStore.prototype.deleteItem = function (item) {
    if (item.kind === "legacy" || !item.sha) return Promise.resolve();
    return this.api(this.contentsUrl(item.file), {
      method: "DELETE",
      body: {
        message: "CMS: brisanje projekta " + item.title,
        branch: CFG.branch,
        sha: item.sha,
      },
    });
  };

  GitHubStore.prototype.upload = function (file) {
    var self = this;
    var name =
      Date.now().toString(36) +
      "-" +
      slugify(file.name.replace(/\.[^.]+$/, "")) +
      "." +
      (file.name.split(".").pop() || "bin").toLowerCase();
    var path = CFG.mediaFolder + "/" + name;

    return readAsBase64(file).then(function (content) {
      return self
        .api(self.contentsUrl(path), {
          method: "PUT",
          body: {
            message: "CMS: upload " + name,
            branch: CFG.branch,
            content: content,
          },
        })
        .then(function () {
          return CFG.publicFolder + "/" + name;
        });
    });
  };

  function DemoStore() {
    this.items = (CFG.seed || []).map(function (row, index) {
      var copy = JSON.parse(JSON.stringify(row));
      copy.key = copy.kind + ":" + (copy.slug || index);
      return copy;
    });
  }

  DemoStore.prototype.user = function () {
    return Promise.resolve({ login: "demo", avatar_url: "" });
  };

  DemoStore.prototype.load = function () {
    return Promise.resolve(this.items.slice());
  };

  DemoStore.prototype.saveItem = function (item) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(item);
      }, 350);
    });
  };

  DemoStore.prototype.deleteItem = function () {
    return Promise.resolve();
  };

  DemoStore.prototype.upload = function (file) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.readAsDataURL(file);
    });
  };

  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("Ne mogu da procitam fajl."));
      };
      reader.onload = function () {
        resolve(String(reader.result).split(",")[1]);
      };
      reader.readAsDataURL(file);
    });
  }

  /* --------------------------------------------------------- item mapping */

  function fromMarkdown(parsed, path, sha) {
    var data = parsed.data || {};
    var services = data.services;
    if (!Array.isArray(services)) services = services ? [services] : [];
    return {
      key: "cms:" + path,
      kind: "cms",
      file: path,
      sha: sha,
      title: data.title || "",
      slug: data.slug || path.split("/").pop().replace(/\.md$/, ""),
      status: data.status === "Draft" ? "Draft" : "Live",
      year: data.year === 0 || data.year ? String(data.year) : "",
      overview: data.overview || "",
      projectOverview: data.project_overview || parsed.body.trim(),
      liveLink: data.live_link || "",
      heroImage: data.hero_image || "",
      services: services.map(String),
      gallery: (Array.isArray(data.gallery) ? data.gallery : []).map(function (row) {
        return {
          type: row && row.type === "video" ? "video" : "image",
          src: (row && row.src) || "",
          alt: (row && row.alt) || "",
        };
      }),
    };
  }

  function toMarkdown(item) {
    var data = {
      title: item.title,
      slug: item.slug,
      status: item.status,
      year: item.year === "" ? null : Number(item.year),
      services: item.services.filter(Boolean),
      overview: item.overview,
      live_link: item.liveLink || "",
      hero_image: item.heroImage || "",
      gallery: item.gallery.filter(function (row) {
        return row.src;
      }),
    };
    if (data.year === null || isNaN(data.year)) delete data.year;
    return stringifyMarkdown(data, item.projectOverview);
  }

  function fromLegacy(row) {
    return {
      key: "legacy:" + row.slug,
      kind: "legacy",
      title: row.title || "",
      slug: row.slug || "",
      status: "Live",
      year: row.year === 0 || row.year ? String(row.year) : "",
      overview: row.overview || "",
      projectOverview: "",
      liveLink: "",
      heroImage: row.hero_image || "",
      services: [],
      gallery: [],
    };
  }

  // Key order matters only for a readable diff in content/legacy-work.json.
  function toLegacy(item) {
    var year = Number(item.year);
    return {
      title: item.title,
      slug: item.slug,
      year: item.year !== "" && !isNaN(year) ? year : undefined,
      overview: item.overview,
      hero_image: item.heroImage || "",
    };
  }

  function emptyItem() {
    return {
      key: "cms:new-" + Date.now(),
      kind: "cms",
      file: null,
      sha: null,
      isNew: true,
      title: "",
      slug: "",
      status: "Draft",
      year: String(new Date().getFullYear()),
      overview: "",
      projectOverview: "",
      liveLink: "",
      heroImage: "",
      services: ["", "", ""],
      gallery: [],
    };
  }

  /* --------------------------------------------------------------- state */

  var state = {
    store: null,
    user: null,
    items: [],
    view: "list",
    selectedKey: null,
    draft: null,
    dirty: false,
    saving: false,
    query: "",
    statusFilter: "all",
    sortBy: "manual",
    sortDir: "asc",
    checked: {},
  };

  var root = document.getElementById("cms-root");

  /* --------------------------------------------------------------- login */

  function renderLogin(errorMessage) {
    root.innerHTML = "";
    root.appendChild(
      el("div", { class: "login" }, [
        el("div", { class: "login__card" }, [
          el("div", { html: LOGO, style: "display:flex;justify-content:center" }),
          el("h1", { text: "Tumenko CMS" }),
          el("p", {
            text:
              "Prijavi se GitHub nalogom koji ima pristup repozitorijumu " +
              CFG.repo +
              ". Svaka izmena se snima kao commit i Vercel automatski redeployuje sajt.",
          }),
          el("button", { class: "btn btn--primary", onclick: startLogin }, ["Login with GitHub"]),
          errorMessage ? el("p", { class: "login__error", text: errorMessage }) : null,
        ]),
      ])
    );
  }

  function startLogin() {
    var width = 1000;
    var height = 700;
    var left = window.screenX + (window.outerWidth - width) / 2;
    var top = window.screenY + (window.outerHeight - height) / 2;
    var popup = window.open(
      "/api/auth",
      "tumenko-cms-auth",
      "width=" + width + ",height=" + height + ",left=" + left + ",top=" + top
    );
    if (!popup) {
      renderLogin("Browser je blokirao popup prozor — dozvoli popup za ovaj sajt pa probaj ponovo.");
      return;
    }

    // api/callback.js speaks Decap's handshake: it announces itself with
    // "authorizing:github", waits for any message back so it learns our
    // origin, then posts the token. Mirror both halves here.
    function onMessage(event) {
      if (typeof event.data !== "string") return;
      if (event.data === "authorizing:github") {
        popup.postMessage(event.data, event.origin);
        return;
      }
      var match = /^authorization:github:(success|error):([\s\S]+)$/.exec(event.data);
      if (!match) return;
      window.removeEventListener("message", onMessage);
      try {
        popup.close();
      } catch (err) {
        /* popup may already be gone */
      }
      var payload = JSON.parse(match[2]);
      if (match[1] === "error" || !payload.token) {
        renderLogin(payload.message || "Prijava nije uspela.");
        return;
      }
      localStorage.setItem(TOKEN_KEY, payload.token);
      boot(payload.token);
    }

    window.addEventListener("message", onMessage);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  /* ---------------------------------------------------------------- boot */

  function boot(token) {
    state.store = DEMO ? new DemoStore() : new GitHubStore(token);
    root.innerHTML = "";
    root.appendChild(el("div", { class: "empty", text: "Ucitavanje…" }));

    state.store
      .user()
      .then(function (user) {
        state.user = user;
        return state.store.load();
      })
      .then(function (items) {
        state.items = items;
        render();
      })
      .catch(function (err) {
        console.error(err);
        if (DEMO) {
          toast(err.message, true);
          return;
        }
        renderLogin(err.message);
      });
  }

  /* -------------------------------------------------------------- derive */

  function visibleItems() {
    var query = state.query.trim().toLowerCase();
    var rows = state.items.filter(function (item) {
      if (state.statusFilter !== "all" && item.status !== state.statusFilter) return false;
      if (!query) return true;
      return (
        item.title.toLowerCase().indexOf(query) >= 0 ||
        item.slug.toLowerCase().indexOf(query) >= 0 ||
        item.overview.toLowerCase().indexOf(query) >= 0
      );
    });

    if (state.sortBy !== "manual") {
      rows.sort(function (a, b) {
        var x = state.sortBy === "year" ? Number(a.year || 0) : a.title.toLowerCase();
        var y = state.sortBy === "year" ? Number(b.year || 0) : b.title.toLowerCase();
        if (x < y) return state.sortDir === "asc" ? -1 : 1;
        if (x > y) return state.sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return rows;
  }

  function findItem(key) {
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].key === key) return state.items[i];
    }
    return null;
  }

  /* -------------------------------------------------------------- render */

  function render() {
    var scroller = root.querySelector(".table-wrap, .editor");
    var scrollTop = scroller ? scroller.scrollTop : 0;

    root.innerHTML = "";
    root.appendChild(
      el("div", { class: "app" }, [
        DEMO ? renderBanner() : null,
        renderTopbar(),
        el("div", { class: "body" }, [renderSidebar(), renderMain()]),
      ])
    );

    var next = root.querySelector(".table-wrap, .editor");
    if (next) next.scrollTop = scrollTop;
  }

  function renderBanner() {
    return el("div", {
      class: "banner",
      html:
        "<b>DEMO PANEL</b> — bez logina, samo za pregled. Izmene se <b>ne cuvaju</b> " +
        'i ne idu na sajt. Pravi panel je na <a href="/admin">/admin</a>.',
    });
  }

  function renderTopbar() {
    var right = [];

    if (state.view === "detail") {
      right.push(
        el("span", {
          class: "savestate" + (state.dirty ? " is-dirty" : ""),
          text: state.saving ? "Objavljujem…" : state.dirty ? "Nesacuvano" : "Saved",
        })
      );
      right.push(
        el(
          "button",
          {
            class: "btn btn--primary",
            disabled: !state.dirty || state.saving,
            onclick: publishDraft,
          },
          ["Publish"]
        )
      );
    } else {
      right.push(
        el(
          "a",
          {
            class: "btn btn--ghost",
            href: CFG.siteUrl,
            target: "_blank",
            rel: "noopener",
            title: "Otvori sajt",
          },
          [el("span", { html: ICONS.play })]
        )
      );
      right.push(
        el("a", { class: "btn", href: CFG.siteUrl + "/work", target: "_blank", rel: "noopener" }, [
          "View site",
        ])
      );
    }

    if (state.user && state.user.avatar_url) {
      right.unshift(el("img", { class: "avatar", src: state.user.avatar_url, alt: state.user.login }));
    }
    if (!DEMO) {
      right.unshift(
        el("button", { class: "icon-btn", title: "Odjavi se", onclick: logout }, [
          el("span", { html: ICONS.logout }),
        ])
      );
    }

    return el("header", { class: "topbar" }, [
      el("div", { class: "topbar__left" }, [
        el("span", { html: LOGO }),
        el("span", { class: "chip" }, [el("span", { text: "CMS" }), el("span", { html: ICONS.chevronDown })]),
      ]),
      el("div", { class: "topbar__center" }, [
        el("span", { text: CFG.repo }),
        el("span", { class: "topbar__branch" }, [
          el("span", { html: ICONS.branch }),
          el("span", { text: CFG.branch }),
        ]),
      ]),
      el("div", { class: "topbar__right" }, right),
    ]);
  }

  function renderSidebar() {
    var tabs = el("nav", { class: "tabs" }, [
      el("button", { class: "tab is-active" }, ["Collections"]),
      el("button", { class: "tab", onclick: notImplemented("Fields") }, ["Fields"]),
      el("button", { class: "tab", onclick: notImplemented("Plugins") }, ["Plugins"]),
    ]);

    if (state.view === "detail") {
      var rail = el(
        "div",
        { class: "sidebar__list" },
        visibleItems().map(function (item) {
          return el(
            "button",
            {
              class: "rail__item" + (item.key === state.selectedKey ? " is-active" : ""),
              onclick: function () {
                openItem(item.key);
              },
            },
            [
              el("span", { text: item.title || "Bez naslova" }),
              item.kind === "legacy" ? el("span", { class: "rail__badge", text: "Framer" }) : null,
            ]
          );
        })
      );
      return el("aside", { class: "sidebar" }, [tabs, rail]);
    }

    return el("aside", { class: "sidebar" }, [
      tabs,
      el("div", { class: "sidebar__search" }, [
        el("span", { html: ICONS.search }),
        el("input", {
          type: "search",
          placeholder: "Search...",
          value: state.query,
          oninput: function (event) {
            state.query = event.target.value;
            refreshTable();
          },
        }),
      ]),
      el("div", { class: "sidebar__list" }, [
        el("button", { class: "collection is-active" }, [
          el("span", { html: ICONS.database }),
          el("span", { text: "Work Items" }),
          el("span", { class: "collection__count", text: String(state.items.length) }),
        ]),
        el("button", { class: "collection collection--add", onclick: notImplemented("Add collection") }, [
          el("span", { html: ICONS.plus }),
          el("span", { text: "Add..." }),
        ]),
      ]),
    ]);
  }

  function notImplemented(label) {
    return function () {
      toast(label + ": ovaj deo Framer panela nije deo ovog CMS-a.");
    };
  }

  function renderMain() {
    if (state.view === "detail") return el("main", { class: "main" }, [renderEditor()]);
    return el("main", { class: "main" }, [renderToolbar(), renderTable()]);
  }

  function renderToolbar() {
    return el("div", { class: "toolbar" }, [
      el("button", { class: "icon-btn", title: "Novi projekat", onclick: createItem }, [
        el("span", { html: ICONS.plus }),
      ]),
      el(
        "button",
        {
          class: "icon-btn" + (state.sortBy !== "manual" ? " is-active" : ""),
          title: "Sortiraj",
          onclick: function (event) {
            openSortMenu(event.currentTarget);
          },
        },
        [el("span", { html: ICONS.sort })]
      ),
      el(
        "button",
        {
          class: "icon-btn" + (state.statusFilter !== "all" ? " is-active" : ""),
          title: "Filtriraj",
          onclick: function (event) {
            openFilterMenu(event.currentTarget);
          },
        },
        [el("span", { html: ICONS.filter })]
      ),
      el("div", { class: "toolbar__search" }, [
        el("input", {
          type: "search",
          placeholder: "Search items...",
          value: state.query,
          oninput: function (event) {
            state.query = event.target.value;
            refreshTable();
          },
        }),
      ]),
      el("div", { class: "toolbar__spacer" }),
      el(
        "button",
        {
          class: "icon-btn",
          title: "Vise",
          onclick: function (event) {
            openMoreMenu(event.currentTarget);
          },
        },
        [el("span", { html: ICONS.dots })]
      ),
    ]);
  }

  function refreshTable() {
    var main = root.querySelector(".main");
    if (!main) return render();
    var old = main.querySelector(".table-wrap");
    if (!old) return render();
    main.replaceChild(renderTable(), old);
    var counter = root.querySelector(".collection__count");
    if (counter) counter.textContent = String(state.items.length);
  }

  function toggleAll() {
    var rows = visibleItems();
    var allOn = rows.length > 0 && rows.every(function (item) {
      return state.checked[item.key];
    });
    rows.forEach(function (item) {
      if (allOn) delete state.checked[item.key];
      else state.checked[item.key] = true;
    });
    refreshTable();
  }

  function renderTable() {
    var rows = visibleItems();
    var allChecked = rows.length > 0 && rows.every(function (item) {
      return state.checked[item.key];
    });

    var head = el("thead", {}, [
      el("tr", {}, [
        el("th", { class: "col-handle" }, [
          el("span", { class: "check" + (allChecked ? " is-on" : ""), onclick: toggleAll }),
        ]),
        el("th", { class: "col-title", text: "Title" }),
        el("th", { class: "col-status", text: "Status" }),
        el("th", { class: "col-slug", text: "Slug" }),
        el("th", { class: "col-text", text: "Overview" }),
        el("th", { class: "col-text", text: "Project Overview" }),
        el("th", { class: "col-year", text: "Year" }),
        el("th", { class: "col-actions" }),
      ]),
    ]);

    var body = el(
      "tbody",
      {},
      rows.map(function (item) {
        return el("tr", {}, [
          el("td", { class: "col-handle" }, [
            el("div", { class: "handle-cell" }, [
              el("span", { class: "grip", html: ICONS.grip }),
              el("span", {
                class: "check" + (state.checked[item.key] ? " is-on" : ""),
                onclick: function () {
                  if (state.checked[item.key]) delete state.checked[item.key];
                  else state.checked[item.key] = true;
                  refreshTable();
                },
              }),
            ]),
          ]),
          el("td", {
            class: "col-title cell-title",
            text: item.title || "Bez naslova",
            onclick: function () {
              openItem(item.key);
            },
          }),
          el("td", { class: "col-status" }, [statusPill(item)]),
          el("td", { class: "col-slug", text: item.slug }),
          el("td", { class: "col-text", text: item.overview }),
          el("td", { class: "col-text", text: item.projectOverview }),
          el("td", { class: "col-year", text: item.year }),
          el("td", { class: "col-actions" }, [
            el(
              "button",
              {
                class: "icon-btn",
                onclick: function (event) {
                  openRowMenu(event.currentTarget, item);
                },
              },
              [el("span", { html: ICONS.dots })]
            ),
          ]),
        ]);
      })
    );

    var table = el("table", { class: "table" }, [head, body]);
    var wrap = el("div", { class: "table-wrap" }, [
      table,
      rows.length
        ? null
        : el("div", {
            class: "empty",
            text: state.items.length
              ? "Nijedan projekat ne odgovara pretrazi."
              : "Jos nema projekata — klikni + da dodas prvi.",
          }),
    ]);
    return wrap;
  }

  function statusPill(item) {
    var isLive = item.status === "Live";
    if (item.kind === "legacy") {
      return el("span", { class: "pill pill--framer", title: "Framer stranica — status se ne menja" }, [
        el("span", { text: "Framer" }),
      ]);
    }
    return el(
      "button",
      {
        class: "pill " + (isLive ? "pill--live" : "pill--draft"),
        onclick: function (event) {
          openStatusMenu(event.currentTarget, item);
        },
      },
      [el("span", { text: item.status }), el("span", { html: ICONS.chevronDown })]
    );
  }

  /* --------------------------------------------------------------- menus */

  function openMenu(anchor, children) {
    closeMenu();
    var rect = anchor.getBoundingClientRect();
    var menu = el("div", { class: "menu" }, children);
    menu.style.visibility = "hidden";
    document.body.appendChild(menu);
    var height = menu.offsetHeight;
    var top = rect.bottom + 6;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
    menu.style.top = top + "px";
    menu.style.left = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8) + "px";
    menu.style.visibility = "visible";
    setTimeout(function () {
      document.addEventListener("mousedown", onOutside);
    }, 0);
    function onOutside(event) {
      if (!menu.contains(event.target)) closeMenu();
    }
    menu._onOutside = onOutside;
  }

  function closeMenu() {
    var menu = document.querySelector(".menu");
    if (!menu) return;
    if (menu._onOutside) document.removeEventListener("mousedown", menu._onOutside);
    menu.remove();
  }

  function menuItem(label, onClick, extraClass) {
    return el(
      "button",
      {
        class: extraClass || "",
        onclick: function () {
          closeMenu();
          onClick();
        },
      },
      [label]
    );
  }

  function openStatusMenu(anchor, item) {
    openMenu(anchor, [
      el("div", { class: "menu__label", text: "Status" }),
      menuItem("Live", function () {
        setStatus(item, "Live");
      }),
      menuItem("Draft", function () {
        setStatus(item, "Draft");
      }),
    ]);
  }

  function openSortMenu(anchor) {
    openMenu(anchor, [
      el("div", { class: "menu__label", text: "Sortiraj po" }),
      menuItem("Rucni redosled", function () {
        state.sortBy = "manual";
        render();
      }),
      menuItem("Naslov A→Z", function () {
        state.sortBy = "title";
        state.sortDir = "asc";
        render();
      }),
      menuItem("Naslov Z→A", function () {
        state.sortBy = "title";
        state.sortDir = "desc";
        render();
      }),
      menuItem("Godina, novije prvo", function () {
        state.sortBy = "year";
        state.sortDir = "desc";
        render();
      }),
      menuItem("Godina, starije prvo", function () {
        state.sortBy = "year";
        state.sortDir = "asc";
        render();
      }),
    ]);
  }

  function openFilterMenu(anchor) {
    openMenu(anchor, [
      el("div", { class: "menu__label", text: "Status" }),
      menuItem("Sve", function () {
        state.statusFilter = "all";
        render();
      }),
      menuItem("Samo Live", function () {
        state.statusFilter = "Live";
        render();
      }),
      menuItem("Samo Draft", function () {
        state.statusFilter = "Draft";
        render();
      }),
    ]);
  }

  function openMoreMenu(anchor) {
    openMenu(anchor, [
      menuItem("Osvezi iz repozitorijuma", reload),
      menuItem("Otvori /work na sajtu", function () {
        window.open(CFG.siteUrl + "/work", "_blank", "noopener");
      }),
    ]);
  }

  function openRowMenu(anchor, item) {
    var children = [
      menuItem("Otvori", function () {
        openItem(item.key);
      }),
      menuItem("Otvori stranicu na sajtu", function () {
        window.open(CFG.siteUrl + "/work/" + item.slug, "_blank", "noopener");
      }),
    ];
    if (item.kind === "cms") {
      children.push(el("div", { class: "menu__sep" }));
      children.push(
        menuItem("Obrisi projekat", function () {
          deleteItem(item);
        }, "btn--danger")
      );
    }
    openMenu(anchor, children);
  }

  /* -------------------------------------------------------------- editor */

  // A "+ new" item is pushed into state.items right away so the editor and the
  // sidebar rail can address it by key, but it exists only in the browser until
  // the first Publish. Abandoning it must not leave a phantom row in the table.
  function dropUnsavedNew(exceptKey) {
    state.items = state.items.filter(function (item) {
      return !(item.isNew && !item.sha && item.key !== exceptKey);
    });
  }

  function openItem(key) {
    if (state.dirty && !confirm("Imas nesacuvane izmene. Napustiti ih?")) return;
    dropUnsavedNew(key);
    var item = findItem(key);
    if (!item) return;
    state.selectedKey = key;
    state.draft = JSON.parse(JSON.stringify(item));
    while (state.draft.kind === "cms" && state.draft.services.length < 3) {
      state.draft.services.push("");
    }
    state.dirty = false;
    state.view = "detail";
    render();
  }

  function closeEditor() {
    if (state.dirty && !confirm("Imas nesacuvane izmene. Napustiti ih?")) return;
    dropUnsavedNew(null);
    state.view = "list";
    state.draft = null;
    state.selectedKey = null;
    state.dirty = false;
    render();
  }

  function createItem() {
    if (state.dirty && !confirm("Imas nesacuvane izmene. Napustiti ih?")) return;
    dropUnsavedNew(null);
    var item = emptyItem();
    state.items.push(item);
    state.selectedKey = item.key;
    state.draft = JSON.parse(JSON.stringify(item));
    state.dirty = true;
    state.view = "detail";
    render();
  }

  // Only the topbar reacts to dirtiness (save state + Publish button), so
  // avoid a full re-render — it would blow away focus in the field being typed.
  function markDirty() {
    if (state.dirty) return;
    state.dirty = true;
    var bar = root.querySelector(".topbar");
    if (bar) bar.parentNode.replaceChild(renderTopbar(), bar);
  }

  function renderEditor() {
    var draft = state.draft;
    var isLegacy = draft.kind === "legacy";
    var fields = [];

    fields.push(
      fieldRow(
        "Title",
        el("input", {
          class: "input",
          value: draft.title,
          oninput: function (event) {
            draft.title = event.target.value;
            if (draft.isNew && !draft.slug) {
              draft.slug = slugify(draft.title);
              var slugInput = root.querySelector("[data-slug-input]");
              if (slugInput) slugInput.value = draft.slug;
              updateSlugHint();
            }
            markDirty();
          },
        })
      )
    );

    fields.push(
      fieldRow(
        "Status",
        isLegacy
          ? el("span", { class: "pill pill--framer", text: "Framer" })
          : el("span", { class: "status-select pill " + (draft.status === "Live" ? "pill--live" : "pill--draft") }, [
              el(
                "select",
                {
                  onchange: function (event) {
                    draft.status = event.target.value;
                    markDirty();
                    rerenderEditor();
                  },
                },
                [
                  el("option", { value: "Live", selected: draft.status === "Live" }, ["Live"]),
                  el("option", { value: "Draft", selected: draft.status === "Draft" }, ["Draft"]),
                ]
              ),
            ]),
        isLegacy ? "Ova stranica je staticki Framer export — status se ne menja iz panela." : null
      )
    );

    fields.push(
      fieldRow(
        "Slug",
        el("input", {
          class: "input",
          value: draft.slug,
          disabled: isLegacy,
          "data-slug-input": "1",
          oninput: function (event) {
            draft.slug = slugify(event.target.value);
            markDirty();
            updateSlugHint();
          },
          onblur: function (event) {
            event.target.value = draft.slug;
          },
        }),
        null,
        el("p", { class: "field__hint", "data-slug-hint": "1" }, [
          el("span", { html: ICONS.globe }),
          el("span", { text: prettyUrl(draft.slug) }),
        ])
      )
    );

    fields.push(sectionRow("Details"));

    fields.push(
      fieldRow(
        "Overview",
        el("textarea", {
          class: "textarea",
          rows: 3,
          value: draft.overview,
          oninput: function (event) {
            draft.overview = event.target.value;
            markDirty();
          },
        }),
        "Kratak opis na kartici u /work listi i u meta description-u."
      )
    );

    if (!isLegacy) {
      fields.push(
        fieldRow(
          "Project Overview",
          el("textarea", {
            class: "textarea",
            rows: 6,
            value: draft.projectOverview,
            oninput: function (event) {
              draft.projectOverview = event.target.value;
              markDirty();
            },
          }),
          "Duzi case-study tekst na dnu stranice projekta."
        )
      );
    }

    fields.push(
      fieldRow(
        "Year",
        el("input", {
          class: "input",
          type: "number",
          value: draft.year,
          oninput: function (event) {
            draft.year = event.target.value;
            markDirty();
          },
        })
      )
    );

    if (!isLegacy) {
      [0, 1, 2].forEach(function (index) {
        fields.push(
          fieldRow(
            "Service " + (index + 1),
            el("input", {
              class: "input",
              value: draft.services[index] || "",
              oninput: function (event) {
                draft.services[index] = event.target.value;
                markDirty();
              },
            })
          )
        );
      });

      fields.push(
        fieldRow(
          "Live Link",
          el("div", { class: "input-clear" }, [
            el("input", {
              class: "input",
              value: draft.liveLink,
              placeholder: "https://",
              oninput: function (event) {
                draft.liveLink = event.target.value;
                markDirty();
              },
            }),
            el(
              "button",
              {
                class: "clear",
                title: "Obrisi",
                onclick: function () {
                  draft.liveLink = "";
                  markDirty();
                  rerenderEditor();
                },
              },
              ["×"]
            ),
          ])
        )
      );
    }

    fields.push(sectionRow("Images"));

    fields.push(
      fieldRow(
        "Thumb",
        mediaSlot(draft.heroImage, function (path) {
          draft.heroImage = path;
          markDirty();
          rerenderEditor();
        }),
        "Naslovna slika — koristi se na kartici u /work listi."
      )
    );

    if (!isLegacy) {
      fields.push(fieldRow("Gallery", galleryEditor(draft)));
    }

    if (isLegacy) {
      fields.push(
        fieldRow(
          "",
          el("p", {
            class: "field__hint",
            text:
              "Napomena: HTML stranice ovih 6 projekata dolaze iz Framer export-a i " +
              "panel ih ne dira. Ovde se menja samo kartica na /work listi.",
          })
        )
      );
    }

    var actions = [];
    if (draft.kind === "cms" && !draft.isNew) {
      actions.push(
        el(
          "button",
          {
            class: "btn btn--danger",
            onclick: function () {
              deleteItem(findItem(state.selectedKey) || draft);
            },
          },
          [el("span", { html: ICONS.trash }), el("span", { text: "Obrisi projekat" })]
        )
      );
    }

    return el("div", { class: "editor" }, [
      el("div", { class: "editor__inner" }, [
        el("button", { class: "editor__close", onclick: closeEditor, html: ICONS.close }),
        el("div", {}, fields),
        actions.length ? el("div", { style: "margin-top:28px" }, actions) : null,
      ]),
    ]);
  }

  function rerenderEditor() {
    var main = root.querySelector(".main");
    if (!main) return render();
    var old = main.querySelector(".editor");
    var scrollTop = old ? old.scrollTop : 0;
    var next = renderEditor();
    main.replaceChild(next, old);
    next.scrollTop = scrollTop;
  }

  function prettyUrl(slug) {
    return CFG.siteUrl.replace(/^https?:\/\//, "") + "/work/" + (slug || "…");
  }

  function updateSlugHint() {
    var hint = root.querySelector("[data-slug-hint] span:last-child");
    if (hint) hint.textContent = prettyUrl(state.draft.slug);
  }

  function fieldRow(label, control, hint, extra) {
    return el("div", { class: "field" }, [
      el("div", { class: "field__label", text: label }),
      el("div", { class: "field__control" }, [
        control,
        hint ? el("p", { class: "field__hint", text: hint }) : null,
        extra || null,
      ]),
    ]);
  }

  function sectionRow(label) {
    return el("div", { class: "section" }, [el("span", { text: label })]);
  }

  function mediaSlot(value, onChange) {
    var children = [];
    if (value) {
      var isVideo = /\.(mp4|webm|mov)$/i.test(value);
      children.push(
        el("div", { class: "thumb" }, [
          isVideo
            ? el("video", { src: value, muted: true })
            : el("img", { src: value, alt: "" }),
          el(
            "button",
            {
              class: "thumb__remove",
              title: "Ukloni",
              onclick: function () {
                onChange("");
              },
            },
            ["×"]
          ),
        ])
      );
    }
    children.push(
      el(
        "button",
        {
          class: "dropzone",
          onclick: function () {
            pickFile(function (file) {
              uploadFile(file, onChange);
            });
          },
        },
        [value ? "Zameni" : "Upload"]
      )
    );
    return el("div", { class: "media" }, children);
  }

  function galleryEditor(draft) {
    var rows = draft.gallery.map(function (row, index) {
      return el("div", { class: "gallery-item" }, [
        mediaSlot(row.src, function (path) {
          row.src = path;
          markDirty();
          rerenderEditor();
        }),
        el("div", { class: "gallery-item__fields" }, [
          el("div", { class: "gallery-item__row" }, [
            el(
              "select",
              {
                class: "selectbox",
                onchange: function (event) {
                  row.type = event.target.value;
                  markDirty();
                },
              },
              [
                el("option", { value: "image", selected: row.type !== "video" }, ["image"]),
                el("option", { value: "video", selected: row.type === "video" }, ["video"]),
              ]
            ),
            el("input", {
              class: "input",
              placeholder: "Alt tekst",
              value: row.alt,
              oninput: function (event) {
                row.alt = event.target.value;
                markDirty();
              },
            }),
          ]),
          el(
            "button",
            {
              class: "btn btn--ghost btn--danger",
              style: "align-self:flex-start",
              onclick: function () {
                draft.gallery.splice(index, 1);
                markDirty();
                rerenderEditor();
              },
            },
            ["Ukloni"]
          ),
        ]),
      ]);
    });

    rows.push(
      el(
        "button",
        {
          class: "btn",
          onclick: function () {
            draft.gallery.push({ type: "image", src: "", alt: "" });
            markDirty();
            rerenderEditor();
          },
        },
        [el("span", { html: ICONS.plus }), el("span", { text: "Dodaj stavku" })]
      )
    );

    return el("div", {}, rows);
  }

  function pickFile(onPick) {
    var input = el("input", { type: "file", accept: "image/*,video/mp4,video/webm" });
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", function () {
      if (input.files && input.files[0]) onPick(input.files[0]);
      input.remove();
    });
    input.click();
  }

  function uploadFile(file, onChange) {
    toast("Uploadujem " + file.name + "…");
    state.store
      .upload(file)
      .then(function (path) {
        onChange(path);
        toast("Upload gotov.");
      })
      .catch(function (err) {
        console.error(err);
        toast("Upload nije uspeo: " + err.message, true);
      });
  }

  /* --------------------------------------------------------------- write */

  function publishDraft() {
    var draft = state.draft;
    if (!draft.title.trim()) {
      toast("Title je obavezan.", true);
      return;
    }
    if (draft.kind === "cms" && !draft.slug) {
      toast("Slug je obavezan.", true);
      return;
    }
    if (draft.kind === "cms") {
      var clash = state.items.filter(function (item) {
        return item.key !== draft.key && item.slug === draft.slug;
      });
      if (clash.length) {
        toast("Slug \"" + draft.slug + "\" vec postoji.", true);
        return;
      }
    }

    state.saving = true;
    render();

    var target = findItem(draft.key);
    Object.keys(draft).forEach(function (key) {
      target[key] = draft[key];
    });
    target.services = target.services.filter(function (value) {
      return String(value).trim() !== "";
    });

    state.store
      .saveItem(target, state.items)
      .then(function () {
        target.isNew = false;
        state.saving = false;
        state.dirty = false;
        state.draft = JSON.parse(JSON.stringify(target));
        while (state.draft.kind === "cms" && state.draft.services.length < 3) {
          state.draft.services.push("");
        }
        render();
        toast(
          DEMO
            ? "Demo: izmena nije sacuvana."
            : "Sacuvano. Vercel gradi sajt — za par minuta je uzivo."
        );
      })
      .catch(function (err) {
        console.error(err);
        state.saving = false;
        render();
        toast("Cuvanje nije uspelo: " + err.message, true);
      });
  }

  function setStatus(item, status) {
    if (item.status === status) return;
    var previous = item.status;
    item.status = status;
    refreshTable();
    state.store
      .saveItem(item, state.items)
      .then(function () {
        toast(DEMO ? "Demo: status nije sacuvan." : "Status: " + status + ". Sajt se gradi.");
      })
      .catch(function (err) {
        item.status = previous;
        refreshTable();
        toast("Ne mogu da promenim status: " + err.message, true);
      });
  }

  function deleteItem(item) {
    if (!confirm('Obrisati "' + item.title + '"? Ovo brise content fajl iz repozitorijuma.')) return;
    state.store
      .deleteItem(item)
      .then(function () {
        state.items = state.items.filter(function (row) {
          return row.key !== item.key;
        });
        state.view = "list";
        state.draft = null;
        state.selectedKey = null;
        state.dirty = false;
        render();
        toast(
          DEMO
            ? "Demo: nista nije obrisano."
            : "Obrisano. Napomena: generisana stranica work/" +
              item.slug +
              "/index.html ostaje u repou dok se rucno ne obrise."
        );
      })
      .catch(function (err) {
        toast("Brisanje nije uspelo: " + err.message, true);
      });
  }

  function reload() {
    state.store
      .load()
      .then(function (items) {
        state.items = items;
        state.view = "list";
        state.draft = null;
        state.dirty = false;
        render();
        toast("Osvezeno.");
      })
      .catch(function (err) {
        toast(err.message, true);
      });
  }

  /* ---------------------------------------------------------------- init */

  window.addEventListener("beforeunload", function (event) {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  if (DEMO) {
    boot(null);
  } else {
    var saved = localStorage.getItem(TOKEN_KEY);
    if (saved) boot(saved);
    else renderLogin(null);
  }
})();
