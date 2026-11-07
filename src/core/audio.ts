import type { SoundName } from '../types';

/**
 * Bruitages synthétisés avec la Web Audio API.
 *
 * Chaque son est fabriqué à partir d'oscillateurs (des « notes » pures) et de
 * bruit, puis façonné par des enveloppes de volume. "pan" va de -1 (oreille
 * gauche) à +1 (oreille droite) : c'est ce qui permet à une personne
 * malvoyante d'entendre de quel côté se trouve l'objectif.
 *
 * Les navigateurs exigent un geste de l'utilisateur avant de produire du son :
 * unlock() est appelé au premier clic sur « Commencer ».
 */

class AudioEngine {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  /** Contexte audio (null tant que le joueur n'a pas encore cliqué). Partagé avec la musique. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get output(): AudioNode | null {
    return this.master;
  }

  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      // Onglet caché : on suspend tout le son (musique comprise).
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void this.ctx?.suspend();
        else void this.ctx?.resume();
      });
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Joue un son nommé. */
  play(name: SoundName, pan = 0, volume = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    switch (name) {
      case 'ping': return this.tone([880], 0.25, 'triangle', pan, 0.35 * volume);
      case 'chime': return this.tone([784, 1175], 0.9, 'sine', pan, 0.4 * volume, 0.12);
      case 'bell': return this.tone([523, 784, 1047], 1.6, 'sine', pan, 0.35 * volume, 0.18);
      case 'bleat': return this.bleat(pan, volume);
      case 'cry': return this.cry(pan, volume);
      case 'drum': return this.drum(pan, volume);
      case 'thunder': return this.noiseBurst(1.8, 300, pan, 0.8 * volume);
    }
  }

  pickup(): void {
    this.tone([660, 990], 0.25, 'triangle', 0, 0.3, 0.07);
  }

  celebrate(): void {
    this.tone([523, 659, 784, 1047, 1319], 1.2, 'triangle', 0, 0.3, 0.09);
  }

  /** Arpège de harpe (algorithme Karplus-Strong : une corde pincée simulée). */
  harp(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const notes = [262, 330, 392, 523, 659, 523, 392, 330, 392, 523];
    notes.forEach((f, i) => {
      const src = ctx.createBufferSource();
      src.buffer = this.pluckBuffer(f);
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(g).connect(this.master!);
      src.start(ctx.currentTime + i * 0.22);
    });
  }

