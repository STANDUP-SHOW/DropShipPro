/**
 * Analyse un extrait de musique pour caler une pub dessus : énergie, temps, BPM,
 * drop, cassures, et la grille de coupes à recopier dans la page de la pub.
 *
 *   node battements.cjs sources/poseidon.mp3 --debut 212 --duree 30
 *   node battements.cjs musiques/partout.wav            # fichier déjà découpé
 *
 * Méthode (celle des pubs 4 à 6) : on isole les basses (passe-bas simple), on
 * relève les attaques de la grosse caisse, on ajuste une grille régulière sur
 * ces attaques, puis on cherche le drop (première montée franche d'énergie) et
 * les cassures (chutes d'énergie). Le temps « 0 » de la grille est ramené au
 * drop, parce que c'est lui que la pub doit frapper.
 *
 * Aucun module Python : tout en Node, ffmpeg-static décode en PCM.
 */
const { spawnSync } = require('node:child_process')
const FFMPEG = require('ffmpeg-static')

const args = process.argv.slice(2)
const fichier = args.find((a) => !a.startsWith('--'))
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? parseFloat(args[i + 1]) : d }
if (!fichier) { console.error('Usage : node battements.cjs <musique> [--debut s] [--duree s]'); process.exit(1) }
const debut = opt('--debut', 0), duree = opt('--duree', 0)

const SR = 22050
const cmd = ['-loglevel', 'error', ...(debut ? ['-ss', String(debut)] : []), ...(duree ? ['-t', String(duree)] : []),
  '-i', fichier, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-']
const r = spawnSync(FFMPEG, cmd, { maxBuffer: 1 << 30 })
if (r.status !== 0) { console.error(String(r.stderr)); process.exit(1) }
const b = r.stdout
const x = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))
const total = x.length / SR
console.log(`Durée analysée : ${total.toFixed(2)} s`)

// 1. Énergie par demi-seconde (dB) : la forme du morceau (intro, montée, drop, cassures)
const demi = SR / 2, energie = []
for (let i = 0; i + demi <= x.length; i += demi) {
  let e = 0; for (let j = i; j < i + demi; j++) e += x[j] * x[j]
  energie.push(10 * Math.log10(e / demi + 1e-12))
}
console.log('\nÉnergie (dB) par 0,5 s :')
console.log(energie.map((e, i) => `${(i / 2).toFixed(1)}:${e.toFixed(0)}`).join(' '))

// 2. Enveloppe des basses à 200 images/s, attaques de la grosse caisse
const hop = Math.round(SR / 200)
let lp = 0; const env = []
for (let i = 0; i < x.length; i += hop) {
  let e = 0; for (let j = i; j < Math.min(i + hop, x.length); j++) { lp += 0.03 * (x[j] - lp); e += lp * lp }
  env.push(e / hop)
}
const att = env.map((v, i) => (i ? Math.max(0, v - env[i - 1]) : 0))
const seuil = Math.max(...att) * 0.25
const coups = []
for (let i = 2; i < att.length - 2; i++) {
  if (att[i] > seuil && att[i] >= att[i - 1] && att[i] >= att[i + 1] && (!coups.length || i - coups[coups.length - 1] > 40)) coups.push(i)
}
const tCoups = coups.map((i) => i / 200)
if (tCoups.length < 8) { console.log('\nTrop peu de coups de grosse caisse pour une grille : extrait trop calme ?'); process.exit(0) }

// 3. Grille : la période qui aligne le mieux TOUS les coups (somme de phases,
// comme une transformée de Fourier des attaques). Les coups tombent souvent
// sur les demi-temps : on cherche donc entre 0,18 et 0,6 s puis on double
// jusqu'à un temps musical (100 à 180 BPM).
let meilleur = 0, pas = 0.5
for (let P = 0.18; P <= 0.6; P += 0.00002) {
  let re = 0, im = 0
  for (const t of tCoups) { re += Math.cos(2 * Math.PI * t / P); im += Math.sin(2 * Math.PI * t / P) }
  const score = Math.hypot(re, im) / tCoups.length - P * 0.02 // léger biais vers la période la plus courte qui colle
  if (score > meilleur) { meilleur = score; pas = P }
}
while (pas < 0.33) pas *= 2
const TEMPS = pas

// 4. Drop : première demi-seconde où l'énergie saute d'au moins 6 dB au-dessus de la moyenne précédente
let drop = null
for (let i = 2; i < energie.length; i++) {
  const avant = energie.slice(Math.max(0, i - 6), i).reduce((a, c) => a + c, 0) / Math.min(6, i)
  if (energie[i] - avant >= 6) { drop = i / 2; break }
}
// Le drop exact : le premier coup de grosse caisse après ce saut (moins une demi-seconde de marge)
const dropCoup = drop === null ? tCoups[0] : (tCoups.find((t) => t >= drop - 0.5) ?? tCoups[0])
const PREMIER = dropCoup - Math.floor(dropCoup / TEMPS) * TEMPS

// 5. Cassures : chutes d'au moins 6 dB après le drop
const cassures = []
for (let i = Math.ceil((drop ?? 0) * 2) + 1; i < energie.length; i++) {
  if (energie[i - 2] - energie[i] >= 5 && (!cassures.length || i / 2 - cassures[cassures.length - 1] > 2)) cassures.push(i / 2)
}

console.log(`\nTemps : ${TEMPS.toFixed(5)} s  →  ${(60 / TEMPS).toFixed(1)} BPM`)
console.log(`Drop  : ${dropCoup.toFixed(3)} s (temps n° ${Math.round((dropCoup - PREMIER) / TEMPS)})`)
console.log(`Premier temps de la grille : ${PREMIER.toFixed(3)} s`)
console.log(`Cassures (chute d'énergie) : ${cassures.length ? cassures.map((c) => c.toFixed(1) + ' s').join(', ') : 'aucune'}`)

// 6. Phrases de 16 temps ancrées sur le drop, et coupes de 8 temps
const phrases = []
for (let t = dropCoup; t > 0; t -= 16 * TEMPS) phrases.unshift(t)
for (let t = dropCoup + 16 * TEMPS; t < total; t += 16 * TEMPS) phrases.push(t)
console.log(`Phrases de 16 temps : ${phrases.map((t) => t.toFixed(2)).join(' · ')}`)
const coupes = []
for (let t = dropCoup - Math.floor(dropCoup / (8 * TEMPS)) * 8 * TEMPS; t < total - 1; t += 8 * TEMPS) if (t > 0.5) coupes.push(t)
console.log(`Coupes tous les 8 temps : ${coupes.map((t) => t.toFixed(2)).join(' · ')}`)

console.log(`\nÀ recopier dans la page de la pub :
const TEMPS = ${TEMPS.toFixed(5)}, DROP = ${dropCoup.toFixed(3)}
const PREMIER = DROP - ${Math.round((dropCoup - PREMIER) / TEMPS)} * TEMPS
const temps = (k) => PREMIER + k * TEMPS   // instant du k-ième temps`)
