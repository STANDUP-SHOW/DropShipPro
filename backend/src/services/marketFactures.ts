import { prisma } from '../lib/prisma.js'

/**
 * Les factures des ventes DropShop Market, émises AU NOM DU VENDEUR.
 *
 * Sur une place de marché, c'est le vendeur qui vend : la facture porte son
 * identité, pas la nôtre. DropShipper ne fait que l'outil (numérotation, mise
 * en page, envoi), à partir de l'identité qu'il a saisie lui-même. Tant qu'elle
 * est incomplète, aucune facture ne part : une facture sans SIRET ni adresse ne
 * vaut rien, et on n'invente pas ces champs.
 *
 * Numérotation : une série par vendeur, continue et sans trou
 * (`F-2026-00001`, puis `A-2026-00002` pour un avoir), comme l'exige
 * l'article 242 nonies A de l'annexe II du CGI. Le compteur et le numéro sont
 * posés dans la même transaction : deux émissions simultanées ne peuvent ni
 * sauter un numéro ni en donner deux à la même vente.
 */

export interface IdentiteFacture {
  /** Nom et prénom (entrepreneur individuel) ou raison sociale. */
  raisonSociale: string
  adresse: string
  siret: string
  /** Franchise en base (micro-entreprise) : « TVA non applicable, art. 293 B du CGI ». */
  regime: 'franchise' | 'assujetti'
  /** Taux appliqué aux ventes, quand le vendeur est assujetti (20, 10, 5,5…). */
  taux: number | null
  tva: string | null
  /** Forme juridique, capital, RCS… : ce que le vendeur veut voir en pied. */
  mentions: string | null
}

const TAUX = [20, 10, 5.5, 2.1]

export class ErreurFacture extends Error {}

/** Valide la saisie du vendeur ; rend l'identité nettoyée ou lève avec le champ fautif. */
export function lireIdentite(brut: unknown): IdentiteFacture {
  const b = (brut ?? {}) as Record<string, unknown>
  const t = (k: string, max: number) => String(b[k] ?? '').trim().slice(0, max)
  const siret = t('siret', 20).replace(/\s+/g, '')
  const regime = b.regime === 'assujetti' ? 'assujetti' : 'franchise'
  const taux = regime === 'assujetti' ? Number(String(b.taux ?? '').replace(',', '.')) : null
  const id: IdentiteFacture = {
    raisonSociale: t('raisonSociale', 120),
    adresse: t('adresse', 300),
    siret,
    regime,
    taux,
    tva: t('tva', 20).replace(/\s+/g, '') || null,
    mentions: t('mentions', 300) || null,
  }
  if (!id.raisonSociale) throw new ErreurFacture('Indiquez votre nom ou votre raison sociale.')
  if (id.adresse.length < 8) throw new ErreurFacture('Indiquez votre adresse complète.')
  if (!/^\d{14}$/.test(id.siret)) throw new ErreurFacture('Le SIRET compte 14 chiffres.')
  if (regime === 'assujetti') {
    if (taux == null || !TAUX.includes(taux)) throw new ErreurFacture('Choisissez votre taux de TVA (20 %, 10 %, 5,5 % ou 2,1 %).')
    if (!id.tva || !/^FR[0-9A-Z]{2}\d{9}$/.test(id.tva)) throw new ErreurFacture('Un vendeur assujetti indique son numéro de TVA intracommunautaire (FR + 11 caractères).')
  }
  return id
}

/** L'identité enregistrée, ou null si elle manque ou ne passe plus la validation. */
export function identiteDe(json: unknown): IdentiteFacture | null {
  if (!json) return null
  try {
    return lireIdentite(json)
  } catch {
    return null
  }
}

