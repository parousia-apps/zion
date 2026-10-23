# Zion — La cité des veilleurs

Un jeu 3D dans le navigateur, gratuit et accessible, où des histoires de la Bible font
découvrir **le caractère de Jésus**. Le joueur est un apprenti veilleur dans la cité de
Zion. Le Gardien Ezra lui raconte un récit biblique (sur un parchemin animé ou dans une
scène 3D jouable), en tire **un trait du Christ**, puis le joueur vit ce trait dans une
mission avec les habitants.

| Mission | Récit | Trait du Christ | Mission dans Zion |
|---|---|---|---|
| 1 | Le bon Samaritain (parchemin) | La compassion | Aider Naomi, tombée au marché |
| 2 | Noé (scène 3D) | La fidélité | Tenir sa promesse à Mamie Ruth avant l'orage |
| 3 | La brebis perdue (parchemin) | L'amour qui va chercher | Retrouver Timothée, isolé |
| 4 | David (scène 3D) | Regarder le cœur | Former l'équipe de musique sans oublier Élie |

Pensé pour les enfants (6-10 ans), avec une question « Pour aller plus loin » pour les
familles et les groupes. Français et anglais inclus ; prêt pour le fon, le yoruba, le lingala…

---

## Lancer le projet

Prérequis : Node.js 20 ou plus.

```bash
npm install
npm run dev
```

Puis ouvre l'adresse affichée (http://localhost:5173). Grâce à `--host`, l'adresse
« Network » fonctionne aussi depuis ton téléphone s'il est sur le même Wi-Fi.

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement avec rechargement automatique |
| `npm run build` | Vérifie le contenu + les types, puis construit `dist/` |
| `npm run preview` | Sert la version construite (pour tester comme en production) |
| `npm test` | Tests de la logique des quêtes (Vitest) |
| `npm run check:content` | Vérifie la cohérence des quêtes, mondes et traductions |
| `npm run models:fetch` | Télécharge les modèles 3D sources (voir plus bas) |
| `npm run models:build` | Optimise les modèles 3D vers `public/models/` |

---

## Comment c'est organisé

```
src/
  main.ts              Point d'entrée : écrans, réglages, navigation
  types.ts             Le « contrat » entre le contenu JSON et le moteur
  quest/QuestRunner.ts La logique des quêtes (machine à états, testée)
  game/                Tout ce qui est 3D (Three.js)
    Game.ts            Chef d'orchestre d'une partie
    World.ts           Construit un lieu : sol, ciel, décor, personnages
    Player.ts          Le personnage du joueur
    characters.ts      Les humains (modèles Quaternius habillés en tenue biblique)
    buildings.ts       Maisons, tour, remparts… construits en code
    models.ts          L'« aiguilleur » : quel modèle pour quel objet
    textures.ts        Textures dessinées en code (pierre, enduit, herbe…)
    assets.ts          Chargement des fichiers .glb
    Effects.ts         Pluie, arc-en-ciel, colombe, confettis…
    Input.ts           Clavier, joystick tactile, toucher le sol
    Engine.ts          Renderer, caméra, boucle d'animation
  core/                Services : traductions, sauvegarde, voix, sons, musique
  ui/                  Interface HTML (dialogues, parchemin, HUD)
  content/             TOUT le contenu (à modifier sans toucher au code)
    quests/*.json      Structure des quêtes (étapes, personnages)
    worlds/*.json      Les lieux (Zion, Noé, David)
    i18n/<langue>/     Les textes, une langue par dossier
```

### Les idées clés, avec des analogies de développeuse

- **Le contenu est séparé du code**, comme une API sépare les données de l'affichage.
  On écrit une quête en JSON ; le moteur la « rend ».
