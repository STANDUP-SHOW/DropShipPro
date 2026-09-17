import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Prisma, type Shop } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { reserveCredits, refundCredits } from './billing.js'
import { DROPS } from './tarifs.js'

/**
 * Les extensions d'une boutique DropShop (17/09/2026).
 *
 * Max : « de la même manière que Shopify ou PrestaShop, une liste de plugins
 * à ajouter à sa boutique, avec des tarifs en drops : un pop-up à renseigner
 * s'ouvre, il paie, l'extension est installée ».
 *
 * Le CATALOGUE vit ici, dans le code, avec ses prix (`tarifs.ts`) et les
 * champs que le pop-up demande. L'INSTALLATION vit en base (`ShopExtension`),
 * une par boutique et par extension. Le paiement est tout ou rien et rendu si
 * l'installation échoue, comme pour la création de boutique.
 *
 * Deux extensions au départ :
 * - **Back Office** : une administration indépendante à `/b/<slug>/admin`,
 *   identifiant + mot de passe (haché ici, jamais stocké en clair) ; commandes,
 *   produits, réglages de la vitrine. Pour l'associé, l'employé, le client qui
 *   n'a pas de compte DropShipper.
 * - **Paiement en drops** : annoncée, « bientôt » — le pop-up ne s'ouvre pas
 *   tant qu'elle n'est pas prête. Sa spécification est dans `docs/dropshop.md`.
 */

export interface ChampExtension {
  cle: string
  label: string
  type: 'text' | 'password' | 'email'
  aide?: string
  min?: number
}

export interface ExtensionCatalogue {
  id: string
  nom: string
  accroche: string
  description: string
  prix: number
  /** 'disponible' s'installe ; 'bientot' se montre, sans pop-up. */
  statut: 'disponible' | 'bientot'
  champs: ChampExtension[]
  /** Ce que l'écran propose une fois installée : une adresse à ouvrir, par exemple. */
  apres?: 'back-office'
}

export const EXTENSIONS: ExtensionCatalogue[] = [
  {
    id: 'back-office',
    nom: 'Back Office',
    accroche: 'Une administration indépendante pour votre boutique',
    description:
      "Ajoute à votre boutique une partie admin à sa propre adresse, avec identifiant et mot de passe : commandes et leur état, produits en vitrine, textes et frais de port. Pour un associé, un employé ou un client à qui vous ne donnez pas votre compte DropShipper.",
    prix: DROPS.extensionBackOffice,
    statut: 'disponible',
    champs: [
      { cle: 'identifiant', label: 'Identifiant de connexion', type: 'text', aide: 'Un email ou un nom, 3 caractères au moins.', min: 3 },
      { cle: 'motDePasse', label: 'Mot de passe', type: 'password', aide: '8 caractères au moins. Il est haché : personne ne peut le relire.', min: 8 },
    ],
    apres: 'back-office',
  },
  {
    id: 'paiement-drops',
    nom: 'Paiement en drops',
    accroche: 'Acceptez les drops sur votre boutique et devenez Premium Member',
    description:
      "Vos clients règlent en drops : un programme de fidélité avec achat minimum, un portefeuille sur votre boutique et une trésorerie d'avance, puisque le client paie avant de consommer. Les boutiques qui acceptent les drops deviennent Premium Members, reçoivent avantages et promotions toute l'année et sont mieux référencées dans Dropshop Cloud, la place de marché de toutes les boutiques DropShop.",
    prix: DROPS.extensionPaiementDrops,
    statut: 'bientot',
    champs: [],
  },
]

export function extensionParId(id: string): ExtensionCatalogue | undefined {
  return EXTENSIONS.find((e) => e.id === id)
}

export class ExtensionRefusee extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
  }
}

/**
 * Installe une extension sur une boutique : vérifie les champs, prend le prix,
 * écrit l'installation. Rend le prix si l'écriture échoue.
 */
