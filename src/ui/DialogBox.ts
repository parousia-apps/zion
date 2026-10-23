import type { DialogLine } from '../types';
import { t, typo } from '../core/i18n';
import { speech } from '../core/speech';
import { $ } from './dom';

/**
 * Boîte de dialogue en bas de l'écran.
 *
 * play() renvoie une Promise résolue quand le joueur a lu toutes les
 * répliques : on peut écrire `await dialog.play(lignes)` côté jeu.
 *
 * Accessibilité :
 * - le texte est dans une région aria-live (lu par les lecteurs d'écran) ;
 * - le focus va sur « Suivant » : Espace/Entrée avancent ;
 * - lecture à voix haute + bouton « Réécouter » ;
 * - pas de limite de temps (sauf si le joueur active l'avance automatique).
 */

export interface DialogOptions {
  names: Record<string, string>;
  /** Couleur de la pastille par personnage. */
  colors: Record<string, string>;
  onLine?: (line: DialogLine) => void;
  autoAdvance: boolean;
}

export class DialogBox {
  private readonly root = $('dialog');
  private readonly name = $('dialog-name');
  private readonly badge = $('dialog-badge');
  private readonly text = $('dialog-text');
  private readonly next = $<HTMLButtonElement>('dialog-next');
  private readonly nextLabel = $('dialog-next-label');
  private readonly replay = $<HTMLButtonElement>('dialog-replay');
  private resolve: (() => void) | null = null;
  private lines: DialogLine[] = [];
  private index = 0;
  private opts: DialogOptions | null = null;

  constructor() {
    this.next.addEventListener('click', () => this.advance());
    this.replay.addEventListener('click', () => this.speak());
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  play(lines: DialogLine[], opts: DialogOptions): Promise<void> {
    this.lines = lines;
    this.opts = opts;
    this.index = 0;
    this.root.hidden = false;
    this.show();
    this.next.focus({ preventScroll: true });
    return new Promise((resolve) => (this.resolve = resolve));
  }

  /** Utilisé par la touche Action du jeu quand un dialogue est ouvert. */
  advance(): void {
    if (!this.open) return;
    this.index++;
    if (this.index >= this.lines.length) {
      this.close();
      return;
    }
    this.show();
  }

  close(): void {
    speech.cancel();
    this.root.hidden = true;
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  private show(): void {
    const line = this.lines[this.index];
    const o = this.opts!;
    this.name.textContent = o.names[line.who] ?? line.who;
    this.badge.style.background = o.colors[line.who] ?? '#ffc21a';
    this.text.textContent = typo(line.text);
    const last = this.index === this.lines.length - 1;
    this.nextLabel.textContent = last ? t('dialog.close') : t('dialog.next');
    // Rejoue l'animation d'apparition à chaque réplique.
    this.root.style.animation = 'none';
    void this.root.offsetWidth;
    this.root.style.animation = '';
    o.onLine?.(line);
    this.speak();
  }

  private speak(): void {
    const line = this.lines[this.index];
    if (!line) return;
    const name = this.opts!.names[line.who];
    // On annonce le nom de la personne qui parle, sauf pour le narrateur.
    const text = line.who === 'narrator' || !name ? line.text : `${name} : ${line.text}`;
    const index = this.index;
    speech.speak(text, {
      audio: line.audio,
      onEnd: () => {
        if (this.opts?.autoAdvance && this.open && this.index === index) window.setTimeout(() => this.advance(), 700);
      },
    });
  }
}
