import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'

/**
 * L'affiliation (décision de Max, 07/10/2026).
 *
 * Un affilié est un compte À PART, sans drops : il touche, à vie, 10 % des
 * euros que ses filleuls dépensent en recharges, et ce sont des euros, versés
 * par Max. Il se connecte avec son email et un code d'accès reçu par mail.
 *
 * Le chemin d'un euro :
 *   1. un visiteur arrive par www.drop-shipper.fr/?parrain=<code> → un clic ;
 *   2. il crée son compte → `User.affilieId` (rattachement unique, et seulement
 *      sur un compte neuf : on ne « vole » pas un client existant) ;
 *   3. chaque recharge payée (Stripe ou Shopify) → une `Commission` de 10 %,
 *      une seule par paiement (`paiementRef` unique).
 */

/** Part de l'affilié sur chaque recharge d'un filleul. */
export const TAUX_COMMISSION = 0.1

/** Un filleul qui a rechargé ou utilisé ses drops depuis moins de 30 jours est « actif ». */
export const JOURS_ACTIF = 30

/** Fenêtre pendant laquelle un compte neuf peut encore être rattaché à un affilié. */
const RATTACHEMENT_MAX_MS = 24 * 3600_000

// Sans 0/O ni 1/I/L : un code recopié d'un mail ne doit pas se tromper de lettre.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function tirage(longueur: number): string {
  const octets = crypto.randomBytes(longueur)
  return Array.from(octets, (o) => ALPHABET[o % ALPHABET.length]).join('')
}

/** Le code d'accès envoyé par mail : 10 caractères, ~49 bits, sous plafond de tentatives. */
export function nouveauCodeAcces(): string {
  return tirage(10)
}

/** Le code des liens, lisible : « DUPONT-7K3Q » quand le nom le permet. */
export async function nouveauCodeLien(nom: string): Promise<string> {
  const base =
    nom
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 10) || 'AFF'
  for (let i = 0; i < 6; i++) {
    const code = `${base}-${tirage(4)}`
    if (!(await prisma.affilie.findUnique({ where: { code }, select: { id: true } }))) return code
  }
  return `AFF-${tirage(8)}`
}

export const hacherCode = (code: string) => bcrypt.hash(code.toUpperCase(), 10)

export async function codeValide(code: string, hash: string | null): Promise<boolean> {
  if (!hash) return false
  return bcrypt.compare(code.trim().toUpperCase(), hash)
}

/** « jean.dupont@gmail.com » → « je•••@gmail.com » : l'affilié voit ses filleuls, pas leurs adresses. */
export function masquerEmail(email: string): string {
  const [local, domaine] = email.split('@')
  return `${local.slice(0, 2)}•••@${domaine ?? ''}`
}

/** Enregistre un clic. Rend faux si le code n'existe pas (rien n'est écrit). */
export async function enregistrerClic(code: string, page?: string): Promise<boolean> {
  const affilie = await prisma.affilie.findUnique({ where: { code: code.trim().toUpperCase() }, select: { id: true } })
  if (!affilie) return false
  await prisma.affiliationClic.create({ data: { affilieId: affilie.id, page: page?.slice(0, 200) || null } })
  return true
}

/**
 * Rattache un compte neuf à l'affilié du code. Refusé (sans erreur) si le
 * compte est déjà rattaché, a plus de 24 h, ou a déjà payé une recharge : le
 * lien d'affiliation amène des clients, il ne s'applique pas après coup.
 */
export async function rattacherFilleul(userId: string, code: string): Promise<'rattache' | 'refuse'> {
  const [user, affilie] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { affilieId: true, createdAt: true, email: true, _count: { select: { payments: true } } },
    }),
    prisma.affilie.findUnique({ where: { code: code.trim().toUpperCase() }, select: { id: true, email: true } }),
  ])
  if (!user || !affilie) return 'refuse'
  if (user.affilieId || user._count.payments > 0) return 'refuse'
  if (Date.now() - user.createdAt.getTime() > RATTACHEMENT_MAX_MS) return 'refuse'
  // S'affilier soi-même pour se rembourser 10 % : refusé sur l'adresse identique.
  if (user.email.toLowerCase() === affilie.email.toLowerCase()) return 'refuse'
  const res = await prisma.user.updateMany({ where: { id: userId, affilieId: null }, data: { affilieId: affilie.id } })
  return res.count ? 'rattache' : 'refuse'
}

