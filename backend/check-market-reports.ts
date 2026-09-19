import { CATEGORIES, lirePrompts, lireRapport, lireProduits, nombreFr, RapportInvalide, themeDuJour } from './src/services/marketReports.js'

/**
 * Éprouve la lecture des rapports des 48 agents selon le contrat de
 * MARKET-ANALYSES/README.md.
 *
 * **Ce que ce banc protège** : la liste des 20 produits d'un rapport rayon
 * devient une liste d'annonces importables. Une colonne déplacée, un prix
 * écrit « 9,80 € », une adresse entre chevrons, un mode d'import inventé —
 * chacun de ces cas a une réponse écrite ici, et un rapport qui ne respecte
 * pas le contrat est refusé AVEC la raison, pour que l'agent se corrige.
 */
let echecs = 0
const exige = (c: boolean, m: string) => {
  if (!c) {
    echecs++
    console.log(`ECHEC : ${m}`)
  }
}

// ── 1. Le découpage ─────────────────────────────────────────────────────────

exige(CATEGORIES.length === 24, `24 catégories attendues, vu ${CATEGORIES.length}`)
exige(CATEGORIES.every((c) => c.themes.length === 7), 'chaque catégorie a 7 thèmes')
const ids = CATEGORIES.map((c) => c.id)
exige(new Set(ids).size === ids.length, 'les identifiants de catégories sont uniques')
const tel = CATEGORIES.find((c) => c.id === 'telephonie')!
exige(!!tel, 'la téléphonie existe')
const t1 = themeDuJour(tel, new Date('2026-01-01T12:00:00Z'))
const t8 = themeDuJour(tel, new Date('2026-01-08T12:00:00Z'))
const t2 = themeDuJour(tel, new Date('2026-01-02T12:00:00Z'))
exige(t1.id === tel.themes[0].id && t8.id === t1.id && t2.id === tel.themes[1].id, 'le thème du jour tourne sur 7 jours')

// ── 2. Les nombres à la française ───────────────────────────────────────────

exige(nombreFr('9,80 €') === 9.8, '« 9,80 € » → 9.8')
exige(nombreFr('24.90') === 24.9, '« 24.90 » → 24.9')
exige(nombreFr('61 %') === 61, '« 61 % » → 61')
exige(nombreFr('1 234,5') === 1234.5, 'espace de milliers toléré')
exige(nombreFr('') === null && nombreFr('n/a') === null, 'vide ou texte → null')

// ── 3. Un rapport rayon conforme ────────────────────────────────────────────

const lignes = Array.from({ length: 20 }, (_, i) =>
  `| ${i + 1} | Chargeur GaN ${65 + i} W | ${i % 2 ? 'CJ Dropshipping' : 'Temu'} | https://exemple.test/p/${i + 1} | ${(9 + i).toFixed(2).replace('.', ',')} | ${(24 + i).toFixed(2).replace('.', ',')} | 61 | ${i % 2 ? 'api' : 'extension'} | tendance rentrée |`,
).join('\n')

const rayon = `---
type: rayon
date: 2026-09-17
categorie: telephonie
theme: chargeurs-cables
titre: Chargeurs et câbles — ce qui se vend en septembre 2026
accroche: Le GaN a gagné, et les câbles tressés font la marge.
agent: rayon-telephonie
sources: 6
---

## Analyse

Le marché des chargeurs bascule vers le GaN multi-ports : les 65 W à trois sorties
se vendent entre 19 et 29 € sur les places de marché françaises, avec une marge
de gros de 55 à 65 % chez CJ. Les câbles tressés USB-C 100 W sont le produit
d'appel : petit prix, forte rotation, peu de retours. La saisonnalité de la
rentrée pousse les batteries externes compactes.

## 20 produits proposés

| # | Titre | Fournisseur | URL fournisseur | Prix achat € | Prix vente conseillé € | Marge % | Import | Pourquoi |
|---|-------|-------------|-----------------|--------------|------------------------|---------|--------|----------|
${lignes}
`

