import { prisma } from '../lib/prisma.js'
import { aliexpress } from './supplierAliexpress.js'
import { activeDepartments } from './agentBilling.js'
import { lireTitre } from './categoryLexicon.js'

/**
 * L'enquête fournisseurs interne — la liste de gagnants qui se remplit seule.
 *
 * **Demandé le 04/09/2026** : « sélectionner chaque jour si je le veux une
 * liste de produits gagnants à importer chez un fournisseur ». Jusqu'ici les
 * opportunités n'arrivaient que par des agents extérieurs (POST /agent/*, la
 * clé API du vendeur) ; rien ne tournait tout seul chaque matin.
 *
 * Celle-ci lit le flux « meilleures ventes » d'AliExpress avec la clé du
 * vendeur, et dépose chaque ligne en opportunité — rattachée à son rayon par
 * le lexique de titres quand il tranche, sans rayon sinon. Deux conditions,
 * et ce sont celles du produit :
 * — la liaison AliExpress est reliée (c'est SA clé qui interroge, pas la
 *   nôtre : l'enquête ne nous coûte rien) ;
 * — au moins un rayon est actif (l'abonnement du rayon paie l'enquête).
 *
 * Trois garde-fous : une seule tournée par vingt heures (Railway redémarre à
 * chaque déploiement, la garde évite les doublons du matin) ; le
 * dédoublonnage par (userId, sourceUrl) que le schéma impose déjà ; et
 * `marketPrice` reste vide — le flux ne le dit pas, on ne l'invente pas.
 */

export interface ResultatEnquete {
  deposees: number
  relevees: number
  raison?: string
}

/** L'empreinte des dépôts de cette enquête, pour la garde des vingt heures. */
const MARQUE = { enquete: 'aliexpress-flux' }

export async function enqueteAliExpress(userId: string): Promise<ResultatEnquete> {
  const rayons = await activeDepartments(userId)
  if (!rayons.length) {
    return { deposees: 0, relevees: 0, raison: "Aucun rayon actif : l'enquête quotidienne est ce que l'abonnement d'un rayon paie." }
  }

  const liaison = await prisma.supplierConnection.findUnique({
    where: { userId_supplier: { userId, supplier: 'aliexpress' } },
  })
  if (!liaison?.connected) {
    return { deposees: 0, relevees: 0, raison: 'AliExpress n’est pas relié : Sourcing › Fournisseurs, avec votre clé.' }
  }

  const recente = await prisma.opportunity.findFirst({
    where: {
      userId,
      raw: { equals: MARQUE },
      createdAt: { gt: new Date(Date.now() - 20 * 3600 * 1000) },
    },
    select: { id: true },
  })
  if (recente) {
    return { deposees: 0, relevees: 0, raison: "L'enquête du jour est déjà passée : la prochaine tournée aura du neuf." }
  }

  const lignes = await aliexpress.winningProducts!((liaison.data ?? {}) as Record<string, string>)

  /*
   * Le rattachement au rayon passe par le lexique de titres — le même qui
   * range les annonces. Il ne tranche que quand il est sûr ; une ligne
   * ambiguë est déposée sans rayon plutôt que dans le mauvais.
   */
  const identifiants = new Map<string, string | null>()
  const data = []
  for (const ligne of lignes.slice(0, 25)) {
    const lecture = lireTitre(ligne.titre)
    let departmentId: string | null = null
    if (lecture) {
      if (!identifiants.has(lecture.chemin)) {
        // Le lexique rend le CHEMIN lisible (« Téléphones … > Écouteurs »),
        // pas l'identifiant : la catégorie se retrouve par son path.
        const categorie = await prisma.category.findFirst({
          where: { path: lecture.chemin },
          select: { id: true },
        })
        identifiants.set(lecture.chemin, categorie?.id ?? null)
      }
      // L'identifiant du référentiel commence par la clé du rayon —
      // « telephones-portables-et-accessoires-ecouteurs… » : c'est ce
      // préfixe qui dit à quel chef la trouvaille revient.
      const id = identifiants.get(lecture.chemin)
      departmentId = (id && rayons.find((r) => id.startsWith(r.key))?.id) || null
    }

    data.push({
      userId,
      departmentId,
      source: 'aliexpress',
      sourceUrl: ligne.url ?? `https://www.aliexpress.com/item/${ligne.ref}.html`,
      title: ligne.titre,
      image: ligne.image,
      sourcePrice: ligne.prix ?? 0,
      currency: ligne.devise,
      // Le flux ne dit ni le prix marché, ni l'entrepôt, ni le délai : ils
      // restent vides plutôt qu'inventés — c'est ce que l'écran sait dire.
      euStock: null,
      isNew: true,
      notes: "Meilleures ventes AliExpress du jour, relevées avec votre clé (enquête quotidienne).",
      raw: MARQUE,
    })
  }

  // Le doublon avec un dépôt d'agent externe est écarté par la contrainte
  // (userId, sourceUrl) : `skipDuplicates` compte ce qui est vraiment neuf.
  const { count } = await prisma.opportunity.createMany({ data, skipDuplicates: true })
  return { deposees: count, relevees: lignes.length }
}

/**
 * La tournée : tous les vendeurs éligibles, un par un, sans qu'une panne chez
 * l'un prive les autres. Appelée par le planificateur de l'API.
 */
export async function tourneeEnquetes(): Promise<void> {
  const eligibles = await prisma.department.findMany({
    where: { paidUntil: { gt: new Date() } },
    select: { userId: true },
    distinct: ['userId'],
  })

  for (const { userId } of eligibles) {
    try {
      const resultat = await enqueteAliExpress(userId)
      if (resultat.deposees) {
        console.log(`enquête fournisseurs : ${resultat.deposees} opportunité(s) déposée(s) pour ${userId}`)
      }
    } catch (err) {
      // La clé d'un vendeur peut être expirée : c'est son écran qui le lui
      // dira, pas une tournée arrêtée pour tout le monde.
      console.error(`enquête fournisseurs en échec pour ${userId}`, err instanceof Error ? err.message : err)
    }
  }
}
