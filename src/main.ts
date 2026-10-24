import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/900-italic.css';
import './styles/main.css';
import { inject } from '@vercel/analytics';

import { QUESTS, getQuest } from './content';
import { LANGUAGES, currentLanguage, questText, setLanguage, t, typo } from './core/i18n';
import { persist, resetProgress, save } from './core/save';
import { applySettingsToDocument, type Settings } from './core/settings';
import { speech } from './core/speech';
import { audio } from './core/audio';
import { music } from './core/music';
import { Engine } from './game/Engine';
import { Game } from './game/Game';
import { DialogBox } from './ui/DialogBox';
import { Hud } from './ui/Hud';
import { ScrollView, TraitCard } from './ui/Overlays';
import { $, announce, countUp, esc, showScreen, translateDom } from './ui/dom';
import { renderIcon } from './ui/illustrations';
import { MusicPlayer } from './ui/MusicPlayer';
import { renderFollowup, renderJournal, renderLife } from './ui/Life';

/**
 * Point d'entrée : démarrage, navigation entre écrans, réglages.
 *
 * Parcours : Titre → (premier lancement) Préférences → Missions → Jeu → Fin
 */

const settings = save.settings;
let engine: Engine | null = null;
let game: Game | null = null;
let currentQuest: string | null = null;

const ui = {
  hud: new Hud(),
  dialog: new DialogBox(),
  scroll: new ScrollView(),
  trait: new TraitCard(),
};

/* ------------------------------------------------------------ réglages */

function applySettings(): void {
  applySettingsToDocument(settings);
  speech.enabled = settings.readAloud;
  speech.rate = settings.speechRate;
  speech.lang = currentLanguage().speech;
  speech.voiceURI = settings.voice;
  audio.enabled = settings.sfx;
  music.setVolume(settings.musicVolume);
  music.setEnabled(settings.music);
  ui.hud.captionsOn = settings.captions;
  engine?.setLowQuality(settings.lowQuality);
  persist();
}

async function changeLanguage(code: string): Promise<void> {
  settings.lang = code;
  await setLanguage(code);
  applySettings();
  translateDom();
  renderLangSwitch();
  if (!$('screen-stories').hidden) renderStories();
}

function renderLangSwitch(): void {
  const box = document.querySelector<HTMLElement>('.lang-switch')!;
  box.innerHTML = '';
  for (const l of LANGUAGES) {
    const b = document.createElement('button');
    b.className = 'btn btn-light btn-small';
    b.lang = l.code;
    b.textContent = l.label;
    b.setAttribute('aria-pressed', String(l.code === settings.lang));
    b.addEventListener('click', () => void changeLanguage(l.code));
    box.append(b);
  }
  const select = $<HTMLSelectElement>('set-lang');
  select.innerHTML = LANGUAGES.map((l) => `<option value="${l.code}" lang="${l.code}">${esc(l.label)}</option>`).join('');
  select.value = settings.lang;
}

const settingsForm = () => $<HTMLFormElement>('settings-form');

function fillSettingsForm(): void {
  const f = settingsForm();
  for (const name of ['readAloud', 'autoAdvance', 'highContrast', 'reduceMotion', 'sfx', 'music', 'beacon', 'captions', 'lowQuality'] as const) {
    (f.elements.namedItem(name) as HTMLInputElement).checked = settings[name];
  }
  f.querySelectorAll<HTMLInputElement>('input[name="speechRate"]').forEach((r) => (r.checked = Number(r.value) === settings.speechRate));
  f.querySelectorAll<HTMLInputElement>('input[name="musicVolume"]').forEach((r) => (r.checked = Number(r.value) === settings.musicVolume));
  const voiceSelect = $<HTMLSelectElement>('set-voice');
  voiceSelect.innerHTML =
    `<option value="">${esc(t('settings.voiceAuto'))}</option>` +
    speech.voices().map((v) => `<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>`).join('');
  voiceSelect.value = speech.voices().some((v) => v.voiceURI === settings.voice) ? settings.voice : '';
  f.querySelectorAll<HTMLInputElement>('input[name="textSize"]').forEach((r) => (r.checked = r.value === settings.textSize));
  $<HTMLSelectElement>('set-lang').value = settings.lang;
  $('no-voice').hidden = !settings.readAloud || speech.hasVoice();
}