/**
 * La commission d'une recharge payée. Appelée après le crédit des drops ;
 * ne lève jamais : une panne ici ne doit pas faire échouer un paiement.
 */
export async function commissionnerRecharge(userId: string, paiementRef: string, montantCentimes: number): Promise<void> {
  try {
    if (!(montantCentimes > 0)) return
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { affilieId: true } })
    if (!user?.affilieId) return
    await prisma.commission.create({
      data: {
        affilieId: user.affilieId,
        filleulId: userId,
        paiementRef,
        montantCentimes,
        commissionCentimes: Math.round(montantCentimes * TAUX_COMMISSION),
      },
    })
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') return // déjà commissionnée
    console.error('commission d’affiliation non enregistrée', paiementRef, err)
  }
}

/* ------------------------------------------------------------------ */
/* Versements                                                          */
/* ------------------------------------------------------------------ */

/**
 * Règle de versement (décision de Max, 08/10/2026) : un virement par mois,
 * dès 50 € dus. En dessous, la somme reste due et s'ajoute au mois suivant.
 */
export const SEUIL_VERSEMENT_CENTIMES = 5000

export const normaliserIban = (iban: string) => iban.replace(/[\s-]/g, '').toUpperCase()

/** Contrôle ISO 13616 : forme, puis clé modulo 97. Ne dit pas que le compte existe. */
export function ibanValide(brut: string): boolean {
  const iban = normaliserIban(brut)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const chiffres = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (l) => String(l.charCodeAt(0) - 55))
  let reste = 0
  for (const c of chiffres) reste = (reste * 10 + Number(c)) % 97
  return reste === 1
}

/** « FR76 •••• 0189 » : l'affilié reconnaît son compte sans que l'IBAN entier circule. */
export const masquerIban = (iban: string) => `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`

/**
 * Solde toutes les commissions dues d'un affilié par un versement. Rend le
 * versement, ou null s'il n'y avait rien à verser. Les commissions sont
 * prises par leurs identifiants : une recharge arrivée pendant l'opération
 * reste due pour le mois suivant.
 */
export async function verser(affilieId: string, reference?: string | null) {
  return prisma.$transaction(async (tx) => {
    const dues = await tx.commission.findMany({ where: { affilieId, payeeLe: null }, select: { id: true, commissionCentimes: true } })
    const montant = dues.reduce((a, c) => a + c.commissionCentimes, 0)
    if (!dues.length || montant <= 0) return null
    const versement = await tx.versement.create({ data: { affilieId, montantCentimes: montant, reference: reference || null } })
    const maj = await tx.commission.updateMany({
      where: { id: { in: dues.map((c) => c.id) }, payeeLe: null },
      data: { payeeLe: versement.createdAt, versementId: versement.id },
    })
    // Un second clic simultané aurait déjà soldé une partie : on annule plutôt que de compter double.
    if (maj.count !== dues.length) throw new Error('commissions déjà versées entre-temps')
    return versement
  })
}

