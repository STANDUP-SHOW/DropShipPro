/**
 * L'import de commandes — la voie de TOUTES les plateformes sans API branchée.
 *
 * Nos vendeurs vendent sur plus de cent cinquante canaux ; une petite partie
 * seulement remonte ses ventes seule (ventesMarketplaces.ts). Mais toutes, ou
 * presque, savent exporter leurs commandes en CSV depuis le back-office
 * vendeur. Cet import lit ce fichier, quelle que soit la plateforme : les
 * colonnes sont reconnues par leur nom (français, anglais, allemand, espagnol,
 * italien), le séparateur est deviné, les lignes d'une même commande sont
 * regroupées. Puis tout passe par `enregistrerVentes`, exactement comme une
 * vente captée : même rattachement par UGS, même idempotence — importer deux
 * fois le même fichier ne double rien.
 *
 * Ce qu'il refuse de deviner : une ligne sans référence produit reconnue est
 * listée, jamais rattachée au hasard ; une commande marquée annulée, remboursée
 * ou impayée est écartée.
 */
import type { Platform } from '@prisma/client'
import { enregistrerVentes, type BilanCapture, type VenteCapturee } from './ventesMarketplaces.js'

type Champ =
  | 'commande' | 'sku' | 'quantite' | 'montant' | 'devise' | 'date' | 'statut' | 'titre'
  | 'nom' | 'prenom' | 'nomFamille' | 'email' | 'telephone'
  | 'adresse1' | 'adresse2' | 'ville' | 'codePostal' | 'region' | 'pays' | 'codePays'

/**
 * Les noms de colonnes reconnus, déjà normalisés (minuscules, sans accents ni
 * ponctuation). Le premier champ qui reconnaît une colonne la prend ; l'ordre
 * compte donc pour les noms ambigus (« name » est le nom de l'acheteur, pas le
 * titre du produit, sauf s'il est précédé de « product »).
 */
const SYNONYMES: Array<[Champ, string[]]> = [
  ['commande', ['order id', 'orderid', 'order number', 'order no', 'order', 'numero de commande', 'n de commande', 'no commande', 'commande', 'id commande', 'reference commande', 'ref commande', 'bestellnummer', 'numero de pedido', 'pedido', 'numero ordine', 'amazon order id', 'order reference', 'purchase order', 'id']],
  ['sku', ['sku', 'seller sku', 'offer sku', 'merchant sku', 'ugs', 'reference', 'reference produit', 'ref produit', 'reference vendeur', 'ref vendeur', 'code article', 'artikelnummer', 'item sku', 'lineitem sku', 'variant sku', 'custom label', 'shop sku', 'offer id', 'reference offre']],
  ['quantite', ['quantity', 'qty', 'quantite', 'qte', 'quantity purchased', 'lineitem quantity', 'menge', 'cantidad', 'quantita']],
  // Les totaux de ligne d'abord ; un prix unitaire (UNITAIRES) est multiplié par la quantité.
  ['montant', ['line total', 'item total', 'lineitem total', 'total price', 'montant ligne', 'total ligne', 'lineitem price', 'item price', 'unit price', 'prix unitaire', 'sale price', 'selling price', 'sold for', 'prix de vente', 'price', 'prix', 'total', 'amount', 'montant', 'montant total', 'total ttc', 'prix total', 'betrag', 'importe', 'importo']],
  ['devise', ['currency', 'devise', 'monnaie', 'wahrung', 'moneda', 'valuta']],
  ['date', ['date', 'order date', 'created at', 'date de commande', 'date commande', 'purchase date', 'sale date', 'date de vente', 'bestelldatum', 'fecha', 'data ordine', 'paid at']],
  ['statut', ['status', 'statut', 'order status', 'etat', 'financial status', 'payment status', 'statut de paiement', 'etat de la commande', 'order state']],
  ['titre', ['product name', 'product title', 'item title', 'item name', 'titre', 'titre produit', 'nom du produit', 'libelle', 'designation', 'lineitem name', 'article', 'produit', 'product']],
  ['prenom', ['first name', 'firstname', 'prenom', 'shipping first name', 'vorname', 'nombre']],
  ['nomFamille', ['last name', 'lastname', 'nom de famille', 'shipping last name', 'nachname', 'apellidos']],
  ['nom', ['buyer name', 'recipient name', 'customer name', 'shipping name', 'ship to name', 'nom', 'nom client', 'nom acheteur', 'client', 'acheteur', 'destinataire', 'name', 'full name']],
  ['email', ['email', 'e mail', 'buyer email', 'customer email', 'courriel', 'mail']],
  ['telephone', ['phone', 'telephone', 'tel', 'buyer phone', 'shipping phone', 'ship phone number', 'mobile', 'telefon', 'telefono']],
  ['adresse1', ['address', 'address 1', 'address1', 'adresse', 'adresse 1', 'shipping address 1', 'shipping address1', 'ship address 1', 'street', 'rue', 'strasse', 'direccion', 'indirizzo', 'shipping street']],
  ['adresse2', ['address 2', 'address2', 'adresse 2', 'complement d adresse', 'complement', 'shipping address 2', 'shipping address2', 'ship address 2']],
  ['ville', ['city', 'ville', 'shipping city', 'ship city', 'stadt', 'ciudad', 'citta', 'localite']],
  ['codePostal', ['zip', 'zip code', 'postal code', 'postcode', 'code postal', 'cp', 'shipping zip', 'ship postal code', 'plz', 'codigo postal', 'cap']],
  ['region', ['state', 'province', 'region', 'shipping province', 'ship state', 'departement']],
  ['codePays', ['country code', 'code pays', 'shipping country code', 'ship country', 'countrycode', 'iso pays']],
  ['pays', ['country', 'pays', 'shipping country', 'land', 'pais', 'paese']],
]

