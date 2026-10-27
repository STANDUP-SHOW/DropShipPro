import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Request, Response } from 'express'
import type { Product } from '@prisma/client'
import { offresDe, type Annonce } from './src/services/market.js'
import { pageProduit, carte, gabarit } from './src/services/marketPages.js'
import { lirePanier, ajouter, modifier, ecrirePanier, MAX_QUANTITE } from './src/services/marketPanier.js'
import { nouveauNumero } from './src/services/marketStripe.js'
import { PAGES_INFO, EDITEUR } from './src/services/marketLegal.js'
import { pageDetailCommande, type CommandeVue } from './src/services/marketPagesClient.js'

/**
 * Éprouve la boutique complète de DropShop Market (27/10/2026) sans base ni
 * Stripe : panier dans un cookie, « Ajouter au panier » partout (jamais
 * « Bientôt disponible »), pages légales, détail de commande, et les routes
 * qui ne lisent pas la base (pages d'information, connexion, contact).
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

process.env.PUBLIC_API_URL = 'https://api.exemple.fr'
process.env.MARKET_URL = 'https://drop-shop.cloud'
process.env.JWT_SECRET ||= 'banc'
process.env.DATABASE_URL ||= 'postgresql://banc@127.0.0.1:1/banc'

console.log('Panier :')
const req = (cookie: string) => ({ headers: { cookie }, baseUrl: '', protocol: 'https' }) as unknown as Request
let p = lirePanier(req('dsm_panier=' + encodeURIComponent('cabc-1234abcd~2|cxyz~1|<script>~3|cabc-1234abcd~1')))
exige(p.length === 2, `deux offres valides, doublon fusionné, saleté écartée (obtenu ${JSON.stringify(p)})`)
exige(p[0].quantite === 3, 'le doublon additionne les quantités')
p = ajouter(p, 'cxyz', 50)
exige(p.find((l) => l.offre === 'cxyz')!.quantite === MAX_QUANTITE, 'la quantité plafonne à 10')
p = modifier(p, 'cxyz', 0)
exige(!p.some((l) => l.offre === 'cxyz'), 'quantité 0 = retirer')
const entetes: string[] = []
const res = { append: (_k: string, v: string) => entetes.push(v) } as unknown as Response
ecrirePanier(req(''), res, p)
exige(entetes[0]?.startsWith('dsm_panier=') && entetes[0].includes('SameSite=Lax') && !entetes[0].includes('HttpOnly'), `cookie du panier lisible par la page, obtenu ${entetes[0]}`)

console.log('Numéro de commande :')
const numeros = new Set(Array.from({ length: 200 }, () => nouveauNumero()))
exige([...numeros].every((n) => /^DSM-[A-HJ-NP-Z2-9]{8}$/.test(n)), 'format DSM-XXXXXXXX sans 0/O ni 1/I')
exige(numeros.size === 200, 'pas de collision sur 200 tirages')

console.log('Fiche produit et cartes :')
const produit = {
  id: 'cprod0000000000000000001',
  userId: 'u1',
  title: 'Lampe',
  aiTitle: 'Lampe de chevet',
  description: 'Une lampe.',
  aiDescription: null,
  price: 10,
  shippingCost: 2,
  sellingPrice: 30,
  currency: 'EUR',
  images: ['https://cdn.exemple.fr/lampe.jpg'],
  condition: 'neuf',
  ean: null,
  bulletPoints: [],
  attributes: {},
  categoryId: null,
  metaDescription: null,
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  titleVariants: null,
  videoUrl: null,
  combinations: null,
} as unknown as Product
const annonce: Annonce = {
  product: produit,
  shop: { id: 's1', name: 'Boutique Test', slug: 'boutique-test' },
  // Un vendeur SANS paiements actifs : décision de max, il reste achetable.
  vendeur: { userId: 'u1', nom: 'Boutique Test', slug: 'boutique-test', encaisse: false, boutiqueUrl: null },
  categorie: null,
  offres: offresDe(produit),
  publishedAt: new Date(),
  prime: false,
  avis: { nombre: 0, moyenne: null, items: [] },
}
const fiche = pageProduit('', annonce, null, [], [annonce])
exige(!fiche.includes('Bientôt disponible'), 'plus jamais « Bientôt disponible »')
exige(fiche.includes('formaction="/panier/ajouter"') && fiche.includes('Ajouter au panier'), 'la fiche propose « Ajouter au panier »')
exige(fiche.includes('Acheter maintenant') && fiche.includes('action="/acheter"'), 'et « Acheter maintenant »')
exige(fiche.includes('/compte/envies/ajouter'), "et la liste d'envies")
exige(fiche.includes('Dans la même catégorie'), 'les produits voisins sont proposés')
const c = carte('', annonce)
exige(c.includes('action="/panier/ajouter"') && c.includes(annonce.offres[0].id), 'la carte ajoute directement un produit sans variante')

console.log('Gabarit :')
const g = gabarit({ base: '/market', titre: 't', description: 'd', chemin: null, corps: '' })
for (const lien of ['/market/panier', '/market/compte', '/market/compte/commandes', '/market/cgv', '/market/mentions-legales', '/market/retours', '/market/livraison', '/market/contact', '/market/confidentialite', '/market/aide', '/market/suivi']) {
  exige(g.includes(`href="${lien}"`), `en-tête ou pied : lien ${lien}`)
}

console.log('Pages légales :')
for (const [cle, info] of Object.entries(PAGES_INFO)) {
  const html = info.corps('/market')
  exige(!/\bnull\b|undefined/.test(html), `${cle} : aucune valeur vide affichée`)
  exige(!html.includes('href="contact"'), `${cle} : liens absolus au Market`)
}
const mentions = PAGES_INFO['mentions-legales'].corps('')
exige(mentions.includes(EDITEUR.nom) && mentions.includes('Béziers') && mentions.includes('Railway'), 'mentions : éditeur, adresse, hébergeur')
exige(EDITEUR.siret ? mentions.includes(EDITEUR.siret) : !mentions.includes('SIRET'), 'SIRET : affiché seulement quand max l\'a donné')
exige(PAGES_INFO.retours.corps('').includes('14 jours') && PAGES_INFO.retours.corps('').includes('L221-28'), 'retours : 14 jours et exceptions légales')
exige(PAGES_INFO.livraison.corps('').includes('30 jours'), 'livraison : délai légal par défaut')
exige(PAGES_INFO.cgv.corps('').includes('5 %'), 'CGV : commission de la plateforme dite')

console.log('Détail de commande :')
const commande: CommandeVue = {
  numero: 'DSM-ABCDEFGH',
  date: new Date(),
  total: 30,
  devise: 'EUR',
  adresse: '1 rue A, 75001 Paris, FR',
  lignes: [
    { id: 'o1', titre: 'Lampe', variante: null, quantite: 1, montant: 30, devise: 'EUR', statut: 'SHIPPED', paye: true, suivi: '6A12345678901', transporteur: null, image: null, chemin: '/p/x/lampe', vendeur: 'Boutique Test', retour: null, avisLaisse: false, peutRetour: true, peutAvis: false },
  ],
}
const invite = pageDetailCommande({ base: '', commande, client: null, preuve: { numero: 'DSM-ABCDEFGH', email: 'a@b.fr' } })
exige(invite.includes('Demander un retour') && invite.includes('name="numero" value="DSM-ABCDEFGH"'), "l'invité peut demander un retour, preuve jointe")
exige(invite.includes('6A12345678901') && invite.includes('Suivre le colis'), 'le suivi du colis est affiché')
exige(!invite.includes('Laisser un avis'), "pas d'avis sans compte (achat vérifié seulement)")

console.log('Routes sans base :')
const { marketRouter } = await import('./src/routes/market.js')
const app = express()
app.use('/market', marketRouter)
const serveur = app.listen(0)
const port = (serveur.address() as AddressInfo).port
const get = (chemin: string) => fetch(`http://127.0.0.1:${port}/market${chemin}`, { redirect: 'manual' })
try {
  for (const cle of Object.keys(PAGES_INFO)) {
    const r = await get(`/${cle}`)
    const t = await r.text()
    exige(r.status === 200 && t.includes('<h1>'), `/${cle} répond (${r.status})`)
  }
  for (const chemin of ['/contact', '/compte/connexion', '/compte/inscription', '/compte/oubli', '/suivi']) {
    const r = await get(chemin)
    exige(r.status === 200, `${chemin} répond (${r.status})`)
    exige(r.headers.get('cache-control') === 'no-store', `${chemin} n'est jamais mis en cache`)
  }
  const compte = await get('/compte')
  exige(compte.status === 303 && (compte.headers.get('location') ?? '').startsWith('/market/compte/connexion?retour='), `/compte sans session renvoie à la connexion (${compte.status} ${compte.headers.get('location')})`)
  const piege = await (await get('/compte/connexion?retour=' + encodeURIComponent('//evil.example'))).text()
  exige(!piege.includes('evil.example'), 'pas de redirection vers un autre site après connexion')
  const faux = await fetch(`http://127.0.0.1:${port}/market/compte/connexion`, { method: 'GET', headers: { cookie: 'dsm_session=faux.jeton.ici' } })
  exige(faux.status === 200, 'un cookie de session falsifié est ignoré')
  const robots = await (await get('/robots.txt')).text()
  exige(robots.includes('Disallow: /compte') && robots.includes('Disallow: /panier'), 'robots.txt : pages personnelles non indexées')
} finally {
  serveur.close()
}

console.log(echecs ? `\nDropShop Market, boutique : ${echecs} échec(s).` : '\nDropShop Market, boutique : tout est conforme.')
process.exit(echecs ? 1 : 0)
