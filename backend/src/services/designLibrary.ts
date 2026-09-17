import fs from 'node:fs'
import path from 'node:path'

/**
 * La bibliothèque de design branchée au générateur de boutiques (17/09/2026).
 *
 * Max : « voir si connexions possibles avec bibliothèques de designs ». La
 * skill `ui-ux-pro-max` du projet en est une : 67 styles (recette, effets,
 * variables), 161 palettes par type de commerce, 57 appariements de polices
 * Google, 34 patrons de page d'accueil, les règles de mouvement et le
 * raisonnement par catégorie. Son moteur de recherche est en Python — que
 * Railway n'a pas — mais sa valeur est dans ses CSV, lisibles ici en Node
 * (même raisonnement que `build-themes.cjs` pour les thèmes).
 *
 * Ce que ça change pour le modèle : au lieu de partir de sa seule mémoire, il
 * reçoit un DOSSIER — trois styles qui conviennent à ce commerce avec leur
 * recette, quatre appariements de polices, trois palettes, un patron de page,
 * les règles de mouvement — sélectionnés par les mots du brief. C'est une
 * inspiration, pas un gabarit : la consigne lui dit de choisir, d'adapter et
 * de ne jamais recopier. « Design libre illimité », mais informé.
 *
 * Le brief est en français, les CSV en anglais : un glossaire commerce
 * FR→EN traduit les mots utiles avant la recherche. Score BM25 simplifié
 * (comme `core.py` de la skill), déterministe — le banc le rejoue sans modèle.
 */

const DOSSIER = ['dropshop/design', '../dropshop/design'].map((d) => path.resolve(d)).find((d) => fs.existsSync(d)) ?? path.resolve('dropshop/design')

/** Un lecteur CSV qui tient les guillemets, les virgules et les retours à la ligne cités. */
export function lireCsv(texte: string): Record<string, string>[] {
  const lignes: string[][] = []
  let champ = ''
  let ligne: string[] = []
  let entreGuillemets = false
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++ }
      else if (c === '"') entreGuillemets = false
      else champ += c
    } else if (c === '"') entreGuillemets = true
    else if (c === ',') { ligne.push(champ); champ = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++
      ligne.push(champ); champ = ''
      if (ligne.some((v) => v.trim())) lignes.push(ligne)
      ligne = []
    } else champ += c
  }
  if (champ || ligne.length) { ligne.push(champ); if (ligne.some((v) => v.trim())) lignes.push(ligne) }
  const entetes = lignes[0] ?? []
  return lignes.slice(1).map((l) => Object.fromEntries(entetes.map((e, j) => [e.trim(), (l[j] ?? '').trim()])))
}

const cache = new Map<string, Record<string, string>[]>()
function table(nom: string): Record<string, string>[] {
  const deja = cache.get(nom)
  if (deja) return deja
  const chemin = path.join(DOSSIER, `${nom}.csv`)
  const rows = fs.existsSync(chemin) ? lireCsv(fs.readFileSync(chemin, 'utf8')) : []
  cache.set(nom, rows)
  return rows
}

/* ---------- Le glossaire commerce FR → EN ---------- */