async function numeroter(userId: string, orderId: string, champ: 'factureNumero' | 'avoirNumero', prefixe: 'F' | 'A'): Promise<string | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: userId }, data: { factureCompteur: { increment: 1 } }, select: { factureCompteur: true } })
      const numero = `${prefixe}-${new Date().getFullYear()}-${String(u.factureCompteur).padStart(5, '0')}`
      const fait = await tx.order.updateMany({
        where: { id: orderId, userId, [champ]: null },
        data: champ === 'factureNumero' ? { factureNumero: numero, factureEmiseAt: new Date() } : { avoirNumero: numero },
      })
      // Déjà numérotée par un appel concurrent : on annule l'incrément, pas de trou.
      if (!fait.count) throw new DejaNumerotee()
      return numero
    })
  } catch (e) {
    if (e instanceof DejaNumerotee) return null
    throw e
  }
}
class DejaNumerotee extends Error {}

/**
 * Émet la facture d'une ligne payée. Rend son numéro (l'existant si elle en a
 * déjà un), ou lève si l'identité du vendeur est incomplète.
 */
export async function emettreFacture(orderId: string, userId: string): Promise<string> {
  const o = await prisma.order.findFirst({ where: { id: orderId, userId, platform: 'DROPSHOP_MARKET' }, include: { user: { select: { factureIdentite: true } } } })
  if (!o || !o.paidAt) throw new ErreurFacture('Vente introuvable ou non payée.')
  if (o.factureNumero) return o.factureNumero
  if (!identiteDe(o.user.factureIdentite)) throw new ErreurFacture("Renseignez d'abord votre identité de facturation (raison sociale, adresse, SIRET, TVA).")
  const n = await numeroter(userId, orderId, 'factureNumero', 'F')
  if (n) return n
  const relu = await prisma.order.findUnique({ where: { id: orderId }, select: { factureNumero: true } })
  return relu!.factureNumero!
}

/** Un remboursement annule la facture : l'avoir prend le numéro suivant de la série. */
export async function emettreAvoir(orderId: string, userId: string): Promise<string | null> {
  const o = await prisma.order.findFirst({ where: { id: orderId, userId }, select: { factureNumero: true, avoirNumero: true } })
  if (!o?.factureNumero) return null
  if (o.avoirNumero) return o.avoirNumero
  return numeroter(userId, orderId, 'avoirNumero', 'A')
}

/** Émet en silence les factures d'une vente qui vient d'être payée, pour les vendeurs prêts. */
export async function facturerAutomatiquement(lignes: Array<{ id: string; userId: string }>) {
  for (const l of lignes) {
    await emettreFacture(l.id, l.userId).catch(() => {})
  }
}

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const eur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
const jour = (d: Date) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

/** Le montant HT et la TVA d'un prix TTC, selon le régime du vendeur. */
export function ventiler(ttc: number, id: Pick<IdentiteFacture, 'regime' | 'taux'>) {
  if (id.regime !== 'assujetti' || !id.taux) return { ht: ttc, tva: 0 }
  const ht = Math.round((ttc / (1 + id.taux / 100)) * 100) / 100
  return { ht, tva: Math.round((ttc - ht) * 100) / 100 }
}

/**
 * La facture (ou l'avoir) d'une ligne, en page HTML autonome et imprimable.
 * Rendue depuis l'identité ENREGISTRÉE au moment de l'affichage : un vendeur
 * qui corrige une faute de frappe dans son adresse la voit corrigée partout.
 */
