import {
  resoudre,
  catalogueThemes,
  themesPour,
  themeConnu,
  enVariablesCss,
  THEME_PAR_DEFAUT,
} from './src/services/themes.js'

/**
 * Éprouve la résolution d'une boutique en apparence.
 *
 * Ce qui est vérifié tient en une phrase : **une vitrine ne doit jamais avoir
 * de décision à prendre**. Tout est résolu ici — thème inconnu, jeton absent,
 * texte vide — parce qu'une vitrine qui décide finit par afficher une page
 * d'accueil sans titre le jour où un réglage manque, et que personne ne s'en
 * aperçoit avant le lendemain.
 *
 * Ne touche aucune base : la bibliothèque est un fichier, et ce banc doit
 * tourner sans connexion.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

// --- Une boutique qui n'a rien réglé ----------------------------------------

console.log("Une boutique qui n'a rien réglé s'affiche quand même :")
const neuve = resoudre({ name: 'Ma Boutique' })
exige(neuve.theme.id === THEME_PAR_DEFAUT, `defaut attendu, obtenu ${neuve.theme.id}`)
exige(Boolean(neuve.contenu.accroche), "une boutique neuve doit avoir un titre d'accueil")
exige(neuve.contenu.annonce === '', 'aucun bandeau tant que rien n a ete ecrit')
exige(Object.keys(neuve.jetons).length === 16, `16 jetons attendus, ${Object.keys(neuve.jetons).length}`)
exige(neuve.polices.familles.length >= 1, 'au moins une famille de police')
exige(neuve.boutique.nom === 'Ma Boutique', 'le nom de la boutique doit passer')

// --- Un thème inconnu ne ferme pas la boutique ------------------------------

console.log('\nUn theme inconnu retombe sur le defaut, il ne leve rien :')
const cassee = resoudre({ name: 'X', themeId: 'theme-qui-n-existe-plus' })
exige(cassee.theme.id === THEME_PAR_DEFAUT, `defaut attendu, obtenu ${cassee.theme.id}`)
exige(!themeConnu('theme-qui-n-existe-plus'), 'themeConnu doit refuser un identifiant invente')
exige(themeConnu('onyx'), 'themeConnu doit accepter un theme de la bibliotheque')

// --- Les remplacements du vendeur -------------------------------------------

console.log('\nCe que le vendeur remplace, et ce qu il ne peut pas remplacer :')
const perso = resoudre({
  name: 'X',
  themeId: 'onyx',
  themeTokens: {
    primary: '#123456',
    // Un champ invente ne doit pas se retrouver en variable CSS sur la
    // boutique d un client : la resolution ne reprend que les jetons connus.
    'onmouseover=alert(1)': 'rouge',
  } as never,
})
exige(perso.jetons.primary === '#123456', 'le jeton remplace doit passer')
exige(!('onmouseover=alert(1)' in perso.jetons), 'un jeton invente doit etre ignore')
exige(perso.jetons.background !== '#123456', 'les autres jetons gardent la palette')
exige(perso.theme.id === 'onyx', 'le theme choisi doit etre retenu')

// --- Les textes --------------------------------------------------------------

console.log('\nLes textes : une chaine vide est une valeur, pas une absence :')
const textes = resoudre({
  name: 'X',
  storefront: { annonce: 'Soldes', accroche: 'Chez nous,', fraisPort: 0 },
})
exige(textes.contenu.annonce === 'Soldes', 'le bandeau ecrit doit passer')
exige(textes.contenu.accroche === 'Chez nous,', "l accroche ecrite doit passer")
// Le port a zero est un vrai reglage -- « livraison offerte » -- et non un
// champ vide : le confondre avec l absence remettrait 4,90 EUR au vendeur qui
// vient justement de l offrir.
exige(textes.contenu.fraisPort === 0, `port offert : 0 attendu, obtenu ${textes.contenu.fraisPort}`)
exige(Boolean(textes.contenu.sousTitre), 'le sous-titre non ecrit garde son repli')

const efface = resoudre({ name: 'X', storefront: { annonce: '' } })
exige(efface.contenu.annonce === '', 'un bandeau efface reste efface')

// --- Les variables CSS -------------------------------------------------------

console.log('\nLes variables CSS, composees par le serveur :')
const css = enVariablesCss(resoudre({ name: 'X', themeId: 'neon' }))
for (const attendu of ['--background', '--foreground', '--muted-foreground', '--on-primary', '--police-titre']) {
  exige(css.includes(attendu), `${attendu} manque dans la feuille`)
}
// `mutedForeground` doit sortir en `--muted-foreground` : la vitrine ne doit
// jamais avoir a deviner la casse d un nom de variable.
exige(css.includes('--muted-foreground:'), 'le camelCase doit devenir du tiret')
exige(!css.includes('--mutedForeground'), 'aucun camelCase ne doit rester')

// --- Le catalogue et le rapprochement ---------------------------------------

console.log('\nLe catalogue, tel que l ecran de choix le recevra :')
const catalogue = catalogueThemes()
exige(catalogue.length >= 20, `${catalogue.length} themes, c est peu pour une bibliotheque`)
for (const t of catalogue) {
  exige(Boolean(t.apercu.background && t.apercu.primary), `${t.id} : apercu incomplet`)
  exige(Boolean(t.polices.titre), `${t.id} : police de titre absente`)
  exige(Boolean(t.structure.nom), `${t.id} : structure sans nom`)
}
console.log(`  (${catalogue.length} verifies)`)

console.log('\nLe rapprochement par secteur, qui evite de proposer 21 themes :')
const mode = themesPour(['mode'])
exige(mode.length <= 3, `au plus 3 propositions, obtenu ${mode.length}`)
exige(mode.includes('onyx') || mode.includes('dressing'), `mode -> ${mode.join(', ')}`)
const tech = themesPour(['high-tech'])
exige(tech.includes('circuit'), `high-tech -> ${tech.join(', ')}`)
// Rien de reconnu vaut mieux qu un mauvais rapprochement : proposer « Pastel »
// a un vendeur de pieces auto est pire que proposer le generaliste.
exige(
  themesPour(['quelque-chose-d-inconnu'])[0] === THEME_PAR_DEFAUT,
  'un secteur inconnu doit retomber sur le defaut',
)
exige(themesPour([])[0] === THEME_PAR_DEFAUT, 'aucun secteur doit retomber sur le defaut')

// --- La structure suit le theme ---------------------------------------------

console.log('\nLa structure vient du theme, pas d un reglage separe :')
exige(resoudre({ name: 'X', themeId: 'presse' }).structure.id === 'configurateur', 'presse -> configurateur')
exige(resoudre({ name: 'X', themeId: 'onyx' }).structure.id === 'vitrine', 'onyx -> vitrine')
// Le traitement des photos voyage avec la structure : c est ce qui empeche une
// vitrine de se disloquer sur des images ramassees chez vingt fournisseurs.
exige(
  Boolean(resoudre({ name: 'X', themeId: 'onyx' }).structure.photos.rapport),
  'la structure doit imposer son rapport d image',
)

console.log(echecs === 0 ? '\nApparence : tout passe.' : `\nApparence : ${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
