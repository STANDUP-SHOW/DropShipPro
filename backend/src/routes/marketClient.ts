import express, { Router, type Request, type Response, type NextFunction } from 'express'
import type { MarketClient, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { sendMail } from '../services/mailer.js'
import { frontendUrl, absoluteUrl } from '../lib/urls.js'
import { annonces, arbreMarket, marketUrl } from '../services/market.js'
import { pageMessage } from '../services/marketPages.js'
import {
  clientConnecte,
  ouvrirSession,
  fermerSession,
  inscrire,
  connecter,
  confirmerEmail,
  renvoyerConfirmation,
  demanderReinitialisation,
  reinitialiser,
  changerMotDePasse,
  supprimerCompte,
  normaliserEmail,
  emailValide,
  ErreurCompte,
} from '../services/marketClients.js'
import { lirePanier, ecrirePanier, ajouter, modifier, resoudre, totalPanier } from '../services/marketPanier.js'
import { ouvrirPaiementPanier, MarketIndisponible } from '../services/marketStripe.js'
import {
  pagePanier,
  pageCommande,
  pageConnexion,
  pageInscription,
  pageOubli,
  pageReinitialiser,
  pageCompte,
  pageCommandes,
  pageDetailCommande,
  pageRecu,
  pageAdresses,
  pageEnvies,
  pageSecurite,
  pageSuivi,
  pageContact,
  pageInfo,
  SUJETS_CONTACT,
  type CommandeVue,
  type LigneVue,
} from '../services/marketPagesClient.js'
import { PAGES_INFO, EDITEUR } from '../services/marketLegal.js'
import { pageFacture } from '../services/marketFactures.js'

/**
 * Le côté client de DropShop Market : panier, commande, compte, suivi,
 * retours, avis vérifiés, contact et pages d'information. Monté dans
 * `marketRouter`, donc servi à la racine de drop-shop.cloud et sous `/market`.
 */
export const marketClientRouter = Router()

const formulaire = express.urlencoded({ extended: false, limit: '16kb' })

function page(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((err) => {
      console.error('[market-client]', req.path, err instanceof Error ? err.message : err)
      if (res.headersSent) return next(err)
      res.status(500).type('html').send(pageMessage(req.baseUrl, 'Un incident est survenu', "La page n'a pas pu être affichée. Réessayez dans un instant."))
    })
  }
}

/** Les pages personnelles ne passent jamais par un cache. */
function perso(res: Response, html: string, statut = 200) {
  res.status(statut).set('Cache-Control', 'no-store').type('html').send(html)
}

function baseAbsolue(req: Request) {
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0].trim()
  const hote = String(req.headers['x-forwarded-host'] ?? req.get('host') ?? '').split(',')[0].trim()
  return hote ? `${proto}://${hote}${req.baseUrl}` : `${marketUrl()}${req.baseUrl}`
}

/** Un retour après connexion : un chemin du Market seulement, jamais une autre adresse. */
function retourSur(v: unknown): string | null {
  const s = String(v ?? '')
  return /^\/(?!\/)[\w\-/.?=&%~]*$/.test(s) && s.length < 300 ? s : null
}

const champ = (req: Request, k: string, max = 2000) => String(req.body?.[k] ?? '').trim().slice(0, max)

async function rayons() {
  return (await arbreMarket()).rayons
}

/** Exige un client connecté ; sinon renvoie vers la connexion, puis ici. */
async function exigerClient(req: Request, res: Response): Promise<MarketClient | null> {
  const c = await clientConnecte(req)
  if (!c) {
    const retour = req.method === 'GET' ? req.originalUrl.slice(req.baseUrl.length) : '/compte'
    res.redirect(303, `${req.baseUrl}/compte/connexion?retour=${encodeURIComponent(retour)}`)
    return null
  }
  return c
}

const MESSAGES: Record<string, string> = {
  bienvenue: 'Votre compte est créé. Un email de confirmation vient de vous être envoyé.',
  confirme: 'Merci, votre adresse email est confirmée.',
  renvoye: 'Un nouvel email de confirmation vient de vous être envoyé.',
  mdp: 'Votre mot de passe est changé.',
  adresse: 'Adresse enregistrée.',
  envie: "Ajouté à votre liste d'envies.",
  retire: 'Retiré de votre liste.',
  retour: 'Votre demande de retour est envoyée au vendeur ; il vous répond par email avec l\'adresse de retour.',
  avis: 'Merci ! Votre avis est publié sur la fiche du produit.',
  ajoute: 'Ajouté au panier.',
  reinit: 'Mot de passe changé : vous êtes connecté.',
}
const message = (req: Request) => MESSAGES[String(req.query.ok ?? '')] ?? null

// ——— Panier ———

marketClientRouter.get(
  '/panier',
  page(async (req, res) => {
    const [panier, r, suggestions] = await Promise.all([resoudre(lirePanier(req)), rayons(), annonces({ limite: 8 })])
    const dans = new Set(panier.lignes.map((l) => l.annonce.product.id))
    perso(
      res,
      pagePanier({ base: req.baseUrl, rayons: r, ...panier, total: totalPanier(panier.lignes), suggestions: suggestions.filter((a) => !dans.has(a.product.id)).slice(0, 6), message: message(req) }),
    )
  }),
)

