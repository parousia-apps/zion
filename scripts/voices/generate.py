"""
Génère les voix des dialogues avec Kokoro (gratuit, libre, tourne sur l'ordinateur).

    npm run voices            # toutes les langues qui ont des voix réglées
    npm run voices -- fr      # une seule langue
    npm run voices -- fr amani  # une seule mission

Analogie : un « build » des voix. Pour chaque réplique (dialogues et parchemins),
on fabrique un mp3 dans public/audio/<langue>/<mission>/ et on écrit son chemin
dans le champ "audio" de la réplique. Le nom du fichier contient une empreinte
du texte et de la voix : si rien n'a changé, on ne régénère pas ; si le texte
change, un nouveau fichier est créé et l'ancien supprimé.

Le nom de la personne qui parle est dit d'abord par le narrateur (pour les
joueurs aveugles), puis la réplique avec la voix du personnage.

Installation (une fois) : bash scripts/voices/setup.sh
"""

import glob
import hashlib
import json
import os
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL_DIR = os.path.join(ROOT, 'assets-src', 'kokoro')
CONFIG = json.load(open(os.path.join(ROOT, 'scripts', 'voices', 'voices.json'), encoding='utf-8'))
LANG_CODES = {'fr': 'fr-fr', 'en': 'en-us'}

kokoro = Kokoro(os.path.join(MODEL_DIR, 'kokoro-v1.0.onnx'), os.path.join(MODEL_DIR, 'voices-v1.0.bin'))


def read_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def write_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def preset_for(lang, quest, who):
    name = CONFIG['personnages'].get(f'{quest}:{who}') or CONFIG['personnages'].get(who)
    if not name:
        print(f'  ! pas de voix pour « {who} » ({quest}) : narrateur par défaut')
        name = 'narrateur'
    return CONFIG['voix'][lang][name]


def fingerprint(*parts):
    return hashlib.sha1(json.dumps(parts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:8]


def spoken(lang, text):
    """Le texte tel qu'on veut l'entendre : prononciations corrigées, sans guillemets."""
    for word, say in CONFIG['prononciation'].get(lang, {}).items():
        text = text.replace(word, say)
    return text.replace('«', '').replace('»', '').replace('…', '...').strip()


def synth(lang, text, preset):
    """Une phrase → échantillons audio. La hauteur se règle en rééchantillonnant
    (comme accélérer un disque), et on compense la vitesse pour garder le débit."""
    style = sum(kokoro.get_voice_style(v) * w for v, w in preset['mix'].items())
    pitch = preset.get('hauteur', 1)
    samples, rate = kokoro.create(spoken(lang, text), voice=style, speed=preset.get('vitesse', 1) / pitch, lang=LANG_CODES[lang])
    if pitch != 1:
        n = int(len(samples) / pitch)
        samples = np.interp(np.linspace(0, len(samples) - 1, n), np.arange(len(samples)), samples).astype(np.float32)
    return samples, rate


def render(lang, path, parts):
    """parts = [(texte, preset), ...] mis bout à bout avec un court silence."""
    chunks, rate = [], 24000
    for i, (text, preset) in enumerate(parts):
        samples, rate = synth(lang, text, preset)
        if i:
            chunks.append(np.zeros(int(rate * 0.25), dtype=np.float32))
        chunks.append(samples)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, np.concatenate(chunks), rate, format='MP3')


def build_quest(lang, file, world_names):
    quest = os.path.splitext(os.path.basename(file))[0]
    data = read_json(file)
    names = {**world_names, **data.get('names', {})}
    out_dir = os.path.join(ROOT, 'public', 'audio', lang, quest)
    keep, made = set(), 0
    narrator = CONFIG['voix'][lang]['narrateur']

    def handle(item, key, parts):
        nonlocal made
        filename = f'{key}-{fingerprint(parts)}.mp3'
        path = os.path.join(out_dir, filename)
        keep.add(filename)
        if not os.path.exists(path):
            render(lang, path, parts)
            made += 1
            print(f'  + {lang}/{quest}/{filename}')
        item['audio'] = f'/audio/{lang}/{quest}/{filename}'

    for key, lines in data.get('dialogs', {}).items():
        for i, line in enumerate(lines):
            parts = [(line['text'], preset_for(lang, quest, line['who']))]
            name = names.get(line['who'])
            if line['who'] != 'narrator' and name:
                parts.insert(0, (name, narrator))
            handle(line, f'{key}-{i}', parts)

    for key, scroll in (data.get('scrolls') or {}).items():
        for i, panel in enumerate(scroll['panels']):
            handle(panel, f'scroll-{key}-{i}', [(panel['text'], narrator)])

    # Les anciens fichiers (texte modifié depuis) ne servent plus.
    if os.path.isdir(out_dir):
        for old in os.listdir(out_dir):
            if old.endswith('.mp3') and old not in keep:
                os.remove(os.path.join(out_dir, old))

    write_json(file, data)
    print(f'{lang}/{quest} : {len(keep)} répliques, {made} nouvelles')


def main():
    args = sys.argv[1:]
    langs = [a for a in args if a in CONFIG['voix']] or list(CONFIG['voix'])
    only = [a for a in args if a not in CONFIG['voix']]
    for lang in langs:
        world_names = {}
        for wf in sorted(glob.glob(os.path.join(ROOT, 'src', 'content', 'i18n', lang, 'worlds', '*.json'))):
            world_names.update(read_json(wf).get('names', {}))
        for qf in sorted(glob.glob(os.path.join(ROOT, 'src', 'content', 'i18n', lang, 'quests', '*.json'))):
            if not only or os.path.splitext(os.path.basename(qf))[0] in only:
                build_quest(lang, qf, world_names)


if __name__ == '__main__':
    main()
