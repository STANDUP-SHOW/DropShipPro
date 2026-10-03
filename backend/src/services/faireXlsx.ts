import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import type { Product } from '@prisma/client'
import { COLONNES_FAIRE, ligneFaire, type CatalogueFaire, type OptionsFaire } from './faire.js'
import { entrees } from './xlsx.js'

/**
 * Le catalogue Faire, dans LE fichier de Faire.
 *
 * Le CSV de `faire.ts` recopie les intitulés du modèle ; ce fichier-ci ne
 * recopie rien : il part du modèle officiel lui-même (`assets/faire-modele.xlsx`,
 * téléchargé du portail marque et fourni par Max le 03/10/2026) et le remplit
 * à partir de la ligne 6, comme un vendeur le ferait à la main.
 *
 * Pourquoi c'est plus sûr que le CSV : le modèle porte en ligne 5, masquée, les
 * clés machine que l'importeur de Faire lit (`eu_price_wholesale`,
 * `selling_method`…), ses listes de valeurs, ses en-têtes figés. En reprenant
 * le fichier tel quel, une coquille dans nos intitulés ne peut plus faire
 * refuser le dépôt — et le modèle en a une : ses six « Prix de l'échantillon »
 * sont tous intitulés « (EUR) ».
 *
 * Seule la feuille 1 change. Les quatre autres entrées du zip repartent à
 * l'octet près.
 */

const RACINE_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const CHEMIN_MODELE_FAIRE = path.join(RACINE_BACKEND, 'assets', 'faire-modele.xlsx')

const FEUILLE = 'xl/worksheets/sheet1.xml'
const PREMIERE_LIGNE = 6

/**
 * Les clés machine de la ligne 5, dans l'ordre. Le service vérifie que le
 * modèle les porte encore avant d'écrire : un modèle remplacé par une autre
 * version doit faire échouer l'export ici, pas le dépôt chez Faire.
 */
const CLES_LIGNE_5 = [
  'info_product_name', 'info_product_description', 'product_images_for_validation',
  'eu_price_wholesale', 'eu_price_retail', 'price_wholesale', 'price_retail',
  'canadian_price_wholesale', 'canadian_price_retail', 'uk_price_wholesale', 'uk_price_retail',
  'australian_price_wholesale', 'australian_price_retail', 'selling_method', 'case_quantity',
  'minimum_order_quantity', 'item_weight', 'item_weight_unit', 'item_length', 'item_width',
  'item_height', 'item_dimensions_unit', 'packaged_weight', 'packaged_weight_unit',
  'packaged_length', 'packaged_width', 'packaged_height', 'packaged_dimensions_unit',
  'option_1_name', 'option_1_value', 'option_2_name', 'option_2_value', 'option_3_name',
  'option_3_value', 'sku', 'gtin', 'info_product_type', 'info_status_v2', 'made_in_country',
  'eu_tester_price', 'tester_price', 'canadian_tester_price', 'uk_tester_price',
  'australian_tester_price', 'tester_price', 'preorderable', 'ship_by_start_date',
  'ship_by_end_date', 'order_by_date',
]

/** Columns written as numbers, not text: prices and quantities (Excel flags numbers stored as text). */
const NUMERIQUES = new Set<number>([3, 4, 14, 15])

export class ModeleFaireIllisible extends Error {}

