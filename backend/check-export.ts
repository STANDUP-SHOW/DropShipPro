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

// --- Le logo : un cadre fixe en bas a droite, a pleine intensite ------------
/*
 * Ni taille ni intensite pour un logo (19/09/2026).
 *
 * Ce n est pas une preference d ecran : ces deux curseurs ne changeaient RIEN a
 * un logo si on ne l ecrivait qu ici, et l ecran aurait continue de les
 * proposer. On le prouve donc en pixels — deux reglages opposes doivent rendre
 * exactement la meme image — et on verifie que la marque tient dans son coin,
 * sans deborder ailleurs.
 */
{
  const { marquerPourExport, saveWatermarkLogo } = await import('./src/services/watermark.js')
  const http = await import('node:http')

  const logo = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="140"><rect width="600" height="140" fill="#e11d48"/></svg>',
  )
  const chemin = await saveWatermarkLogo(logo, 'image/svg+xml')

  const photo = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#d4d4d8' } }).jpeg().toBuffer()
  const serveur = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'image/jpeg' }); r.end(photo) })
  await new Promise<void>((ok) => serveur.listen(4399, ok))

  const composer = async (scale: number, opacity: number) => {
    const [sortie] = await marquerPourExport(['http://127.0.0.1:4399/p.jpg'], {
      text: 'OGGUS', imagePath: chemin, scale, opacity, position: 'southeast', enabled: true,
    }, `essai-${scale}-${opacity}`)
    return sharp(`storage/${sortie.replace(/^\/storage\//, '')}`)
  }

  const petit = await composer(8, 15)
  const grand = await composer(60, 100)
  const [octetsPetit, octetsGrand] = await Promise.all([petit.raw().toBuffer(), grand.raw().toBuffer()])
  exige(octetsPetit.equals(octetsGrand), 'taille et intensite ne doivent plus rien changer a un logo')

  // La marque est dans le coin choisi, et nulle part ailleurs : le quart en bas
  // a droite differe de l original, le quart en haut a gauche lui est identique.
  const quart = (b: sharp.Sharp, left: number, top: number) =>
    b.clone().extract({ left, top, width: 450, height: 450 }).raw().toBuffer()
  const original = sharp(photo)
  const [basDroite, hautGauche, refBasDroite, refHautGauche] = await Promise.all([
    quart(grand, 450, 450), quart(grand, 0, 0), quart(original, 450, 450), quart(original, 0, 0),
  ])
  exige(!basDroite.equals(refBasDroite), 'le logo doit etre pose en bas a droite')
  exige(hautGauche.equals(refHautGauche), 'rien ne doit etre pose ailleurs que dans le coin choisi')

  serveur.close()
  await (await import('fs/promises')).rm('storage', { recursive: true, force: true })
}

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