const GLOSSAIRE: Array<[RegExp, string]> = [
  [/\bmontres?\b|horlog/i, 'watch watches luxury timeless'],
  [/\bbijou/i, 'jewelry jewellery luxury elegant'],
  [/\bmode\b|v[êe]tement|pr[êe]t-[àa]-porter|fashion/i, 'fashion apparel clothing'],
  [/\bchaussure|sneaker|basket/i, 'shoes sneakers footwear fashion'],
  [/\bsac|maroquin/i, 'bags leather goods fashion'],
  [/\bbeaut|cosm[ée]t|parfum|soin/i, 'beauty cosmetics skincare spa'],
  [/\bsant[ée]|bien-?[êe]tre|m[ée]dita/i, 'health wellness meditation'],
  [/\bsport|fitness|muscu|yoga|running/i, 'sports fitness athletic'],
  [/\bmaison|d[ée]co|meuble|mobilier|int[ée]rieur/i, 'home decor furniture interior'],
  [/\bcuisine|table|ustensile|gastro/i, 'kitchen cooking food'],
  [/\bjardin|plante|fleur|botani/i, 'garden plants botanical nature'],
  [/\bbricol|outil|atelier/i, 'tools hardware workshop'],
  [/\bhigh-?tech|tech|informati|ordinateur|gadget|[ée]lectroni/i, 'technology tech electronics gadgets'],
  [/\brobot|drone|ia\b|intelligence artificielle|futur/i, 'robotics ai technology futuristic'],
  [/\bt[ée]l[ée]phon|smartphone|mobile/i, 'smartphone mobile electronics'],
  [/\bauto|voiture|moto|v[ée]lo/i, 'automotive car motorcycle bike'],
  [/\bb[ée]b[ée]|enfant|jouet|jeu/i, 'kids baby toys games playful'],
  [/\banimau|chien|chat\b|animal/i, 'pets animals'],
  [/\bvoyage|plein air|camping|randonn/i, 'travel outdoor adventure camping'],
  [/\bloisir|cr[ée]atif|artisan|fait main/i, 'crafts handmade artisan hobby'],
  [/\blivre|papeterie|[ée]ducation/i, 'books stationery education'],
  [/\bcaf[ée]|th[ée]\b|vin|[ée]picerie|bio/i, 'coffee tea wine organic grocery'],
  [/\bluxe|haut de gamme|premium|prestige/i, 'luxury premium high-end elegant'],
  [/\b[ée]l[ée]gan|chic|raffin/i, 'elegant sophisticated refined'],
  [/\bsombre|noir|nuit/i, 'dark moody'],
  [/\bclair|lumineux|blanc/i, 'light bright clean'],
  [/\bchaleureux|chaud|cosy|douillet/i, 'warm cozy'],
  [/\bminimal|[ée]pur|simple|sobre/i, 'minimal minimalism clean simple'],
  [/\bnature|bois|organique|terre/i, 'natural organic wood earthy'],
  [/\bvintage|r[ée]tro|ancien/i, 'vintage retro nostalgic'],
  [/\bmoderne|contemporain/i, 'modern contemporary'],
  [/\bjeune|fun|color|vif|pop\b/i, 'playful vibrant colorful bold'],
  [/\bexpert|technique|pro\b|professionnel|s[ée]rieux/i, 'professional technical expert trust'],
  [/\bimmersi|anim|mouvement|dynami/i, 'motion-driven animated immersive dynamic'],
  [/\bverre|glass|transparen/i, 'glassmorphism glass'],
  [/\bbrut|industriel|b[ée]ton|m[ée]tal/i, 'brutalism industrial metal raw'],
  [/\bfemme|f[ée]minin/i, 'women feminine'],
  [/\bhomme|masculin/i, 'men masculine'],
]

export function motsAnglais(texte: string): string[] {
  const mots = new Set<string>()
  for (const [re, en] of GLOSSAIRE) if (re.test(texte)) en.split(' ').forEach((m) => mots.add(m))
  // Les mots déjà anglais ou internationaux passent tels quels.
  texte.toLowerCase().split(/[^a-z0-9-]+/).filter((m) => m.length >= 4).forEach((m) => mots.add(m))
  return [...mots]
}

/* ---------- Un BM25 de poche ---------- */

function jetons(texte: string): string[] {
  return texte.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((m) => m.length >= 3)
}

