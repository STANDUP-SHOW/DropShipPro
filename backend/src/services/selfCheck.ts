import { preparerPolices } from './fonts.js'
import { prisma } from '../lib/prisma.js'
import { checkStorage, storageError, storageTarget, type StorageStatus } from '../lib/storage.js'
import { getStripe } from './billing.js'
import { checkAi, raisonIa, empreinteCle, type AiStatus } from './aiHealth.js'
import { modelesEffectifs } from './aiModels.js'
import { mailIsConfigured } from './mailer.js'
import { checkImageGen, type ImageGenStatus } from './imageGen.js'

/**
 * One call that says whether the service is actually able to do its job.
 *
 * Every outage so far shared a shape: a missing or wrong environment variable,
 * a feature failing silently, and a user discovering it before we did. Config is
 * not visible from outside — this makes it visible, without revealing a single
 * secret: presence and reachability only, never a value.
 */
export interface ServiceReport {
  ok: boolean
  services: {
    /** Reaches the model with the configured key. */
    ia: AiStatus
    /** Can send a real email. Without it, password reset silently does nothing. */
    email: 'ok' | 'non-configure'
    /** Object storage, or the container disk that a redeploy wipes. */
    stockage: StorageStatus
    /** Payments possible, and webhook signature verifiable. */
    stripe: 'ok' | 'sans-webhook' | 'non-configure'
    /** Database reachable and migrated. */
    base: 'ok' | 'injoignable'
    /**
     * La génération d'images, réellement testée.
     *
     * « Configuré » ne veut rien dire : une clé peut être présente et refusée.
     * On appelle donc le modèle pour de vrai, et on rapporte ce qu'il répond.
     */
    images: ImageGenStatus
    /**
     * Les polices du serveur, sans lesquelles aucune publicité ne se compose.
     *
     * Le seul défaut du lot qui ne se voit qu'en production : Windows et macOS
     * en fournissent toujours, l'image par défaut de Nixpacks n'en a aucune. Le
     * visuel sortait alors parfaitement composé et totalement illisible.
     */
    polices: 'ok' | 'absentes'
    /*
     * Les dossiers réellement retenus, et ce qui a manqué.
     *
     * « absentes » sans plus rien à dire envoyait le vendeur — ou moi — lire le
     * journal de l'hébergeur pour deviner où le serveur avait cherché. La
     * réponse tient en trois lignes : autant les donner.
     */
    policesDossiers?: string[]
    policesRaison?: string | null
    /** Pourquoi l IA ne repond pas : le code et le message rendus par l API. */
    iaRaison?: string | null
    /**
     * L'empreinte de la clé utilisée : préfixe, quatre derniers, longueur.
     *
     * Jamais la clé. Assez pour la reconnaître dans la liste de la console
     * Anthropic quand le solde est rechargé sur une organisation ou un espace
     * de travail qui n'est pas le sien.
     */
    iaCle?: string | null
    /** Le modele reellement appele par chaque tache, variables d environnement comprises. */
    iaModeles?: Record<string, string>
  }
  /** What would hurt a real user right now, in plain French. */
  alertes: string[]
}

export async function selfCheck(): Promise<ServiceReport> {
  const [ia, images, stockage, polices] = await Promise.all([
    checkAi(),
    checkImageGen(),
    checkStorage(),
    // Le seul defaut qui se voit uniquement en production : Windows et macOS
    // ont des polices, l image par defaut de Nixpacks n en a aucune.
    preparerPolices(),
  ])

  const email = mailIsConfigured() ? 'ok' : 'non-configure'
  const stripe = !getStripe()
    ? 'non-configure'
    : process.env.STRIPE_WEBHOOK_SECRET?.trim()
      ? 'ok'
      : 'sans-webhook'

  let base: 'ok' | 'injoignable' = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    base = 'injoignable'
  }

  const alertes: string[] = []

  if (stockage === 'r2-refuse') {
    alertes.push(
      "Stockage R2 : l ecriture est refusee (" +
        (storageError() ?? "raison inconnue") +
        "). Les filigranes ne sont pas appliques — les photos du fournisseur partent telles quelles — et les agents visuels ne peuvent rien enregistrer. " +
        "Adresse visee : " +
        (storageTarget() ?? "aucune") +
        ". Si le compartiment est dans une juridiction (UE), posez R2_JURISDICTION=eu : a la mauvaise adresse, R2 repond Access Denied et non compartiment introuvable.",
    )
  }

  if (images !== 'ok') {
    alertes.push(
      images === 'non-configure'
        ? "Génération d'images indisponible : la variable GOOGLE_AI_API_KEY est absente. Les agents photo et publicité refusent de démarrer."
        : "Génération d'images refusée par Google : la clé est présente mais rejetée. Vérifiez qu'elle est active et que la facturation du projet l'est aussi.",
    )
  }

  if (!polices.pretes) {
    alertes.push(
      polices.raison ??
        "Aucune police sur le serveur : la génération de publicités refuse de composer, et rend le crédit.",
    )
  } else if (polices.raison) {
    // Polices trouvées mais fontconfig non configuré : ça peut marcher, ça peut
    // sortir en carrés. Le dire vaut mieux que se taire ou que refuser.
    alertes.push(polices.raison)
  }

  if (base === 'injoignable') alertes.push('Base de données injoignable : rien ne fonctionne.')
  if (ia !== 'ok') {
    alertes.push(
      "L'IA ne répond pas : les annonces sortent avec le texte du site source, non réécrit. " +
        'Le crédit n\'est pas décompté, mais la promesse produit ne tient pas.',
    )
  }
  if (email === 'non-configure') {
    alertes.push(
      "Aucun email ne part : une réinitialisation de mot de passe affiche « email envoyé » " +
        "et n'envoie rien. Un utilisateur qui oublie son mot de passe est enfermé dehors.",
    )
  }
  if (stockage === 'disque-local') {
    alertes.push(
      'Les photos sont sur le disque du conteneur : sans volume monté sur /app/storage, ' +
        'elles disparaissent à chaque redéploiement.',
    )
  }
  if (stripe === 'non-configure') alertes.push('Aucun paiement possible : clé Stripe absente.')
  if (stripe === 'sans-webhook') {
    alertes.push(
      "Webhook Stripe non signé : les achats restent crédités au retour de paiement, mais " +
        'les renouvellements et résiliations d\'abonnement passeront inaperçus.',
    )
  }

  return {
    ok: alertes.length === 0,
    services: {
      ia,
      email,
      stockage,
      stripe,
      base,
      images,
      polices: polices.pretes ? 'ok' : 'absentes',
      policesDossiers: polices.dossiers,
      policesRaison: polices.raison,
      iaRaison: raisonIa(),
      iaCle: empreinteCle(),
      iaModeles: modelesEffectifs(),
    },
    alertes,
  }
}
