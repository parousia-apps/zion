/**
 * Lecture à voix haute.
 *
 * 1. Si la réplique a un fichier audio enregistré (champ "audio"), on le joue.
 *    C'est la solution pour les langues sans voix de synthèse (fon, yoruba,
 *    lingala...) : quelqu'un enregistre les répliques, on les dépose dans
 *    public/audio/<langue>/ et on renseigne le champ "audio".
 * 2. Sinon on utilise la synthèse vocale du navigateur (Web Speech API),
 *    gratuite et sans réseau, mais dont les voix dépendent de l'appareil.
 */

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
  speak(text: string, opts: { audio?: string; onEnd?: () => void } = {}): void {
    this.cancel();
    const token = ++this.token;
    const end = () => {
      if (token !== this.token) return;
      this.onActivity(false);
      opts.onEnd?.();
    };
    if (!this.enabled) return;
    this.onActivity(true);

    if (opts.audio) {
      this.audioEl = new Audio(opts.audio);
      this.audioEl.playbackRate = this.rate;
      this.audioEl.onended = end;
      this.audioEl.play().catch(() => this.synth(text, end));
      return;
    }
    this.synth(text, end);
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
