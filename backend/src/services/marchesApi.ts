import type { Platform, Product } from '@prisma/client'
import { apiBaseUrl } from '../lib/urls.js'

/**
 * Le contrat commun des places de marché publiées par API avec autorisation
 * du vendeur : TikTok Shop, Amazon, Allegro, Cdiscount, Etsy, Wish.
 *
 * Pourquoi un contrat et pas trois branches de plus dans `publisher.ts` : ces
 * trois-là ont la même forme — une application DropShipper déclarée chez la
 * plateforme (ses clés vivent dans Railway), un vendeur qui l'autorise depuis
 * son espace, des jetons qui tournent, puis un dépôt d'offre. Le diffuseur, la
 * page Réglages et le banc n'ont qu'une forme à connaître.
 *
 * Règle tenue par chaque connecteur : rien n'est marqué « connecté » sans un
 * appel réel qui le prouve (`verifier`). C'est l'écran qui disait « connecté »
 * sur des plateformes sans une ligne de code d'envoi qui a fait croire, le
 * 03/10/2026, que TikTok Shop, Amazon et Allegro étaient branchés.
 */

export interface DepotMarche {
  /** Ce que le vendeur doit savoir du dépôt (offre en revue, catégorie déduite…). */
  note: string | null
  /** Où voir l'offre chez la plateforme, quand elle le dit. */
  url: string | null
  /**
   * Les identifiants mis à jour, quand le dépôt a fait tourner un jeton.
   * Allegro et TikTok Shop délivrent un nouveau jeton de rafraîchissement à
   * chaque échange : ne pas le garder, c'est perdre la liaison au suivant.
   */
  majCreds?: Record<string, unknown>
}

export interface ChampSaisi {
  cle: string
  libelle: string
  /** Un exemple de valeur, montré dans le champ vide. */
  indice?: string
  secret?: boolean
}

export interface ConnecteurMarche<C = Record<string, unknown>> {
  platform: Platform
  label: string
  /** Vrai quand NOTRE application est déclarée chez la plateforme (variables Railway). */
  appConfiguree(): boolean
  /** Ce qui manque à notre application, en clair, quand elle ne l'est pas. */
  manque(): string
  /**
   * L'adresse où envoyer le vendeur pour autoriser DropShipper. Absente quand
   * la plateforme ne connaît pas la redirection (Cdiscount : le vendeur délègue
   * l'accès dans son portail, puis colle ce que `saisie` demande).
   */
  lienAutorisation?(etat: string, redirectUri: string): string
  /**
   * Les champs que le vendeur colle lui-même, quand la liaison passe par une
   * saisie plutôt que par une redirection. Ils sont éprouvés par `verifier`
   * avant que le compte soit dit relié, comme une autorisation.
   */
  saisie?(): ChampSaisi[]
  /**
   * Au retour de l'autorisation : échange le code (ou ce que la plateforme
   * renvoie) contre les identifiants à garder, et un nom lisible du compte.
   */
  finaliser(params: Record<string, string>, redirectUri: string): Promise<{ data: Record<string, unknown>; label?: string }>
  /** Relit les identifiants gardés ; `null` s'ils sont incomplets. */
  lire(data: unknown): C | null
  /** Un appel réel et sans effet qui prouve que la liaison marche. */
  verifier(creds: C): Promise<{ majCreds?: Record<string, unknown> } | void>
  /** Dépose l'offre du produit. Lève une erreur au message lisible en cas de refus. */
  deposer(creds: C, produit: Product, categorie: string): Promise<DepotMarche>
}

/** L'adresse de retour déclarée chez la plateforme — une par plateforme, fixe. */
export function retourMarche(platform: Platform): string {
  return `${apiBaseUrl()}/api/public/marches/${platform.toLowerCase()}/callback`
}

const REGISTRE = new Map<Platform, ConnecteurMarche<any>>()

export function enregistrerConnecteur(c: ConnecteurMarche<any>) {
  REGISTRE.set(c.platform, c)
}

export function connecteurMarche(platform: Platform): ConnecteurMarche<any> | undefined {
  return REGISTRE.get(platform)
}

export function connecteursMarche(): ConnecteurMarche<any>[] {
  return [...REGISTRE.values()]
}