const lu = lireRapport(rayon)
exige(lu.type === 'rayon' && lu.day === '2026-09-17' && lu.categorie === 'telephonie' && lu.theme === 'chargeurs-cables', "l'en-tête est lu")
exige(lu.accroche === 'Le GaN a gagné, et les câbles tressés font la marge.', "l'accroche est lue")
exige(lu.sources === 6, 'les sources sont comptées')
exige(lu.produits.length === 20, `20 produits lus, vu ${lu.produits.length}`)
exige(lu.produits[0].prixAchat === 9 && lu.produits[0].prixVente === 24 && lu.produits[0].margePct === 61, 'les prix sont lus en nombres')
exige(lu.produits[0].import === 'extension' && lu.produits[1].import === 'api', "le mode d'import est lu tel quel")
exige(lu.produits[1].fournisseur === 'CJ Dropshipping' && lu.produits[1].url === 'https://exemple.test/p/2', 'fournisseur et adresse sont lus')
exige(lu.produits[19].rang === 20, 'le rang suit la liste')

// Les colonnes se lisent par NOM : un ordre différent passe, une colonne en moins non.
const autreOrdre = `| Fournisseur | Titre | Import | URL fournisseur | Prix vente conseillé € | Prix achat € |
|---|---|---|---|---|---|
| BigBuy | Câble tressé | api | <https://exemple.test/c/1> | 12,90 | 3,10 |`
const p2 = lireProduits(autreOrdre)
exige(p2.length === 1 && p2[0].titre === 'Câble tressé' && p2[0].prixAchat === 3.1 && p2[0].url === 'https://exemple.test/c/1', 'les colonnes se lisent par nom, les chevrons tombent')
let refus: unknown = null
try {
  lireProduits(`| Titre | Fournisseur | Prix achat € |\n|---|---|---|\n| X | Y | 1 |`)
} catch (e) {
  refus = e
}
exige(refus instanceof RapportInvalide && /URL fournisseur/.test((refus as Error).message), 'une colonne manquante est nommée dans le refus')

// Un mode d'import inventé retombe sur « extension » : jamais un import automatique par erreur.
const modeInvente = lireProduits(`| Titre | Fournisseur | URL fournisseur | Prix achat € | Prix vente conseillé € | Import |\n|---|---|---|---|---|---|\n| X | Temu | https://exemple.test/x | 1 | 2 | auto |`)
exige(modeInvente[0].import === 'extension', "un mode inconnu devient « extension » (l'humain garde la main)")

// ── 4. Les refus ────────────────────────────────────────────────────────────

const attendRefus = (md: string, motif: RegExp, nom: string) => {
  let e: unknown = null
  try {
    lireRapport(md)
  } catch (err) {
    e = err
  }
  exige(e instanceof RapportInvalide && motif.test((e as Error).message), `${nom} — vu : ${e instanceof Error ? e.message : 'aucun refus'}`)
}
attendRefus(rayon.replace('categorie: telephonie', 'categorie: telefonie'), /Catégorie inconnue/, 'catégorie inconnue refusée')
attendRefus(rayon.replace('theme: chargeurs-cables', 'theme: chargeurs'), /Thème inconnu/, 'thème inconnu refusé')
attendRefus(rayon.replace('type: rayon', 'type: analyse'), /Type inconnu/, 'type inconnu refusé')
attendRefus(rayon.replace('date: 2026-09-17', 'date: 17/09/2026'), /Date/, 'date mal formée refusée')
attendRefus(rayon.replace(/^---\n/, ''), /En-tête/, 'en-tête absent refusé')
attendRefus(rayon.split('| 5 |')[0], /produit\(s\) lisible/, 'un rapport rayon avec moins de 5 produits est refusé')

// ── 5. Un rapport marketing : pas de produits, six sections ─────────────────

