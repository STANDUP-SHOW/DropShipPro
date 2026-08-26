import { prisma } from '../lib/prisma.js'
import { SupplierError, findConnector, type SupplierOrderRequest } from './supplierConnectors.js'

/**
 * Commander chez le fournisseur, et remonter le numéro de suivi.
 *
 * C'est le deuxième manque du comparatif, juste après la veille sur les prix.
 * Sans lui, chaque vente oblige le vendeur à rouvrir le site du fournisseur, à
 * recopier une adresse à la main et à recoller un numéro de suivi trois jours
 * plus tard. C'est là que se perdent les commandes, et c'est une faute de frappe
 * dans une adresse qui coûte un colis.
 *
 * **Ce que ce service ne fait jamais : payer.** La commande est déposée chez le
 * fournisseur et attend le règlement du vendeur. Un logiciel qui débite un
 * compte fournisseur tout seul, sur une variante mal devinée, peut commander
 * cent fois le mauvais article avant que quiconque s'en aperçoive. C'est la même
 * règle que pour la publication : l'application remplit, l'humain valide.
 *
 * Trois garde-fous, chacun pour une panne qui arrive vraiment :
 *
 * - **Une commande par vente.** `supplierOrderId` fait office de verrou : tant
 *   qu'il est renseigné, rien ne repart. Commander deux fois coûte deux fois, et
 *   le second colis ne se reprend pas.
 * - **Aucune variante devinée.** Sans variante choisie, on s'arrête et on
 *   demande. Deviner une taille revient à expédier au hasard.
 * - **Un plafond.** Au-delà, la commande est préparée mais pas envoyée, même en
 *   mode automatique. Un prix fournisseur qui s'emballe est le symptôme le plus
 *   courant d'une référence mal lue.
 */

export interface ResultatCommande {
  orderId: string
  /** Ce qui s'est passé, en un mot, pour l'écran qui l'affiche. */
  etat: 'passee' | 'prete' | 'bloquee' | 'deja-passee'
  message: string
  supplierOrderId?: string
  /** Où le vendeur va la régler, quand le fournisseur donne une adresse. */
  url?: string
  cout?: number
}

/** L'adresse telle qu'on la reçoit des places de marché, aux noms près. */
interface AdresseBrute {
  nom?: string
  name?: string
  adresse?: string
  address?: string
  address1?: string
  complement?: string
  address2?: string
  ville?: string
  city?: string
  region?: string
  province?: string
  state?: string
  codePostal?: string
  zip?: string
  postalCode?: string
  pays?: string
  country?: string
  paysCode?: string
  countryCode?: string
  telephone?: string
  phone?: string
}

/**
 * Ramène une adresse d'acheteur à ce que les fournisseurs attendent.
 *
 * Chaque place de marché nomme ses champs autrement — `zip`, `postalCode`,
 * `codePostal` pour la même chose. Normaliser ici plutôt que dans chaque
 * connecteur évite d'avoir à retoucher tous les fournisseurs le jour où une
 * plateforme de plus arrive avec son propre vocabulaire.
 */
function lireAdresse(brute: unknown): SupplierOrderRequest['destinataire'] | null {
  if (!brute || typeof brute !== 'object') return null
  const a = brute as AdresseBrute

  const nom = a.nom || a.name
  const adresse = a.adresse || a.address || a.address1
  const paysCode = (a.paysCode || a.countryCode || '').trim().toUpperCase()
  const pays = a.pays || a.country

  if (!nom || !adresse) return null

  return {
    nom,
    adresse,
    // Le code pays en deux lettres est refusé partout s'il manque, et se déduit
    // rarement du nom du pays sans se tromper. On préfère « FR » par défaut,
    // parce que c'est le marché de l'application, plutôt que d'échouer — et le
    // vendeur voit l'adresse complète avant de valider.
    paysCode: paysCode.length === 2 ? paysCode : 'FR',
    pays: pays || undefined,
    region: a.region || a.province || a.state || undefined,
    ville: a.ville || a.city || undefined,
    complement: a.complement || a.address2 || undefined,
    codePostal: a.codePostal || a.zip || a.postalCode || undefined,
    telephone: a.telephone || a.phone || undefined,
  }
}

/**
 * Dépose une commande chez le fournisseur pour une vente donnée.
 *
 * `forcer` passe outre le plafond, et seulement lui : c'est le geste du vendeur
 * qui a regardé le prix et l'assume. Les deux autres garde-fous — commande déjà
 * passée, variante inconnue — ne se forcent pas, parce qu'il n'existe pas de
 * situation où les franchir soit la bonne chose à faire.
 */
