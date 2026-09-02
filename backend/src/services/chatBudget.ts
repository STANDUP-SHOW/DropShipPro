import { MODELE_RAPIDE } from './aiModels.js'
import { MODELE_REDACTION } from './aiModels.js'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma.js'

/**
 * Ce que coûte une conversation, et comment le tenir.
 *
 * Le raisonnement, parce qu'il décide de la survie du modèle économique :
 * l'application revend une intelligence qu'elle achète et ne fabrique pas.
 * Tout ce qui est vendu au forfait doit donc avoir un plafond, et tout ce qui
 * n'a pas de plafond doit être vendu à la consommation. Les crédits graphiques
 * sont du bon côté — un crédit acheté, une image produite. Les abonnements
 * d'agents étaient du mauvais : quinze euros par mois pour un nombre de
 * questions illimité.
 *
 * Le danger n'est pas le nombre d'utilisateurs, c'est le pire d'entre eux. À
 * Sonnet, une réponse revient à deux centimes environ : mille vendeurs qui
 * posent trois questions par jour rapportent, un seul qui en pose trois cents
 * coûte deux cent vingt euros pour quinze encaissés.
 *
 * Quatre leviers, du plus rentable au moins visible :
 *
 * 1. **Le contexte taillé.** Le coût monte avec l'historique renvoyé à chaque
 *    tour. Six échanges gardés mot pour mot, le reste réduit à une trace des
 *    questions posées : le fil tient, la facture est divisée par deux.
 * 2. **Les instructions mises en cache.** Elles sont identiques à chaque
 *    message et pèsent souvent plus que la question. Relues depuis le cache,
 *    elles coûtent le dixième.
 * 3. **Le petit modèle pour les questions simples.** Haiku coûte trois fois
 *    moins que Sonnet. Sur « quel est le délai de rétractation », personne ne
 *    verra la différence ; sur une analyse de marge, si — d'où un tri.
 * 4. **Le plafond journalier.** Le seul qui se voie, et le dernier recours :
 *    il borne le pire cas au lieu de le subir. Annoncé d'avance, jamais
 *    découvert au moment du refus.
 */

/**
 * Le nombre de réponses par agent et par jour.
 *
 * Trente, soit environ le double du seuil de rentabilité à quinze euros par
 * mois. Choisi pour être invisible : un vendeur qui travaille sérieusement pose
 * cinq à dix questions par jour à un agent. Le plafond n'existe que pour la
 * poignée qui en poserait trois cents.
 */
export const PLAFOND_JOUR = 30

export interface EtatPlafond {
  /** Réponses déjà données aujourd'hui par cet agent. */
  utilise: number
  plafond: number
  /** Faux quand le plafond est atteint : plus rien ne part. */
  reste: boolean
}

/**
 * Compte ce que cet agent a déjà répondu aujourd'hui.
 *
 * Seules les réponses facturées comptent. Une question hors rayon ne coûte
 * presque rien et n'a jamais été facturée : la faire entrer dans le plafond
 * punirait le vendeur pour une erreur d'aiguillage qui n'est pas la sienne.
 */
export async function etatPlafond(
  userId: string,
  cible: { departmentId?: string | null; supportAgent?: string | null },
): Promise<EtatPlafond> {
  const debutDuJour = new Date()
  debutDuJour.setHours(0, 0, 0, 0)

  const utilise = await prisma.chatMessage.count({
    where: {
      userId,
      role: 'agent',
      billed: true,
      createdAt: { gte: debutDuJour },
      ...(cible.departmentId ? { departmentId: cible.departmentId } : {}),
      ...(cible.supportAgent ? { supportAgent: cible.supportAgent } : {}),
    },
  })

  return { utilise, plafond: PLAFOND_JOUR, reste: utilise < PLAFOND_JOUR }
}

/** Ce que l'agent répond quand il a atteint son quota du jour. */
export function messagePlafond(nom: string): string {
  return `${nom} a déjà répondu ${PLAFOND_JOUR} fois aujourd'hui — c'est le maximum compris dans son abonnement. Il reprend demain matin, et vos échanges d'aujourd'hui restent consultables.`
}

export interface Tour {
  role: 'user' | 'agent' | string
  content: string
}