/** La vue de l'admin : chaque affilié, ce qui lui est dû et où le virer. */
export async function listeVersementsAdmin() {
  const affilies = await prisma.affilie.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      nom: true,
      email: true,
      code: true,
      titulaire: true,
      iban: true,
      ibanMajLe: true,
      createdAt: true,
      _count: { select: { filleuls: true, clics: true } },
      commissions: { select: { commissionCentimes: true, payeeLe: true } },
      versements: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, montantCentimes: true, reference: true, createdAt: true } },
    },
  })
  const lignes = affilies.map((a) => {
    const gains = a.commissions.reduce((s, c) => s + c.commissionCentimes, 0)
    const dus = a.commissions.filter((c) => !c.payeeLe).reduce((s, c) => s + c.commissionCentimes, 0)
    return {
      id: a.id,
      nom: a.nom,
      email: a.email,
      code: a.code,
      inscritLe: a.createdAt,
      filleuls: a._count.filleuls,
      clics: a._count.clics,
      titulaire: a.titulaire,
      iban: a.iban,
      ibanMajLe: a.ibanMajLe,
      gainsCentimes: gains,
      dusCentimes: dus,
      versesCentimes: gains - dus,
      aVerser: dus >= SEUIL_VERSEMENT_CENTIMES && !!a.iban,
      versements: a.versements,
    }
  })
  lignes.sort((x, y) => Number(y.aVerser) - Number(x.aVerser) || y.dusCentimes - x.dusCentimes)
  return {
    seuilCentimes: SEUIL_VERSEMENT_CENTIMES,
    totaux: {
      affilies: lignes.length,
      aVerser: lignes.filter((l) => l.aVerser).length,
      dusCentimes: lignes.reduce((s, l) => s + l.dusCentimes, 0),
      dusAVerserCentimes: lignes.filter((l) => l.aVerser).reduce((s, l) => s + l.dusCentimes, 0),
      versesCentimes: lignes.reduce((s, l) => s + l.versesCentimes, 0),
    },
    affilies: lignes,
  }
}

/* ------------------------------------------------------------------ */
/* Tableau de bord                                                     */
/* ------------------------------------------------------------------ */

export type Periode = 'jour' | 'semaine' | 'mois' | 'annee'

/** Les cases du graphique : 30 jours, 12 semaines, 12 mois ou 5 ans, la plus récente en dernier. */
export function cases(periode: Periode, maintenant = new Date()): Array<{ cle: string; libelle: string; debut: Date; fin: Date }> {
  const out: Array<{ cle: string; libelle: string; debut: Date; fin: Date }> = []
  const jour = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()))
  const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  if (periode === 'jour') {
    for (let i = 29; i >= 0; i--) {
      const debut = new Date(jour.getTime() - i * 86400_000)
      out.push({ cle: debut.toISOString().slice(0, 10), libelle: `${debut.getUTCDate()} ${mois[debut.getUTCMonth()]}`, debut, fin: new Date(debut.getTime() + 86400_000) })
    }
  } else if (periode === 'semaine') {
    // Semaines du lundi au dimanche.
    const lundi = new Date(jour.getTime() - ((jour.getUTCDay() + 6) % 7) * 86400_000)
    for (let i = 11; i >= 0; i--) {
      const debut = new Date(lundi.getTime() - i * 7 * 86400_000)
      out.push({ cle: debut.toISOString().slice(0, 10), libelle: `sem. du ${debut.getUTCDate()} ${mois[debut.getUTCMonth()]}`, debut, fin: new Date(debut.getTime() + 7 * 86400_000) })
    }
  } else if (periode === 'mois') {
    for (let i = 11; i >= 0; i--) {
      const debut = new Date(Date.UTC(jour.getUTCFullYear(), jour.getUTCMonth() - i, 1))
      const fin = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth() + 1, 1))
      out.push({ cle: debut.toISOString().slice(0, 7), libelle: `${mois[debut.getUTCMonth()]} ${String(debut.getUTCFullYear()).slice(2)}`, debut, fin })
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const debut = new Date(Date.UTC(jour.getUTCFullYear() - i, 0, 1))
      out.push({ cle: String(debut.getUTCFullYear()), libelle: String(debut.getUTCFullYear()), debut, fin: new Date(Date.UTC(debut.getUTCFullYear() + 1, 0, 1)) })
    }
  }
  return out
}

export interface Serie {
  cle: string
  libelle: string
  clics: number
  inscriptions: number
  depensesCentimes: number
  gainsCentimes: number
}

/** Range des événements datés dans les cases. Pur : testé par check-affiliation.ts. */
export function ventiler(
  periode: Periode,
  ev: { clics: Date[]; inscriptions: Date[]; commissions: Array<{ createdAt: Date; montantCentimes: number; commissionCentimes: number }> },
  maintenant = new Date(),
): Serie[] {
  const cs = cases(periode, maintenant)
  const idx = (d: Date) => cs.findIndex((c) => d >= c.debut && d < c.fin)
  const series: Serie[] = cs.map((c) => ({ cle: c.cle, libelle: c.libelle, clics: 0, inscriptions: 0, depensesCentimes: 0, gainsCentimes: 0 }))
  for (const d of ev.clics) { const i = idx(d); if (i >= 0) series[i].clics++ }
  for (const d of ev.inscriptions) { const i = idx(d); if (i >= 0) series[i].inscriptions++ }
  for (const c of ev.commissions) {
    const i = idx(c.createdAt)
    if (i >= 0) { series[i].depensesCentimes += c.montantCentimes; series[i].gainsCentimes += c.commissionCentimes }
  }
  return series
}

