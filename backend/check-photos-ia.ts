import { PARTIS_PRIS, choisirPartiPris, ecrireBrief, briefEnConsigne } from './src/services/photoBriefer.js'

/**
 * Éprouve la variété des photos générées.
 *
 * **Le défaut qui a motivé ce banc, signalé le 02/09/2026 :** « je regénère six
 * photos, elle me fait six fois la même ». La boucle envoyait six fois
 * exactement le même prompt, avec les mêmes images de référence. Il n'y avait
 * aucune raison qu'un modèle d'image rende autre chose que six fois la même
 * image.
 *
 * Ce que ce banc vérifie, et c'est le point : **la variété ne dépend d'aucun
 * appel réseau**. Le parti pris est déterministe. Sans clé, sans modèle, six
 * photos demandées donnent quand même six mises en scène différentes — sinon la
 * variété serait une option, pas une garantie.
 *
 * Ne touche aucune base et n'appelle le modèle que si la clé est là.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

// --- La variété, sans réseau -------------------------------------------------

console.log('Six demandes de suite donnent six partis pris differents :')
const servis: string[] = []
for (let i = 0; i < 6; i++) {
  const p = choisirPartiPris(servis)
  exige(!servis.includes(p.cle), `le parti pris « ${p.cle} » revient au tour ${i + 1}`)
  servis.push(p.cle)
  console.log(`  ${i + 1}. ${p.cle}`)
}
exige(new Set(servis).size === 6, `${new Set(servis).size} partis pris distincts sur 6`)

// Au-delà de la liste, on recommence plutôt que de rendre rien : sept photos
// demandées doivent donner sept images, la septième ressemblant à la première.
console.log('\nAu-dela de la liste, on recommence au lieu de refuser :')
const septieme = choisirPartiPris(PARTIS_PRIS.map((p) => p.cle))
exige(Boolean(septieme?.cle), 'aucun parti pris rendu quand tous sont servis')
exige(septieme.cle === PARTIS_PRIS[0].cle, `attendu ${PARTIS_PRIS[0].cle}, obtenu ${septieme.cle}`)

console.log('\nChaque parti pris decrit une mise en scene, pas le produit :')
for (const p of PARTIS_PRIS) {
  exige(p.consigne.length > 60, `${p.cle} : consigne trop courte pour cadrer une image`)
  /*
   * Un parti pris qui décrirait le produit ferait vendre autre chose que ce qui
   * sera livré. Le produit est réel, il est sur les photos de référence.
   */
  exige(
    !/(couleur|coloris|rouge|bleu|marque|logo)/i.test(p.consigne),
    `${p.cle} : la consigne parle du produit au lieu de la scene`,
  )
}
console.log(`  (${PARTIS_PRIS.length} verifies)`)

// --- Le repli sans clé -------------------------------------------------------

const cleInitiale = process.env.ANTHROPIC_API_KEY
delete process.env.ANTHROPIC_API_KEY

console.log("\nSans cle, le brief retombe sur le parti pris et varie quand meme :")
const sansCle: string[] = []
for (let i = 0; i < 4; i++) {
  const b = await ecrireBrief({ titre: 'Montre automatique homme', dejaVus: sansCle })
  exige(Boolean(b.scene), 'un brief vide ne sert a rien')
  exige(!sansCle.includes(b.partiPris), `le parti pris « ${b.partiPris} » revient sans cle`)
  sansCle.push(b.partiPris)
}
exige(new Set(sansCle).size === 4, `${new Set(sansCle).size} scenes distinctes sur 4 sans cle`)

if (cleInitiale === undefined) delete process.env.ANTHROPIC_API_KEY
else process.env.ANTHROPIC_API_KEY = cleInitiale

// --- La mise en consigne -----------------------------------------------------

console.log('\nLe brief se met en phrases sans ligne vide ni etiquette orpheline :')
const consigne = briefEnConsigne({
  scene: 'Sur un etabli en bois clair, copeaux au sol',
  lumiere: 'Lumiere laterale de fenetre, ombres douces',
  cadrage: 'Trois quarts, hauteur de table',
  entourage: 'rien',
  partiPris: 'usage',
})
exige(consigne.includes('Décor :'), 'le decor manque')
exige(consigne.includes('Lumière :'), 'la lumiere manque')
// « rien » est une réponse valide du modèle, et l'écrire produirait « Autour du
// produit : rien », une phrase qui dit au modèle d'image de dessiner du vide.
exige(!consigne.includes('Autour du produit'), '« rien » ne doit pas devenir une consigne')
exige(!consigne.includes('\n\n'), 'une ligne vide subsiste dans la consigne')

const minimal = briefEnConsigne({ scene: 'Studio fond uni', lumiere: '', cadrage: '', entourage: '', partiPris: 'studio' })
exige(minimal === 'Décor : Studio fond uni', `un brief minimal doit rester propre : « ${minimal} »`)

console.log(echecs === 0 ? '\nVariete des photos : tout passe.' : `\nVariete des photos : ${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
