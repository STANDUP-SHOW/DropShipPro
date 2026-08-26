import { diagnostiquerJetonShopify } from './src/services/shopifyToken.js'

/**
 * Éprouve le diagnostic des jetons Shopify.
 *
 * Le cas qui a coûté une soirée à un vendeur est le premier de la liste : un
 * jeton `atkn_` pris dans le Dev Dashboard, à un endroit qui s'appelle « Jeton
 * d'automatisation d'appli » et dont la page dit elle-même qu'il ne sert qu'aux
 * flux CI/CD. L'ancien message lui répondait « ce jeton ne ressemble pas à un
 * jeton d'accès Admin », ce qui l'a fait relire son jeton dix fois au lieu de
 * changer de page.
 */
const CORPS = 'a'.repeat(38)

const CAS: Array<[string, 'accepte' | 'refuse', RegExp | null]> = [
  // Ce que le vendeur avait collé.
  [`atkn_${CORPS}`, 'refuse', /automatisation|CI\/CD/i],
  // Les jetons qui doivent passer. shpca_ notamment : c'est celui des apps
  // personnalisées, et l'ancien contrôle le refusait alors qu'il fonctionne.
  [`shpat_${CORPS}`, 'accepte', null],
  [`shpca_${CORPS}`, 'accepte', null],
  [`shppa_${CORPS}`, 'accepte', null],
  [`shpua_${CORPS}`, 'accepte', null],
  // Les autres confusions courantes.
  [`shpss_${CORPS}`, 'refuse', /secret partagé/i],
  [`shptka_${CORPS}`, 'refuse', /thème|theme/i],
  // Un préfixe seul : copier-coller raté.
  ['shpat_abc', 'refuse', /incomplet/i],
  // N'importe quoi.
  ['mon-mot-de-passe', 'refuse', /shpat_/],
  // Les espaces autour ne doivent pas faire échouer un jeton valide : c'est ce
  // qu'un copier-coller produit une fois sur deux.
  [`  shpat_${CORPS}  `, 'accepte', null],
]

let echecs = 0
for (const [jeton, attendu, motif] of CAS) {
  const resultat = diagnostiquerJetonShopify(jeton)
  const apercu = jeton.trim().slice(0, 12)

  if (attendu === 'accepte' && resultat !== null) {
    echecs++
    console.log(`ECHEC ${apercu}… devrait passer, refusé : « ${resultat} »`)
  }
  if (attendu === 'refuse') {
    if (resultat === null) {
      echecs++
      console.log(`ECHEC ${apercu}… devrait être refusé, accepté`)
    } else if (motif && !motif.test(resultat)) {
      echecs++
      console.log(`ECHEC ${apercu}… message hors sujet : « ${resultat} »`)
    }
  }
}

console.log(echecs === 0 ? 'Diagnostic des jetons Shopify : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
