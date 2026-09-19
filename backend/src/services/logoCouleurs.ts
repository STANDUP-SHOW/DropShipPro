import sharp from 'sharp'

/**
 * Les couleurs d'un logo, et les gammes de boutique qu'on en tire (17/09/2026).
 *
 * Max : « il doit uploader son logo avant, et l'appli check les couleurs du
 * logo, propose la gamme correspondante et demande : adapter le DropShop aux
 * couleurs de votre logo ? ». Le logo est lu pixel par pixel (sharp, 48×48),
 * le fond transparent et les blancs/noirs de fond sont écartés, les teintes
 * proches fusionnées. Il en sort les couleurs dominantes avec leur part, puis
 * quatre gammes complètes — sombre, claire, contrastée, naturelle — dont les
 * jetons sont calculés en HSL à partir de ces teintes, avec un contraste
 * texte/fond vérifié (≥ 4,5 : 1, jamais laissé au hasard).
 *
 * Ce sont des propositions : le vendeur en choisit une, ou laisse l'IA libre.
 * La gamme choisie est ensuite IMPOSÉE au modèle comme palette de départ.
 */

export interface CouleurLogo {
  hex: string
  part: number
  h: number
  s: number
  l: number
}

export interface Gamme {
  id: string
  nom: string
  description: string
  mode: 'sombre' | 'clair'
  jetons: { fond: string; surface: string; texte: string; sourd: string; accent: string; accent2: string; ligne: string }
}

/* ---------- Conversions ---------- */

export function rgbVersHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

export function hslVersHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let [r, g, b] = [0, 0, 0]
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}

