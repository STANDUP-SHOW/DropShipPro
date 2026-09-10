import { OAuth2Client } from 'google-auth-library'

/**
 * Vérification d'un ID token « Sign in with Google ».
 *
 * Flux Google Identity Services (GIS) : le navigateur obtient un ID token JWT
 * signé par Google, on le vérifie ici, côté serveur — signature, expiration, et
 * surtout `aud` = notre Client ID, sans quoi un jeton émis pour une autre
 * application passerait. Aucun client secret : la vérification d'un ID token
 * n'en demande pas (contrairement au flux « code d'autorisation »).
 *
 * Le même Client ID sert des deux côtés : le front pour afficher le bouton
 * (VITE_GOOGLE_CLIENT_ID), le back pour vérifier le jeton (GOOGLE_CLIENT_ID).
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim()

/** Vrai quand la connexion Google est configurée (Client ID présent). */
export function googleConfigure(): boolean {
  return Boolean(CLIENT_ID)
}

export interface GoogleIdentite {
  /** Le claim `sub` : identifiant Google stable et unique du compte. */
  googleId: string
  email: string
  emailVerified: boolean
  name: string | null
}

/** Une connexion Google refusée, avec un message déjà lisible pour le vendeur. */
export class GoogleAuthError extends Error {}

let client: OAuth2Client | null = null

export async function verifierIdTokenGoogle(idToken: string): Promise<GoogleIdentite> {
  if (!CLIENT_ID) throw new GoogleAuthError("La connexion Google n'est pas configurée sur le serveur.")
  if (!idToken) throw new GoogleAuthError('Jeton Google manquant.')

  // Réutilisé entre les appels : recréer le client à chaque connexion referait
  // le téléchargement des clés publiques de Google à chaque fois.
  client ??= new OAuth2Client(CLIENT_ID)

  let payload
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: CLIENT_ID })
    payload = ticket.getPayload()
  } catch {
    // Signature invalide, jeton expiré, ou émis pour une autre application.
    throw new GoogleAuthError('Connexion Google invalide ou expirée, réessayez.')
  }

  if (!payload?.sub || !payload.email) {
    throw new GoogleAuthError('Connexion Google incomplète : adresse email absente.')
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: Boolean(payload.email_verified),
    name: payload.name ?? null,
  }
}
