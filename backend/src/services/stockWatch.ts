import { prisma } from '../lib/prisma.js'
import { SupplierError, findConnector } from './supplierConnectors.js'

/**
 * La veille sur le prix et le stock du fournisseur.
 *
 * Ce qu'elle empêche, et qui arrive tous les jours sans elle : vendre un
 * produit en rupture — l'acheteur paie, attend, réclame, et laisse un avis qui
 * coûte plus cher que la vente — ou vendre à perte parce que le fournisseur a
 * monté son prix de trois euros sans prévenir.
 *
 * Ce qu'elle ne fait pas, et c'est délibéré : **elle ne change aucun prix de
 * vente toute seule**. Elle relève, elle compare, elle signale. Un outil qui
 * remonterait les prix sans rien dire ferait perdre des ventes en silence, et
 * un vendeur qui découvre ça une fois ne fait plus confiance à rien.
 */

/** Au-delà, l'écart mérite qu'on prévienne : trois pour cent, c'est du bruit. */
const SEUIL_ECART = 0.03

export interface Changement {
  productId: string
  titre: string
  supplier: string
  genre: 'prix' | 'rupture' | 'retour' | 'echec'
  avant: string
  apres: string
  /** Ce que le vendeur doit faire, quand il y a quelque chose à faire. */
  conseil: string | null
}

export interface ResultatVeille {
  verifies: number
  changements: Changement[]
  erreurs: string[]
}

/**
 * Relève prix et stock pour tous les produits reliés à un fournisseur.
 *
 * Groupé par fournisseur : chaque connecteur s'authentifie une fois et traite
 * son lot, au lieu de rouvrir une session par produit.
 */
export async function veillerFournisseurs(userId: string): Promise<ResultatVeille> {
  const resultat: ResultatVeille = { verifies: 0, changements: [], erreurs: [] }

  const produits = await prisma.product.findMany({
    where: { userId, supplierId: { not: null }, supplierRef: { not: null } },
    select: {
      id: true,
      title: true,
      aiTitle: true,
      price: true,
      shippingCost: true,
      sellingPrice: true,
      currency: true,
      supplierId: true,
      supplierRef: true,
      supplierPrice: true,
      supplierStock: true,
      status: true,
    },
  })
  if (!produits.length) return resultat

  const liens = await prisma.supplierConnection.findMany({ where: { userId, connected: true } })
  const parFournisseur = new Map<string, typeof produits>()
  for (const p of produits) {
    const liste = parFournisseur.get(p.supplierId!) ?? []
    liste.push(p)
    parFournisseur.set(p.supplierId!, liste)
  }

  for (const [supplierId, lot] of parFournisseur) {
    const connecteur = findConnector(supplierId)
    if (!connecteur) {
      resultat.erreurs.push(`Aucun connecteur pour ${supplierId}.`)
      continue
    }

    const lien = liens.find((l) => l.supplier === supplierId)
    if (!lien) {
      resultat.erreurs.push(
        `${connecteur.label} n'est pas relié : reliez-le dans API Sourcing Connect pour surveiller ses prix.`,
      )
      continue
    }

    let releves
    try {
      releves = await connecteur.fetchPrices(
        lot.map((p) => p.supplierRef!),
        (lien.data ?? {}) as Record<string, string>,
      )
    } catch (err) {
      const message = err instanceof SupplierError ? err.message : `${connecteur.label} injoignable.`
      resultat.erreurs.push(message)
      continue
    }

    const parRef = new Map(releves.map((r) => [r.ref, r]))

    for (const produit of lot) {
      const releve = parRef.get(produit.supplierRef!)
      if (!releve) continue

      resultat.verifies++
      const titre = produit.aiTitle || produit.title
      const avantPrix = produit.supplierPrice === null ? null : Number(produit.supplierPrice)
      const avantStock = produit.supplierStock

      /*
       * La rupture d'abord : c'est le seul cas où l'on touche à l'annonce.
       *
       * Une annonce en ligne sur un produit introuvable est un litige en
       * préparation. On la passe en brouillon — elle sort des flux et des
       * publications à venir — sans rien effacer : le jour où le fournisseur
       * réapprovisionne, le vendeur la remet en ligne d'un clic.
       */
      if (!releve.available && (avantStock === null || avantStock > 0)) {
        if (produit.status === 'PUBLISHED' || produit.status === 'READY') {
          await prisma.product.update({ where: { id: produit.id }, data: { status: 'DRAFT' } })
        }
        resultat.changements.push({
          productId: produit.id,
          titre,
          supplier: connecteur.label,
          genre: 'rupture',
          avant: avantStock === null ? 'disponible' : `${avantStock} en stock`,
          apres: 'épuisé',
          conseil:
            "L'annonce est repassée en brouillon pour ne plus être diffusée. Retirez-la des places de marché où elle est déjà en ligne.",
        })
      } else if (releve.available && avantStock === 0) {
        resultat.changements.push({
          productId: produit.id,
          titre,
          supplier: connecteur.label,
          genre: 'retour',
          avant: 'épuisé',
          apres: releve.stock === null ? 'disponible' : `${releve.stock} en stock`,
          conseil: 'Le produit est de nouveau approvisionné : vous pouvez remettre l’annonce en ligne.',
        })
      }

      // Le prix ensuite. Comparé au dernier relevé quand il existe, au coût
      // d'achat enregistré sinon — c'est ce que le vendeur a payé la dernière
      // fois qu'il a regardé.
      const reference = avantPrix ?? Number(produit.price)
      if (releve.price !== null && reference > 0) {
        const ecart = (releve.price - reference) / reference
        if (Math.abs(ecart) >= SEUIL_ECART) {
          const revient = releve.price + Number(produit.shippingCost)
          const vente = Number(produit.sellingPrice)
          const marge = vente - revient

          resultat.changements.push({
            productId: produit.id,
            titre,
            supplier: connecteur.label,
            genre: 'prix',
            avant: `${reference.toFixed(2)} ${releve.currency}`,
            apres: `${releve.price.toFixed(2)} ${releve.currency}`,
            conseil:
              vente > 0 && marge <= 0
                ? `Vous vendriez désormais à perte : ${vente.toFixed(2)} pour un coût de revient de ${revient.toFixed(2)}. Remontez le prix de vente ou retirez l’annonce.`
                : ecart > 0
                  ? `Votre marge baisse de ${Math.abs(ecart * 100).toFixed(0)} % sur le coût d’achat.`
                  : `Le fournisseur a baissé son prix de ${Math.abs(ecart * 100).toFixed(0)} % : vous pouvez baisser le vôtre ou garder la marge.`,
          })
        }
      }

      await prisma.product.update({
        where: { id: produit.id },
        data: {
          supplierPrice: releve.price ?? undefined,
          supplierStock: releve.stock,
          supplierCheckedAt: new Date(),
          // Le coût d'achat suit le relevé : c'est lui qui sert au calcul de
          // marge partout ailleurs, et le laisser périmé rendrait tous les
          // chiffres de la comptabilité faux.
          ...(releve.price !== null ? { price: releve.price } : {}),
        },
      })
    }
  }

  return resultat
}
