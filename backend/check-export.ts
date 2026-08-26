import sharp from 'sharp'
import { signatureFiligrane } from './src/services/watermark.js'
import { reglagesFiligrane } from './src/services/exportImages.js'
import type { User, Shop } from '@prisma/client'

/**
 * Éprouve la séparation entre l'original et l'export.
 *
 * Ce qui est vérifié ici n'est pas l'image — sharp sait composer — mais les deux
 * décisions qui décident du reste : quels réglages s'appliquent quand une
 * boutique a son propre logo, et quand les images marquées doivent être refaites.
 * Une signature qui ne bougerait pas au changement de logo ressusciterait
 * l'ancien filigrane sur toutes les annonces, sans que rien ne le signale.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const compte = {
  shopName: 'OGGUS',
  watermarkText: 'OGGUS',
  watermarkImage: '/storage/logo-compte.png',
  watermarkScale: 22,
  watermarkOpacity: 75,
  watermarkPosition: 'southeast',
  watermarkEnabled: true,
} as unknown as User

const boutique = {
  name: 'OGGUS High-Tech',
  logo: '/storage/logo-hitech.png',
  watermarkText: null,
  watermarkScale: null,
  watermarkOpacity: null,
  watermarkPosition: 'northwest',
  watermarkEnabled: true,
} as unknown as Shop

// --- Le logo de la boutique l'emporte sur celui du compte -------------------
const sansBoutique = reglagesFiligrane(compte, null)
exige(sansBoutique.imagePath === '/storage/logo-compte.png', 'sans boutique, le logo du compte sert')

const avecBoutique = reglagesFiligrane(compte, boutique)
exige(avecBoutique.imagePath === '/storage/logo-hitech.png', 'le logo de la boutique doit primer')
exige(avecBoutique.position === 'northwest', 'la position de la boutique doit primer')

// Chaque champ retombe separement : une boutique qui n a regle que sa position
// garde l echelle et l opacite du compte.
exige(avecBoutique.scale === 22, `echelle ${avecBoutique.scale}, attendu celle du compte`)
exige(avecBoutique.opacity === 75, `opacite ${avecBoutique.opacity}, attendu celle du compte`)

// Une boutique peut couper le filigrane sans que le compte le coupe.
const coupee = reglagesFiligrane(compte, { ...boutique, watermarkEnabled: false } as Shop)
exige(coupee.enabled === false, 'une boutique doit pouvoir couper sa marque')

// Le compte coupe : aucune boutique ne le rallume.
const compteCoupe = { ...compte, watermarkEnabled: false } as User
exige(reglagesFiligrane(compteCoupe, boutique).enabled === false, 'le compte coupe doit primer')

// --- La signature : c'est elle qui decide si on refait ----------------------
const a = signatureFiligrane(reglagesFiligrane(compte, null))
const b = signatureFiligrane(reglagesFiligrane(compte, null))
exige(a === b, 'des reglages identiques doivent donner la meme signature')

const c = signatureFiligrane(reglagesFiligrane(compte, boutique))
exige(a !== c, 'un logo different doit changer la signature')

const d = signatureFiligrane(reglagesFiligrane({ ...compte, watermarkOpacity: 40 } as User, null))
exige(a !== d, "un changement d'opacite doit changer la signature")

const e = signatureFiligrane(reglagesFiligrane(compteCoupe, null))
exige(a !== e, 'couper la marque doit changer la signature')

// --- Ce que ca donne vraiment, en pixels ------------------------------------
const cible = process.argv[2]
if (cible) {
  const { marquerPourExport } = await import('./src/services/watermark.js')
  const base = await sharp({
    create: { width: 900, height: 900, channels: 3, background: { r: 80, g: 90, b: 130 } },
  })
    .jpeg()
    .toBuffer()

  const { writeFile } = await import('fs/promises')
  await writeFile(`${cible}/original.jpg`, base)
  console.log(`original ecrit : ${base.length} octets`)

  // La marque texte, sans logo : c'est le repli quand aucun fichier n'est depose.
  const sortie = await marquerPourExport([`${cible}/original.jpg`], {
    text: 'OGGUS',
    scale: 22,
    opacity: 75,
    position: 'southeast',
    enabled: true,
  })
  console.log(`marquee : ${sortie[0]}`)
}

console.log(echecs === 0 ? 'Filigrane a l export : tout passe.' : `${echecs} echec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
