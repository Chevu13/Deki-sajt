# Tumenko — Creative Director Portfolio

Statički export Framer sajta (napravljen preko NocodeXport-a). Čist HTML/CSS/JS,
bez potrebe za build korakom — može se hostovati bilo gde kao static site.

## Struktura

```
index.html                     Home (Framer)
about/index.html               About (Framer)
contact/index.html             Contact (Framer)
privacy-policy/index.html      Privacy Policy (Framer)
404/index.html                 404 stranica (Framer)
work/cro-sea-villas/ itd.      6 originalnih case study-jeva (Framer, netaknuti)
work/index.html                Works lista — GENERISANA (originalnih 6 + CMS projekti)
work/<novi-slug>/index.html    Novi CMS projekti — GENERISANI

assets/images, fonts, videos   Mediji (Framer export)
assets/animate                 Framer/Motion runtime (samo za Framer stranice)
assets/uploads                 Slike/video koje CMS panel upload-uje
assets/cms.css, cms.js         Stilovi/JS za CMS-generisane stranice (bez Framer JS-a)
assets/legacy-gallery.js       Dodaje slike preko Framer-ovih sest u 6 originalnih stranica

content/work/*.md              Podaci za nove projekte (izvor za CMS panel)
content/legacy-work.json       Podaci za originalnih 6 projekata (za work listu)
templates/                     Template delovi koje scripts/build.mjs sastavlja
scripts/build.mjs              Generator — pravi work/<slug>/, work/index.html i sitemap.xml
scripts/resync.mjs             (staro) re-mirror ceo sajt iz novog Framer export-a

admin/                         CMS panel u Framer stilu (/admin na živom sajtu)
admin-preview/                 isti panel, demo režim bez logina (/admin-preview)
admin-decap/                   Decap CMS, rezervni panel (/admin-decap)
api/auth.js, api/callback.js   GitHub OAuth za prijavu u /admin
```

## Deploy na Vercel preko GitHub-a

