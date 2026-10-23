import * as THREE from 'three';

/**
 * Le moteur : le renderer WebGL, la scène, la caméra et la boucle d'animation.
 *
 * Analogie : c'est le "requestAnimationFrame" de ton appli, centralisé.
 * Les autres modules s'abonnent avec onUpdate(fn) et reçoivent à chaque
 * image le temps écoulé (dt, en secondes).
 *
 * Qualité adaptative : si le téléphone peine (moins de ~40 images/s),
 * on réduit la résolution de rendu par paliers. Le jeu devient un peu plus
 * flou mais reste fluide.
 */

type Updater = (dt: number, elapsed: number) => void;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  private readonly timer = new THREE.Timer();
  private readonly updaters = new Set<Updater>();
  private running = false;
  private maxPixelRatio: number;
  private pixelRatio: number;
  private frameTimes: number[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const touch = navigator.maxTouchPoints > 0;
    // L'anticrénelage coûte cher sur mobile ; un écran de téléphone a déjà beaucoup de pixels.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'default' });
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    // Rendu « cinéma » : lumière plus douce et couleurs plus riches.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Les ombres ne coûtent que si une lumière les projette (désactivées en mode économie).
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.timer.connect(document);

    window.addEventListener('resize', () => this.resize());
    // Suit aussi les changements de taille sans événement « resize » (barre d'adresse mobile, panneaux...).
    if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    // On coupe tout quand l'onglet est caché : batterie préservée.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.renderer.setAnimationLoop(null);
      else if (this.running) this.renderer.setAnimationLoop(this.tick);
    });
  }

  onUpdate(fn: Updater): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer.reset();
    this.renderer.setAnimationLoop(this.tick);
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  setLowQuality(low: boolean): void {
    this.pixelRatio = low ? Math.min(0.75, this.maxPixelRatio) : this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // En portrait (téléphone), on recule un peu pour voir autant de décor.
    this.camera.fov = w < h ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  private tick = (time?: number) => {
    this.timer.update(time);
    // dt plafonné : après une pause, on ne « téléporte » pas les personnages.
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const elapsed = this.timer.getElapsed();
    for (const fn of this.updaters) fn(dt, elapsed);
    this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  };

  private adapt(dt: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 1 / 40 && this.pixelRatio > 0.6) {
      this.pixelRatio = Math.max(0.6, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }
}