const normaliser = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Le séparateur le plus fréquent de la ligne d'en-tête, hors guillemets. */
function separateurDe(entete: string): string {
  const compte = (c: string) => entete.split(c).length - 1
  return [';', ',', '\t', '|'].sort((a, b) => compte(b) - compte(a))[0]
}

/** Découpe un CSV (guillemets, guillemets doublés, retours à la ligne dans un champ). */
export function lireCsv(texte: string): string[][] {
  const t = texte.replace(/^﻿/, '')
  const premiere = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = separateurDe(premiere)
  const lignes: string[][] = []
  let champ = ''
  let ligne: string[] = []
  let guillemets = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++ }
      else if (c === '"') guillemets = false
      else champ += c
      continue
    }
    if (c === '"') guillemets = true
    else if (c === sep) { ligne.push(champ); champ = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      ligne.push(champ); champ = ''
      if (ligne.some((x) => x.trim())) lignes.push(ligne)
      ligne = []
    } else champ += c
  }
  ligne.push(champ)
  if (ligne.some((x) => x.trim())) lignes.push(ligne)
  return lignes
}

/** Les noms de montant qui désignent un prix À L'UNITÉ. */
const UNITAIRES = new Set(['lineitem price', 'item price', 'unit price', 'prix unitaire', 'sale price', 'selling price', 'sold for', 'prix de vente', 'price', 'prix'])

/**
 * Quelle colonne porte quel champ, et sous quel nom reconnu. Le synonyme le
 * plus précis gagne (l'ordre de la liste), pas la colonne la plus à gauche :
 * « Shipping Name » l'emporte sur « Name », qui chez Shopify est le numéro de
 * commande. Deux passes : les noms exacts d'abord, les « contient » ensuite.
 */
export function correspondance(entete: string[]): { index: Partial<Record<Champ, number>>; reconnu: Partial<Record<Champ, string>> } {
  const noms = entete.map(normaliser)
  const pris = new Set<number>()
  const index: Partial<Record<Champ, number>> = {}
  const reconnu: Partial<Record<Champ, string>> = {}
  for (const exact of [true, false]) {
    for (const [champ, synonymes] of SYNONYMES) {
      if (index[champ] !== undefined) continue
      for (const s of synonymes) {
        const i = noms.findIndex((n, k) => !pris.has(k) && (exact ? n === s : s.length > 3 && (n.startsWith(`${s} `) || n.endsWith(` ${s}`))))
        if (i >= 0) {
          index[champ] = i
          reconnu[champ] = s
          pris.add(i)
          break
        }
      }
    }
  }
  return { index, reconnu }
}

