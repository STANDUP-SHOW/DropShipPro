// n8n Code node « Écrire rapport .md » — extrait de minea-spy-n8n-workflow.json (référence / revue)
const fs = require('fs'); const path = require('path');
const d = $('Parse, score & alertes').first().json;
const text = ($input.first().json.content || []).map(b => b.text || '').join('\n');
const dir = $env.MARKET_ANALYSES_DIR || './MARKET-ANALYSES';
const file = path.join(dir, `${d.rayon}-${d.date_run}-MINEA.md`);
fs.writeFileSync(file, `# ${d.rayon} — ${d.sous_theme} — ${d.date_run} — Signaux Minea\n\n${text}\n`);
return [{ json: { ok: true, file, alerts: d.alerts.length, ads: d.ads.length } }];