const marketing = `---
type: marketing
date: 2026-09-17
categorie: telephonie
theme: chargeurs-cables
titre: Chargeurs — qui fait de la pub et comment
agent: marketing-telephonie
sources: 8
---

## Social places
Les créateurs tech poussent le GaN 65 W en unboxing court ; TikTok Shop concentre les ventes du soir.

## Publicités en cours
Anker et Ugreen dominent la Ad Library avec des visuels fond blanc, produit au centre, promesse chiffrée.

## Tendances du jour
Le format « un chargeur pour tout » remplace « le plus petit ».

## Tendances publicitaires
Vidéo 9:16 de 12 s, hook dans la première seconde, prix barré en fin.

## Prompts d'images publicitaires
\`\`\`
# Facebook 1:1
Chargeur GaN blanc sur bureau bois clair, lumière du matin, trois câbles branchés, style photo produit premium.
\`\`\`

## Prompts de vidéos publicitaires
\`\`\`
# TikTok 9:16 — 15 s
Hook : « Un seul chargeur pour tout ça ? » Plan serré sur trois appareils qui se branchent, compteur de watts, prix barré.
\`\`\`
`
const m = lireRapport(marketing)
exige(m.type === 'marketing' && m.produits.length === 0, 'un rapport marketing ne porte pas de produits')
exige(m.body.includes('## Prompts de vidéos publicitaires'), 'le corps est gardé tel quel, sections comprises')

// ── 6. Les prompts publicitaires du rapport marketing ───────────────────────

/*
 * Ce que ce morceau protège : l'écran « Prompts IA » de Réseaux ne montre que
 * ce que cette lecture trouve. Deux pièges, et ils viennent du même endroit —
 * **c'est la section qui décide du genre, jamais le texte du prompt** : un
 * prompt d'image qui parle de mouvement resterait rangé en image, et un titre
 * de section qui ne nomme ni image ni vidéo ne produit rien plutôt que de
 * deviner. Le second est qu'un bloc de code d'une AUTRE section (un exemple de
 * légende, un tableau de chiffres) n'est pas un prompt.
 */
const rapportMarketing = `---
type: marketing
date: 2026-09-17
categorie: telephonie
theme: chargeurs-cables
titre: Chargeurs — ce qui marche sur les réseaux
agent: marketing-telephonie
sources: 8
---

## Social places

Le format qui marche est la démonstration en main, filmée de haut, sans voix.

\`\`\`
Ceci est un exemple de légende, pas un prompt.
\`\`\`

## Prompts d'images publicitaires

\`\`\`
# Facebook 1:1
Chargeur GaN posé sur un bureau en chêne clair, lumière rasante du matin,
fond flou, mention « 65 W » en gros.
\`\`\`

\`\`\`
# Instagram 4:5
Trois câbles tressés enroulés, à plat, fond papier terracotta.
\`\`\`

## Prompts de vidéos publicitaires

\`\`\`
# TikTok 9:16 — 15 s
Plan serré sur une prise murale, la main branche le chargeur, coupe sur
l'écran du téléphone qui passe de 12 % à 48 %.
\`\`\`
`

const luMarketing = lireRapport(rapportMarketing)
const prompts = lirePrompts(luMarketing.body)
exige(prompts.length === 3, `3 prompts attendus, vu ${prompts.length} — un bloc d'une autre section a été pris pour un prompt`)
exige(prompts.filter((p) => p.genre === 'image').length === 2, 'deux prompts d\'image')
exige(prompts.filter((p) => p.genre === 'video').length === 1, 'un prompt de vidéo')
exige(prompts[0].format === 'Facebook 1:1', `format lu en première ligne, vu « ${prompts[0].format} »`)
exige(!prompts[0].texte.startsWith('#'), "le format n'est pas recopié dans le texte à coller")
exige(prompts[2].format === 'TikTok 9:16 — 15 s', 'le format d\'une vidéo porte sa durée')
exige(prompts[2].texte.includes('12 % à 48 %'), 'le corps du prompt est rendu entier')
exige(lirePrompts('## Prompts d\'images publicitaires\n\nRien ici.').length === 0, 'une section sans bloc ne rend rien')
exige(lirePrompts(luMarketing.body).length === lirePrompts(luMarketing.body).length, 'lecture idempotente')

// Un rapport rayon n'a pas de prompts, et ne doit pas en inventer.
exige(lirePrompts(lireRapport(rayon).body).length === 0, 'un rapport rayon ne rend aucun prompt')

console.log(echecs === 0 ? 'Rapports de marché : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
