/**
 * Illustrations dessinées en SVG, dans un style « livre d'images ».
 *
 * Analogie : une petite bibliothèque de composants. Les fonctions de base
 * (person, sheep, donkey, hills…) renvoient des morceaux de SVG ; chaque
 * scène les assemble. Pour une nouvelle image, on compose ces briques.
 *
 * Dans le contenu JSON, une icône qui commence par "ill:" désigne une
 * illustration de ce fichier (ex. "ill:samaritain-route"). Sinon c'est un emoji.
 * Les illustrations sont décoratives (aria-hidden) : le texte raconte tout.
 */

const C = {
  sky: '#cfeaff',
  skyWarm: '#ffe2b8',
  night: '#2a2f86',
  hill: '#86c95f',
  hill2: '#5fae45',
  road: '#e9c88f',
  wood: '#8b5a2b',
  stone: '#d8ccb8',
  white: '#ffffff',
  gold: '#f2b705',
  red: '#c8102e',
  ink: '#14123a',
  skin: ['#7a4a2a', '#8d5524', '#a8693a', '#c68642'],
};

interface PersonOpts {
  robe: string;
  skin?: string;
  scarf?: string;
  beard?: string;
  hair?: string;
  s?: number;
  flip?: boolean;
  /** Pose des bras. */
  arms?: 'down' | 'reach' | 'up' | 'carry' | 'give';
  sash?: string;
  staff?: boolean;
}

/** Personnage en tunique, debout, pieds en (x, y). Hauteur ≈ 44 × s. */
function person(x: number, y: number, o: PersonOpts): string {
  const s = o.s ?? 1;
  const f = o.flip ? -1 : 1;
  const skin = o.skin ?? C.skin[1];
  // La main se dessine au bout du bras (dernier point du tracé, ex. « L9,-11 »).
  const arm = (d: string) => {
    const [hx, hy] = d.split(' ').pop()!.replace(/^[A-Z]/, '').split(',');
    return `<path d="${d}" fill="none" stroke="${o.robe}" stroke-width="5" stroke-linecap="round"/><circle cx="${hx}" cy="${hy}" r="2.6" fill="${skin}"/>`;
  };
  const arms = {
    down: arm('M-6,-24 L-9,-11') + arm('M6,-24 L9,-11'),
    reach: arm('M-6,-24 L-9,-11') + arm('M6,-24 L17,-18'),
    up: arm('M-6,-24 L-13,-37') + arm('M6,-24 L13,-37'),
    carry: arm('M-6,-24 L-8,-35') + arm('M6,-24 L8,-35'),
    give: arm('M-6,-24 L-8,-12') + arm('M6,-24 L18,-22'),
  }[o.arms ?? 'down'];
  return `<g transform="translate(${x} ${y}) scale(${s * f} ${s})">
    <ellipse cx="0" cy="0.5" rx="11" ry="2.5" fill="#000" opacity="0.15"/>
    <path d="M-10,0 L-6,-26 Q0,-30 6,-26 L10,0 Z" fill="${o.robe}"/>
    ${o.sash ? `<rect x="-7.5" y="-17" width="15" height="3" rx="1.5" fill="${o.sash}"/>` : ''}
    ${arms}
    <circle cx="0" cy="-32" r="6.5" fill="${skin}"/>
    ${o.hair ? `<path d="M-6.5,-33 Q0,-42 6.5,-33 Q3,-37 0,-37 Q-3,-37 -6.5,-33 Z" fill="${o.hair}"/>` : ''}
    ${o.scarf ? `<path d="M-8,-30 Q-8,-41 0,-41 Q8,-41 8,-30 L8,-23 L5,-24 L5,-32 Q0,-37 -5,-32 L-5,-24 L-8,-23 Z" fill="${o.scarf}"/>` : ''}
    ${o.beard ? `<path d="M-5,-30 Q0,-20 5,-30 Q0,-27 -5,-30 Z" fill="${o.beard}"/>` : ''}
    <circle cx="2.6" cy="-33" r="0.9" fill="${C.ink}"/>
    ${o.staff ? `<path d="M14,0 L14,-40 Q14,-48 8,-46" fill="none" stroke="${C.wood}" stroke-width="2.2" stroke-linecap="round"/>` : ''}
  </g>`;
}

