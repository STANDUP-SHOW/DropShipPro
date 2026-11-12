/**
 * Banc : la newsletter envoyée depuis Kantix (12/11/2026).
 *
 * Prouve, sans base (DATABASE_URL inutile) :
 *  - chaque exemplaire porte SON lien de désinscription (marque {{desinscription}}
 *    remplacée, sinon pied ajouté avant </body>) ;
 *  - le jeton est une signature : celui d'une autre adresse est refusé ;
 *  - un lien modifié rend la page « Lien invalide » (400) sans toucher la base ;
 *  - les avertissements signalent images locales et scripts.
 */
import type { AddressInfo } from 'node:net'

process.env.JWT_SECRET = 'banc-newsletter'
process.env.FRONTEND_URL = 'https://www.drop-shipper.fr'

const nl = await import('./src/services/newsletter.js')
const { default: express } = await import('express')
const { publicRouter } = await import('./src/routes/public.js')

let echecs = 0
function exige(condition: boolean, nom: string) {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}`)
  if (!condition) echecs++
}

const a = 'A@Exemple.test'
const lienA = nl.lienDesinscription(a)
exige(lienA.startsWith('https://www.drop-shipper.fr/api/public/newsletter/desinscription?e=a%40exemple.test&t='), 'lien sur le domaine du site, adresse normalisée')
exige(nl.jetonValide('a@exemple.test', nl.jetonDesinscription(a)), 'jeton de l’adresse accepté')
exige(!nl.jetonValide('b@exemple.test', nl.jetonDesinscription(a)), 'jeton d’une autre adresse refusé')
exige(!nl.jetonValide('a@exemple.test', ''), 'jeton vide refusé')

const avecMarque = '<html><body><p>Bonjour</p><a href="{{desinscription}}">stop</a></body></html>'
const h1 = nl.htmlPourDestinataire(avecMarque, a)
exige(!h1.includes('{{desinscription}}') && h1.includes(nl.jetonDesinscription(a)) && !h1.includes('Se désinscrire de la newsletter'), 'marque remplacée, pas de pied en double')
const sansMarque = '<html><body><p>Bonjour</p></body></html>'
const h2 = nl.htmlPourDestinataire(sansMarque, a)
exige(/Se désinscrire de la newsletter<\/a><\/div><\/body>/.test(h2), 'pied de désinscription ajouté avant </body>')
exige(nl.htmlPourDestinataire('<p>nu</p>', a).includes('Se désinscrire'), 'HTML sans <body> : pied ajouté à la fin')
exige(nl.htmlPourDestinataire(sansMarque, 'b@exemple.test') !== h2, 'chaque destinataire a son propre lien')
const texte = nl.texteDe('<style>p{}</style><p>Bonjour&nbsp;vous</p>', a)
exige(texte.startsWith('Bonjour vous') && texte.includes(lienA), 'version texte lisible avec le lien')

const av = nl.avertissements('<img src="images/a.png"><img src="https://x/y.png"><script>1</script>')
exige(av.length === 2 && /1 image/.test(av[0]), 'image locale et script signalés')
exige(nl.avertissements('<img src="https://x/y.png">').length === 0, 'fichier propre : aucun avertissement')

const app = express()
app.use('/api/public', publicRouter)
const serveur = app.listen(0)
const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api/public`
const r = await fetch(`${base}/newsletter/desinscription?e=a%40exemple.test&t=faux`)
exige(r.status === 400 && (await r.text()).includes('Lien invalide'), 'lien modifié : 400 et page lisible, rien écrit')
serveur.close()

// welcome e-mail imported in Kantix: refused without the confirmation link, then read back
const os = await import('node:os'); const pathMod = await import('node:path'); const fsMod = await import('node:fs')
const eb = await import('./src/services/emailBienvenue.js')
const chemin = pathMod.join(fsMod.mkdtempSync(pathMod.join(os.tmpdir(), 'bienvenue-')), 'emails', 'bienvenue.json')
let refuse = false
try { await eb.ecrireBienvenue('Bienvenue', '<html><body><a href="https://x">ok</a></body></html>', chemin) } catch (e) { refuse = e instanceof eb.ModeleRefuse }
exige(refuse && (await eb.lireBienvenue(chemin)) === null, 'modèle de bienvenue sans {{lien_confirmation}} refusé, rien écrit')
await eb.ecrireBienvenue('Bienvenue', '<html><body><a href="{{lien_confirmation}}">Confirmer</a></body></html>', chemin)
exige((await eb.lireBienvenue(chemin))?.sujet === 'Bienvenue', 'modèle de bienvenue enregistré puis relu')
exige(eb.texteDeHtml('<p><a href="https://l">Confirmer</a></p>') === 'Confirmer (https://l)', 'version texte garde le lien')
await eb.effacerBienvenue(chemin)
exige((await eb.lireBienvenue(chemin)) === null, 'retour au message intégré')

if (echecs) { console.error(`${echecs} contrôle(s) en échec`); process.exit(1) }
console.log('newsletter : tout est conforme')
process.exit(0)