Repo je [github.com/Chevu13/Deki-sajt](https://github.com/Chevu13/Deki-sajt), grana `main`:

```bash
git remote add origin https://github.com/Chevu13/Deki-sajt.git
git push -u origin main
```

Dejan radi kao **collaborator** na tom repou (Settings → Collaborators). To mu
daje i push sa svog racunara i login u `/admin` — panel pise preko GitHub
API-ja, pa mu treba write pravo na repo.

1. Idi na [vercel.com/new](https://vercel.com/new), izaberi taj GitHub repo.
2. Framework Preset: **Other**. Build Command i Output Directory ostavi prazne —
   [vercel.json](vercel.json) već zadaje `npm run build` i `outputDirectory: "."`.
3. Deploy.

`vercel.json` uključuje `cleanUrls` (pa `/about` servira `about/index.html`,
`/work/pletho` servira `work/pletho/index.html`) i dugotrajni cache za
optimizovane slike, fontove i video.

## Dodavanje novih projekata — CMS panel (/admin)

Novi projekti se **ne** dodaju kroz Framer. Na `/admin` stoji sopstveni CMS
panel — vizuelno kopija Framer-ovog CMS-a (sidebar sa kolekcijom, tabela stavki,
editor sa poljem po redu), ali umesto Framer-ovog backend-a piše direktno u ovaj
repozitorijum preko GitHub API-ja. Svaki Publish je **jedan commit** — upload
slika, izmenjen sadržaj i ažurirane mape idu zajedno (Git Data API), pa Vercel
pravi jedan build umesto jednog po fajlu.

Editor ima ista polja za obe vrste projekata: Title, Status, Slug, Details
(Overview, Project Overview, Year, Service 1–3, Live Link) i Images (Thumb,
Image 1, 2, 3…, video). **Broj slika u galeriji nije ogranicen** — ni kod novih
projekata ni kod originalnih 6 — vidi nize.

Panel ima dve kolekcije u sidebaru:

| Kolekcija | Stavke | Izvor | Šta se menja |
|---|---|---|---|
| **Work Items** | CMS projekti | `content/work/*.md` | sve; `scripts/build.mjs` iz njih generiše `work/<slug>/index.html` |
| **Work Items** | Framer projekti (originalnih 6) | `content/legacy-work.json` + sam HTML | kartica na `/work`, **sve slike i video u stranici + dodatne preko sest**, Status, brisanje |
| **Pages** | Home, About | `content/pages.json` + sam HTML | Home: hero slika i tekst ispod hero banera. About: tri slike u sekciji |

### Kako se menja sadržaj statičkih Framer stranica

Te stranice nemaju Markdown izvor — one su export iz Framera. Panel im menja
sadržaj tako što prepiše same izvorne fajlove, isto što radi i
`scripts/optimize-images.py` kad prepisuje putanje slika.

Mape "šta stoji gde" pravi `npm run media-map`:

```
content/legacy-images.json   6 project stranica: Thumb, Image 1–6, video
content/pages.json           Home i About: slike + tekst
```

Zamena mora da pogodi **svako mesto na kom sadržaj stoji**, inače React posle
hidracije vrati staro stanje:

1. `srcset` lista (više veličina iste slike)
2. `src` atribut
3. **JSON payload** koji Framer ugrađuje u stranicu za hidraciju
4. **page chunk** u `assets/animate/*.mjs` — Home i About renderuju hero sliku i
   tekst odatle, ne iz HTML-a

Zato svaka stavka u mapi nosi i listu `sources`. Project stranice imaju samo
svoj HTML; Home i About imaju i po jedan `.mjs` chunk. Tekst se escape-uje po
tipu fajla — HTML entiteti u `.html`, a backslash / backtick / `${` u `.mjs`,
gde tekst stoji u template literalu.

Kad se zameni Thumb nekog od 6 projekata, prepisuje se i `index.html` — naslovna
prikazuje thumbove izabranih radova, pa bi inače ostala sa starom slikom.

### Dodatne slike u galerijama originalnih 6

Framer komponenta tih stranica ima **tačno sedam imenovanih polja za sliku**
(hero + šest) — vidi `__framer__handoverData` u samoj stranici, to je CMS upit
sa poljima `WZLjnByVm`, `gKZf9vCAz`, … Sedmo polje ne postoji, pa se sedma slika
ne može dodati ni kroz HTML ni kroz payload: React posle hidracije prezida
galeriju iz svojih propova i svaki dodat markup nestane (provereno).

Zato slike preko šeste dodaje [assets/legacy-gallery.js](assets/legacy-gallery.js)
**posle hidracije**: klonira postojeći slajd (da razmak i dimenzije budu
identični), zameni sliku u njemu i doda ga na kraj. Skript je otporan na to da
React prezida listu — poredi broj slajdova i vraća dodate ako nestanu.

Spisak stoji u samoj stranici, u `<script id="cms-extra-media">`, i piše ga CMS
panel. Galerija se u DOM-u pronalazi po hash imenima Framer-ovih šest slika, ne
po Framer klasama — te se menjaju sa svakim exportom.

Jedina razlika u odnosu na originalne slajdove: Framer svoje otkriva scroll
animacijom sticky sekcije, na koju se spolja ne može zakačiti, pa se dodate
prikazuju kratkim fade-om umesto scroll-sinhronizovanim. Sve ostalo — položaj,
dimenzije, razmak, lazy loading, dužina scroll-a — isto je.

Raspored, tipografija i animacije tih stranica i dalje dolaze iz Framer export-a
i panel ih ne dira — kao ni Contact/Privacy Policy/404.

> Posle novog Framer export-a (`scripts/resync.mjs`) pokreni `npm run media-map`
> da se mape osveže, jer se hash imena slika i chunk-ova menjaju.

**Jednokratno podešavanje** (posle prvog Vercel deploy-a):

1. **GitHub OAuth App** — na [github.com/settings/developers](https://github.com/settings/developers)
   → "New OAuth App":
   - Homepage URL: `https://www.dtumenko.com`
   - Authorization callback URL: `https://www.dtumenko.com/api/callback`
   - Sačuvaj **Client ID** i generiši/sačuvaj **Client Secret**.
2. **Vercel env varijable** — u Vercel project → Settings → Environment Variables:
   - `OAUTH_CLIENT_ID` = Client ID iz koraka 1
   - `OAUTH_CLIENT_SECRET` = Client Secret iz koraka 1
   - Redeploy da se varijable primene.
3. Otvori `https://www.dtumenko.com/admin`, klikni **Login with GitHub**,
   odobri pristup (scope `repo`) — panel je spreman.

Repo i grana su već upisani u [admin/index.html](admin/index.html)
(`window.CMS_CONFIG`) i u [admin/config.yml](admin/config.yml).

**Dodavanje projekta:** /admin → **+** u toolbaru → popuni Title (Slug se
predlaže sam), Overview, Project Overview, Year, Service 1–3, Live Link, Thumb,
Image 1–6 i video → **Publish**. Za par minuta projekat je na `/work` i na
`/work/<slug>`.

**Status:** `Draft` sklanja projekat sa `/work` liste i iz `sitemap.xml`; `Live`
ga objavljuje. Kod CMS projekata Draft znači i da se stranica uopšte ne generiše.
Kod originalnih 6, sama stranica ostaje dostupna na svom URL-u jer je statički
export — sklanja se samo kartica.

**Gde šta živi u panelu:**

```
admin/index.html          konfiguracija (repo, grana, domen) + učitavanje panela
admin/cms.css             stilovi (Framer look)
admin/cms.js              cela logika: GitHub API, tabela, editor, upload
admin/config.yml          konfiguracija za Decap fallback
admin-preview/            isti panel u demo režimu — bez logina, ništa se ne snima
admin-decap/              Decap CMS, zadržan kao rezerva ako panel ikad zabaguje
content/legacy-images.json  mapa medija u 6 project stranica
content/pages.json          mapa medija i teksta na Home i About
scripts/media-map.mjs       generator obe mape (npm run media-map)
```

**Poznato ponašanje:** ako se projektu naknadno promeni Slug, stara generisana
stranica `work/<stari-slug>/index.html` ostaje u repou dok se ručno ne obriše —
`scripts/build.mjs` samo dodaje i prepisuje, nikad ne briše. (Brisanje projekta
iz panela briše i fajl.)

> `admin-decap/` je Decap-ov standardni UI nad istim fajlovima. Kod njega se
> galerija vidi kao lista stavki, a ne kao Image 1–6 slotovi, i ne ume da menja
> slike u originalnih 6 stranica — to radi samo panel na `/admin`.

**Lokalni build bez panela** (npr. da ručno dodaš/izmeniš `content/work/*.md`):
```bash
npm install
npm run build
git add -A && git commit -m "..." && git push
```

`npm run build` uz `work/` regeneriše i `sitemap.xml`, tako da novi projekti
automatski ulaze u sitemap (postojećim URL-ovima se čuva stari `lastmod`).

### (Staro) Ako ikad ipak zatreba novi Framer export

Originalnih 6 Framer stranica i home/about/contact i dalje dolaze iz Framer-a.
Ako se ONE menjaju, koristi `node scripts/resync.mjs https://<export>.rehosted.page`
(ponovo skine sve Framer stranice + asset-e), pa `git status`/`diff`, pa commit+push.
Ovo ne dira `/work` listu niti CMS projekte.

> Napomena: resync prepisuje HTML stranice, pa se SEO dodaci (canonical,
> JSON-LD, skriveni `<h1>`, Google Analytics tag) gube na tim stranicama —
> treba ih ponovo dodati ili preuzeti iz git istorije.


## Poznato ograničenje

Newsletter forma (footer) i Contact forma nemaju definisan `action` — u originalu
ih je submit-ovao Framer-ov hosting backend, koji ne postoji van Framer-a. Da bi
radile na Vercel-u, treba ih povezati na servis kao Formspree, Getform ili
sopstveni API endpoint (dodavanjem `action="..."` i/ili malo JS-a).

## Popravke — /work fatal error i ucitavanje slika (avg 2026)

### 1. `/work` i CMS stranice su rusile stranicu (`Unexpected response length`)

Framer-ov klijentski ruter povlaci CMS podatke iz `assets/animate/*.framercms`
preko **svoje** konvencije `?range=od-do,od-do` (nije standardni HTTP `Range`
header) i onda proverava da li je duzina odgovora tacno onolika kolika je
trazena. To radi samo Framer-ov CDN — svaki drugi host (Vercel ukljucen) vrati
ceo fajl, pa klijent baci `Request failed: Unexpected response length` i sruси
stranicu. Ranije resenje sa serverless funkcijom (`api/framercms`) nije moglo da
radi: Vercel `rewrites` primenjuje **posle** provere fajl sistema, a
`.framercms` fajl fizicki postoji, tako da se rewrite nikad nije ni okinuo.

Sada je zakrpljena sama funkcija koja radi taj fetch, u
`assets/animate/kvjGSOTZZ.CoZxkceV.mjs`: skida **ceo** fajl (33 KB, kesira se u
browseru i u memoriji po URL-u) i sece opsege lokalno. Nema servera, radi na
bilo kom statickom hostingu. `api/framercms` i rewrite iz `vercel.json` su
obrisani.

> Ako ikad radis novi Framer/NocodeXport export, ova zakrpa se gubi — treba je
> ponovo primeniti na novi `*.mjs` (trazi string `Unexpected response length`).

### 2. Slike (bagovanje na startu)

Framer u `srcset`-u koristi svoj CDN (`?scale-down-to=512&width=8479...`). Van
Framer hostinga ti parametri ne rade nista, pa je browser za svaki thumbnail
skidao ORIGINAL — hero slika je bila 8,5 MB, ukupno ~55 MB slika.

`scripts/optimize-images.py` je:
- napravio WebP varijante (512/1024/2048/2560 px) u `assets/images/opt/`
- prepisao `src` i `srcset` u svim HTML i `.mjs` fajlovima, sa tacnim `w`
  deskriptorima (hero je sada ~8 KB na 1024 px, ~430 KB na 2560 px)
- generisao `assets/lqip.css` — mali zamucen placeholder (base64, ~14 KB ukupno)
  kao `background-image` svake slike, pa se dok se prava slika ucitava vidi
  blur umesto praznog pravougaonika (cisti CSS, React ga ne moze pregaziti)
- dodao `preload` + `fetchpriority="high"` za hero na home-u
- neiskoriscene originale sklonio u `assets/images/_originals/`
  (`.vercelignore` ih izbacuje iz deploy-a; drzi ih u repo-u kao izvor)

Ponovno pokretanje posle dodavanja novih slika:
```bash
pip install pillow
python3 scripts/optimize-images.py
npm run build
```

`vercel.json` sada ima i `cleanUrls` + dugotrajni cache za `assets/images/opt/`,
fontove i video.

### Napomena o testiranju

Preview deploy URL-ovi (`...-lv5fj70aw-...vercel.app`) su zasticeni Vercel
login-om, pa ih ne mogu otvoriti spolja — testiraj na production domenu i uradi
hard refresh (Cmd/Ctrl+Shift+R) jer je stari `.mjs` mozda kesiran.
