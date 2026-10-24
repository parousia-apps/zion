import type { QuestText, ScrollPanel } from '../types';
import { t, typo } from '../core/i18n';
import { speech } from '../core/speech';
import { audio } from '../core/audio';
import { $, kineticWords } from './dom';
import { renderIcon } from './illustrations';

/**
 * Les deux écrans plein cadre de la quête :
 * - ScrollView : le parchemin animé qui raconte le récit biblique ;
 * - TraitCard  : la carte qui révèle le trait du Christ.
 *
 * Tous deux sont des role="dialog" modaux : le focus y est piégé de fait
 * (le reste du jeu est en pause) et rendu au jeu à la fermeture.
 */

export class ScrollView {
  private readonly root = $('scroll');
  private readonly title = $('scroll-title');
  private readonly ref = $('scroll-ref');
  private readonly icon = $('scroll-icon');
  private readonly text = $('scroll-text');
  private readonly count = $('scroll-count');
  private readonly prev = $<HTMLButtonElement>('scroll-prev');
  private readonly next = $<HTMLButtonElement>('scroll-next');
  private readonly nextLabel = $('scroll-next-label');
  private panels: ScrollPanel[] = [];
  private index = 0;
  private resolve: (() => void) | null = null;
  calm = false;

  constructor() {
    this.prev.addEventListener('click', () => this.go(this.index - 1));
    this.next.addEventListener('click', () => this.go(this.index + 1));
    $('scroll-replay').addEventListener('click', () => this.speak());
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') this.go(this.index + 1);
      if (e.key === 'ArrowLeft') this.go(this.index - 1);
    });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  play(scroll: { title: string; reference: string; panels: ScrollPanel[] }): Promise<void> {
    this.panels = scroll.panels;
    this.title.textContent = scroll.title;
    this.ref.textContent = scroll.reference;
    this.root.hidden = false;
    this.index = 0;
    this.render();
    this.title.focus({ preventScroll: true });
    window.setTimeout(() => this.speak(), 300);
    return new Promise((r) => (this.resolve = r));
  }

  private go(i: number) {
    if (i < 0) return;
    if (i >= this.panels.length) {
      speech.cancel();
      this.root.hidden = true;
      const r = this.resolve;
      this.resolve = null;
      r?.();
      return;
    }
    this.index = i;
    this.render();
    this.speak();
    this.next.focus({ preventScroll: true });
  }

  private render() {
    const p = this.panels[this.index];
    this.icon.innerHTML = renderIcon(p.icon);
    this.icon.classList.remove('enter');
    void this.icon.offsetWidth;
    if (!this.calm) this.icon.classList.add('enter');
    kineticWords(this.text, typo(p.text), this.calm);
    this.text.setAttribute('aria-label', p.text);
    this.count.textContent = t('scroll.panel', { n: this.index + 1, total: this.panels.length });
    this.prev.disabled = this.index === 0;
    const last = this.index === this.panels.length - 1;
    this.nextLabel.textContent = last ? t('scroll.finish') : t('scroll.next');
    audio.play('ping', 0, 0.4);
  }

  private speak() {
    const p = this.panels[this.index];
    if (p) speech.speak(p.text, { audio: p.audio });
  }
}

export class TraitCard {
  private readonly root = $('trait');
  calm = false;

  constructor() {
    $('trait-continue').addEventListener('click', () => this.close());
  }

  private resolve: (() => void) | null = null;

  get open(): boolean {
    return !this.root.hidden;
  }

  play(text: QuestText, icon: string): Promise<void> {
    $('trait-icon').innerHTML = renderIcon(icon);
    $('trait-name').textContent = text.trait.name;
    $('trait-desc').textContent = typo(text.trait.description);
    $('trait-jesus').textContent = typo(text.trait.jesus);
    $('trait-ref').textContent = text.trait.jesusRef;
    this.root.hidden = false;
    $('trait-name').focus({ preventScroll: true });
    audio.play('bell');
    speech.speak([t('trait.heading'), text.trait.name, text.trait.description, t('trait.jesus'), text.trait.jesus]);
    return new Promise((r) => (this.resolve = r));
  }

  private close() {
    speech.cancel();
    this.root.hidden = true;
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }
}