export async function tableauDeBord(affilieId: string, periode: Periode) {
  const cs = cases(periode)
  const depuis = cs[0].debut
  const [affilie, clicsTotal, clicsPeriode, filleuls, commissions] = await Promise.all([
    prisma.affilie.findUniqueOrThrow({
      where: { id: affilieId },
      select: {
        nom: true,
        email: true,
        code: true,
        createdAt: true,
        titulaire: true,
        iban: true,
        ibanMajLe: true,
        versements: { orderBy: { createdAt: 'desc' }, select: { id: true, montantCentimes: true, createdAt: true } },
      },
    }),
    prisma.affiliationClic.count({ where: { affilieId } }),
    prisma.affiliationClic.findMany({ where: { affilieId, createdAt: { gte: depuis } }, select: { createdAt: true } }),
    prisma.user.findMany({
      where: { affilieId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        dropTransactions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.commission.findMany({
      where: { affilieId },
      select: { filleulId: true, montantCentimes: true, commissionCentimes: true, payeeLe: true, createdAt: true },
    }),
  ])

  const limiteActif = Date.now() - JOURS_ACTIF * 86400_000
  const parFilleul = new Map<string, { depenses: number; gains: number; recharges: number; derniere: Date | null }>()
  for (const c of commissions) {
    if (!c.filleulId) continue
    const f = parFilleul.get(c.filleulId) ?? { depenses: 0, gains: 0, recharges: 0, derniere: null }
    f.depenses += c.montantCentimes
    f.gains += c.commissionCentimes
    f.recharges++
    if (!f.derniere || c.createdAt > f.derniere) f.derniere = c.createdAt
    parFilleul.set(c.filleulId, f)
  }
  const liste = filleuls.map((u) => {
    const f = parFilleul.get(u.id)
    const derniereActivite = [u.dropTransactions[0]?.createdAt, f?.derniere].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null
    return {
      id: u.id,
      email: masquerEmail(u.email),
      inscritLe: u.createdAt,
      recharges: f?.recharges ?? 0,
      depensesCentimes: f?.depenses ?? 0,
      gainsCentimes: f?.gains ?? 0,
      derniereActivite,
      actif: !!derniereActivite && derniereActivite.getTime() >= limiteActif,
    }
  })

  const somme = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const gains = somme(commissions.map((c) => c.commissionCentimes))
  const verses = somme(commissions.filter((c) => c.payeeLe).map((c) => c.commissionCentimes))

  return {
    affilie: { nom: affilie.nom, email: affilie.email, code: affilie.code, depuis: affilie.createdAt },
    taux: TAUX_COMMISSION,
    joursActif: JOURS_ACTIF,
    totaux: {
      clics: clicsTotal,
      inscriptions: filleuls.length,
      filleulsPayants: parFilleul.size,
      filleulsActifs: liste.filter((f) => f.actif).length,
      conversion: clicsTotal ? filleuls.length / clicsTotal : 0,
      depensesCentimes: somme(commissions.map((c) => c.montantCentimes)),
      gainsCentimes: gains,
      versesCentimes: verses,
      dusCentimes: gains - verses,
    },
    periode,
    series: ventiler(periode, {
      clics: clicsPeriode.map((c) => c.createdAt),
      inscriptions: filleuls.map((f) => f.createdAt),
      commissions,
    }),
    filleuls: liste,
    paiement: {
      seuilCentimes: SEUIL_VERSEMENT_CENTIMES,
      titulaire: affilie.titulaire,
      ibanMasque: affilie.iban ? masquerIban(affilie.iban) : null,
      ibanMajLe: affilie.ibanMajLe,
      versements: affilie.versements,
    },
  }
}
