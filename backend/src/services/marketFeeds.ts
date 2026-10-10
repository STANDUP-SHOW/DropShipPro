import { marketUrl, tranchePrix, trancheMarge, attributGoogle, descriptionDe, etatPour, codeBarresDe, type Annonce, type Offre } from './market.js'
import { videoDe } from './marketPages.js'

/**
 * Les flux de DropShop Market : Google Merchant Center, catalogue Meta,
 * comparateurs de prix, et l'import Google Ads Editor.
 *
 * **Une ligne par variante**, partout. C'est ce que font les outils de flux
 * (Channable, DataFeedWatch) et c'est ce que Google demande : un t-shirt en
 * trois couleurs et quatre tailles est douze articles regroupés par
 * `item_group_id`, chacun avec son prix, sa photo, sa disponibilité et sa
 * propre page. Une annonce Shopping « Pull noir taille M » mène alors sur la
 * page du pull noir en M, pas sur une fiche où l'acheteur doit tout rechoisir.
 */

function xmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(new RegExp('[\u0000-\u0008\u000B\u000C\u000E-\u001F]', 'g'), '')
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function prixFlux(o: Offre) {
  return `${o.prix.toFixed(2)} ${o.devise}`
}

function descriptionFlux(a: Annonce) {
  return descriptionDe(a.product).replace(/\s+/g, ' ').slice(0, 4900)
}

/** Coupe par mots, jamais au milieu d'un mot. */
export function couper(texte: string, max: number): string {
  const t = texte.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const coupe = t.slice(0, max + 1)
  const espace = coupe.lastIndexOf(' ')
  return (espace > max * 0.5 ? coupe.slice(0, espace) : t.slice(0, max)).replace(/[\s,;:–-]+$/, '')
}

/** La catégorie racine : « Mode > Femme > Robes » → « Mode ». */
function racine(a: Annonce) {
  return a.categorie?.path.split('>')[0]?.trim() || 'Divers'
}

/** Ce que chaque variante dit d'elle-même à Google : color, size, material, pattern. */
function attributsVariante(o: Offre): Array<[string, string]> {
  if (!o.combo) return []
  const pris = new Set<string>()
  const res: Array<[string, string]> = []
  for (const [nom, valeur] of Object.entries(o.combo)) {
    const attr = attributGoogle(nom)
    if (!attr || pris.has(attr) || !valeur) continue
    pris.add(attr)
    res.push([attr, valeur.slice(0, 100)])
  }
  return res
}

const lien = (chemin: string) => `${marketUrl()}${chemin}`