marketClientRouter.post(
  '/panier/ajouter',
  formulaire,
  page(async (req, res) => {
    const offre = champ(req, 'offre', 80)
    const quantite = Number.parseInt(champ(req, 'quantite', 3) || '1', 10) || 1
    const [annonce] = offre ? await annonces({ productId: offre.split('-')[0], limite: 1 }) : []
    const o = annonce?.offres.find((x) => x.id === offre)
    if (!o) return perso(res, pageMessage(req.baseUrl, 'Produit introuvable', "Ce produit n'est plus en vente."), 404)
    if (!o.disponible) return perso(res, pageMessage(req.baseUrl, 'Variante épuisée', 'Cette variante est épuisée. Choisissez-en une autre.', { libelle: 'Revenir au produit', href: `${req.baseUrl}${o.cheminProduit}` }), 409)
    ecrirePanier(req, res, ajouter(lirePanier(req), o.id, quantite))
    res.redirect(303, `${req.baseUrl}/panier?ok=ajoute`)
  }),
)

marketClientRouter.post(
  '/panier/modifier',
  formulaire,
  page(async (req, res) => {
    const offre = champ(req, 'offre', 80)
    const quantite = Number.parseInt(champ(req, 'quantite', 3) || '0', 10) || 0
    ecrirePanier(req, res, modifier(lirePanier(req), offre, quantite))
    res.redirect(303, `${req.baseUrl}/panier`)
  }),
)

// ——— Commande et paiement ———

marketClientRouter.get(
  '/commande',
  page(async (req, res) => {
    const [panier, client, r] = await Promise.all([resoudre(lirePanier(req)), clientConnecte(req), rayons()])
    if (!panier.lignes.length) return res.redirect(303, `${req.baseUrl}/panier`)
    const adresse = client ? await prisma.marketAdresse.findFirst({ where: { clientId: client.id }, orderBy: [{ parDefaut: 'desc' }, { createdAt: 'desc' }] }) : null
    perso(res, pageCommande({ base: req.baseUrl, rayons: r, lignes: panier.lignes, total: totalPanier(panier.lignes), client, adresse }))
  }),
)

async function payer(req: Request, res: Response, lignes: Awaited<ReturnType<typeof resoudre>>['lignes'], viderPanier: boolean) {
  const client = await clientConnecte(req)
  try {
    const url = await ouvrirPaiementPanier({ lignes, client, base: baseAbsolue(req), viderPanier })
    res.redirect(303, url)
  } catch (err) {
    if (err instanceof MarketIndisponible) {
      return perso(res, pageMessage(req.baseUrl, 'Paiement impossible', err.message, { libelle: 'Revenir au panier', href: `${req.baseUrl}/panier` }), 409)
    }
    throw err
  }
}

marketClientRouter.post(
  '/commande',
  formulaire,
  rateLimit({ name: 'market-commande', windowMs: 3600_000, max: 30 }),
  page(async (req, res) => {
    const panier = await resoudre(lirePanier(req))
    if (!panier.lignes.length) return res.redirect(303, `${req.baseUrl}/panier`)
    await payer(req, res, panier.lignes, true)
  }),
)

/** « Acheter maintenant » : cet article seul, sans toucher au panier. */
marketClientRouter.post(
  '/acheter',
  formulaire,
  rateLimit({ name: 'market-achat', windowMs: 3600_000, max: 30 }),
  page(async (req, res) => {
    const offre = champ(req, 'offre', 80)
    const quantite = Math.min(10, Math.max(1, Number.parseInt(champ(req, 'quantite', 3) || '1', 10) || 1))
    const { lignes, epuisees } = await resoudre([{ offre, quantite }])
    if (epuisees.length) return perso(res, pageMessage(req.baseUrl, 'Variante épuisée', 'Cette variante est épuisée. Choisissez-en une autre.', { libelle: 'Revenir au produit', href: `${req.baseUrl}${epuisees[0].offre.cheminProduit}` }), 409)
    if (!lignes.length) return perso(res, pageMessage(req.baseUrl, 'Produit introuvable', "Ce produit n'est plus en vente."), 404)
    await payer(req, res, lignes, false)
  }),
)

// ——— Compte : connexion, inscription, mot de passe ———

const limiteCompte = rateLimit({ name: 'market-compte', windowMs: 15 * 60_000, max: 20 })

marketClientRouter.get(
  '/compte/connexion',
  page(async (req, res) => {
    if (await clientConnecte(req)) return res.redirect(303, `${req.baseUrl}${retourSur(req.query.retour) ?? '/compte'}`)
    perso(res, pageConnexion({ base: req.baseUrl, rayons: await rayons(), retour: retourSur(req.query.retour) }))
  }),
)

