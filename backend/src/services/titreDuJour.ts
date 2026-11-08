/**
 * Le titre du jour d'un rapport, quand l'agent n'en a pas posé (Max, 04/11/2026 :
 * « chaque rapport doit présenter un titre original extrait du début de
 * l'article », pour Fresh News et pour une adresse neuve chaque jour).
 *
 * Les études MARKETSPY (KANTIX, import Drive) s'intitulent toutes
 * « Beauté et soins — Ongles et manucure » : un titre générique, le même chaque
 * jour. Le titre du jour est alors tiré du début de l'analyse (synthèse, sinon
 * opportunité principale, sinon premier paragraphe ; pour un rapport marketing,
 * la première tendance du jour) : la première proposition qui tient en une
 * ligne de une, et qui ne dit rien de privé.
 *
 * Garde-fou (garde-fou-analyses) : une phrase qui parle de prix, d'euros, de
 * pourcentage, de marge, d'achat, de fournisseur, de grossiste ou d'une
 * plateforme d'approvisionnement n'est jamais un titre — on passe à la suivante,
 * et sans candidate propre le rapport garde son titre. Le titre devient aussi
 * l'adresse : rien de privé ne doit pouvoir y entrer.
 */

const PRIVE =
  /[€$£¥]|\d\s*%|\b\d+[.,]?\d*\s*(?:eur|euros?|usd|dollars?)\b|\bmarges?\b|\bachat|\bachet|\bfournisseur|\bgrossiste|\bprix\b|\bcoûts?\b|\bcouts?\b|\bmoq\b|\boem\b|\bodm\b|marques?\s+blanches?|white[-\s]label|private[-\s]label|\ben\s+gros\b|\bsourcing\b|\baliexpress|\balibaba|\b1688\b|\bcj\s*dropshipping|\bcjdropshipping|\bbigbuy|\btemu\b|\bshein\b|\bdhgate|\bbanggood|\bhttps?:|\bwww\./i

/** Mots qui ne disent rien du jour : un titre fait seulement de ceux-là (et du rayon) est générique. */
const NEUTRES = new Set(
  'analyse analyses rapport rapports rayon marketing etude complete marketspy ai ia du de des la le les et en pour sur au aux d l a un une jour'.split(' '),
)

