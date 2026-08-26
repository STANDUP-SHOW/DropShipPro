/**
 * Transforme le classeur de correspondances en référentiel livrable.
 *
 * Le classeur est le travail de fond — 24 rayons AliExpress, 224
 * sous-catégories, leur équivalent Amazon. Il ne part pas en production : ce
 * script en tire un JSON versionné, que le serveur charge sans dépendre d'un
 * fichier posé sur un bureau.
 *
 * À relancer quand le classeur est enrichi :
 *   node build-categories.cjs "chemin/vers/Mapping_Categories.xlsx"
 */
const fs = require('fs')
const zlib = require('zlib')
const path = require('path')

// --- Lecture du classeur, sans dépendance (voir services/xlsx.ts) -----------
function entrees(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('zip illisible')

  let p = buf.readUInt32LE(eocd + 16)
  const nombre = buf.readUInt16LE(eocd + 10)
  const sortie = {}

  for (let n = 0; n < nombre; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const methode = buf.readUInt16LE(p + 10)
    const tailleComp = buf.readUInt32LE(p + 20)
    const longNom = buf.readUInt16LE(p + 28)
    const longExtra = buf.readUInt16LE(p + 30)
    const longComm = buf.readUInt16LE(p + 32)
    const offset = buf.readUInt32LE(p + 42)
    const nom = buf.subarray(p + 46, p + 46 + longNom).toString('utf8')
    const debut = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28)
    try {
      const d = buf.subarray(debut, debut + tailleComp)
      sortie[nom] = methode === 8 ? zlib.inflateRawSync(d) : d
    } catch {}
    p += 46 + longNom + longExtra + longComm
  }
  return sortie
}

const decoder = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&')

function lireFeuille(fichiers, index) {
  const texte = (n) => (fichiers[n] ? fichiers[n].toString('utf8') : '')
  const chaines = []
  for (const m of texte('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    chaines.push(decoder([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
  }
  const noms = Object.keys(fichiers)
    .filter((n) => /worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]))

  const brutes = []
  for (const l of texte(noms[index]).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cellules = {}
    for (const c of l[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const v = c[3].match(/<v>([\s\S]*?)<\/v>/)
      if (!v) continue
      cellules[c[1]] = /t="s"/.test(c[2]) ? (chaines[Number(v[1])] ?? '') : v[1]
    }
    brutes.push(cellules)
  }
  const cols = Object.keys(brutes[0])
  const entetes = cols.map((c) => (brutes[0][c] || '').trim())
  return brutes.slice(1).map((ligne) => {
    const o = {}
    cols.forEach((c, i) => { o[entetes[i]] = (ligne[c] || '').trim() })
    return o
  }).filter((l) => Object.values(l).some(Boolean))
}

// --- Le rattachement aux rayons et aux icônes -------------------------------
/**
 * Chaque rayon AliExpress rejoint un rayon DropShipper, et porte une icône.
 *
 * Le rattachement compte : c'est lui qui décide quel chef de rayon voit quel
 * produit. Les icônes sont des emoji plutôt qu'un jeu d'images — ils s'affichent
 * partout, ne se téléchargent pas, et ne périment pas. Un vrai jeu d'icônes
 * remplacera l'emoji sans toucher au reste : c'est un champ, pas une image en
 * dur dans le code.
 */
const RAYONS = {
  'Automobile': { sector: 'auto-moto', icone: '🚗', google: 'Vehicles & Parts' },
  'Motos et sports motorisés': { sector: 'auto-moto', icone: '🏍️', google: 'Vehicles & Parts' },
  'Appareils électroménagers': { sector: 'electromenager', icone: '🍳', google: 'Home & Garden > Household Appliances' },
  'Vêtements pour femmes': { sector: 'mode-femme', icone: '👗', google: 'Apparel & Accessories > Clothing' },
  'Vêtements pour hommes': { sector: 'mode-homme', icone: '👔', google: 'Apparel & Accessories > Clothing' },
  'Chaussures': { sector: 'mode-homme', icone: '👟', google: 'Apparel & Accessories > Shoes' },
  'Sacs et bagages': { sector: 'mode-femme', icone: '👜', google: 'Luggage & Bags' },
  'Bijoux et accessoires': { sector: 'bijoux-montres', icone: '💍', google: 'Apparel & Accessories > Jewelry' },
  'Extensions de cheveux et perruques': { sector: 'beaute', icone: '💇', google: 'Health & Beauty > Personal Care > Hair Care' },
  'Beauté et santé': { sector: 'beaute', icone: '💄', google: 'Health & Beauty' },
  'Meubles': { sector: 'maison-deco', icone: '🛋️', google: 'Furniture' },
  'Terrasse, pelouse et jardin': { sector: 'jardinage', icone: '🌱', google: 'Home & Garden > Lawn & Garden' },
  'Outils et bricolage': { sector: 'bricolage', icone: '🔧', google: 'Hardware > Tools' },
  'Électronique': { sector: 'high-tech', icone: '💻', google: 'Electronics' },
  'Téléphones portables et accessoires': { sector: 'high-tech', icone: '📱', google: 'Electronics > Communications > Telephony' },
  'Jouets et jeux': { sector: 'jeux-consoles', icone: '🧸', google: 'Toys & Games' },
  'Sports et loisirs de plein air': { sector: 'sport', icone: '🏋️', google: 'Sporting Goods' },
  'Bébé et maternité': { sector: 'bebe', icone: '🍼', google: 'Baby & Toddler' },
  'Fournitures pour animaux de compagnie': { sector: 'animalerie', icone: '🐾', google: 'Animals & Pet Supplies' },
  'Livres et médias': { sector: 'maison-deco', icone: '📚', google: 'Media > Books' },
  'Fournitures de bureau et scolaires': { sector: 'maison-deco', icone: '✏️', google: 'Office Supplies' },
  'Arts, artisanat et couture': { sector: 'maison-deco', icone: '🎨', google: 'Arts & Entertainment > Hobbies & Creative Arts' },
  'Commerce, industrie et science': { sector: 'bricolage', icone: '🏭', google: 'Business & Industrial' },
  'Nouveauté et usage spécial': { sector: 'maison-deco', icone: '✨', google: 'Arts & Entertainment' },
}

