// n8n Code node « Config du jour » — extrait de minea-spy-n8n-workflow.json (référence / revue)
// Rayon + sous-thème du jour (rotation 7 jours) — dupliquer ce workflow par rayon
const RAYON = 'TELEPHONIE';
const ROTATION = [ // index = getDay() : 0 = dimanche
  { theme: 'ecrans-externes-accessoires', kw: ['écran portable', 'support écran', 'hub usb-c', 'clavier bluetooth'] },
  { theme: 'smartphones',                 kw: ['smartphone', 'téléphone reconditionné', 'mini téléphone'] },
  { theme: 'chargeurs-cables-batteries',  kw: ['chargeur', 'câble magnétique', 'powerbank', 'chargeur sans fil'] },
  { theme: 'audio',                       kw: ['écouteurs', 'casque bluetooth', 'enceinte connectée'] },
  { theme: 'tablettes',                   kw: ['tablette', 'tablette enfant', 'stylet'] },
  { theme: 'coques-protections-gadgets',  kw: ['coque', 'protection écran', 'gadget téléphone', 'support voiture'] },
  { theme: 'objets-connectes',            kw: ['montre connectée', 'tracker gps', 'bague connectée'] },
];
const now = new Date();
const pad = n => String(n).padStart(2, '0');
const dateRun = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${String(now.getFullYear()).slice(2)}`;
const y = new Date(now.getTime() - 86400000);
const datePrev = `${pad(y.getDate())}-${pad(y.getMonth() + 1)}-${String(y.getFullYear()).slice(2)}`;
const st = ROTATION[now.getDay()];
return [{ json: { rayon: RAYON, sous_theme: st.theme, keywords: st.kw, date_run: dateRun, date_prev: datePrev } }];
