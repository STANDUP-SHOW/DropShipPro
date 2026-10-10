// n8n Code node « Écrire rapport .md » — extrait de meta-spy-n8n-workflow.json (référence / revue)
const fs = require('fs'); const path = require('path');
const d = $('Parse, score & alertes').first().json;
const text = ($input.first().json.content || []).map(b => b.text || '').join('\n');
const file = path.join($env.MARKET_ANALYSES_DIR || './MARKET-ANALYSES', `${d.rayon_nom}-${d.date_run}-META.md`);
fs.writeFileSync(file, `# ${d.rayon_nom} — ${d.sous_theme} — ${d.date_run} — Signaux Meta\n\n${text}\n`);
return [{ json: { ok: true, file, alerts: d.alerts.length } }];
