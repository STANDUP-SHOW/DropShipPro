import {
  analyserBoutiques,
  analyserFournisseurs,
  analyserMarketplaces,
  analyserPublicites,
  bibliothequesPublicitaires,
  type AppelModele,
  type OffreFournisseur,
  type SujetAnalyse,
} from './src/services/marketStudio.js'

/**
 * Éprouve le studio d'analyses : ce qu'on fait des réponses du modèle, et ce
 * qu'on calcule sans lui.
 *
 * **Le modèle est injecté, jamais appelé.** Même dispositif que
 * `check-shopify-categorie` : un faux rend le texte, et ce qui est éprouvé est
 * NOTRE lecture. C'est là que sont les fautes qui comptent — un modèle qui
 * répond bien ne sauve pas un code qui range mal, et un banc qui appelle le
 * vrai modèle coûte de l'argent, dépend du réseau et ne prouve rien de stable.
 *
 * **Ce que ce banc protège en priorité : ne rien inventer.** Un studio
 * d'analyses qui invente un prix, un annonceur ou une boutique est pire
 * qu'absent — le vendeur engage un budget publicitaire dessus. Les cas les plus
 * nombreux ci-dessous sont donc les réponses PAUVRES : champs manquants, JSON
 * cassé, prose sans JSON, adresses piégées. Dans tous ces cas la bonne réponse
 * est « je n'ai pas trouvé », jamais un chiffre plausible.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = ''): void {
  if (!condition) {
    echecs++
    console.log(`ECHEC ${nom}${detail ? `\n  ${detail}` : ''}`)
  }
}

const SUJET: SujetAnalyse = {
  intitule: 'écouteurs sans fil à réduction de bruit',
  pays: 'FR',
  achat: 12,
  vente: 39.9,
}

/** Un faux modèle qui rend exactement ce qu'on lui donne. */
function faux(reponse: string): AppelModele {
  return async () => reponse
}

/* ------------------------------------------------------------------ *
 * Volet 1 — places de marché.
 * ------------------------------------------------------------------ */

const bonneReponse = `Voici mon analyse.
{
  "synthese": "Marché encombré, la marge tient au-dessus de 35 €.",
  "prixBas": 24.9,
  "prixHaut": "59,90",
  "prixConseille": 39.9,
  "concurrence": "forte",
  "offres": [
    {"place": "Amazon", "vendeur": "SoundPro", "prix": 29.9, "note": 4.3, "url": "https://amazon.fr/dp/X"},
    {"place": "Cdiscount", "vendeur": null, "prix": null, "note": null, "url": "javascript:alert(1)"}
  ],
  "sources": ["https://amazon.fr/dp/X", "pas une adresse", "ftp://interdit.test/x"]
}
Fin.`

const m = await analyserMarketplaces(SUJET, faux(bonneReponse))
verifier('le JSON est lu même enrobé de prose', m.prixBas === 24.9)
verifier('un prix « 59,90 » à la française est lu', m.prixHaut === 59.9, `lu : ${m.prixHaut}`)
verifier('la concurrence est rendue', m.concurrence === 'forte')
verifier('les deux offres sont gardées', m.offres.length === 2)
verifier(
  "une adresse `javascript:` est écartée, pas recopiée dans un lien",
  m.offres[1].url === null,
  "elle finirait dans un href que le vendeur va cliquer",
)
verifier('un prix manquant reste null', m.offres[1].prix === null)
verifier(
  'les sources non-http sont écartées',
  m.sources.length === 1 && m.sources[0].startsWith('https://amazon.fr'),
  `gardées : ${JSON.stringify(m.sources)}`,
)

for (const pauvre of ['', 'je ne sais pas', '{', '{"synthese":}', 'null']) {
  const r = await analyserMarketplaces(SUJET, faux(pauvre))
  verifier(
    `une réponse inexploitable ne fabrique aucun chiffre : ${JSON.stringify(pauvre.slice(0, 14))}`,
    r.prixBas === null && r.prixHaut === null && r.prixConseille === null && r.offres.length === 0,
  )
  verifier(
    `une réponse inexploitable rend quand même une phrase honnête : ${JSON.stringify(pauvre.slice(0, 14))}`,
    r.synthese.length > 0,
  )
}

const trop = await analyserMarketplaces(
  SUJET,
  faux(
    JSON.stringify({
      offres: Array.from({ length: 40 }, (_, i) => ({ place: `P${i}`, prix: i, url: 'https://x.test' })),
    }),
  ),
)
verifier('les offres sont plafonnées à 15', trop.offres.length === 15, `rendu : ${trop.offres.length}`)

/* ------------------------------------------------------------------ *
 * Volet 2 — les publicités. Les bibliothèques sont la partie EXACTE.
 * ------------------------------------------------------------------ */

const biblios = bibliothequesPublicitaires('écouteurs sans fil & bluetooth', 'fr')
verifier('les deux bibliothèques sont composées', biblios.length === 2)
verifier(
  'Facebook Ad Library est visée',
  biblios[0].url.startsWith('https://www.facebook.com/ads/library/'),
  biblios[0].url,
)
verifier(
  'TikTok est visé',
  biblios[1].url.startsWith('https://library.tiktok.com/ads'),
  biblios[1].url,
)
verifier(
  "l'esperluette est encodée et ne coupe pas la requête",
  biblios[0].url.includes('%26') && !biblios[0].url.includes('sans%20fil%20&%20bluetooth'),
  biblios[0].url,
)
verifier(
  'le pays est mis en majuscules dans les deux adresses',
  biblios[0].url.includes('country=FR') && biblios[1].url.includes('region=FR'),
)

