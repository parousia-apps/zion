import { audio } from './audio';

/**
 * Musique de fond générative (aucun fichier audio).
 *
 * Analogie : un musicien qui improvise sur une grille d'accords.
 * - une nappe douce joue chaque accord pendant deux mesures ;
 * - une basse marque les temps forts ;
 * - une « harpe » improvise une mélodie sur des notes qui sonnent toujours
 *   bien ensemble (gamme pentatonique).
 *
 * Chaque ambiance (mood) a son tempo, sa grille et sa luminosité.
 * La musique baisse automatiquement quand une voix parle (duck).
 */

export type Mood = 'menu' | 'zion' | 'souvenir' | 'joy';

interface MoodDef {
  bpm: number;
  /** Accords en notes MIDI (60 = do central). */
  chords: number[][];
  /** Notes autorisées pour la mélodie. */
  scale: number[];
  /** Probabilité de jouer une note de mélodie sur chaque croche. */
  density: number;
  /** Fréquence de coupure du filtre de la nappe : plus haut = plus brillant. */
  bright: number;
  /** Volume du chœur (« aah » chanté) : 0 = pas de chœur. */
  choir: number;
}

const MOODS: Record<Mood, MoodDef> = {
  // Do – La mineur – Fa – Sol : accueillant
  menu: { bpm: 72, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], scale: [72, 74, 76, 79, 81, 84], density: 0.32, bright: 1600, choir: 0.6 },
  // Do – Sol – La mineur – Fa : lumineux, la cité
  zion: { bpm: 80, chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], scale: [72, 74, 76, 79, 81], density: 0.38, bright: 1900, choir: 0.35 },
  // Ré mineur – Do – Si bémol – Do : un peu ancien, pour les récits bibliques
  souvenir: { bpm: 64, chords: [[62, 65, 69], [60, 64, 67], [58, 62, 65], [60, 64, 67]], scale: [74, 76, 77, 79, 81, 84], density: 0.26, bright: 1300, choir: 0.9 },
  // Fa – Do – Sol – Do : fête
  joy: { bpm: 96, chords: [[53, 57, 60], [60, 64, 67], [55, 59, 62], [60, 64, 67]], scale: [72, 74, 76, 79, 81, 84], density: 0.55, bright: 2400, choir: 0.5 },
};

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Music {
  enabled = true;
  private volume = 0.3;
  private ducked = false;
  private mood: Mood | null = null;
  private bus: GainNode | null = null;
  private timer = 0;
  private nextTime = 0;
  private eighth = 0;
  private lastNote = 76;
  private plucks = new Map<number, AudioBuffer>();

  play(mood: Mood): void {
    if (this.mood === mood && this.timer) return;
    this.mood = mood;
    if (!this.enabled) return;
    const ctx = audio.context;
    if (!ctx) return; // pas encore de geste utilisateur : on rejouera après unlock()
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = 0;
      // Son direct + réverbération (comme si la musique jouait dans une grande salle de pierre).
      this.bus.connect(audio.output!);
      const reverb = ctx.createConvolver();
      reverb.buffer = impulse(ctx, 3.2);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      this.bus.connect(reverb).connect(wet).connect(audio.output!);
    }
    this.applyGain(1.2);
    if (!this.timer) {
      this.nextTime = ctx.currentTime + 0.1;
      this.eighth = 0;
      // Planificateur : toutes les 100 ms, on programme les notes des 400 ms à venir.
      // (Les timers JS sont imprécis ; l'horloge audio, elle, est exacte.)
      this.timer = window.setInterval(() => this.schedule(), 100);
    }
  }

  /** Relance l'ambiance en cours (après le premier geste, ou réactivation). */
  resume(): void {
    if (this.mood) {
      const m = this.mood;
      this.mood = null;
      this.play(m);
    }
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    if (this.bus && audio.context) this.bus.gain.setTargetAtTime(0, audio.context.currentTime, 0.3);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.resume();
    else this.stop();
  }

  setVolume(v: number): void {
    this.volume = v;
    this.applyGain(0.3);
  }

  private songPlaying = false;

  /** Un chant du lecteur joue : la musique d'ambiance se tait, puis revient après. */
  setSongPlaying(on: boolean): void {
    this.songPlaying = on;
    this.applyGain(1);
  }

  /** Baisse la musique pendant qu'une voix parle. */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.applyGain(0.4);
  }

  private applyGain(seconds: number): void {
    const ctx = audio.context;
    if (!this.bus || !ctx) return;
    const target = this.enabled && !this.songPlaying ? this.volume * (this.ducked ? 0.35 : 1) : 0;
    this.bus.gain.cancelScheduledValues(ctx.currentTime);
    this.bus.gain.setTargetAtTime(target, ctx.currentTime, seconds / 3);
  }

  private schedule(): void {
    const ctx = audio.context;
    if (!ctx || !this.mood || !this.bus) return;
    const m = MOODS[this.mood];
    const step = 60 / m.bpm / 2; // durée d'une croche
    while (this.nextTime < ctx.currentTime + 0.4) {
      this.playEighth(m, this.nextTime, step);
      this.nextTime += step;
      this.eighth++;
    }
  }

  private playEighth(m: MoodDef, time: number, step: number): void {
    const pos = this.eighth % 16; // 16 croches = 2 mesures par accord
    const chord = m.chords[Math.floor(this.eighth / 16) % m.chords.length];
    if (pos === 0) this.pad(chord, time, step * 16, m.bright);
    if (pos === 0 && m.choir > 0) this.choir(chord, time, step * 16, m.choir);
    if (pos === 0 || pos === 8) this.bass(chord[0] - 12, time, step * 6);
    if (pos % 2 === 0 && Math.random() < m.density) {
      // Marche aléatoire douce : la mélodie bouge par petits pas, comme un vrai chant.
      const candidates = m.scale.filter((n) => Math.abs(n - this.lastNote) <= 5);
      const pool = candidates.length ? candidates : m.scale;
      const note = pool[Math.floor(Math.random() * pool.length)];
      this.lastNote = note;
      this.pluck(note, time + (Math.random() - 0.5) * 0.02);
    }
  }

  private pad(chord: number[], time: number, dur: number, bright: number): void {
    const ctx = audio.context!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = bright;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.07, time + 1.5);
    g.gain.setValueAtTime(0.07, time + dur - 1);
    g.gain.linearRampToValueAtTime(0, time + dur + 0.6);
    filter.connect(g).connect(this.bus!);
    for (const note of chord) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midiToFreq(note);
      osc.detune.value = (Math.random() - 0.5) * 8; // léger désaccord = son plus chaleureux
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + dur + 0.7);
    }
  }

  /**
   * Chœur : des voix qui chantent « aah ». Une onde riche (dents de scie) passe
   * dans deux filtres réglés sur les résonances de la voyelle « a » (les formants),
   * avec un léger vibrato : l'oreille entend une voix humaine lointaine.
   */
  private choir(chord: number[], time: number, dur: number, volume: number): void {
    const ctx = audio.context!;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, time);
    out.gain.linearRampToValueAtTime(0.05 * volume, time + 2.2);
    out.gain.setValueAtTime(0.05 * volume, time + dur - 1.2);
    out.gain.linearRampToValueAtTime(0, time + dur + 0.8);
    out.connect(this.bus!);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 800;
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1150;
    f2.Q.value = 7;
    f1.connect(out);
    f2.connect(out);
    for (const note of chord.slice(1)) {
      for (const detune of [-6, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToFreq(note);
        osc.detune.value = detune;
        const vib = ctx.createOscillator();
        vib.frequency.value = 4.8 + Math.random();
        const vibAmount = ctx.createGain();
        vibAmount.gain.value = 3;
        vib.connect(vibAmount).connect(osc.frequency);
        osc.connect(f1);
        osc.connect(f2);
        osc.start(time);
        vib.start(time);
        osc.stop(time + dur + 1);
        vib.stop(time + dur + 1);
      }
    }
  }

  private bass(note: number, time: number, dur: number): void {
    const ctx = audio.context!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiToFreq(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.12, time + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(g).connect(this.bus!);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  private pluck(note: number, time: number): void {
    const ctx = audio.context!;
    let buf = this.plucks.get(note);
    if (!buf) {
      buf = audio.pluckBuffer(midiToFreq(note));
      this.plucks.set(note, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    src.connect(g).connect(this.bus!);
    src.start(Math.max(time, ctx.currentTime));
  }
}

/** Réponse impulsionnelle de réverbération : un bruit qui s'éteint doucement (salle en pierre). */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return buf;
}

export const music = new Music();