marketClientRouter.post(
  '/compte/connexion',
  formulaire,
  limiteCompte,
  page(async (req, res) => {
    const retour = retourSur(req.body?.retour)
    try {
      const c = await connecter(champ(req, 'email', 200), String(req.body?.motDePasse ?? ''))
      ouvrirSession(req, res, c)
      res.redirect(303, `${req.baseUrl}${retour ?? '/compte'}`)
    } catch (err) {
      if (!(err instanceof ErreurCompte)) throw err
      perso(res, pageConnexion({ base: req.baseUrl, rayons: await rayons(), erreur: err.message, email: champ(req, 'email', 200), retour }), 401)
    }
  }),
)

marketClientRouter.get(
  '/compte/inscription',
  page(async (req, res) => perso(res, pageInscription({ base: req.baseUrl, rayons: await rayons(), retour: retourSur(req.query.retour) }))),
)

marketClientRouter.post(
  '/compte/inscription',
  formulaire,
  limiteCompte,
  page(async (req, res) => {
    const retour = retourSur(req.body?.retour)
    try {
      const c = await inscrire({ nom: champ(req, 'nom', 80), email: champ(req, 'email', 200), motDePasse: String(req.body?.motDePasse ?? ''), baseAbsolue: baseAbsolue(req) })
      ouvrirSession(req, res, c)
      res.redirect(303, `${req.baseUrl}${retour ?? '/compte?ok=bienvenue'}`)
    } catch (err) {
      if (!(err instanceof ErreurCompte)) throw err
      perso(res, pageInscription({ base: req.baseUrl, rayons: await rayons(), erreur: err.message, nom: champ(req, 'nom', 80), email: champ(req, 'email', 200), retour }), 400)
    }
  }),
)

marketClientRouter.get(
  '/compte/confirmer',
  page(async (req, res) => {
    const c = await confirmerEmail(String(req.query.jeton ?? '').slice(0, 100))
    if (!c) return perso(res, pageMessage(req.baseUrl, 'Lien expiré', "Ce lien de confirmation n'est plus valable. Connectez-vous pour en recevoir un nouveau.", { libelle: 'Se connecter', href: `${req.baseUrl}/compte/connexion` }), 400)
    // Les commandes passées sans compte avec cette adresse rejoignent le compte.
    await prisma.order.updateMany({ where: { platform: 'DROPSHOP_MARKET', marketClientId: null, buyerEmail: { equals: c.email, mode: 'insensitive' } }, data: { marketClientId: c.id } })
    ouvrirSession(req, res, c)
    res.redirect(303, `${req.baseUrl}/compte?ok=confirme`)
  }),
)

marketClientRouter.post(
  '/compte/renvoyer',
  limiteCompte,
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    await renvoyerConfirmation(c, baseAbsolue(req))
    res.redirect(303, `${req.baseUrl}/compte?ok=renvoye`)
  }),
)

marketClientRouter.get('/compte/oubli', page(async (req, res) => perso(res, pageOubli({ base: req.baseUrl, rayons: await rayons() }))))

marketClientRouter.post(
  '/compte/oubli',
  formulaire,
  limiteCompte,
  page(async (req, res) => {
    const email = normaliserEmail(req.body?.email)
    if (!emailValide(email)) return perso(res, pageOubli({ base: req.baseUrl, rayons: await rayons(), erreur: 'Adresse email invalide.' }), 400)
    await demanderReinitialisation(email, baseAbsolue(req)).catch((e) => console.error('[market] réinitialisation', e instanceof Error ? e.message : e))
    perso(res, pageOubli({ base: req.baseUrl, rayons: await rayons(), envoye: true }))
  }),
)

marketClientRouter.get(
  '/compte/reinitialiser',
  page(async (req, res) => perso(res, pageReinitialiser({ base: req.baseUrl, rayons: await rayons(), jeton: String(req.query.jeton ?? '').slice(0, 100) }))),
)

marketClientRouter.post(
  '/compte/reinitialiser',
  formulaire,
  limiteCompte,
  page(async (req, res) => {
    const jeton = champ(req, 'jeton', 100)
    try {
      const c = await reinitialiser(jeton, String(req.body?.motDePasse ?? ''))
      ouvrirSession(req, res, c)
      res.redirect(303, `${req.baseUrl}/compte?ok=reinit`)
    } catch (err) {
      if (!(err instanceof ErreurCompte)) throw err
      perso(res, pageReinitialiser({ base: req.baseUrl, rayons: await rayons(), jeton, erreur: err.message }), 400)
    }
  }),
)

marketClientRouter.post('/compte/deconnexion', (req, res) => {
  fermerSession(req, res)
  res.redirect(303, `${req.baseUrl}/`)
})

// ——— Espace client ———

marketClientRouter.get(
  '/compte',
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    const [numeros, nbEnvies, nbAdresses, r] = await Promise.all([
      prisma.order.findMany({ where: { marketClientId: c.id, paidAt: { not: null } }, distinct: ['marketNumero'], select: { marketNumero: true } }),
      prisma.marketEnvie.count({ where: { clientId: c.id } }),
      prisma.marketAdresse.count({ where: { clientId: c.id } }),
      rayons(),
    ])
    perso(res, pageCompte({ base: req.baseUrl, rayons: r, client: c, nbCommandes: numeros.length, nbEnvies, nbAdresses, succes: message(req) }))
  }),
)