/**
 * Taille l'historique renvoyé au modèle.
 *
 * Les six derniers échanges partent mot pour mot : c'est ce qui permet de dire
 * « et pour celui-là ? » sans réexpliquer. Ce qui précède est réduit à la liste
 * des questions posées, tronquées — assez pour que l'agent sache de quoi on a
 * parlé, sans repayer chaque réponse à chaque tour.
 *
 * Rendu tel quel quand la conversation est courte : compresser trois messages
 * ne gagne rien et ajoute du bruit.
 */
export function tailler(history: Tour[], garde = 6): {
  resume: string | null
  recents: Tour[]
} {
  if (history.length <= garde) return { resume: null, recents: history }

  const anciens = history.slice(0, -garde)
  const questions = anciens
    .filter((t) => t.role === 'user')
    .map((t) => t.content.replace(/\s+/g, ' ').trim().slice(0, 120))
    .filter(Boolean)
    .slice(-8)

  return {
    resume: questions.length
      ? `Plus tôt dans cette conversation, le vendeur a demandé : ${questions.map((q) => `« ${q} »`).join(' ; ')}.`
      : null,
    recents: history.slice(-garde),
  }
}

/**
 * Les mots qui signalent une question qui mérite le grand modèle.
 *
 * Le tri se fait sur ce que la question demande de faire, pas sur son sujet :
 * calculer, comparer, arbitrer, rédiger. Une demande de fait — un délai, une
 * définition, un seuil — se traite très bien avec le petit modèle.
 */
const DEMANDE_UN_RAISONNEMENT =
  /\b(marge|rentab|calcul|combien|compar|strat[ée]gi|analys|arbitr|pourquoi|conseil|recommand|budget|roas|cpa|pr[ée]vision|estim|r[ée]dige|[ée]cris|optimis|n[ée]goci|litige|contrat|fiscal|juridique|risque)/i

/**
 * Choisit le modèle.
 *
 * Sonnet dès qu'un outil est branché : une recherche web sert à croiser des
 * sources, et croiser des sources est précisément ce qu'un petit modèle fait
 * mal. Sonnet aussi pour les questions longues, où la longueur trahit presque
 * toujours un cas particulier à démêler. Haiku pour le reste.
 *
 * Se trompe forcément parfois. C'est acceptable dans ce sens-là : une réponse
 * un peu plus plate coûte moins cher qu'un modèle économique qui ne tient pas.
 */
export function choisirModele(question: string, avecOutils: boolean): string {
  if (avecOutils) return MODELE_RAISONNEMENT
  if (question.length > 260) return MODELE_RAISONNEMENT
  if (DEMANDE_UN_RAISONNEMENT.test(question)) return MODELE_RAISONNEMENT
  return MODELE_SIMPLE
}

export const MODELE_RAISONNEMENT = process.env.AI_MODEL_CHAT?.trim() || MODELE_REDACTION
export const MODELE_SIMPLE = process.env.AI_MODEL_CHAT_SIMPLE?.trim() || MODELE_RAPIDE

/**
 * Les instructions système, marquées pour le cache.
 *
 * Elles ne changent pas d'un message à l'autre et pèsent souvent plus lourd que
 * la question elle-même. Le cache les fait relire au dixième du prix. Il vit
 * cinq minutes, ce qui couvre exactement le cas visé : un vendeur qui enchaîne
 * les questions au même agent.
 *
 * Sans effet sur un texte court — l'API a un minimum en dessous duquel elle
 * n'ouvre pas d'entrée de cache. Ce n'est pas une erreur, juste un gain nul sur
 * les agents dont les instructions sont brèves.
 */
export function systemeCachable(texte: string): Anthropic.Messages.MessageCreateParams['system'] {
  return [{ type: 'text', text: texte, cache_control: { type: 'ephemeral' } }]
}

/**
 * Compose les messages envoyés au modèle : le résumé, puis les échanges gardés.
 *
 * Le résumé voyage comme un tour d'utilisateur suivi d'un accusé de l'agent :
 * l'API attend une alternance, et un résumé glissé seul en tête la casserait.
 */
export function messagesPour(
  history: Tour[],
  question: string,
): Anthropic.Messages.MessageParam[] {
  const { resume, recents } = tailler(history)

  const messages: Anthropic.Messages.MessageParam[] = []
  if (resume) {
    messages.push({ role: 'user', content: resume })
    messages.push({ role: 'assistant', content: 'Entendu, je garde ça en tête.' })
  }

  for (const t of recents) {
    messages.push({
      role: t.role === 'user' ? 'user' : 'assistant',
      content: t.content,
    })
  }

  messages.push({ role: 'user', content: question })
  return messages
}
