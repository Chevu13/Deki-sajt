#!/usr/bin/env python3
"""
Optimizacija slika za statican Framer export.

Framer u srcset-u koristi svoj CDN (`?scale-down-to=512&width=...`). Van
Framer hostinga ti query parametri ne rade nista -- browser skine ORIGINAL
(kod nas do 9 MB po slici) za svaki thumbnail. Ova skripta:

  1. skenira sve HTML / .mjs / content JSON fajlove
  2. pravi WebP varijante (512 / 1024 / 2048 / 2560 px) u assets/images/opt/
  3. prepisuje src i srcset da pokazuju na te varijante (sa tacnim `w` deskriptorima)
  4. generise assets/lqip.css -- sicusne blur placeholder slike (base64) koje se
     vide dok se prava slika ne ucita, da nema "pop-in" efekta
  5. neiskoriscene originale sklanja u assets/images/_originals/ (ne deploy-uje se,
     vidi .vercelignore)

Pokretanje (iz root-a projekta):
    pip install pillow
    python3 scripts/optimize-images.py
    npm run build      # da se regenerise /work

Idempotentno je -- vec optimizovane URL-ove preskace.
"""
import base64, collections, glob, io, json, os, re, sys

try:
    from PIL import Image, ImageFilter
except ImportError:
    sys.exit("Treba Pillow:  pip install pillow")

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SRC_DIR = "assets/images"
OUT_DIR = "assets/images/opt"
MAX_W = 2560          # ni jedna varijanta nije sira od ovoga
QUALITY = 78
LQIP_MIN_W = 700      # blur placeholder samo za vece slike
CONTENT_JSON = "content/legacy-work.json"

URL_RE = re.compile(
    r"/assets/images/([A-Za-z0-9._-]+?\.(?:jpg|jpeg|png|gif|webp))"
    r"((?:\?|&amp;|&)[^\s\"'`),]*)", re.I)
SRCSET_RE = re.compile(
    r"(?:/assets/images/[^\s,\"'`]+\s+\d+w\s*,\s*)+/assets/images/[^\s,\"'`]+\s+\d+w")


def target_files():
    files = [f for f in glob.glob("**/*.html", recursive=True)
             if "node_modules" not in f and not f.startswith("admin")]
    files += glob.glob("assets/animate/*.mjs")
    return files


def collect_needed(files):
    need = collections.defaultdict(set)
    for f in files:
        s = open(f, encoding="utf8", errors="ignore").read()
        for m in URL_RE.finditer(s):
            q = m.group(2).replace("&amp;", "&")
            sd = re.search(r"scale-down-to=(\d+)", q)
            need[m.group(1)].add(int(sd.group(1)) if sd else "full")
    return need


def build_variants(need):
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest, lqip = {}, {}
    for name, keys in sorted(need.items()):
        path = os.path.join(SRC_DIR, name)
        if not os.path.exists(path):
            path = os.path.join(SRC_DIR, "_originals", name)
        if not os.path.exists(path):
            print("  ! nema originala:", name)
            continue
        im = Image.open(path); im.load()
        ow, oh = im.size
        alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        rgb = im.convert("RGBA") if alpha else im.convert("RGB")
        stem = os.path.splitext(name)[0]

        entry = {}
        for k in keys:
            w = min(ow, MAX_W) if k == "full" else min(int(k), ow, MAX_W)
            out = f"{OUT_DIR}/{stem}-{w}.webp"
            if not os.path.exists(out):
                h = max(1, round(oh * w / ow))
                rgb.resize((w, h), Image.LANCZOS).save(out, "WEBP", quality=QUALITY, method=6)
            entry[str(k)] = ("/" + out, w)
        manifest[name] = entry

        if not alpha and ow >= LQIP_MIN_W:
            tw = 24; th = max(1, round(oh * tw / ow))
            buf = io.BytesIO()
            rgb.resize((tw, th), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6)) \
               .save(buf, "WEBP", quality=55)
            lqip[stem] = base64.b64encode(buf.getvalue()).decode()
        im.close()
    return manifest, lqip