function bindSettings(): void {
  const f = settingsForm();
  f.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement | HTMLSelectElement;
    const name = input.name as keyof Settings;
    if (name === 'lang') {
      void changeLanguage(input.value).then(fillSettingsForm);
      return;
    }
    if (input instanceof HTMLInputElement && input.type === 'checkbox') {
      (settings as unknown as Record<string, boolean>)[name] = input.checked;
    } else if (name === 'speechRate') {
      settings.speechRate = Number(input.value);
    } else if (name === 'musicVolume') {
      settings.musicVolume = Number(input.value);
    } else if (name === 'voice') {
      settings.voice = input.value;
      applySettings();
      speech.speak(t('settings.testSentence'));
      return;
    } else if (name === 'textSize') {
      settings.textSize = input.value as Settings['textSize'];
    }
    applySettings();
    fillSettingsForm();
    if (name === 'reduceMotion' && game) announce(t('settings.appliesNext'));
  });
  $('btn-test-voice').addEventListener('click', () => {
    speech.enabled = true;
    speech.speak(t('settings.testSentence'));
    speech.enabled = settings.readAloud;
  });
  $('btn-reset').addEventListener('click', () => {
    if (!window.confirm(t('settings.resetConfirm'))) return;
    resetProgress();
    announce(t('settings.resetDone'));
    if (!$('screen-stories').hidden) renderStories();
  });
}

/** Ouvre une <dialog> modale et rend le focus à l'élément d'origine à la fermeture. */
function openModal(id: string): void {
  const dlg = $<HTMLDialogElement>(id);
  if (dlg.open) return;
  const opener = document.activeElement as HTMLElement | null;
  if (id === 'dlg-settings') fillSettingsForm();
  dlg.showModal();
  dlg.addEventListener('close', () => opener?.focus({ preventScroll: true }), { once: true });
}

/* ------------------------------------------------------------ écrans */

function goTitle(): void {
  engine?.stop();
  music.play('menu');
  showScreen('screen-title', $('btn-start'));
}

function goSetup(): void {
  const cards = document.querySelectorAll<HTMLButtonElement>('.toggle-card');
  const state = () => ({
    readAloud: settings.readAloud,
    bigText: settings.textSize !== 'm',
    highContrast: settings.highContrast,
    reduceMotion: settings.reduceMotion,
  });
  const sync = () => cards.forEach((c) => c.setAttribute('aria-pressed', String(state()[c.dataset.setting as keyof ReturnType<typeof state>])));
  cards.forEach((c) => {
    c.onclick = () => {
      const key = c.dataset.setting!;
      if (key === 'bigText') settings.textSize = settings.textSize === 'm' ? 'l' : 'm';
      else if (key === 'readAloud') settings.readAloud = !settings.readAloud;
      else if (key === 'highContrast') settings.highContrast = !settings.highContrast;
      else if (key === 'reduceMotion') settings.reduceMotion = !settings.reduceMotion;
      applySettings();
      sync();
      if (key === 'readAloud' && settings.readAloud) speech.speak(t('setup.readAloud'));
    };
  });
  sync();
  showScreen('screen-setup');
  speech.speak(`${t('setup.heading')} ${t('setup.intro')}`);
}

