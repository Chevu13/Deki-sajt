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

content/work/*.md              Podaci za nove projekte (izvor za CMS panel)
content/legacy-work.json       Podaci za originalnih 6 projekata (za work listu)
templates/                     Template delovi koje scripts/build.mjs sastavlja
scripts/build.mjs              Generator — pravi work/<slug>/ i work/index.html
scripts/resync.mjs             (staro) re-mirror ceo sajt iz novog Framer export-a

admin/                         Decap CMS panel (/admin na živom sajtu)
api/auth.js, api/callback.js   GitHub OAuth za prijavu u /admin
```

## Deploy na Vercel preko GitHub-a

1. Napravi novi repo na GitHub-u (bez README/gitignore template-a, folder je već spreman):
   ```bash
   gh repo create tumenko-portfolio --private --source=. --remote=origin
   git push -u origin main
   ```
   Ili ručno: napravi prazan repo na github.com, pa:
   ```bash
   git remote add origin https://github.com/<username>/tumenko-portfolio.git
   git branch -M main
   git push -u origin main
   ```
2. Idi na [vercel.com/new](https://vercel.com/new), izaberi taj GitHub repo.
3. Framework Preset: **Other** (nema build korak — Vercel će servirati fajlove kao static site). Build Command i Output Directory ostavi prazne.
4. Deploy.

Vercel po defaultu servira `about/index.html` na `/about`, `work/pletho/index.html`
na `/work/pletho`, itd. — isti taj "clean URL" pattern koji sajt već koristi u
linkovima, tako da ne treba `vercel.json`. Ako neka ruta ipak vrati 404, dodaj:

```json
{ "cleanUrls": true, "trailingSlash": false }
```

## Dodavanje novih projekata — CMS panel (/admin)

Novi projekti se **ne** dodaju kroz Framer. Postoji sopstveni CMS panel
([Decap CMS](https://decapcms.org)) na `/admin` gde otvoriš formu (naslov,
godina, opis, galerija slika/video, link) i klikneš Save — panel sam napravi
commit na GitHub, Vercel to automatski pokupi, pokrene `scripts/build.mjs` i
redeploy-uje sajt. Originalnih 6 projekata i sve ostale Framer stranice
(Home/About/Contact/Privacy Policy/404) ovaj panel ne dira.

**Jednokratno podešavanje** (posle prvog push-a na GitHub i prvog Vercel deploy-a):

1. **GitHub OAuth App** — na [github.com/settings/developers](https://github.com/settings/developers)
   → "New OAuth App":
   - Homepage URL: `https://<tvoj-vercel-domen>`
   - Authorization callback URL: `https://<tvoj-vercel-domen>/api/callback`
   - Sačuvaj **Client ID** i generiši/sačuvaj **Client Secret**.
2. **Vercel env varijable** — u Vercel project → Settings → Environment Variables dodaj:
   - `OAUTH_CLIENT_ID` = Client ID iz koraka 1
   - `OAUTH_CLIENT_SECRET` = Client Secret iz koraka 1
   - Redeploy da se varijable primene.
3. **[admin/config.yml](admin/config.yml)** — zameni dva `TODO` placeholder-a:
   - `repo:` → tvoj stvarni `username/tumenko-portfolio`
   - `base_url:` → tvoj stvarni Vercel domen
   - Commit + push (Vercel redeploy-uje).
4. Otvori `https://<tvoj-vercel-domen>/admin`, klikni **Login with GitHub**,
   odobri pristup — panel je spreman za korišćenje.

**Dodavanje projekta:** /admin → Work → New Work → popuni polja (Title, Slug,
Year, Services, Overview, Hero Image, Gallery — svaka stavka galerije može biti
slika ili video, Project Overview za duži tekst) → **Publish**. Za par minuta
(Vercel build) projekat se pojavljuje na `/work` i na svojoj `/work/<slug>`
stranici.

**Lokalni build bez CMS panela** (npr. da ručno dodaš/izmeniš `content/work/*.md`):
```bash
npm install
npm run build
git add -A && git commit -m "..." && git push
```

### (Staro) Ako ikad ipak zatreba novi Framer export

Originalnih 6 Framer stranica i home/about/contact i dalje dolaze iz Framer-a.
Ako se ONE menjaju, koristi `node scripts/resync.mjs https://<export>.rehosted.page`
(ponovo skine sve Framer stranice + asset-e), pa `git status`/`diff`, pa commit+push.
Ovo ne dira `/work` listu niti CMS projekte.

## Poznato ograničenje

Newsletter forma (footer) i Contact forma nemaju definisan `action` — u originalu
ih je submit-ovao Framer-ov hosting backend, koji ne postoji van Framer-a. Da bi
radile na Vercel-u, treba ih povezati na servis kao Formspree, Getform ili
sopstveni API endpoint (dodavanjem `action="..."` i/ili malo JS-a).
