/**
 * Lecture à voix haute.
 *
 * 1. Si la réplique a un fichier audio enregistré (champ "audio"), on le joue.
 *    C'est la solution pour les langues sans voix de synthèse (fon, yoruba,
 *    lingala...) : quelqu'un enregistre les répliques, on les dépose dans
 *    public/audio/<langue>/ et on renseigne le champ "audio".
 * 2. Sinon, si la phrase existe dans le recueil des phrases enregistrées
 *    (public/audio/<langue>/phrases.json, généré par npm run voices), on la joue.
 * 3. Sinon on utilise la synthèse vocale du navigateur (Web Speech API),
 *    gratuite et sans réseau, mais dont les voix dépendent de l'appareil.
 */

/** Clé d'une phrase dans le recueil : même calcul que phrase_key() dans scripts/voices/generate.py. */
export function phraseKey(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[«»"“”]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.!?:;,…]+$/, '');
}

/**
 * Note de « naturel » d'une voix : on préfère les voix neuronales/premium
 * et on écarte les voix connues pour être robotiques.
 */
const GOOD = /natural|neural|premium|enhanced|amélioré|améliorée|online|google|siri/i;
const ROBOTIC = /espeak|compact|eloquence|albert|bad news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley/i;

export function voiceScore(v: SpeechSynthesisVoice, lang: string): number {
  let score = 0;
  if (GOOD.test(v.name)) score += 100;
  if (ROBOTIC.test(v.name)) score -= 200;
  if (v.lang.toLowerCase() === lang.toLowerCase()) score += 10; // fr-FR plutôt que fr-CA
  if (v.localService) score += 2;
  return score;
}

export class Speech {
  enabled = true;
  rate = 1;
  lang = 'fr-FR';
  /** voiceURI choisie dans les réglages ; vide = automatique (la meilleure). */
  voiceURI = '';
  /** Prévenu quand une voix commence ou arrête de parler (pour baisser la musique). */
  onActivity: (speaking: boolean) => void = () => {};
  private audioEl: HTMLAudioElement | null = null;
  private token = 0;
  /** Recueil des phrases enregistrées : clé → fichier mp3. */
  private phrases: Record<string, string> = {};
  phrasesLoaded = false;

  /** Charge le recueil des phrases enregistrées d'une langue (absent = synthèse seule). */
  async loadPhrases(lang: string): Promise<void> {
    this.phrases = {};
    try {
      const res = await fetch(`/audio/${lang}/phrases.json`);
      if (res.ok) this.phrases = await res.json();
      this.phrasesLoaded = true;
    } catch {
      // Pas de recueil : la synthèse vocale prend le relais.
    }
  }

  get synthAvailable(): boolean {
    return 'speechSynthesis' in window;
  }

  /** Voix disponibles pour la langue courante, de la plus naturelle à la moins naturelle. */
  voices(): SpeechSynthesisVoice[] {
    if (!this.synthAvailable) return [];
    const prefix = this.lang.split('-')[0].toLowerCase();
    return speechSynthesis
      .getVoices()
      .filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(prefix))
      .sort((a, b) => voiceScore(b, this.lang) - voiceScore(a, this.lang));
  }

  /** Une voix existe-t-elle pour la langue courante sur cet appareil ? */
  hasVoice(): boolean {
    return this.voices().length > 0;
  }

  /**
   * Lit un texte. `onEnd` est appelé à la fin de la lecture (ou tout de suite
   * si la lecture est désactivée ou impossible), jamais si elle est interrompue.
   */
  speak(text: string | string[], opts: { audio?: string; onEnd?: () => void } = {}): void {
    this.cancel();
    const token = ++this.token;
    const end = () => {
      if (token !== this.token) return;
      this.onActivity(false);
      opts.onEnd?.();
    };
    if (!this.enabled) return;
    this.onActivity(true);

    const parts = (Array.isArray(text) ? text : [text]).filter((p) => p.trim());
    if (opts.audio) {
      this.play(opts.audio, end, () => this.synth(parts.join(' '), end));
      return;
    }
    // Morceau par morceau : enregistré s'il existe, sinon synthèse vocale.
    const next = (i: number) => {
      if (token !== this.token) return;
      if (i >= parts.length) return end();
      const file = this.phrases[phraseKey(parts[i])];
      const synth = () => this.synth(parts[i], () => token === this.token && next(i + 1));
      if (file) this.play(file, () => next(i + 1), synth);
      else synth();
    };
    next(0);
  }

  private play(src: string, onEnd: () => void, onFail: () => void): void {
    const el = new Audio(src);
    this.audioEl = el;
    el.playbackRate = this.rate;
    el.onended = onEnd;
    el.play().catch(onFail);
  }

  cancel(): void {
    this.token++;
    this.onActivity(false);
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl = null;
    }
    if (this.synthAvailable) speechSynthesis.cancel();
  }

  private synth(text: string, end: () => void): void {
    if (!this.synthAvailable) return;
    const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
    u.lang = this.lang;
    // Une voix un poil plus lente sonne plus posée, moins « machine ».
    u.rate = this.rate * 0.95;
    const voices = this.voices();
    u.voice = voices.find((v) => v.voiceURI === this.voiceURI) ?? voices[0] ?? null;
    u.onend = end;
    u.onerror = end;
    speechSynthesis.speak(u);
  }
}

/** Retire ce qui ne doit pas être prononcé : guillemets décoratifs, emojis. */
function cleanForSpeech(text: string): string {
  return text
    .replace(/[«»"]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .trim();
}

export const speech = new Speech();
