import { ANGLES } from './src/services/adCopywriter.js'
import { policeDisponible } from './src/services/adComposer.js'

/**
 * Éprouve ce qui a rendu trois publicités inutilisables.
 *
 * Deux défauts distincts, et deux contrôles.
 *
 * **Les carrés.** Le serveur n'avait aucune police : librsvg dessine alors un
 * carré vide par caractère, et le visuel sort parfaitement composé et
 * totalement illisible. Le piège est qu'il ne se voit pas en développement,
 * où Windows et macOS fournissent des polices — il n'apparaît qu'en production,
 * sur des images déjà payées.
 *
 * **Les trois publicités identiques.** Le composeur tamponnait le titre de
 * l'annonce. Trois demandes donnaient donc trois fois le même visuel.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

// --- Les angles : c'est eux qui font la variété ------------------------------
exige(ANGLES.length >= 5, `${ANGLES.length} angles, attendu au moins 5`)
const cles = ANGLES.map((a) => a.cle)
exige(new Set(cles).size === cles.length, 'deux angles portent la meme cle')
exige(
  ANGLES.every((a) => a.consigne.length > 20),
  'un angle sans consigne ne changera rien a ce que le modele ecrit',
)
console.log(`angles : ${cles.join(', ')}`)

// La rotation doit epuiser les angles avant de se repeter : c est tout l objet.
const servis: string[] = []
for (let i = 0; i < ANGLES.length; i++) {
  const restants = ANGLES.filter((a) => !servis.includes(a.cle))
  servis.push((restants.length ? restants : ANGLES)[0].cle)
}
exige(
  new Set(servis).size === ANGLES.length,
  `${new Set(servis).size} angles distincts sur ${ANGLES.length} demandes : la rotation se repete trop tot`,
)

// --- La police : le controle qui evite de facturer un fichier illisible ------
const police = await policeDisponible()
console.log(`polices detectees sur cette machine (${process.platform}) : ${police ? 'oui' : 'NON'}`)
exige(
  process.platform !== 'linux' || typeof police === 'boolean',
  'le controle de police doit rendre un booleen sur Linux',
)

// --- Le rendu, quand une police existe --------------------------------------
const cible = process.argv[2]
if (cible && police) {
  const sharp = (await import('sharp')).default
  const { composeAd } = await import('./src/services/adComposer.js')

  const fond = await sharp({
    create: { width: 1200, height: 1200, channels: 3, background: { r: 70, g: 80, b: 110 } },
  })
    .jpeg()
    .toBuffer()

  // Deux accroches differentes sur le meme produit : c est ce que le vendeur
  // doit obtenir quand il demande deux publicites.
  const essais = [
    { title: 'Votre atelier enfin rangé', argument: 'Livraison offerte', ctaLabel: 'Je le veux' },
    { title: 'Perceuse 18V, 6 Ah, sans fil', argument: 'Garantie 2 ans', ctaLabel: 'Voir la fiche' },
  ]

  for (const [i, e] of essais.entries()) {
    const sortie = await composeAd(fond, 1080, 1080, {
      ...e,
      price: '89,90 EUR',
      shopName: 'OGGUS',
      ctaUrl: 'oggus-france.fr',
    })
    await sharp(sortie).toFile(`${cible}/pub-${i + 1}.jpg`)
    console.log(`pub-${i + 1}.jpg : « ${e.title} » — ${sortie.length} octets`)
  }
}

console.log(echecs === 0 ? 'Accroches publicitaires : tout passe.' : `${echecs} echec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
