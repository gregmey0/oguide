# O'Guide – course d'orientation accessible

Application de course d'orientation pour personnes **non-voyantes et malvoyantes** :

- **Création de parcours** sur le terrain : départ, balises, arrivée enregistrés au GPS (position moyennée), indice facultatif lu à l'approche.
- **Guidage** : distance et azimut (ou direction horaire) annoncés à intervalle régulier, bips d'approche qui accélèrent, validation automatique de la balise, carte très contrastée pour les malvoyants.
- **Mode poche** : écran tactile verrouillé, le guidage continue.
- **Partage** des parcours et des résultats en **GPX** (import / export).

## Installer

- **Android** : télécharger [OGuide.apk](../../releases/latest/download/OGuide.apk) depuis le téléphone, l'ouvrir et autoriser l'installation. Dans l'appli Android, le guidage continue téléphone verrouillé.
- **Web (tout téléphone)** : https://gregmey0.github.io/oguide/ puis « Installer l'appli » / « Sur l'écran d'accueil ». L'écran doit rester allumé pendant l'épreuve.

## Développement

- Sources : `src/` (`app.js`, `style.css`, `body.html`). `python3 build.py` produit `docs/` (version web, GitHub Pages) et `www/` (contenu de l'appli).
- Android : projet Capacitor dans `android/`. Chaque push sur `main` compile l'APK (GitHub Actions) et le publie dans **Releases**.
- La clé `android/app/oguide-sideload.jks` est volontairement publique : elle sert seulement à ce que chaque nouvelle version s'installe par-dessus la précédente sans perdre les parcours. Pour une diffusion sur le Play Store, en créer une nouvelle et la garder secrète.

Fonds de carte : © OpenStreetMap, © IGN Géoplateforme, OpenTopoMap. Police : Atkinson Hyperlegible.