/** Personnage allongé (le voyageur blessé). */
function lying(x: number, y: number, robe: string, skin = C.skin[2]): string {
  return `<g transform="translate(${x} ${y})">
    <ellipse cx="0" cy="1" rx="22" ry="3" fill="#000" opacity="0.15"/>
    <path d="M-16,-6 Q0,-11 16,-6 L16,0 L-16,0 Z" fill="${robe}"/>
    <circle cx="-20" cy="-5" r="6" fill="${skin}"/>
    <path d="M-25,-8 L-15,-9" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
  </g>`;
}

function sheep(x: number, y: number, s = 1, flip = false): string {
  const f = flip ? -1 : 1;
  return `<g transform="translate(${x} ${y}) scale(${s * f} ${s})">
    <ellipse cx="0" cy="0.5" rx="11" ry="2" fill="#000" opacity="0.13"/>
    <path d="M-6,0 L-6,-6 M5,0 L5,-6" stroke="${C.ink}" stroke-width="2"/>
    <g fill="#fff"><circle cx="-6" cy="-10" r="5"/><circle cx="0" cy="-12" r="6"/><circle cx="6" cy="-10" r="5"/><circle cx="0" cy="-7" r="5.5"/></g>
    <ellipse cx="11" cy="-11" rx="3.6" ry="4.2" fill="#3b3330"/>
    <circle cx="12" cy="-12" r="0.8" fill="#fff"/>
  </g>`;
}

function donkey(x: number, y: number, s = 1, flip = false, rider?: string): string {
  const f = flip ? -1 : 1;
  return `<g transform="translate(${x} ${y}) scale(${s * f} ${s})">
    <ellipse cx="0" cy="0.5" rx="16" ry="2.5" fill="#000" opacity="0.13"/>
    <path d="M-10,0 L-10,-10 M-4,0 L-4,-10 M6,0 L6,-10 M11,0 L11,-10" stroke="#6d625a" stroke-width="2.6"/>
    <ellipse cx="0" cy="-14" rx="15" ry="7" fill="#9a8c82"/>
    <path d="M11,-17 L17,-27 L23,-24 L17,-13 Z" fill="#9a8c82"/>
    <ellipse cx="21" cy="-24" rx="4.5" ry="3.5" fill="#9a8c82"/>
    <path d="M17,-28 L15,-37 L19,-29 M20,-28 L21,-37 L22,-28" fill="#9a8c82" stroke="#9a8c82" stroke-width="2"/>
    <circle cx="22" cy="-25" r="0.9" fill="${C.ink}"/>
    <path d="M-15,-14 Q-19,-8 -17,-4" stroke="#6d625a" stroke-width="1.6" fill="none"/>
    <rect x="-8" y="-21" width="14" height="5" rx="2" fill="${C.red}"/>
    ${rider ? `<g transform="translate(-1 -22)"><path d="M-10,-2 Q0,-7 10,-2 L10,2 L-10,2 Z" fill="${rider}"/><circle cx="-12" cy="-2" r="5" fill="${C.skin[2]}"/></g>` : ''}
  </g>`;
}

function hills(sky: string, a = C.hill, b = C.hill2): string {
  return `<rect width="200" height="140" fill="${sky}"/>
    <path d="M0,92 C40,70 80,84 120,74 C150,66 180,76 200,70 L200,140 L0,140 Z" fill="${a}"/>
    <path d="M0,112 C50,98 90,112 140,102 C170,96 190,104 200,100 L200,140 L0,140 Z" fill="${b}"/>`;
}

const sun = (x: number, y: number, r = 12, color = '#ffd54a') =>
  `<circle cx="${x}" cy="${y}" r="${r * 1.8}" fill="${color}" opacity="0.25"/><circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;

const tree = (x: number, y: number, s = 1, leaf = '#4f9e3c') =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2.5" y="-18" width="5" height="18" fill="${C.wood}"/><circle cx="0" cy="-24" r="11" fill="${leaf}"/><circle cx="-7" cy="-19" r="7" fill="${leaf}"/><circle cx="7" cy="-19" r="7" fill="${leaf}"/></g>`;

