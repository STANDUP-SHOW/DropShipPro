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
  const stop = p.decision({ plateforme: 'VINTED', config: cfg, etat, maintenant: plus(500) })
  verifier('après un blocage : refusé, quelle que soit l’heure', !stop.ok && /Reprenez vous-même/.test(stop.raison) && stop.attenteMs === null)
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

  verifier('champs indispensables : Vinted exige la catégorie, Facebook non', manquants('VINTED', ['titre', 'description', 'prix', 'photos']).join() === 'categorie' && manquants('FACEBOOK', ['titre', 'description', 'prix', 'photos']).length === 0)

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
  verifier('blocage à l’ouverture : arrêt, on ne remplit rien, on n’alerte pas le serveur d’un faux échec', r.statut === 'arret' && !pil.journalPilote.includes('remplir') && api2.appels.length === 0)
  verifier('l’arrêt est écrit sur disque : la plateforme reste arrêtée au redémarrage', !!p.lireEtat(d).arrets.VINTED && p.lireJournal(d).some((e) => e.type === 'alerte'))

  d = dossierEx()
  pil = fauxPilote({ pagesApres: { url: 'https://www.vinted.fr/captcha', titre: 'Are you a robot?', texte: '' } })
  api2 = fauxApi()
  r = await traiter({ api: api2, pilote: pil, plateforme: 'VINTED', annonce, config: cfgAuto, etat: { arrets: {} }, dossier: d, maintenant: midi })
  verifier('blocage APRÈS le clic : arrêt, la publication n’est ni comptée ni déclarée publiée', r.statut === 'arret' && !p.lireJournal(d).some((e) => e.type === 'publication') && api2.appels.length === 0)

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
  verifier('plateforme arrêtée : même en validation, on ne rouvre pas la page', r.statut === 'arret' && pil.journalPilote.length === 0)

  d = dossierEx()
  pil = fauxPilote({ rempli: ['titre', 'description', 'prix', 'photos'] })
  api2 = fauxApi()
  r = await traiter({ api: api2, pilote: pil, plateforme: 'FACEBOOK', annonce, config: p.accorder({ ...config.PAR_DEFAUT }, 'FACEBOOK', midi), etat: { arrets: {} }, dossier: d, maintenant: midi })
  verifier('Facebook sans catégorie à régler : publié en mode automatique', r.statut === 'publiee' && api2.appels[0].statut === 'PUBLISHED')

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
