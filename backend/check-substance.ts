import { readFileSync } from 'node:fs'
import { descriptionCreuse, substanceSource } from './src/services/sourceQuality.js'

/**
 * Ce qu'on refuse d'écrire faute de matière.
 *
 *   cd backend && npx tsx check-substance.ts
 *
 * **Les textes de ce banc ne sont pas inventés** : ce sont les descriptions
 * réellement stockées le 02/09/2026 sur les annonces Temu que le vendeur a
 * jetées, relues en base. C'est la seule façon d'être sûr que le contrôle
 * reconnaît la chose qu'il est censé reconnaître, et non une imitation
 * commode.
 *
 * Le danger de ce contrôle est le faux positif : refuser une vraie description
 * parce qu'elle est courte priverait le vendeur de sa réécriture. La moitié des
 * cas ci-dessous sert donc à vérifier qu'il ne refuse pas.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

// --- Les accroches SEO relevées en base --------------------------------------
console.log('\nLes descriptions réellement importées le 02/09/2026')
{
  const cas = [
    {
      titre: 'chaussures performance professionnelle baskets décontractées - Temu France',
      description:
        'Trouvez des offres incroyables sur chaussures de  performance professionnelle, baskets décontractées, chaussures de course confortables et respirantes, semelle en caoutchouc, antidérapantes, résistantes à lusure sur Temu. Magasinez sur Temu pour   à économiser.',
    },
    {
      titre: 'bague   équerre carrée   symbole lœil   - Temu France',
      description:
        'Trouvez bague   équerre carrée et   avec symbole de lœil  , motif incrusté de   baroque,   de la   mystérieuse, cadeau idéal pour hommes de  -maçonnerie libre, membres de la fraternité   Temu, qui fait   de notre dernière bijoux et accessoires   à magasiner en ligne dès  .',
    },
    {
      titre: 'collection   savage mpk papillon eau parfum homme 50ml - Temu France',
      description:
        'Trouvez des offres incroyables sur collection - savage mpk papillon eau de parfum homme 50ml sur Temu. Magasinez sur Temu pour économiser.',
    },
  ]

  for (const c of cas) {
    verifier(
      `« ${c.titre.slice(0, 45)}… » : accroche reconnue`,
      descriptionCreuse(c.description, c.titre),
      `${c.description.length} caractères, aucun apport au titre`,
    )
  }
}

// --- Une vraie description passe ---------------------------------------------
console.log('\nCe qui ne doit surtout pas être refusé')
{
  /*
   * Une fiche AliExpress lue pour de vrai. Courte, mais chaque phrase apporte
   * un fait que le titre n'a pas : mouvement, verre, étanchéité, matière.
   */
  const vraie = {
    titre: 'Montre homme automatique squelette bracelet acier inoxydable',
    description:
      "Mouvement mécanique automatique à remontage manuel, 22 rubis. Verre minéral trempé anti-rayures. Boîtier de 42 mm en acier 316L, épaisseur 12 mm. Étanchéité 3 ATM, résiste aux éclaboussures. Fond transparent laissant voir le balancier. Fermoir déployant à double sécurité. Livrée dans un écrin.",
  }
  verifier('une description technique réelle est gardée', !descriptionCreuse(vraie.description, vraie.titre))
  verifier(
    "et elle suffit à écrire, sans même le texte de page",
    substanceSource({ title: vraie.titre, description: vraie.description }).assezPourEcrire,
  )

  // Un marchand honnête qui écrit trois lignes : peu de mots, mais des vrais.
  const courte = {
    titre: 'Sac banane toile enduite',
    description:
      'Toile enduite déperlante, doublure polyester. Une poche zippée intérieure, deux compartiments. Sangle réglable de 70 à 120 cm. Dimensions 34 x 15 x 8 cm. Poids 240 g.',
  }
  verifier('une description courte mais réelle est gardée', !descriptionCreuse(courte.description, courte.titre))
}

// --- Le texte de page rattrape une accroche creuse ---------------------------
console.log("\nQuand l'accroche est creuse mais que la page a été lue")
{
  const titre = 'casquette   rétro dextérieur écusson brodé   - Temu France'
  const accroche = 'Trouvez des offres incroyables sur casquette rétro sur Temu. Magasinez sur Temu pour économiser.'

  /*
   * C'est le cas qu'il faut absolument laisser passer : sur Temu la description
   * sera toujours creuse, mais le corps de la fiche, lui, porte la matière.
   * Refuser ici rendrait Temu inutilisable.
   */
  const corps = `CARACTÉRISTIQUES
Matière : coton sergé 100 %, doublure maille
Fermeture : boucle métal réglable
Tour de tête : 56 à 60 cm
Visière : préformée, 7 cm
Broderie : écusson appliqué en fil polyester
Entretien : lavage à la main, séchage à plat
Saison : printemps, été, mi-saison
Poids : 95 grammes
Coloris disponibles : kaki, marine, sable, noir`

  const avec = substanceSource({ title: titre, description: accroche, pageText: corps })
  verifier('la réécriture est autorisée', avec.assezPourEcrire, `raison : ${avec.raison ?? 'aucune'}`)
  verifier(
    "et l'accroche publicitaire n'est pas transmise au modèle",
    avec.description === null,
    'le modèle lit le corps de la page, pas la balise SEO',
  )
}

// --- Sans matière, on refuse -------------------------------------------------
console.log("\nQuand il n'y a rien à écrire")
{
  const titre = 'bague   équerre carrée   symbole lœil   - Temu France'
  const accroche =
    'Trouvez bague équerre carrée et avec symbole de lœil sur Temu, qui fait de notre dernière bijoux et accessoires à magasiner en ligne.'

  // Ce que Temu sert quand la fiche ne s'est pas affichée : le mur de
  // vérification et le bandeau cookies. Constaté le 03/09/2026 dans le
  // navigateur : `body.verifyDialog`, 1404 caractères, aucun produit.
  const mur = `Paramètres de confidentialité et des cookies
Nous utilisons des cookies et des technologies similaires pour fournir notre Service.
Personnaliser les cookies
Tout refuser
Tout accepter
Vérification de la sécurité
Glissez pour compléter le puzzle
Actualiser`

  const sans = substanceSource({ title: titre, description: accroche, pageText: mur })
  verifier('la réécriture est refusée', !sans.assezPourEcrire)
  verifier('et la raison dit quoi faire', /faites-la défiler/.test(sans.raison ?? ''), sans.raison ?? '')

  const rien = substanceSource({ title: titre, description: accroche, pageText: '' })
  verifier('une page absente est refusée aussi', !rien.assezPourEcrire)
}

// --- Le branchement dans la réécriture ---------------------------------------
console.log('\nCe que la réécriture en fait')
{
  const source = readFileSync('src/services/aiEnhancer.ts', 'utf8')
  verifier('la substance est mesurée avant tout appel au modèle', /substanceSource\(input\)/.test(source))
  verifier(
    'un refus rend le texte source et sa raison, sans facturer',
    /if \(!substance\.assezPourEcrire\)/.test(source) && /raison: substance\.raison/.test(source),
  )
  verifier(
    "l'accroche creuse n'est pas transmise",
    /description: substance\.description \?\? ''/.test(source),
  )
  verifier(
    'mais le repli garde bien le texte d’origine',
    /resultat\.enhanced \? resultat : \{ \.\.\.passthrough\(\), raison: resultat\.raison \}/.test(source),
  )
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
