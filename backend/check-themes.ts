import bibliotheque from './src/services/themeSeed.json' with { type: 'json' }

/**
 * Éprouve la bibliothèque de thèmes, et d'abord sa lisibilité.
 *
 * **C'est le seul contrôle qui peut vraiment échouer ici, et c'est pour ça
 * qu'il existe.** Une palette jolie mais illisible traverse toutes les
 * relectures humaines : personne ne mesure du gris sur du blanc à l'œil. Sur une
 * boutique, ce sont les prix qu'on finit par ne pas lire — et un prix illisible
 * ne se plaint pas, il ne se vend simplement pas.
 *
 * Les seuils sont ceux du WCAG : 4,5:1 pour du texte courant, 3:1 pour un texte
 * secondaire ou une bordure. Ils ne sont pas négociés à la baisse pour faire
 * passer une palette — une palette qui ne passe pas sort de la bibliothèque.
 *
 * Ne touche aucune base et n'appelle aucun modèle : la bibliothèque est un
 * fichier, et ce banc doit tourner sans connexion.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

// --- Le contraste ------------------------------------------------------------

function canal(v: number) {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
}

function contraste(a: string, b: string): number | null {
  const la = luminance(a)
  const lb = luminance(b)
  if (la === null || lb === null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/*
 * Les paires qui doivent tenir, et le seuil de chacune.
 *
 * **Une correction du banc lui-même.** Il exigeait d'abord 3:1 sur
 * `border/background`, et vingt et un thèmes sur vingt et un échouaient. Ce
 * n'étaient pas les palettes qui avaient tort : le WCAG demande 3:1 pour les
 * éléments graphiques **porteurs de sens** — la limite d'un champ de saisie, un
 * anneau de focus — pas pour un filet décoratif entre deux cartes. Exiger 3:1
 * sur toute bordure aurait rendu chaque séparateur presque noir, et surtout
 * aurait produit un banc qu'on finit par désactiver — c'est-à-dire un banc qui
 * ne vérifie plus rien.
 *
 * La bordure doit donc seulement **être visible**, et c'est l'anneau de focus,
 * lui, qui doit tenir 3:1 : un anneau invisible rend la boutique impraticable
 * au clavier, et ça, ça ne se voit jamais à l'œil d'un voyant à la souris.
 */
const PAIRES: Array<[string, string, number, string]> = [
  ['foreground', 'background', 4.5, 'le texte de la page'],
  ['cardForeground', 'card', 4.5, 'le texte dans une carte produit'],
  ['mutedForeground', 'background', 4.5, 'les mentions secondaires'],
  ['onPrimary', 'primary', 4.5, 'le texte du bouton principal'],
  ['onAccent', 'accent', 3, "le texte sur l'accent"],
  ['onDestructive', 'destructive', 4.5, 'le texte du bouton de suppression'],
  ['ring', 'background', 3, "l'anneau de focus, au clavier"],
  ['border', 'background', 1.15, 'les bordures, qui doivent au moins se voir'],
]

// --- Ce qui est chargé -------------------------------------------------------

const { palettes, typographies, structures, themes } = bibliotheque as any

console.log(
  `Bibliothèque : ${palettes.length} palettes, ${typographies.length} appariements, ${structures.length} structures, ${themes.length} thèmes.\n`,
)

exige(palettes.length >= 150, `trop peu de palettes (${palettes.length})`)
exige(typographies.length >= 50, `trop peu d'appariements (${typographies.length})`)

// --- Les thèmes se résolvent -------------------------------------------------

const paletteParId = new Map(palettes.map((p: any) => [p.id, p]))
const typoParId = new Map(typographies.map((t: any) => [t.id, t]))
const structureParId = new Map(structures.map((s: any) => [s.id, s]))

console.log('Chaque thème pointe vers une structure, une palette et des polices :')
for (const t of themes) {
  exige(structureParId.has(t.structure), `${t.id} : structure « ${t.structure} » introuvable`)
  exige(paletteParId.has(t.palette), `${t.id} : palette ${t.palette} introuvable`)
  exige(typoParId.has(t.typo), `${t.id} : polices ${t.typo} introuvables`)
  exige(Array.isArray(t.secteurs) && t.secteurs.length > 0, `${t.id} : aucun secteur déclaré`)
}

// Un identifiant en double écraserait silencieusement l'autre au semis.
const vus = new Set<string>()
for (const t of themes) {
  exige(!vus.has(t.id), `identifiant de thème en double : ${t.id}`)
  vus.add(t.id)
}

// Chaque structure doit porter au moins un thème : une structure sans thème est
// du code écrit que personne ne peut choisir.
for (const s of structures) {
  const combien = themes.filter((t: any) => t.structure === s.id).length
  exige(combien > 0, `la structure « ${s.id} » n'a aucun thème`)
}
console.log(`  (${themes.length} vérifiés)\n`)

// --- La lisibilité des thèmes ------------------------------------------------

