/**
 * Ce que la réécriture fait d'une réponse qu'elle n'a pas su lire.
 *
 *   cd backend && node check-reecriture.cjs
 *
 * **La panne du 02/09/2026, et elle était invisible par construction.**
 * Vingt-deux annonces Temu sur vingt-cinq sont sorties avec le texte brut du
 * fournisseur — zéro attribut, zéro argument, zéro mot-clé, le mot « Temu » dans
 * la description — **facturées, et déclarées réussies**. Ni note, ni alerte, ni
 * crédit rendu : rien ne les distinguait des bonnes dans la liste.
 *
 * La cause : `max_tokens` valait 2 500 pour une consigne qui en demande plus du
 * double. La réponse se faisait couper au milieu du JSON, `JSON.parse` levait,
 * `parsed` devenait `{}`, et **chaque champ retombait sur sa valeur de repli**
 * — c'est-à-dire sur le texte du fournisseur. Le tout rendu avec
 * `enhanced: true`, sous un commentaire qui affirmait « the JSON parsed ».
 *
 * Ce banc ne teste pas le modèle : il teste ce que le code fait d'une réponse
 * tronquée, illisible, ou vide. Trois cas où le seul comportement acceptable est
 * de rendre `enhanced: false` avec sa raison.
 */
const fs = require('fs')
const path = require('path')

const SOURCE = fs.readFileSync(path.join(__dirname, 'src', 'services', 'aiEnhancer.ts'), 'utf8')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

// --- Le plafond de sortie ----------------------------------------------------
console.log('\nLe plafond de jetons de sortie')
{
  const m = SOURCE.match(/max_tokens: (\d+),\n\s*(?:system|messages)/s)
  const plafond = Number((SOURCE.match(/max_tokens: (\d+)/g) ?? [])
    .map((x) => Number(x.replace(/\D/g, '')))
    .sort((a, b) => b - a)[0])

  verifier('le plafond de la réécriture est déclaré', Number.isFinite(plafond), String(plafond))
  /*
   * Trois mille au minimum, mesuré sur ce que la consigne demande.
   *
   * Titre + deux variantes + description de 600 à 1 500 caractères + sept
   * arguments de 80 à 200 + quinze attributs + méta + vingt-cinq mots-clés. En
   * français, un mot coûte plus de jetons qu'en anglais.
   */
  verifier(
    'il laisse la place à ce que la consigne demande',
    plafond >= 4000,
    `${plafond} jetons`,
  )
  void m
}

// --- Une réponse tronquée est un échec ---------------------------------------
console.log('\nCe qui est traité comme un échec')
{
  verifier(
    'une réponse coupée par le plafond est détectée',
    /stop_reason === 'max_tokens'/.test(SOURCE),
  )
  verifier(
    'un JSON illisible est détecté',
    /catch \(err\)[\s\S]{0,200}réponse illisible/.test(SOURCE),
  )
  verifier(
    'une réponse sans titre ni description est détectée',
    /réponse sans titre ni description/.test(SOURCE),
  )
  verifier(
    'chacun de ces cas rend le texte source ET dit non',
    /return \{ \.\.\.passthroughDe\(input\), raison: echec \}/.test(SOURCE),
  )
}

// --- `enhanced: true` ne se rend plus les yeux fermés ------------------------
console.log('\nCe qui est déclaré réussi')
{
  /*
   * Le point exact du défaut : `enhanced: true` était rendu inconditionnellement,
   * après un `catch` qui avalait l'échec de lecture. Le commentaire au-dessus
   * affirmait « The model answered and the JSON parsed » — ce qui était faux
   * dans le seul cas qui comptait.
   */
  /*
   * On cherche la ligne de code, pas une mention dans un commentaire.
   *
   * Première version : `indexOf('enhanced: true')`, qui tombait sur une phrase
   * du commentaire expliquant justement le défaut — le banc accusait donc un
   * code correct. C'est la deuxième fois qu'un banc de ce projet lit du
   * commentaire pour du code ; un banc qui se trompe de cible coûte plus cher
   * qu'un banc absent.
   */
  const lignes = SOURCE.split('\n')
  const ligneSucces = lignes.findIndex((l) => /^\s*enhanced: true,\s*$/.test(l))
  const ligneRefus = lignes.findIndex((l) => /^\s*if \(echec\) \{\s*$/.test(l))

  verifier('le succès est bien une ligne de code', ligneSucces > 0, `ligne ${ligneSucces + 1}`)
  verifier(
    'le succès est précédé du refus des réponses illisibles',
    ligneRefus > 0 && ligneRefus < ligneSucces,
    `refus ligne ${ligneRefus + 1}, succès ligne ${ligneSucces + 1}`,
  )
  verifier(
    'le repli existe au niveau du module, atteignable par callModel',
    /function passthroughDe\(/.test(SOURCE),
  )
}

// --- La raison remonte jusqu'au vendeur --------------------------------------
console.log("\nCe que le vendeur en voit")
{
  const importSource = fs.readFileSync(
    path.join(__dirname, 'src', 'services', 'productImport.ts'),
    'utf8',
  )
  verifier(
    "l'import écrit une remarque quand le texte n'est pas réécrit",
    /if \(!enhanced\.enhanced\)/.test(importSource) && /Texte non réécrit/.test(importSource),
  )
  verifier(
    'la remarque porte la raison rendue par le modèle',
    /enhanced\.raison/.test(importSource),
  )

  const liste = fs.readFileSync(
    path.join(__dirname, '..', 'frontend', 'src', 'pages', 'Dashboard.tsx'),
    'utf8',
  )
  verifier(
    'la liste permet de retrouver les annonces non réécrites',
    /aiEnhanced === false/.test(liste),
  )
}

// --- Le nom du fournisseur ne reste pas dans l'annonce -----------------------
console.log("\nLe nom de la place de marché source")
{
  /*
   * Vingt-deux descriptions contenaient « Temu ». Un vendeur qui revend sous sa
   * propre enseigne ne peut pas afficher le nom de son fournisseur : cela lui
   * coûte la vente et apprend à ses clients où acheter moins cher.
   */
  verifier(
    'la consigne interdit de le mentionner',
    /Ne mentionne JAMAIS le nom de la place de marché/.test(SOURCE),
  )
  verifier(
    'et elle nomme les principales',
    /Temu[\s\S]{0,80}AliExpress[\s\S]{0,80}Shein/.test(SOURCE),
  )
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