/** Un identifiant stable, lisible, et qui ne bouge pas si le libellé change. */
function slug(texte) {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

const source = process.argv[2] ||
  'C:/Users/maxma/Downloads/CLAUDE-CODE-INFORMATIONS/Mapping_Categories_AliExpress_Amazon.xlsx'

const fichiers = entrees(fs.readFileSync(source))
const mapping = lireFeuille(fichiers, 1)

const A1 = 'Catégorie AliExpress (niveau 1)'
const A2 = 'Sous-catégorie AliExpress (niveau 2)'
const Z1 = 'Catégorie / Département Amazon (niveau 1)'
const Z2 = 'Rayon Amazon correspondant (niveau 2-3)'
const NOTE = 'Notes'

const categories = []
const alias = []
const vus = new Set()
const inconnus = new Set()

for (const ligne of mapping) {
  const n1 = ligne[A1]
  const n2 = ligne[A2]
  if (!n1 || !n2) continue

  const rayon = RAYONS[n1]
  if (!rayon) { inconnus.add(n1); continue }

  const idParent = slug(n1)
  if (!vus.has(idParent)) {
    vus.add(idParent)
    categories.push({
      id: idParent,
      parentId: null,
      sector: rayon.sector,
      label: n1,
      path: n1,
      google: rayon.google,
      icone: rayon.icone,
      targets: { AMAZON: ligne[Z1] || null },
    })
    // Le nom du rayon lui-même est un alias : un fournisseur qui n'annonce que
    // « Automobile » doit tomber sur la catégorie mère plutôt que sur rien.
    alias.push({ key: slug(n1), categoryId: idParent, source: 'seed' })
  }

  const id = `${idParent}-${slug(n2)}`.slice(0, 80)
  if (vus.has(id)) continue
  vus.add(id)

  categories.push({
    id,
    parentId: idParent,
    sector: rayon.sector,
    label: n2,
    path: `${n1} > ${n2}`,
    google: rayon.google,
    icone: null,
    targets: { AMAZON: [ligne[Z1], ligne[Z2]].filter(Boolean).join(' > ') || null },
    note: ligne[NOTE] || null,
  })

  // Les alias de départ : le libellé AliExpress, le chemin complet, et les
  // exemples cités en note. Ce sont autant d'appels au modèle évités au premier
  // import — et la note est souvent ce qu'un fournisseur écrit vraiment
  // (« dashcam » plutôt que « Systèmes de conduite intelligents »).
  const cles = new Set([slug(n2), slug(`${n1} ${n2}`)])
  for (const mot of (ligne[NOTE] || '').split(/[,;•]/)) {
    const propre = mot.trim()
    if (propre.length >= 4) cles.add(slug(propre))
  }
  for (const cle of cles) {
    if (cle) alias.push({ key: cle, categoryId: id, source: 'seed' })
  }
}

// Un alias par clé : la première l'emporte, et la sous-catégorie passe avant le
// rayon puisqu'elle est plus précise.
const uniques = []
const clesVues = new Set()
for (const a of alias) {
  if (clesVues.has(a.key)) continue
  clesVues.add(a.key)
  uniques.push(a)
}

const sortie = { categories, alias: uniques }
const cible = path.join(__dirname, 'src/services/categorySeed.json')
fs.writeFileSync(cible, JSON.stringify(sortie, null, 1), 'utf8')

console.log(`${categories.filter((c) => !c.parentId).length} rayons`)
console.log(`${categories.filter((c) => c.parentId).length} sous-categories`)
console.log(`${uniques.length} alias de depart`)
if (inconnus.size) console.log(`RAYONS NON RATTACHES : ${[...inconnus].join(', ')}`)
console.log(`ecrit dans ${cible}`)
