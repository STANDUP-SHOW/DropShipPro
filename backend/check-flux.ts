import { absoluteUrl } from './src/lib/urls.js'

/**
 * Éprouve ce que le flux public promet à une vitrine.
 *
 * **Le défaut qui a motivé ce banc, constaté le 02/09/2026.** Le catalogue
 * servait ses photos en `/storage/…`, des chemins qui ne veulent rien dire hors
 * de notre serveur. Une vitrine hébergée ailleurs n'affichait donc **aucune**
 * photo — sauf pour les produits récents, dont l'adresse est celle du
 * fournisseur et se trouve déjà absolue. D'où le symptôme, parfaitement
 * trompeur : « les anciens produits n'ont pas de photos, les nouveaux oui ».
 *
 * La vitrine d'OGGUS n'en souffrait pas : elle préfixe elle-même, avec
 * l'adresse de notre API écrite en dur dans son code. C'est exactement ce qu'un
 * flux ne doit pas exiger de ses lecteurs — chaque nouvelle boutique aurait eu à
 * redécouvrir la règle, puis à la coder.
 *
 * Ne touche aucune base : c'est la composition des adresses qui est en cause,
 * pas leur contenu.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

process.env.PUBLIC_API_URL = 'https://api.exemple.fr'

/** Ce que `toCatalogItem` fait des photos : la même transformation, isolée. */
const photosDuFlux = (images: string[]) => images.map(absoluteUrl)

console.log('Un chemin local devient une adresse joignable de partout :')
const local = photosDuFlux(['/storage/products/veste-1-8e089458.jpg'])
exige(
  local[0] === 'https://api.exemple.fr/storage/products/veste-1-8e089458.jpg',
  `obtenu ${local[0]}`,
)
exige(local[0].startsWith('https://'), 'une vitrine tierce ne sait pas resoudre un chemin relatif')

console.log("\nUne adresse de fournisseur, deja absolue, n est pas reprefixee :")
const fournisseur = photosDuFlux(['https://cdn.temu.com/x.jpg', 'http://img.aliexpress.com/y.jpg'])
exige(fournisseur[0] === 'https://cdn.temu.com/x.jpg', `obtenu ${fournisseur[0]}`)
exige(fournisseur[1] === 'http://img.aliexpress.com/y.jpg', `obtenu ${fournisseur[1]}`)
// C est le piege qui rendait le defaut invisible : ces photos-la marchaient
// partout, et faisaient croire que le flux allait bien.
exige(!fournisseur[0].includes('api.exemple.fr'), 'une adresse de fournisseur ne doit pas etre prefixee')

console.log('\nUn lot melange -- anciens et nouveaux produits -- sort entierement absolu :')
const melange = photosDuFlux([
  '/storage/products/ancien-1.jpg',
  'https://cdn.fournisseur.com/recent-1.jpg',
  '/storage/products/ancien-2.jpg',
])
exige(melange.every((u) => /^https?:\/\//.test(u)), `des chemins relatifs subsistent : ${melange.join(' | ')}`)
exige(melange.length === 3, 'aucune photo ne doit disparaitre en chemin')

console.log("\nUne vitrine qui prefixe deja -- celle d OGGUS -- ne double pas le prefixe :")
/*
 * Sa règle : `src.startsWith("http") ? src : FEED_BASE + src`. En lui envoyant
 * désormais de l'absolu, elle passe simplement le premier test. C'est ce qui
 * rend le changement sûr pour les boutiques déjà branchées.
 */
const commeOggus = (src: string) => (src.startsWith('http') ? src : `https://autre-base.fr${src}`)
for (const u of photosDuFlux(['/storage/products/x.jpg', 'https://cdn.temu.com/y.jpg'])) {
  exige(commeOggus(u) === u, `la vitrine reprefixerait : ${commeOggus(u)}`)
}

console.log('\nUne liste vide reste vide, et rien n est invente :')
exige(photosDuFlux([]).length === 0, 'aucune photo ne doit apparaitre de nulle part')
exige(absoluteUrl('') === '', 'une adresse vide reste vide')

console.log(echecs === 0 ? '\nPhotos du flux : tout passe.' : `\nPhotos du flux : ${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