const VENDEUR_SELECT = { product: { select: { id: true, title: true, aiTitle: true, images: true, shop: { select: { name: true } }, user: { select: { shopName: true } } } } } as const

type LigneBrute = Awaited<ReturnType<typeof lignesDe>>[number]

function lignesDe(where: Prisma.OrderWhereInput) {
  return prisma.order.findMany({ where, include: { ...VENDEUR_SELECT, marketRetours: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' } })
}

const MOTIFS: Record<string, string> = {
  retractation: 'rétractation',
  defectueux: 'produit défectueux ou abîmé',
  'non-conforme': 'produit non conforme',
  erreur: 'mauvais article reçu',
  'non-recu': 'colis non reçu',
}

/** Regroupe des lignes en commandes (un numéro = un panier payé), prêtes à afficher. */
async function versCommandes(lignes: LigneBrute[], client: MarketClient | null): Promise<CommandeVue[]> {
  const enLigne = await annonces({ productIds: [...new Set(lignes.map((l) => l.productId))], limite: 500 })
  const parProduit = new Map(enLigne.map((a) => [a.product.id, a]))
  const avis = new Set(
    (await prisma.buyerReview.findMany({ where: { empreinte: { in: lignes.map((l) => `market:${l.id}`) } }, select: { empreinte: true } })).map((a) => a.empreinte.slice(7)),
  )
  const groupes = new Map<string, CommandeVue>()
  for (const l of lignes) {
    if (!l.marketNumero) continue
    const a = parProduit.get(l.productId)
    const offre = a?.offres.find((o) => o.libelleVariante === l.variante) ?? a?.offres[0]
    const imgBrute = Array.isArray(l.product.images) ? (l.product.images as unknown[]).find((i): i is string => typeof i === 'string') : undefined
    const image = offre?.image ?? (imgBrute ? absoluteUrl(imgBrute) : null)
    const paye = Boolean(l.paidAt)
    const recent = l.paidAt ? Date.now() - new Date(l.paidAt).getTime() < 90 * 86400_000 : false
    const ligne: LigneVue = {
      id: l.id,
      titre: l.product.aiTitle || l.product.title,
      variante: l.variante,
      quantite: l.quantity,
      montant: Number(l.amount),
      devise: l.currency,
      statut: l.status,
      paye,
      suivi: l.trackingNumber,
      transporteur: l.carrier,
      image: image && image.startsWith('http') ? image : null,
      chemin: offre?.chemin ?? null,
      vendeur: l.product.shop?.name || l.product.user.shopName || 'Vendeur DropShop',
      retour: l.marketRetours[0]
        ? { motif: MOTIFS[l.marketRetours[0].motif] ?? l.marketRetours[0].motif, statut: l.marketRetours[0].statut, reponse: l.marketRetours[0].reponse, adresseRetour: l.marketRetours[0].adresseRetour }
        : null,
      facture: Boolean(l.factureNumero && paye),
      avoir: Boolean(l.avoirNumero && paye),
      avisLaisse: avis.has(l.id),
      peutRetour: paye && recent && l.status !== 'REFUNDED' && !l.marketRetours.length,
      peutAvis: Boolean(client && l.marketClientId === client.id && (l.status === 'SHIPPED' || l.status === 'DELIVERED') && !avis.has(l.id)),
    }
    const adr = (l.buyerAddress ?? {}) as Record<string, string>
    const g = groupes.get(l.marketNumero) ?? {
      numero: l.marketNumero,
      date: l.createdAt,
      lignes: [],
      total: 0,
      devise: l.currency,
      adresse: [adr.street, [adr.zip, adr.city].filter(Boolean).join(' '), adr.country].filter(Boolean).join(', '),
    }
    g.lignes.push(ligne)
    if (paye) g.total = Math.round((g.total + ligne.montant) * 100) / 100
    groupes.set(l.marketNumero, g)
  }
  return [...groupes.values()]
}

marketClientRouter.get(
  '/compte/commandes',
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    const [lignes, r] = await Promise.all([lignesDe({ marketClientId: c.id, paidAt: { not: null }, marketNumero: { not: null } }), rayons()])
    perso(res, pageCommandes({ base: req.baseUrl, rayons: r, client: c, commandes: await versCommandes(lignes, c) }))
  }),
)

async function commandeDuClient(c: MarketClient, numero: string) {
  const lignes = await lignesDe({ marketClientId: c.id, marketNumero: numero, paidAt: { not: null } })
  return (await versCommandes(lignes, c))[0] ?? null
}

marketClientRouter.get(
  '/compte/commandes/:numero',
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    const [o, r] = await Promise.all([commandeDuClient(c, req.params.numero), rayons()])
    if (!o) return perso(res, pageMessage(req.baseUrl, 'Commande introuvable', "Cette commande n'existe pas dans votre compte.", { libelle: 'Mes commandes', href: `${req.baseUrl}/compte/commandes` }), 404)
    perso(res, pageDetailCommande({ base: req.baseUrl, rayons: r, commande: o, client: c, succes: message(req) }))
  }),
)