function renderStories(): void {
  const list = $('story-list');
  const done = QUESTS.filter((q) => save.quests[q.id]?.done).length;
  list.innerHTML = '';
  QUESTS.forEach((q, i) => {
    const text = questText(q.id);
    const progress = save.quests[q.id];
    const label = progress?.done ? t('stories.replay') : progress && progress.step > 0 ? t('stories.continue') : t('stories.play');
    const storyKind = q.chapters.some((c) => c.world !== 'zion') ? t('stories.story3d') : t('stories.storyScroll');
    const li = document.createElement('li');
    li.innerHTML = `
      <article class="story-card page" style="animation-delay:${i * 110}ms" aria-labelledby="q-${q.id}">
        <div class="story-band" style="background:${q.color}">
          ${renderIcon(q.icon)}
          <span class="story-num">${esc(t('stories.mission', { n: i + 1 }))}</span>
        </div>
        <div class="story-body">
          <h3 id="q-${q.id}">${esc(text.title)}</h3>
          <p class="story-trait"><span class="mini-ill">${renderIcon(q.traitIcon)}</span> ${esc(text.trait.name)}</p>
          <p class="story-meta">📖 ${esc(text.reference)} · ${esc(storyKind)}</p>
          <p class="story-summary">${esc(text.summary)}</p>
          ${progress?.done ? `<span class="story-status">✓ ${esc(t('stories.done'))}</span>` : ''}
          <button class="btn btn-primary" data-quest="${q.id}" aria-describedby="q-${q.id}">${esc(label)}</button>
          ${text.scrolls?.livre ? `<button class="btn btn-light btn-small" data-book="${q.id}" aria-describedby="q-${q.id}"><span aria-hidden="true">📖</span> ${esc(t('stories.readBook'))}</button>` : ''}
        </div>
      </article>`;
    list.append(li);
  });
  list.querySelectorAll<HTMLButtonElement>('button[data-quest]').forEach((b) => {
    b.addEventListener('click', () => startQuest(b.dataset.quest!));
  });
  list.querySelectorAll<HTMLButtonElement>('button[data-book]').forEach((b) => {
    b.addEventListener('click', async () => {
      const book = questText(b.dataset.book!).scrolls?.livre;
      if (!book) return;
      ui.scroll.calm = settings.reduceMotion;
      await ui.scroll.play(book);
      b.focus();
    });
  });
  renderFollowup(goJournal);

  $('trait-list').innerHTML = QUESTS.map((q) => {
    const earned = save.quests[q.id]?.done;
    const name = earned ? questText(q.id).trait.name : t('stories.traitLocked');
    return `<li class="trait-chip ${earned ? 'earned' : ''}"><span class="mini-ill">${earned ? renderIcon(q.traitIcon) : '<span aria-hidden="true">❔</span>'}</span>${esc(name)}</li>`;
  }).join('');

  countUp($('stories-count'), done, settings.reduceMotion);
  $('stories-progress-text').textContent = t('stories.progress', { total: QUESTS.length });
}

function goJournal(): void {
  renderJournal();
  showScreen('screen-journal');
}

function goStories(): void {
  game?.dispose();
  game = null;
  engine?.stop();
  music.play('menu');
  renderStories();
  showScreen('screen-stories');
}

function ensureEngine(): Engine | null {
  if (engine) return engine;
  try {
    engine = new Engine($<HTMLCanvasElement>('scene'));
    engine.setLowQuality(settings.lowQuality);
    return engine;
  } catch (err) {
    console.error(err);
    window.alert(t('errors.webgl'));
    return null;
  }
}

function startQuest(id: string, fromStart = false): void {
  const quest = getQuest(id);
  const eng = ensureEngine();
  if (!quest || !eng) return;
  audio.unlock();
  game?.dispose();
  const progress = save.quests[id];
  const step = fromStart || !progress || progress.done ? 0 : progress.step;
  currentQuest = id;
  showScreen('screen-game', $('screen-game'));
  game = new Game(eng, ui, quest, step, settings, {
    onComplete: () => showEnd(id),
    onMenu: () => togglePause(),
  });
  game.start();
}

function togglePause(): void {
  if (!game || $('screen-game').hidden) return;
  const dlg = $<HTMLDialogElement>('dlg-pause');
  if (dlg.open) {
    dlg.close();
    return;
  }
  // Une autre fenêtre (réglages, aide) est ouverte : Échap la ferme nativement.
  if (document.querySelector('dialog[open]')) return;
  game.setPaused(true);
  speech.cancel();
  openModal('dlg-pause');
  $('btn-resume').focus();
}

