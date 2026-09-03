import type Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma.js'
import { CONNECTEURS, SupplierError, type SupplierListing } from './supplierConnectors.js'

/**
 * Les outils des chefs de rayon — ce qui les sépare d'un chatbot.
 *
 * **Le constat du 04/09/2026, mot pour mot** : « je lui demande 5 produits
 * phares sur AliExpress, il me répond qu'il n'a pas accès ni aux fournisseurs
 * ni aux marketplaces. On vend n'importe quoi si l'agent ne sait pas faire
 * ça. » Et il disait vrai : le chat était nu, avec pour seule consigne de ne
 * rien inventer.
 *
 * Trois outils, tous branchés sur du réel :
 * — `chercher_fournisseurs` interroge les fournisseurs **reliés par le
 *   vendeur** (recherche CJ par mots-clés, meilleures ventes AliExpress) ;
 * — `sonder_prix_catalogue` relit les prix et marges réellement pratiqués
 *   dans le catalogue du vendeur ;
 * — `produits_gagnants_reperes` relit les opportunités déjà déposées par les
 *   enquêtes, avec entrepôt européen et délai quand ils sont connus.
 *
 * Un fournisseur non relié n'est pas un mur muet : l'outil répond le geste
 * exact (Sourcing › Fournisseurs), et le chef le transmet. La règle « rien
 * n'est inventé » tient toujours — elle est même renforcée, puisque chaque
 * chiffre a désormais une source.
 */

export const OUTILS_CHEF: Anthropic.Tool[] = [
  {
    name: 'chercher_fournisseurs',
    description:
      "Cherche des produits chez les fournisseurs que le vendeur a reliés par API (CJ Dropshipping par mots-clés, meilleures ventes AliExpress). Rend titre, prix d'achat, lien et entrepôt quand il est connu. À utiliser dès que le vendeur parle de sourcing, de produits à importer ou de produits phares.",
    input_schema: {
      type: 'object',
      properties: {
        motsCles: {
          type: 'string',
          description: "Les mots-clés produit, en anglais de préférence (les catalogues fournisseurs sont en anglais). Vide pour demander les meilleures ventes du moment.",
        },
      },
      required: [],
    },
  },
  {
    name: 'sonder_prix_catalogue',
    description:
      "Relit les prix de vente et marges réellement pratiqués dans le catalogue du vendeur pour des produits proches (par mots du titre). Sert à estimer un prix de vente réaliste à partir de données vraies, jamais inventées.",
    input_schema: {
      type: 'object',
      properties: {
        motsCles: { type: 'string', description: 'Deux ou trois mots du produit, en français.' },
      },
      required: ['motsCles'],
    },
  },
  {
    name: 'produits_gagnants_reperes',
    description:
      "Relit les dernières opportunités produits déposées par les enquêtes quotidiennes pour ce rayon : prix fournisseur, prix constaté sur le marché, stock européen et délai de livraison quand ils sont connus. C'est la liste de produits gagnants du jour.",
    input_schema: {
      type: 'object',
      properties: {
        limite: { type: 'number', description: 'Combien de lignes (10 par défaut, 25 au plus).' },
      },
      required: [],
    },
  },
]

function ligneCatalogue(l: SupplierListing, fournisseur: string): string {
  const morceaux = [
    `${l.titre.slice(0, 90)}`,
    l.prix !== null ? `${l.prix} ${l.devise}` : 'prix non communiqué',
    `entrepôt ${l.entrepot === 'europe' ? 'Europe' : l.entrepot === 'chine' ? 'Chine' : 'non précisé — à vérifier sur la fiche'}`,
    l.url ?? '',
  ]
  return `- [${fournisseur}] ${morceaux.filter(Boolean).join(' · ')}`
}

async function chercherFournisseurs(userId: string, motsCles: string): Promise<string> {
  const liaisons = await prisma.supplierConnection.findMany({
    where: { userId, connected: true },
  })
  if (!liaisons.length) {
    return [
      "Aucun fournisseur n'est relié par API sur ce compte : je ne peux donc sonder aucun catalogue.",
      'Le geste : Sourcing › Fournisseurs, reliez BigBuy, CJ Dropshipping ou AliExpress avec votre clé — je pourrai alors chercher pour de vrai.',
    ].join('\n')
  }

  const sorties: string[] = []
  for (const liaison of liaisons) {
    const connecteur = CONNECTEURS.find((c) => c.id === liaison.supplier)
    if (!connecteur) continue
    const creds = (liaison.data ?? {}) as Record<string, string>

    try {
      if (motsCles.trim() && connecteur.searchProducts) {
        const lignes = await connecteur.searchProducts(motsCles.trim(), creds)
        sorties.push(
          lignes.length
            ? lignes.slice(0, 8).map((l) => ligneCatalogue(l, connecteur.label)).join('\n')
            : `- [${connecteur.label}] aucun résultat pour « ${motsCles.trim()} ».`,
        )
      } else if (!motsCles.trim() && connecteur.winningProducts) {
        const lignes = await connecteur.winningProducts(creds)
        sorties.push(
          lignes.length
            ? lignes.slice(0, 8).map((l) => ligneCatalogue(l, connecteur.label)).join('\n')
            : `- [${connecteur.label}] le flux des meilleures ventes est vide en ce moment.`,
        )
      } else {
        sorties.push(
          `- [${connecteur.label}] relié, mais ${motsCles.trim() ? 'sans recherche par mots-clés dans son API' : 'sans flux « meilleures ventes » dans son API'} — je peux y relever prix et stock d'une référence précise.`,
        )
      }
    } catch (err) {
      // Un refus fournisseur est une information, pas une panne : le chef le
      // transmet tel quel, avec le geste quand il y en a un.
      const message = err instanceof SupplierError ? err.message : 'le fournisseur est injoignable.'
      sorties.push(`- [${connecteur.label}] ${message}`)
    }
  }

  return sorties.join('\n') || 'Aucun connecteur utilisable.'
}

