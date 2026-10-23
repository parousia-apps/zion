import { t } from '../core/i18n';
import { music } from '../core/music';
import { $, announce, esc } from './dom';

/**
 * Lecteur de chants : lit les fichiers audio du dossier sounds/ à la racine du projet.
 *
 * Ajouter un chant = déposer le fichier dans sounds/ (mp3, m4a, mp4, ogg, wav, aac).
 * Vite le copie automatiquement dans le site au moment du build.
 *
 * Analogie : un <audio> HTML piloté par nos propres boutons, avec une file
 * d'attente (playlist). Quand un chant joue, la musique d'ambiance générée
 * s'efface ; quand une voix lit un dialogue, le chant baisse (ducking).
 */

interface Track {
  title: string;
  url: string;
}

// Vite remplace cette ligne par la liste des fichiers trouvés, avec leur adresse finale.
const files = import.meta.glob<string>('/sounds/*.{mp3,m4a,mp4,ogg,wav,aac,MP3,M4A}', { query: '?url', import: 'default', eager: true });

/** « Yechourun_spotdown.org.mp3 » → « Yechourun » ; « pour l'amour de sion.m4a » → « Pour l'amour de sion ». */
function titleFrom(path: string): string {
  const name = decodeURIComponent(path.split('/').pop() ?? path)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-](spotdown|www)?\.?[a-z0-9-]+\.(org|com|net|fr)$/i, '')
    .replace(/[_]+/g, ' ')
    .trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const TRACKS: Track[] = Object.entries(files)
  .map(([path, url]) => ({ title: titleFrom(path), url }))
  .sort((a, b) => a.title.localeCompare(b.title, 'fr'));

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

export class MusicPlayer {
  private readonly audio = new Audio();
  private index = 0;
  private volume = 0.8;
  private ducked = false;
  private readonly root = $('music-player');
  private readonly title = $('mp-title');
  private readonly status = $('mp-status');
  private readonly seek = $<HTMLInputElement>('mp-seek');
  private readonly time = $('mp-time');
  private readonly playBtn = $<HTMLButtonElement>('mp-play');
  private readonly list = $('mp-list');

  constructor() {
    this.audio.preload = 'metadata';
    $('mp-prev').addEventListener('click', () => this.go(this.index - 1));
    $('mp-next').addEventListener('click', () => this.go(this.index + 1));
    $('mp-back').addEventListener('click', () => this.skip(-10));
    $('mp-fwd').addEventListener('click', () => this.skip(10));
    this.playBtn.addEventListener('click', () => this.toggle());
    $('mp-close').addEventListener('click', () => this.show(false));
    $<HTMLInputElement>('mp-volume').addEventListener('input', (e) => {
      this.volume = Number((e.target as HTMLInputElement).value);
      this.applyVolume();
    });
    this.seek.addEventListener('input', () => {
      if (Number.isFinite(this.audio.duration)) this.audio.currentTime = (Number(this.seek.value) / 1000) * this.audio.duration;
    });
    this.audio.addEventListener('timeupdate', () => this.renderTime());
    this.audio.addEventListener('loadedmetadata', () => this.renderTime());
    this.audio.addEventListener('ended', () => this.go(this.index + 1, true));
    this.audio.addEventListener('play', () => this.onPlayState(true));
    this.audio.addEventListener('pause', () => this.onPlayState(false));
    this.audio.addEventListener('error', () => {
      this.status.textContent = t('songs.error');
      announce(t('songs.error'));
      this.onPlayState(false);
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.show(false);
    });
    this.setupMediaSession();
    this.renderList();
    this.load(0);
  }

  get hasTracks(): boolean {
    return TRACKS.length > 0;
  }

  /** Ouvre / ferme le panneau du lecteur. */
  show(open = this.root.hidden): void {
    this.root.hidden = !open;
    if (open) {
      this.renderList();
      this.playBtn.focus();
    }
  }

  /** « Musique de fond » des Réglages : les chants du dossier sounds/ jouent en fond. */
  setBackground(on: boolean): void {
    if (!TRACKS.length) return;
    if (on && this.audio.paused) {
      this.volume = 0.45;
      this.applyVolume();
      void this.audio.play().catch(() => this.onPlayState(false));
    } else if (!on && !this.audio.paused) {
      this.audio.pause();
    }
  }

  /** Une voix lit un dialogue : on baisse le chant. */
  duck(on: boolean): void {
    this.ducked = on;
    this.applyVolume();
  }

  /** Retraduit les libellés après un changement de langue. */
  refresh(): void {
    this.renderList();
    this.onPlayState(!this.audio.paused);
  }

  /* ---------------------------------------------------------------- */

  private load(i: number): void {
    if (!TRACKS.length) {
      this.title.textContent = t('songs.empty');
      this.playBtn.disabled = true;
      return;
    }
    this.index = (i + TRACKS.length) % TRACKS.length;
    const track = TRACKS[this.index];
    this.audio.src = track.url;
    this.title.textContent = track.title;
    this.status.textContent = '';
    this.seek.value = '0';
    this.renderList();
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: 'Zion' });
  }

  private go(i: number, autoplay = !this.audio.paused): void {
    this.load(i);
    if (autoplay) void this.audio.play().catch(() => this.onPlayState(false));
    announce(t('songs.nowPlaying', { title: TRACKS[this.index]?.title ?? '' }));
  }

  private toggle(): void {
    if (!TRACKS.length) return;
    if (this.audio.paused) void this.audio.play().catch(() => this.onPlayState(false));
    else this.audio.pause();
  }

  private skip(seconds: number): void {
    if (!Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + seconds));
  }

  private applyVolume(): void {
    this.audio.volume = this.volume * (this.ducked ? 0.3 : 1);
  }

  private onPlayState(playing: boolean): void {
    this.playBtn.textContent = playing ? '⏸' : '▶';
    this.playBtn.setAttribute('aria-label', playing ? t('songs.pause') : t('songs.play'));
    // Pendant un chant, la musique d'ambiance générée se tait.
    music.setSongPlaying(playing);
    document.getElementById('btn-songs')?.setAttribute('aria-pressed', String(playing));
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  private renderTime(): void {
    const d = this.audio.duration;
    const c = this.audio.currentTime;
    if (Number.isFinite(d) && d > 0) this.seek.value = String(Math.round((c / d) * 1000));
    this.time.textContent = `${fmt(c)} / ${fmt(d)}`;
    this.seek.setAttribute('aria-valuetext', t('songs.position', { current: fmt(c), total: fmt(d) }));
  }

  private renderList(): void {
    this.list.innerHTML = TRACKS.map(
      (tr, i) =>
        `<li><button class="mp-track" data-i="${i}" aria-current="${i === this.index}"><span aria-hidden="true">${i === this.index ? '♪' : '·'}</span> ${esc(tr.title)}</button></li>`,
    ).join('');
    this.list.querySelectorAll<HTMLButtonElement>('button[data-i]').forEach((b) =>
      b.addEventListener('click', () => this.go(Number(b.dataset.i), true)),
    );
  }

  /** Commandes sur l'écran verrouillé et les casques Bluetooth. */
  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => this.toggle());
    ms.setActionHandler('pause', () => this.toggle());
    ms.setActionHandler('previoustrack', () => this.go(this.index - 1, true));
    ms.setActionHandler('nexttrack', () => this.go(this.index + 1, true));
    ms.setActionHandler('seekbackward', () => this.skip(-10));
    ms.setActionHandler('seekforward', () => this.skip(10));
  }
}
