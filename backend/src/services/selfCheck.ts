import { prisma } from '../lib/prisma.js'
import { checkStorage, storageError, type StorageStatus } from '../lib/storage.js'
import { getStripe } from './billing.js'
import { checkAi, type AiStatus } from './aiHealth.js'
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
  }
  /** What would hurt a real user right now, in plain French. */
  alertes: string[]
}

export async function selfCheck(): Promise<ServiceReport> {
  const [ia, images, stockage] = await Promise.all([checkAi(), checkImageGen(), checkStorage()])

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
        "Si le compartiment est dans une juridiction (UE), posez R2_JURISDICTION=eu : a la mauvaise adresse, R2 repond Access Denied et non compartiment introuvable.",
    )
  }

  if (images !== 'ok') {
    alertes.push(
      images === 'non-configure'
        ? "Génération d'images indisponible : la variable GOOGLE_AI_API_KEY est absente. Les agents photo et publicité refusent de démarrer."
        : "Génération d'images refusée par Google : la clé est présente mais rejetée. Vérifiez qu'elle est active et que la facturation du projet l'est aussi.",
    )
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

  return { ok: alertes.length === 0, services: { ia, email, stockage, stripe, base, images }, alertes }
}
