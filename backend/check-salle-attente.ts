import { CATEGORIE_A_RANGER, cleDuTitre, clesCandidates, estARanger } from './src/services/categories.js'
import { DEPARTMENTS, findDepartment } from './src/services/departments.js'
import graine from './src/services/categorySeed.json' with { type: 'json' }

/**
 * Éprouve la salle d'attente du référentiel, et le geste qui en sort.
 *
 * « Nouveauté et usage spécial » n'est pas un rayon : c'est là qu'atterrit un
 * produit dont la catégorie n'a pas été reconnue, et **une annonce qui y reste
 * ne s'affiche nulle part**. Deux choses doivent donc tenir, et aucune ne se
 * voit à l'œil nu :
 *
 * 1. **La constante désigne quelque chose.** Un identifiant mal orthographié
 *    laisse `estARanger` répondre « non » pour toujours : aucun écran ne
 *    signalerait plus rien, et le défaut ressemblerait trait pour trait à un
 *    catalogue bien rangé.
 * 2. **La correction du vendeur est gravée sur les clés que la lecture
 *    essaie.** L'ancienne version gravait la catégorie source telle que le
 *    fournisseur l'écrit — « Gadgets Insolites » — alors que la lecture demande
 *    « gadgets-insolites ». L'alias existait, personne ne le trouvait jamais, et
 *    la même erreur revenait à chaque import.
 *
 * Ne tape aucune base : tout ce qui est vérifié ici est déterministe. Ce qui
 * exige la vraie base — l'alias qui remplace le précédent — vit dans
 * `check-categories.ts`, qui tourne contre elle.
 */
let echecs = 0
const exige = (c: boolean, m: string) => {
  if (!c) {
    echecs++
    console.log(`ECHEC : ${m}`)
  }
}

// ── 1. La constante désigne une vraie entrée du référentiel ─────────────────

const categories = (graine as { categories: Array<{ id: string; parentId: string | null }> }).categories
const racine = categories.find((c) => c.id === CATEGORIE_A_RANGER)
exige(Boolean(racine), `« ${CATEGORIE_A_RANGER} » n'existe pas dans categorySeed.json`)
exige(racine?.parentId === null, 'la salle d\'attente est un rayon du référentiel, pas une sous-catégorie')

const enfants = categories.filter((c) => c.parentId === CATEGORIE_A_RANGER)
exige(enfants.length > 0, 'la salle d\'attente a des sous-catégories, et elles comptent aussi')

// ── 2. Ce qui est « à ranger », et ce qui ne l'est pas ──────────────────────

exige(estARanger(CATEGORIE_A_RANGER), 'la racine est à ranger')
exige(enfants.every((c) => estARanger(c.id)), 'les sous-catégories de la salle d\'attente sont à ranger')
exige(!estARanger('ht-laptop'), 'une vraie catégorie n\'est pas à ranger')
exige(!estARanger(null) && !estARanger(undefined), 'une annonce sans catégorie n\'est pas « à ranger » : elle est sans catégorie')
// Un identifiant qui commence par le même mot sans être un enfant : le tiret
// du préfixe compte, sinon « nouveaute-electromenager » tomberait dedans.
exige(!estARanger('nouveautes-diverses'), 'le préfixe se compare tiret compris')

// ── 3. Aucun chef de rayon, mais la clé répond encore ───────────────────────

exige(
  !DEPARTMENTS.some((d) => d.key === CATEGORIE_A_RANGER),
  'la salle d\'attente ne doit pas avoir de chef de rayon',
)
exige(DEPARTMENTS.length === 23, `23 rayons attendus, vu ${DEPARTMENTS.length}`)
// Un vendeur qui l'avait confiée garde son agent et ses trouvailles : la clé
// est reprise vers le rayon réel le plus proche plutôt que de ne plus répondre.
exige(findDepartment(CATEGORIE_A_RANGER)?.key === 'jouets-et-jeux', 'la clé retirée mène au rayon le plus proche')

// ── 4. Les clés que la correction du vendeur doit graver ────────────────────

const cles = [
  ...clesCandidates({ title: 'Perruque cosplay rose 60 cm', sourceCategory: 'Gadgets Insolites', supplierId: 'temu' }),
  cleDuTitre('Perruque cosplay rose 60 cm'),
]
exige(cles.includes('gadgets-insolites'), 'la catégorie source est normalisée avant de devenir une clé')
exige(!cles.includes('Gadgets Insolites'), 'la clé brute du fournisseur ne doit jamais être gravée telle quelle')
exige(cles.includes('perruque-cosplay-rose-60-cm'), 'le titre est une clé, pour les fiches qui n\'annoncent aucune catégorie')

const avecIdFournisseur = clesCandidates({
  title: 'Perruque cosplay rose 60 cm',
  sourceCategory: 'Gadgets Insolites',
  supplierId: 'temu',
  supplierCategoryId: '4821',
})
exige(avecIdFournisseur[0] === 'temu:4821', 'la clé la plus sûre — fournisseur + identifiant — vient en tête')

// Une catégorie source sans valeur ne devient jamais une clé : c'est elle qui
// avait rangé seize produits sans rapport sous « Figurines et jouets d'action ».
exige(
  !clesCandidates({ title: 'Souris gamer', sourceCategory: 'la catégorie Maison' }).includes('la-categorie-maison'),
  'une catégorie source de gabarit est écartée',
)

console.log(echecs === 0 ? 'Salle d\'attente : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