/** Le flux Google Merchant Center (RSS 2.0), une entrée par variante. */
export function googleMarketRss(annonces: Annonce[]): string {
  const items: string[] = []
  for (const a of annonces) {
    const gtin = a.offres.length === 1 ? codeBarresDe(a.product) : null
    for (const o of a.offres) {
      if (!o.image) continue // Google refuse un article sans photo.
      const lignes = [
        '    <item>',
        `      <g:id>${xmlText(o.id)}</g:id>`,
        o.cle ? `      <g:item_group_id>${xmlText(o.productId)}</g:item_group_id>` : '',
        `      <title>${xmlText(couper(o.titre, 150))}</title>`,
        `      <description>${xmlText(descriptionFlux(a))}</description>`,
        `      <link>${xmlText(lien(o.chemin))}</link>`,
        `      <g:image_link>${xmlText(o.image)}</g:image_link>`,
        ...o.images
          .filter((i) => i !== o.image)
          .slice(0, 10)
          .map((i) => `      <g:additional_image_link>${xmlText(i)}</g:additional_image_link>`),
        `      <g:price>${prixFlux(o)}</g:price>`,
        `      <g:availability>${o.disponible ? 'in_stock' : 'out_of_stock'}</g:availability>`,
        `      <g:condition>${etatPour(a.product.condition, 'flux')}</g:condition>`,
        `      <g:brand>${xmlText(a.vendeur.nom)}</g:brand>`,
        gtin ? `      <g:gtin>${gtin}</g:gtin>` : '      <g:identifier_exists>no</g:identifier_exists>',
        a.categorie?.google ? `      <g:google_product_category>${xmlText(a.categorie.google)}</g:google_product_category>` : '',
        a.categorie?.path ? `      <g:product_type>${xmlText(a.categorie.path)}</g:product_type>` : '',
        ...attributsVariante(o).map(([k, v]) => `      <g:${k}>${xmlText(v)}</g:${k}>`),
        // Le prix affiché est le prix payé : la livraison est comprise.
        a.prime
          ? '      <g:shipping><g:country>FR</g:country><g:price>0.00 EUR</g:price><g:min_transit_time>1</g:min_transit_time><g:max_transit_time>1</g:max_transit_time></g:shipping>'
          : '      <g:shipping><g:country>FR</g:country><g:price>0.00 EUR</g:price><g:min_transit_time>4</g:min_transit_time><g:max_transit_time>12</g:max_transit_time></g:shipping>',
        // Prime : expédié le jour même (délai de préparation nul).
        `      <g:min_handling_time>${a.prime ? 0 : 1}</g:min_handling_time>`,
        `      <g:max_handling_time>${a.prime ? 0 : 3}</g:max_handling_time>`,
        // Les étiquettes qui découpent les campagnes Shopping / Performance Max.
        `      <g:custom_label_0>${xmlText(a.vendeur.nom.slice(0, 100))}</g:custom_label_0>`,
        `      <g:custom_label_1>${tranchePrix(o.prix)}</g:custom_label_1>`,
        `      <g:custom_label_2>${xmlText(racine(a).slice(0, 100))}</g:custom_label_2>`,
        `      <g:custom_label_3>${trancheMarge(a.product, o.prix)}</g:custom_label_3>`,
        // Prime à part : une campagne « livré en 24 h » se pilote avec son propre budget.
        `      <g:custom_label_4>${a.prime ? 'prime-24h' : 'standard'}</g:custom_label_4>`,
        '    </item>',
      ]
      items.push(lignes.filter(Boolean).join('\n'))
    }
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    '    <title>DropShop Market</title>',
    `    <link>${xmlText(marketUrl())}</link>`,
    '    <description>Catalogue DropShop Market, une entrée par variante</description>',
    ...items,
    '  </channel>',
    '</rss>',
  ].join('\n')
}

const META_COLONNES = [
  'id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'link',
  'image_link', 'additional_image_link', 'brand', 'google_product_category', 'color', 'size',
  'custom_label_0', 'custom_label_1', 'video[0].url',
]

