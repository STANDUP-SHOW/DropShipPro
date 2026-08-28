import { prisma } from '../lib/prisma.js'
import { zernio } from './socialZernio.js'
import {
  SocialError,
  estRegie,
  type Campagne,
  type Publication,
  type SocialProvider,
} from './socialTypes.js'

/**
 * La passerelle : tout ce que l'application demande passe ici.
 *
 * Elle fait trois choses que l'adaptateur ne peut pas faire, et qui sont
 * précisément ce qui rend la décision réversible.
 *
 * **Elle tient la correspondance.** Vendeur ↔ profil ↔ comptes, en base chez
 * nous. Changer de moteur revient à réécrire un adaptateur ; sans cette table,
 * il faudrait redemander à mille vendeurs de reconnecter leurs comptes.
 *
 * **Elle isole les vendeurs.** Le moteur valide les comptes contre toute
 * l'équipe, pas contre le profil — publier sur le compte d'un autre client
 * passerait donc de son côté. Le refus est ici, et il n'est pas négociable.
 *
 * **Elle répond quand rien n'est branché.** Sans clé, l'application doit dire
 * « ce n'est pas encore activé » plutôt que de tomber. Un module absent qui
 * plante ressemble à un module cassé.
 */

const MOTEURS: SocialProvider[] = [zernio]

/** Le moteur en service, réglable sans redéploiement. */
function moteur(): SocialProvider {
  const choisi = process.env.SOCIAL_PROVIDER?.trim() || 'zernio'
  const trouve = MOTEURS.find((m) => m.id === choisi)
  if (!trouve) throw new SocialError(`Moteur social inconnu : ${choisi}.`)
  return trouve
}

/** Vrai quand le module est réellement utilisable. */
export function socialConfigure(): boolean {
  return Boolean(process.env.ZERNIO_API_KEY?.trim())
}

/**
 * Le profil du vendeur, créé au premier besoin.
 *
 * À l'inscription serait plus propre en théorie, et coûterait un appel réseau
 * pour chaque compte qui ne se servira jamais du module. Ici, le premier vendeur
 * qui ouvre l'écran paie la création — les autres ne paient rien.
 */
export async function profilDe(userId: string): Promise<string> {
  const m = moteur()

  const existant = await prisma.socialProfile.findUnique({
    where: { userId_provider: { userId, provider: m.id } },
  })
  if (existant) return existant.externalId

  const utilisateur = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { shopName: true, email: true },
  })

  const externalId = await m.creerProfil(userId, utilisateur.shopName || utilisateur.email)

  await prisma.socialProfile.create({ data: { userId, provider: m.id, externalId } })
  return externalId
}

/**
 * Rafraîchit la liste des comptes du vendeur, et la garde.
 *
 * La copie locale sert à deux choses : afficher l'écran sans appeler le moteur
 * à chaque chargement, et vérifier l'appartenance d'un compte avant de publier
 * dessus. C'est cette copie qui fait l'isolation.
 */
export async function synchroniserComptes(userId: string) {
  const m = moteur()
  const profil = await profilDe(userId)
  const distants = await m.listerComptes(profil)

  for (const c of distants) {
    await prisma.socialAccount.upsert({
      where: {
        userId_provider_externalId: { userId, provider: m.id, externalId: c.externalId },
      },
      create: {
        userId,
        provider: m.id,
        externalId: c.externalId,
        platform: c.platform,
        label: c.label,
        connected: c.connected,
        isAdAccount: c.isAdAccount,
      },
      update: { platform: c.platform, label: c.label, connected: c.connected },
    })
  }

  /*
   * Un compte disparu chez le moteur est marqué déconnecté, jamais supprimé.
   *
   * Les publications passées le référencent : l'effacer ferait disparaître de
   * l'historique des campagnes que le vendeur a payées.
   */
  const vus = new Set(distants.map((c) => c.externalId))
  await prisma.socialAccount.updateMany({
    where: { userId, provider: m.id, externalId: { notIn: [...vus] }, connected: true },
    data: { connected: false },
  })

  return prisma.socialAccount.findMany({
    where: { userId, provider: m.id },
    orderBy: [{ isAdAccount: 'asc' }, { platform: 'asc' }],
  })
}

/** Les comptes connus, sans appeler le moteur. */
export function comptesDe(userId: string, options: { publicitaires?: boolean } = {}) {
  return prisma.socialAccount.findMany({
    where: {
      userId,
      ...(options.publicitaires === undefined ? {} : { isAdAccount: options.publicitaires }),
    },
    orderBy: [{ isAdAccount: 'asc' }, { platform: 'asc' }],
  })
}

/** L'adresse où envoyer le vendeur pour raccorder un compte. */
export async function lienDeConnexion(userId: string, platform: string, retour: string) {
  const m = moteur()
  if (!m.lienDeConnexion) throw new SocialError('Ce moteur ne gère pas la connexion de comptes.')
  return m.lienDeConnexion(await profilDe(userId), platform, retour)
}

/**
 * Vérifie que ces comptes appartiennent bien à ce vendeur.
 *
 * Le cœur de l'isolation. Le moteur ne la fait pas — sa validation porte sur
 * l'équipe entière. Sans ce contrôle, un identifiant de compte deviné ou copié
 * publierait sur la boutique d'un autre client.
 */
async function verifierAppartenance(userId: string, comptes: string[]): Promise<void> {
  if (!comptes.length) throw new SocialError('Aucun compte choisi.', true)

  const miens = await prisma.socialAccount.findMany({
    where: { userId, externalId: { in: comptes } },
    select: { externalId: true, connected: true, label: true },
  })

  const connus = new Set(miens.map((c) => c.externalId))
  const etrangers = comptes.filter((c) => !connus.has(c))
  if (etrangers.length) {
    throw new SocialError("Un des comptes choisis ne vous appartient pas.", true)
  }

  const coupes = miens.filter((c) => !c.connected)
  if (coupes.length) {
    throw new SocialError(
      `${coupes.map((c) => c.label ?? 'Un compte').join(', ')} n'est plus connecté : reliez-le à nouveau.`,
      true,
    )
  }
}

export async function publier(userId: string, p: Publication) {
  const m = moteur()
  if (!m.publier) throw new SocialError('Ce moteur ne gère pas la publication.')

  await verifierAppartenance(userId, p.comptes)
  return m.publier(await profilDe(userId), p)
}

export async function creerCampagne(userId: string, c: Campagne) {
  const m = moteur()
  if (!m.creerCampagne) throw new SocialError('Ce moteur ne gère pas les campagnes.')

  await verifierAppartenance(userId, [c.compte])

  // Une campagne se lance depuis un compte publicitaire, pas depuis une page.
  // Le dire ici évite un refus obscur de la régie trois écrans plus loin.
  const compte = await prisma.socialAccount.findFirst({
    where: { userId, externalId: c.compte },
    select: { platform: true, isAdAccount: true },
  })
  if (compte && !compte.isAdAccount && !estRegie(compte.platform)) {
    throw new SocialError(
      "Ce compte n'est pas un compte publicitaire : raccordez le gestionnaire de publicités de cette plateforme.",
      true,
    )
  }

  return m.creerCampagne(await profilDe(userId), c)
}

export async function listerCampagnes(userId: string) {
  const m = moteur()
  if (!m.listerCampagnes) return []
  return m.listerCampagnes(await profilDe(userId))
}

export async function performances(userId: string, externalIds: string[]) {
  const m = moteur()
  if (!m.performances || !externalIds.length) return []
  return m.performances(await profilDe(userId), externalIds)
}