function mots(t: string): string[] {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** « Beauté et soins — Ongles et manucure », « Ongles manucure », « MARKETSPY AI — Étude complète » : rien d'un titre de une. */
export function titreGenerique(titre: string, ...noms: Array<string | null | undefined>): boolean {
  const permis = new Set<string>(NEUTRES)
  for (const n of noms) for (const m of mots(String(n ?? ''))) permis.add(m)
  const m = mots(titre)
  return !m.length || m.every((x) => permis.has(x) || /^\d+$/.test(x))
}

/*
 * Max, 08/11/2026 (« pas clairs »): « En ce samedi 07 novembre », « TikTok non
 * vérifié aujourd'hui », « 20 fiches produit vérifiées » became addresses. A
 * sentence that only dates the report, speaks of its checks or counts its
 * sheets says nothing of the market: its date opening goes, and what is left
 * must still say something, else the next sentence is tried.
 */
const MOIS = 'janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre'
const JOURS = 'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche'
/** Words that only date or frame a sentence. */
const CADRE = new Set(
  `${MOIS}|${JOURS}|ce|cet|cette|ces|en|debut|mi|fin|aujourd|hui|semaine|mois|annee|matin|soir|jour|jours|journee|date|le|la|les|l|du|de|des|d|et|au|aux|a|un|une|ici|maintenant|actuellement|edition|point|bilan|resume|synthese|executive|summary`.split('|'),
)
/** The report speaking of itself: its checks, its sheets, its sources. */
const META = /\bv[ée]rifi|\bfiches?\b|\bsources?\b|\brelev[ée]|\bconsult[ée]|\bnon\s+disponibles?\b|\bindisponibles?\b|\bdonn[ée]es\b|\bscores?\b|\bverdicts?\b|\bcolonnes?\b|\bimport(?:é|e)?s?\b|\bm[ée]thodolog/i
const OUVERTURE_DATEE = new RegExp(
  `^\\s*(?:(?:en|pour|le)\\s+)?(?:(?:ce|cet|cette)\\s+)?(?:(?:${JOURS})\\s+)?(?:\\d{1,2}(?:er)?\\s+)?(?:(?:d[ée]but|mi|fin)[\\s-]+(?:de\\s+|d['’])?)?(?:${MOIS.replace(/e/g, '[eéèê]').replace(/u/g, '[uû]')})?(?:\\s+\\d{4})?\\s*[,:—–-]\\s*`,
  'i',
)
const AUJOURDHUI = /^\s*(?:aujourd['’]hui|ce\s+(?:jour|matin)|cette\s+semaine|ce\s+mois-ci|en\s+ce\s+moment|actuellement)\s*[,:—–-]\s*/i

/** « En ce samedi 07 novembre, la demande… » → « la demande… ». */
export function sansOuvertureDatee(t: string): string {
  let avant = ''
  let r = t
  while (r !== avant) {
    avant = r
    const m = OUVERTURE_DATEE.exec(r)
    // Only when the opening actually held a date word: « En bref, » is not a date.
    if (m && m[0].trim().length > 1 && mots(m[0]).some((x) => CADRE.has(x) && !['en', 'ce', 'cet', 'cette', 'le', 'la', 'de', 'd', 'pour'].includes(x) || /^\d+$/.test(x))) r = r.slice(m[0].length)
    r = r.replace(AUJOURDHUI, '')
  }
  return r.trim()
}

/** A title (or an address subject) that only dates, frames, counts or checks: nothing of the day's market. */
export function titreSansSens(t: string): boolean {
  if (META.test(t.replace(/-/g, ' '))) return true
  const utiles = mots(t).filter((x) => !CADRE.has(x) && !NEUTRES.has(x) && !/^\d+(?:er|e|eme)?$/.test(x) && x.length > 1)
  return utiles.length < 2
}

const MAX = 90
const MIN = 18

function propre(t: string): string {
  return t
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—•·:]+/, '')
    .trim()
}

/** La première proposition d'une phrase, coupée à un mot si elle reste trop longue. */
export function enTitre(phrase: string): string | null {
  let t = sansOuvertureDatee(propre(phrase))
  // The first sentence only.
  t = t.split(/(?<=[.!?])\s+(?=\p{Lu})/u)[0].replace(/[.!?…]+$/, '').trim()
  if (t.length > MAX) {
    // A clause boundary past the first words: « …, », « : », « ; », « — ».
    const coupe = /\s[—–]\s|\s?[:;]\s|,\s/g
    let m: RegExpExecArray | null
    let fin = -1
    while ((m = coupe.exec(t))) {
      if (m.index >= MIN && m.index <= MAX) fin = m.index
      if (m.index > MAX) break
    }
    t = fin > 0 ? t.slice(0, fin) : t.slice(0, MAX + 1).replace(/\s+\S*$/, '')
    // « …le changement d'heure et la » : every dangling small word goes.
    for (let avant = ''; avant !== t; ) {
      avant = t
      t = t.replace(/[\s,;:—–-]+$/, '').replace(/\s+(?:de|du|des|d'|la|le|les|l'|et|ou|en|pour|sur|au|aux|à|a|un|une|avec|qui|que|par|dans|son|sa|ses|leur|leurs)$/i, '')
    }
  }
  // A trailing source or detail in brackets: « … en croissance (Businesscoot) ».
  t = t.replace(/\s*\([^()]*\)$/, '').trim()
  // Brackets left open by the cut.
  if ((t.match(/\(/g) ?? []).length > (t.match(/\)/g) ?? []).length) t = t.replace(/\s*\([^)]*$/, '')
  t = t.replace(/[«"“]\s*$/, '').trim()
  if (t.length < MIN || PRIVE.test(t) || titreSansSens(t)) return null
  return t.replace(/^\p{Ll}/u, (c) => c.toUpperCase())
}

/** Les paragraphes de prose d'un texte Markdown (ni titre, ni tableau, ni bloc de code, ni « Date : »). */
function paragraphes(texte: string): string[] {
  const out: string[] = []
  let dansCode = false
  let buf: string[] = []
  const vider = () => {
    if (buf.length) out.push(buf.join(' '))
    buf = []
  }
  for (const l of texte.split(/\r?\n/)) {
    if (/^\s*```/.test(l)) {
      dansCode = !dansCode
      vider()
      continue
    }
    if (dansCode) continue
    if (!l.trim() || /^\s*(#|\||[-*]\s|\d+[.)]\s|---)/.test(l) || /^\s*(date|sources?)\s*:/i.test(l)) {
      vider()
      continue
    }
    buf.push(l.trim())
  }
  vider()
  return out
}

/** Le corps de la section de synthèse (« Executive Summary », « Synthèse », « Résumé »), s'il y en a une. */
function synthese(texte: string): string | null {
  const m = /^#{2,3}\s*(?:\d+\s*[.)]\s*)?(?:executive\s+summary|synth[eè]se|r[ée]sum[ée])[^\n]*\n([\s\S]*?)(?=^#{1,3}\s|$(?![\s\S]))/im.exec(texte)
  return m ? m[1] : null
}

/** Les phrases candidates, dans l'ordre : synthèse, puis opportunité principale (un premier paragraphe nomme souvent un produit, pas le jour). */
function candidates(analyse: string): string[] {
  const out: string[] = []
  const s = synthese(analyse)
  if (s) {
    for (const p of paragraphes(s)) {
      if (/^\*\*(budget|opportunit)/i.test(p)) continue
      out.push(...p.split(/(?<=[.!?])\s+(?=\p{Lu})/u))
    }
  }
  const opp = /\*\*Opportunit[ée] principale\*\*\s*:?\s*(.+)/i.exec(analyse)?.[1]
  if (opp) out.push(opp)
  return out
}

export interface SourceTitre {
  titre: string
  type: 'rayon' | 'marketing'
  categorieNom?: string | null
  themeNom?: string | null
  theme?: string | null
  categorie?: string | null
  analyse?: string | null
  blob?: any
}

/**
 * Le titre du jour tiré du rapport lui-même, ou null quand le titre posé est
 * déjà original (les tâches planifiées écrivent « PetTok, le transfo… ») ou
 * qu'aucune phrase propre ne s'y prête.
 */
export function titreDuJourAuto(s: SourceTitre): string | null {
  if (!titreGenerique(s.titre, s.categorieNom, s.themeNom, s.theme, s.categorie, s.blob?.study?.category_name, s.blob?.study?.theme_name) && !titreSansSens(s.titre)) return null
  const phrases: string[] = []
  const e = s.blob?.executive_summary
  if (typeof e?.summary === 'string') phrases.push(...e.summary.split(/(?<=[.!?])\s+(?=\p{Lu})/u))
  if (typeof e?.main_opportunity === 'string') phrases.push(e.main_opportunity)
  if (s.analyse) phrases.push(...candidates(s.analyse))
  if (s.type === 'marketing') {
    for (const cle of ['trendsDaily', 'trends_daily', 'trendingAds', 'trending_ads', 'socialPlaces']) {
      const l = s.blob?.[cle]
      if (Array.isArray(l)) phrases.push(...l.filter((x: unknown): x is string => typeof x === 'string'))
    }
    const md = s.blob?.markdown?.marketing ?? s.blob?.report_markdown
    if (typeof md === 'string') phrases.push(...candidates(md))
  }
  for (const p of phrases) {
    const t = enTitre(p)
    if (t && !titreGenerique(t, s.categorieNom, s.themeNom, s.theme, s.categorie)) return t
  }
  return null
}
