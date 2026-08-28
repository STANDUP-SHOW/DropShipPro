import { randomUUID } from 'crypto'
import {
  SocialError,
  type Campagne,
  type CompteRaccorde,
  type Performances,
  type Publication,
  type SocialProvider,
  estRegie,
} from './socialTypes.js'

/**
 * Zernio — le moteur qui tient les raccordements sociaux et publicitaires.
 *
 * **Ce que cet adaptateur est, et ce qu'il n'est pas.** Il implémente ce que la
 * documentation publique décrit : profils, connexion en marque blanche,
 * publication, campagnes. Il n'a **jamais parlé au vrai service** — nous n'avons
 * pas de clé. Le banc d'essai le confronte à un faux serveur qui rend ce que la
 * documentation annonce ; c'est utile, ce n'est pas une preuve.
 *
 * Deux garde-fous repris de la documentation, parce qu'ils évitent des dégâts
 * réels :
 *
 * - **L'idempotence.** Un `x-request-id` frais par publication logique, réutilisé
 *   seulement en cas de reprise. Sans lui, un réseau capricieux et un bouton
 *   cliqué deux fois publient deux fois la même annonce sur le compte du client.
 * - **L'isolation.** Zernio valide les comptes contre toute l'équipe, pas contre
 *   le profil. Publier sur un compte qui n'appartient pas au vendeur passerait
 *   donc côté moteur : c'est à nous de le refuser, et ça se fait ici.
 */

const BASE = () => process.env.ZERNIO_API_URL?.trim() || 'https://api.zernio.com/v1'

function cle(): string {
  const k = process.env.ZERNIO_API_KEY?.trim()
  if (!k) {
    throw new SocialError(
      "Le raccordement aux réseaux sociaux n'est pas encore activé sur ce serveur.",
    )
  }
  return k
}

interface Options {
  methode?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  corps?: unknown
  /** Repris tel quel sur une reprise : c'est ce qui empêche le doublon. */
  requestId?: string
}

/**
 * Un appel à Zernio, avec son enveloppe d'erreur.
 *
 * La documentation annonce une enveloppe stable façon Stripe (`type`, `code`,
 * `platform`). On lit le code, jamais le message humain : un message change
 * sans prévenir, un code non.
 */
async function appel(chemin: string, o: Options = {}): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${BASE()}${chemin}`, {
      method: o.methode ?? 'GET',
      headers: {
        Authorization: `Bearer ${cle()}`,
        'Content-Type': 'application/json',
        ...(o.requestId ? { 'x-request-id': o.requestId } : {}),
      },
      body: o.corps ? JSON.stringify(o.corps) : undefined,
      signal: AbortSignal.timeout(25000),
    })
  } catch (err) {
    if (err instanceof SocialError) throw err
    throw new SocialError('Le moteur social est injoignable. Réessayez dans quelques minutes.')
  }

  // 409 : le moteur a reconnu un doublon et n'a rien republié. Ce n'est pas une
  // panne, c'est exactement ce que l'idempotence doit produire.
  if (res.status === 409) {
    throw new SocialError('Cette publication a déjà été envoyée.', true)
  }
  if (res.status === 401 || res.status === 403) {
    throw new SocialError(
      "Le moteur social refuse notre clé. Le raccordement doit être revérifié côté serveur.",
    )
  }
  if (res.status === 429) {
    throw new SocialError('Trop de demandes en même temps. Réessayez dans une minute.')
  }

  const json = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string; platform?: string }
  } & Record<string, unknown>

  if (!res.ok || json.error) {
    const code = json.error?.code ?? String(res.status)
    // Un compte déconnecté est le seul refus que le vendeur peut corriger.
    const reconnectable = /token_invalid|permission_denied|account_disconnected/.test(code)
    throw new SocialError(
      reconnectable
        ? `Votre compte ${json.error?.platform ?? ''} n'est plus connecté : reliez-le à nouveau.`.replace(
            '  ',
            ' ',
          )
        : `Le moteur social a répondu ${code}.`,
      reconnectable,
    )
  }

  return json
}