def rewrite(files, manifest):
    def mapped(name, q):
        e = manifest.get(name)
        if not e:
            return None
        sd = re.search(r"scale-down-to=(\d+)", q.replace("&amp;", "&"))
        key = sd.group(1) if sd else "full"
        if key not in e:
            key = max(e, key=lambda k: e[k][1])
        return e[key]

    def one(m):
        r = mapped(m.group(1), m.group(2))
        return r[0] if r else m.group(0)

    def srcset(m):
        out, seen = [], set()
        for part in m.group(0).split(","):
            u, _, _d = part.strip().rpartition(" ")
            mm = URL_RE.fullmatch(u.strip())
            if not mm:
                out.append(part.strip()); continue
            r = mapped(mm.group(1), mm.group(2))
            if not r or r[0] in seen:
                continue
            seen.add(r[0]); out.append(f"{r[0]} {r[1]}w")
        out.sort(key=lambda s: int(s.rsplit(" ", 1)[1][:-1]))
        return ",".join(out)

    n = 0
    for f in files:
        s = o = open(f, encoding="utf8", errors="ignore").read()
        s = SRCSET_RE.sub(srcset, s)
        s = URL_RE.sub(one, s)
        if s != o:
            open(f, "w", encoding="utf8").write(s); n += 1
    return n


def write_lqip(_unused=None):
    """LQIP se uvek regenerise iz najvece varijante u assets/images/opt/,
    pa radi i kad nema novih slika za obradu."""
    lqip = {}
    best = {}
    for f in os.listdir(OUT_DIR):
        m = re.fullmatch(r"(.+)-(\d+)\.webp", f)
        if not m:
            continue
        stem, w = m.group(1), int(m.group(2))
        if w >= best.get(stem, (0,))[0]:
            best[stem] = (w, f)
    for stem, (w, f) in best.items():
        im = Image.open(os.path.join(OUT_DIR, f)); im.load()
        if im.mode in ("RGBA", "LA") or im.size[0] < LQIP_MIN_W:
            im.close(); continue
        ow, oh = im.size
        tw = 24; th = max(1, round(oh * tw / ow))
        buf = io.BytesIO()
        im.convert("RGB").resize((tw, th), Image.LANCZOS) \
          .filter(ImageFilter.GaussianBlur(0.6)).save(buf, "WEBP", quality=55)
        lqip[stem] = base64.b64encode(buf.getvalue()).decode()
        im.close()
    _write_lqip_css(lqip)


def _write_lqip_css(lqip):
    lines = ["/* Blur placeholderi (generise scripts/optimize-images.py) */"]
    for stem, b64 in sorted(lqip.items()):
        lines.append(
            f'img[src*="opt/{stem}-"]{{background-image:url("data:image/webp;base64,{b64}");'
            f"background-size:cover;background-position:center;background-repeat:no-repeat}}")
    open("assets/lqip.css", "w", encoding="utf8").write("\n".join(lines) + "\n")


def archive_unused():
    blob = []
    for pat in ("**/*.html", "**/*.mjs", "**/*.js", "**/*.css", "**/*.json", "**/*.md"):
        for f in glob.glob(pat, recursive=True):
            if "node_modules" in f:
                continue
            blob.append(open(f, encoding="utf8", errors="ignore").read())
    used = set(re.findall(r"/assets/images/([A-Za-z0-9._-]+\.(?:jpg|jpeg|png|gif|webp|svg))",
                          "\n".join(blob)))
    os.makedirs(f"{SRC_DIR}/_originals", exist_ok=True)
    moved = 0
    for f in os.listdir(SRC_DIR):
        p = os.path.join(SRC_DIR, f)
        if os.path.isdir(p) or f in used:
            continue
        os.rename(p, os.path.join(SRC_DIR, "_originals", f)); moved += 1
    return moved


def main():
    files = target_files()
    need = collect_needed(files)
    print(f"slika za obradu: {len(need)}")
    manifest, lqip = build_variants(need)
    print(f"varijanti u {OUT_DIR}: {len(os.listdir(OUT_DIR))}")
    print(f"prepisano fajlova: {rewrite(files, manifest)}")
    write_lqip(lqip)
    print(f"assets/lqip.css: {os.path.getsize('assets/lqip.css') // 1024} KB")
    print(f"originala sklonjeno u _originals: {archive_unused()}")
    print("\nGotovo. Pokreni jos: npm run build")


if __name__ == "__main__":
    main()
