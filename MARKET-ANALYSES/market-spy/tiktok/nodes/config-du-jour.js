// n8n Code node « Config du jour » — extrait de tiktok-spy-n8n-workflow.json (référence / revue)
const RAYON = 'TELEPHONIE';
const ROTATION = [
  { theme: 'ecrans-externes-accessoires', kw: ['écran portable', 'hub usb-c'] },
  { theme: 'smartphones',                 kw: ['smartphone', 'téléphone reconditionné'] },
  { theme: 'chargeurs-cables-batteries',  kw: ['chargeur', 'powerbank', 'câble magnétique'] },
  { theme: 'audio',                       kw: ['écouteurs', 'casque bluetooth', 'enceinte'] },
  { theme: 'tablettes',                   kw: ['tablette', 'stylet'] },
  { theme: 'coques-protections-gadgets',  kw: ['coque', 'protection écran', 'support voiture'] },
  { theme: 'objets-connectes',            kw: ['montre connectée', 'traceur gps', 'bague connectée'] },
];
const now = new Date(); const pad = n => String(n).padStart(2, '0');
const d = x => `${pad(x.getDate())}-${pad(x.getMonth() + 1)}-${String(x.getFullYear()).slice(2)}`;
const ymd = x => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`;
const st = ROTATION[now.getDay()];
return [{ json: { rayon: RAYON, sous_theme: st.theme, keywords: st.kw, country: $env.TIKTOK_COUNTRY || 'FR',
  date_run: d(now), date_prev: d(new Date(now - 86400000)),
  range: { min: ymd(new Date(now - 30 * 86400000)), max: ymd(now) } } }];
