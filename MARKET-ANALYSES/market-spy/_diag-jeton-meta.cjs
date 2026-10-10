/** Diagnostic du jeton Meta. N'affiche JAMAIS le jeton lui-meme. */
const fs = require('fs');
const env = {};
for (const l of fs.readFileSync(__dirname + '/.env', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) { let v = m[2].trim().replace(/\s+#.*$/, ''); if (/^["'].*["']$/.test(v)) v = v.slice(1, -1); env[m[1]] = v; }
}
const T = env.META_ADLIB_TOKEN, V = env.META_API_VERSION || 'v23.0';
if (!T) { console.log('META_ADLIB_TOKEN toujours vide dans .env'); process.exit(1); }
console.log(`jeton present : ${T.length} caracteres, commence par « ${T.slice(0, 4)}… »`);
const net = (s) => String(s).split(T).join('***');

(async () => {
  for (const [titre, url] of [
    ['identite du porteur (/me)', `https://graph.facebook.com/${V}/me?fields=id,name&access_token=${T}`],
    ['nature du jeton (/debug_token)', `https://graph.facebook.com/${V}/debug_token?input_token=${T}&access_token=${T}`],
  ]) {
    console.log(`\n=== ${titre} ===`);
    try {
      const r = await fetch(url);
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch (e) {}
      if (!j) { console.log(`HTTP ${r.status} : ${net(t).slice(0, 300)}`); continue; }
      if (j.error) { console.log(`HTTP ${r.status} — ${j.error.type} ${j.error.code}/${j.error.error_subcode || '-'} : ${net(j.error.message)}`); continue; }
      const d = j.data || j;
      const vu = {
        type: d.type, app_id: d.app_id, application: d.application,
        user_id: d.user_id, id: d.id, name: d.name,
        valide: d.is_valid, expire_le: d.expires_at ? new Date(d.expires_at * 1000).toISOString().slice(0, 10) : undefined,
        expire_data_le: d.data_access_expires_at ? new Date(d.data_access_expires_at * 1000).toISOString().slice(0, 10) : undefined,
        permissions: d.scopes,
      };
      for (const [k, v] of Object.entries(vu)) if (v !== undefined) console.log(`  ${k.padEnd(16)} ${Array.isArray(v) ? v.join(', ') : v}`);
    } catch (e) { console.log('erreur reseau : ' + net(e.message)); }
  }
})();
