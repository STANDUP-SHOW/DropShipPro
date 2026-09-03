/**
 * Y a-t-il de quoi écrire une annonce, ou seulement de quoi en inventer une ?
 *
 * **Le défaut du 03/09/2026, et c'est le pire des deux.** Sur une fiche Temu,
 * `collectDescription()` cherche un bloc de description par nom de classe
 * (`[class*="description"]`). Temu obfusque tous ses noms de classe : aucun
 * sélecteur ne peut correspondre, jamais. Le relevé retombait donc sur la
 * balise SEO, qui dit toujours la même chose :
 *
 *     « Trouvez des offres incroyables sur <titre> sur Temu.
 *       Magasinez sur Temu pour économiser. »
 *
 * Le modèle recevait ça comme « Description source ». Il n'avait donc que les
 * mots du titre — et il a fait ce qu'on lui demandait : il a écrit. Sept
 * arguments de vente, neuf attributs, vingt mots-clés, tous **déduits du titre**
 * et présentés comme des caractéristiques du produit : « matériau aéré »,
 * « conception durable pensée pour supporter un usage intensif ». Personne
 * n'avait vu le produit. Le vendeur non plus, jusqu'à la mise en ligne.
 *
 * Une annonce inventée est pire qu'une annonce absente : elle a l'air bonne,
 * elle est facturée, et ce sont des affirmations commerciales fausses au nom du
 * vendeur.
 *
 * D'où ce module. Il mesure ce que le relevé rapporte vraiment, avant de payer
 * un appel au modèle, et il tranche en deux temps :
 *
 * 1. **Une accroche SEO n'est pas une description.** Elle est écartée plutôt
 *    que transmise : présentée comme la parole du fournisseur, elle induit le
 *    modèle en erreur au lieu de le laisser se rabattre sur le texte de la page.
 * 2. **Sans matière, on ne réécrit pas.** L'annonce reste avec son texte
 *    source, `aiEnhanced` à faux, le crédit rendu, et la raison écrite en tête
 *    de la fiche.
 */

/** Les gabarits SEO des places de marché, mot pour mot. */
const ACCROCHES = [
  // Temu, en français et en anglais — le gabarit est le même dans les deux.
  /trouvez\s+(?:des\s+offres|bague|[^.]{0,60})\s*(?:incroyables?)?\s+sur\b/i,
  /magasinez\s+sur\s+\w+/i,
  /find\s+(?:great|amazing)\s+deals\s+on\b/i,
  /shop\s+(?:on|at)\s+\w+\s+(?:for|to)\s+save/i,
  // AliExpress, Shein, Wish : « Achetez ... à petit prix », « Livraison gratuite ».
  /achetez\s+[^.]{0,80}\s+à\s+petit\s+prix/i,
  /smarter\s+shopping,?\s+better\s+living/i,
  /qui\s+fait\s+[^.]{0,40}\s+de\s+notre\s+derni[eè]re/i,
]

/** Les mots qui ne distinguent rien : ils sont dans toutes les pages. */
const MOTS_VIDES = new Set([
  'avec', 'pour', 'dans', 'sans', 'plus', 'tout', 'tous', 'toute', 'toutes', 'cette', 'votre', 'notre',
  'nous', 'vous', 'elle', 'leur', 'leurs', 'être', 'etre', 'faire', 'fait', 'sont', 'plus', 'très',
  'tres', 'chez', 'sous', 'plus', 'aussi', 'plus', 'produit', 'produits', 'article', 'articles',
  'offres', 'offre', 'prix', 'achat', 'acheter', 'vente', 'livraison', 'gratuite', 'gratuit',
  'boutique', 'magasin', 'magasinez', 'économiser', 'economiser', 'incroyables', 'incroyable',
  'trouvez', 'dernière', 'derniere', 'ligne', 'promo', 'promotion', 'soldes', 'remise',
  'connexion', 'panier', 'compte', 'aide', 'cookies', 'confidentialité', 'confidentialite',
  'sécurité', 'securite', 'vérification', 'verification', 'accepter', 'refuser', 'paramètres',
  'parametres',
])

/** Les mots d'un texte qui portent une information : au moins quatre lettres. */
function motsUtiles(texte: string): Set<string> {
  const out = new Set<string>()
  for (const brut of texte.toLowerCase().split(/[^a-zà-öø-ÿ0-9]+/)) {
    if (brut.length < 4) continue
    if (MOTS_VIDES.has(brut)) continue
    out.add(brut)
  }
  return out
}

/** Ce que ce texte ajoute au titre, et à lui seul. */
function apport(texte: string, titre: string): number {
  const duTitre = motsUtiles(titre)
  let n = 0
  for (const mot of motsUtiles(texte)) if (!duTitre.has(mot)) n++
  return n
}

/**
 * Une description qui ne dit rien du produit.
 *
 * Deux façons de ne rien dire, et il faut les deux : le gabarit reconnaissable
 * — « Trouvez des offres incroyables sur… » — et le cas plus discret où le
 * texte est une paraphrase du titre. Un fournisseur honnête qui écrit trois
 * lignes courtes mais réelles passe : ce sont des mots que le titre n'a pas.
 */
export function descriptionCreuse(description: string, titre: string): boolean {
  const texte = (description ?? '').trim()
  if (texte.length < 40) return true
  if (ACCROCHES.some((rx) => rx.test(texte))) return true
  return apport(texte, titre) < 8
}

export interface Substance {
  /** La description à transmettre au modèle, ou `null` si elle ne vaut rien. */
  description: string | null
  /** Vrai quand il y a de quoi écrire autre chose qu'une paraphrase du titre. */
  assezPourEcrire: boolean
  /** Ce qu'on dira au vendeur si on refuse. */
  raison: string | null
}

/**
 * Le seuil du texte de page.
 *
 * Mesuré sur les relevés qui ont produit de bonnes annonces : une fiche lue
 * pour de vrai apporte plusieurs centaines de mots que le titre n'a pas.
 * En dessous de trente, il ne reste que le mobilier du site — bandeau cookies,
 * menu, pied de page — c'est-à-dire une page qui n'a pas fini de s'afficher, ou
 * un mur de vérification.
 */
const MOTS_MINIMUM = 30

export function substanceSource(input: {
  title: string
  description: string
  pageText?: string | null
}): Substance {
  const titre = input.title ?? ''
  const creuse = descriptionCreuse(input.description ?? '', titre)
  const description = creuse ? null : input.description

  if (!creuse) return { description, assezPourEcrire: true, raison: null }

  /*
   * La description ne vaut rien : tout repose sur le texte de la page.
   *
   * C'est le cas normal sur Temu, où aucun sélecteur ne peut trouver le bloc de
   * description. Ce n'est pas une raison de refuser : le corps de la page porte
   * les caractéristiques, et c'est de là que doit venir l'annonce.
   */
  const apportPage = apport(input.pageText ?? '', titre)
  if (apportPage >= MOTS_MINIMUM) {
    return { description, assezPourEcrire: true, raison: null }
  }

  return {
    description,
    assezPourEcrire: false,
    raison:
      "la fiche n'a pas été lue : le relevé ne contient que le titre et l'accroche publicitaire du site " +
      `(${apportPage} mot(s) exploitable(s) dans le corps de la page). ` +
      'Rouvrez la fiche, faites-la défiler jusqu’en bas, puis relancez la réécriture depuis l’annonce.',
  }
}