function lettre(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function xml(texte: string): string {
  return texte
    // Characters XML 1.0 forbids: Excel refuses the whole file for one of them.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 32000) // Excel's per-cell limit is 32 767 characters.
}

function ligneXml(r: number, valeurs: string[]): string {
  const cellules = valeurs
    .map((v, i) => {
      if (v === '') return ''
      const ref = `${lettre(i)}${r}`
      if (NUMERIQUES.has(i) && /^\d+(\.\d+)?$/.test(v)) return `<c r="${ref}"><v>${v}</v></c>`
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`
    })
    .join('')
  return `<row r="${r}">${cellules}</row>`
}

function verifierModele(feuille: string): void {
  const ligne5 = feuille.match(/<row r="5"[^>]*>([\s\S]*?)<\/row>/)
  const cles = ligne5 ? [...ligne5[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]) : []
  if (cles.join(',') !== CLES_LIGNE_5.join(',')) {
    throw new ModeleFaireIllisible('Le modèle Faire a changé (ligne 5) : export arrêté avant de produire un fichier refusé.')
  }
  if (COLONNES_FAIRE.length !== CLES_LIGNE_5.length) {
    throw new ModeleFaireIllisible('Colonnes Faire et modèle désaccordés.')
  }
}

/** A plain zip writer: deflate each entry, CRC from node:zlib (Node ≥ 22.2). */
export function zipper(fichiers: Array<[string, Buffer]>): Buffer {
  const locaux: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [nom, donnees] of fichiers) {
    const n = Buffer.from(nom, 'utf8')
    const comp = zlib.deflateRawSync(donnees)
    const crc = zlib.crc32(donnees)

    const l = Buffer.alloc(30)
    l.writeUInt32LE(0x04034b50, 0)
    l.writeUInt16LE(20, 4)
    l.writeUInt16LE(0x0800, 6) // UTF-8 names
    l.writeUInt16LE(8, 8)
    l.writeUInt32LE(crc, 14)
    l.writeUInt32LE(comp.length, 18)
    l.writeUInt32LE(donnees.length, 22)
    l.writeUInt16LE(n.length, 26)
    locaux.push(l, n, comp)

    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(0x0800, 8)
    c.writeUInt16LE(8, 10)
    c.writeUInt32LE(crc, 16)
    c.writeUInt32LE(comp.length, 20)
    c.writeUInt32LE(donnees.length, 24)
    c.writeUInt16LE(n.length, 28)
    c.writeUInt32LE(offset, 42)
    central.push(c, n)

    offset += 30 + n.length + comp.length
  }
  const taille = central.reduce((t, b) => t + b.length, 0)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(fichiers.length, 8)
  fin.writeUInt16LE(fichiers.length, 10)
  fin.writeUInt32LE(taille, 12)
  fin.writeUInt32LE(offset, 16)
  return Buffer.concat([...locaux, ...central, fin])
}

export interface ClasseurFaire extends Omit<CatalogueFaire, 'csv'> {
  xlsx: Buffer
}

export function classeurFaire(
  produits: Product[],
  options: OptionsFaire = {},
  modele: Buffer = fs.readFileSync(CHEMIN_MODELE_FAIRE),
): ClasseurFaire {
  const fichiers = entrees(modele)
  for (const requis of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', FEUILLE]) {
    if (!fichiers[requis]) throw new ModeleFaireIllisible(`Modèle Faire incomplet : ${requis} manquant.`)
  }
  const feuille = fichiers[FEUILLE].toString('utf8')
  verifierModele(feuille)

  const lignes: string[] = []
  const ecartes: ClasseurFaire['ecartes'] = []
  for (const p of produits) {
    const l = ligneFaire(p, options)
    if (l.refus) {
      ecartes.push({ id: p.id, titre: p.aiTitle || p.title, raison: l.refus })
      continue
    }
    lignes.push(ligneXml(PREMIERE_LIGNE + lignes.length, l.valeurs))
  }

  const derniere = Math.max(5, PREMIERE_LIGNE + lignes.length - 1)
  const remplie = feuille
    .replace(/<dimension ref="[^"]*"\s*\/>/, `<dimension ref="A1:${lettre(COLONNES_FAIRE.length - 1)}${derniere}"/>`)
    .replace('</sheetData>', `${lignes.join('')}</sheetData>`)

  const sortie = Object.entries(fichiers).map(([nom, b]): [string, Buffer] =>
    nom === FEUILLE ? [nom, Buffer.from(remplie, 'utf8')] : [nom, b],
  )
  return { xlsx: zipper(sortie), retenus: lignes.length, ecartes }
}