function classer(rows: Record<string, string>[], colonnes: string[], requete: string[], n: number): Record<string, string>[] {
  const docs = rows.map((r) => jetons(colonnes.map((c) => r[c] ?? '').join(' ')))
  const N = docs.length || 1
  const moyenne = docs.reduce((s, d) => s + d.length, 0) / N || 1
  const df = new Map<string, number>()
  docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)))
  const k1 = 1.5
  const b = 0.75
  const q = requete.map((m) => jetons(m)).flat()
  const scores = docs.map((d, i) => {
    let score = 0
    const tf = new Map<string, number>()
    d.forEach((t) => tf.set(t, (tf.get(t) ?? 0) + 1))
    for (const terme of q) {
      const f = tf.get(terme) ?? 0
      if (!f) continue
      const idf = Math.log(1 + (N - (df.get(terme) ?? 0) + 0.5) / ((df.get(terme) ?? 0) + 0.5))
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.length / moyenne))
    }
    return { i, score }
  })
  return scores.filter((s) => s.score > 0).sort((a, c) => c.score - a.score).slice(0, n).map((s) => rows[s.i])
}

/* ---------- Le dossier ---------- */

export interface DossierDesign {
  produit: { type: string; styles: string; patron: string; palette: string; conseils: string } | null
  styles: Array<{ nom: string; motsCles: string; couleurs: string; effets: string; recette: string; variables: string; eviter: string }>
  polices: Array<{ nom: string; titre: string; texte: string; ambiance: string; url: string }>
  palettes: Array<{ type: string; jetons: Record<string, string>; note: string }>
  patron: { nom: string; sections: string; effets: string; couleurs: string } | null
  mouvement: Array<{ categorie: string; intensite: string; duree: string; faire: string; eviter: string }>
  raisonnement: { patron: string; styles: string; couleur: string; typo: string; effets: string; antiPatrons: string } | null
}

/** Sélectionne dans la bibliothèque ce qui convient à ce brief et ces rayons. */
export function dossierDesignPour(brief: string, categories: string[] = []): DossierDesign {
  const requete = motsAnglais([brief, ...categories].join(' '))
  // Le type de commerce se cherche avec les seuls mots du glossaire : les mots
  // bruts du brief (« humanoïdes », « laboratoire ») tirent vers des types
  // sans rapport, alors que « robotics technology electronics » suffit.
  // Et c'est toujours une boutique en ligne : la bibliothèque, pensée pour des
  // applications, rangerait sinon un vendeur de drones chez « Drone Fleet Manager ».
  const requeteProduit = [...motsAnglais([brief, ...categories].join(' ')).filter((m) => GLOSSAIRE.some(([, en]) => en.split(' ').includes(m))), 'ecommerce', 'shop', 'store', 'online', 'products']
  const produits = classer(table('products'), ['Product Type', 'Keywords'], requeteProduit, 1)
  const p = produits[0]
  const requeteStyles = [...requete, ...(p ? jetons(p['Primary Style Recommendation'] + ' ' + p['Secondary Styles']) : [])]
  const styles = classer(table('styles'), ['Style Category', 'Keywords', 'Best For', 'AI Prompt Keywords'], requeteStyles, 3)
  const polices = classer(table('typography'), ['Font Pairing Name', 'Mood/Style Keywords', 'Best For'], requete, 4)
  const palettes = classer(table('colors'), ['Product Type', 'Notes'], [...requete, ...(p ? jetons(p['Product Type']) : [])], 3)
  const patron = p ? classer(table('landing'), ['Pattern Name', 'Keywords'], jetons(p['Landing Page Pattern']), 1)[0] ?? null : null
  const mouvement = table('motion').filter((m) => /hover|scroll|reveal|hero|page/i.test(m['Category'] + ' ' + m['Keywords'])).slice(0, 5)
  const raison = p ? table('ui-reasoning').find((r) => r['UI_Category'] === p['Product Type']) ?? null : null
  return {
    produit: p ? { type: p['Product Type'], styles: `${p['Primary Style Recommendation']} ; ${p['Secondary Styles']}`, patron: p['Landing Page Pattern'], palette: p['Color Palette Focus'], conseils: p['Key Considerations'] } : null,
    styles: styles.map((s) => ({ nom: s['Style Category'], motsCles: s['Keywords'], couleurs: `${s['Primary Colors']} / ${s['Secondary Colors']}`, effets: s['Effects & Animation'], recette: s['Implementation Checklist'], variables: s['Design System Variables'], eviter: s['Do Not Use For'] })),
    polices: polices.map((t) => ({ nom: t['Font Pairing Name'], titre: t['Heading Font'], texte: t['Body Font'], ambiance: t['Mood/Style Keywords'], url: t['Google Fonts URL'] })),
    palettes: palettes.map((c) => ({
      type: c['Product Type'],
      jetons: { primary: c['Primary'], accent: c['Accent'], background: c['Background'], foreground: c['Foreground'], card: c['Card'], muted: c['Muted'], mutedForeground: c['Muted Foreground'], border: c['Border'] },
      note: c['Notes'],
    })),
    patron: patron ? { nom: patron['Pattern Name'], sections: patron['Section Order'], effets: patron['Recommended Effects'], couleurs: patron['Color Strategy'] } : null,
    mouvement: mouvement.map((m) => ({ categorie: m['Category'], intensite: m['Intensity Tier'], duree: m['Duration'], faire: m['Do'], eviter: m["Don't"] })),
    raisonnement: raison ? { patron: raison['Recommended_Pattern'], styles: raison['Style_Priority'], couleur: raison['Color_Mood'], typo: raison['Typography_Mood'], effets: raison['Key_Effects'], antiPatrons: raison['Anti_Patterns'] } : null,
  }
}