/** « 1 234,56 € », « 1,234.56 », « EUR 12.00 » → nombre. */
export function lireMontant(brut: string): number {
  let s = brut.replace(/[^\d,.-]/g, '')
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (s.includes(',')) {
    s = /,\d{3}$/.test(s) && !/^-?0,/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** « 29/09/2026 14:02 », ISO, « 2026-09-29 » → date ; maintenant si illisible. */
function lireDate(brut: string | undefined): Date {
  if (!brut?.trim()) return new Date()
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(brut.trim())
  if (fr) return new Date(Date.UTC(+fr[3], +fr[2] - 1, +fr[1], +(fr[4] ?? 12), +(fr[5] ?? 0)))
  const d = new Date(brut)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

/** Les statuts qui disent « pas payé » ou « défait », dans les langues des exports. */
const ECARTE = /(annul|cancel|refund|rembours|pending|en attente|unpaid|impay|expire|refus|failed|echou|storn|void)/i

export interface ResultatImport extends BilanCapture {
  colonnes: Partial<Record<Champ, string>>
  ecartees: number
  manquantes: string[]
}

export function ventesDuCsv(platform: Platform, texte: string): { ventes: VenteCapturee[]; colonnes: Partial<Record<Champ, string>>; ecartees: number; manquantes: string[] } {
  const lignes = lireCsv(texte)
  if (lignes.length < 2) return { ventes: [], colonnes: {}, ecartees: 0, manquantes: ['le fichier ne contient aucune ligne de commande'] }
  const [entete, ...corps] = lignes
  const { index: col, reconnu } = correspondance(entete)
  const unitaire = UNITAIRES.has(reconnu.montant ?? '')
  const colonnes = Object.fromEntries(Object.entries(col).map(([k, i]) => [k, entete[i as number].trim()])) as Partial<Record<Champ, string>>
  const manquantes = (['commande', 'sku', 'montant'] as const).filter((c) => col[c] === undefined).map((c) => ({ commande: 'numéro de commande', sku: 'référence produit (SKU)', montant: 'montant' })[c])
  if (manquantes.length) return { ventes: [], colonnes, ecartees: 0, manquantes }

  const v = (l: string[], c: Champ) => (col[c] !== undefined ? (l[col[c]!] ?? '').trim() : '')
  const parCommande = new Map<string, VenteCapturee>()
  let ecartees = 0
  corps.forEach((l, index) => {
    const id = v(l, 'commande')
    if (!id) return
    if (ECARTE.test(v(l, 'statut'))) {
      ecartees++
      return
    }
    let vente = parCommande.get(id)
    if (!vente) {
      const nom = v(l, 'nom') || [v(l, 'prenom'), v(l, 'nomFamille')].filter(Boolean).join(' ') || 'Acheteur'
      const codePays = v(l, 'codePays') || (/^[A-Za-z]{2}$/.test(v(l, 'pays')) ? v(l, 'pays') : '')
      vente = {
        platform,
        externalOrderId: id,
        numero: id,
        creeLe: lireDate(v(l, 'date')),
        devise: (v(l, 'devise') || 'EUR').toUpperCase().slice(0, 3),
        acheteur: {
          nom,
          email: v(l, 'email') || null,
          adresse: {
            name: nom,
            address1: v(l, 'adresse1') || undefined,
            address2: v(l, 'adresse2') || undefined,
            city: v(l, 'ville') || undefined,
            zip: v(l, 'codePostal') || undefined,
            province: v(l, 'region') || undefined,
            countryCode: codePays ? codePays.toUpperCase() : undefined,
            country: v(l, 'pays') || undefined,
            phone: v(l, 'telephone') || undefined,
          },
        },
        lignes: [],
      }
      parCommande.set(id, vente)
    }
    const quantite = Math.max(1, Math.round(lireMontant(v(l, 'quantite')) || 1))
    const montant = lireMontant(v(l, 'montant'))
    vente.lignes.push({
      externalLineId: `${id}#${index}`,
      sku: v(l, 'sku') || null,
      titre: v(l, 'titre'),
      quantite,
      montant: Math.round((unitaire ? montant * quantite : montant) * 100) / 100,
    })
  })
  return { ventes: [...parCommande.values()], colonnes, ecartees, manquantes: [] }
}

export async function importerCommandes(userId: string, platform: Platform, texte: string): Promise<ResultatImport> {
  const { ventes, colonnes, ecartees, manquantes } = ventesDuCsv(platform, texte)
  const bilan = manquantes.length ? { lues: 0, creees: 0, deja: 0, sansProduit: [] } : await enregistrerVentes(userId, ventes)
  return { ...bilan, colonnes, ecartees, manquantes }
}
