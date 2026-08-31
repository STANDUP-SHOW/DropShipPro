import { lireTitre, genreDe, accorderAuGenre, sourceSansValeur } from './src/services/categoryLexicon.js'

/**
 * Éprouve la lecture de la catégorie dans le titre.
 *
 * Le banc part des vrais titres de la base, et d'abord des seize qui étaient
 * rangés dans « Jouets et jeux > Figurines et jouets d'action » le 31/08/2026 :
 * souris, mini-PC, perceuses Makita, bagues connectées, un aspirateur. Aucun
 * n'était ambigu — c'est la catégorie annoncée par AliExpress, `« la catégorie
 * Maison »`, qui les avait tous rassemblés sous un même alias.
 *
 * Ne tape aucune base : le lexique est déterministe, et le banc doit pouvoir
 * tourner sans connexion.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const range = (titre: string, attendu: string) => {
  const lecture = lireTitre(titre)
  const obtenu = lecture ? accorderAuGenre(lecture.chemin, genreDe(titre)) : 'AUCUNE'
  exige(obtenu === attendu, `« ${titre.slice(0, 46)} » -> ${obtenu}\n         attendu ${attendu}`)
}

// --- Les seize sinistrés ----------------------------------------------------

console.log('Les produits qui étaient dans « Figurines et jouets d\'action » :')
range('Souris Verticale Sans Fil Ergonomique avec Écran OLED', 'Électronique > Informatique et accessoires PC')
range('Souris Ergonomique Verticale sans Fil 2.4G 2400 DPI', 'Électronique > Informatique et accessoires PC')
range('Mini PC Gaming Intel Core i9-10980HK 16 Go DDR4 SSD 1 To', 'Électronique > Informatique et accessoires PC')
range('Mini PC SZ BOX UM790 Pro AMD Ryzen 9 7940HS', 'Électronique > Informatique et accessoires PC')
range('Perceuse visseuse à percussion sans fil Makita DDF484', 'Outils et bricolage > Outillage électroportatif')
range('Aspirateur balai sans fil 70KPA 550W autonomie 45 min', 'Appareils électroménagers > Aspirateurs et nettoyage')
range('Bague Connectée R08 Contrôle Tactile Moniteur Santé', 'Téléphones portables et accessoires > Montres et bracelets connectés')
range('SMART RING IA - Bague Connectée Intelligente 2026', 'Téléphones portables et accessoires > Montres et bracelets connectés')

// Celui-là était bien une figurine : la règle ne doit pas le perdre en route.
range('Présentoir Logo GTA 6 en 3D - Figurine Décorative', 'Jouets et jeux > Figurines et jouets d\'action')
console.log('  (9 vérifiés)\n')

// --- Le reste du catalogue réel ---------------------------------------------

range('Tronçonneuse Thermique 45cm Guide Chaîne Élagage Abattage', 'Terrasse, pelouse et jardin > Outillage de jardin')
range('Cafetière Italienne 6 Tasses Inox Brossé - Moka Express', 'Appareils électroménagers > Cafetières et théières électriques')
range('Téléviseur Samsung 55 pouces 4K Crystal UHD Smart TV', 'Électronique > Télévisions et vidéoprojecteurs')
range('Mini Amplificateur Audio Stéréo 2 Canaux 200W×2', 'Électronique > Audio (enceintes, casques)')
range('Contrôleur MIDI sans fil 16 pads RGB rétroéclairés', 'Électronique > Sonorisation et micros')
range('Eau de Parfum Homme OGUSS ANTHOLOGY 100 ml', 'Beauté et santé > Parfums')
range('Lunettes de Vue Homme Monture Large Rectangulaire', 'Bijoux et accessoires > Lunettes de soleil et montures')
range('Trousse de Toilette Homme Vintage Gentleman Imprimée', 'Sacs et bagages > Accessoires de voyage (organiseurs, étiquettes)')
range('Bracelet Homme Acier Inoxydable 316L Motif Arbre de Vie', 'Bijoux et accessoires > Bracelets')
range('Baskets Homme Rétro Noires Respirantes Semelle Souple', 'Chaussures > Baskets et sneakers')
range('Chaussons Homme Intérieur Extérieur Confortables', 'Chaussures > Chaussures homme (ville, mocassins)')
range('Lot de 6 Boxers Homme Confortables Respirants', 'Vêtements pour hommes > Sous-vêtements')
range('Short Homme Velours avec Cordon Serrage et Poches', 'Vêtements pour hommes > Shorts')
// Une télécommande de volant, pas une housse : mon attente était fausse au banc.
range('Bouton de Commande sans Fil pour Volant Universel', 'Automobile > Accessoires et appareils pour voiture')

// --- La distinction qui compte : connecté ou pas -----------------------------

console.log('\nMontres et bagues : le « connecté » change de rayon.')
range('Montre Homme Automatique HERITOR Semi-Squelette', 'Bijoux et accessoires > Montres')
range('Montre Connectée Homme Écran AMOLED GPS', 'Téléphones portables et accessoires > Montres et bracelets connectés')
range('Bague Anti-Stress Rotative Argent S925', 'Bijoux et accessoires > Bagues')
range('Bracelet Connecté Fitness Cardio', 'Téléphones portables et accessoires > Montres et bracelets connectés')

// --- Les gardes : un même mot, deux familles ---------------------------------

console.log('\nLes gardes, sur des mots qui se disputent :')
range('Housse de Siège Voiture Universelle Cuir', 'Automobile > Housses de siège et de volant')
range('Housse Téléphone Silicone Antichoc', 'Téléphones portables et accessoires > Coques et housses')
range('Gants Moto Cuir Homologués CE', 'Motos et sports motorisés > Équipement pilote (casques, gants, blousons)')
range('Vélo Électrique Pliant 25 km/h', 'Motos et sports motorisés > Trottinettes et vélos électriques')
range('Casque Vélo VTT Ajustable', 'Sports et loisirs de plein air > Cyclisme')

// --- Le genre ---------------------------------------------------------------

console.log('\nLe genre, lu dans le titre :')
exige(genreDe('Chemise Homme Slim Coton') === 'Homme', 'genre homme')
exige(genreDe('Robe Femme Été Fleurie') === 'Femme', 'genre femme')
exige(genreDe('Baskets Enfant Scratch') === 'Enfant', 'genre enfant')
exige(genreDe('Montre Unisexe Acier') === 'Mixte', 'genre mixte annoncé')
// Les deux nommés, c'est mixte — pas « le premier trouvé ». Retenir « Homme »
// ici ferait rater la moitié des acheteurs sur une place qui filtre par genre.
exige(genreDe('Bague Anti-Stress Rotative Homme Femme Argent') === 'Mixte', 'homme + femme = mixte')
exige(genreDe('Perceuse sans fil 18V') === null, 'aucun genre sur un outil')

// Le rayon bascule avec le genre : les règles de vêtements visent l'homme par
// défaut, parce que « chemise » ne dit rien du genre. Le titre, lui, le dit.
range('T-shirt Femme Coton Bio Col Rond', 'Vêtements pour femmes > Hauts et T-shirts')
range('Pull Femme Maille Torsadée', 'Vêtements pour femmes > Pulls et sweats')
range('Manteau Femme Long Laine', 'Vêtements pour femmes > Manteaux et vestes')
range('Jean Femme Taille Haute', 'Vêtements pour femmes > Jeans')
range('Chemise Homme Lin Manches Longues', 'Vêtements pour hommes > Chemises')
range('Chaussures Femme Escarpins Talons 8 cm', 'Chaussures > Chaussures femme (talons, ballerines)')
range('Chaussures Enfant Scratch Semelle Souple', 'Chaussures > Chaussures enfant')

// --- Les catégories source sans valeur ---------------------------------------

console.log('\nLes catégories annoncées qui ne veulent rien dire :')
for (const mauvaise of [
  'la catégorie Maison',
  'Accueil',
  'Tous les produits',
  'Nouveautés',
  'Divers',
  'Articles',
  '',
  null,
]) {
  exige(sourceSansValeur(mauvaise), `« ${mauvaise} » devrait être refusée comme clé`)
}

// Et celles qui en ont une doivent passer : refuser trop ferait perdre la
// mémoire, qui est ce qui rend l'apprentissage gratuit.
for (const bonne of ['Montres homme', 'Électronique > Souris', 'Bijoux', 'Chaussures de sport']) {
  exige(!sourceSansValeur(bonne), `« ${bonne} » devrait être acceptée comme clé`)
}

// --- L'ambiguïté franche ne décide pas ---------------------------------------

console.log('\nCe que le lexique refuse de trancher :')
exige(lireTitre('Article non spécifié') === null, 'un titre vide de sens ne range rien')
exige(lireTitre('Coffret cadeau surprise') === null, 'un titre sans objet identifiable ne range rien')
// --- Le bracelet qui n en est pas un ----------------------------------------
//
// Sept montres du catalogue etaient rangees en bijouterie de poignet : leur
// titre decrivait le bracelet de la montre. A poids egal, la departageuse
// retenait le motif le plus long -- « bracelet » fait huit lettres, « montre »
// six. Un titre qui dit « montre » designe une montre, meme s il detaille son
// bracelet.

console.log('\nMontres dont le titre parle de leur bracelet :')
range('Montre Homme Analogique Quartz Cadran Rond Bracelet Acier Inoxydable', 'Bijoux et accessoires > Montres')
range('Montre Homme en Bois Naturel Chronographe Design', 'Bijoux et accessoires > Montres')
range('Montre Automatique Squelette Homme Conrad Heritor', 'Bijoux et accessoires > Montres')
// Et le bracelet seul reste un bracelet.
range('Bracelet Homme Acier Inoxydable 316L Motif Arbre de Vie', 'Bijoux et accessoires > Bracelets')
// La piece detachee ne se tranche pas : les deux regles s ecartent, et le
// modele decide. Mieux vaut passer la main que ranger de travers.
exige(lireTitre('Bracelet de Montre Cuir Italien 22 mm') === null, 'un bracelet de montre est ambigu et doit passer au modele')

// --- Le pluriel, qui traversait les gardes ----------------------------------

console.log('\nLe pluriel, a l interieur des expressions :')
range('Caméras de Recul Sans Fil pour Voiture', 'Automobile > Systèmes de conduite intelligents')
range('Housses de Siège Voiture Cuir Universelles', 'Automobile > Housses de siège et de volant')

// « Gilet » se dispute entre trois familles : le vêtement, l'équipement de
// sécurité routière et la musculation. Seule la première est une règle.
range('Gilet de Sécurité Jaune Haute Visibilité', 'AUCUNE')
range('Gilet Homme Maille Sans Manches', 'Vêtements pour hommes > Pulls et sweats à capuche')

console.log(
  echecs === 0 ? '\nLecture du titre : tout passe.' : `\nLecture du titre : ${echecs} echec(s).`,
)
process.exit(echecs === 0 ? 0 : 1)