export async function commanderChezFournisseur(
  userId: string,
  orderId: string,
  options: { forcer?: boolean } = {},
): Promise<ResultatCommande> {
  const commande = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { product: true },
  })
  if (!commande) throw new SupplierError('Commande introuvable.', true)

  const refus = (message: string, etat: ResultatCommande['etat'] = 'bloquee'): ResultatCommande => ({
    orderId,
    etat,
    message,
  })

  // --- Garde-fou 1 : une seule commande par vente --------------------------
  if (commande.supplierOrderId) {
    return {
      orderId,
      etat: 'deja-passee',
      message: `Déjà commandé chez le fournisseur (${commande.supplierOrderId}).`,
      supplierOrderId: commande.supplierOrderId,
    }
  }

  const produit = commande.product
  if (!produit.supplierId || !produit.supplierRef) {
    return refus(
      "Ce produit n'est relié à aucun fournisseur : impossible de commander automatiquement.",
    )
  }

  const connecteur = findConnector(produit.supplierId)
  if (!connecteur?.placeOrder) {
    return refus(
      `${connecteur?.label ?? produit.supplierId} ne permet pas de commander depuis DropShipper. Passez la commande sur son site.`,
    )
  }

  const lien = await prisma.supplierConnection.findFirst({
    where: { userId, supplier: produit.supplierId, connected: true },
  })
  if (!lien) {
    return refus(
      `${connecteur.label} n'est pas relié : reliez-le dans API Sourcing Connect pour commander d'ici.`,
    )
  }

  const identifiants = (lien.data ?? {}) as Record<string, string>

  // --- Garde-fou 2 : aucune variante devinée -------------------------------
  let variante = commande.supplierVariantRef
  if (!variante && connecteur.fetchVariants) {
    try {
      const disponibles = await connecteur.fetchVariants(produit.supplierRef, identifiants)
      // Une seule variante : il n'y a rien à deviner, c'est celle-là. Plusieurs :
      // on s'arrête, parce qu'expédier la mauvaise taille coûte le colis et
      // l'avis qui va avec.
      if (disponibles.length === 1) variante = disponibles[0].ref
      else if (disponibles.length > 1) {
        return refus(
          `Ce produit a ${disponibles.length} variantes chez ${connecteur.label} : choisissez celle à commander avant d'envoyer.`,
        )
      }
    } catch (err) {
      return refus(
        err instanceof SupplierError ? err.message : `${connecteur.label} n'a pas répondu.`,
      )
    }
  }
  if (!variante) {
    return refus(
      `Aucune variante connue chez ${connecteur.label} : indiquez la référence à commander.`,
    )
  }

  const destinataire = lireAdresse(commande.buyerAddress)
  if (!destinataire) {
    return refus(
      "L'adresse de l'acheteur est incomplète : il manque le nom ou la rue. Complétez-la avant de commander.",
    )
  }
  if (commande.buyerEmail) destinataire.email = commande.buyerEmail

  // --- Garde-fou 3 : le plafond -------------------------------------------
  const utilisateur = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoOrderMax: true },
  })
  const plafond = utilisateur?.autoOrderMax === null ? null : Number(utilisateur?.autoOrderMax)
  const coutAttendu = Number(produit.supplierPrice ?? produit.price) + Number(produit.shippingCost)

  if (!options.forcer && plafond !== null && Number.isFinite(plafond) && coutAttendu > plafond) {
    return {
      orderId,
      etat: 'prete',
      message: `Commande prête mais non envoyée : ${coutAttendu.toFixed(2)} dépasse votre plafond de ${plafond.toFixed(2)}. Vérifiez le prix, puis envoyez-la à la main.`,
      cout: coutAttendu,
    }
  }

  // --- L'envoi -------------------------------------------------------------
  try {
    const resultat = await connecteur.placeOrder(
      {
        // Notre identifiant voyage avec la commande : c'est lui qui permet de
        // la retrouver côté fournisseur quand un litige remonte.
        reference: commande.id,
        variantRef: variante,
        quantity: 1,
        destinataire,
      },
      identifiants,
      {
        async saveCredentials(patch) {
          await prisma.supplierConnection.update({
            where: { id: lien.id },
            data: { data: { ...identifiants, ...patch } },
          })
        },
      },
    )

    await prisma.order.update({
      where: { id: commande.id },
      data: {
        supplierOrderId: resultat.supplierOrderId,
        supplierOrderStatus: resultat.status,
        supplierOrderCost: resultat.cost ?? undefined,
        supplierOrderedAt: new Date(),
        supplierOrderUrl: resultat.url ?? commande.supplierOrderUrl,
        supplierVariantRef: variante,
        supplierOrderError: null,
        // L etat de la vente suit : le vendeur voit d un coup d oeil ce qui est
        // commande et ce qui ne l est pas encore.
        ...(commande.status === 'NEW' ? { status: 'ORDERED_FROM_SUPPLIER' as const } : {}),
      },
    })

    return {
      orderId,
      etat: 'passee',
      message: `Commande déposée chez ${connecteur.label}. Elle attend votre règlement — rien n'a été débité.`,
      supplierOrderId: resultat.supplierOrderId,
      url: resultat.url ?? undefined,
      cout: resultat.cost ?? undefined,
    }
  } catch (err) {
    const message =
      err instanceof SupplierError ? err.message : `${connecteur.label} n'a pas répondu.`
    // L'échec est écrit sur la commande : sans ça, le vendeur voit une vente
    // sans commande fournisseur et ne sait pas si elle a été tentée.
    await prisma.order.update({
      where: { id: commande.id },
      data: { supplierOrderError: message },
    })
    return refus(message)
  }
}

