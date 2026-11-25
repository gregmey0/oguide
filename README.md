# O'Guide – course d'orientation accessible

Application de course d'orientation pour personnes **non-voyantes et malvoyantes** :

- **Deux interfaces** au choix à l'ouverture : **grands boutons** (déficience visuelle, tout est lu à voix haute) ou **compacte** (un accompagnant utilise les menus ; le guidage de l'épreuve reste vocal). Le choix peut être retenu ou changé dans les Réglages ou avec le bouton ↔ de l'accueil. Les activités en cours restent en haut de l'accueil, le reste est dans **🗂 Historique**.
- **Création de parcours** sur le terrain : départ, balises, arrivée enregistrés au GPS (position moyennée), indice facultatif lu à l'approche.
- **Guidage** : distance et azimut (ou direction horaire) annoncés à intervalle régulier, bips d'approche qui accélèrent, validation automatique de la balise, carte très contrastée pour les malvoyants.
- **Mode poche** : écran tactile verrouillé, le guidage continue.
- **Partage** des parcours et des résultats en **GPX** (import / export).
- **Impression** : carte du parcours en A4 (PDF ou image PNG), grands symboles contrastés, balises et indices, et style « chemins seuls, noir sur blanc » pour papier thermogonflé (carte en relief).
- **Courses organisées** : l'organisateur crée une course (code + QR code), donne le départ groupé ou laisse partir chacun, suit tous les coureurs sur la carte en direct (balises, temps, batterie, alertes), puis classement, CSV, traces GPX et replay. Chaque coureur garde son guidage O'Guide.
- **Suivi en pratique libre** : l'encadrant crée une séance sans parcours ; les pratiquants rejoignent et rangent leur téléphone, il les suit en direct puis en replay (distance, vitesse, bilan CSV, traces GPX).
- **Messages et SOS discrets** : bouton 💬 pendant l'épreuve ou le suivi, messages rapides aux organisateurs et alerte 🆘 avec position ; les messages reçus sont lus à voix haute. Côté organisation : réponse à tous ou à une personne, prise en charge des alertes, plusieurs organisateurs (lien organisateur), vitesses, distances et temps par tronçon, alerte quand un coureur arrête de lui-même, fond de carte au choix.
- **Compatible Shadow CO** : même relais chiffré, des coureurs voyants (Shadow CO) et non-voyants ou malvoyants (O'Guide) peuvent faire la même course en ordre imposé.

## Installer

- **Android** : télécharger [OGuide.apk](../../releases/latest/download/OGuide.apk) depuis le téléphone, l'ouvrir et autoriser l'installation. Dans l'appli Android, le guidage continue téléphone verrouillé.
- **Web (tout téléphone)** : https://gregmey0.github.io/oguide/ puis « Installer l'appli » / « Sur l'écran d'accueil ». L'écran doit rester allumé pendant l'épreuve.

## Développement

- Sources : `src/` (`app.js`, `live.js` pour les courses organisées et le suivi, `style.css`, `body.html`). `python3 build.py` produit `docs/` (version web, GitHub Pages) et `www/` (contenu de l'appli).
- Android : projet Capacitor dans `android/`. Chaque push sur `main` compile l'APK (GitHub Actions) et le publie dans **Releases**.
- La clé `android/app/oguide-sideload.jks` est volontairement publique : elle sert seulement à ce que chaque nouvelle version s'installe par-dessus la précédente sans perdre les parcours. Pour une diffusion sur le Play Store, en créer une nouvelle et la garder secrète.

Fonds de carte : © OpenStreetMap, © IGN Géoplateforme, OpenTopoMap. Police : Atkinson Hyperlegible.