const palm = (x: number, y: number, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0,0 Q3,-14 1,-30" stroke="#8b5a2b" stroke-width="4" fill="none"/><g fill="#3fa34d"><path d="M1,-30 Q-14,-34 -20,-24 Q-10,-30 1,-28Z"/><path d="M1,-30 Q16,-35 21,-24 Q10,-30 1,-28Z"/><path d="M1,-30 Q-6,-44 -16,-42 Q-6,-38 1,-29Z"/><path d="M1,-30 Q9,-44 18,-41 Q8,-38 1,-29Z"/></g></g>`;

const house = (x: number, y: number, s = 1, door = '#2340ff') =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-16" y="-24" width="32" height="24" fill="#f7f4ee"/><rect x="-17" y="-27" width="34" height="4" fill="#e6dfd2"/><path d="M-4,0 L-4,-11 Q0,-16 4,-11 L4,0 Z" fill="${door}"/><rect x="7" y="-17" width="5" height="5" fill="#3a2f28"/><rect x="-12" y="-17" width="5" height="5" fill="#3a2f28"/></g>`;

const heart = (x: number, y: number, s = 1, color = C.red) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0,6 C-12,-2 -10,-12 -4,-12 C-1,-12 0,-9 0,-8 C0,-9 1,-12 4,-12 C10,-12 12,-2 0,6 Z" fill="${color}"/>`;

const coin = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="4" fill="${C.gold}" stroke="#b8860b" stroke-width="1"/>`;

const bubble = (x: number, y: number, text: string) =>
  `<g transform="translate(${x} ${y})"><path d="M-12,-12 h24 a4,4 0 0 1 4,4 v10 a4,4 0 0 1 -4,4 h-14 l-6,6 l1,-6 h-5 a4,4 0 0 1 -4,-4 v-10 a4,4 0 0 1 4,-4 z" fill="#fff" stroke="${C.ink}" stroke-width="1.2"/><text x="0" y="0" font-size="12" font-weight="700" text-anchor="middle" fill="${C.red}" font-family="Georgia, serif">${text}</text></g>`;

const notes = (x: number, y: number) =>
  `<g fill="${C.ink}" transform="translate(${x} ${y})"><path d="M0,0 L0,-12 L7,-14 L7,-3" stroke="${C.ink}" stroke-width="1.5" fill="none"/><circle cx="-1.6" cy="0" r="2.4"/><circle cx="5.4" cy="-3" r="2.4"/></g>`;

const rays = (x: number, y: number, color = '#fff3c4') =>
  Array.from({ length: 9 }, (_, i) => {
    const a = (-Math.PI * (i + 1)) / 10;
    return `<path d="M${x},${y} L${x + Math.cos(a - 0.08) * 160},${y + Math.sin(a - 0.08) * 160} L${x + Math.cos(a + 0.08) * 160},${y + Math.sin(a + 0.08) * 160} Z" fill="${color}" opacity="0.35"/>`;
  }).join('');

/** Le berger porte la brebis sur ses épaules (Luc 15.5) : la brebis passe derrière la tête. */
function sheepOnShoulders(x: number, y: number): string {
  const body = `<g transform="translate(${x - 1} ${y - 25}) rotate(-8)"><g fill="#fff"><circle cx="-11" cy="-6" r="6"/><circle cx="-4" cy="-8" r="7"/><circle cx="4" cy="-8" r="7"/><circle cx="11" cy="-6" r="6"/></g>
    <ellipse cx="17" cy="-8" rx="3.8" ry="4.4" fill="#3b3330"/><circle cx="18" cy="-9" r="0.8" fill="#fff"/>
    <path d="M-15,-2 L-17,4 M-11,-1 L-12,5 M10,-1 L12,5 M14,-2 L16,4" stroke="#14123a" stroke-width="2" stroke-linecap="round"/></g>`;
  // Les mains du berger tiennent les pattes de chaque côté.
  return body + person(x, y, { ...SHEPHERD, arms: 'carry', staff: false });
}

const JESUS: PersonOpts = { robe: '#ffffff', sash: C.red, skin: C.skin[2], hair: '#3e2410', beard: '#3e2410' };
const SAMARITAN: PersonOpts = { robe: '#00897b', sash: C.gold, skin: C.skin[1], hair: '#1b1b1b', beard: '#1b1b1b' };
const SHEPHERD: PersonOpts = { robe: '#c0703a', sash: '#2340ff', skin: C.skin[0], scarf: '#e8d8b0', beard: '#2b1a10', staff: true };

/* ------------------------------------------------------------------ */
/* Scènes                                                               */
/* ------------------------------------------------------------------ */

const scenes: Record<string, () => string> = {
  // --- Le bon Samaritain ---
  'samaritain-question': () =>
    hills(C.sky) + sun(170, 26) + tree(40, 104, 1.3, '#8fb07a') +
    person(78, 116, { ...JESUS, arms: 'reach' }) +
    person(124, 116, { robe: '#3f51b5', sash: C.gold, skin: C.skin[3], hair: '#1b1b1b', beard: '#1b1b1b', flip: true }) +
    bubble(140, 52, '?'),
  'samaritain-route': () =>
    hills(C.skyWarm, '#d9b26f', '#c99a55') + sun(30, 24, 10) +
    `<path d="M20,140 C60,110 120,120 140,96 C160,74 150,60 190,50" stroke="${C.road}" stroke-width="16" fill="none" stroke-linecap="round"/>` +
    `<g fill="#cdbfa8"><rect x="150" y="34" width="40" height="18"/><rect x="150" y="28" width="6" height="6"/><rect x="164" y="28" width="6" height="6"/><rect x="178" y="28" width="6" height="6"/></g>` +
    palm(28, 108, 0.9) + lying(98, 124, '#3f51b5'),
  'samaritain-passent': () =>
    hills(C.skyWarm, '#d9b26f', '#c99a55') +
    `<path d="M0,118 C60,110 140,112 200,104" stroke="${C.road}" stroke-width="22" fill="none"/>` +
    lying(52, 128, '#3f51b5') +
    person(150, 106, { robe: '#ffffff', sash: '#2340ff', scarf: '#2340ff', skin: C.skin[2], beard: '#9e9e9e', arms: 'down' }) +
    `<path d="M165,96 L180,96 M174,91 L180,96 L174,101" stroke="${C.ink}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  'samaritain-arrive': () =>
    hills(C.skyWarm, '#d9b26f', '#c99a55') + sun(170, 24, 10) +
    `<path d="M0,118 C60,110 140,112 200,104" stroke="${C.road}" stroke-width="22" fill="none"/>` +
    lying(140, 126, '#3f51b5') + donkey(52, 118) + person(86, 118, { ...SAMARITAN, arms: 'reach' }) + heart(112, 66, 1.3),
  'samaritain-soins': () =>
    hills(C.skyWarm, '#d9b26f', '#c99a55') +
    lying(110, 124, '#3f51b5') +
    `<g transform="translate(78 124)"><path d="M-10,0 L-6,-16 Q0,-20 6,-16 L10,0 Z" fill="${SAMARITAN.robe}"/><circle cx="2" cy="-22" r="6.5" fill="${SAMARITAN.skin}"/><path d="M-3,-20 Q2,-12 7,-20 Z" fill="#1b1b1b"/><path d="M5,-14 L16,-10" stroke="${SAMARITAN.robe}" stroke-width="5" stroke-linecap="round"/></g>` +
    `<g transform="translate(60 124)"><path d="M-5,0 L-6,-10 Q0,-15 6,-10 L5,0 Z" fill="#c9773a"/><rect x="-2.5" y="-17" width="5" height="5" fill="#c9773a"/></g>` +
    `<path d="M86,112 L94,114" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>` +
    heart(100, 70, 1.1, '#ff6b81'),
  'samaritain-auberge': () =>
    hills(C.sky) +
    `<g transform="translate(130 112)"><rect x="-34" y="-40" width="68" height="40" fill="#f7f4ee"/><rect x="-36" y="-44" width="72" height="5" fill="#e6dfd2"/><path d="M-6,0 L-6,-16 Q0,-22 6,-16 L6,0 Z" fill="#8b5a2b"/><rect x="-26" y="-30" width="9" height="8" fill="#3a2f28"/><rect x="17" y="-30" width="9" height="8" fill="#3a2f28"/><rect x="-12" y="-58" width="24" height="10" rx="2" fill="${C.gold}"/><path d="M0,-48 L0,-44" stroke="${C.wood}" stroke-width="2"/></g>` +
    donkey(34, 120, 0.9, false, '#3f51b5') +
    person(78, 120, { ...SAMARITAN, arms: 'give' }) +
    person(104, 120, { robe: '#795548', sash: '#ffd23f', skin: C.skin[3], hair: '#4e342e', flip: true, arms: 'reach' }) +
    coin(94, 98) + coin(98, 94),
  'samaritain-aimer': () =>
    `<rect width="200" height="140" fill="${C.skyWarm}"/>` + rays(100, 70, '#fff') + heart(100, 62, 3.4) +
    person(52, 124, { ...JESUS, arms: 'up' }) +
    person(140, 124, { ...SAMARITAN, arms: 'reach', flip: true }) +
    person(162, 124, { robe: '#3f51b5', skin: C.skin[3], hair: '#1b1b1b', flip: true, s: 0.8 }),

  // --- La brebis perdue ---
  'brebis-cent': () =>
    hills(C.sky) + sun(28, 26) +
    [30, 52, 74, 98, 120, 142, 164, 60, 86, 110, 134, 156].map((x, i) => sheep(x, i < 7 ? 124 : 106, i < 7 ? 0.9 : 0.7, i % 2 === 0)).join('') +
    person(182, 104, { ...SHEPHERD, flip: true, s: 0.9 }),
  'brebis-compte': () =>
    hills('#ffcf9e', '#9ccf6a', '#6fb24e') + sun(40, 64, 16, '#ff9e57') +
    `<g stroke="${C.wood}" stroke-width="3"><path d="M90,118 L190,118"/><path d="M90,104 L190,104"/>${[92, 112, 132, 152, 172, 188].map((x) => `<path d="M${x},96 L${x},124"/>`).join('')}</g>` +
    sheep(110, 116, 0.8) + sheep(136, 118, 0.8) + sheep(160, 116, 0.8) +
    person(64, 124, { ...SHEPHERD, arms: 'reach' }) + bubble(86, 56, '?'),
  'brebis-cherche': () =>
    `<rect width="200" height="140" fill="#6a72c8"/>` + `<circle cx="160" cy="26" r="10" fill="#fff3c4"/>` +
    `<path d="M0,140 L0,90 L40,60 L70,84 L110,40 L150,78 L200,56 L200,140 Z" fill="#8a7f72"/><path d="M0,140 L0,112 L50,96 L100,118 L150,100 L200,112 L200,140 Z" fill="#6f655a"/>` +
    sheep(118, 46, 0.6) + person(56, 108, { ...SHEPHERD, arms: 'reach' }) +
    `<circle cx="73" cy="90" r="5" fill="#ffd54a"/><circle cx="73" cy="90" r="10" fill="#ffd54a" opacity="0.35"/>`,
  'brebis-trouvee': () =>
    hills(C.sky) + sun(170, 26) +
    sheepOnShoulders(100, 124) + heart(140, 60, 1.2) + heart(62, 70, 0.8, '#ff6b81'),
  'brebis-fete': () =>
    hills(C.sky) + house(178, 102, 0.8, '#2340ff') + house(22, 100, 0.7, '#c8102e') +
    person(56, 124, { ...SHEPHERD, arms: 'up' }) +
    person(96, 124, { robe: '#7c4dff', sash: C.gold, scarf: '#ff4f7b', skin: C.skin[2], arms: 'up' }) +
    person(136, 124, { robe: '#e8590c', sash: '#2340ff', skin: C.skin[0], hair: '#1b1b1b', arms: 'up', flip: true }) +
    sheep(170, 126, 0.8, true) + notes(30, 50) + notes(160, 44) +
    ['#ff4f7b', '#ffd23f', '#2340ff', '#00c2a8', '#ff7a1a'].map((c, i) => `<rect x="${30 + i * 32}" y="${30 + (i % 2) * 14}" width="5" height="5" fill="${c}" transform="rotate(${i * 25} ${32 + i * 32} ${32 + (i % 2) * 14})"/>`).join(''),
  'brebis-ciel': () =>
    `<rect width="200" height="140" fill="#8fc8ff"/>` + rays(100, 30) + sun(100, 30, 14, '#fff3c4') +
    `<g fill="#fff" opacity="0.9"><ellipse cx="40" cy="70" rx="26" ry="10"/><ellipse cx="160" cy="76" rx="28" ry="10"/></g>` +
    heart(100, 86, 2.2) + sheep(100, 132, 0.9),

  // --- Bandeaux des missions ---
  'mission-compassion': () =>
    hills(C.skyWarm, '#d9b26f', '#c99a55') + sun(176, 22, 10) +
    `<path d="M0,120 C60,112 140,114 200,106" stroke="${C.road}" stroke-width="20" fill="none"/>` +
    donkey(150, 118, 0.95, true, '#3f51b5') + person(110, 120, { ...SAMARITAN, arms: 'reach' }) + heart(70, 60, 1.6),
  'mission-fidelite': () =>
    `<rect width="200" height="140" fill="#9fd4ff"/>` +
    ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'].map((c, i) => `<path d="M${20 + i * 6},140 A${80 - i * 6},${80 - i * 6} 0 0 1 ${180 - i * 6},140" stroke="${c}" stroke-width="6" fill="none"/>`).join('') +
    `<g transform="translate(100 118)"><path d="M-46,-4 L46,-4 L36,14 L-36,14 Z" fill="#7a4a22"/><rect x="-26" y="-22" width="52" height="18" fill="#a65f2a"/><path d="M-30,-22 L0,-36 L30,-22 Z" fill="#6b3412"/><rect x="-4" y="-16" width="8" height="12" fill="#3e1f0a"/></g>` +
    `<path d="M0,128 Q50,120 100,130 T200,126 L200,140 L0,140 Z" fill="#3fa7e0"/>` +
    `<g transform="translate(150 50)" fill="#fff"><path d="M0,0 Q-10,-10 -18,-4 Q-10,-4 -4,2Z"/><ellipse cx="2" cy="2" rx="9" ry="5"/><path d="M0,0 Q8,-12 16,-8 Q8,-4 4,2Z"/><path d="M10,1 l5,1 l-5,2Z" fill="#f2a705"/><path d="M14,4 q4,4 7,3" stroke="#5b7a2a" stroke-width="1.2" fill="none"/></g>`,
  'mission-cherche': () =>
    hills('#ffe7c2', '#9ccf6a', '#6fb24e') + sun(32, 30, 12, '#ffb74d') +
    sheepOnShoulders(110, 126) + sheep(40, 124, 0.7) + sheep(170, 124, 0.7, true) + heart(150, 64, 1.2),
  'mission-coeur': () =>
    hills('#ffd9a8', '#a5d46a', '#7cb94e') + sun(170, 30, 13, '#ff9e57') +
    person(78, 122, { robe: '#e53935', sash: C.gold, skin: C.skin[2], hair: '#3e2410', s: 0.85, arms: 'reach' }) +
    `<g transform="translate(104 96)"><path d="M0,24 L0,0 Q12,-6 20,8 L20,24" stroke="${C.gold}" stroke-width="3" fill="none"/>${[4, 8, 12, 16].map((x) => `<path d="M${x},24 L${x},${x < 10 ? 4 : 6}" stroke="#fff8e1" stroke-width="0.8"/>`).join('')}</g>` +
    sheep(150, 124, 0.8, true) + sheep(40, 126, 0.7) + notes(140, 70) + heart(100, 50, 1.3),

  // --- Médaillons des traits du Christ ---
  'trait-compassion': () =>
    // Quelqu'un se penche et tend la main à une personne à terre.
    `<circle cx="70" cy="70" r="70" fill="#fff2f2"/>` + heart(70, 40, 1.9) +
    lying(98, 112, '#3f51b5') +
    `<g transform="translate(46 112)"><ellipse cx="0" cy="0.5" rx="11" ry="2.5" fill="#000" opacity="0.15"/><path d="M-10,0 L-5,-22 Q2,-26 8,-20 L10,0 Z" fill="#00897b"/><circle cx="8" cy="-27" r="6.5" fill="${C.skin[1]}"/><path d="M3,-25 Q8,-17 13,-25 Z" fill="#1b1b1b"/><path d="M6,-17 L24,-8" stroke="#00897b" stroke-width="5" stroke-linecap="round"/><circle cx="25" cy="-7.5" r="2.8" fill="${C.skin[1]}"/></g>`,
  'trait-fidelite': () =>
    // La promesse : l'arc-en-ciel et la colombe qui rapporte le rameau d'olivier.
    `<circle cx="70" cy="70" r="70" fill="#eef6ff"/>` +
    ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'].map((c, i) => `<path d="M${16 + i * 5},104 A${54 - i * 5},${54 - i * 5} 0 0 1 ${124 - i * 5},104" stroke="${c}" stroke-width="5" fill="none"/>`).join('') +
    `<g transform="translate(66 86) scale(2.2)" fill="#fff" stroke="#c9cde6" stroke-width="0.4"><path d="M0,0 Q-10,-12 -19,-6 Q-10,-5 -4,2Z"/><ellipse cx="2" cy="2" rx="9" ry="5"/><path d="M0,0 Q8,-13 17,-9 Q8,-4 4,2Z"/><path d="M10,1 l5,1 l-5,2Z" fill="#f2a705" stroke="none"/><path d="M14,4 q4,4 8,3" stroke="#5b7a2a" stroke-width="1" fill="none"/><ellipse cx="20" cy="6" rx="2.2" ry="1" fill="#7cb342" stroke="none"/></g>`,
  'trait-cherche': () =>
    `<circle cx="70" cy="70" r="70" fill="#fff8e6"/>` +
    `<g transform="translate(52 40)"><rect x="-10" y="0" width="20" height="30" rx="4" fill="${C.gold}"/><rect x="-6" y="4" width="12" height="20" rx="3" fill="#fff3c4"/><circle cx="0" cy="14" r="14" fill="#ffd54a" opacity="0.4"/><path d="M-8,0 Q0,-12 8,0" stroke="${C.ink}" stroke-width="2.5" fill="none"/></g>` +
    sheep(84, 112, 2.1),
  'trait-paix': () =>
    // Une étoile paisible au-dessus d'une mer calmée.
    `<circle cx="70" cy="70" r="70" fill="#fff6dc"/>` +
    `<circle cx="70" cy="56" r="34" fill="#ffd54a" opacity="0.25"/>` +
    `<path d="M70,26 L78,46 L100,46 L82,59 L89,80 L70,67 L51,80 L58,59 L40,46 L62,46 Z" fill="#ffd54a" stroke="#e0a800" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M62,55 q3,-3 6,0 M72,55 q3,-3 6,0" stroke="#7a4b12" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M64,61 q6,5 12,0" stroke="#7a4b12" stroke-width="2" fill="none" stroke-linecap="round"/>` +
    `<path d="M14,100 Q42,92 70,100 T126,100 L126,118 Q70,138 14,118 Z" fill="#4aa3df"/><path d="M24,108 Q47,102 70,108 T116,108" stroke="#fff" stroke-width="2" fill="none" opacity="0.8"/>`,
  'trait-coeur': () =>
    `<circle cx="70" cy="70" r="70" fill="#f1efff"/>` +
    `<path d="M14,70 Q70,18 126,70 Q70,122 14,70 Z" fill="#fff" stroke="${C.ink}" stroke-width="4"/>` +
    `<circle cx="70" cy="70" r="24" fill="#2340ff"/>` + heart(70, 74, 1.6, '#ff4f7b'),
};

/** Code SVG complet d'une illustration (ou null si le nom est inconnu). */
export function illustration(name: string): string | null {
  const draw = scenes[name];
  if (!draw) return null;
  const square = name.startsWith('trait-');
  return `<svg class="ill" viewBox="0 0 ${square ? '140 140' : '200 140'}" aria-hidden="true" focusable="false">${draw()}</svg>`;
}

/**
 * Rend une icône de contenu : illustration si elle commence par "ill:",
 * sinon l'emoji tel quel (dans un span décoratif).
 */
export function renderIcon(icon: string): string {
  // "img:/books/…" : une vraie image (par exemple une page d'un livre illustré).
  if (icon.startsWith('img:')) {
    const src = icon.slice(4).replace(/^\//, import.meta.env.BASE_URL);
    return `<img class="ill ill-img" src="${src}" alt="" loading="lazy" decoding="async">`;
  }
  if (icon.startsWith('ill:')) {
    const svg = illustration(icon.slice(4));
    if (svg) return svg;
  }
  return `<span aria-hidden="true">${icon}</span>`;
}