/**
 * Relève l'état et le numéro de suivi des commandes déjà déposées.
 *
 * Lecture seule, donc rien à protéger : c'est la moitié sans risque de ce
 * service, et celle qui fait gagner le plus de temps au quotidien. Un numéro de
 * suivi remonté tout seul, c'est un message de moins à écrire à chaque acheteur
 * qui demande où en est son colis.
 */
export async function releverSuiviFournisseur(userId: string): Promise<{
  verifiees: number
  misesAJour: Array<{ orderId: string; trackingNumber: string | null; status: string | null }>
  erreurs: string[]
}> {
  const resultat = {
    verifiees: 0,
    misesAJour: [] as Array<{ orderId: string; trackingNumber: string | null; status: string | null }>,
    erreurs: [] as string[],
  }

  const commandes = await prisma.order.findMany({
    where: {
      userId,
      supplierOrderId: { not: null },
      // Une commande livrée n'a plus rien à dire : la réinterroger chaque jour
      // consommerait le quota d'appels pour rien.
      status: { notIn: ['DELIVERED', 'REFUNDED'] },
    },
    include: { product: { select: { supplierId: true } } },
    take: 200,
  })
  if (!commandes.length) return resultat

  const parFournisseur = new Map<string, typeof commandes>()
  for (const c of commandes) {
    const id = c.product.supplierId
    if (!id) continue
    const liste = parFournisseur.get(id) ?? []
    liste.push(c)
    parFournisseur.set(id, liste)
  }

  const liens = await prisma.supplierConnection.findMany({ where: { userId, connected: true } })

  for (const [supplierId, lot] of parFournisseur) {
    const connecteur = findConnector(supplierId)
    if (!connecteur?.fetchTracking) continue

    const lien = liens.find((l) => l.supplier === supplierId)
    if (!lien) {
      resultat.erreurs.push(`${connecteur.label} n'est plus relié : suivi impossible.`)
      continue
    }

    let suivis
    try {
      suivis = await connecteur.fetchTracking(
        lot.map((c) => c.supplierOrderId!),
        (lien.data ?? {}) as Record<string, string>,
      )
    } catch (err) {
      resultat.erreurs.push(
        err instanceof SupplierError ? err.message : `${connecteur.label} injoignable.`,
      )
      continue
    }

    const parId = new Map(suivis.map((s) => [s.supplierOrderId, s]))

    for (const commande of lot) {
      const suivi = parId.get(commande.supplierOrderId!)
      if (!suivi) continue

      resultat.verifiees++

      const nouveauNumero = suivi.trackingNumber && suivi.trackingNumber !== commande.trackingNumber
      const nouvelEtat = suivi.status && suivi.status !== commande.supplierOrderStatus
      if (!nouveauNumero && !nouvelEtat) continue

      await prisma.order.update({
        where: { id: commande.id },
        data: {
          supplierOrderStatus: suivi.status,
          trackingNumber: suivi.trackingNumber ?? commande.trackingNumber,
          carrier: suivi.carrier ?? commande.carrier,
          // L'état de la vente ne suit celui du fournisseur que dans un sens :
          // le colis parti fait passer la vente en « expédiée ». On ne la fait
          // jamais revenir en arrière — le vendeur a pu la mettre à jour lui-même
          // avec une information que le fournisseur n'a pas.
          ...(suivi.expedie && (commande.status === 'NEW' || commande.status === 'ORDERED_FROM_SUPPLIER')
            ? { status: 'SHIPPED' as const }
            : {}),
        },
      })

      resultat.misesAJour.push({
        orderId: commande.id,
        trackingNumber: suivi.trackingNumber,
        status: suivi.status,
      })
    }
  }

  return resultat
}