function showEnd(id: string): void {
  const quest = getQuest(id)!;
  const text = questText(id);
  game?.dispose();
  game = null;
  engine?.stop();
  $('end-mission').textContent = typo(`${t('end.missionDone')} : ${text.title}`);
  $('end-trait').innerHTML = `<span class="mini-ill">${renderIcon(quest.traitIcon)}</span> ${esc(text.trait.name)}`;
  $('end-message').textContent = typo(text.ending.message);
  $('end-reference').textContent = `📖 ${text.reference} · ${text.trait.jesusRef}`;
  $('end-reflection').textContent = typo(text.ending.reflection);
  renderLife(id, settings.reduceMotion);
  showScreen('screen-end');
  music.play('joy');
  audio.celebrate();
  speech.speak(`${t('end.bravo')} ${t('end.missionDone')}. ${text.trait.name}. ${text.ending.message}`);
}

/* ------------------------------------------------------------ démarrage */

async function boot(): Promise<void> {
  await setLanguage(settings.lang);
  applySettings();
  translateDom();
  renderLangSwitch();
  $('screen-game').tabIndex = -1;
  bindSettings();
  // Lecteur de chants du dossier sounds/.
  const songs = new MusicPlayer();
  $('btn-songs').addEventListener('click', () => songs.show());
  $('btn-songs-hud').addEventListener('click', () => songs.show());
  // La musique (et le chant en cours) baissent quand une voix parle.
  speech.onActivity = (speaking) => {
    music.duck(speaking);
    songs.duck(speaking);
  };
  // Les navigateurs interdisent le son avant un premier geste : on démarre au premier clic ou touche.
  const firstGesture = () => {
    audio.unlock();
    // La musique de fond = les chants du dossier sounds/ (sinon la musique générée).
    if (songs.hasTracks) songs.setBackground(settings.music);
    else music.resume();
  };
  $('settings-form').addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).name === 'music' && songs.hasTracks) songs.setBackground(settings.music);
  });
  window.addEventListener('pointerdown', firstGesture, { once: true });
  window.addEventListener('keydown', firstGesture, { once: true });

  $('btn-start').addEventListener('click', () => {
    audio.unlock(); // premier geste : on peut maintenant jouer des sons
    if (settings.setupDone) goStories();
    else goSetup();
  });
  $('btn-setup-go').addEventListener('click', () => {
    settings.setupDone = true;
    persist();
    goStories();
  });
  $('btn-title-settings').addEventListener('click', () => openModal('dlg-settings'));
  $('btn-title-help').addEventListener('click', () => openModal('dlg-help'));
  $('btn-stories-back').addEventListener('click', goTitle);
  $('btn-journal').addEventListener('click', goJournal);
  $('btn-journal-back').addEventListener('click', goStories);

  $('btn-stories-settings').addEventListener('click', () => openModal('dlg-settings'));

  $('btn-action').addEventListener('click', () => game?.onAction());
  $('btn-where').addEventListener('click', () => game?.describeWhere());
  $('btn-guide').addEventListener('click', () => game?.toggleGuide());
  $('btn-pause').addEventListener('click', togglePause);

  const pause = $<HTMLDialogElement>('dlg-pause');
  pause.addEventListener('close', () => game?.setPaused(false));
  $('btn-resume').addEventListener('click', () => pause.close());
  $('btn-pause-settings').addEventListener('click', () => openModal('dlg-settings'));
  $('btn-pause-help').addEventListener('click', () => openModal('dlg-help'));
  $('btn-restart').addEventListener('click', () => {
    pause.close();
    if (currentQuest) startQuest(currentQuest, true);
  });
  $('btn-quit').addEventListener('click', () => {
    pause.close();
    goStories();
  });
  $('dlg-help').querySelector('[data-close]')!.addEventListener('click', () => $<HTMLDialogElement>('dlg-help').close());

  $('btn-end-back').addEventListener('click', goStories);
  $('btn-end-replay').addEventListener('click', () => currentQuest && startQuest(currentQuest, true));

  // La voix de synthèse charge sa liste de voix de façon asynchrone.
  if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', () => fillSettingsForm());

  goTitle();
}

// Statistiques de visite Vercel (anonymes, sans cookie). Version « vanilla » pour Vite :
// l'équivalent du composant <Analytics /> de Next.js. N'envoie rien en développement.
inject({ mode: import.meta.env.PROD ? 'production' : 'development', debug: false });

void boot();
