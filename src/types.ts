/**
 * Types partagés : c'est le « contrat » entre les fichiers JSON de contenu
 * (quêtes, mondes, textes) et le moteur du jeu.
 *
 * Règle d'or : la STRUCTURE (positions, étapes, effets) vit dans
 * src/content/quests et src/content/worlds ; le TEXTE (dialogues, noms)
 * vit dans src/content/i18n/<langue>. Un·e traducteur·rice ne touche
 * qu'aux fichiers de texte.
 */

/** Position au sol : [x, z]. x vers la droite de l'écran, z vers le bas de l'écran. */
export type Vec2 = [number, number];

/** Tous les modèles 3D que l'on sait fabriquer en code (voir game/models.ts). */
export type ModelKind =
  // êtres vivants (modèles Quaternius, sauf la colombe)
  | 'person' | 'sheep' | 'donkey' | 'horse' | 'deer' | 'stag' | 'zebra' | 'dove'
  // anciennes formes en code, gardées pour compatibilité
  | 'goat' | 'elephant' | 'giraffe' | 'rabbit'
  // nature
  | 'tree' | 'palm' | 'olive' | 'rock' | 'bush' | 'flowers' | 'water' | 'road' | 'plaza'
  // constructions et objets
  | 'house' | 'tower' | 'stall' | 'market' | 'ark' | 'pen' | 'well' | 'fountain' | 'tent'
  | 'harp' | 'stage' | 'ramp' | 'lamp' | 'cart' | 'barrel' | 'crate' | 'bench' | 'bag'
  // signes du Royaume
  | 'mustard' | 'vine' | 'wheat' | 'stele'
  // conte d'Amani : cases rondes, statue de Môté, étoile, voix du ciel, nuages du rêve
  | 'hut' | 'statue' | 'star' | 'orb' | 'cloudpuff';

/** Effets visuels + sonores déclenchés par une réplique de dialogue (champ "fx"). */
export type EffectName = 'rain' | 'rainbow' | 'dove' | 'harp' | 'celebrate' | 'glow' | 'heal' | 'sunset' | 'storm' | 'calm';

/** Sons ponctuels (champ "snd" d'une réplique, ou balise sonore d'une étape). */
export type SoundName = 'bleat' | 'cry' | 'chime' | 'thunder' | 'drum' | 'bell' | 'ping';

/** Apparence d'un personnage. Toutes les couleurs sont au format CSS "#rrggbb". */
export interface PersonLook {
  /** Modèle de base : homme barbu, homme, femme, personne voilée (voir game/characters.ts). */
  base?: 'man' | 'man2' | 'woman';
  tunic: string;
  accent?: string;
  skin?: string;
  hair?: string;
  beard?: string;
  scarf?: string;
  staff?: boolean;
  lantern?: boolean;
  wheelchair?: boolean;
  lying?: boolean;
  /** 1 = adulte, ~0.8 = enfant */
  height?: number;
}

/** Un élément avec qui le joueur peut interagir (personnage, animal, objet). */
export interface EntityDef {
  id: string;
  model: ModelKind;
  pos: Vec2;
  /** Orientation en degrés. 0 = regarde vers la caméra, 180 = dos à la caméra. */
  rot?: number;
  scale?: number;
  look?: PersonLook;
  color?: string;
  /** Invisible au départ ; une étape le fera apparaître avec "show". */
  hidden?: boolean;
  /** Distance d'interaction personnalisée (sinon calculée selon le modèle). */
  reach?: number;
  /** Rayon de promenade au repos (animaux, passants). 0 ou absent = immobile. */
  wander?: number;
  /** Pierre gravée (model "stele") : symbole et référence. */
  stele?: SteleInfo;
}

/** Décor non interactif (arbres, maisons...). */
export interface PropDef {
  model: ModelKind;
  pos: Vec2;
  rot?: number;
  scale?: number;
  color?: string;
  /** Pour les routes et plans d'eau : [largeur, longueur]. */
  size?: Vec2;
}

/** Pour une pierre gravée : le symbole doré et la référence écrite dessus. */
export interface SteleInfo {
  symbol: 'light' | 'water' | 'shepherd' | 'vine' | 'seed';
  label: string;
}

/** Zone circulaire au sol (destination d'une étape "reach" ou "gather"). */
export interface ZoneDef {
  id: string;
  pos: Vec2;
  radius: number;
  /** Les entités livrées ici entrent dans la zone puis disparaissent (ex. : l'arche). */
  absorb?: boolean;
}

/** Déplacement scripté d'une entité au début d'une étape. */
export interface MoveDef {
  id: string;
  to: Vec2;
  hide?: boolean;
  speed?: number;
}

interface StepCommon {
  /** Identifiant unique dans la quête ; sert de clé pour le texte de l'objectif. */
  id: string;
  /** Dialogue joué dès le début de l'étape. */
  startDialog?: string;
  show?: string[];
  hide?: string[];
  moves?: MoveDef[];
}

