/**
 * Fabrique la bibliotheque de themes a partir des donnees de `ui-ux-pro-max`.
 *
 * A relancer quand les CSV changent :
 *
 *   cd backend && node build-themes.cjs
 *
 * ## Pourquoi lire les CSV et pas appeler la skill
 *
 * Son script de recherche est en Python, absent de la machine. Mais sa valeur
 * n est pas dans le script : elle est dans les donnees. Et pour batir une
 * bibliotheque il faut **tout** lire, pas les dix meilleurs resultats d une
 * recherche floue.
 *
 * ## Ce qu on en tire, et ce qu on n en tire pas
 *
 * Les 192 palettes sont deja ecrites en **jetons semantiques** -- `primary`,
 * `on-primary`, `background`, `foreground`, `card`, `muted`, `border` -- ce qui
 * est exactement le contrat dont une boutique a besoin. Plusieurs portent la
 * mention « adjusted for WCAG » : le travail fastidieux est fait.
 *
 * Ce qu on n en tire pas : le produit cartesien. 192 palettes x 74 appariements
 * de polices font 14 208 combinaisons, dont la quasi-totalite serait laide. Une
 * bibliotheque de themes est une **selection**, pas une multiplication. Les
 * themes sont donc appari*es a la main, plus bas, et le generateur ne fera
 * varier une palette qu a l interieur de la famille du theme.
 */

const fs = require('fs')
const path = require('path')

const DONNEES = path.resolve('..', '.claude', 'skills', 'ui-ux-pro-max', 'data')
const SORTIE = path.resolve('src', 'services', 'themeSeed.json')

// --- Lecture des CSV --------------------------------------------------------

/**
 * Un lecteur de CSV qui tient les guillemets.
 *
 * `split(',')` couperait au milieu de « Luxury brands, fashion, spa » -- et la
 * colonne « Best For » en est pleine. Une ligne mal coupee decale toutes les
 * suivantes, et la palette se retrouve avec une police en guise de couleur.
 */
function lireCsv(fichier) {
  const texte = fs.readFileSync(path.join(DONNEES, fichier), 'utf8')
  const lignes = []
  let champ = ''
  let ligne = []
  let entreGuillemets = false

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (entreGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champ += '"'
          i++
        } else entreGuillemets = false
      } else champ += c
    } else if (c === '"') entreGuillemets = true
    else if (c === ',') {
      ligne.push(champ)
      champ = ''
    } else if (c === '\n') {
      ligne.push(champ)
      lignes.push(ligne)
      ligne = []
      champ = ''
    } else if (c !== '\r') champ += c
  }
  if (champ || ligne.length) {
    ligne.push(champ)
    lignes.push(ligne)
  }

  const entetes = lignes.shift()
  return lignes
    .filter((l) => l.some((v) => v.trim()))
    .map((l) => Object.fromEntries(entetes.map((h, i) => [h.trim(), (l[i] ?? '').trim()])))
}

// --- Le contraste, qui decide de tout ---------------------------------------

/**
 * Le rapport de contraste WCAG entre deux couleurs.
 *
 * C est le seul controle qui peut vraiment echouer ici, et c est pour ca qu il
 * existe. Une palette jolie mais illisible traverse toutes les relectures
 * humaines : personne ne mesure du gris sur du blanc a l oeil. Le texte d une
 * boutique doit tenir 4,5:1, sinon ce sont les prix qu on ne lit pas.
 */
function canal(v) {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/**
 * Une couleur translucide, aplatie sur son fond.
 *
 * Plusieurs palettes sombres ecrivent leur bordure `rgba(255,255,255,0.08)`, et
 * c est un idiome juste : un blanc a 8 % sur du bleu nuit donne une separation
 * discrete que le navigateur compose tres bien. Mais on ne peut pas **mesurer**
 * une couleur translucide -- son contraste depend de ce qu il y a dessous.
 *
 * Sans cette fonction, ces bordures ne renvoyaient aucune luminance, la regle
 * les sautait en silence, et le banc les comptait en echec. Elles n etaient ni
 * corrigees ni signalees : le pire des deux mondes.
 */
function aplatir(couleur, fond) {
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(couleur.trim())
  if (!m) return couleur
  const alpha = m[4] === undefined ? 1 : Number(m[4])
  const dessous = versRgb(fond)
  const dessus = [Number(m[1]), Number(m[2]), Number(m[3])]
  return versHex(dessus.map((v, i) => v * alpha + dessous[i] * (1 - alpha)))
}

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return (
    0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
  )
}