marketClientRouter.get(
  '/compte/commandes/:numero/recu',
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    const o = await commandeDuClient(c, req.params.numero)
    if (!o) return perso(res, pageMessage(req.baseUrl, 'Commande introuvable', "Cette commande n'existe pas dans votre compte."), 404)
    perso(res, pageRecu({ base: req.baseUrl, commande: o, client: c }))
  }),
)

// Adresses

marketClientRouter.get(
  '/compte/adresses',
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    const adresses = await prisma.marketAdresse.findMany({ where: { clientId: c.id }, orderBy: [{ parDefaut: 'desc' }, { createdAt: 'asc' }] })
    perso(res, pageAdresses({ base: req.baseUrl, rayons: await rayons(), client: c, adresses, succes: message(req) }))
  }),
)

const PAYS = new Set(['FR', 'BE', 'LU', 'CH', 'MC', 'DE', 'ES', 'IT', 'NL', 'PT', 'AT', 'IE'])

marketClientRouter.post(
  '/compte/adresses',
  formulaire,
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    const d = { nom: champ(req, 'nom', 80), ligne1: champ(req, 'ligne1', 120), ligne2: champ(req, 'ligne2', 120) || null, codePostal: champ(req, 'codePostal', 12), ville: champ(req, 'ville', 80), pays: champ(req, 'pays', 2).toUpperCase(), telephone: champ(req, 'telephone', 30) || null }
    if (!d.nom || !d.ligne1 || !d.codePostal || !d.ville || !PAYS.has(d.pays)) {
      const adresses = await prisma.marketAdresse.findMany({ where: { clientId: c.id }, orderBy: [{ parDefaut: 'desc' }, { createdAt: 'asc' }] })
      return perso(res, pageAdresses({ base: req.baseUrl, rayons: await rayons(), client: c, adresses, erreur: 'Adresse incomplète : nom, adresse, code postal, ville et pays sont obligatoires.' }), 400)
    }
    const nb = await prisma.marketAdresse.count({ where: { clientId: c.id } })
    if (nb >= 20) return res.redirect(303, `${req.baseUrl}/compte/adresses`)
    const parDefaut = req.body?.parDefaut === '1' || nb === 0
    if (parDefaut) await prisma.marketAdresse.updateMany({ where: { clientId: c.id }, data: { parDefaut: false } })
    await prisma.marketAdresse.create({ data: { ...d, clientId: c.id, parDefaut } })
    res.redirect(303, `${req.baseUrl}/compte/adresses?ok=adresse`)
  }),
)

marketClientRouter.post(
  '/compte/adresses/action',
  formulaire,
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    const id = champ(req, 'id', 40)
    const a = await prisma.marketAdresse.findFirst({ where: { id, clientId: c.id } })
    if (a && req.body?.action === 'supprimer') {
      await prisma.marketAdresse.delete({ where: { id: a.id } })
      if (a.parDefaut) {
        const suivante = await prisma.marketAdresse.findFirst({ where: { clientId: c.id }, orderBy: { createdAt: 'asc' } })
        if (suivante) await prisma.marketAdresse.update({ where: { id: suivante.id }, data: { parDefaut: true } })
      }
    } else if (a && req.body?.action === 'defaut') {
      await prisma.$transaction([
        prisma.marketAdresse.updateMany({ where: { clientId: c.id }, data: { parDefaut: false } }),
        prisma.marketAdresse.update({ where: { id: a.id }, data: { parDefaut: true } }),
      ])
    }
    res.redirect(303, `${req.baseUrl}/compte/adresses`)
  }),
)

// Liste d'envies

marketClientRouter.get(
  '/compte/envies',
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    const envies = await prisma.marketEnvie.findMany({ where: { clientId: c.id }, orderBy: { createdAt: 'desc' }, take: 200 })
    const liste = envies.length ? await annonces({ productIds: envies.map((x) => x.productId), limite: 200 }) : []
    const ordre = new Map(envies.map((x, i) => [x.productId, i]))
    liste.sort((a, b) => (ordre.get(a.product.id) ?? 0) - (ordre.get(b.product.id) ?? 0))
    perso(res, pageEnvies({ base: req.baseUrl, rayons: await rayons(), client: c, annonces: liste, succes: message(req) }))
  }),
)

marketClientRouter.post(
  '/compte/envies/ajouter',
  formulaire,
  page(async (req, res) => {
    const produit = champ(req, 'produit', 40)
    const c = await clientConnecte(req)
    if (!c) {
      const [a] = produit ? await annonces({ productId: produit, limite: 1 }) : []
      const retour = a ? a.offres[0].cheminProduit : '/compte/envies'
      return res.redirect(303, `${req.baseUrl}/compte/connexion?retour=${encodeURIComponent(retour)}`)
    }
    const [a] = produit ? await annonces({ productId: produit, limite: 1 }) : []
    if (a) await prisma.marketEnvie.upsert({ where: { clientId_productId: { clientId: c.id, productId: a.product.id } }, create: { clientId: c.id, productId: a.product.id }, update: {} })
    res.redirect(303, `${req.baseUrl}/compte/envies?ok=envie`)
  }),
)

