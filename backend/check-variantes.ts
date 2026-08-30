import { reparerVariantes } from './src/services/variantRepair.js'

/**
 * Éprouve la réparation des options d'achat.
 *
 * Les cas viennent de la base de production, pas d'exemples inventés : ce sont
 * les variantes réellement importées et réellement publiées sur Shopify le
 * 27/08/2026. Un banc bâti sur des exemples choisis passerait toujours ; ceux-ci
 * ont déjà mis une fiche fausse en ligne.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

// --- Cas réel n°1 : des capacités rangées sous « Couleur » ------------------
const capacites = reparerVariantes({
  Couleur: ['1T', '4T', '2T', '128T', '8T', '16T', '6T', '30T', '64T'],
})
exige(!capacites.variantes.Couleur, 'les capacites ne doivent plus etre des couleurs')
exige(
  capacites.variantes['Capacité']?.length === 9,
  `Capacite: ${capacites.variantes['Capacité']?.length ?? 0} valeurs, attendu 9`,
)
console.log('cas 1 :', JSON.stringify(capacites.variantes), '|', capacites.changements[0])

// --- Cas réel n°2 : deux dimensions écrasées en une ------------------------
const melange = reparerVariantes({
  Couleur: [
    'Black 1T', 'Blue 1T', 'Red 1T', 'Black 4T', 'Blue 2T',
    'Blue 4T', 'Red 16T', 'Blue 16T', 'Black 16T', 'Black 2T', 'Red 2T', 'Red 4T',
  ],
})
exige(melange.variantes.Couleur?.length === 3, `Couleur: ${JSON.stringify(melange.variantes.Couleur)}, attendu 3`)
exige(
  melange.variantes['Capacité']?.length === 4,
  `Capacite: ${JSON.stringify(melange.variantes['Capacité'])}, attendu 4`,
)
console.log('cas 2 :', JSON.stringify(melange.variantes), '|', melange.changements[0])

// --- Cas réel n°3 : une option correcte ne doit pas bouger -----------------
const prise = reparerVariantes({ 'Type de prise': ['USB', 'Prise UE'] })
exige(
  prise.variantes['Type de prise']?.length === 2 || prise.variantes['Prise']?.length === 2,
  `une option juste a ete abimee : ${JSON.stringify(prise.variantes)}`,
)
console.log('cas 3 :', JSON.stringify(prise.variantes))

// --- Cas réel n°4 : vide reste vide, sans planter --------------------------
exige(Object.keys(reparerVariantes({}).variantes).length === 0, 'un objet vide doit rester vide')
exige(Object.keys(reparerVariantes(null).variantes).length === 0, 'null ne doit pas planter')
exige(Object.keys(reparerVariantes('nawak').variantes).length === 0, 'une chaine ne doit pas planter')

// --- De vraies couleurs restent des couleurs -------------------------------
const vraies = reparerVariantes({ Couleur: ['Noir', 'Blanc', 'Rouge', 'Bleu'] })
exige(vraies.variantes.Couleur?.length === 4, `de vraies couleurs ont ete renommees : ${JSON.stringify(vraies.variantes)}`)
exige(vraies.changements.length === 0, `rien ne devait changer, or : ${vraies.changements.join(' / ')}`)

// --- Une option à une seule valeur n'est pas un choix ----------------------
const unique = reparerVariantes({ Couleur: ['Noir'] })
exige(!unique.variantes.Couleur, 'une option a une seule valeur doit disparaitre')

// --- Les tailles sous une mauvaise etiquette -------------------------------
const tailles = reparerVariantes({ Couleur: ['S', 'M', 'L', 'XL'] })
exige(tailles.variantes.Taille?.length === 4, `Taille: ${JSON.stringify(tailles.variantes)}`)

// --- Le doute profite a l etiquette d origine ------------------------------
// Trois valeurs sur six seulement sont des couleurs : sous le seuil, on garde.
const doute = reparerVariantes({ Style: ['Noir', 'Blanc', 'Rouge', 'Vintage', 'Moderne', 'Sport'] })
exige(
  doute.variantes.Style?.length === 6,
  `sous le seuil, l etiquette d origine doit rester : ${JSON.stringify(doute.variantes)}`,
)

console.log(echecs === 0 ? '\nReparation des variantes : tout passe.' : `\n${echecs} echec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