/** Le rapport de contraste WCAG entre deux couleurs. */
export function contraste(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/* ---------- Lecture du logo ---------- */

/**
 * Les couleurs dominantes du logo. SVG, PNG, JPEG, WebP : sharp rastérise.
 * Rend au plus 5 couleurs, part décroissante, sans les blancs/noirs de fond.
 */
export async function couleursDuLogo(image: Buffer): Promise<CouleurLogo[]> {
  const { data, info } = await sharp(image).resize(48, 48, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const compte = new Map<string, { n: number; r: number; g: number; b: number }>()
  let total = 0
  for (let i = 0; i < data.length; i += info.channels) {
    const a = data[i + 3]
    if (a < 128) continue
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2]
    // Quantification 5 bits par canal : les nuances d'une même teinte se rejoignent.
    const cle = `${r >> 3},${g >> 3},${b >> 3}`
    const e = compte.get(cle) ?? { n: 0, r: 0, g: 0, b: 0 }
    e.n++; e.r += r; e.g += g; e.b += b
    compte.set(cle, e)
    total++
  }
  if (!total) return []
  let couleurs = [...compte.values()].map((e) => {
    const r = Math.round(e.r / e.n); const g = Math.round(e.g / e.n); const b = Math.round(e.b / e.n)
    const [h, s, l] = rgbVersHsl(r, g, b)
    return { hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`, part: e.n / total, h, s, l }
  })
  // Le fond : blanc ou noir pur, sans saturation — écarté sauf s'il n'y a rien d'autre.
  const utiles = couleurs.filter((c) => !((c.l > 0.93 || c.l < 0.07) && c.s < 0.2))
  couleurs = utiles.length ? utiles : couleurs
  // Fusion des voisines (même teinte à 18° près, luminosité proche).
  const fusion: CouleurLogo[] = []
  for (const c of couleurs.sort((a, b) => b.part - a.part)) {
    const proche = fusion.find((f) => Math.abs(f.h - c.h) < 18 && Math.abs(f.l - c.l) < 0.18 && Math.abs(f.s - c.s) < 0.3)
    if (proche) proche.part += c.part
    else fusion.push({ ...c })
  }
  const somme = fusion.reduce((s, c) => s + c.part, 0) || 1
  return fusion
    .map((c) => ({ ...c, part: Math.round((c.part / somme) * 1000) / 1000 }))
    .filter((c) => c.part >= 0.03)
    .slice(0, 5)
}

/* ---------- Les gammes ---------- */

export function texteLisibleSur(fond: string, clair: boolean): string {
  // Part d'un blanc cassé (ou d'un noir chaud) et pousse jusqu'à 4,5 : 1.
  for (let l = clair ? 0.12 : 0.96; clair ? l <= 0.5 : l >= 0.5; l += clair ? 0.02 : -0.02) {
    const t = hslVersHex(0, 0, l)
    if (contraste(fond, t) >= 4.5) return t
  }
  return clair ? '#111111' : '#f4f4f4'
}

export function accentLisibleSur(fond: string, h: number, s: number, l: number, clair: boolean): string {
  let hex = hslVersHex(h, s, l)
  let essais = 0
  while (contraste(fond, hex) < 3 && essais++ < 20) {
    l += clair ? -0.04 : 0.04
    hex = hslVersHex(h, s, l)
  }
  return hex
}

/**
 * Quatre gammes tirées des couleurs du logo. Sans couleur (logo gris ou
 * absent), on part d'un bleu ardoise neutre plutôt que de ne rien proposer.
 */
export function gammesDepuis(couleurs: CouleurLogo[]): Gamme[] {
  const vives = [...couleurs].sort((a, b) => b.s * b.part - a.s * a.part)
  const principale = vives.find((c) => c.s > 0.15) ?? couleurs[0] ?? { hex: '#3b5b8a', part: 1, h: 215, s: 0.4, l: 0.4 }
  const seconde = vives.find((c) => c !== principale && Math.abs(c.h - principale.h) > 25 && c.s > 0.15) ?? { ...principale, h: (principale.h + 40) % 360 }
  const H = principale.h; const S = Math.max(0.35, principale.s)
  const H2 = seconde.h; const S2 = Math.max(0.35, seconde.s)

  const sombre = (() => {
    const fond = hslVersHex(H, Math.min(0.35, S * 0.6), 0.06)
    const surface = hslVersHex(H, Math.min(0.3, S * 0.5), 0.11)
    return { fond, surface, texte: texteLisibleSur(fond, false), sourd: hslVersHex(H, 0.12, 0.62), accent: accentLisibleSur(fond, H, S, 0.55, false), accent2: accentLisibleSur(fond, H2, S2, 0.6, false), ligne: 'rgba(255,255,255,.1)' }
  })()
  const clair = (() => {
    const fond = hslVersHex(H, Math.min(0.4, S * 0.5), 0.975)
    const surface = '#ffffff'
    return { fond, surface, texte: texteLisibleSur(fond, true), sourd: hslVersHex(H, 0.12, 0.42), accent: accentLisibleSur(fond, H, S, 0.42, true), accent2: accentLisibleSur(fond, H2, S2, 0.4, true), ligne: 'rgba(0,0,0,.1)' }
  })()
  const contraste_ = (() => {
    const fond = hslVersHex(H, Math.min(0.7, S), 0.16)
    const surface = hslVersHex(H, Math.min(0.6, S * 0.9), 0.22)
    return { fond, surface, texte: texteLisibleSur(fond, false), sourd: hslVersHex(H, 0.2, 0.7), accent: accentLisibleSur(fond, H2, Math.max(0.5, S2), 0.6, false), accent2: accentLisibleSur(fond, (H + 180) % 360, 0.5, 0.65, false), ligne: 'rgba(255,255,255,.14)' }
  })()
  const naturel = (() => {
    const fond = hslVersHex(35, 0.28, 0.94)
    const surface = '#fffdf9'
    return { fond, surface, texte: texteLisibleSur(fond, true), sourd: hslVersHex(30, 0.12, 0.42), accent: accentLisibleSur(fond, H, S, 0.4, true), accent2: accentLisibleSur(fond, H2, S2, 0.38, true), ligne: 'rgba(60,40,20,.12)' }
  })()

  return [
    { id: 'sombre', nom: 'Sombre', description: 'Fond profond teinté par votre logo, accent vif : boutique de nuit, produit en pleine lumière.', mode: 'sombre', jetons: sombre },
    { id: 'clair', nom: 'Claire', description: 'Fond clair à peine teinté, texte sombre, votre couleur en accent : net et lisible.', mode: 'clair', jetons: clair },
    { id: 'contraste', nom: 'Contrastée', description: 'Votre couleur principale en fond, sa complémentaire en accent : affirmé.', mode: 'sombre', jetons: contraste_ },
    { id: 'naturel', nom: 'Naturelle', description: 'Neutres chauds, votre couleur pour les gestes : matière, calme, artisanal.', mode: 'clair', jetons: naturel },
  ]
}