marketClientRouter.post(
  '/compte/envies/retirer',
  formulaire,
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    await prisma.marketEnvie.deleteMany({ where: { clientId: c.id, productId: champ(req, 'produit', 40) } })
    res.redirect(303, `${req.baseUrl}/compte/envies?ok=retire`)
  }),
)

// Sécurité

marketClientRouter.get(
  '/compte/securite',
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    perso(res, pageSecurite({ base: req.baseUrl, rayons: await rayons(), client: c, succes: message(req) }))
  }),
)

marketClientRouter.post(
  '/compte/securite',
  formulaire,
  limiteCompte,
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    try {
      const maj = await changerMotDePasse(c, String(req.body?.actuel ?? ''), String(req.body?.nouveau ?? ''))
      ouvrirSession(req, res, maj)
      res.redirect(303, `${req.baseUrl}/compte/securite?ok=mdp`)
    } catch (err) {
      if (!(err instanceof ErreurCompte)) throw err
      perso(res, pageSecurite({ base: req.baseUrl, rayons: await rayons(), client: c, erreur: err.message }), 400)
    }
  }),
)

marketClientRouter.post(
  '/compte/supprimer',
  formulaire,
  limiteCompte,
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    try {
      await supprimerCompte(c, String(req.body?.motDePasse ?? ''))
      fermerSession(req, res)
      perso(res, pageMessage(req.baseUrl, 'Compte supprimé', 'Votre compte DropShop Market est supprimé. Merci de votre visite.', { libelle: "Retour à l'accueil", href: `${req.baseUrl}/` }))
    } catch (err) {
      if (!(err instanceof ErreurCompte)) throw err
      perso(res, pageSecurite({ base: req.baseUrl, rayons: await rayons(), client: c, erreur: err.message }), 400)
    }
  }),
)

// Avis vérifiés : seulement l'acheteur connecté, sur une ligne expédiée, une fois.

marketClientRouter.post(
  '/compte/avis',
  formulaire,
  page(async (req, res) => {
    const c = await exigerClient(req, res)
    if (!c) return
    const ligne = await prisma.order.findFirst({ where: { id: champ(req, 'ligne', 40), marketClientId: c.id, paidAt: { not: null }, status: { in: ['SHIPPED', 'DELIVERED'] } } })
    const etoiles = Math.min(5, Math.max(1, Number.parseInt(champ(req, 'etoiles', 1), 10) || 0))
    const texte = champ(req, 'texte', 2000)
    if (!ligne || !ligne.marketNumero) return res.redirect(303, `${req.baseUrl}/compte/commandes`)
    if (texte.length < 10 || !etoiles) return res.redirect(303, `${req.baseUrl}/compte/commandes/${encodeURIComponent(ligne.marketNumero)}`)
    const [prenom, ...reste] = c.nom.split(/\s+/)
    const auteur = `${prenom}${reste.length ? ` ${reste[reste.length - 1][0].toUpperCase()}.` : ''}`
    await prisma.buyerReview.upsert({
      where: { productId_empreinte: { productId: ligne.productId, empreinte: `market:${ligne.id}` } },
      create: { userId: ligne.userId, productId: ligne.productId, stars: etoiles, author: auteur, text: texte, source: 'market', sourceSite: 'drop-shop.cloud', reviewedAt: new Date(), empreinte: `market:${ligne.id}`, marketClientId: c.id },
      update: {},
    })
    res.redirect(303, `${req.baseUrl}/compte/commandes/${encodeURIComponent(ligne.marketNumero)}?ok=avis`)
  }),
)

// ——— Suivi sans compte et retours ———

const limiteSuivi = rateLimit({ name: 'market-suivi', windowMs: 15 * 60_000, max: 30 })

/** Une commande prouvée par son numéro et l'email de l'acheteur. */
async function commandeParPreuve(numero: string, email: string) {
  if (!/^DSM-[A-Z0-9]{8}$/.test(numero) || !emailValide(email)) return null
  const lignes = await lignesDe({ marketNumero: numero, paidAt: { not: null }, buyerEmail: { equals: email, mode: 'insensitive' } })
  return (await versCommandes(lignes, null))[0] ?? null
}

/**
 * La facture (ou l'avoir) d'une ligne, pour son acheteur : le client connecté
 * qui l'a passée, ou l'invité qui prouve le numéro de commande et son email.
 */
marketClientRouter.get(
  '/facture',
  limiteSuivi,
  page(async (req, res) => {
    const ligne = String(req.query.ligne ?? '').slice(0, 60)
    const type = req.query.type === 'avoir' ? 'avoir' : 'facture'
    const client = await clientConnecte(req)
    const numero = String(req.query.numero ?? '').trim().toUpperCase().slice(0, 20)
    const email = normaliserEmail(req.query.email)
    const o = ligne
      ? await prisma.order.findFirst({
          where: {
            id: ligne,
            platform: 'DROPSHOP_MARKET',
            OR: [
              ...(client ? [{ marketClientId: client.id }] : []),
              ...(/^DSM-[A-Z0-9]{8}$/.test(numero) && emailValide(email) ? [{ marketNumero: numero, buyerEmail: { equals: email, mode: 'insensitive' as const } }] : []),
            ],
          },
          select: { id: true },
        })
      : null
    const html = o ? await pageFacture(o.id, type) : null
    if (!html) return perso(res, pageMessage(req.baseUrl, 'Facture introuvable', "Le vendeur n'a pas encore émis de facture pour cet article, ou ce lien ne correspond pas à votre commande.", { libelle: 'Suivre une commande', href: `${req.baseUrl}/suivi` }), 404)
    res.set('Cache-Control', 'private, no-store').type('html').send(html)
  }),
)

