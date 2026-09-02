/**
 * Les modèles Claude que l'application appelle, en un seul endroit.
 *
 * **Le 02/09/2026, toute l'IA s'est arrêtée d'un coup** — textes d'annonces,
 * publicités, agents — pendant que la génération d'images continuait. Le
 * diagnostic disait « injoignable », c'est-à-dire ni clé absente ni clé
 * refusée : la clé était bonne.
 *
 * La cause : `claude-sonnet-4-5` n'est plus servi. Un modèle retiré rend un
 * **404**, qui n'est ni 401 ni 402 ni 403, donc rangé dans « injoignable » — le
 * fourre-tout. Le nom était écrit en dur à **neuf endroits**, dans huit
 * fichiers, et chacun est tombé au même instant.
 *
 * Un modèle a une date de fin, et cette date n'est pas la nôtre. C'est
 * exactement le genre de décision qui ne doit exister qu'une fois : le jour où
 * il faut en changer, on change une ligne, et `check-modeles.cjs` refuse tout
 * nom qui ne figure pas dans la liste servie.
 */

/**
 * Le modèle qui écrit et qui juge.
 *
 * Sonnet et non Opus, et c'est une décision de coût déjà prise et documentée :
 * l'application revend une intelligence qu'elle achète, et un abonnement à
 * quinze euros ne supporte pas le tarif Opus sur chaque import. Sonnet 5 est
 * d'ailleurs moins cher que le Sonnet 4.5 qu'il remplace — 2 $/10 $ le million
 * contre 3 $/15 $.
 */
export const MODELE_REDACTION = 'claude-sonnet-5'

/**
 * Le modèle des tâches courtes et mécaniques.
 *
 * Lecture d'options dans un texte, questions de fait : la réponse est courte et
 * contrainte, la puissance n'y change rien. Toujours servi, rien à changer.
 */
export const MODELE_RAPIDE = 'claude-haiku-4-5'

/**
 * Le modèle des travaux où l'erreur coûte cher.
 *
 * L'analyse de marché lance de vraies recherches et rend un verdict sur lequel
 * le vendeur fixe un prix : elle est facturée trois crédits, et c'est le seul
 * endroit où le tarif Opus se justifie.
 */
export const MODELE_PUISSANT = 'claude-opus-5'

/**
 * Ce que le tarif coûte, pour le calcul de budget.
 *
 * En dollars par million de jetons. Ces chiffres servent à `chatBudget.ts` :
 * une table qui ne connaît pas le modèle réellement appelé rend un budget faux,
 * donc une marge fausse.
 */
export const TARIFS: Record<string, { in: number; out: number }> = {
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-opus-5': { in: 5, out: 25 },
}
