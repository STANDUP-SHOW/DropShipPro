// n8n Code node « Config du jour » — extrait de meta-spy-n8n-workflow.json (référence / revue)
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
const iso = x => x.toISOString().slice(0, 10);
const st = ROTATION[now.getDay()];
return [{ json: { rayon: RAYON, sous_theme: st.theme, keywords: st.kw, countries: ($env.META_COUNTRIES || 'FR').split(','),
  date_run: d(now), date_prev: d(new Date(now - 86400000)), since: iso(new Date(now - Number($env.META_LOOKBACK_DAYS || 30) * 86400000)) } }];