marketClientRouter.get(
  '/suivi',
  limiteSuivi,
  page(async (req, res) => {
    const numero = String(req.query.numero ?? '').trim().toUpperCase().slice(0, 20)
    const email = normaliserEmail(req.query.email)
    const r = await rayons()
    if (!numero && !email) return perso(res, pageSuivi({ base: req.baseUrl, rayons: r }))
    const o = await commandeParPreuve(numero, email)
    if (!o) return perso(res, pageSuivi({ base: req.baseUrl, rayons: r, numero, email, erreur: "Aucune commande payée ne correspond à ce numéro et à cet email." }), 404)
    perso(res, pageDetailCommande({ base: req.baseUrl, rayons: r, commande: o, client: null, preuve: { numero, email }, succes: message(req) }))
  }),
)

marketClientRouter.post(
  '/retour',
  formulaire,
  limiteSuivi,
  page(async (req, res) => {
    const client = await clientConnecte(req)
    const numero = champ(req, 'numero', 20).toUpperCase()
    const email = normaliserEmail(req.body?.email)
    const ligne = await prisma.order.findFirst({
      where: {
        id: champ(req, 'ligne', 40),
        platform: 'DROPSHOP_MARKET',
        paidAt: { not: null },
        OR: [...(client ? [{ marketClientId: client.id }] : []), ...(numero && emailValide(email) ? [{ marketNumero: numero, buyerEmail: { equals: email, mode: 'insensitive' as const } }] : [])],
      },
      include: { product: { select: { title: true, aiTitle: true } }, user: { select: { email: true } }, marketRetours: { select: { id: true } } },
    })
    if (!ligne || !ligne.marketNumero) return perso(res, pageMessage(req.baseUrl, 'Commande introuvable', 'Nous ne retrouvons pas cet article dans vos commandes.'), 404)
    const retourPage = client && ligne.marketClientId === client.id ? `/compte/commandes/${encodeURIComponent(ligne.marketNumero)}?ok=retour` : `/suivi?numero=${encodeURIComponent(ligne.marketNumero)}&email=${encodeURIComponent(email)}&ok=retour`
    if (ligne.marketRetours.length) return res.redirect(303, `${req.baseUrl}${retourPage}`)
    const motif = MOTIFS[champ(req, 'motif', 20)] ? champ(req, 'motif', 20) : 'retractation'
    const texte = champ(req, 'message', 2000)
    await prisma.marketRetour.create({ data: { orderId: ligne.id, clientId: client?.id ?? null, motif, message: texte } })

    const titre = ligne.product.aiTitle || ligne.product.title
    const acheteur = ligne.buyerEmail ?? client?.email ?? email
    const sur = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const corps = `Commande ${ligne.marketNumero} — ${ligne.quantity} × ${sur(titre)}${ligne.variante ? ` (${sur(ligne.variante)})` : ''}<br>Acheteur : ${sur(ligne.buyerName)} (${sur(acheteur)})<br>Motif : <b>${MOTIFS[motif]}</b>${texte ? `<br><br>« ${sur(texte)} »` : ''}`
    try {
      if (ligne.user.email) {
        await sendMail({
          to: ligne.user.email,
          subject: `Demande de retour — DropShop Market ${ligne.marketNumero}`,
          heading: 'Un acheteur demande un retour.',
          body: `${corps}<br><br>Acceptez le retour (avec l'adresse où renvoyer le colis) ou refusez-le depuis « Mes ventes » de votre espace DropShop Market ; vous pouvez aussi répondre à cet email. Le remboursement se fait ensuite en un clic au même endroit. Pour une rétractation, le remboursement (livraison initiale comprise) doit intervenir au plus tard 14 jours après cette demande ; il peut attendre la réception du colis ou la preuve de son envoi.`,
          actionLabel: 'Répondre au retour',
          actionUrl: `${frontendUrl()}/dropshop-market`,
          footer: 'DropShop Market (drop-shop.cloud) — le service client est en copie.',
          replyTo: acheteur || undefined,
        })
      }
      await sendMail({ to: EDITEUR.email, subject: `[Market] Retour ${ligne.marketNumero}`, heading: 'Demande de retour', body: corps, footer: 'Copie pour le service client DropShop Market.', brand: 'DropShop Market', replyTo: acheteur || undefined })
      if (acheteur) {
        await sendMail({
          to: acheteur,
          subject: `DropShop Market — demande de retour reçue (${ligne.marketNumero})`,
          heading: 'Votre demande de retour est enregistrée.',
          body: `${ligne.quantity} × ${sur(titre)}<br>Motif : ${MOTIFS[motif]}<br><br>Le vendeur vous répond par email avec l'adresse de retour (vous la retrouvez aussi dans le détail de votre commande). Une fois le colis renvoyé, vous êtes remboursé au plus tard 14 jours après votre demande (le remboursement peut attendre la réception du colis). Sans réponse du vendeur, écrivez-nous depuis la page de contact : nous suivons votre demande.`,
          footer: `Numéro de commande : ${ligne.marketNumero}.`,
          brand: 'DropShop Market',
        })
      }
    } catch (e) {
      console.error('[market] email de retour', e instanceof Error ? e.message : e)
    }
    res.redirect(303, `${req.baseUrl}${retourPage}`)
  }),
)