- **Le QuestRunner est un reducer** (comme Redux) : il reçoit des événements (« le joueur
  a parlé à Noé », « il est entré dans la zone de l'arche ») et renvoie une liste d'actions
  (« afficher ce dialogue », « passer à l'étape suivante »). Il ne connaît ni la 3D ni le
  HTML, donc il est testable avec Vitest (`src/quest/QuestRunner.test.ts`).
- **Game.ts exécute les actions dans une file** (une chaîne de Promises) : un dialogue doit
  être fini avant que l'étape suivante ne s'affiche.
- **Les textes sont à part** (`content/i18n/fr/...`), comme les fichiers de traduction
  d'i18next : traduire ne demande jamais de toucher à la structure.
- **Toute l'interface est en vrai HTML** par-dessus la 3D : lecteurs d'écran, clavier,
  zoom et grand texte fonctionnent naturellement.

---

## Ajouter une quête (pas à pas)

1. **Choisis un identifiant**, par exemple `zachee`.
2. **Crée la structure** `src/content/quests/zachee.json` en t'inspirant de `cherche.json` :

```json
{
  "id": "zachee",
  "order": 5,
  "icon": "🌳",
  "traitIcon": "🤝",
  "color": "#e8590c",
  "chapters": [
    {
      "world": "zion",
      "entities": [
        { "id": "zachee", "model": "person", "pos": [12, 6],
          "look": { "base": "man2", "tunic": "#7c4dff", "height": 0.85 } }
      ],
      "steps": [
        { "id": "intro", "type": "talk", "target": "gardien", "dialog": "intro" },
        { "id": "story", "type": "scroll", "scroll": "story" },
        { "id": "trait", "type": "trait" },
        { "id": "visit", "type": "talk", "target": "zachee", "dialog": "visit" },
        { "id": "debrief", "type": "talk", "target": "gardien", "dialog": "debrief" }
      ]
    }
  ]
}
```

3. **Écris les textes** dans `src/content/i18n/fr/quests/zachee.json` (copie `cherche.json`
   et remplace) : `title`, `summary`, `reference`, `trait`, `names`, `objectives`
   (une phrase par id d'étape), `dialogs`, `scrolls`, `ending`.
4. **Vérifie** : `npm run check:content`. Le script signale toute cible, zone ou
   dialogue manquant, et toute traduction incomplète.
5. Lance `npm run dev` : la quête apparaît automatiquement dans la liste.

### Les 7 types d'étape

| Type | Ce que fait le joueur | Champs |
|---|---|---|
| `scene` | Écoute un dialogue | `dialog` |
| `scroll` | Lit le parchemin du récit biblique | `scroll` |
| `trait` | Découvre la carte du trait du Christ | — |
| `talk` | Parle à quelqu'un | `target`, `dialog` |
| `interact` | Utilise un objet (ex. la harpe) | `target`, `dialog` |
| `gather` | Amène des personnages/animaux dans une zone | `targets`, `zone`, `pickupDialog(s)`, `dialog` |
| `reach` | Va à un endroit | `zone`, `dialog` |

Chaque étape peut aussi faire apparaître (`show`), disparaître (`hide`) ou déplacer
(`moves`) des personnages, et lancer un dialogue dès le début (`startDialog`).

Dans un dialogue, chaque réplique peut déclencher un effet (`"fx": "rain"`,
`rainbow`, `dove`, `harp`, `celebrate`, `glow`, `heal`, `sunset`) ou un son
(`"snd": "bleat"`, `cry`, `thunder`, `drum`, `bell`, `chime`).

### Une scène 3D jouable plutôt qu'un parchemin

Ajoute un chapitre avec un autre monde (voir `fidelite.json` : chapitre Zion → chapitre
`noe` → retour à Zion). Pour créer un nouveau lieu, copie `src/content/worlds/david.json`
et ajoute ses noms dans `i18n/<langue>/worlds/`.

### Apparence des personnages

```json
"look": { "base": "man", "tunic": "#1a237e", "accent": "#ffc21a",
          "beard": "#e8e8e8", "skin": "#7a4a2a", "scarf": "#9c27b0",
          "height": 0.8, "staff": true, "wheelchair": false }
```

`base` : `man` (barbu), `man2`, `woman`. `height` < 0,9 = enfant. `scarf` ajoute un voile.

---

## Ajouter une langue (fon, yoruba, lingala…)

1. Copie le dossier `src/content/i18n/fr/` en `src/content/i18n/fon/`.
2. Traduis les **valeurs** (jamais les clés, ni les champs `who`, `fx`, `snd`).
3. Déclare la langue dans `src/core/i18n.ts`, tableau `LANGUAGES` (des exemples sont en commentaire).
4. `npm run check:content` vérifie que chaque dialogue a le même nombre de répliques
   et les mêmes effets qu'en français. Ce qui n'est pas encore traduit s'affiche en français.

### Voix enregistrées (recommandé pour les langues sans voix de synthèse)

Les téléphones n'ont presque jamais de voix de synthèse en fon, yoruba ou lingala.
Chaque réplique accepte un fichier audio enregistré :

```json
{ "who": "gardien", "text": "…", "audio": "/audio/fon/compassion-welcome-1.mp3" }
```

Dépose les fichiers dans `public/audio/fon/`. S'il y a un fichier, il est joué à la place
de la synthèse vocale. C'est aussi la meilleure solution pour des voix chaleureuses en
français : des membres de ta communauté peuvent enregistrer les répliques.

---

## Les modèles 3D

Les modèles viennent de **Quaternius** (licence CC0, voir `CREDITS.md`). La liste avec
source et licence est dans `scripts/models.json`.

Les fichiers optimisés sont déjà dans `public/models/` : rien à faire pour jouer.
Pour en ajouter un :

1. Ajoute une entrée dans `scripts/models.json` (nom, URL du .glb, licence, animations à garder).
2. `npm run models:fetch` puis `npm run models:build` (divise le poids par 3 à 10).
3. Dans `src/game/models.ts`, associe-le à un type (`ASSETS`) et donne sa hauteur réelle (`HEIGHT`).

Si un modèle ne charge pas (réseau coupé), une forme de secours construite en code
s'affiche : le jeu reste jouable.

---

## Accessibilité

- **Vue** : textes et menus en HTML (lecteurs d'écran), 3 tailles de texte, contraste
  élevé, police Atkinson Hyperlegible (conçue pour les personnes malvoyantes).
- **Orientation sans la vue** : « Où aller ? » (touche O) décrit la direction en mots ;
  « Guide-moi » (touche G) marche automatiquement vers l'objectif en contournant les
  obstacles ; un bip stéréo indique de quel côté se trouve l'objectif.
- **Audition** : tous les dialogues sont écrits ; les bruitages et la musique ont des
  sous-titres (« [La pluie tombe] »).
- **Lecture** : lecture à voix haute automatique (voix la plus naturelle de l'appareil,
  au choix dans les Réglages), vitesse réglable, bouton « Réécouter ».
- **Moteur et cognitif** : pas de chrono ni d'échec, avance automatique possible, grandes
  cibles tactiles, « toucher le sol pour y aller ».
- **Animations** : « Réduire les animations » (et respect de `prefers-reduced-motion`).
- Les préférences du système (contraste, animations) sont appliquées dès le premier lancement.

## Performance (téléphones d'entrée de gamme)

- Résolution adaptative : si le téléphone peine, l'image devient un peu plus floue mais reste fluide.
- Mode économie : pas d'ombres réelles, moins d'herbe, résolution réduite.
- Les animations des personnages éloignés ne sont pas calculées.
- Les modèles sont compressés (meshopt) et chargés lieu par lieu.
- Tout s'arrête quand l'onglet est caché.

---

## Déployer sur Vercel

1. Pousse le projet sur GitHub.
2. Sur vercel.com : « Add New Project » → importe le dépôt. Vercel détecte Vite ;
   `vercel.json` précise déjà la commande de build et le cache des fichiers.
3. Chaque `git push` redéploie automatiquement.

Aucun serveur, aucune base de données : la progression est sauvegardée dans le
`localStorage` du navigateur, sans compte et sans donnée personnelle envoyée.

---

## Monétiser sans trahir la mission (pistes)

- Garder le jeu **gratuit, sans publicité ni pistage** : c'est un gage de confiance pour
  les parents et les églises.
- **Dons** (bouton « Soutenir le projet » dans les crédits) ou mécénat d'églises et d'associations.
- **Licences pour églises et écoles** : version avec livret d'animation, fiches pour
  l'école du dimanche, impression des cartes « traits du Christ ».
- **Nouvelles missions et langues financées** par une communauté (financement participatif).
- **Produits dérivés pédagogiques** : coloriages, cartes, livret de discussion en famille.

## Limites connues

- La qualité de la voix dépend de l'appareil (voir les astuces dans Réglages › Lecture).
- Pas de mode hors ligne (PWA) pour l'instant : il faut une connexion au premier chargement.
- Les personnages viennent de modèles modernes rhabillés en code : de près, les tuniques
  restent simples (pas de tissu animé).
- Testé dans Chrome et dans un téléphone émulé ; à vérifier sur de vrais téléphones,
  surtout d'entrée de gamme et sur iPhone (Safari).
# zion
