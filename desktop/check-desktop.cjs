/**
 * Banc de l'application desktop : la logique pure (config, API, file,
 * garde-fous du mode automatique). Ne lance pas Electron.
 * Lancer : node check-desktop.cjs
 */
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const config = require('./lib/config')
const { client } = require('./lib/api')
const file = require('./lib/file')
const p = require('./lib/plafonds')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail && !condition ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

async function main() {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-desktop-'))

  console.log('Configuration')
  let c = config.charger(dossier)
  verifier('valeurs par défaut : l’API de production', c.apiBase === 'https://api.drop-shipper.fr' && !config.lireCle(c, null))
  const coffre = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(`chiffre:${s}`), decryptString: (b) => b.toString().replace('chiffre:', '') }
  c = config.poserCle(c, 'dsp_live_secret', coffre)
  config.enregistrer(dossier, c)
  const brut = fs.readFileSync(path.join(dossier, 'config.json'), 'utf8')
  verifier('clé chiffrée par le coffre : jamais en clair dans le fichier', !brut.includes('dsp_live_secret') && config.lireCle(config.charger(dossier), coffre) === 'dsp_live_secret')
  verifier('sans coffre, la clé reste lisible (banc)', config.lireCle(config.poserCle(config.PAR_DEFAUT, 'k', null), null) === 'k')

  console.log('\nClient API (contre un faux serveur)')
  const appels = []
  const serveur = http.createServer((req, res) => {
    appels.push({ m: req.method, u: req.url, auth: req.headers.authorization })
    if (req.headers.authorization !== 'Bearer bonne') {
      res.writeHead(401).end('{}')
      return
    }
    if (req.url === '/api/agent/me') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ email: 'a@b.c', credits: 5 }))
    if (req.url.startsWith('/api/agent/share?')) {
      return res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({ count: 3, links: [{ id: 'l1', url: 'https://exemple.test/produit' }, { id: 'l2', url: 'javascript:alert(1)' }, { id: 'l3', url: 'file:///C:/secret.txt' }] }),
      )
    }
    if (req.method === 'POST' && req.url === '/api/agent/share/l1/claim') return res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}')
    res.writeHead(404).end('{}')
  })
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${serveur.address().port}`

  const api = client({ apiBase: base, cle: 'bonne' })
  verifier('me() lit le compte avec la clé en Bearer', (await api.me()).email === 'a@b.c' && appels[0].auth === 'Bearer bonne')
  const mauvais = client({ apiBase: base, cle: 'fausse' })
  let refus = null
  try {
    await mauvais.me()
  } catch (e) {
    refus = e
  }
  verifier('clé refusée : le geste est dit', refus && refus.statut === 401 && /Réglages/.test(refus.message))
  const hors = client({ apiBase: 'http://127.0.0.1:1', cle: 'bonne' })
  let injoignable = null
  try {
    await hors.me()
  } catch (e) {
    injoignable = e
  }
  verifier('serveur injoignable : message clair, statut 0', injoignable && injoignable.statut === 0 && /injoignable/.test(injoignable.message))

  console.log('\nFile de travail')
  const vus = new Set()
  const r1 = await file.passage(api, vus)
  verifier('seuls les liens http(s) sortent : javascript: et file: écartés', r1.liens.length === 1 && r1.liens[0].id === 'l1' && r1.total === 3)
  const r2 = await file.passage(api, vus)
  verifier('un lien déjà présenté n’est pas représenté', r2.liens.length === 0)
  const r3 = await file.passage(mauvais, new Set())
  verifier('une erreur ne casse pas la boucle : elle est rendue', r3.erreur && r3.liens.length === 0)
  await api.reclamer('l1', 'DONE')
  verifier('marquer terminé : POST /share/l1/claim avec DONE', appels.some((a) => a.m === 'POST' && a.u === '/api/agent/share/l1/claim'))
  serveur.close()

  console.log('\nMode automatique — les garde-fous')
  const midi = new Date(2026, 8, 30, 12, 0, 0)
  const plus = (min) => new Date(midi.getTime() + min * 60_000)
  let cfg = { ...config.PAR_DEFAUT }
  let etat = { arrets: {} }
  verifier('sans accord explicite : refusé', p.decision({ plateforme: 'VINTED', config: cfg, maintenant: midi }).ok === false && /accord/.test(p.decision({ plateforme: 'VINTED', config: cfg, maintenant: midi }).raison))
  cfg = p.accorder(cfg, 'VINTED', midi)
  verifier('l’accord garde sa date et le texte accepté (risque de suspension)', cfg.accords.VINTED.at === midi.toISOString() && /restreindre/.test(cfg.accords.VINTED.texte))
  verifier('avec accord et journal vide : autorisé', p.decision({ plateforme: 'VINTED', config: cfg, maintenant: midi }).ok === true)
  verifier('l’accord Vinted ne vaut pas pour Leboncoin', p.decision({ plateforme: 'LEBONCOIN', config: cfg, maintenant: midi }).ok === false)

  const publi = (min, plateforme = 'VINTED') => ({ type: 'publication', plateforme, at: plus(min).toISOString() })
  const espace = p.decision({ plateforme: 'VINTED', config: cfg, journal: [publi(0)], maintenant: plus(5) })
  verifier('espacement de 20 min : attente dite et chiffrée', !espace.ok && espace.attenteMs === 15 * 60_000 && /Espacement/.test(espace.raison), JSON.stringify(espace))
  verifier('20 min écoulées : autorisé', p.decision({ plateforme: 'VINTED', config: cfg, journal: [publi(0)], maintenant: plus(20) }).ok === true)

  const dix = Array.from({ length: 10 }, (_, i) => ({ type: 'publication', plateforme: 'VINTED', at: new Date(2026, 8, 30, 8, i * 20).toISOString() }))
  const plein = p.decision({ plateforme: 'VINTED', config: cfg, journal: dix, maintenant: new Date(2026, 8, 30, 13, 0) })
  verifier('plafond du jour (10 sur Vinted) : refusé jusqu’à minuit', !plein.ok && /Plafond/.test(plein.raison) && plein.attenteMs === 11 * 3600_000, JSON.stringify(plein))
  verifier('le lendemain, le compteur repart', p.decision({ plateforme: 'VINTED', config: cfg, journal: dix, maintenant: new Date(2026, 9, 1, 9, 0) }).ok === true)
  verifier('les autres événements (alerte, essai) ne comptent pas', p.decision({ plateforme: 'VINTED', config: cfg, journal: dix.map((e) => ({ ...e, type: 'alerte' })), maintenant: plus(0) }).ok === true)

  const gourmand = { ...cfg, plafonds: { VINTED: 500 } }
  verifier('le vendeur ne peut pas dépasser le plafond dur (15 sur Vinted)', p.plafondEffectif('VINTED', gourmand) === 15)
  verifier('il peut le baisser', p.plafondEffectif('VINTED', { plafonds: { VINTED: 3 } }) === 3)

  console.log('\nBlocages — arrêt au premier signe, reprise manuelle')
  verifier('captcha vu sur la page', p.detecterBlocage({ url: 'https://www.leboncoin.fr/captcha/x' }).bloque)
  verifier('DataDome dans le texte', p.detecterBlocage({ texte: 'Please enable JS ... datadome' }).bloque)
  verifier('« vérification de sécurité »', p.detecterBlocage({ titre: 'Vérification de sécurité' }).bloque)
  verifier('compte suspendu', p.detecterBlocage({ texte: 'Votre compte suspendu pour activité suspecte' }).bloque)
  verifier('une page normale ne déclenche rien', !p.detecterBlocage({ url: 'https://www.vinted.fr/items/123', titre: 'Lampe - Vinted', texte: 'Ajouter au panier, prix 25 €' }).bloque)
  etat = p.arreter(etat, 'VINTED', 'captcha', plus(1))
  const stop = p.decision({ plateforme: 'VINTED', config: cfg, etat, maintenant: plus(61) })
  verifier('après un blocage : pause de sécurité de 6 h, l’attente est chiffrée', !stop.ok && /Pause de sécurité/.test(stop.raison) && stop.attenteMs === 6 * 3600_000 - 60 * 60_000, JSON.stringify(stop))
  verifier('la pause passée (6 h), l’agent retente TOUT SEUL, sans reprise manuelle', p.decision({ plateforme: 'VINTED', config: cfg, etat, maintenant: plus(6 * 60 + 2) }).ok === true)
  const deuxieme = p.arreter(etat, 'VINTED', 'captcha encore', plus(6 * 60 + 2))
  verifier('mur toujours là : la pause double (12 h), jusqu’à 48 h au plus', new Date(deuxieme.arrets.VINTED.jusqua).getTime() - plus(6 * 60 + 2).getTime() === 12 * 3600_000 && deuxieme.arrets.VINTED.tentatives === 2)
  let sept = etat
  for (let i = 0; i < 8; i++) sept = p.arreter(sept, 'VINTED', 'x', midi)
  verifier('la pause ne dépasse jamais 48 h', new Date(sept.arrets.VINTED.jusqua).getTime() - midi.getTime() === 48 * 3600_000)
  verifier('l’arrêt d’une plateforme ne touche pas les autres', p.decision({ plateforme: 'LEBONCOIN', config: p.accorder(cfg, 'LEBONCOIN', midi), etat, maintenant: plus(500) }).ok === true)
  etat = p.reprendre(etat, 'VINTED')
  verifier('reprise manuelle : autorisé de nouveau', p.decision({ plateforme: 'VINTED', config: cfg, etat, maintenant: plus(500) }).ok === true)
  verifier('retirer l’accord bloque aussitôt', p.decision({ plateforme: 'VINTED', config: p.retirerAccord(cfg, 'VINTED'), maintenant: plus(500) }).ok === false)

  console.log('\nJournal et état persistants')
  p.journaliser(dossier, { type: 'publication', plateforme: 'VINTED', produit: 'p1' }, midi)
  p.journaliser(dossier, { type: 'alerte', plateforme: 'VINTED', raison: 'captcha' }, plus(2))
  const j = p.lireJournal(dossier)
  verifier('le journal garde chaque événement, dans l’ordre', j.length === 2 && j[0].type === 'publication' && j[1].raison === 'captcha' && j[0].at === midi.toISOString())
  p.ecrireEtat(dossier, etat)
  verifier('l’état survit à un redémarrage', JSON.stringify(p.lireEtat(dossier)) === JSON.stringify(etat))
  p.ecrireEtat(dossier, p.arreter(etat, 'FACEBOOK', 'blocage'))
  verifier('un arrêt écrit est relu tel quel', !!p.lireEtat(dossier).arrets.FACEBOOK)

  console.log('\nPlateformes')
  verifier('trois plateformes, une partition persistante chacune', ['VINTED', 'LEBONCOIN', 'FACEBOOK'].every((k) => /^persist:/.test(p.PLATEFORMES[k].partition)))
  verifier('aucun plafond dur au-dessus de 15', Object.values(p.PLATEFORMES).every((x) => x.dur <= 15 && x.plafondJour <= x.dur))

  console.log('\nExécuteur de publication (faux pilote)')
  const { traiter } = require('./lib/executeur')
  const { manquants } = require('./lib/adaptateurs')
  const annonce = { id: 'pub1', productId: 'prod1', title: 'Lampe', description: 'Une lampe.', price: 30, images: ['https://exemple.test/a.jpg'] }
  const TOUT = ['titre', 'description', 'prix', 'photos', 'categorie']
  function fauxPilote({ rempli = TOUT, page = { url: 'https://www.vinted.fr/items/new', titre: 'Vendre un article', texte: 'Titre, description' }, pagesApres = null, echecPublier = false } = {}) {
    const journalPilote = []
    let publie = false
    return {
      journalPilote,
      ouvrir: async (p) => journalPilote.push(`ouvrir:${p}`),
      lirePage: async () => (publie && pagesApres ? pagesApres : page),
      remplir: async () => (journalPilote.push('remplir'), { rempli }),
      publier: async () => {
        journalPilote.push('publier')
        if (echecPublier) throw new Error('Bouton « Publier » introuvable ou désactivé')
        publie = true
        return { url: 'https://www.vinted.fr/items/999-lampe' }
      },
    }
  }
  const fauxApi = () => {
    const appels = []
    return { appels, resultat: async (id, statut, x) => appels.push({ id, statut, x }) }
  }
  const dossierEx = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-exec-'))
  const cfgAuto = p.accorder({ ...config.PAR_DEFAUT }, 'VINTED', midi)
  const cfgManuel = { ...config.PAR_DEFAUT }

  verifier('champs indispensables : Vinted exige la catégorie, Facebook la catégorie et l’état', manquants('VINTED', ['titre', 'description', 'prix', 'photos']).join() === 'categorie' && manquants('FACEBOOK', ['titre', 'description', 'prix', 'photos']).join() === 'categorie,etat' && manquants('FACEBOOK', [...TOUT, 'etat']).length === 0)

  console.log('\nCatégorie et état (options relevées sur la vraie page Facebook le 30/09/2026)')
  const { choisirCategorie, choisirEtat } = require('./lib/choix')
  const pageJs = require('./lib/page')
  const { ADAPTATEURS } = require('./lib/adaptateurs')
  const FB = ['Outils', 'Meubles', 'Pour la maison', 'Jardin', 'Électroménager', 'Jeux vidéo', 'Livres, films et musique', 'Sacs et bagages', 'Vêtements et chaussures pour femmes', 'Vêtements et chaussures pour hommes', 'Bijoux et accessoires', 'Santé et beauté', 'Produits pour animaux', 'Puériculture et enfants', 'Jouets et jeux', 'Électronique et ordinateurs', 'Téléphones mobiles', 'Vélos', 'Artisanat d’art', 'Sports et activités extérieures', 'Pièces auto', 'Instruments de musique', 'Antiquités et objets de collection', 'Vide-grenier', 'Divers', 'Véhicules']
  const ETATS_FB = ['Neuf', 'D’occasion - comme neuf', 'D’occasion - bon état', 'D’occasion - assez bon état']
  const cat = (category, title = '') => choisirCategorie(FB, { category, title }, ADAPTATEURS.FACEBOOK.categorie.fourreTout)
  verifier('chemin Google « Maison et jardin > Éclairage > Lampes » → Pour la maison', cat('Maison et jardin > Éclairage > Lampes', 'Lampe de bureau LED') === 'Pour la maison', cat('Maison et jardin > Éclairage > Lampes', 'Lampe de bureau LED'))
  verifier('« Appareils électroniques > Téléphones mobiles » → Téléphones mobiles', cat('Appareils électroniques > Communications > Téléphonie > Téléphones mobiles') === 'Téléphones mobiles')
  verifier('« Animaux et articles pour animaux de compagnie » → Produits pour animaux', cat('Animaux et articles pour animaux de compagnie > Articles pour animaux de compagnie') === 'Produits pour animaux')
  verifier('sans catégorie, le titre décide : perceuse → Outils', cat(null, 'Perceuse visseuse sans fil 18V') === 'Outils')
  verifier('rien ne correspond : le fourre-tout de la page (« Divers »), jamais une catégorie au hasard', cat('Zzz', 'Qqq') === 'Divers')
  verifier('ni correspondance ni fourre-tout : null, le vendeur choisit', choisirCategorie(['Outils', 'Meubles'], { category: 'Zzz', title: 'Qqq' }, ['Divers']) === null)
  verifier('état : « Neuf » exact, « Comme neuf » et « Bon état » vers leur libellé d’occasion', choisirEtat(ETATS_FB, 'Neuf') === 'Neuf' && choisirEtat(ETATS_FB, 'Comme neuf') === 'D’occasion - comme neuf' && choisirEtat(ETATS_FB, 'Bon état') === 'D’occasion - bon état' && choisirEtat(ETATS_FB, 'Inconnu') === null)
  const { formaterPrix } = require('./lib/choix')
  verifier('prix : entier arrondi pour Facebook et Leboncoin (jamais « 249 » pour 24,90 €), virgule française pour Vinted', formaterPrix(24.9, 'entier') === '25' && formaterPrix(0.3, 'entier') === '1' && formaterPrix(24.9, 'virgule') === '24,90' && formaterPrix(30, 'virgule') === '30' && formaterPrix(0, 'entier') === '' && ADAPTATEURS.FACEBOOK.prix === 'entier' && ADAPTATEURS.VINTED.prix === 'virgule')
  const appelTexte = pageJs.appelPage(pageJs.lireOptions, ADAPTATEURS.FACEBOOK.categorie, 4000)
  let syntaxe = true
  try {
    new Function(`return ${appelTexte}`)
  } catch {
    syntaxe = false
  }
  verifier('l’appel envoyé à la page est du JavaScript valide et ne dépend de rien d’extérieur', syntaxe && !appelTexte.includes('require(') &&[pageJs.poserValeur, pageJs.cliquerOption, pageJs.cliquerBouton].every((fn) => { try { new Function(`return (${fn.toString()})`); return true } catch { return false } }))

  let d = dossierEx()
  let pil = fauxPilote()
  let api2 = fauxApi()
  let r = await traiter({ api: api2, pilote: pil, plateforme: 'VINTED', annonce, config: cfgManuel, etat: { arrets: {} }, dossier: d, maintenant: midi })
  verifier('validation (sans accord) : formulaire rempli, JAMAIS de clic « Publier », rien envoyé au serveur', r.statut === 'preparee' && !pil.journalPilote.includes('publier') && api2.appels.length === 0, JSON.stringify(r))

  pil = fauxPilote({ rempli: ['titre', 'description', 'prix', 'photos'] })
  r = await traiter({ api: fauxApi(), pilote: pil, plateforme: 'VINTED', annonce, config: cfgManuel, etat: { arrets: {} }, dossier: d, maintenant: midi })
  verifier('catégorie non réglée : la main revient au vendeur, avec ce qui manque', r.statut === 'a_valider' && r.manque.join() === 'categorie')

  d = dossierEx()
  pil = fauxPilote()
  api2 = fauxApi()
  r = await traiter({ api: api2, pilote: pil, plateforme: 'VINTED', annonce, config: cfgAuto, etat: { arrets: {} }, dossier: d, maintenant: midi })
  verifier('automatique, formulaire complet : publié, serveur informé avec l’adresse', r.statut === 'publiee' && pil.journalPilote.join() === 'ouvrir:VINTED,remplir,publier' && api2.appels.length === 1 && api2.appels[0].statut === 'PUBLISHED' && api2.appels[0].x === 'https://www.vinted.fr/items/999-lampe', JSON.stringify(r))
  verifier('la publication est au journal (elle compte pour le plafond du jour)', p.lireJournal(d).some((e) => e.type === 'publication' && e.plateforme === 'VINTED' && e.publication === 'pub1'))

  d = dossierEx()
  pil = fauxPilote({ rempli: ['titre', 'prix'] })
  api2 = fauxApi()
  r = await traiter({ api: api2, pilote: pil, plateforme: 'VINTED', annonce, config: cfgAuto, etat: { arrets: {} }, dossier: d, maintenant: midi })
  verifier('automatique mais champ manquant : AUCUN clic « Publier »', r.statut === 'a_valider' && !pil.journalPilote.includes('publier') && api2.appels.length === 0)

  d = dossierEx()
  pil = fauxPilote({ page: { url: 'https://www.vinted.fr/items/new', titre: 'Vérification de sécurité', texte: 'captcha' } })
  api2 = fauxApi()
  r = await traiter({ api: api2, pilote: pil, plateforme: 'VINTED', annonce, config: cfgAuto, etat: { arrets: {} }, dossier: d, maintenant: midi })
  verifier('blocage à l’ouverture : pause, on ne remplit rien, on n’alerte pas le serveur d’un faux échec', r.statut === 'pause' && !pil.journalPilote.includes('remplir') && api2.appels.length === 0 && r.essais === 1)
  verifier('l’arrêt est écrit sur disque : la plateforme reste arrêtée au redémarrage', !!p.lireEtat(d).arrets.VINTED && p.lireJournal(d).some((e) => e.type === 'alerte'))

  d = dossierEx()
  pil = fauxPilote({ pagesApres: { url: 'https://www.vinted.fr/captcha', titre: 'Are you a robot?', texte: '' } })
  api2 = fauxApi()
  r = await traiter({ api: api2, pilote: pil, plateforme: 'VINTED', annonce, config: cfgAuto, etat: { arrets: {} }, dossier: d, maintenant: midi })
  verifier('blocage APRÈS le clic : résultat incertain, jamais rejoué (1 seul clic), serveur : FAILED « vérifiez »', r.statut === 'pause' && pil.journalPilote.filter((x) => x === 'publier').length === 1 && api2.appels.length === 1 && api2.appels[0].statut === 'FAILED' && /Vérifiez/.test(api2.appels[0].x))
  verifier('… et l’annonce cliquée compte pour le plafond du jour (prudence)', p.lireJournal(d).some((e) => e.type === 'publication'))

  d = dossierEx()
  pil = fauxPilote()
  const pleinJournal = Array.from({ length: 10 }, (_, i) => ({ type: 'publication', plateforme: 'VINTED', at: new Date(2026, 8, 30, 6, i * 20).toISOString() }))
  r = await traiter({ api: fauxApi(), pilote: pil, plateforme: 'VINTED', annonce, config: cfgAuto, etat: { arrets: {} }, dossier: d, maintenant: new Date(2026, 8, 30, 13, 0), journal: pleinJournal })
  verifier('plafond du jour atteint : on n’ouvre même pas la page', r.statut === 'attente' && r.attenteMs > 0 && pil.journalPilote.length === 0, JSON.stringify(r))

  d = dossierEx()
  pil = fauxPilote({ echecPublier: true })
  api2 = fauxApi()
  r = await traiter({ api: api2, pilote: pil, plateforme: 'VINTED', annonce, config: cfgAuto, etat: { arrets: {} }, dossier: d, maintenant: midi })
  verifier('bouton introuvable : échec journalisé, serveur informé FAILED avec la raison', r.statut === 'echec' && api2.appels[0].statut === 'FAILED' && /Publier/.test(api2.appels[0].x))

  d = dossierEx()
  pil = fauxPilote()
  r = await traiter({ api: fauxApi(), pilote: pil, plateforme: 'VINTED', annonce, config: cfgManuel, etat: p.arreter({ arrets: {} }, 'VINTED', 'captcha', midi), dossier: d, maintenant: midi })
  verifier('plateforme en pause : même en validation, on ne rouvre pas la page', r.statut === 'attente' && r.attenteMs === 6 * 3600_000 && pil.journalPilote.length === 0)

  // Un agent insiste : les échecs ORDINAIRES sont retentés.
  d = dossierEx()
  let essai = 0
  pil = fauxPilote()
  pil.publier = async () => {
    essai++
    pil.journalPilote.push('publier')
    if (essai < 3) throw new Error('Bouton « Publier » introuvable ou désactivé')
    return { url: 'https://www.vinted.fr/items/1-lampe' }
  }
  api2 = fauxApi()
  const dormis = []
  r = await traiter({ api: api2, pilote: pil, plateforme: 'VINTED', annonce, config: cfgAuto, etat: { arrets: {} }, dossier: d, maintenant: midi, dormir: async (ms) => dormis.push(ms) })
  verifier('échec ordinaire : retenté (2 échecs puis succès au 3e essai), pause fixe entre essais', r.statut === 'publiee' && r.essais === 3 && dormis.length === 2 && dormis.every((ms) => ms === 30_000) && api2.appels.length === 1 && api2.appels[0].statut === 'PUBLISHED', JSON.stringify(r))

  d = dossierEx()
  pil = fauxPilote({ echecPublier: true })
  api2 = fauxApi()
  r = await traiter({ api: api2, pilote: pil, plateforme: 'VINTED', annonce, config: cfgAuto, etat: { arrets: {} }, dossier: d, maintenant: midi, dormir: async () => undefined })
  verifier('3 essais ratés : FAILED envoyé UNE fois avec la raison, l’agent peut passer à la suivante', r.statut === 'echec' && r.essais === 3 && pil.journalPilote.filter((x) => x === 'publier').length === 3 && api2.appels.length === 1 && api2.appels[0].statut === 'FAILED' && /3 essais/.test(api2.appels[0].x))

  d = dossierEx()
  pil = fauxPilote()
  api2 = { appels: [], resultat: async () => { throw new Error('serveur en panne') } }
  r = await traiter({ api: api2, pilote: pil, plateforme: 'VINTED', annonce, config: cfgAuto, etat: { arrets: {} }, dossier: d, maintenant: midi, dormir: async () => undefined })
  verifier('serveur injoignable APRÈS le clic : jamais de second clic (pas de doublon), publiée quand même', r.statut === 'publiee' && pil.journalPilote.filter((x) => x === 'publier').length === 1 && /serveur/.test(r.raison))

  d = dossierEx()
  p.ecrireEtat(d, p.arreter({ arrets: {} }, 'VINTED', 'captcha', new Date(midi.getTime() - 7 * 3600_000)))
  pil = fauxPilote()
  api2 = fauxApi()
  r = await traiter({ api: api2, pilote: pil, plateforme: 'VINTED', annonce, config: cfgAuto, etat: p.lireEtat(d), dossier: d, maintenant: midi })
  verifier('pause écoulée + publication réussie : la plateforme est libérée, compteur à zéro', r.statut === 'publiee' && !p.lireEtat(d).arrets.VINTED)

  d = dossierEx()
  pil = fauxPilote({ rempli: [...TOUT, 'etat'] })
  api2 = fauxApi()
  r = await traiter({ api: api2, pilote: pil, plateforme: 'FACEBOOK', annonce, config: p.accorder({ ...config.PAR_DEFAUT }, 'FACEBOOK', midi), etat: { arrets: {} }, dossier: d, maintenant: midi })
  verifier('Facebook, catégorie et état réglés : publié en mode automatique', r.statut === 'publiee' && api2.appels[0].statut === 'PUBLISHED')
  pil = fauxPilote({ rempli: ['titre', 'description', 'prix', 'photos', 'etat'] })
  r = await traiter({ api: fauxApi(), pilote: pil, plateforme: 'FACEBOOK', annonce, config: p.accorder({ ...config.PAR_DEFAUT }, 'FACEBOOK', midi), etat: { arrets: {} }, dossier: dossierEx(), maintenant: midi })
  verifier('Facebook sans catégorie trouvée : rien n’est publié, l’annonce revient au vendeur', r.statut === 'a_valider' && r.manque.join() === 'categorie' && !pil.journalPilote.includes('publier'))

  console.log('\nCircuit automatique (lien → import → file)')
  const { traiterLien } = require('./lib/circuit')
  const { ErreurApi } = require('./lib/api')
  const lien = { id: 'lk1', url: 'https://fr.aliexpress.com/item/1.html' }
  const fauxApiCircuit = (surImport) => {
    const j = { importer: [], file: [], reclamer: [] }
    return {
      j,
      importer: async (url, id) => (j.importer.push(url), surImport(j.importer.length, url, id)),
      mettreEnFile: async (pid, pl) => (j.file.push([pid, pl]), { enFile: pl }),
      reclamer: async (id, s) => j.reclamer.push([id, s]),
    }
  }
  let ac = fauxApiCircuit(async () => ({ id: 'prod9' }))
  let rc = await traiterLien({ api: ac, lien, plateformes: ['VINTED', 'FACEBOOK'], dormir: async () => undefined })
  verifier('import puis mise en file sur les plateformes activées, sans aucune validation', rc.statut === 'en_file' && rc.productId === 'prod9' && ac.j.file[0][1].join() === 'VINTED,FACEBOOK')
  ac = fauxApiCircuit(async () => ({ id: 'prod9' }))
  rc = await traiterLien({ api: ac, lien, plateformes: [], dormir: async () => undefined })
  verifier('aucune plateforme activée : le produit est importé, rien n’est mis en file', rc.statut === 'importe' && ac.j.file.length === 0)
  ac = fauxApiCircuit(async (n) => {
    if (n < 3) throw new ErreurApi('Serveur injoignable', 0)
    return { id: 'prod9' }
  })
  const dormisC = []
  rc = await traiterLien({ api: ac, lien, plateformes: ['VINTED'], dormir: async (ms) => dormisC.push(ms) })
  verifier('panne passagère : retentée (3e essai réussi), pause fixe', rc.statut === 'en_file' && ac.j.importer.length === 3 && dormisC.length === 2)
  ac = fauxApiCircuit(async () => {
    throw new ErreurApi('Solde de drops insuffisant', 402)
  })
  rc = await traiterLien({ api: ac, lien, plateformes: ['VINTED'], dormir: async () => undefined })
  verifier('solde vide : arrêt net, un seul appel, aucune insistance inutile', rc.statut === 'sans_solde' && ac.j.importer.length === 1 && ac.j.reclamer.length === 0)
  ac = fauxApiCircuit(async () => {
    throw new ErreurApi('Cette page n’a pas pu être lue', 502)
  })
  rc = await traiterLien({ api: ac, lien, plateformes: ['VINTED'], dormir: async () => undefined })
  verifier('page illisible : pas de réessai, le lien est classé, l’agent passe au suivant', rc.statut === 'echec' && ac.j.importer.length === 1 && ac.j.reclamer[0].join() === 'lk1,CLAIMED')
  ac = fauxApiCircuit(async () => ({ id: 'prod9' }))
  ac.mettreEnFile = async () => {
    throw new ErreurApi('panne', 500)
  }
  rc = await traiterLien({ api: ac, lien, plateformes: ['VINTED'], dormir: async () => undefined })
  verifier('mise en file ratée : le produit importé n’est pas perdu, la raison est dite', rc.statut === 'importe' && rc.productId === 'prod9' && /mise en file/.test(rc.raison))

  console.log('\nImport groupé de la liste du jour')
  const { importGroupe, importesAujourdhui, plafondImports } = require('./lib/circuit')
  const liste = (n) => ({ jour: '2026-09-30', produits: Array.from({ length: n }, (_, i) => ({ url: `https://exemple.test/p${i}`, margePct: 40 - i })) })
  const apiListe = (n, surImport = async () => ({ id: 'x' })) => {
    const j = { max: null, importer: [], file: [] }
    return {
      j,
      gagnants: async ({ max, margeMin, categories }) => ((j.max = max), (j.margeMin = margeMin), (j.categories = categories), { categories: ['Maison', 'Mode'], ...liste(n), produits: liste(n).produits.slice(0, max) }),
      importer: async (url, id) => (j.importer.push(url), surImport(j.importer.length)),
      mettreEnFile: async (pid, pl) => (j.file.push(pl), { enFile: pl }),
      reclamer: async () => undefined,
    }
  }
  let ag = apiListe(5)
  let bg = await importGroupe({ api: ag, plateformes: ['VINTED'], plafond: 20, dormir: async () => undefined })
  verifier('les 5 adresses du jour sont importées puis mises en file, sans validation', bg.importes === 5 && bg.lus === 5 && ag.j.file.length === 5 && !bg.plafondAtteint && bg.jour === '2026-09-30')
  ag = apiListe(30)
  bg = await importGroupe({ api: ag, plateformes: ['VINTED'], plafond: 20, dejaFaits: 12, dormir: async () => undefined })
  verifier('plafond du jour : 12 déjà faits sur 20 → 8 importés, pas un de plus, et le serveur n’en renvoie que 8', bg.importes === 8 && ag.j.importer.length === 8 && ag.j.max === 8 && bg.plafondAtteint)
  bg = await importGroupe({ api: apiListe(3), plateformes: [], plafond: 20, dejaFaits: 20 })
  verifier('plafond déjà atteint : aucun appel au serveur', bg.importes === 0 && bg.plafondAtteint && bg.lus === 0)
  ag = apiListe(6, async (n) => {
    if (n === 3) throw new ErreurApi('Solde de drops insuffisant', 402)
    return { id: 'x' }
  })
  bg = await importGroupe({ api: ag, plateformes: ['VINTED'], plafond: 20, dormir: async () => undefined })
  verifier('solde vide au 3e : arrêt net (2 importés), les autres attendent le rechargement', bg.sansSolde && bg.importes === 2 && ag.j.importer.length === 3)
  ag = apiListe(4, async (n) => {
    if (n === 2) throw new ErreurApi('Cette page n’a pas pu être lue', 502)
    return { id: 'x' }
  })
  bg = await importGroupe({ api: ag, plateformes: ['VINTED'], plafond: 20, dormir: async () => undefined })
  verifier('une page illisible n’arrête pas le lot : 3 importés, 1 échec', bg.importes === 3 && bg.echecs === 1 && !bg.sansSolde)
  ag = apiListe(2)
  const posts = []
  ag.publierReseaux = async (pid) => (posts.push(pid), { publies: 2, comptes: 2, erreurs: [] })
  bg = await importGroupe({ api: ag, plateformes: ['VINTED'], reseaux: true, plafond: 20, dormir: async () => undefined })
  verifier('réseaux activés : chaque produit importé est publié UNE fois sur les réseaux reliés', bg.importes === 2 && posts.length === 2)
  posts.length = 0
  bg = await importGroupe({ api: ag, plateformes: ['VINTED'], reseaux: false, plafond: 20, dormir: async () => undefined })
  verifier('réseaux coupés : aucun appel social', posts.length === 0)
  ag = apiListe(2)
  ag.publierReseaux = async () => {
    throw new ErreurApi('panne du moteur social', 500)
  }
  bg = await importGroupe({ api: ag, plateformes: ['VINTED'], reseaux: true, plafond: 20, dormir: async () => undefined })
  verifier('un refus du module social n’annule ni l’import ni la mise en file', bg.importes === 2 && ag.j.file.length === 2)
  ag = apiListe(1, async () => {
    throw new ErreurApi('Cette page n’a pas pu être lue', 502)
  })
  const postsBis = []
  ag.publierReseaux = async (pid) => (postsBis.push(pid), { publies: 1 })
  await importGroupe({ api: ag, plateformes: [], reseaux: true, plafond: 20, dormir: async () => undefined })
  verifier('import raté : rien à publier sur les réseaux', postsBis.length === 0)

  const hier = new Date(midi.getTime() - 86_400_000).toISOString()
  const jr = [
    { type: 'import', resultat: 'en_file', at: midi.toISOString() },
    { type: 'import', resultat: 'importe', at: midi.toISOString() },
    { type: 'import', resultat: 'echec', at: midi.toISOString() },
    { type: 'import', resultat: 'en_file', at: hier },
    { type: 'publication', at: midi.toISOString() },
  ]
  verifier('le compteur du jour ne compte que les imports réussis d’aujourd’hui', importesAujourdhui(jr, midi) === 2)
  verifier('aucune limite d’imports par défaut : illimité ; réglable si le vendeur le veut, sans plafond dur', plafondImports({}) === Infinity && plafondImports({ plafondImports: 5 }) === 5 && plafondImports({ plafondImports: 100000 }) === 100000 && plafondImports({ plafondImports: null }) === Infinity)
  ag = apiListe(480)
  bg = await importGroupe({ api: ag, plateformes: ['VINTED'], plafond: Infinity, dormir: async () => undefined })
  verifier('480 produits, sans limite : les 480 sont importés et mis en file', bg.importes === 480 && ag.j.file.length === 480 && !bg.plafondAtteint && ag.j.max === 1000)

  const ar = apiListe(3)
  const br = await importGroupe({ api: ar, plateformes: ['FACEBOOK'], plafond: Infinity, margeMin: 35, categories: ['Mode'], dormir: async () => undefined })
  verifier('rayons et marge choisis par le vendeur : transmis au serveur, rayons du jour rendus à l’écran', ar.j.margeMin === 35 && ar.j.categories.join() === 'Mode' && br.rayons.join() === 'Maison,Mode' && br.importes === 3)

  fs.rmSync(dossier, { recursive: true, force: true })
  if (echecs) {
    console.error(`\n${echecs} attente(s) manquée(s).`)
    process.exitCode = 1
    return
  }
  console.log('\nApplication desktop : tout passe.')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
