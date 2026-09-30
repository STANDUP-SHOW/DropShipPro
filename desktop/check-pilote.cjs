/**
 * Banc du PILOTE RÉEL : la vraie fenêtre Electron, le vrai `pilote-electron.js`, le
 * vrai exécuteur, contre une réplique locale du formulaire Facebook Marketplace
 * (banc/faux-facebook.html, structure relevée sur la vraie page le 30/09/2026).
 *
 * Ce qu'il prouve : les fonctions de page s'exécutent dans Electron, les valeurs
 * posées sont vues comme des saisies, les photos arrivent par le protocole de
 * débogage, catégorie et état se règlent, « Suivant » grisé est attendu, « Publier »
 * n'est cliqué qu'une fois. Ce qu'il ne prouve pas : que Facebook accepte l'annonce.
 *
 * Lancer : npm run check:pilote   (= electron check-pilote.cjs, profil jetable)
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { app } = require('electron')

const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-pilote-'))
app.setPath('userData', profil)

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail && !condition ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

// A valid 1×1 JPEG: what the fake "download" hands back for each photo.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=', 'base64')

async function main() {
  const recus = []
  const gabarit = fs.readFileSync(path.join(__dirname, 'banc', 'faux-facebook.html'), 'utf8')
  const serveur = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/etat') {
      let corps = ''
      req.on('data', (d) => (corps += d))
      req.on('end', () => (recus.push(JSON.parse(corps)), res.writeHead(200).end('{}')))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    if (req.url.startsWith('/marketplace/create/item')) return res.end(gabarit)
    // Logged out, the real Facebook lands on the Marketplace home with a login form (probed 2026-09-30).
    if (req.url.startsWith('/marketplace/?')) return res.end('<!doctype html><title>Facebook Marketplace</title><form><input name="email"><input name="pass" type="password"></form><p>Se connecter</p>')
    if (req.url.startsWith('/login')) return res.end('<!doctype html><title>Se connecter à Facebook</title><form><input name="email"><input name="pass" type="password"></form>')
    if (req.url.startsWith('/captcha')) return res.end('<!doctype html><title>Vérification</title><p>Vérification de sécurité : confirmez que vous êtes un humain.</p>')
    res.end('<!doctype html><title>Vos annonces</title><p>Vos annonces</p>')
  })
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${serveur.address().port}`

  const { ADAPTATEURS } = require('./lib/adaptateurs')
  const plafonds = require('./lib/plafonds')
  const config = require('./lib/config')
  const { traiter } = require('./lib/executeur')
  const { creerPilote } = require('./lib/pilote-electron')

  const telecharger = async () => ({ ok: true, arrayBuffer: async () => JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.byteLength) })
  const fauxApi = () => {
    const appels = []
    return { appels, resultat: async (id, statut, x) => appels.push({ id, statut, x }) }
  }
  const annonce = {
    id: 'pub-banc', productId: 'prod-banc', platform: 'FACEBOOK',
    title: 'Lampe de bureau LED orientable', description: 'Lampe LED, bras orientable.\nTrois intensités.', price: 24.9,
    category: 'Maison et jardin > Éclairage > Lampes', condition: 'Neuf',
    images: ['https://exemple.test/a.jpg', 'https://exemple.test/b.jpg'],
  }
  const dossier = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-pilote-ex-'))
  const auto = plafonds.accorder({ ...config.PAR_DEFAUT }, 'FACEBOOK', new Date())
  const lancer = (pilote, cfg, api, d = dossier()) => traiter({ api, pilote, plateforme: 'FACEBOOK', annonce, config: cfg, etat: { arrets: {} }, dossier: d, essais: 1 })

  console.log('Mode « Préparer » : le formulaire est rempli, rien n’est publié')
  ADAPTATEURS.FACEBOOK.formulaire = `${base}/marketplace/create/item`
  let pilote = creerPilote({ telecharger, attendreMs: 1500 })
  let api = fauxApi()
  let r = await lancer(pilote, { ...config.PAR_DEFAUT }, api)
  verifier('statut « preparee »', r.statut === 'preparee', JSON.stringify(r))
  const { BrowserWindow } = require('electron')
  const lireVu = async () => JSON.parse(await BrowserWindow.getAllWindows()[0].webContents.executeJavaScript('JSON.stringify(window.__vu || null)'))
  let vu = await lireVu()
  verifier('titre, prix et description vus comme des saisies', vu.titre === annonce.title && vu.prix === '25' && vu.description === annonce.description, JSON.stringify(vu))
  verifier('catégorie choisie dans la liste de la page (suffixe « Livraison possible » ignoré)', vu.categorie === 'Pour la maison', vu.categorie)
  verifier('état choisi dans la liste de la page', vu.etat === 'Neuf', vu.etat)
  verifier('les deux photos posées sur le champ fichier', vu.photos === 2, String(vu.photos))
  verifier('aucun clic sur « Suivant » ni « Publier », serveur non prévenu', vu.clicsSuivant === 0 && vu.clicsPublier === 0 && recus.length === 0 && api.appels.length === 0)
  pilote.fermer()

  console.log('\nMode automatique : « Suivant » grisé attendu, puis un seul « Publier »')
  pilote = creerPilote({ telecharger, attendreMs: 1500 })
  api = fauxApi()
  r = await lancer(pilote, auto, api)
  verifier('statut « publiee »', r.statut === 'publiee', JSON.stringify(r))
  verifier('la page a reçu UN clic « Publier » avec tous les champs', recus.length === 1 && recus[0].clicsPublier === 1 && recus[0].clicsSuivant === 1 && recus[0].titre === annonce.title && recus[0].categorie === 'Pour la maison' && recus[0].etat === 'Neuf' && recus[0].photos === 2, JSON.stringify(recus))
  verifier('le serveur est informé : PUBLISHED avec l’adresse d’arrivée', api.appels.length === 1 && api.appels[0].statut === 'PUBLISHED' && /you\/selling/.test(api.appels[0].x), JSON.stringify(api.appels))
  pilote.fermer()

  console.log('\nCatégorie introuvable : rien n’est publié')
  pilote = creerPilote({ telecharger, attendreMs: 1500 })
  api = fauxApi()
  const sansFourreTout = ADAPTATEURS.FACEBOOK.categorie.fourreTout
  ADAPTATEURS.FACEBOOK.categorie.fourreTout = []
  r = await traiter({ api, pilote, plateforme: 'FACEBOOK', annonce: { ...annonce, category: 'Zzz', title: 'Qqq' }, config: auto, etat: { arrets: {} }, dossier: dossier(), essais: 1 })
  ADAPTATEURS.FACEBOOK.categorie.fourreTout = sansFourreTout
  verifier('« a_valider » : catégorie (et la description, qui n’apparaît qu’après elle)', r.statut === 'a_valider' && r.manque.includes('categorie') && recus.length === 1, JSON.stringify(r))
  pilote.fermer()

  console.log('\nSession absente : ni publication, ni pause')
  ADAPTATEURS.FACEBOOK.formulaire = `${base}/marketplace/?deconnecte`
  pilote = creerPilote({ telecharger, attendreMs: 800 })
  let d = dossier()
  r = await lancer(pilote, auto, fauxApi(), d)
  verifier('« a_valider » avec « connexion », message lisible', r.statut === 'a_valider' && r.manque.join() === 'connexion' && /Ouvrir Facebook/.test(r.raison), JSON.stringify(r))
  verifier('aucune pause de sécurité posée', !plafonds.lireEtat(d).arrets.FACEBOOK)
  pilote.fermer()

  console.log('\nMur anti-robot : pause, jamais forcé')
  ADAPTATEURS.FACEBOOK.formulaire = `${base}/captcha`
  pilote = creerPilote({ telecharger, attendreMs: 800 })
  d = dossier()
  r = await lancer(pilote, auto, fauxApi(), d)
  verifier('statut « pause », plateforme arrêtée, rien publié', r.statut === 'pause' && !!plafonds.lireEtat(d).arrets.FACEBOOK && recus.length === 1, JSON.stringify(r))
  pilote.fermer()

  serveur.close()
}

app.whenReady().then(() =>
  main()
    .catch((e) => {
      console.error('ECHEC', e)
      echecs++
    })
    .finally(() => {
      console.log(echecs ? `\n${echecs} attente(s) manquée(s).` : '\nPilote réel : tout passe.')
      app.exit(echecs ? 1 : 0)
    }),
)
app.on('window-all-closed', () => undefined) // the bench decides when to quit
