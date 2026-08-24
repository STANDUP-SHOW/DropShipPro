import { prisma } from '../lib/prisma.js'

/**
 * L'abonnement d'un chef de rayon.
 *
 * Un agent travaille tous les jours : il explore les fournisseurs, les réseaux
 * et les places de marché, écrit trois rapports et propose une liste de produits
 * gagnants. Ce n'est pas un achat unique, c'est un salaire — d'où trois durées,
 * dont une journée, pour qu'un vendeur puisse essayer sans s'engager.
 *
 * Quand l'abonnement expire, l'agent s'arrête mais ne disparaît pas : ses
 * trouvailles, ses rapports et vos échanges restent. Le vendeur qui le reprend
 * une semaine plus tard retrouve son rayon en l'état, et non une page vide.
 */

export interface AgentPlan {
  id: string
  label: string
  /** Prix TTC en centimes : les prix affichés au vendeur sont TTC. */
  amount: number
  days: number
  /** Ce que ça change, dit au vendeur. */
  pitch: string
}

export const AGENT_PLANS: AgentPlan[] = [
  {
    id: 'jour',
    label: '1 jour',
    amount: 100,
    days: 1,
    pitch: "Pour essayer : un rapport complet et vingt-cinq produits gagnants dès demain matin.",
  },
  {
    id: 'semaine',
    label: '1 semaine',
    amount: 500,
    days: 7,
    pitch: "Sept rapports, sept listes. De quoi juger un secteur sur la durée plutôt que sur un jour.",
  },
  {
    id: 'mois',
    label: '1 mois',
    amount: 1500,
    days: 30,
    pitch: "Le tarif d'un salarié à quinze euros. Indispensable si vous laissez le pilote automatique travailler.",
  },
]

export function findAgentPlan(id: string) {
  return AGENT_PLANS.find((p) => p.id === id) ?? null
}

/** Vrai tant que l'agent est payé. */
export function isActive(paidUntil: Date | null): boolean {
  return Boolean(paidUntil && paidUntil > new Date())
}

/**
 * Prolonge un rayon.
 *
 * La durée s'ajoute à ce qui reste plutôt que de repartir d'aujourd'hui : un
 * vendeur qui renouvelle avec trois jours d'avance ne doit pas les perdre — ce
 * serait le punir d'avoir anticipé.
 */
export async function extendDepartment(departmentId: string, plan: AgentPlan) {
  const department = await prisma.department.findUniqueOrThrow({ where: { id: departmentId } })
  const from = isActive(department.paidUntil) ? department.paidUntil! : new Date()
  const paidUntil = new Date(from.getTime() + plan.days * 24 * 60 * 60 * 1000)

  return prisma.department.update({
    where: { id: departmentId },
    data: { paidUntil, plan: plan.id },
  })
}

/**
 * Les rayons qui travaillent réellement pour ce vendeur.
 *
 * Le pilote automatique et les dépôts d'agents s'y réfèrent : un rayon dont
 * l'abonnement a expiré ne doit plus rien produire, sans quoi l'abonnement ne
 * veut rien dire.
 */
export async function activeDepartments(userId: string) {
  return prisma.department.findMany({
    where: { userId, paidUntil: { gt: new Date() } },
  })
}