/**
 * Les 7 types d'étape. Pour en ajouter un, voir quest/QuestRunner.ts.
 * - scene    : un dialogue se joue, puis on passe à la suite
 * - scroll   : le parchemin animé raconte une histoire biblique
 * - trait    : la carte du trait du Christ est révélée
 * - talk     : parler à quelqu'un
 * - interact : utiliser un objet (même logique que talk, verbe différent)
 * - gather   : amener une ou plusieurs entités dans une zone (elles suivent le joueur)
 * - reach    : se rendre dans une zone
 */
export type StepDef =
  | (StepCommon & { type: 'scene'; dialog: string })
  | (StepCommon & { type: 'scroll'; scroll: string })
  | (StepCommon & { type: 'trait' })
  | (StepCommon & { type: 'talk' | 'interact'; target: string; dialog?: string })
  | (StepCommon & {
      type: 'gather';
      targets: string[];
      zone: string;
      /** Dialogue joué au tout premier ramassage. */
      pickupDialog?: string;
      /** Dialogue propre à chaque cible : { "elie": "elie" }. Prioritaire sur pickupDialog. */
      pickupDialogs?: Record<string, string>;
      dialog?: string;
      beacon?: SoundName;
    })
  | (StepCommon & { type: 'reach'; zone: string; dialog?: string });

export interface Environment {
  /** Dégradé du ciel : [haut, horizon]. */
  sky: [string, string];
  /** Monde de rêve : des nuages à la place des collines. */
  dream?: boolean;
  ground: string;
  /** Rayon de la zone où le joueur peut marcher. */
  radius: number;
  /** Remparts circulaires (la cité de Zion). gate = angle de la porte en degrés. */
  walls?: { radius: number; gate: number };
}

export interface WorldDef {
  id: string;
  /** true = c'est un « souvenir » (scène biblique) : cadre doré à l'écran. */
  souvenir?: boolean;
  environment: Environment;
  player: { pos: Vec2; rot?: number; look: PersonLook };
  props: PropDef[];
  entities: EntityDef[];
  zones: ZoneDef[];
}

export interface ChapterDef {
  world: string;
  /** Ciel, sol… propres à ce chapitre (ex. la même ville sous l'orage puis au matin). */
  env?: Partial<Environment>;
  /** Météo qui dure tout le chapitre. */
  weather?: 'rain' | 'storm';
  /** Position de départ du joueur dans ce chapitre (sinon celle du monde). */
  player?: { pos: Vec2; rot?: number };
  /** Entités propres à cette quête, ajoutées au monde. */
  entities?: EntityDef[];
  zones?: ZoneDef[];
  steps: StepDef[];
}

export interface QuestDef {
  id: string;
  order: number;
  /** Emoji de la carte de quête (illustration, pas d'information essentielle). */
  icon: string;
  traitIcon: string;
  color: string;
  chapters: ChapterDef[];
}

/* ------------------------------------------------------------------ */
/* Textes (un jeu de fichiers par langue)                               */
/* ------------------------------------------------------------------ */

export interface DialogLine {
  /** Qui parle : id d'entité, "player" ou "narrator". */
  who: string;
  text: string;
  fx?: EffectName;
  snd?: SoundName;
  /** Fichier audio enregistré (dans public/audio/...) joué à la place de la synthèse vocale. */
  audio?: string;
}

export interface ScrollPanel {
  icon: string;
  text: string;
  audio?: string;
}

export interface QuestText {
  title: string;
  summary: string;
  reference: string;
  trait: {
    name: string;
    description: string;
    /** Comment Jésus vit ce trait. */
    jesus: string;
    jesusRef: string;
  };
  names: Record<string, string>;
  /** Verbe du bouton d'action, ex. { "naomi": "Aider Naomi" }. */
  verbs?: Record<string, string>;
  objectives: Record<string, string>;
  dialogs: Record<string, DialogLine[]>;
  scrolls?: Record<string, { title: string; reference: string; panels: ScrollPanel[] }>;
  /** Répliques quand on parle à quelqu'un qui n'est pas l'objectif. */
  idle?: Record<string, DialogLine[]>;
  ending: { message: string; reflection: string };
  /** Prolonger la mission dans la vraie vie (voir ui/Life.ts). */
  life?: QuestLife;
}

export interface QuestLife {
  /** Passage à lire dans sa Bible, et comment le trouver. */
  bibleRef: string;
  /** Référence pour le lien de lecture en ligne (ex. « Luc 10:25-37 »). */
  bibleQuery: string;
  bibleWhere: string;
  /** Question du Gardien après la lecture. */
  bibleQuestion: string;
  prayer: string;
  /** Le défi du veilleur pour la semaine. */
  challenge: string;
  /** Ce que le Gardien demande au retour du joueur. */
  followup: string;
  /** Verset à mémoriser (Louis Segond 1910 / World English Bible, domaine public). */
  verse: string;
  verseRef: string;
  /** Questions de discussion pour la veillée en famille (des plus petits aux adultes). */
  family: string[];
  /** Activité à faire ensemble. */
  activity: string;
}

export interface WorldText {
  name: string;
  names: Record<string, string>;
  verbs?: Record<string, string>;
  idle?: Record<string, DialogLine[]>;
}
