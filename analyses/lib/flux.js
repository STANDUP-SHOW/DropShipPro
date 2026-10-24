'use strict'
/**
 * The feed of a project: every validated report is POSTed to the site's
 * receiving address, signed with the project's secret.
 *
 * A PC behind a home box cannot serve a public address without a paid service
 * or a tunnel, so the feed is pushed, never pulled. The project folder gets the
 * same files anyway: a site that cannot receive yet can read the folder.
 *
 * Signature: HMAC-SHA256(secret, `${horodatage}.${corps}`) in hex, sent as
 * `X-Kantix-Signature: sha256=<hex>` with `X-Kantix-Horodatage` (ms since epoch).
 * The site recomputes it on the raw body and refuses anything older than 5 minutes.
 */
const crypto = require('node:crypto')

const VERSION_FORMAT = 1

function signer(secret, horodatage, corps) {
  return crypto.createHmac('sha256', secret).update(`${horodatage}.${corps}`).digest('hex')
}

/** What the site receives (the folder's .json is the same object). */
function charge(rapport) {
  return {
    kantix: VERSION_FORMAT,
    type: 'rapport',
    projet: rapport.projet,
    analyse: rapport.analyse,
    date: rapport.date,
    ecritLe: rapport.ecritLe,
    titre: rapport.titre,
    resume: rapport.resume,
    markdown: rapport.markdown,
    donnees: rapport.donnees,
    sources: rapport.sources,
    moteur: rapport.moteur,
  }
}

async function poster({ adresse, secret, objet, projetId, fetchImpl = fetch }) {
  if (!adresse) throw new Error('Pas d’adresse de réception pour ce projet (onglet Projets).')
  if (!secret) throw new Error('Secret du flux absent : « Générer le secret » dans le projet.')
  const corps = JSON.stringify(objet)
  const horodatage = String(Date.now())
  let rep
  try {
    rep = await fetchImpl(adresse, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kantix-horodatage': horodatage, 'x-kantix-signature': `sha256=${signer(secret, horodatage, corps)}`, 'x-kantix-projet': projetId || '' },
      body: corps,
    })
  } catch (err) {
    throw new Error(`Site injoignable (${String((err && err.cause && err.cause.code) || (err && err.message) || err)}).`)
  }
  const texte = await rep.text().catch(() => '')
  if (!rep.ok) throw new Error(`Le site a refusé le flux (${rep.status}) : ${texte.slice(0, 200) || 'sans message'}`)
  return { statut: rep.status, reponse: texte.slice(0, 500) }
}

const envoyerRapport = ({ adresse, secret, rapport, fetchImpl }) => poster({ adresse, secret, objet: charge(rapport), projetId: rapport.projet && rapport.projet.id, fetchImpl })
const envoyerTest = ({ adresse, secret, projet, fetchImpl }) => poster({ adresse, secret, objet: { kantix: VERSION_FORMAT, type: 'test', projet: { id: projet.id, nom: projet.nom }, ecritLe: new Date().toISOString() }, projetId: projet.id, fetchImpl })

/** The page handed to the site's developer (written in the project folder, no secret inside). */
function ficheTechnique(projet) {
  const adresse = projet.flux.adresse || `${projet.url || 'https://votre-site'}/api/kantix/flux`
  return `# Flux KANTIX ANALYSER — ${projet.nom}

KANTIX ANALYSER envoie chaque rapport validé de ce projet à :

    POST ${adresse}

## Requête

En-têtes :

- \`Content-Type: application/json\`
- \`X-Kantix-Horodatage\` : millisecondes depuis 1970 (chaîne)
- \`X-Kantix-Signature\` : \`sha256=\` + HMAC-SHA256 hexadécimal de \`<horodatage>.<corps brut>\`, clé = le secret du projet
- \`X-Kantix-Projet\` : \`${projet.id}\`

Le secret se copie dans KANTIX (Projets › ${projet.nom} › « Copier le secret »). Il ne figure dans aucun fichier.
À poser côté site dans une variable d'environnement, par exemple \`KANTIX_SECRET\`.

Corps :

\`\`\`json
{
  "kantix": 1,
  "type": "rapport",
  "projet": { "id": "${projet.id}", "nom": "${projet.nom}", "url": "${projet.url || ''}" },
  "analyse": { "id": "…", "nom": "…" },
  "date": "AAAA-MM-JJ",
  "ecritLe": "2026-10-24T22:00:00.000Z",
  "titre": "…",
  "resume": "…",
  "markdown": "# Rapport complet en Markdown…",
  "donnees": { },
  "sources": ["https://…"],
  "moteur": { "fournisseur": "anthropic", "modele": "…" }
}
\`\`\`

\`"type": "test"\` est envoyé par le bouton « Tester le flux » : répondre 200 sans rien ranger.
Un même rapport peut être renvoyé (bouton « Renvoyer ») : le ranger par \`analyse.id\` + \`ecritLe\`.

## Réponse attendue

2xx = reçu. Tout autre code est affiché à l'équipe dans KANTIX et le rapport reste dans le dossier du projet.

## Vérifier la signature (Node, Express)

\`\`\`js
const crypto = require('node:crypto')
app.post('/api/kantix/flux', express.raw({ type: 'application/json', limit: '5mb' }), (req, res) => {
  const ts = String(req.get('x-kantix-horodatage') || '')
  const recu = String(req.get('x-kantix-signature') || '').replace(/^sha256=/, '')
  const attendu = crypto.createHmac('sha256', process.env.KANTIX_SECRET).update(ts + '.' + req.body.toString('utf8')).digest('hex')
  const ok = recu.length === attendu.length && crypto.timingSafeEqual(Buffer.from(recu), Buffer.from(attendu))
  if (!ok || Math.abs(Date.now() - Number(ts)) > 5 * 60e3) return res.status(401).json({ error: 'signature invalide' })
  const rapport = JSON.parse(req.body.toString('utf8'))
  if (rapport.type === 'test') return res.json({ ok: true })
  // … ranger le rapport (base, fichier) …
  res.json({ ok: true })
})
\`\`\`
`
}

module.exports = { signer, charge, envoyerRapport, envoyerTest, ficheTechnique, VERSION_FORMAT }