  rain(on: boolean): void {
    const ctx = this.ready();
    if (!ctx) return;
    if (on && !this.rainNodes) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise(ctx, 2);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1400;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 1.5);
      src.connect(filter).connect(gain).connect(this.master!);
      src.start();
      this.rainNodes = { src, gain };
    } else if (!on && this.rainNodes) {
      const { src, gain } = this.rainNodes;
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      src.stop(ctx.currentTime + 1.6);
      this.rainNodes = null;
    }
  }

  stopAll(): void {
    this.rain(false);
    this.ambience(false);
  }

  private birdTimer = 0;
  private water: { src: AudioBufferSourceNode; gain: GainNode; drops: GainNode; lfo: OscillatorNode } | null = null;
  private waterLevel = 0;
  private dropTimer = 0;

  /**
   * Ambiance de la cité : chants d'oiseaux de temps en temps (à gauche ou à
   * droite) et eau de la fontaine (volume réglé par setWater).
   *
   * Pour qu'on reconnaisse de l'eau, deux couches : un écoulement (bruit filtré
   * dont le volume ondule doucement) et des gouttes (petits « plic » qui montent
   * très vite, à intervalles irréguliers). Un bruit seul ressemble à du vent.
   */
  ambience(on: boolean): void {
    const ctx = this.ready();
    window.clearTimeout(this.birdTimer);
    window.clearInterval(this.dropTimer);
    if (!on || !ctx) {
      if (this.water && this.ctx) {
        const t = this.ctx.currentTime;
        this.water.gain.gain.setTargetAtTime(0, t, 0.4);
        this.water.drops.gain.setTargetAtTime(0, t, 0.4);
        this.water.src.stop(t + 2);
        this.water.lfo.stop(t + 2);
        this.water = null;
      }
      return;
    }
    const chirpLater = () => {
      this.birdTimer = window.setTimeout(() => {
        this.bird((Math.random() - 0.5) * 1.6);
        chirpLater();
      }, 2500 + Math.random() * 5000);
    };
    chirpLater();
    if (!this.water) {
      // Écoulement : un murmure (pas de « chhh » aigu), dont le volume ondule.
      const src = ctx.createBufferSource();
      src.buffer = this.noise(ctx, 3);
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1100;
      band.Q.value = 0.7;
      const soft = ctx.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 3500;
      const wobble = ctx.createGain();
      wobble.gain.value = 0.8;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.35;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.2;
      lfo.connect(lfoDepth).connect(wobble.gain);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(band).connect(soft).connect(wobble).connect(gain).connect(this.master!);
      // Gouttes : passent par leur propre volume, lui aussi réglé par la distance.
      const drops = ctx.createGain();
      drops.gain.value = 0;
      drops.connect(this.master!);
      src.start();
      lfo.start();
      this.water = { src, gain, drops, lfo };
    }
    // Planificateur des gouttes : toutes les 120 ms, quelques « plic » à des moments au hasard.
    this.dropTimer = window.setInterval(() => {
      if (!this.water || this.waterLevel < 0.02) return;
      const n = Math.random() < 0.6 ? 1 : 2;
      for (let i = 0; i < n; i++) this.drop(ctx.currentTime + Math.random() * 0.12);
    }, 120);
  }

  /** Une goutte : une note très courte qui monte vite (c'est la bulle qui éclate). */
  private drop(t0: number): void {
    if (!this.ctx || !this.water) return;
    const ctx = this.ctx;
    const f = 500 + Math.random() * 900;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.exponentialRampToValueAtTime(f * (1.8 + Math.random()), t0 + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.25 + Math.random() * 0.25, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 0.8;
    osc.connect(g).connect(pan).connect(this.water.drops);
    osc.start(t0);
    osc.stop(t0 + 0.1);
  }

  /** Volume de l'eau (0 = loin de la fontaine, 1 = tout près). */
  setWater(level: number): void {
    this.waterLevel = level;
    if (!this.water || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.water.gain.gain.setTargetAtTime(0.28 * level, t, 0.3);
    this.water.drops.gain.setTargetAtTime(0.2 * level, t, 0.3);
  }

  /** Un petit chant d'oiseau : deux ou trois notes aiguës qui glissent. */
  private bird(pan: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const dest = this.out(pan);
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 1400;
    for (let i = 0; i < notes; i++) {
      const t0 = ctx.currentTime + i * 0.13;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, t0);
      osc.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), t0 + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
      osc.connect(g).connect(dest);
      osc.start(t0);
      osc.stop(t0 + 0.12);
    }
  }

  /* ---------------------------------------------------------------- */

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || !this.master) return null;
    return this.ctx;
  }

  private out(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (typeof ctx.createStereoPanner !== 'function') return this.master!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master!);
    return p;
  }

  /** Une ou plusieurs notes, éventuellement égrenées (stagger en secondes). */
  private tone(freqs: number[], dur: number, type: OscillatorType, pan: number, vol: number, stagger = 0): void {
    const ctx = this.ready();
    if (!ctx) return;
    const dest = this.out(pan);
    freqs.forEach((f, i) => {
      const t0 = ctx.currentTime + i * stagger;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g).connect(dest);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    });
  }

  private bleat(pan: number, volume: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, t0);
    osc.frequency.linearRampToValueAtTime(380, t0 + 0.7);
    // Le chevrotement : un second oscillateur lent fait trembler la hauteur.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 25;
    lfo.connect(lfoGain).connect(osc.frequency);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1100;
    filter.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.5 * volume, t0 + 0.08);
    g.gain.linearRampToValueAtTime(0.001, t0 + 0.75);
    osc.connect(filter).connect(g).connect(this.out(pan));
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + 0.8);
    lfo.stop(t0 + 0.8);
  }

  private cry(pan: number, volume: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, t0);
    osc.frequency.linearRampToValueAtTime(700, t0 + 0.25);
    osc.frequency.linearRampToValueAtTime(480, t0 + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.4 * volume, t0 + 0.05);
    g.gain.linearRampToValueAtTime(0.001, t0 + 0.75);
    osc.connect(g).connect(this.out(pan));
    osc.start(t0);
    osc.stop(t0 + 0.8);
  }

  private drum(pan: number, volume: number): void {
    const ctx = this.ctx!;
    [0, 0.3, 0.45, 0.75].forEach((dt) => {
      const t0 = ctx.currentTime + dt;
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(150, t0);
      osc.frequency.exponentialRampToValueAtTime(50, t0 + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.6 * volume, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      osc.connect(g).connect(this.out(pan));
      osc.start(t0);
      osc.stop(t0 + 0.32);
    });
  }

  private noiseBurst(dur: number, cutoff: number, pan: number, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx, dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(this.out(pan));
    src.start();
  }

  private noise(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Karplus-Strong : un bruit court rebouclé et adouci devient une corde qui vibre. */
  pluckBuffer(freq: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 1.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const period = Math.floor(ctx.sampleRate / freq);
    for (let i = 0; i < period; i++) data[i] = Math.random() * 2 - 1;
    for (let i = period; i < len; i++) data[i] = 0.497 * (data[i - period] + data[i - period + 1]);
    return buf;
  }
}

export const audio = new AudioEngine();