export async function installerExtension(shop: Shop, extensionId: string, champs: Record<string, string>): Promise<{ id: string; prixPaye: number }> {
  const ext = extensionParId(extensionId)
  if (!ext) throw new ExtensionRefusee('Extension inconnue.', 404)
  if (ext.statut !== 'disponible') throw new ExtensionRefusee(`« ${ext.nom} » arrive bientôt : elle ne peut pas encore être installée.`, 409)
  const deja = await prisma.shopExtension.findUnique({ where: { shopId_extensionId: { shopId: shop.id, extensionId } } })
  if (deja) throw new ExtensionRefusee(`« ${ext.nom} » est déjà installée sur cette boutique.`, 409)

  for (const champ of ext.champs) {
    const v = String(champs[champ.cle] ?? '').trim()
    if (v.length < (champ.min ?? 1)) throw new ExtensionRefusee(`${champ.label} : ${champ.min ?? 1} caractères au moins.`, 400)
  }

  let config: Prisma.InputJsonValue = {}
  if (extensionId === 'back-office') {
    config = {
      identifiant: String(champs.identifiant).trim().toLowerCase(),
      motDePasseHash: await bcrypt.hash(String(champs.motDePasse), 10),
    }
  }

  const prix = ext.prix
  if (prix > 0) {
    const credit = await reserveCredits(shop.userId, prix, `Extension ${ext.nom} sur ${shop.name}`, shop.id)
    if (!credit.ok || credit.allowed !== prix) {
      if (credit.allowed > 0) await refundCredits(shop.userId, credit.allowed, 'Extension : débit partiel rendu', shop.id)
      throw new ExtensionRefusee(credit.reason ?? `Il faut ${prix} drops pour installer « ${ext.nom} ».`, 402)
    }
  }
  try {
    const inst = await prisma.shopExtension.create({ data: { shopId: shop.id, extensionId, config, prixPaye: prix } })
    return { id: inst.id, prixPaye: prix }
  } catch (e) {
    if (prix > 0) await refundCredits(shop.userId, prix, `Extension ${ext.nom} : installation échouée, drops rendus`, shop.id)
    throw e
  }
}

/** Retire l'extension. Sans remboursement : elle a été livrée. */
export async function desinstallerExtension(shop: Shop, extensionId: string): Promise<boolean> {
  const { count } = await prisma.shopExtension.deleteMany({ where: { shopId: shop.id, extensionId } })
  return count > 0
}

/** Le catalogue vu depuis une boutique : chaque extension avec son état d'installation. */
export async function catalogueDe(shop: Shop) {
  const installees = await prisma.shopExtension.findMany({ where: { shopId: shop.id }, select: { extensionId: true, installedAt: true, config: true } })
  return EXTENSIONS.map((e) => {
    const inst = installees.find((i) => i.extensionId === e.id)
    const config = (inst?.config ?? {}) as Record<string, unknown>
    return {
      ...e,
      installee: Boolean(inst),
      installedAt: inst?.installedAt ?? null,
      // Ce qui peut se montrer : l'identifiant, jamais le hachage.
      identifiant: e.id === 'back-office' && typeof config.identifiant === 'string' ? config.identifiant : undefined,
    }
  })
}

/* ---------- Le Back Office : session propre à la boutique ---------- */

const JWT_SECRET = process.env.JWT_SECRET ?? ''

export interface SessionBackOffice {
  shopId: string
  shopKey: string
  scope: 'back-office'
}

/**
 * Ouvre une session du Back Office : identifiant + mot de passe contre
 * l'installation. Le jeton ne porte que la boutique et sa portée — jamais le
 * compte DropShipper du marchand, que ce jeton ne doit pas pouvoir atteindre.
 */
export async function ouvrirSessionBackOffice(shopKey: string, identifiant: string, motDePasse: string): Promise<string | null> {
  const shop = await prisma.shop.findUnique({ where: { shopKey }, select: { id: true } })
  if (!shop) return null
  const inst = await prisma.shopExtension.findUnique({ where: { shopId_extensionId: { shopId: shop.id, extensionId: 'back-office' } } })
  const config = (inst?.config ?? {}) as { identifiant?: string; motDePasseHash?: string }
  if (!config.identifiant || !config.motDePasseHash) return null
  if (config.identifiant !== identifiant.trim().toLowerCase()) return null
  if (!(await bcrypt.compare(motDePasse, config.motDePasseHash))) return null
  if (!JWT_SECRET) throw new Error('JWT_SECRET absent')
  const session: SessionBackOffice = { shopId: shop.id, shopKey, scope: 'back-office' }
  return jwt.sign(session, JWT_SECRET, { expiresIn: '12h' })
}

export function lireSessionBackOffice(token: string): SessionBackOffice | null {
  try {
    const s = jwt.verify(token, JWT_SECRET) as Partial<SessionBackOffice>
    if (s.scope !== 'back-office' || !s.shopId || !s.shopKey) return null
    return { shopId: s.shopId, shopKey: s.shopKey, scope: 'back-office' }
  } catch {
    return null
  }
}
