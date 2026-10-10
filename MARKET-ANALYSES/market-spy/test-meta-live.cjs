/**
 * Premier appel REEL a la Meta Ad Library API.
 *
 *   cd MARKET-ANALYSES/market-spy && node test-meta-live.cjs
 *   node test-meta-live.cjs --mot "ecouteurs bluetooth" --pays FR --jours 30
 *
 * ========================================================================
 * CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS
 *
 * Le dossier market-spy dit « Non teste contre l'API reelle » pour META-SPY.
 * Ce script est ce test, et rien d'autre : un seul appel, affichage de ce qui
 * revient, aucune ecriture de rapport, aucun appel a Claude.
 *
 * Il ne REPETE JAMAIS le jeton. Ni dans la sortie, ni dans un message
 * d'erreur : l'adresse appelee est affichee avec le jeton remplace par
 * « ***». Un jeton colle dans une console finit dans un historique.
 *
 * ========================================================================
 * CE QU'IL FAUT SAVOIR AVANT DE LIRE LE RESULTAT
 *
 * `ad_type=ALL` ne rend les publicites COMMERCIALES que pour les audiences
 * de l'UE et du Royaume-Uni : c'est le DSA qui l'impose a Meta. Hors de cette
 * zone, la meme requete ne rend que les publicites politiques. Donc
 * `--pays FR` n'est pas un confort, c'est la condition pour que le rapport ait
 * un sens. Mis sur US, l'agent ramenerait des pubs electorales et le rapport
 * marketing deviendrait absurde — le script refuse donc un pays hors zone.
 *
 * `eu_total_reach` et les ventilations demographiques (target_ages,
 * target_gender, target_locations) sont des champs EXCLUSIVEMENT UE. S'ils
 * sont absents de la reponse pour la France, c'est un signal, pas un detail.
 *
 * Ce que l'API ne donne PAS, et qu'il ne faut pas attendre : aucune metrique
 * d'engagement (ni j'aime, ni commentaires, ni partages, ni taux de clic),
 * et aucune depense pour les publicites commerciales. Un agent qui en promet
 * les invente.
 */
const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------------ options
const args = process.argv.slice(2);
const opt = (nom, defaut) => {
  const i = args.indexOf('--' + nom);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
};

const MOT = opt('mot', 'ecouteurs bluetooth');
const PAYS = opt('pays', 'FR').toUpperCase();
const JOURS = Number(opt('jours', '30'));
const LIMITE = Number(opt('limite', '25'));

// La zone ou ad_type=ALL rend les pubs commerciales (UE + EEE + RU).
const ZONE_DSA = new Set(('AT BE BG CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MT ' +
  'NL NO PL PT RO SE SI SK').split(' '));
if (!ZONE_DSA.has(PAYS)) {
  console.error(`Pays ${PAYS} hors zone UE/EEE/RU.`);
  console.error('Hors de cette zone, ad_type=ALL ne rend que des publicites politiques :');
  console.error('le rapport marketing n\'aurait aucun sens. Utiliser --pays FR.');
  process.exit(1);
}