const p = await analyserPublicites(SUJET, faux('le modèle a divagué sans json'))
verifier(
  'sans matière, aucun annonceur n’est inventé',
  p.publicites.length === 0 && p.angles.length === 0,
)
verifier(
  'sans matière, les bibliothèques sont quand même rendues',
  p.bibliotheques.length === 2,
  "c'est la partie du volet qui ne dépend d'aucun modèle : elle doit toujours arriver",
)
verifier(
  'sans matière, la phrase renvoie vers les bibliothèques',
  p.synthese.toLowerCase().includes('bibliothèque'),
  p.synthese,
)

const p2 = await analyserPublicites(
  SUJET,
  faux(
    JSON.stringify({
      synthese: 'Niche disputée depuis janvier.',
      angles: ['preuve sociale', '', 'prix cassé'],
      publicites: [
        { annonceur: 'Marque X', plateforme: 'TikTok', angle: 'preuve', format: 'vidéo courte', depuis: 'mars 2026', url: 'https://tiktok.com/x' },
        { plateforme: 'Facebook' },
      ],
      sources: ['https://etude.test/a'],
    }),
  ),
)
verifier('les angles vides sont écartés', p2.angles.length === 2, JSON.stringify(p2.angles))
verifier('une publicité sans annonceur reste lisible', p2.publicites[1].annonceur.length > 0)
verifier('une publicité sans adresse rend null', p2.publicites[1].url === null)

/* ------------------------------------------------------------------ *
 * Volet 3 — boutiques comparables.
 * ------------------------------------------------------------------ */

const b = await analyserBoutiques(
  SUJET,
  faux(
    JSON.stringify({
      synthese: 'Deux spécialistes tiennent le haut de gamme.',
      boutiques: [
        { nom: 'Casque&Co', url: 'https://casque.test', positionnement: 'premium', gammePrix: '80 à 200 €', enAvant: ['ANC', ''] },
        { url: 'https://sans-nom.test' },
      ],
      sources: ['https://casque.test'],
    }),
  ),
)
verifier('les boutiques sont lues', b.boutiques.length === 2)
verifier('les mises en avant vides sont écartées', b.boutiques[0].enAvant.length === 1)
verifier('une boutique sans nom reste lisible', b.boutiques[1].nom.length > 0)

/* ------------------------------------------------------------------ *
 * Volet 4 — fournisseurs. Aucun modèle : la synthèse se CALCULE.
 * ------------------------------------------------------------------ */

function offre(fournisseur: string, prix: number | null): OffreFournisseur {
  return {
    ref: `${fournisseur}-1`,
    titre: 'Écouteurs sans fil',
    prix,
    devise: 'EUR',
    image: null,
    url: null,
    entrepot: null,
    fournisseur,
    fournisseurLabel: fournisseur.toUpperCase(),
  }
}

const f = analyserFournisseurs(SUJET, [offre('cj', 14.5), offre('aliexpress', 9.2), offre('bigbuy', null)])
verifier('la moins chère est trouvée', f.meilleure?.fournisseur === 'aliexpress', f.meilleure?.fournisseur)
verifier("l'écart est calculé sur les offres chiffrées", f.ecart === 5.3, `lu : ${f.ecart}`)
verifier(
  'une offre sans prix ne devient pas la moins chère',
  f.meilleure?.prix === 9.2,
  'null trié comme zéro ferait gagner une offre sans prix',
)
verifier('la marge est calculée au prix de vente', f.margePossible === 76.9, `lue : ${f.margePossible}`)
verifier('les trois offres restent affichées', f.offres.length === 3)
verifier('la synthèse nomme le meilleur fournisseur', f.synthese.includes('ALIEXPRESS'), f.synthese)
verifier(
  'les nombres de la synthèse sont écrits en français',
  f.synthese.includes('9,20') && f.synthese.includes('5,30') && !/[0-9]\.[0-9]/.test(f.synthese),
  'vu en production : la phrase disait « 3.09 EUR » à côté d’un tableau affichant « 3,09 EUR » — ' + f.synthese,
)

const seule = analyserFournisseurs(SUJET, [offre('cj', 14.5)])
verifier("un seul fournisseur ne produit pas d'écart", seule.ecart === null)

const perdante = analyserFournisseurs({ ...SUJET, vente: 8 }, [offre('cj', 14.5)])
verifier(
  'une marge négative est dite franchement',
  perdante.margePossible !== null && perdante.margePossible < 0 && perdante.synthese.includes('perdante'),
  perdante.synthese,
)

const vide = analyserFournisseurs(SUJET, [], [{ fournisseur: 'BigBuy', raison: 'Invalid Token' }])
verifier('sans offre, le refus du fournisseur est transmis tel quel', vide.synthese.includes('Invalid Token'), vide.synthese)
verifier('sans offre, aucune meilleure offre', vide.meilleure === null && vide.ecart === null)

const rien = analyserFournisseurs(SUJET, [])
verifier('aucun fournisseur, aucun refus : la phrase reste juste', rien.synthese.includes('Aucun'), rien.synthese)

console.log(echecs === 0 ? "Studio d'analyses : tout passe." : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
