/**
 * Compose une piste techno originale, calée sur le découpage d'une pub.
 *
 *   node techno.cjs --pub annonces --drop 3 --coupes 8.4,13.4,18.2,23 --final 26.8 --duree 30
 *   → musiques/annonces.wav (48 kHz stéréo, −14 LUFS)
 *
 * Tout est synthétisé ici, sans échantillon : la musique appartient au projet,
 * contrairement aux rushs Pinterest dont les droits ne sont pas établis.
 * 128 BPM, la mineur. Montée (bruit filtré, roulement) jusqu'au drop, groove
 * complet ensuite (kick 4/4, clap, charleston, basse roulante compressée par le
 * kick, stabs d'accords avec écho), un impact sur chaque coupe, un break sur
 * l'appel à l'action.
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const FFMPEG = require('ffmpeg-static')

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d }
const NOM = arg('pub', 'annonces')
const DROP = parseFloat(arg('drop', '3'))
const COUPES = arg('coupes', '8.4,13.4,18.2,23').split(',').map(Number)
const FINAL = parseFloat(arg('final', '26.8'))
const DUREE = parseFloat(arg('duree', '30'))

const SR = 48000, N = Math.ceil(DUREE * SR)
const L = new Float32Array(N), R = new Float32Array(N)
const BPM = 128, TEMPS = 60 / BPM, DOUBLE = TEMPS / 4 // noire, double-croche

// Hasard reproductible : la même commande rend la même piste
let graine = 12345
const hasard = () => ((graine = (graine * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1

function biquad(type, f, q = 0.7) {
  const w = 2 * Math.PI * f / SR, a = Math.sin(w) / (2 * q), c = Math.cos(w)
  let b0, b1, b2, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0 }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0 }
  else { b0 = a; b1 = 0; b2 = -a }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  return (x) => { const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; return y }
}
const ajouter = (i, g, gl = 1, gr = 1) => { if (i >= 0 && i < N) { L[i] += g * gl; R[i] += g * gr } }
const note = (n) => 440 * Math.pow(2, (n - 69) / 12)

// Grille calée pour qu'un temps tombe exactement sur le drop
const temps = []
for (let t = DROP - Math.ceil(DROP / TEMPS) * TEMPS; t < DUREE; t += TEMPS) temps.push(t)
const enGroove = (t) => t >= DROP - 1e-6 && t < FINAL
const coupe = (t) => COUPES.some((c) => Math.abs(t - c) < 1e-6)

// Enveloppe de « pompe » : tout ce qui n'est pas le kick s'efface sous lui
const pompe = new Float32Array(N).fill(1)

function kick(t0, g = 1) {
  const i0 = Math.round(t0 * SR); let ph = 0
  for (let k = 0; k < 0.38 * SR; k++) {
    const t = k / SR, f = 46 + 120 * Math.exp(-t * 32)
    ph += 2 * Math.PI * f / SR
    const v = Math.sin(ph) * Math.exp(-t * 7) + (k < 90 ? hasard() * 0.35 * (1 - k / 90) : 0)
    ajouter(i0 + k, Math.tanh(v * 1.6) * 0.9 * g)
    if (i0 + k < N) pompe[i0 + k] = Math.min(pompe[i0 + k], 1 - 0.75 * Math.exp(-t * 9))
  }
}
function clap(t0, g = 1) {
  const i0 = Math.round(t0 * SR), bp = biquad('bp', 1300, 1.2)
  for (let k = 0; k < 0.3 * SR; k++) {
    const t = k / SR
    const env = (t < 0.03 ? [0, 0.011, 0.022].reduce((s, d) => s + (t >= d ? Math.exp(-(t - d) * 180) : 0), 0) : 0) + Math.exp(-t * 16) * 0.8
    ajouter(i0 + k, bp(hasard()) * env * 1.1 * g, 0.95, 1.05)
  }
}
function charley(t0, ouvert, g = 1) {
  const i0 = Math.round(t0 * SR), hp = biquad('hp', 8000, 0.8), d = ouvert ? 11 : 55
  for (let k = 0; k < (ouvert ? 0.25 : 0.06) * SR; k++) ajouter(i0 + k, hp(hasard()) * Math.exp(-k / SR * d) * 0.28 * g, 0.8, 1.2)
}
function basse(t0, n, dur, g = 1) {
  const i0 = Math.round(t0 * SR), f = note(n), lp = biquad('lp', 900, 2.5); let ph = 0
  for (let k = 0; k < dur * SR; k++) {
    const t = k / SR; ph = (ph + f / SR) % 1
    const scie = (2 * ph - 1) + 0.5 * Math.sin(2 * Math.PI * ph)
    const env = Math.min(1, t * 400) * Math.exp(-t * 7)
    ajouter(i0 + k, Math.tanh(lp(scie) * 1.4) * env * 0.42 * g)
  }
}
const echo = { l: new Float32Array(N), r: new Float32Array(N) }
function stab(t0, notes, g = 1) {
  const i0 = Math.round(t0 * SR), lp = biquad('lp', 2400, 1.4), lp2 = biquad('lp', 2400, 1.4)
  const ph = notes.flatMap(() => [0, 0])
  for (let k = 0; k < 0.28 * SR; k++) {
    const t = k / SR; let l = 0, r = 0
    notes.forEach((n, j) => {
      const f = note(n)
      ph[2 * j] = (ph[2 * j] + f * 1.004 / SR) % 1; ph[2 * j + 1] = (ph[2 * j + 1] + f * 0.996 / SR) % 1
      l += 2 * ph[2 * j] - 1; r += 2 * ph[2 * j + 1] - 1
    })
    const env = Math.min(1, t * 300) * Math.exp(-t * 11) * 0.13 * g
    const vl = lp(l) * env, vr = lp2(r) * env
    ajouter(i0 + k, vl, 1, 0); ajouter(i0 + k, vr, 0, 1)
    if (i0 + k < N) { echo.l[i0 + k] += vl; echo.r[i0 + k] += vr }
  }
}
function nappe(t0, t1, notes, g = 1) {
  const i0 = Math.round(t0 * SR), i1 = Math.round(t1 * SR), lp = biquad('lp', 1200, 0.9), lp2 = biquad('lp', 1200, 0.9)
  const ph = notes.flatMap(() => [0, 0])
  for (let i = i0; i < i1 && i < N; i++) {
    const t = (i - i0) / SR, reste = (i1 - i) / SR; let l = 0, r = 0
    notes.forEach((n, j) => {
      const f = note(n)
      ph[2 * j] = (ph[2 * j] + f * 1.006 / SR) % 1; ph[2 * j + 1] = (ph[2 * j + 1] + f * 0.994 / SR) % 1
      l += 2 * ph[2 * j] - 1; r += 2 * ph[2 * j + 1] - 1
    })
    const env = Math.min(1, t / 0.6) * Math.min(1, reste / 0.4) * 0.07 * g
    ajouter(i, lp(l) * env, 1, 0); ajouter(i, lp2(r) * env, 0, 1)
  }
}
function montee(t0, t1) {
  const i0 = Math.round(t0 * SR), i1 = Math.round(t1 * SR); let ph = 0
  for (let i = i0; i < i1; i++) {
    const k = (i - i0) / (i1 - i0), bp = montee.bp || (montee.bp = { f: 0, filtre: null })
    if ((i - i0) % 256 === 0) bp.filtre = biquad('bp', 300 + 7000 * k * k, 1.5)
    ph += 2 * Math.PI * (120 + 900 * k * k) / SR
    ajouter(i, (bp.filtre(hasard()) * 0.5 + Math.sin(ph) * 0.05) * k * k * 0.9)
  }
}
function impact(t0, g = 1) {
  const i0 = Math.round(t0 * SR), hp = biquad('hp', 3000, 0.7); let ph = 0
  for (let k = 0; k < 1.6 * SR; k++) {
    const t = k / SR; ph += 2 * Math.PI * (38 + 40 * Math.exp(-t * 6)) / SR
    ajouter(i0 + k, (hp(hasard()) * Math.exp(-t * 2.2) * 0.3 + Math.sin(ph) * Math.exp(-t * 3) * 0.6) * g)
  }
}
function whoosh(t1) {
  const d = 0.5, i0 = Math.round((t1 - d) * SR); let filtre
  for (let k = 0; k < d * SR; k++) {
    const x = k / (d * SR)
    if (k % 256 === 0) filtre = biquad('bp', 400 + 6000 * x, 1.2)
    ajouter(i0 + k, filtre(hasard()) * x * x * 0.55, 1 - x * 0.5, 0.5 + x * 0.5)
  }
}

// ---------- Arrangement ----------
const AM = [57, 60, 64], FM = [53, 57, 60], CM = [55, 60, 64], GM = [55, 59, 62]
const GRILLE = [AM, AM, FM, GM] // une mesure par accord
const BASSES = [33, 33, 29, 31]

// Montée : nappe, roulement de caisse qui accélère, bruit qui s'ouvre
nappe(0, DROP, AM, 0.9)
montee(0.4, DROP)
for (let t = DROP - 2; t < DROP; ) {
  const reste = DROP - t, pas = reste > 1 ? TEMPS / 2 : reste > 0.5 ? TEMPS / 4 : TEMPS / 8
  clap(t, 0.35 + 0.5 * (1 - reste / 2)); t += pas
}
kick(DROP - 2 * TEMPS, 0.6); kick(DROP - TEMPS, 0.7)

temps.forEach((t, b) => {
  if (t < DROP - 1e-6) return
  const mesure = Math.floor((t - DROP) / (4 * TEMPS) + 1e-6), dansMesure = b % 4
  const accord = GRILLE[mesure % 4], basseNote = BASSES[mesure % 4]
  if (enGroove(t)) {
    kick(t)
    if (dansMesure === 1 || dansMesure === 3) clap(t, 0.8)
    charley(t + 2 * DOUBLE, true, 0.8)
    charley(t + DOUBLE, false, 0.5); charley(t + 3 * DOUBLE, false, 0.6)
    // Basse roulante : trois doubles-croches sur quatre, hors du kick
    ;[1, 2, 3].forEach((d) => basse(t + d * DOUBLE, basseNote + (d === 3 && dansMesure === 3 ? 12 : 0), DOUBLE * 0.9, d === 2 ? 1 : 0.8))
    if (dansMesure === 0 || dansMesure === 2) stab(t + 3 * DOUBLE, accord, dansMesure === 0 ? 1 : 0.7)
  } else if (t >= FINAL) {
    // Break final : kick seul, plus doux, et la nappe
    kick(t, 0.75)
    charley(t + 2 * DOUBLE, true, 0.5)
  }
})
nappe(FINAL, DUREE, AM, 1.2)
stab(FINAL, AM, 1.3)
impact(DROP, 1.1)
COUPES.forEach((c) => { whoosh(c); impact(c, 0.55) })
impact(FINAL, 0.8)

// Écho des stabs (trois doubles-croches, ping-pong)
const retard = Math.round(3 * DOUBLE * SR)
for (let i = retard; i < N; i++) { echo.l[i] += echo.r[i - retard] * 0.45; echo.r[i] += echo.l[i - retard] * 0.45 }
for (let i = 0; i < N; i++) { L[i] += echo.r[i] * 0.5; R[i] += echo.l[i] * 0.5 }

// La pompe du kick ne touche que ce qui n'est pas le kick : on l'applique à
// l'écho et à la nappe par une seconde passe douce sur tout le mix, légère.
for (let i = 0; i < N; i++) { const p = 0.55 + 0.45 * pompe[i]; L[i] *= p; R[i] *= p }

// Fondu de sortie et bus maître : saturation douce
const fin = Math.round((DUREE - 1) * SR)
let crete = 0
for (let i = 0; i < N; i++) {
  const f = i > fin ? 1 - (i - fin) / (N - fin) : 1
  L[i] = Math.tanh(L[i] * 1.2) * f; R[i] = Math.tanh(R[i] * 1.2) * f
  crete = Math.max(crete, Math.abs(L[i]), Math.abs(R[i]))
}

// WAV 16 bits
const brut = Buffer.alloc(44 + N * 4)
brut.write('RIFF', 0); brut.writeUInt32LE(36 + N * 4, 4); brut.write('WAVE', 8)
brut.write('fmt ', 12); brut.writeUInt32LE(16, 16); brut.writeUInt16LE(1, 20); brut.writeUInt16LE(2, 22)
brut.writeUInt32LE(SR, 24); brut.writeUInt32LE(SR * 4, 28); brut.writeUInt16LE(4, 32); brut.writeUInt16LE(16, 34)
brut.write('data', 36); brut.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) {
  brut.writeInt16LE(Math.round(L[i] / crete * 0.95 * 32767), 44 + i * 4)
  brut.writeInt16LE(Math.round(R[i] / crete * 0.95 * 32767), 46 + i * 4)
}
fs.mkdirSync(path.join(__dirname, 'musiques'), { recursive: true })
const tmp = path.join(__dirname, 'musiques', `.${NOM}-brut.wav`), sortie = path.join(__dirname, 'musiques', `${NOM}.wav`)
fs.writeFileSync(tmp, brut)
const r = spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-i', tmp, '-af', 'loudnorm=I=-14:TP=-1.5', '-ar', '48000', sortie])
fs.unlinkSync(tmp)
if (r.status !== 0) { console.error(String(r.stderr)); process.exit(1) }
console.log('Musique :', sortie)
