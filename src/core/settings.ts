/**
 * Réglages d'accessibilité et de confort.
 * Ils sont appliqués au document sous forme d'attributs/classes CSS
 * (voir styles/main.css : [data-text], .hc, .rm).
 */

export type TextSize = 'm' | 'l' | 'xl';

export interface Settings {
  lang: string;
  textSize: TextSize;
  highContrast: boolean;
  reduceMotion: boolean;
  /** Lecture à voix haute des dialogues (synthèse vocale ou fichiers audio). */
  readAloud: boolean;
  speechRate: number;
  /** voiceURI d'une voix précise ; vide = la plus naturelle disponible. */
  voice: string;
  /** Passe à la réplique suivante quand la lecture est finie. */
  autoAdvance: boolean;
  sfx: boolean;
  music: boolean;
  /** Volume de la musique, de 0 à 1. */
  musicVolume: number;
  /** Bip sonore qui indique la direction de l'objectif (gauche/droite). */
  beacon: boolean;
  /** Sous-titres des bruitages : [Pluie], [Bêlement]... */
  captions: boolean;
  lowQuality: boolean;
  /** L'écran de premier lancement a été vu. */
  setupDone: boolean;
}

const media = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;

export function defaultSettings(): Settings {
  return {
    lang: 'fr',
    textSize: 'm',
    // On respecte les préférences du système dès le premier lancement.
    highContrast: media('(prefers-contrast: more)'),
    reduceMotion: media('(prefers-reduced-motion: reduce)'),
    readAloud: true,
    speechRate: 1,
    voice: '',
    autoAdvance: false,
    sfx: true,
    music: true,
    musicVolume: 0.3,
    beacon: true,
    captions: true,
    lowQuality: false,
    setupDone: false,
  };
}

export function applySettingsToDocument(s: Settings): void {
  const root = document.documentElement;
  root.dataset.text = s.textSize;
  root.classList.toggle('hc', s.highContrast);
  root.classList.toggle('rm', s.reduceMotion);
  root.lang = s.lang;
}