function contraste(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  if (la === null || lb === null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// --- Normalisation ----------------------------------------------------------

const JETONS = {
  primary: 'Primary',
  onPrimary: 'On Primary',
  secondary: 'Secondary',
  onSecondary: 'On Secondary',
  accent: 'Accent',
  onAccent: 'On Accent',
  background: 'Background',
  foreground: 'Foreground',
  card: 'Card',
  cardForeground: 'Card Foreground',
  muted: 'Muted',
  mutedForeground: 'Muted Foreground',
  border: 'Border',
  destructive: 'Destructive',
  onDestructive: 'On Destructive',
  ring: 'Ring',
}

/**
 * Les corrections de lisibilite, ecrites une par une avec leur raison.
 *
 * Le banc `check-themes.ts` a trouve onze paires sous le seuil WCAG parmi les
 * themes retenus. Elles se ramenent a trois causes, et **aucune ne se corrige
 * en abaissant le seuil** : un prix qu on ne lit pas ne se plaint pas, il ne se
 * vend pas.
 *
 * Corriger ici plutot que dans le CSV est deliberé : le CSV est une source
 * qu on remplace quand la skill est mise a jour, et une correction faite dedans
 * serait perdue au premier remplacement. Ce tableau, lui, survit -- et il se
 * lit, ce qu une valeur changee en douce dans un fichier de donnees ne fait
 * pas. C est d ailleurs ce que la source fait deja pour elle-meme : plusieurs
 * palettes portent la mention « Accent adjusted for WCAG 3:1 ».
 */
const CORRECTIONS = [
  {
    // Blanc sur red-500 fait 3,76. Les 191 autres palettes utilisent deja
    // red-600, qui fait 4,83 : c est un oubli de la source, pas un choix. On le
    // remplace par la valeur voisine plutot que de le laisser au calcul, qui
    // arriverait a un rouge sans parente avec celui des autres palettes.
    jeton: 'destructive',
    de: '#EF4444',
    vers: '#DC2626',
    pourquoi: 'le texte blanc du bouton de suppression faisait 3,76:1 au lieu de 4,5:1',
  },
]

// --- Les deux ajustements qui se calculent ---------------------------------

function versRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function versHex([r, v, b]) {
  const c = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(v)}${c(b)}`.toUpperCase()
}

/**
 * Pousse une couleur vers le noir ou vers le blanc jusqu a atteindre un contraste.
 *
 * Une regle plutot qu une retouche palette par palette, et c est le point : la
 * bibliotheque n expose que vingt et un themes, mais le generateur puisera dans
 * les 192 palettes. Corriger a la main les trois qui echouent aujourd hui
 * laisserait les cent soixante-douze autres se casser le jour ou on s en sert.
 *
 * Le deplacement est proportionnel, pas absolu : une couleur pastel garde sa
 * teinte, elle est seulement assez foncee pour se voir.
 */
function ajusterPourContraste(couleur, fond, cible) {
  const depart = aplatir(couleur, fond)
  if (luminance(fond) === null || luminance(depart) === null) return couleur

  /*
   * Les deux sens sont essayes, et c est necessaire.
   *
   * La premiere version ne foncait que sur fond clair et n eclaircissait que
   * sur fond sombre. Sur un fond gris moyen -- une palette le fait -- aucune
   * des deux directions n est evidente : le texte secondaire poussé vers le
   * blanc plafonnait a 3,43:1 alors que le noir atteignait 5,9:1 sans effort.
   * L heuristique se trompait, et elle se trompait en silence.
   *
   * On garde donc celui qui atteint la cible en bougeant le moins : la teinte
   * d origine est ce qu on cherche a preserver.
   */
  const essai = (versLeNoir) => {
    let rgb = versRgb(depart)
    for (let pas = 0; pas <= 40; pas++) {
      const c = contraste(versHex(rgb), fond)
      if (c !== null && c >= cible) return { hex: versHex(rgb), pas }
      rgb = versLeNoir ? rgb.map((v) => v * 0.94) : rgb.map((v) => v + (255 - v) * 0.06)
    }
    return null
  }

  const sombre = essai(true)
  const clair = essai(false)
  if (!sombre && !clair) return depart
  if (!sombre) return clair.hex
  if (!clair) return sombre.hex
  return sombre.pas <= clair.pas ? sombre.hex : clair.hex
}

/**
 * Les paires qui doivent tenir, et **quel cote on a le droit de bouger**.
 *
 * C est la colonne `ajuste` qui compte. Sur un bouton, le libelle est blanc ou
 * noir : on ne le touche pas, on fonce la surface. Sur une page, c est
 * l inverse -- le fond porte la marque, c est le texte qui s adapte.
 *
 * **Ce tableau existe parce que le banc a pris mes premieres corrections en
 * defaut.** J avais retouche a la main les deux palettes qui echouaient parmi
 * les vingt et une en service ; le banc a mesure les 172 autres et en a trouve
 * cinquante-deux qui tombaient sur exactement la meme paire. Corriger ce qu on
 * a regarde n est pas corriger.
 */
const REGLES = [
  { avant: 'foreground', arriere: 'background', seuil: 4.5, ajuste: 'avant', quoi: 'le texte de la page' },
  { avant: 'cardForeground', arriere: 'card', seuil: 4.5, ajuste: 'avant', quoi: 'le texte des cartes' },
  { avant: 'mutedForeground', arriere: 'background', seuil: 4.5, ajuste: 'avant', quoi: 'les mentions secondaires' },
  { avant: 'onPrimary', arriere: 'primary', seuil: 4.5, ajuste: 'arriere', quoi: 'le bouton principal' },
  { avant: 'onSecondary', arriere: 'secondary', seuil: 4.5, ajuste: 'arriere', quoi: 'le bouton secondaire' },
  { avant: 'onAccent', arriere: 'accent', seuil: 3, ajuste: 'arriere', quoi: "l accent" },
  { avant: 'onDestructive', arriere: 'destructive', seuil: 4.5, ajuste: 'arriere', quoi: 'le bouton de suppression' },
  // Un anneau de focus invisible rend la boutique impraticable au clavier, et
  // **ca ne se voit jamais** en la regardant a la souris.
  { avant: 'ring', arriere: 'background', seuil: 3, ajuste: 'avant', quoi: "l anneau de focus" },
  // La bordure doit seulement se voir. Exiger 3:1 la rendrait presque noire
  // partout -- et produirait un controle qu on finit par desactiver.
  { avant: 'border', arriere: 'background', seuil: 1.25, ajuste: 'avant', quoi: 'les bordures' },
]

function palettes() {
  return lireCsv('colors.csv').map((r) => {
    const couleurs = {}
    for (const [cle, colonne] of Object.entries(JETONS)) couleurs[cle] = r[colonne]

    const corrigees = []
    for (const c of CORRECTIONS) {
      if ((couleurs[c.jeton] || '').toUpperCase() === c.de) {
        couleurs[c.jeton] = c.vers
        corrigees.push(`${c.jeton} : ${c.de} -> ${c.vers} (${c.pourquoi})`)
      }
    }

    /*
     * L anneau de focus prend l accent avant d etre recalcule.
     *
     * Sur les palettes sombres il vaut souvent la couleur principale, qui y est
     * une surface : il se confond alors avec le fond. L accent appartient a la
     * marque et se voit deja ; le calcul n intervient que s il ne suffit pas.
     */
    if ((contraste(couleurs.ring, couleurs.background) ?? 99) < 3) {
      if ((contraste(couleurs.accent, couleurs.background) ?? 0) >= 3) {
        corrigees.push(`ring : ${couleurs.ring} -> ${couleurs.accent} (repris sur l accent, qui se voit)`)
        couleurs.ring = couleurs.accent
      }
    }

    // Les valeurs translucides sont aplaties une fois pour toutes : une bordure
    // en rgba ne se mesure pas, et la sauter revenait a ne pas la corriger.
    for (const cle of ['border', 'ring', 'muted']) {
      const aplatie = aplatir(couleurs[cle], couleurs.background)
      if (aplatie !== couleurs[cle]) {
        corrigees.push(`${cle} : ${couleurs[cle]} -> ${aplatie} (aplatie sur le fond pour etre mesurable)`)
        couleurs[cle] = aplatie
      }
    }

    for (const regle of REGLES) {
      const cle = regle.ajuste === 'avant' ? regle.avant : regle.arriere
      const fixe = regle.ajuste === 'avant' ? regle.arriere : regle.avant
      const avant = couleurs[cle]
      if ((contraste(couleurs[regle.avant], couleurs[regle.arriere]) ?? 99) >= regle.seuil) continue

      couleurs[cle] = ajusterPourContraste(avant, couleurs[fixe], regle.seuil)
      const obtenu = contraste(couleurs[regle.avant], couleurs[regle.arriere])
      corrigees.push(
        `${cle} : ${avant} -> ${couleurs[cle]} (${regle.quoi}, ${obtenu ? obtenu.toFixed(2) : '?'}:1)`,
      )
    }

    return {
      id: Number(r.No),
      nom: r['Product Type'],
      note: r.Notes || null,
      couleurs,
      // Gardees dans la palette : le jour ou une couleur surprend, la raison
      // est a cote d elle plutot que dans l historique de git.
      corrections: corrigees.length ? corrigees : undefined,
    }
  })
}

/**
 * Les appariements de polices, avec les familles a auto-heberger.
 *
 * **L URL Google Fonts du CSV n est gardee que comme reference.** Une boutique
 * francaise qui charge sa police depuis `fonts.googleapis.com` envoie l adresse
 * IP de chaque visiteur aux Etats-Unis -- ce qu un tribunal allemand a
 * sanctionne, et ce serait notre responsabilite, pas celle du vendeur. Les
 * fichiers seront servis depuis chez nous ; ce champ dit seulement ou aller les
 * chercher une fois.
 */
function typographies() {
  return lireCsv('typography.csv').map((r) => ({
    id: Number(r.No),
    nom: r['Font Pairing Name'],
    titre: r['Heading Font'],
    texte: r['Body Font'],
    ambiance: (r['Mood/Style Keywords'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    faitPour: r['Best For'] || null,
    sourceGoogle: r['Google Fonts URL'] || null,
  }))
}

// --- Les structures ---------------------------------------------------------

/**
 * Les mises en page. La partie chere, donc peu nombreuse.
 *
 * Une structure est du code : une disposition, des blocs, un comportement.
 * Chacune coute des jours. Les habillages, eux, sont des donnees et ne coutent
 * rien -- c est ce qui permet d avoir une grande bibliotheque sans avoir une
 * grande dette.
 *
 * `photos` n est pas un detail decoratif. Une vitrine de dropshipping affiche
 * des images ramassees chez vingt fournisseurs : fonds blancs, fonds de studio,
 * captures de telephone, formats incoherents. Une structure qui suppose de
 * beaux visuels carres se disloque dessus. Chaque structure impose donc son
 * rapport d image et son recadrage.
 */
const STRUCTURES = [
  {
    id: 'vitrine',
    nom: 'Vitrine',
    pour: 'Peu de produits, mis en scene. Mode, bijoux, artisanat, parfums.',
    photos: { rapport: '4/5', recadrage: 'cover', fond: 'muted' },
    blocs: ['banniere', 'mise-en-avant', 'grille-aeree', 'a-propos', 'pied'],
  },
  {
    id: 'catalogue',
    nom: 'Catalogue',
    pour: 'Beaucoup de references. High-tech, pieces, accessoires.',
    photos: { rapport: '1/1', recadrage: 'contain', fond: 'card' },
    blocs: ['barre-recherche', 'filtres-rayons', 'grille-dense', 'pagination', 'pied'],
  },
  {
    id: 'rayons',
    nom: 'Marche par rayons',
    pour: 'Assortiment large et varie, ou la categorie guide plus que le produit.',
    photos: { rapport: '4/3', recadrage: 'cover', fond: 'muted' },
    blocs: ['banniere', 'tuiles-rayons', 'nouveautes', 'grille-par-rayon', 'pied'],
  },
  {
    id: 'mono',
    nom: 'Produit unique',
    pour: 'Un seul produit, ou une gamme tres courte. Page de vente.',
    photos: { rapport: '3/2', recadrage: 'cover', fond: 'background' },
    blocs: ['accroche', 'preuve', 'arguments', 'objections', 'achat', 'pied'],
  },
  {
    id: 'configurateur',
    nom: 'Configurateur',
    pour: 'Le prix depend des options, de la quantite et du delai. Imprimerie, sur-mesure.',
    photos: { rapport: '4/3', recadrage: 'cover', fond: 'muted' },
    blocs: ['banniere', 'grille-produits', 'fiche-configurateur', 'pied'],
  },
  {
    id: 'liste',
    nom: 'Liste sobre',
    pour: 'Gros catalogue professionnel, ou la reference et le prix comptent plus que l image.',
    photos: { rapport: '1/1', recadrage: 'contain', fond: 'card' },
    blocs: ['barre-recherche', 'tableau', 'fiche-laterale', 'pied'],
  },
  {
    id: 'magazine',
    nom: 'Magazine',
    pour: 'Le contenu vend le produit. Marques a histoire, niches.',
    photos: { rapport: '16/9', recadrage: 'cover', fond: 'muted' },
    blocs: ['une', 'article-mis-en-avant', 'produits-lies', 'grille-aeree', 'pied'],
  },
]

// --- Les themes, apparies a la main -----------------------------------------

/**
 * Structure + palette + polices, et un nom que le vendeur comprend.
 *
 * Chaque ligne a ete choisie, pas tiree au sort. `secteurs` sert au generateur :
 * c est ce qui lui permet de proposer trois themes plausibles a partir de ce
 * que le vendeur dit de son commerce, au lieu de cinquante-six.
 */
const THEMES = [
  // --- Vitrine -------------------------------------------------------------
  { id: 'onyx', nom: 'Onyx', structure: 'vitrine', palette: 4, typo: 12, secteurs: ['mode', 'bijoux', 'montres', 'maroquinerie'] },
  { id: 'poudre', nom: 'Poudre', structure: 'vitrine', palette: 32, typo: 1, secteurs: ['beaute', 'parfums', 'soins'] },
  { id: 'atelier', nom: 'Atelier', structure: 'vitrine', palette: 76, typo: 50, secteurs: ['artisanat', 'art', 'decoration'] },
  { id: 'lin', nom: 'Lin', structure: 'vitrine', palette: 63, typo: 8, secteurs: ['epicerie', 'bien-etre', 'maison'] },

  // --- Catalogue -----------------------------------------------------------
  { id: 'circuit', nom: 'Circuit', structure: 'catalogue', palette: 24, typo: 3, secteurs: ['high-tech', 'informatique', 'domotique'] },
  { id: 'comptoir', nom: 'Comptoir', structure: 'catalogue', palette: 3, typo: 40, secteurs: ['generaliste', 'accessoires', 'bazar'] },
  { id: 'piste', nom: 'Piste', structure: 'catalogue', palette: 35, typo: 49, secteurs: ['sport', 'fitness', 'plein-air'] },
  { id: 'garage', nom: 'Garage', structure: 'catalogue', palette: 52, typo: 11, secteurs: ['auto', 'moto', 'outillage'] },

  // --- Rayons --------------------------------------------------------------
  { id: 'halles', nom: 'Halles', structure: 'rayons', palette: 48, typo: 2, secteurs: ['generaliste', 'marketplace', 'multi-rayons'] },
  { id: 'serre', nom: 'Serre', structure: 'rayons', palette: 62, typo: 19, secteurs: ['jardin', 'plantes', 'animalerie'] },
  { id: 'pastel', nom: 'Pastel', structure: 'rayons', palette: 152, typo: 45, secteurs: ['enfant', 'jouets', 'puericulture'] },

  // --- Produit unique ------------------------------------------------------
  { id: 'affiche', nom: 'Affiche', structure: 'mono', palette: 33, typo: 7, secteurs: ['produit-phare', 'lancement'] },
  { id: 'preuve', nom: 'Preuve', structure: 'mono', palette: 1, typo: 16, secteurs: ['high-tech', 'sante', 'abonnement'] },
  { id: 'neon', nom: 'Neon', structure: 'mono', palette: 12, typo: 37, secteurs: ['gaming', 'informatique', 'jeune'] },

  // --- Configurateur -------------------------------------------------------
  { id: 'presse', nom: 'Presse', structure: 'configurateur', palette: 67, typo: 35, secteurs: ['imprimerie', 'papeterie', 'signaletique'] },
  { id: 'etabli', nom: 'Etabli', structure: 'configurateur', palette: 51, typo: 11, secteurs: ['sur-mesure', 'menuiserie', 'metal'] },

  // --- Liste sobre ---------------------------------------------------------
  { id: 'registre', nom: 'Registre', structure: 'liste', palette: 5, typo: 31, secteurs: ['b2b', 'pieces', 'fournitures'] },
  { id: 'officine', nom: 'Officine', structure: 'liste', palette: 59, typo: 30, secteurs: ['parapharmacie', 'sante', 'hygiene'] },

  // --- Magazine ------------------------------------------------------------
  { id: 'chronique', nom: 'Chronique', structure: 'magazine', palette: 67, typo: 14, secteurs: ['niche', 'marque', 'contenu'] },
  { id: 'cave', nom: 'Cave', structure: 'magazine', palette: 64, typo: 4, secteurs: ['vin', 'spiritueux', 'epicerie-fine'] },
  { id: 'dressing', nom: 'Dressing', structure: 'magazine', palette: 133, typo: 18, secteurs: ['mode', 'tendance', 'seconde-main'] },
]

// --- Fabrication ------------------------------------------------------------

function fabriquer() {
  const lesPalettes = palettes()
  const lesTypos = typographies()
  const parId = new Map(lesPalettes.map((p) => [p.id, p]))
  const typoParId = new Map(lesTypos.map((t) => [t.id, t]))
  const structureParId = new Map(STRUCTURES.map((s) => [s.id, s]))

  const erreurs = []

  for (const t of THEMES) {
    if (!structureParId.has(t.structure)) erreurs.push(`${t.id} : structure « ${t.structure} » inconnue`)
    if (!parId.has(t.palette)) erreurs.push(`${t.id} : palette ${t.palette} inconnue`)
    if (!typoParId.has(t.typo)) erreurs.push(`${t.id} : appariement de polices ${t.typo} inconnu`)
  }

  if (erreurs.length) {
    console.error(erreurs.join('\n'))
    process.exit(1)
  }

  return {
    version: 1,
    structures: STRUCTURES,
    palettes: lesPalettes,
    typographies: lesTypos,
    themes: THEMES,
  }
}

const bibliotheque = fabriquer()
fs.writeFileSync(SORTIE, JSON.stringify(bibliotheque, null, 2))

console.log(`${bibliotheque.palettes.length} palettes`)
console.log(`${bibliotheque.typographies.length} appariements de polices`)
console.log(`${bibliotheque.structures.length} structures`)
console.log(`${bibliotheque.themes.length} themes apparies`)
console.log(`ecrit dans ${path.relative(process.cwd(), SORTIE)}`)

module.exports = { contraste, luminance }
