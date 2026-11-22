#!/usr/bin/env python3
"""Assemble O'Guide into dist/: index.html (tout en ligne), sw.js, manifest, icônes."""
import base64, json, pathlib, shutil

ROOT = pathlib.Path(__file__).parent
SRC, NM = ROOT / "src", ROOT / "node_modules"
DIST = ROOT / "docs"          # version web (GitHub Pages)
WWW = ROOT / "www"            # contenu embarqué dans l'appli Android
for d in (DIST, WWW):
    if d.exists():
        shutil.rmtree(d)
    d.mkdir()

leaflet_css = (NM / "leaflet/dist/leaflet.css").read_text()
leaflet_js = (NM / "leaflet/dist/leaflet.js").read_text().replace("//# sourceMappingURL=leaflet.js.map", "")
f400 = base64.b64encode((NM / "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2").read_bytes()).decode()
f700 = base64.b64encode((NM / "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2").read_bytes()).decode()

fonts = (
    "@font-face{font-family:'Atkinson';src:url(data:font/woff2;base64,%s) format('woff2');font-weight:400;font-display:swap}"
    "@font-face{font-family:'Atkinson';src:url(data:font/woff2;base64,%s) format('woff2');font-weight:700;font-display:swap}"
) % (f400, f700)

# app.js + live.js (courses organisées, suivi) insérés avant le démarrage, dans la même portée
APP = (SRC / "app.js").read_text()
_mark = "\n/* ---------------- Démarrage ---------------- */"
assert _mark in APP
APP = APP.replace(_mark, "\n" + (SRC / "live.js").read_text() + _mark, 1)

html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="description" content="Course d'orientation accessible aux personnes non-voyantes et malvoyantes : création de parcours GPS, guidage vocal, signal d'approche, export GPX.">
<title>O'Guide – Course d'orientation accessible</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" sizes="180x180" href="icon-180.png">
<meta name="apple-mobile-web-app-title" content="O'Guide">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<style>{leaflet_css}</style>
<style>{fonts}
{(SRC / "style.css").read_text()}</style>
</head>
<body>
{(SRC / "body.html").read_text()}
<script>{leaflet_js}</script>
<script>{(NM / "@capacitor/core/dist/capacitor.js").read_text()}</script>
<script>{(NM / "qrcode-generator/dist/qrcode.js").read_text()}</script>
<script>{APP}</script>
</body>
</html>
"""
(DIST / "index.html").write_text(html)

icon_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#000"/><rect x="96" y="96" width="320" height="320" rx="20" fill="#fff"/><polygon points="96,96 416,96 416,416" fill="#FF7A00"/><rect x="96" y="96" width="320" height="320" rx="20" fill="none" stroke="#FFD400" stroke-width="24"/></svg>"""
(DIST / "icon.svg").write_text(icon_svg)

try:
    from PIL import Image, ImageDraw
    for size in (180, 192, 512):
        s = size / 512
        im = Image.new("RGBA", (size, size), (0, 0, 0, 255))
        d = ImageDraw.Draw(im)
        d.rectangle([96 * s, 96 * s, 416 * s, 416 * s], fill=(255, 255, 255))
        d.polygon([(96 * s, 96 * s), (416 * s, 96 * s), (416 * s, 416 * s)], fill=(255, 122, 0))
        w = max(2, int(24 * s))
        d.rectangle([96 * s, 96 * s, 416 * s, 416 * s], outline=(255, 212, 0), width=w)
        im.save(DIST / f"icon-{size}.png")
except ImportError:
    print("PIL absent : icônes PNG non générées")

manifest = {
    "name": "O'Guide – Course d'orientation accessible",
    "short_name": "O'Guide",
    "description": "Création de parcours GPS et guidage vocal pour la course d'orientation des personnes déficientes visuelles.",
    "lang": "fr",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#000000",
    "theme_color": "#000000",
    "icons": [
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        {"src": "icon.svg", "sizes": "any", "type": "image/svg+xml"},
    ],
}
(DIST / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))

sw = """// O'Guide – service worker : l'appli fonctionne hors connexion une fois ouverte.
const CACHE = 'oguide-v1.5.1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // fonds de carte : réseau direct
  if (req.mode === 'navigate') { // page : la dernière version si le réseau répond vite, sinon celle gardée hors ligne
    e.respondWith(caches.open(CACHE).then(async c => {
      try {
        const r = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('lent')), 4000))]);
        if (r && r.ok) c.put('./index.html', r.clone());
        return r;
      } catch (err) { return (await c.match('./index.html')) || (await c.match(req, { ignoreSearch: true })) || Response.error(); }
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
"""
(DIST / "sw.js").write_text(sw)

readme = """O'Guide – course d'orientation accessible
==========================================

Contenu : index.html (toute l'appli), sw.js (hors connexion), manifest.webmanifest + icônes (installation).

L'appli doit être servie en HTTPS pour accéder au GPS. Hébergement gratuit le plus simple :
1. Crée un compte sur github.com, puis un dépôt public (ex. « oguide »).
2. « Add file » > « Upload files » : glisse les 6 fichiers de ce dossier, puis « Commit changes ».
3. Settings > Pages > Source : « Deploy from a branch », branche « main », dossier « / (root) » > Save.
4. Après 1 à 2 minutes, l'appli est en ligne sur https://TON-PSEUDO.github.io/oguide/
5. Sur le téléphone : ouvre ce lien dans Chrome (Android) ou Safari (iPhone), puis « Installer l'appli » / « Sur l'écran d'accueil ».

Mise à jour : remplace index.html dans le dépôt et change le numéro dans sw.js (CACHE = 'oguide-v1.0.1').
"""
(DIST / "LISEZMOI.txt").write_text(readme)
(DIST / "LISEZMOI.txt").unlink()
(DIST / ".nojekyll").write_text("")
shutil.copy(DIST / "index.html", WWW / "index.html")
print("OK docs:", sorted(p.name for p in DIST.iterdir()), "| www:", sorted(p.name for p in WWW.iterdir()), round((WWW / "index.html").stat().st_size / 1024), "Ko")
