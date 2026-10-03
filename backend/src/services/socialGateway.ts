import { prisma } from '../lib/prisma.js'
import { zernio } from './socialZernio.js'
import { meta, metaConfigure } from './socialMeta.js'
import { metaAds, metaAdsConfigure } from './socialMetaAds.js'
import { tiktok, tiktokAds, tiktokAdsConfigure, tiktokConfigure } from './socialTiktok.js'
import { pinterest, pinterestAds, pinterestConfigure } from './socialPinterest.js'
import {
  REGIES,
  RESEAUX,
  SocialError,
  estRegie,
  type ResultatPublication,
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

/*
 * Nos connexions maison, une par plateforme. Zernio n'est plus le moteur par
 * défaut (abandonné : 6 $ par mois et par compte raccordé) ; il ne sert que si
 * `SOCIAL_PROVIDER=zernio` est posé explicitement.
 */
const NATIFS: Array<{ moteur: SocialProvider; configure: () => boolean }> = [
  { moteur: meta, configure: metaConfigure },
  { moteur: metaAds, configure: metaAdsConfigure },
  { moteur: tiktok, configure: tiktokConfigure },
  { moteur: tiktokAds, configure: tiktokAdsConfigure },
  { moteur: pinterest, configure: pinterestConfigure },
  { moteur: pinterestAds, configure: pinterestConfigure },
]

function zernioChoisi(): boolean {
  return process.env.SOCIAL_PROVIDER?.trim() === 'zernio'
}

/** Le moteur d'une plateforme (facebook, tiktok-ads…), ou `undefined` si aucun n'est écrit. */
function moteurDe(platform: string): SocialProvider | undefined {
  if (zernioChoisi()) return zernio
  return NATIFS.find((n) => (n.moteur.plateformes ?? []).includes(platform))?.moteur
}

/** Le moteur par son identifiant (`provider` d'un compte raccordé). */
export function moteurParId(id: string): SocialProvider | undefined {
  if (id === zernio.id) return zernio
  return NATIFS.find((n) => n.moteur.id === id)?.moteur
}

/**
 * Les plateformes dont le connecteur est écrit, et si notre application y est
 * déclarée (ses clés présentes dans Railway). L'écran ne propose que celles-là :
 * un bouton « YouTube » sans une ligne de code derrière était un mensonge.
 */
export function plateformesDisponibles(): Array<{ platform: string; regie: boolean; prete: boolean }> {
  if (zernioChoisi()) {
    const prete = Boolean(process.env.ZERNIO_API_KEY?.trim())
    return [...RESEAUX, ...REGIES].map((p) => ({ platform: p, regie: estRegie(p), prete }))
  }
  return NATIFS.flatMap((n) =>
    (n.moteur.plateformes ?? []).map((p) => ({ platform: p, regie: estRegie(p), prete: n.configure() })),
  )
}

/** Vrai quand au moins une plateforme est réellement utilisable. */
export function socialConfigure(): boolean {
  return plateformesDisponibles().some((p) => p.prete)
}

/**
 * Le profil du vendeur, créé au premier besoin.
 *
 * À l'inscription serait plus propre en théorie, et coûterait un appel réseau
 * pour chaque compte qui ne se servira jamais du module. Ici, le premier vendeur
 * qui ouvre l'écran paie la création — les autres ne paient rien.
 */
export async function profilDe(userId: string, m: SocialProvider = zernio): Promise<string> {
  // Nos connexions maison n'ont pas de profil chez un tiers : le vendeur est
  // son propre profil.
  if (m.id !== zernio.id) return userId

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
 * Avec nos connexions maison, les comptes sont déjà en base (écrits au retour
 * de l'autorisation) : il n'y a rien à relire chez un tiers. Avec Zernio, la
 * copie locale sert à afficher l'écran sans l'appeler, et à vérifier
 * l'appartenance d'un compte avant de publier dessus.
 */
export async function synchroniserComptes(userId: string) {
  if (!zernioChoisi()) return comptesDe(userId)

  const m = zernio
  const profil = await profilDe(userId, m)
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

  return comptesDe(userId)
}

/** Les comptes connus, sans appeler le moteur. */
export function comptesDe(userId: string, options: { publicitaires?: boolean } = {}) {
  return prisma.socialAccount.findMany({
    where: {
      userId,
      ...(options.publicitaires === undefined ? {} : { isAdAccount: options.publicitaires }),
    },
    /*
     * Les colonnes sont choisies, jamais prises en bloc.
     *
     * Depuis que le moteur natif garde les jetons chez nous, un `findMany`
     * sans `select` les enverrait au navigateur avec le reste de la ligne. Un jeton
     * de page Facebook publie au nom du vendeur : il ne sort pas du serveur.
     */
    select: {
      id: true,
      externalId: true,
      platform: true,
      label: true,
      connected: true,
      isAdAccount: true,
      provider: true,
      createdAt: true,
    },
    orderBy: [{ isAdAccount: 'asc' }, { platform: 'asc' }],
  })
}

/** L'adresse où envoyer le vendeur pour raccorder un compte de cette plateforme. */
export async function lienDeConnexion(userId: string, platform: string, retour: string) {
  const m = moteurDe(platform)
  if (!m) throw new SocialError(`La connexion à ${platform} n'est pas proposée.`, true)
  if (!m.lienDeConnexion) throw new SocialError('Ce moteur ne gère pas la connexion de comptes.')
  return m.lienDeConnexion(await profilDe(userId, m), platform, retour)
}

/**
 * Vérifie que ces comptes appartiennent bien à ce vendeur, et rend leurs lignes.
 *
 * Le cœur de l'isolation. Sans ce contrôle, un identifiant de compte deviné
 * ou copié publierait sur la boutique d'un autre client.
 */
async function verifierAppartenance(userId: string, comptes: string[]) {
  if (!comptes.length) throw new SocialError('Aucun compte choisi.', true)

  const miens = await prisma.socialAccount.findMany({
    where: { userId, externalId: { in: comptes } },
    select: { externalId: true, connected: true, label: true, provider: true, platform: true, isAdAccount: true },
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
  return miens
}

/**
 * Publie sur des comptes de plusieurs réseaux à la fois.
 *
 * Chaque compte part chez le moteur qui l'a raccordé (Facebook chez Meta,
 * TikTok chez TikTok…), et les résultats sont fusionnés : une publication
 * peut réussir sur Instagram et manquer sur TikTok, l'écran dit lequel.
 */
export async function publier(userId: string, p: Publication): Promise<ResultatPublication> {
  const miens = await verifierAppartenance(userId, p.comptes)

  const parMoteur = new Map<string, string[]>()
  for (const c of miens) parMoteur.set(c.provider, [...(parMoteur.get(c.provider) ?? []), c.externalId])

  const parCompte: ResultatPublication['parCompte'] = []
  let externalId = ''
  for (const [id, comptes] of parMoteur) {
    const m = moteurParId(id)
    if (!m?.publier) {
      for (const compte of comptes) {
        parCompte.push({ compte, etat: 'echouee', url: null, erreur: 'Ce réseau ne sait pas encore recevoir de publication.' })
      }
      continue
    }
    try {
      const r = await m.publier(await profilDe(userId, m), { ...p, comptes })
      parCompte.push(...r.parCompte)
      externalId ||= r.externalId
    } catch (err) {
      const erreur = err instanceof Error ? err.message : 'Publication refusée.'
      for (const compte of comptes) parCompte.push({ compte, etat: 'echouee', url: null, erreur })
    }
  }

  const reussies = parCompte.filter((c) => c.etat === 'publiee' || c.etat === 'planifiee').length
  return {
    externalId,
    etat: reussies === 0 ? 'echouee' : reussies === parCompte.length ? 'publiee' : 'partielle',
    parCompte,
  }
}

export async function creerCampagne(userId: string, c: Campagne) {
  const [compte] = await verifierAppartenance(userId, [c.compte])

  // Une campagne se lance depuis un compte publicitaire, pas depuis une page.
  // Le dire ici évite un refus obscur de la régie trois écrans plus loin.
  if (!compte.isAdAccount && !estRegie(compte.platform)) {
    throw new SocialError(
      "Ce compte n'est pas un compte publicitaire : raccordez le gestionnaire de publicités de cette plateforme.",
      true,
    )
  }

  const m = moteurParId(compte.provider)
  if (!m?.creerCampagne) throw new SocialError('Cette régie ne gère pas encore les campagnes.')
  return m.creerCampagne(await profilDe(userId, m), c)
}

/** Les moteurs chez qui ce vendeur a au moins un compte publicitaire. */
async function moteursPublicitaires(userId: string): Promise<SocialProvider[]> {
  const lignes = await prisma.socialAccount.findMany({
    where: { userId, isAdAccount: true, connected: true },
    select: { provider: true },
    distinct: ['provider'],
  })
  return lignes.map((l) => moteurParId(l.provider)).filter((m): m is SocialProvider => Boolean(m))
}

/**
 * Les campagnes de toutes les régies reliées.
 *
 * Une régie en panne n'efface pas les autres : sa liste manque, le reste
 * s'affiche.
 */
export async function listerCampagnes(userId: string) {
  const toutes = []
  for (const m of await moteursPublicitaires(userId)) {
    if (!m.listerCampagnes) continue
    try {
      toutes.push(...(await m.listerCampagnes(await profilDe(userId, m))))
    } catch (err) {
      console.error(`campagnes ${m.id}`, err instanceof Error ? err.message : err)
    }
  }
  return toutes
}

export async function performances(userId: string, externalIds: string[]) {
  if (!externalIds.length) return []
  const toutes = []
  for (const m of await moteursPublicitaires(userId)) {
    if (!m.performances) continue
    try {
      toutes.push(...(await m.performances(await profilDe(userId, m), externalIds)))
    } catch (err) {
      console.error(`performances ${m.id}`, err instanceof Error ? err.message : err)
    }
  }
  return toutes
}

/**
 * Au retour d'une autorisation maison : le moteur échange le code et enregistre
 * les comptes. Rend le nombre de comptes raccordés.
 */
export async function finaliserConnexion(
  moteurId: string,
  userId: string,
  params: Record<string, string>,
  redirectUri: string,
): Promise<number> {
  const m = moteurParId(moteurId)
  if (!m?.finaliserConnexion) throw new SocialError(`Retour d'autorisation inconnu : ${moteurId}.`)
  return m.finaliserConnexion(userId, params, redirectUri)
}
