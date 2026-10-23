/**
 * Entrées du joueur : clavier, joystick tactile, toucher/cliquer sur le sol.
 *
 * Déplacement clavier : flèches, ou ZQSD/WASD. On lit event.code (position
 * PHYSIQUE de la touche) : la touche en haut à gauche du pavé lettres est
 * "KeyW" sur QWERTY comme sur AZERTY (où elle porte la lettre Z).
 */

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};

export interface InputHandlers {
  action: () => void;
  where: () => void;
  guide: () => void;
  menu: () => void;
  /** Toucher/clic sur la scène 3D (coordonnées écran). */
  tap: (clientX: number, clientY: number) => void;
}

export class Input {
  enabled = true;
  private keys = new Set<string>();
  private stick = { x: 0, y: 0 };
  private stickPointer: number | null = null;
  private cleanup: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly joystick: HTMLElement,
    private readonly handlers: InputHandlers,
  ) {
    this.listen(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(window, 'keyup', (e) => this.keys.delete((e as KeyboardEvent).code));
    this.listen(window, 'blur', () => this.keys.clear());
    this.bindJoystick();
    this.bindTap();
  }

  /** Direction demandée, repère écran : x droite, y haut. */
  direction(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = this.stick.x;
    let y = this.stick.y;
    for (const code of this.keys) {
      const k = MOVE_KEYS[code];
      if (k) {
        x += k[0];
        y += k[1];
      }
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  hasManualInput(): boolean {
    const d = this.direction();
    return Math.hypot(d.x, d.y) > 0.1;
  }

  dispose() {
    this.cleanup.forEach((fn) => fn());
    this.keys.clear();
  }

  /* ---------------------------------------------------------------- */

  private listen(target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) {
    target.addEventListener(type, fn, opts);
    this.cleanup.push(() => target.removeEventListener(type, fn, opts));
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Escape') {
      this.handlers.menu();
      return;
    }
    if (!this.enabled) return;
    const target = e.target instanceof Element ? e.target : null;
    const inForm = !!target?.closest('input, select, textarea, dialog');
    if (inForm) return;
    if (MOVE_KEYS[e.code]) {
      this.keys.add(e.code);
      e.preventDefault(); // pas de défilement de la page avec les flèches
      return;
    }
    // Sur un bouton, Espace/Entrée doivent cliquer ce bouton, pas déclencher l'action du jeu.
    const onButton = !!target?.closest('button, a');
    if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') && !onButton) {
      e.preventDefault();
      if (!e.repeat) this.handlers.action();
      return;
    }
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    if (key === 'g') this.handlers.guide();
    else if (key === 'o' || e.code === 'KeyH') this.handlers.where();
  }

  private bindJoystick() {
    const knob = this.joystick.querySelector<HTMLElement>('.knob');
    const radius = () => this.joystick.clientWidth / 2;
    const update = (e: PointerEvent) => {
      const r = this.joystick.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const max = radius();
      const len = Math.hypot(dx, dy);
      const k = len > max ? max / len : 1;
      this.stick = { x: (dx * k) / max, y: (-dy * k) / max };
      if (knob) knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.stick = { x: 0, y: 0 };
      if (knob) knob.style.transform = '';
    };
    this.listen(this.joystick, 'pointerdown', (ev) => {
      const e = ev as PointerEvent;
      this.stickPointer = e.pointerId;
      this.joystick.setPointerCapture(e.pointerId);
      update(e);
      e.preventDefault();
    });
    this.listen(this.joystick, 'pointermove', (ev) => {
      const e = ev as PointerEvent;
      if (e.pointerId === this.stickPointer) update(e);
    });
    this.listen(this.joystick, 'pointerup', (e) => release(e as PointerEvent));
    this.listen(this.joystick, 'pointercancel', (e) => release(e as PointerEvent));
  }

  private bindTap() {
    let start: { x: number; y: number; t: number } | null = null;
    this.listen(this.canvas, 'pointerdown', (ev) => {
      const e = ev as PointerEvent;
      start = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    this.listen(this.canvas, 'pointerup', (ev) => {
      const e = ev as PointerEvent;
      if (!start || !this.enabled) return;
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved < 12 && performance.now() - start.t < 500) this.handlers.tap(e.clientX, e.clientY);
      start = null;
    });
  }
}
