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
 * **28/11/2026 : le site passe de Claude à Gemini** (décision de max, plus
 * aucun crédit API Anthropic). Noms lus le 28/11 dans la liste officielle des
 * modèles de Google (ai.google.dev/gemini-api/docs/models), tous « Stable » :
 * un modèle « Preview » peut être arrêté sans préavis — c'est arrivé à
 * `gemini-3-pro-preview`.
 */

/** Le modèle qui écrit et qui juge : le Flash stable le plus récent. */
export const MODELE_REDACTION = 'gemini-3.8-flash'

/** Le modèle des tâches courtes et mécaniques (catégories, options, traductions). */
export const MODELE_RAPIDE = 'gemini-3.1-flash-lite'

/**
 * Le modèle des travaux où l'erreur coûte cher (analyse de marché, pubs,
 * brief photo). Le même Flash : `gemini-4-argon` est servi mais son prix
 * n'était pas publié le 28/11, et `gemini-3.1-pro-preview` n'est qu'en
 * préversion. On peut l'imposer par `AI_MODEL_ANALYSIS` / `AI_MODEL_ADCOPY`.
 */
export const MODELE_PUISSANT = 'gemini-3.8-flash'

/**
 * Les modèles réellement servis, tels que la liste de Google les nommait le
 * 28/11/2026. `check-modeles.cjs` refuse tout nom absent d'ici, et
 * `modele()` ignore une variable d'environnement qui n'y figure pas.
 */
export const MODELES_SERVIS = new Set([
  'gemini-4-argon',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
])

/**
 * Du plus voulu au plus sûr : un nom retiré rend un 404 (non facturé) et
 * l'appel passe au suivant au lieu d'arrêter tout le site (panne du 02/09).
 */
export function cascadeGemini(voulu: string): string[] {
  const suite = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']
  return [voulu, ...suite.filter((m) => m !== voulu)]
}

/**
 * La garde Anthropic (`IA_FOURNISSEUR=anthropic`, coupée par défaut) : le
 * modèle Claude qui remplacerait chaque modèle Gemini.
 */
export const EQUIVALENT_CLAUDE: Record<string, string> = {
  'gemini-3.8-flash': 'claude-sonnet-5',
  'gemini-3.1-flash-lite': 'claude-haiku-4-5',
}

/**
 * Le modèle d'une tâche, en tenant compte d'une éventuelle variable
 * d'environnement — mais jamais au point de tomber en panne.
 *
 * **Le piège, constaté le 02/09/2026.** Neuf tâches acceptent un modèle
 * imposé par l'environnement, pour pouvoir changer sans redéployer. Une de ces
 * variables portait encore `claude-sonnet-4-5`, retiré depuis. La sonde de
 * santé, qui n'en tient pas compte, répondait « ok » pendant que la réécriture
 * échouait : les annonces sortaient avec le texte du fournisseur, note 38 sur
 * 100, sans attributs ni arguments — et le diagnostic disait que tout allait
 * bien.
 *
 * Une valeur inconnue est donc **ignorée**, bruyamment. Un réglage périmé dans
 * une console d'hébergeur ne doit pas pouvoir arrêter le produit : il doit
 * ralentir une décision, pas la casser.
 */
export function modele(variable: string, defaut: string): string {
  const impose = process.env[variable]?.trim()
  if (!impose) return defaut
  if (MODELES_SERVIS.has(impose)) return impose

  console.error(
    `[ia] ${variable}="${impose}" n'est pas un modèle servi : ignorée, ${defaut} utilisé à la place.`,
  )
  return defaut
}

/** Ce que chaque tâche appelle réellement, pour le diagnostic. */
export function modelesEffectifs(): Record<string, string> {
  return {
    reecriture: modele('AI_MODEL_ENHANCE', MODELE_REDACTION),
    options: modele('AI_MODEL_EXTRACT', MODELE_RAPIDE),
    conversation: modele('AI_MODEL_CHAT', MODELE_REDACTION),
    categories: modele('AI_MODEL_CATEGORY', MODELE_RAPIDE),
    analyse: modele('AI_MODEL_ANALYSIS', MODELE_PUISSANT),
    // Les deux agents visuels, passés à Opus le 19/09/2026 : une publicité et
    // une photo sortent une fois et se paient cher, l'écart de modèle s'y voit.
    publicite: modele('AI_MODEL_ADCOPY', MODELE_PUISSANT),
    briefPhoto: modele('AI_MODEL_BRIEF', MODELE_PUISSANT),
  }
}

/**
 * En dollars par million de jetons, grille payante de Google lue le 28/11/2026
 * (ai.google.dev/gemini-api/docs/pricing). La recherche Google est à part :
 * 5 000 requêtes gratuites par mois, puis 14 $ les 1 000.
 *
 * `gemini-3.8-flash` n'avait pas encore sa ligne sur la page ce jour-là : on
 * compte au prix de `gemini-3.1-pro-preview` (2 $ / 12 $), le plus cher des
 * prix publiés de la famille — un plafond prudent, à remplacer par le vrai
 * prix dès qu'il est publié. Jamais un chiffre plus bas que la réalité.
 */
export const TARIFS: Record<string, { in: number; out: number }> = {
  'gemini-3.8-flash': { in: 2, out: 12 },
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.5 },
  'gemini-3.1-pro-preview': { in: 2, out: 12 },
}
