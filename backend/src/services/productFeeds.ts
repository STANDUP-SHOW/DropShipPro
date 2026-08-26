import type { Product } from '@prisma/client'
import { titleForChannel } from './channelCopy.js'
import { absoluteUrl } from '../lib/urls.js'

/**
 * Les flux produits lus par Meta et par Google.
 *
 * Instagram n'a pas d'API pour « publier une annonce » : la boutique Instagram
 * et la boutique Facebook s'alimentent toutes deux du catalogue Meta, et ce
 * catalogue se remplit par un flux que Meta vient lire de lui-même plusieurs
 * fois par jour. Google Merchant Center fonctionne de la même façon.
 *
 * C'est la seule voie propre vers ces trois destinations : elle passe par les
 * outils que les plateformes ont prévus, au lieu de piloter un compte vendeur à
 * la place du marchand.
 *
 * Le vendeur colle l'adresse une fois. Ensuite, tout ce qu'il publie sur « Mon
 * site » y remonte tout seul.
 */

export interface FeedItem {
  product: Product
  category: string | null
}

/** Meta et Google veulent « 19.90 EUR », point décimal et devise collée. */
function priceOf(product: Product) {
  const value = Number(product.sellingPrice) || Number(product.price) || 0
  return `${value.toFixed(2)} ${product.currency || 'EUR'}`
}

function imagesOf(product: Product): string[] {
  const raw = Array.isArray(product.images) ? product.images : []
  return raw
    .filter((i): i is string => typeof i === 'string')
    .map((i) => absoluteUrl(i))
    .filter((i) => i.startsWith('http'))
}

function descriptionOf(product: Product) {
  const text = product.aiDescription || product.description || product.title
  // Meta coupe à 9 500 caractères et rejette la ligne entière au-delà.
  return text.replace(/\s+/g, ' ').trim().slice(0, 9000)
}

/**
 * Le titre du flux, coupe par mots et non par lettres.
 *
 * Google Shopping accepte cent cinquante caracteres. Couper au cent
 * cinquantieme donnait « Montre automatique homme acier inoxyd », qui ne se
 * cherche plus. La variante longue tient presque toujours ; sinon on retire des
 * mots par la fin.
 */
function titleOf(product: Product) {
  return titleForChannel(product, 'GOOGLE_SHOPPING')
}

/** Échappe une valeur CSV : guillemets doublés, champ toujours entouré. */
function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

const META_COLUMNS = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'additional_image_link',
  'brand',
  'google_product_category',
]

/**
 * Le flux Meta, au format CSV.
 *
 * `link` doit pointer vers une page publique décrivant le produit. Le vendeur
 * qui n'a pas de site pointe vers la fiche du catalogue : Meta exige une
 * adresse joignable, pas une boutique complète.
 */
export function metaCsv(items: FeedItem[], shopKey: string, brandFallback: string): string {
  const lines = [META_COLUMNS.join(',')]

  for (const { product, category } of items) {
    const images = imagesOf(product)
    if (!images.length) continue // Meta refuse un article sans photo : autant l'omettre.

    lines.push(
      [
        product.id,
        titleOf(product),
        descriptionOf(product),
        'in stock',
        'new',
        priceOf(product),
        absoluteUrl(`/api/public/shops/${shopKey}/products/${product.id}`),
        images[0],
        images.slice(1, 11).join(','),
        brandFallback,
        category ?? '',
      ]
        .map((cell) => csvCell(String(cell)))
        .join(','),
    )
  }

  return lines.join('\n')
}

/** Échappe le texte inséré dans du XML. Sans cela, une esperluette casse le flux. */
function xmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Les caractères de contrôle sont interdits en XML 1.0 et font rejeter le
    // flux entier, pas seulement l'article fautif.
    .replace(new RegExp('[\u0000-\u0008\u000B\u000C\u000E-\u001F]', 'g'), '')
}

/** Le flux Google Merchant Center, au format RSS 2.0. */
export function googleRss(items: FeedItem[], shopKey: string, shopName: string, brandFallback: string): string {
  const entries = items
    .map(({ product, category }) => {
      const images = imagesOf(product)
      if (!images.length) return ''

      const extra = images
        .slice(1, 11)
        .map((i) => `      <g:additional_image_link>${xmlText(i)}</g:additional_image_link>`)
        .join('\n')

      return [
        '    <item>',
        `      <g:id>${xmlText(product.id)}</g:id>`,
        `      <title>${xmlText(titleOf(product))}</title>`,
        `      <description>${xmlText(descriptionOf(product))}</description>`,
        `      <link>${xmlText(absoluteUrl(`/api/public/shops/${shopKey}/products/${product.id}`))}</link>`,
        `      <g:image_link>${xmlText(images[0])}</g:image_link>`,
        extra,
        `      <g:price>${xmlText(priceOf(product))}</g:price>`,
        '      <g:availability>in stock</g:availability>',
        '      <g:condition>new</g:condition>',
        `      <g:brand>${xmlText(brandFallback)}</g:brand>`,
        category ? `      <g:product_type>${xmlText(category)}</g:product_type>` : '',
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .filter(Boolean)
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    `    <title>${xmlText(shopName)}</title>`,
    `    <link>${xmlText(absoluteUrl(`/api/public/shops/${shopKey}/products`))}</link>`,
    `    <description>${xmlText(`Catalogue ${shopName}`)}</description>`,
    entries,
    '  </channel>',
    '</rss>',
  ].join('\n')
}