async function sonderPrixCatalogue(userId: string, motsCles: string): Promise<string> {
  const mots = motsCles
    .split(/\s+/)
    .map((m) => m.trim())
    .filter((m) => m.length > 2)
    .slice(0, 4)
  if (!mots.length) return 'Donnez au moins un mot de produit.'

  const produits = await prisma.product.findMany({
    where: {
      userId,
      OR: mots.flatMap((m) => [
        { title: { contains: m, mode: 'insensitive' as const } },
        { aiTitle: { contains: m, mode: 'insensitive' as const } },
      ]),
    },
    select: { id: true, aiTitle: true, title: true, price: true, sellingPrice: true },
    take: 40,
  })
  if (!produits.length) {
    return `Aucun produit du catalogue ne correspond à « ${motsCles} » : je n'ai pas de prix pratiqué à citer. Je peux raisonner sur la marge habituelle (prix d'achat × 2 à 2,5 en dropshipping), mais ce n'est pas une donnée du marché.`
  }

  const ventes = produits
    .map((p) => Number(p.sellingPrice))
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
  const marges = produits
    .map((p) => Number(p.sellingPrice) - Number(p.price))
    .filter((v) => Number.isFinite(v))
  const moyenne = (t: number[]) => (t.length ? t.reduce((s, v) => s + v, 0) / t.length : 0)

  const nbVentes = await prisma.order.count({ where: { product: { userId, id: { in: produits.map((p) => p.id) } } } })

  return [
    `${produits.length} produit(s) proches dans le catalogue du vendeur (« ${motsCles} ») :`,
    ventes.length
      ? `prix de vente pratiqués : ${ventes[0].toFixed(2)} € à ${ventes[ventes.length - 1].toFixed(2)} €, médiane ${ventes[Math.floor(ventes.length / 2)].toFixed(2)} €`
      : 'aucun prix de vente posé',
    marges.length ? `marge brute moyenne : ${moyenne(marges).toFixed(2)} €` : '',
    `ventes enregistrées sur ces produits : ${nbVentes}`,
    'Ce sont les chiffres du compte, pas ceux du marché entier : dis-le au vendeur.',
  ]
    .filter(Boolean)
    .join('\n')
}

async function produitsGagnantsReperes(userId: string, departmentId: string | null, limite: number): Promise<string> {
  const bornee = Math.min(Math.max(1, Math.round(limite || 10)), 25)
  const opportunites = await prisma.opportunity.findMany({
    where: { userId, ...(departmentId ? { departmentId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: bornee,
  })
  if (!opportunites.length) {
    return [
      "Aucune opportunité n'a encore été déposée pour ce rayon.",
      "Les listes quotidiennes arrivent par les enquêtes (abonnement du rayon actif) ; en attendant je peux chercher chez les fournisseurs reliés avec l'outil de recherche.",
    ].join('\n')
  }

  return opportunites
    .map((o) => {
      const morceaux = [
        o.title.slice(0, 90),
        `achat ${Number(o.sourcePrice).toFixed(2)} ${o.currency}`,
        o.marketPrice ? `constaté marché ${Number(o.marketPrice).toFixed(2)} ${o.currency}` : '',
        o.euStock === true ? 'stock Europe' : o.euStock === false ? 'stock hors Europe' : 'entrepôt non confirmé',
        o.deliveryDays ? `livraison ~${o.deliveryDays} j` : o.deliveryText ?? '',
        o.sourceUrl,
      ]
      return `- [${o.source}] ${morceaux.filter(Boolean).join(' · ')}`
    })
    .join('\n')
}

/** Exécute un outil et rend un texte compact pour le modèle. Ne lève jamais. */
export async function executerOutilChef(
  userId: string,
  departmentId: string | null,
  nom: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    if (nom === 'chercher_fournisseurs') return await chercherFournisseurs(userId, String(args.motsCles ?? ''))
    if (nom === 'sonder_prix_catalogue') return await sonderPrixCatalogue(userId, String(args.motsCles ?? ''))
    if (nom === 'produits_gagnants_reperes') {
      return await produitsGagnantsReperes(userId, departmentId, Number(args.limite ?? 10))
    }
    return `Outil inconnu : ${nom}.`
  } catch (err) {
    return `L'outil a échoué : ${err instanceof Error ? err.message : 'raison inconnue'}. Dis-le au vendeur sans inventer de résultat.`
  }
}