export async function pageFacture(orderId: string, type: 'facture' | 'avoir'): Promise<string | null> {
  const o = await prisma.order.findUnique({ where: { id: orderId }, include: { product: { select: { title: true, aiTitle: true } }, user: { select: { factureIdentite: true } } } })
  if (!o || !o.paidAt) return null
  const numero = type === 'facture' ? o.factureNumero : o.avoirNumero
  const id = identiteDe(o.user.factureIdentite)
  if (!numero || !id) return null
  const signe = type === 'avoir' ? -1 : 1
  const ttc = Number(o.amount) * signe
  const { ht, tva } = ventiler(ttc, id)
  const unitaire = ventiler((Number(o.amount) / o.quantity) * signe, id)
  const adr = (o.buyerAddress ?? {}) as Record<string, string>
  const adresseClient = [adr.street, [adr.zip, adr.city].filter(Boolean).join(' '), adr.country].filter(Boolean).map(esc).join('<br>')
  const titre = o.product.aiTitle || o.product.title
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${type === 'facture' ? 'Facture' : 'Avoir'} ${esc(numero)}</title>
<style>body{font-family:Inter,system-ui,sans-serif;color:#15122a;max-width:820px;margin:32px auto;padding:0 20px;line-height:1.5}h1{font-size:26px;margin:0}table{border-collapse:collapse;width:100%;margin:22px 0}td,th{border-bottom:1px solid #e4e2ee;padding:9px 6px;text-align:left;font-size:14px}th{background:#f6f5fa}.d{text-align:right}.grille{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-top:22px}.muted{color:#5d5a70;font-size:13px}button{border:0;border-radius:999px;background:#6b3fc4;color:#fff;font-weight:700;padding:10px 22px;cursor:pointer}@media print{button{display:none}body{margin:0}}</style></head><body>
<div class="grille"><div><b style="font-size:17px">${esc(id.raisonSociale)}</b><br>${esc(id.adresse).replace(/\n/g, '<br>')}<br>SIRET ${esc(id.siret)}${id.tva ? `<br>TVA ${esc(id.tva)}` : ''}${id.mentions ? `<br><span class="muted">${esc(id.mentions)}</span>` : ''}</div>
<div style="text-align:right"><h1>${type === 'facture' ? 'Facture' : 'Avoir'}</h1>N° <b>${esc(numero)}</b><br>Date : ${esc(jour(type === 'facture' ? o.factureEmiseAt ?? o.paidAt : o.rembourseAt ?? new Date()))}<br>Vente du ${esc(jour(o.paidAt))}${o.marketNumero ? `<br>Commande ${esc(o.marketNumero)}` : ''}${type === 'avoir' && o.factureNumero ? `<br>Annule la facture ${esc(o.factureNumero)}` : ''}</div></div>
<div style="margin-top:22px"><span class="muted">Client</span><br><b>${esc(o.buyerName)}</b><br>${adresseClient}</div>
<table><tr><th>Désignation</th><th class="d">Qté</th><th class="d">Prix unitaire HT</th>${id.regime === 'assujetti' ? '<th class="d">TVA</th>' : ''}<th class="d">Total HT</th></tr>
<tr><td>${esc(titre)}${o.variante ? `<br><span class="muted">${esc(o.variante)}</span>` : ''}<br><span class="muted">Livraison comprise</span></td><td class="d">${o.quantity}</td><td class="d">${eur(unitaire.ht)}</td>${id.regime === 'assujetti' ? `<td class="d">${String(id.taux).replace('.', ',')} %</td>` : ''}<td class="d">${eur(ht)}</td></tr></table>
<table style="width:auto;margin-left:auto"><tr><td>Total HT</td><td class="d">${eur(ht)}</td></tr>${id.regime === 'assujetti' ? `<tr><td>TVA ${String(id.taux).replace('.', ',')} %</td><td class="d">${eur(tva)}</td></tr>` : ''}<tr><th>Total TTC</th><th class="d">${eur(ttc)}</th></tr></table>
${id.regime === 'franchise' ? '<p>TVA non applicable, art. 293 B du CGI.</p>' : ''}
<p class="muted">${type === 'facture' ? `Payée le ${esc(jour(o.paidAt))} par carte bancaire sur DropShop Market (drop-shop.cloud), place de marché qui encaisse pour le compte du vendeur.` : 'Remboursement effectué sur le moyen de paiement utilisé lors de la commande.'}</p>
<p><button type="button" onclick="window.print()">Imprimer ou enregistrer en PDF</button></p></body></html>`
}