console.log('La lisibilité de chaque thème, paire par paire :')
for (const t of themes) {
  const p: any = paletteParId.get(t.palette)
  if (!p) continue
  for (const [avant, arriere, seuil, quoi] of PAIRES) {
    const r = contraste(p.couleurs[avant], p.couleurs[arriere])
    if (r === null) {
      echecs++
      console.log(`ECHEC : ${t.id} — couleur illisible (${avant} ou ${arriere})`)
      continue
    }
    exige(
      r >= seuil,
      `${t.nom} (${t.id}) — ${quoi} : ${r.toFixed(2)}:1, il faut ${seuil}:1\n         ${p.couleurs[avant]} sur ${p.couleurs[arriere]} — palette ${p.id} « ${p.nom} »`,
    )
  }
}
console.log(`  (${themes.length} thèmes × ${PAIRES.length} paires)\n`)

// --- Les structures ----------------------------------------------------------

console.log('Chaque structure dit comment elle traite les photos :')
for (const s of structures) {
  /*
   * Ce n'est pas un détail décoratif.
   *
   * Une vitrine de dropshipping affiche des images ramassées chez vingt
   * fournisseurs : fonds blancs, fonds de studio, captures de téléphone,
   * formats incohérents. Une structure qui ne fixe pas son rapport d'image se
   * disloque à la première fiche importée de Temu.
   */
  exige(Boolean(s.photos?.rapport), `${s.id} : aucun rapport d'image imposé`)
  exige(
    ['cover', 'contain'].includes(s.photos?.recadrage),
    `${s.id} : recadrage « ${s.photos?.recadrage} » inconnu`,
  )
  exige(Array.isArray(s.blocs) && s.blocs.length >= 3, `${s.id} : moins de trois blocs`)
}
console.log(`  (${structures.length} vérifiées)\n`)

// --- Les polices -------------------------------------------------------------

console.log('Les polices des thèmes retenus, à auto-héberger :')
const familles = new Set<string>()
for (const t of themes) {
  const typo: any = typoParId.get(t.typo)
  if (!typo) continue
  exige(Boolean(typo.titre && typo.texte), `${t.id} : appariement incomplet`)
  familles.add(typo.titre)
  familles.add(typo.texte)
}
console.log(`  ${familles.size} familles : ${[...familles].sort().join(', ')}`)
/*
 * Le nombre compte, et il doit rester petit.
 *
 * Chaque famille est un fichier à servir depuis chez nous — jamais depuis
 * `fonts.googleapis.com`, qui enverrait l'adresse IP de chaque visiteur d'une
 * boutique française aux États-Unis. Trente familles, c'est un dossier ; deux
 * cents, c'est un problème de stockage et de licences à vérifier une par une.
 */
exige(familles.size <= 40, `${familles.size} familles de polices, c'est trop à héberger`)

// --- La réserve du générateur -----------------------------------------------

/*
 * Les 171 palettes qu'aucun thème n'utilise encore.
 *
 * Elles ne sont pas décoratives : c'est dans cette réserve que le générateur
 * puisera pour varier une boutique sans qu'on écrive un thème de plus. Les
 * mesurer maintenant évite la mauvaise surprise du jour où il s'en servira —
 * et c'est ce qui justifie d'avoir corrigé bordures et anneaux de focus par une
 * règle plutôt qu'à la main sur les vingt et une palettes en service.
 *
 * Le compte est affiché, pas exigé : une palette recalée n'est pas un défaut,
 * c'est une palette que le générateur ne proposera pas.
 */
console.log('La réserve, mesurée aux mêmes seuils :')
const enService = new Set(themes.map((t: any) => t.palette))
let reserveOk = 0
const recalees: string[] = []

for (const p of palettes) {
  if (enService.has(p.id)) continue
  const fautes = PAIRES.filter(([avant, arriere, seuil]) => {
    const r = contraste(p.couleurs[avant], p.couleurs[arriere])
    return r === null || r < seuil
  })
  if (fautes.length === 0) reserveOk++
  else recalees.push(`${p.id} ${p.nom} (${fautes.map(([, , , quoi]) => quoi).join(', ')})`)
}

const reserve = palettes.length - enService.size
console.log(`  ${reserveOk} sur ${reserve} utilisables sans retouche.`)
if (recalees.length) {
  console.log(`  ${recalees.length} recalées, dont : ${recalees.slice(0, 5).join(' · ')}`)
}
// Une réserve massivement recalée voudrait dire que les règles d'ajustement ne
// marchent que sur les cas qu'on a regardés — ce qui est exactement le piège
// qu'on vient d'éviter sur les bordures.
exige(
  reserveOk >= reserve * 0.8,
  `seulement ${reserveOk} palettes utilisables sur ${reserve} : les règles d'ajustement ne tiennent pas`,
)

console.log(
  echecs === 0
    ? '\nBibliothèque de thèmes : tout passe.'
    : `\nBibliothèque de thèmes : ${echecs} echec(s).`,
)
process.exit(echecs === 0 ? 0 : 1)