// ——— Contact ———

marketClientRouter.get(
  '/contact',
  page(async (req, res) => {
    const [client, r] = await Promise.all([clientConnecte(req), rayons()])
    const numero = String(req.query.numero ?? '').toUpperCase().slice(0, 20)
    perso(res, pageContact({ base: req.baseUrl, rayons: r, client, numero: /^DSM-[A-Z0-9]{8}$/.test(numero) ? numero : undefined, envoye: req.query.ok === 'envoye' }))
  }),
)

marketClientRouter.post(
  '/contact',
  formulaire,
  rateLimit({ name: 'market-contact', windowMs: 3600_000, max: 10 }),
  page(async (req, res) => {
    const client = await clientConnecte(req)
    const v = { nom: champ(req, 'nom', 80), email: normaliserEmail(req.body?.email), sujet: SUJETS_CONTACT[champ(req, 'sujet', 20)] ? champ(req, 'sujet', 20) : 'autre', message: champ(req, 'message', 4000) }
    const numero = champ(req, 'numero', 20).toUpperCase()
    // Le champ piège : un humain ne le voit pas, un robot le remplit.
    if (champ(req, 'site', 200)) return res.redirect(303, `${req.baseUrl}/contact?ok=envoye`)
    if (!v.nom || !emailValide(v.email) || v.message.length < 10) {
      return perso(res, pageContact({ base: req.baseUrl, rayons: await rayons(), client, numero, valeurs: v, erreur: 'Indiquez votre nom, un email valide et un message de 10 caractères au moins.' }), 400)
    }
    await prisma.marketContact.create({ data: { ...v, sujet: SUJETS_CONTACT[v.sujet], numero: numero || null, clientId: client?.id ?? null } })

    const sur = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const corps = `De : ${sur(v.nom)} (${sur(v.email)})${client ? ' — client inscrit' : ''}<br>Sujet : ${sur(SUJETS_CONTACT[v.sujet])}${numero ? `<br>Commande : ${sur(numero)}` : ''}<br><br>${sur(v.message).replace(/\n/g, '<br>')}`
    try {
      await sendMail({ to: EDITEUR.email, subject: `[Market] ${SUJETS_CONTACT[v.sujet]}${numero ? ` — ${numero}` : ''}`, heading: 'Nouveau message au service client', body: corps, footer: "Répondez directement à cet email : la réponse part à l'acheteur.", brand: 'DropShop Market', replyTo: v.email })
      // La commande citée appartient bien à cet acheteur : ses vendeurs reçoivent le message aussi.
      if (/^DSM-[A-Z0-9]{8}$/.test(numero)) {
        const vendeurs = await prisma.order.findMany({
          where: { marketNumero: numero, OR: [{ buyerEmail: { equals: v.email, mode: 'insensitive' } }, ...(client ? [{ marketClientId: client.id }] : [])] },
          select: { user: { select: { email: true } } },
          distinct: ['userId'],
        })
        for (const x of vendeurs) {
          if (!x.user.email) continue
          await sendMail({ to: x.user.email, subject: `Message d'un acheteur — DropShop Market ${numero}`, heading: 'Un acheteur vous écrit au sujet de sa commande.', body: corps, actionLabel: 'Voir mes commandes', actionUrl: `${frontendUrl()}/orders`, footer: "Répondez directement à cet email : la réponse part à l'acheteur. Le service client DropShop Market est en copie.", replyTo: v.email })
        }
      }
      await sendMail({ to: v.email, subject: 'DropShop Market — nous avons bien reçu votre message', heading: 'Message reçu, merci.', body: `Bonjour ${sur(v.nom)},<br><br>Nous avons bien reçu votre message et vous répondons à cette adresse.<br><br><span style="opacity:.8">${sur(v.message).replace(/\n/g, '<br>')}</span>`, footer: `DropShop Market — ${EDITEUR.email}`, brand: 'DropShop Market' })
    } catch (e) {
      console.error('[market] email de contact', e instanceof Error ? e.message : e)
    }
    res.redirect(303, `${req.baseUrl}/contact?ok=envoye`)
  }),
)

// ——— Pages d'information ———

for (const cle of Object.keys(PAGES_INFO).filter((k) => k !== 'contact')) {
  marketClientRouter.get(
    `/${cle}`,
    page(async (req, res) => {
      res.set('Cache-Control', 'public, max-age=3600').type('html').send(pageInfo({ base: req.baseUrl, rayons: await rayons(), cle }))
    }),
  )
}