// ------------------------------------------------------------------- jeton
function lireEnv(fichier) {
  const out = {};
  if (!fs.existsSync(fichier)) return out;
  for (const ligne of fs.readFileSync(fichier, 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim().replace(/\s+#.*$/, '');
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...lireEnv(path.join(__dirname, '.env')), ...process.env };
const TOKEN = env.META_ADLIB_TOKEN;
const VERSION = env.META_API_VERSION || 'v23.0';

if (!TOKEN) {
  console.error('META_ADLIB_TOKEN absent.');
  console.error(`Colle le jeton sur la ligne META_ADLIB_TOKEN= du fichier :`);
  console.error(`  ${path.join(__dirname, '.env')}`);
  console.error('Ce fichier est ignore par git. Ne colle jamais un jeton dans une conversation.');
  process.exit(1);
}

// --------------------------------------------------------------- la requete
const CHAMPS_COMPLETS = [
  'id', 'ad_creation_time', 'ad_delivery_start_time', 'ad_delivery_stop_time',
  'ad_creative_bodies', 'ad_creative_link_titles', 'ad_creative_link_captions',
  'ad_creative_link_descriptions', 'ad_snapshot_url', 'page_id', 'page_name',
  'publisher_platforms', 'languages', 'eu_total_reach', 'target_ages',
  'target_gender', 'target_locations', 'beneficiary_payers',
].join(',');

const CHAMPS_MINIMAUX = [
  'id', 'ad_delivery_start_time', 'ad_creative_bodies', 'ad_creative_link_titles',
  'ad_snapshot_url', 'page_id', 'page_name', 'publisher_platforms', 'eu_total_reach',
].join(',');

const depuis = new Date(Date.now() - JOURS * 86400000).toISOString().slice(0, 10);

function adresse(champs) {
  const p = new URLSearchParams({
    access_token: TOKEN,
    search_terms: MOT,
    ad_type: 'ALL',
    ad_active_status: 'ACTIVE',
    ad_reached_countries: JSON.stringify([PAYS]),
    ad_delivery_date_min: depuis,
    fields: champs,
    limit: String(LIMITE),
  });
  return `https://graph.facebook.com/${VERSION}/ads_archive?${p}`;
}

/** L'adresse telle qu'on peut l'afficher : sans le jeton. */
const masquee = (url) => url.replace(/access_token=[^&]*/, 'access_token=***');

async function appel(champs) {
  const url = adresse(champs);
  console.log(`-> GET ${masquee(url).slice(0, 220)}…`);
  const r = await fetch(url);
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) { /* laisse json a null */ }
  return { statut: r.status, json, texte };
}

(async () => {
  console.log(`Meta Ad Library — mot « ${MOT} », pays ${PAYS}, depuis le ${depuis}, API ${VERSION}\n`);

  let { statut, json, texte } = await appel(CHAMPS_COMPLETS);

  // Repli documente dans le dossier market-spy : si l'API refuse un champ, on
  // retente avec la liste minimale pour distinguer « jeton invalide » de
  // « champ non autorise ».
  if (statut !== 200 && /field|param/i.test(texte)) {
    console.log('\nUn champ a ete refuse. Nouvelle tentative avec la liste minimale.\n');
    ({ statut, json, texte } = await appel(CHAMPS_MINIMAUX));
  }

  if (statut !== 200) {
    const err = json && json.error ? json.error : null;
    console.log(`\nECHEC — HTTP ${statut}`);
    if (err) {
      console.log(`  type    : ${err.type || '?'}  code ${err.code ?? '?'}${err.error_subcode ? '/' + err.error_subcode : ''}`);
      console.log(`  message : ${err.message || '?'}`);
      const m = String(err.message || '');
      if (/expired|session/i.test(m)) console.log('\n  -> Le jeton a expire. Les jetons long-lived durent ~60 jours.');
      else if (/permission|scope|verif/i.test(m)) console.log('\n  -> Verification d\'identite ou permission manquante sur l\'app Meta.');
      else if (/limit/i.test(m)) console.log('\n  -> Quota atteint (~200 appels/heure/jeton). Reessayer plus tard.');
    } else {
      console.log('  corps : ' + texte.slice(0, 300));
    }
    process.exit(1);
  }

  const pubs = (json && json.data) || [];
  console.log(`\nOK — ${pubs.length} publicite(s) active(s) rendue(s)${json.paging && json.paging.next ? ', et il y a une page suivante' : ''}\n`);

  if (!pubs.length) {
    console.log('Aucune publicite pour ce mot-cle sur la periode. Essayer un mot plus large :');
    console.log('  node test-meta-live.cjs --mot "ecouteurs" --jours 90');
    return;
  }

  // --- quels champs l'API a reellement rendus
  const presents = new Set();
  for (const p of pubs) for (const k of Object.keys(p)) presents.add(k);
  const attendus = CHAMPS_COMPLETS.split(',');
  console.log('Champs rendus   : ' + attendus.filter((c) => presents.has(c)).join(', '));
  const absents = attendus.filter((c) => !presents.has(c));
  if (absents.length) console.log('Champs ABSENTS  : ' + absents.join(', '));

  const avecPortee = pubs.filter((p) => p.eu_total_reach != null).length;
  console.log(`\nPortee UE       : renseignee sur ${avecPortee}/${pubs.length}`);
  if (!avecPortee) {
    console.log('  -> eu_total_reach vide alors que le pays est dans la zone UE : a creuser,');
    console.log('     c\'est le champ qui porte toute la mesure d\'audience.');
  }

  // --- les annonceurs, c'est eux qui interessent : ce sont les concurrents
  const parPage = new Map();
  for (const p of pubs) {
    const nom = p.page_name || `page ${p.page_id}`;
    const e = parPage.get(nom) || { nb: 0, portee: 0 };
    e.nb++;
    e.portee += Number(p.eu_total_reach || 0);
    parPage.set(nom, e);
  }
  console.log(`\nAnnonceurs (${parPage.size}) :`);
  for (const [nom, e] of [...parPage].sort((a, b) => b[1].nb - a[1].nb).slice(0, 12)) {
    console.log(`  ${String(e.nb).padStart(3)} pub(s) · portee ${String(e.portee).padStart(9)} · ${nom}`);
  }

  // --- une annonce en entier, pour juger de ce qu'on pourra en tirer
  const a = pubs[0];
  console.log('\n--- une annonce, telle quelle ---');
  console.log(`page       : ${a.page_name || '?'} (${a.page_id || '?'})`);
  console.log(`diffusion  : du ${a.ad_delivery_start_time || '?'}${a.ad_delivery_stop_time ? ' au ' + a.ad_delivery_stop_time : ' (en cours)'}`);
  console.log(`plateformes: ${(a.publisher_platforms || []).join(', ') || '?'}`);
  console.log(`portee UE  : ${a.eu_total_reach ?? 'absente'}`);
  console.log(`titre      : ${(a.ad_creative_link_titles || [])[0] || '—'}`);
  console.log(`texte      : ${String((a.ad_creative_bodies || [])[0] || '—').replace(/\s+/g, ' ').slice(0, 300)}`);
  console.log(`visuel     : ${a.ad_snapshot_url || '—'}`);

  console.log('\nRappel : cette API ne donne AUCUNE metrique d\'engagement (j\'aime,');
  console.log('commentaires, partages, taux de clic) ni depense pour les pubs commerciales.');
})().catch((e) => {
  console.error('\nECHEC — ' + String(e && e.message ? e.message : e).replace(TOKEN, '***'));
  process.exit(1);
});