export const zernio: SocialProvider = {
  id: 'zernio',
  label: 'Zernio',

  async creerProfil(userId, nom) {
    const reponse = (await appel('/profiles', {
      methode: 'POST',
      // Le nom porte notre identifiant interne : retrouver un profil orphelin
      // côté moteur sans lui est un travail d'archéologue.
      corps: { name: `${nom} (${userId})` },
    })) as { _id?: string; id?: string }

    const id = reponse._id ?? reponse.id
    if (!id) throw new SocialError("Le moteur n'a pas créé le profil.")
    return id
  },

  async listerComptes(profilId) {
    const reponse = (await appel(`/accounts?profileId=${encodeURIComponent(profilId)}`)) as {
      data?: Array<{
        _id?: string
        id?: string
        platform?: string
        name?: string
        username?: string
        disconnected?: boolean
      }>
    }

    return (reponse.data ?? [])
      .map((c): CompteRaccorde | null => {
        const externalId = c._id ?? c.id
        if (!externalId || !c.platform) return null
        return {
          externalId,
          platform: c.platform,
          label: c.name ?? c.username ?? null,
          connected: !c.disconnected,
          isAdAccount: estRegie(c.platform),
        }
      })
      .filter((c): c is CompteRaccorde => c !== null)
  },

  async lienDeConnexion(profilId, platform, retour) {
    const reponse = (await appel(
      `/connect/${encodeURIComponent(platform)}?profileId=${encodeURIComponent(profilId)}&redirect_url=${encodeURIComponent(retour)}&headless=true`,
    )) as { url?: string }

    if (!reponse.url) throw new SocialError("Le moteur n'a pas rendu d'adresse de connexion.")
    return reponse.url
  },

  async publier(profilId, p: Publication) {
    if (!p.comptes.length) throw new SocialError('Aucun compte choisi.', true)

    const reponse = (await appel('/posts', {
      methode: 'POST',
      // Un identifiant frais par publication logique. La reprise d'un envoi
      // interrompu doit repasser le même — d'où le paramètre plutôt qu'un
      // tirage interne.
      requestId: randomUUID(),
      corps: {
        profileId: profilId,
        accountIds: p.comptes,
        content: p.texte,
        mediaUrls: p.medias ?? [],
        scheduledAt: p.quand ? p.quand.toISOString() : undefined,
      },
    })) as {
      _id?: string
      status?: string
      results?: Array<{ accountId?: string; status?: string; url?: string; error?: string }>
    }

    return {
      externalId: reponse._id ?? '',
      etat: reponse.status ?? 'inconnu',
      parCompte: (reponse.results ?? []).map((r) => ({
        compte: r.accountId ?? '',
        etat: r.status ?? 'inconnu',
        url: r.url ?? null,
        erreur: r.error ?? null,
      })),
    }
  },

  async creerCampagne(profilId, c: Campagne) {
    const reponse = (await appel('/ads/create', {
      methode: 'POST',
      requestId: randomUUID(),
      corps: {
        profileId: profilId,
        adAccountId: c.compte,
        name: c.nom,
        objective: c.objectif,
        dailyBudget: c.budgetJour,
        creative: {
          imageUrl: c.creative.image,
          headline: c.creative.titre,
          body: c.creative.texte,
          linkUrl: c.creative.url,
          callToAction: c.creative.boutonLabel,
        },
        targeting: c.ciblage
          ? {
              countries: c.ciblage.paysCodes,
              ageMin: c.ciblage.ageMin,
              ageMax: c.ciblage.ageMax,
            }
          : undefined,
      },
    })) as { _id?: string; status?: string; url?: string }

    return {
      externalId: reponse._id ?? '',
      // Aucune campagne n'est active à la création : les régies passent toutes
      // par une revue. Annoncer « active » ferait croire à une diffusion qui
      // n'a pas commencé.
      etat: reponse.status ?? 'en_revue',
      url: reponse.url ?? null,
    }
  },

  async listerCampagnes(profilId) {
    const reponse = (await appel(
      `/ads/campaigns?profileId=${encodeURIComponent(profilId)}`,
    )) as { data?: Array<{ _id?: string; status?: string; url?: string }> }

    return (reponse.data ?? []).map((c) => ({
      externalId: c._id ?? '',
      etat: c.status ?? 'inconnu',
      url: c.url ?? null,
    }))
  },

  async performances(profilId, externalIds) {
    if (!externalIds.length) return []

    const reponse = (await appel(
      `/analytics/ads?profileId=${encodeURIComponent(profilId)}&ids=${externalIds.map(encodeURIComponent).join(',')}`,
    )) as {
      data?: Array<{
        id?: string
        impressions?: number
        clicks?: number
        spend?: number
        conversions?: number
        currency?: string
      }>
    }

    return (reponse.data ?? []).map(
      (d): Performances => ({
        externalId: d.id ?? '',
        impressions: d.impressions ?? 0,
        clics: d.clicks ?? 0,
        depense: d.spend ?? 0,
        // Toutes les régies ne remontent pas les conversions : dire « non dit »
        // plutôt qu'inventer un zéro, qui ferait passer une campagne qui
        // convertit pour une campagne qui ne convertit pas.
        conversions: typeof d.conversions === 'number' ? d.conversions : null,
        devise: d.currency ?? 'EUR',
      }),
    )
  },
}
