import {
  tailler,
  messagesPour,
  choisirModele,
  systemeCachable,
  MODELE_SIMPLE,
  MODELE_RAISONNEMENT,
  PLAFOND_JOUR,
} from './src/services/chatBudget.js'

/**
 * Éprouve les quatre leviers qui tiennent le coût d'une conversation.
 *
 * Ce banc mesure ce qui est réellement envoyé au modèle, parce que c'est ce qui
 * est facturé. Un contexte qu'on croit taillé mais qui repart entier double la
 * facture sans qu'aucune erreur ne s'affiche — le genre de panne qui ne se voit
 * qu'à la fin du mois, sur le relevé.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

/** Une conversation longue, comme celle d'un vendeur qui revient chaque jour. */
const longue = Array.from({ length: 40 }, (_, i) => ({
  role: i % 2 === 0 ? ('user' as const) : ('agent' as const),
  content:
    i % 2 === 0
      ? `Question numero ${i} sur un produit, avec assez de texte pour peser dans le contexte renvoye a chaque tour.`
      : `Reponse numero ${i}, longue elle aussi, puisque l agent developpe et cite des chiffres.`,
}))

// --- 1. Le contexte taillé --------------------------------------------------
const { resume, recents } = tailler(longue)
exige(recents.length === 6, `${recents.length} echanges gardes, attendu 6`)
exige(resume !== null, 'une conversation de 40 tours doit produire un resume')
exige(
  resume!.includes('Question numero'),
  'le resume doit garder la trace des questions posees',
)
// Ce qui compte : le poids envoyé, pas le nombre de messages.
const poidsEntier = longue.reduce((n, t) => n + t.content.length, 0)
const poidsTaille =
  (resume?.length ?? 0) + recents.reduce((n, t) => n + t.content.length, 0)
exige(
  poidsTaille < poidsEntier / 2,
  `contexte taille ${poidsTaille} caracteres contre ${poidsEntier} entier : moins de moitie attendu`,
)
console.log(
  `contexte : ${poidsEntier} -> ${poidsTaille} caracteres, soit ${Math.round((1 - poidsTaille / poidsEntier) * 100)} % de moins`,
)

// Une conversation courte n'est pas compressee : il n'y a rien a gagner.
const courte = longue.slice(0, 4)
exige(tailler(courte).resume === null, 'une conversation courte ne doit pas etre resumee')
exige(tailler(courte).recents.length === 4, 'une conversation courte part entiere')

// --- L'alternance des roles, qu'un resume glisse seul casserait -------------
const messages = messagesPour(longue, 'Et pour la montre en acier ?')
exige(messages[messages.length - 1].role === 'user', 'la question doit fermer la liste')
for (let i = 1; i < messages.length; i++) {
  exige(
    messages[i].role !== messages[i - 1].role,
    `deux ${messages[i].role} de suite en position ${i} : l API refuse`,
  )
}

// --- 2. Le choix du modele --------------------------------------------------
const simples = [
  'Quel est le delai de retractation ?',
  'Ou trouve-t-on le numero de suivi ?',
  'Comment je change mon mot de passe ?',
]
for (const q of simples) {
  exige(choisirModele(q, false) === MODELE_SIMPLE, `« ${q} » devrait partir au petit modele`)
}

const complexes = [
  'Quelle marge je fais si le fournisseur monte de trois euros ?',
  'Compare eBay et Cdiscount pour de la maroquinerie',
  'Redige-moi des conditions generales de vente',
  'Quel budget publicitaire pour un CPA de douze euros ?',
]
for (const q of complexes) {
  exige(
    choisirModele(q, false) === MODELE_RAISONNEMENT,
    `« ${q} » devrait partir au grand modele`,
  )
}

// Une question longue trahit presque toujours un cas particulier a demeler.
exige(choisirModele('a'.repeat(300), false) === MODELE_RAISONNEMENT, 'une question longue va au grand modele')

// Un outil branche impose le grand modele : croiser des sources est ce qu un
// petit modele fait le moins bien.
exige(
  choisirModele('Quel est le taux de TVA ?', true) === MODELE_RAISONNEMENT,
  'la recherche web impose le grand modele',
)

// --- 3. Le cache des instructions -------------------------------------------
const systeme = systemeCachable('Tu es Karim, chef de rayon.')
exige(Array.isArray(systeme), 'le systeme doit etre un tableau de blocs pour porter le cache')
const bloc = (systeme as Array<Record<string, unknown>>)[0]
exige(bloc.type === 'text', 'le bloc systeme doit etre de type text')
exige(
  JSON.stringify(bloc.cache_control) === JSON.stringify({ type: 'ephemeral' }),
  'le bloc systeme doit porter cache_control ephemeral',
)

// --- 4. Le plafond ----------------------------------------------------------
exige(PLAFOND_JOUR === 30, `plafond a ${PLAFOND_JOUR}, attendu 30`)

// --- Ce que tout cela change, en euros ---------------------------------------
const USD = 0.92
const prix: Record<string, { in: number; out: number }> = {
  [MODELE_RAISONNEMENT]: { in: 3, out: 15 },
  [MODELE_SIMPLE]: { in: 1, out: 5 },
}
const cout = (modele: string, entree: number, sortie: number) =>
  ((entree * prix[modele].in + sortie * prix[modele].out) / 1e6) * USD

// Avant : Sonnet, dix echanges renvoyes entiers, aucun cache.
const avant = cout(MODELE_RAISONNEMENT, 4000, 900)
// Apres, cas courant : Haiku, contexte taille, instructions au cache (un
// dixieme sur la part systeme, estimee a 1500 des 4000 tokens d entree).
const apres = cout(MODELE_SIMPLE, 1500 * 0.1 + 700, 900)

console.log(`\ncout d une reponse : ${avant.toFixed(4)} EUR avant, ${apres.toFixed(4)} EUR apres`)
console.log(
  `15 EUR couvrent ${Math.floor(15 / avant)} reponses avant, ${Math.floor(15 / apres)} apres ` +
    `(${Math.floor(15 / avant / 30)}/jour contre ${Math.floor(15 / apres / 30)}/jour)`,
)

console.log(echecs === 0 ? '\nBudget de conversation : tout passe.' : `\n${echecs} echec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