/** Le dossier écrit pour le modèle, court : ce sont des pistes, pas un cahier des charges. */
export function dossierEnTexte(d: DossierDesign): string {
  const lignes: string[] = []
  if (d.produit) lignes.push(`Type de commerce reconnu : ${d.produit.type}. Styles conseillés : ${d.produit.styles}. Patron d'accueil : ${d.produit.patron}. Couleurs : ${d.produit.palette}. À garder en tête : ${d.produit.conseils}`)
  if (d.raisonnement) lignes.push(`Raisonnement pour ce type : ${d.raisonnement.styles} — ambiance couleur ${d.raisonnement.couleur}, typographie ${d.raisonnement.typo}, effets ${d.raisonnement.effets}. Anti-patrons : ${d.raisonnement.antiPatrons}.`)
  if (d.styles.length) {
    lignes.push('Styles qui conviennent (choisis-en un, ou marie-en deux, et pousse-le loin) :')
    d.styles.forEach((s) => lignes.push(`- ${s.nom} — ${s.motsCles}. Couleurs : ${s.couleurs}. Effets : ${s.effets}. Recette : ${s.recette}. Variables : ${s.variables}. À éviter pour : ${s.eviter}`))
  }
  if (d.polices.length) {
    lignes.push('Appariements de polices Google possibles (ou un autre, si tu as mieux pour ce sujet) :')
    d.polices.forEach((t) => lignes.push(`- ${t.nom} : ${t.titre} (titres) + ${t.texte} (texte) — ${t.ambiance}. ${t.url}`))
  }
  if (d.palettes.length) {
    lignes.push('Palettes de référence pour ce type de commerce (à teinter, jamais à recopier telles quelles) :')
    d.palettes.forEach((c) => lignes.push(`- ${c.type} : ${Object.entries(c.jetons).map(([k, v]) => `${k} ${v}`).join(', ')} — ${c.note}`))
  }
  if (d.patron) lignes.push(`Patron de page d'accueil : ${d.patron.nom} — ${d.patron.sections}. Effets : ${d.patron.effets}. Couleurs : ${d.patron.couleurs}`)
  if (d.mouvement.length) {
    lignes.push('Mouvement (en CSS, jamais de bibliothèque) :')
    d.mouvement.forEach((m) => lignes.push(`- ${m.categorie} (${m.intensite}, ${m.duree}) : ${m.faire}. Éviter : ${m.eviter}`))
  }
  return lignes.join('\n')
}
