import type { Product } from '@prisma/client'
import { offresDe, boutiqueUrlDe, cleVariante, slugify, attributGoogle, arbreMarket, type Annonce, type Rayon } from './src/services/market.js'
import { googleMarketRss, metaMarketCsv, comparateurCsv, googleAdsEditorCsv, couper } from './src/services/marketFeeds.js'
import { pageProduit, pageListe, produitLd, carte } from './src/services/marketPages.js'
import { commissionCentimes } from './src/services/marketStripe.js'

/**
 * Éprouve DropShop Market sans base ni Stripe : les offres par variante, les
 * flux (Google, Meta, comparateurs, Google Ads Editor), les pages et leurs
 * données structurées, la commission.
 *
 * Ce que le banc garde : **une variante = une offre = une page = un article de
 * flux**, regroupés par `item_group_id`. C'est la promesse faite pour Google
 * Shopping ; la casser enverrait douze annonces vers une seule fiche, ou une
 * seule annonce pour douze produits.
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

const base = {
  id: 'cprod0000000000000000001',
  userId: 'u1',
  title: 'Pull en laine mérinos',
  aiTitle: 'Pull col rond en laine mérinos & cachemire',
  description: 'Un pull doux.\n\nLavable en machine <b>30°</b>.',
  aiDescription: null,
  price: 10,
  shippingCost: 2,
  sellingPrice: 30,
  currency: 'EUR',
  images: ['/storage/products/pull.jpg', 'https://cdn.exemple.fr/pull-2.jpg'],
  condition: 'neuf',
  ean: null,
  bulletPoints: ['100 % mérinos'],
  attributes: { Matière: 'Laine' },
  categoryId: 'mode-femme-pulls',
  metaDescription: null,
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  titleVariants: null,
  videoUrl: null,
} as unknown as Product

const avecVariantes = {
  ...base,
  combinations: [
    { combo: { Couleur: 'Noir', Taille: 'M' }, prix: 10, image: 'https://cdn.exemple.fr/noir.jpg', disponible: true },
    { combo: { Couleur: 'Noir', Taille: 'L' }, prix: 12, disponible: true },
    { combo: { Couleur: 'Écru', Taille: 'M' }, prix: 10, disponible: false },
  ],
} as unknown as Product

console.log('Offres :')
const simples = offresDe({ ...base, combinations: null } as unknown as Product)
exige(simples.length === 1 && simples[0].cle === null, 'un produit sans variantes donne une seule offre')
exige(simples[0].prix === 30, `prix de vente du produit, obtenu ${simples[0].prix}`)
exige(simples[0].image === 'https://api.exemple.fr/storage/products/pull.jpg', `photo absolue, obtenu ${simples[0].image}`)

const offres = offresDe(avecVariantes)
exige(offres.length === 3, `trois variantes, trois offres (obtenu ${offres.length})`)
exige(offres[1].prix === 36, `la marge se reporte sur la variante plus chère : 12 × 3 = 36, obtenu ${offres[1].prix}`)
exige(offres[0].image === 'https://cdn.exemple.fr/noir.jpg', 'la photo propre à la variante passe en premier')
exige(offres[2].disponible === false, 'une variante indisponible le reste')
exige(new Set(offres.map((o) => o.chemin)).size === 3, 'chaque variante a sa propre page')
exige(offres.every((o) => o.chemin.startsWith(offres[0].cheminProduit + '/')), 'la page de variante vit sous la fiche')
exige(/\/ecru-m-[0-9a-f]{8}$/.test(offres[2].chemin), `adresse lisible et sans accent, obtenu ${offres[2].chemin}`)
exige(cleVariante({ Taille: 'M', Couleur: 'Noir' }) === offres[0].cle, "la clé ne dépend pas de l'ordre des options")
exige(slugify('Pull col rond & cachemire !') === 'pull-col-rond-cachemire', 'slug')
exige(attributGoogle('Coloris') === 'color' && attributGoogle('Pointure') === 'size' && attributGoogle('Style') === null, 'attributs Google reconnus')

const annonce: Annonce = {
  product: avecVariantes,
  shop: { id: 's1', name: 'Maison Laine', slug: 'maison-laine' },
  vendeur: { userId: 'u1', nom: 'Maison Laine', slug: 'maison-laine', encaisse: true, boutiqueUrl: 'https://maison-laine.exemple.fr' },
  categorie: { id: 'vetements-pour-femmes-pulls', label: 'Pulls', path: 'Vêtements pour femmes > Pulls', google: 'Apparel & Accessories > Clothing > Sweaters', rayon: { id: 'vetements-pour-femmes', label: 'Vêtements pour femmes' } },
  offres,
  publishedAt: new Date(),
  prime: false,
}

console.log('Flux Google Merchant :')
const rss = googleMarketRss([annonce])
exige((rss.match(/<item>/g) ?? []).length === 3, 'un article par variante')
exige((rss.match(/<g:item_group_id>cprod0000000000000000001<\/g:item_group_id>/g) ?? []).length === 3, 'item_group_id sur chaque variante')
exige(rss.includes('<g:color>Noir</g:color>') && rss.includes('<g:size>L</g:size>'), 'couleur et taille déclarées')
exige(rss.includes('<g:availability>out_of_stock</g:availability>'), 'la rupture est déclarée')
exige(rss.includes('<g:price>36.00 EUR</g:price>'), 'prix propre à la variante')
exige(rss.includes('&amp; cachemire'), 'esperluette échappée')
exige(rss.includes('<g:custom_label_0>Maison Laine</g:custom_label_0>'), 'étiquette vendeur pour segmenter les campagnes')
exige(rss.includes('<link>https://drop-shop.cloud/p/cprod0000000000000000001/'), 'liens vers drop-shop.cloud')
exige(!rss.includes('<g:gtin>'), "pas de GTIN produit répété sur des variantes")

console.log('Flux Meta, comparateurs, Google Ads :')
const meta = metaMarketCsv([annonce]).split('\n')
exige(meta.length === 4, `Meta : en-tête + 3 lignes, obtenu ${meta.length}`)
const comp = comparateurCsv([annonce]).split('\n')
exige(comp.length === 4 && comp[0].startsWith('id,id_groupe'), 'comparateurs : une ligne par variante')
const ads = googleAdsEditorCsv([annonce]).split('\n')
const colonnes = ads[0].split(',').length
exige(ads.slice(1).every((l) => (l.match(/","/g) ?? []).length === colonnes - 1), 'Google Ads : toutes les lignes ont le bon nombre de colonnes')
exige(ads.some((l) => l.includes('Responsive search ad')), 'une annonce responsive par variante')
exige(!ads.some((l) => l.includes('Écru')), "pas d'annonce pour une variante épuisée")
const titresTropLongs = ads
  .filter((l) => l.includes('Responsive search ad'))
  .flatMap((l) => l.slice(1, -1).split('","').slice(6, 12))
  .filter((t) => t.length > 30)
exige(titresTropLongs.length === 0, `titres Google Ads ≤ 30 caractères (${titresTropLongs.join(' | ')})`)
exige(couper('un deux trois quatre', 10) === 'un deux', `coupe par mots, obtenu « ${couper('un deux trois quatre', 10)} »`)

console.log('Pages :')
const fiche = pageProduit('', annonce, null)
exige(fiche.includes('<link rel="canonical" href="https://drop-shop.cloud/p/cprod0000000000000000001/'), 'canonique sur drop-shop.cloud')
exige(fiche.includes('"@type":"ProductGroup"') && fiche.includes('"hasVariant"'), 'ProductGroup + hasVariant')
exige(fiche.includes('"variesBy":["https://schema.org/color","https://schema.org/size"]'), 'variesBy couleur et taille')
exige(fiche.includes('BreadcrumbList'), "fil d'Ariane structuré")
exige(!fiche.includes('<b>30°</b>'), 'le HTML de la description est neutralisé')
exige(offres.every((o) => fiche.includes(`href="${o.chemin}"`)), 'chaque variante est un lien suivable depuis la fiche')
const variante = pageProduit('/market', annonce, offres[1])
exige(variante.includes(`href="https://drop-shop.cloud${offres[1].chemin}"`), 'la page de variante est sa propre canonique')
exige(variante.includes('name="offre" value="' + offres[1].id + '"'), "le bouton achète cette variante-là")
exige(variante.includes('href="/market/'), "liens préfixés en aperçu")
exige(variante.includes('36,00'), 'prix de la variante affiché')
const ld = produitLd(annonce, offres[1]) as { hasVariant: Array<{ sku: string }> }
exige(ld.hasVariant[0].sku === offres[1].id, 'la variante courante vient en tête du ProductGroup')
const piege = pageProduit('', { ...annonce, product: { ...avecVariantes, aiTitle: '</script><script>alert(1)</script>' } as unknown as Product, offres: offresDe({ ...avecVariantes, aiTitle: '</script><script>alert(1)</script>' } as unknown as Product) }, null)
exige(!piege.includes('<script>alert(1)'), 'un titre ne peut pas injecter de script')
exige(fiche.includes('href="/c/vetements-pour-femmes"') && fiche.includes('href="/c/vetements-pour-femmes/vetements-pour-femmes-pulls"'), "fil d'Ariane : rayon puis sous-catégorie")

console.log('Les 24 catégories :')
// Sans base, l'arbre retombe sur la graine livrée avec le code.
process.env.DATABASE_URL = 'postgresql://personne@127.0.0.1:1/aucune'
const { rayons } = await arbreMarket()
exige(rayons.length === 24, `24 rayons, obtenu ${rayons.length}`)
const sousTotal = rayons.reduce((n, r) => n + r.sousCategories.length, 0)
exige(sousTotal >= 200, `les sous-catégories sont là (${sousTotal})`)
exige(rayons.every((r) => r.ids.includes(r.id) && r.sousCategories.every((c) => r.ids.includes(c.id))), "un rayon filtre ses sous-catégories")
const accueil = pageListe({ base: '', accueil: true, titre: 't', h1: 'h', description: 'd', chemin: '/', annonces: [annonce], rayons, page: 1, suivante: true })
exige(accueil.includes('"SearchAction"') && accueil.includes('rel="next"'), 'accueil : recherche structurée, pagination')
exige(rayons.every((r) => accueil.includes(`href="/c/${r.id}"`)), 'les 24 rayons sont liés depuis l accueil')
exige(rayons.every((r) => r.sousCategories.every((c) => accueil.includes(`href="/c/${r.id}/${c.id}"`))), 'chaque sous-catégorie est liée (méga-menu)')
const rayonMode = rayons.find((r) => r.sousCategories.length > 0) as Rayon
const pageRayon = pageListe({ base: '', titre: 't', h1: 'h', description: 'd', chemin: `/c/${rayonMode.id}`, annonces: [], rayons, puces: { rayon: rayonMode, courante: null }, page: 1, suivante: false, indexable: false, vide: 'vide' })
exige(pageRayon.includes('noindex') && pageRayon.includes('class="puces"'), 'catégorie vide : en ligne, non indexée, avec ses sous-catégories')

console.log('Prime :')
exige(accueil.includes('href="/prime"') && accueil.includes('btn-prime'), 'bouton Prime visible dans l en-tête')
exige(accueil.includes('bandeau-prime'), 'bandeau Prime sur l accueil')
const prime: Annonce = { ...annonce, prime: true }
exige(carte('', prime).includes('PRIME 24 h') && !carte('', annonce).includes('PRIME'), 'badge Prime sur la carte, et seulement là')
const fichePrime = pageProduit('', prime, offres[0], rayons)
exige(fichePrime.includes('Livré en 24 h'), 'promesse 24 h sur la fiche')
exige(fichePrime.includes('"transitTime":{"@type":"QuantitativeValue","minValue":1,"maxValue":1'), 'schema.org : transport 1 jour')
const rssPrime = googleMarketRss([prime])
exige(rssPrime.includes('<g:max_transit_time>1</g:max_transit_time>') && rssPrime.includes('<g:max_handling_time>0</g:max_handling_time>'), 'Google : délai 24 h déclaré')
exige(rssPrime.includes('<g:custom_label_4>prime-24h</g:custom_label_4>') && rss.includes('<g:custom_label_4>standard</g:custom_label_4>'), 'Prime segmentable en campagne')

console.log('Vendu par :')
exige(fiche.includes('Vendu par Maison Laine') && fiche.includes('href="https://maison-laine.exemple.fr"') && fiche.includes('Voir sa boutique'), 'la fiche dit « Vendu par » et lie la boutique du vendeur')
exige(fiche.includes('"seller":{"@type":"Organization","name":"Maison Laine","url":"https://maison-laine.exemple.fr"}'), 'schema.org : le vendeur porte l’adresse de sa boutique')
exige(boutiqueUrlDe({ slug: 'x', siteUrl: 'javascript:alert(1)' }) !== 'javascript:alert(1)' && boutiqueUrlDe({ slug: null, siteUrl: null }) === null, 'adresse de boutique : jamais de schéma douteux, rien sans boutique')
exige(boutiqueUrlDe({ slug: 'x', siteUrl: 'https://mon-site.fr' }) === 'https://mon-site.fr', 'son propre site prime sur la vitrine hébergée')

console.log('Vidéo et avis :')
const riche: Annonce = {
  ...annonce,
  product: { ...annonce.product, videoUrl: 'https://cdn.exemple.fr/v.mp4' } as Product,
  avis: {
    nombre: 12,
    moyenne: 4.4,
    items: [
      { etoiles: 5, auteur: 'Lina', texte: 'Très bien <b>', photos: ['https://cdn.exemple.fr/a.jpg'], date: new Date('2026-09-01'), origine: 'aliexpress.com' },
      { etoiles: 4, auteur: 'Marc', texte: 'Correct', photos: [], date: null, origine: null },
    ],
  },
}
const ficheRiche = pageProduit('', riche, null, rayons)
exige(ficheRiche.includes('<video src="https://cdn.exemple.fr/v.mp4"'), 'vidéo du vendeur sur la fiche')
exige(ficheRiche.includes('"@type":"VideoObject"') && ficheRiche.includes('"contentUrl":"https://cdn.exemple.fr/v.mp4"'), 'schema.org : VideoObject')
exige(ficheRiche.includes('id="avis"') && ficheRiche.includes('4,4 sur 5') && ficheRiche.includes('12 avis'), 'avis : note et compte')
exige(ficheRiche.includes('Avis recueilli sur aliexpress.com') && ficheRiche.includes('Avis transmis par le vendeur'), 'avis : origine affichée')
exige(ficheRiche.includes('Très bien &lt;b&gt;'), 'avis : texte échappé')
exige(!ficheRiche.includes('aggregateRating'), 'pas de note agrégée balisée (avis venus d ailleurs)')
exige(carte('', riche).includes('★★★★☆') && !carte('', annonce).includes('★'), 'étoiles sur la carte, seulement avec des avis')
exige(metaMarketCsv([riche]).includes('https://cdn.exemple.fr/v.mp4') && metaMarketCsv([riche]).split('\n')[0].endsWith('video[0].url'), 'Meta : vidéo dans le catalogue')
exige(!pageProduit('', annonce, null).includes('id="avis"'), 'aucune section avis sans avis')

console.log('Commission :')
exige(commissionCentimes(3000) === 150, '5 % de 30 € = 1,50 €')
exige(commissionCentimes(1999) === 100, 'arrondi au centime')

if (echecs) {
  console.log(`\n${echecs} échec(s).`)
  process.exit(1)
}
console.log('\nDropShop Market : tout est conforme.')
process.exit(0)
