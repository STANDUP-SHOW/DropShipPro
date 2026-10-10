// n8n Code node « Config du jour » — extrait de dropship-spy-n8n-workflow.json (référence / revue)
// Rayon + sous-thème du jour — mêmes rotations que MINEA-SPY (dupliquer par rayon)
const RAYON = 'TELEPHONIE';
const CATEGORIES = ['phones & electronics', 'electronics & accessories', 'electronics', 'computers & office']; // filtrage local
const ROTATION = [
  { theme: 'ecrans-externes-accessoires', kw: ['portable monitor', 'usb-c hub'] },
  { theme: 'smartphones',                 kw: ['smartphone', 'refurbished phone'] },
  { theme: 'chargeurs-cables-batteries',  kw: ['charger', 'power bank', 'magnetic cable'] },
  { theme: 'audio',                       kw: ['earbuds', 'bluetooth headphones', 'speaker'] },
  { theme: 'tablettes',                   kw: ['tablet', 'kids tablet', 'stylus'] },
  { theme: 'coques-protections-gadgets',  kw: ['phone case', 'screen protector', 'car phone holder'] },
  { theme: 'objets-connectes',            kw: ['smartwatch', 'gps tracker', 'smart ring'] },
];
const now = new Date(); const pad = n => String(n).padStart(2, '0');
const d = x => `${pad(x.getDate())}-${pad(x.getMonth() + 1)}-${String(x.getFullYear()).slice(2)}`;
const st = ROTATION[now.getDay()];
// domaines gagnants du jour fournis par MINEA-SPY (croisement des sources)
const fs = require('fs'); const path = require('path');
const dir = $env.MARKET_ANALYSES_DIR || './MARKET-ANALYSES';
let domains = [];
try {
  const m = JSON.parse(fs.readFileSync(path.join(dir, `${RAYON}-${d(now)}-MINEA.json`), 'utf8'));
  domains = [...new Set((m.ads || []).filter(a => a.gagnant || a.signal === 'breakout').map(a => { try { return new URL(a.url_produit).hostname.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean))];
} catch (e) {}
return [{ json: { rayon: RAYON, categories: CATEGORIES, sous_theme: st.theme, keywords: st.kw, competitorDomains: domains,
  date_run: d(now), date_prev: d(new Date(now.getTime() - 86400000)) } }];
