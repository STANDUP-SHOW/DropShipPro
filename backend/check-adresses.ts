import { apiBaseUrl, absoluteUrl, frontendUrl } from './src/lib/urls.js'

/**
 * Éprouve la fabrication des adresses absolues.
 *
 * **Ce banc naît d'un défaut vu en production le 02/09/2026.**
 * `PUBLIC_API_URL` portait la même liste que `FRONTEND_URL` —
 * « https://drop-shipper.fr, https://www.drop-shipper.fr » — et chaque adresse
 * de photo devenait cette chaîne collée à un chemin. La vitrine n'affichait
 * aucun produit, et surtout **les flux Meta et Google servaient des photos
 * injoignables depuis le premier jour**, sans que rien ne le dise : un article
 * sans photo valide est rejeté du catalogue, en silence.
 *
 * Les deux variables se ressemblent et se remplissent à la suite. Ce banc
 * vérifie que le code s'en sort tout seul plutôt que de compter sur une
 * configuration juste.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const initial = { api: process.env.PUBLIC_API_URL, front: process.env.FRONTEND_URL }
const poser = (v?: string) => {
  if (v === undefined) delete process.env.PUBLIC_API_URL
  else process.env.PUBLIC_API_URL = v
}

console.log('Une adresse simple passe telle quelle :')
poser('https://api.exemple.fr')
exige(apiBaseUrl() === 'https://api.exemple.fr', `obtenu ${apiBaseUrl()}`)
poser('https://api.exemple.fr/')
exige(apiBaseUrl() === 'https://api.exemple.fr', `la barre finale doit tomber : ${apiBaseUrl()}`)

console.log('\nUne liste est ramenée à sa première adresse — le défaut du 02/09 :')
poser('https://drop-shipper.fr, https://www.drop-shipper.fr')
exige(apiBaseUrl() === 'https://drop-shipper.fr', `obtenu ${apiBaseUrl()}`)
exige(
  absoluteUrl('/storage/produits/x.jpg') === 'https://drop-shipper.fr/storage/produits/x.jpg',
  `photo mal composée : ${absoluteUrl('/storage/produits/x.jpg')}`,
)
// Le point qui compte : plus aucune virgule ni espace dans une adresse servie.
exige(!absoluteUrl('/storage/x.jpg').includes(','), 'une virgule reste dans l adresse')
exige(!absoluteUrl('/storage/x.jpg').includes(' '), 'un espace reste dans l adresse')

console.log("\nUne valeur qui n'est pas une adresse est ignorée :")
poser('pk_test_51Abc')
exige(!apiBaseUrl().startsWith('pk_test'), `une cle Stripe ne doit pas devenir une adresse : ${apiBaseUrl()}`)
exige(apiBaseUrl().startsWith('http'), `il faut un repli http : ${apiBaseUrl()}`)
poser('drop-shipper.fr')
exige(apiBaseUrl().startsWith('http'), `une adresse sans schema est refusee : ${apiBaseUrl()}`)

console.log('\nSans variable, le repli local reste utilisable :')
poser(undefined)
exige(apiBaseUrl().startsWith('http://localhost:'), `obtenu ${apiBaseUrl()}`)

console.log('\nUne adresse deja absolue n est jamais reprefixee :')
poser('https://api.exemple.fr')
exige(absoluteUrl('https://cdn.ailleurs.fr/x.jpg') === 'https://cdn.ailleurs.fr/x.jpg', 'http conserve')
exige(absoluteUrl('') === '', 'une adresse vide reste vide')
// Un chemin sans barre initiale ne doit pas coller au domaine : « …frstorage »
// n existe pas, et c est le genre d erreur qu on ne lit pas dans un flux XML.
exige(absoluteUrl('storage/x.jpg') === 'https://api.exemple.fr/storage/x.jpg', `obtenu ${absoluteUrl('storage/x.jpg')}`)

console.log("\nL adresse du site, elle, prend deja la premiere de la liste :")
process.env.FRONTEND_URL = 'https://www.drop-shipper.fr, https://drop-shipper.fr'
exige(frontendUrl() === 'https://www.drop-shipper.fr', `obtenu ${frontendUrl()}`)

poser(initial.api)
if (initial.front === undefined) delete process.env.FRONTEND_URL
else process.env.FRONTEND_URL = initial.front

console.log(echecs === 0 ? '\nAdresses absolues : tout passe.' : `\nAdresses absolues : ${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