/** Le catalogue Meta (Facebook, Instagram), au format CSV, une ligne par variante. */
export function metaMarketCsv(annonces: Annonce[]): string {
  const lignes = [META_COLONNES.join(',')]
  for (const a of annonces) {
    for (const o of a.offres) {
      if (!o.image) continue
      const attrs = Object.fromEntries(attributsVariante(o))
      lignes.push(
        [
          o.id,
          o.cle ? o.productId : '',
          couper(o.titre, 150),
          descriptionFlux(a),
          o.disponible ? 'in stock' : 'out of stock',
          etatPour(a.product.condition, 'flux'),
          prixFlux(o),
          lien(o.chemin),
          o.image,
          o.images.filter((i) => i !== o.image).slice(0, 10).join(','),
          a.vendeur.nom,
          a.categorie?.google ?? '',
          attrs.color ?? '',
          attrs.size ?? '',
          a.vendeur.nom,
          tranchePrix(o.prix),
          // Meta reprend la vidéo du vendeur dans ses publicités catalogue.
          videoDe(a) ?? '',
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return lignes.join('\n')
}

const COMPARATEUR_COLONNES = [
  'id', 'id_groupe', 'titre', 'description', 'prix', 'devise', 'url', 'image', 'marque', 'ean',
  'disponibilite', 'categorie', 'frais_de_port', 'delai_livraison', 'etat', 'variante',
]

/**
 * Le flux des comparateurs de prix (Idealo, Kelkoo, LeGuide, Cherchons…).
 *
 * Ils lisent tous un tableau à colonnes nommées et se laissent configurer sur
 * n'importe quels noms : un CSV unique, aux noms explicites, s'y branche sans
 * réécriture. Une ligne par variante, comme pour Google.
 */
export function comparateurCsv(annonces: Annonce[]): string {
  const lignes = [COMPARATEUR_COLONNES.join(',')]
  for (const a of annonces) {
    const ean = a.offres.length === 1 ? codeBarresDe(a.product) ?? '' : ''
    for (const o of a.offres) {
      if (!o.image) continue
      lignes.push(
        [
          o.id,
          o.productId,
          couper(o.titre, 150),
          descriptionFlux(a).slice(0, 1000),
          o.prix.toFixed(2),
          o.devise,
          lien(o.chemin),
          o.image,
          a.vendeur.nom,
          ean,
          o.disponible ? 'en stock' : 'rupture',
          a.categorie?.path ?? '',
          '0.00',
          a.prime ? '24 h' : '5-15 jours',
          etatPour(a.product.condition, 'flux'),
          o.libelleVariante ?? '',
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return lignes.join('\n')
}

const ADS_COLONNES = [
  'Campaign', 'Ad Group', 'Keyword', 'Criterion Type', 'Max CPC', 'Ad type',
  'Headline 1', 'Headline 2', 'Headline 3', 'Headline 4', 'Headline 5', 'Headline 6',
  'Description 1', 'Description 2', 'Description 3', 'Final URL', 'Path 1', 'Path 2',
]

/** Un titre d'annonce Google Ads : 30 caractères au plus, coupé par mots. */
function titreAds(t: string) {
  return couper(t, 30)
}

function prixTexte(p: number) {
  return `${p.toFixed(2).replace('.', ',')} €`
}

/**
 * Les annonces texte Google Ads, prêtes à importer dans Google Ads Editor.
 *
 * C'est la « création multiple » de Channable : chaque variante devient un
 * groupe d'annonces avec ses mots-clés (expression et exact) et une annonce
 * responsive dont les titres reprennent le produit, la variante et le prix.
 * Une campagne par grand rayon, pour piloter les budgets à ce niveau.
 *
 * Fichier → Importer → depuis un fichier, dans Google Ads Editor ; les
 * campagnes arrivent en brouillon, rien ne se dépense avant publication.
 */
export function googleAdsEditorCsv(annonces: Annonce[]): string {
  const lignes = [ADS_COLONNES.join(',')]
  const vide = (n: number) => Array<string>(n).fill('')
  const ligne = (cells: string[]) => lignes.push(cells.map(csvCell).join(','))

  for (const a of annonces) {
    const campagne = `DropShop Market - ${racine(a)}`
    for (const o of a.offres) {
      if (!o.disponible) continue
      const groupe = couper(`${o.titre} [${o.id.slice(-8)}]`, 255)
      const valeurs = o.combo ? Object.values(o.combo).join(' ') : ''
      const base = couper(o.titreProduit.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' '), 70)
      const motsCles = new Map<string, string>()
      motsCles.set(`${base}|Phrase`, base)
      if (valeurs) motsCles.set(`${base} ${valeurs.toLowerCase()}|Phrase`, `${base} ${valeurs.toLowerCase()}`)
      motsCles.set(`${base}|Exact`, base)

      for (const [cle, mot] of motsCles) {
        const type = cle.split('|')[1]
        ligne([campagne, groupe, mot, type, '', '', ...vide(6), ...vide(3), lien(o.chemin), '', ''])
      }

      const titres = [
        titreAds(o.titreProduit),
        valeurs ? titreAds(valeurs) : titreAds(`Seulement ${prixTexte(o.prix)}`),
        titreAds(`À ${prixTexte(o.prix)} livré`),
        a.prime ? 'Livré en 24 h' : 'Livraison offerte',
        'Paiement sécurisé',
        titreAds(a.vendeur.nom),
      ]
      const descriptions = [
        couper(`${o.titre}. ${prixTexte(o.prix)}, livraison comprise.`, 90),
        couper(descriptionDe(a.product), 90),
        couper(`Vendu par ${a.vendeur.nom} sur DropShop Market. Paiement sécurisé par Stripe.`, 90),
      ]
      ligne([
        campagne, groupe, '', '', '', 'Responsive search ad',
        ...titres, ...descriptions, lien(o.chemin),
        couper(racine(a).toLowerCase().replace(/[^a-z0-9-]/g, ''), 15),
        couper((valeurs || 'offre').toLowerCase().replace(/[^\p{L}\p{N}-]/gu, ''), 15),
      ])
    }
  }
  return lignes.join('\n')
}
