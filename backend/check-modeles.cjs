/**
 * Les noms de modèles Claude appelés par l'application.
 *
 *   cd backend && node check-modeles.cjs
 *
 * **La panne du 02/09/2026.** Toute l'IA s'est arrêtée d'un coup — textes
 * d'annonces, publicités, agents — pendant que la génération d'images
 * continuait. Le diagnostic disait « injoignable » : ni clé absente, ni clé
 * refusée. La clé était bonne.
 *
 * `claude-sonnet-4-5` n'était plus servi. Un modèle retiré rend un **404**, qui
 * n'est ni 401 ni 402 ni 403, donc rangé dans le fourre-tout. Le nom était
 * écrit en dur à **neuf endroits, dans huit fichiers**, et tous sont tombés au
 * même instant.
 *
 * Ce banc refuse tout nom de modèle qui ne figure pas dans la liste des modèles
 * servis, et refuse qu'un nom soit écrit ailleurs que dans `aiModels.ts`. Un
 * modèle a une date de fin, et cette date n'est pas la nôtre : la seule
 * protection est de n'avoir qu'un endroit à changer, et de le vérifier.
 */
const fs = require('fs')
const path = require('path')

/**
 * Les modèles actuellement servis par l'API Anthropic.
 *
 * À mettre à jour quand Anthropic publie une nouvelle génération — c'est le
 * geste normal, et il est visible. Ce qui ne doit jamais arriver, c'est qu'un
 * nom retiré survive dans le code sans que personne le sache.
 */
const SERVIS = new Set([
  'claude-fable-5-1',
  'claude-fable-5',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
])

/** Le seul fichier qui a le droit de nommer un modèle. */
const SOURCE_UNIQUE = path.join('src', 'services', 'aiModels.ts')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

/** Tous les .ts du serveur, parcourus — jamais une liste écrite à la main. */
function fichiers(dossier, sortie = []) {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, entree.name)
    if (entree.isDirectory()) fichiers(complet, sortie)
    else if (entree.name.endsWith('.ts')) sortie.push(complet)
  }
  return sortie
}

const MOTIF = /'(claude-[a-z0-9.-]+)'/g

const trouves = []
for (const fichier of fichiers(path.join(__dirname, 'src'))) {
  const source = fs.readFileSync(fichier, 'utf8')
  for (const m of source.matchAll(MOTIF)) {
    trouves.push({ fichier: path.relative(__dirname, fichier), nom: m[1] })
  }
}

console.log('\nLes noms de modèles trouvés dans le code')
console.log(
  trouves.length
    ? trouves.map((t) => `        ${t.fichier} → ${t.nom}`).join('\n')
    : '        aucun',
)

// --- Aucun modèle retiré ----------------------------------------------------
console.log('\nChaque nom est-il encore servi ?')
{
  const morts = trouves.filter((t) => !SERVIS.has(t.nom))
  verifier(
    'aucun modèle retiré n’est appelé',
    morts.length === 0,
    morts.map((t) => `${t.fichier} → ${t.nom}`).join(' · '),
  )
}

// --- Un seul endroit qui nomme ----------------------------------------------
console.log('\nOù les noms sont-ils écrits ?')
{
  /*
   * Les tables de tarifs ont le droit de nommer : elles associent un prix à un
   * modèle, ce sont des données, pas des appels. Mais elles vivent dans
   * `aiModels.ts` avec le reste.
   */
  const ailleurs = trouves.filter((t) => t.fichier !== SOURCE_UNIQUE)
  verifier(
    'tous les noms vivent dans aiModels.ts',
    ailleurs.length === 0,
    ailleurs.map((t) => `${t.fichier} → ${t.nom}`).join(' · '),
  )
}

// --- Les constantes exportées sont bien servies ------------------------------
console.log('\nLes constantes exportées')
{
  const source = fs.readFileSync(path.join(__dirname, SOURCE_UNIQUE), 'utf8')
  for (const nom of ['MODELE_REDACTION', 'MODELE_RAPIDE', 'MODELE_PUISSANT']) {
    const m = source.match(new RegExp(`export const ${nom} = '([^']+)'`))
    verifier(`${nom} nomme un modèle servi`, Boolean(m && SERVIS.has(m[1])), m?.[1] ?? 'introuvable')
  }

  /*
   * Le tarif doit connaître le modèle appelé.
   *
   * Sans sa ligne, `logCost` n'écrit rien et la mesure du coût réel — celle sur
   * laquelle repose tout le modèle économique — disparaît en silence.
   */
  for (const nom of ['MODELE_REDACTION', 'MODELE_RAPIDE', 'MODELE_PUISSANT']) {
    const m = source.match(new RegExp(`export const ${nom} = '([^']+)'`))
    verifier(
      `le tarif de ${nom} est connu`,
      Boolean(m && new RegExp(`'${m[1]}':\\s*\\{`).test(source)),
      m?.[1] ?? '',
    )
  }
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
