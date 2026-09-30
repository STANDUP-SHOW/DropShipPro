/**
 * Banc du RPA des commandes fournisseurs : la vraie fenêtre Electron, le vrai
 * pilote (pilote-achat.js) et la vraie séquence (commande.js) contre une réplique
 * locale de boutique (banc/faux-fournisseur.html).
 *
 * Ce qu'il prouve : variante cliquée par son nom, article au panier, commande
 * lancée, adresse du client posée champ par champ, ARRÊT à l'écran de paiement
 * sans jamais cliquer « Payer », et les arrêts propres (session absente, variante à
 * décider, variante introuvable). Ce qu'il ne prouve pas : qu'un vrai fournisseur
 * a cette structure — la fenêtre reste ouverte pour que le vendeur finisse.
 *
 * Lancer : npm run check:achats   (= electron check-achats.cjs, profil jetable)
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { app } = require('electron')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-achats-')))

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail && !condition ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

async function main() {
  const recus = []
  const gabarit = fs.readFileSync(path.join(__dirname, 'banc', 'faux-fournisseur.html'), 'utf8')
  const serveur = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/etat') {
      let corps = ''
      req.on('data', (d) => (corps += d))
      req.on('end', () => (recus.push(JSON.parse(corps)), res.writeHead(200).end('{}')))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    if (req.url.startsWith('/connexion')) return res.end('<!doctype html><title>Connexion</title><form><input name="email"><input name="pass" type="password"></form>')
    res.end(gabarit)
  })
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${serveur.address().port}`

  const { preparer } = require('./lib/commande')
  const { creerPiloteAchat } = require('./lib/pilote-achat')
  const { champsAdresse, varianteADecider, estPaiement } = require('./lib/achats')

  console.log('Logique pure')
  const achat = {
    id: 'vente-1',
    buyerName: 'Alice Dupont',
    buyerAddress: { street: '12 rue des Lilas', zip: '75011', city: 'Paris', country: 'France', phone: '0612345678' },
    variante: 'Noir',
    produit: { id: 'p1', titre: 'Lampe', sourceUrl: `${base}/produit#produit`, fournisseur: 'faux-fournisseur', variantes: [{ nom: 'Couleur', valeurs: ['Noir', 'Blanc'] }] },
  }
  verifier('l’adresse devient des champs (prénom, nom, rue, code postal, ville, pays, téléphone), rien de vide', champsAdresse(achat).map((c) => c.cle).join() === 'nomComplet,prenom,nom,rue,codePostal,ville,pays,telephone')
  verifier('variante à décider : oui sans variante fixée, non quand elle l’est ou sans variantes', varianteADecider({ ...achat, variante: null }) && !varianteADecider(achat) && !varianteADecider({ ...achat, variante: null, produit: { ...achat.produit, variantes: [] } }))
  verifier('« Payer maintenant », « Place order », « Confirmer la commande » : jamais cliqués ; « Passer la commande » : oui', estPaiement('Payer maintenant') && estPaiement('Place your order') && estPaiement('Confirmer la commande') && !estPaiement('Passer la commande') && !estPaiement('Ajouter au panier'))

  const fauxApi = () => {
    const appels = []
    return { appels, resultatAchat: async (id, statut, x) => appels.push({ id, statut, x }) }
  }
  const dernierVu = () => recus[recus.length - 1] || {}

  console.log('\nLe parcours complet : variante, panier, commande, adresse, arrêt au paiement')
  let pilote = creerPiloteAchat({ attendreMs: 1200 })
  let api = fauxApi()
  let r = await preparer({ api, pilote, achat, attenteMs: 1200 })
  let vu = dernierVu()
  verifier('statut « preparee », message qui renvoie le paiement au vendeur', r.statut === 'preparee' && /paiement vous-même/.test(r.raison), JSON.stringify(r))
  verifier('la variante « Noir » a été cliquée par son nom', vu.variante === 'Noir', JSON.stringify(vu))
  verifier('un seul « Ajouter au panier », un seul « Passer la commande », un seul « Continuer »', vu.panier === 1 && vu.commander === 1 && vu.continuer === 1, JSON.stringify(vu))
  verifier('l’adresse du client est posée champ par champ (autocomplete)', vu.adresse.firstName === 'Alice' && vu.adresse.lastName === 'Dupont' && vu.adresse.address1 === '12 rue des Lilas' && vu.adresse.zip === '75011' && vu.adresse.city === 'Paris' && vu.adresse.phone === '0612345678', JSON.stringify(vu.adresse))
  verifier('arrêt sur l’écran de paiement : « Payer » jamais cliqué', vu.page === 'paiement' && vu.paye === 0, JSON.stringify(vu))
  verifier('le serveur est informé : PREPARED avec l’adresse de l’écran de paiement', api.appels.length === 1 && api.appels[0].statut === 'PREPARED' && /paiement/.test(api.appels[0].x), JSON.stringify(api.appels))
  pilote.fermer()

  console.log('\nLes arrêts propres')
  pilote = creerPiloteAchat({ attendreMs: 800 })
  api = fauxApi()
  r = await preparer({ api, pilote, achat: { ...achat, variante: 'Rouge' }, attenteMs: 800 })
  verifier('variante introuvable sur la fiche : « a_completer », rien au panier, FAILED expliqué au serveur', r.statut === 'a_completer' && r.manque.join() === 'variante' && dernierVu().panier === 0 && api.appels[0].statut === 'FAILED' && /Rouge/.test(api.appels[0].x), JSON.stringify(r))
  pilote.fermer()

  pilote = creerPiloteAchat({ attendreMs: 800 })
  r = await preparer({ api: fauxApi(), pilote, achat: { ...achat, variante: null }, attenteMs: 800 })
  verifier('produit à variantes sans variante fixée : jamais devinée, le vendeur choisit', r.statut === 'a_completer' && r.manque.join() === 'variante' && dernierVu().panier === 0, JSON.stringify(r))
  pilote.fermer()

  pilote = creerPiloteAchat({ attendreMs: 800 })
  r = await preparer({ api: fauxApi(), pilote, achat: { ...achat, produit: { ...achat.produit, sourceUrl: `${base}/connexion` } }, attenteMs: 800 })
  verifier('page de connexion du fournisseur : « connexion », le vendeur se connecte dans la fenêtre', r.statut === 'connexion' && /connectez-vous/.test(r.raison), JSON.stringify(r))
  pilote.fermer()

  pilote = creerPiloteAchat({ attendreMs: 800 })
  r = await preparer({ api: fauxApi(), pilote, achat: { ...achat, variante: null, produit: { ...achat.produit, variantes: null, sourceUrl: `${base}/produit#panier` } }, attenteMs: 800 })
  verifier('fiche sans bouton panier reconnu : « a_completer », la main au vendeur', r.statut === 'a_completer' && r.manque.join() === 'panier', JSON.stringify(r))
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
      console.log(echecs ? `\n${echecs} attente(s) manquée(s).` : '\nRPA des commandes fournisseurs : tout passe.')
      app.exit(echecs ? 1 : 0)
    }),
)
app.on('window-all-closed', () => undefined)
