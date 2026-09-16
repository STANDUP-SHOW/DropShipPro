import Anthropic from '@anthropic-ai/sdk'
import { MODELE_REDACTION, modele } from './aiModels.js'
import { systemeCachable } from './chatBudget.js'
import type { SupplierListing } from './supplierTypes.js'

/**
 * Le studio d'analyses : quatre façons de regarder un marché avant de publier.
 *
 * **Pourquoi quatre et pas une.** L'analyse de marché existante répond à une
 * seule question — « à quel prix ce produit se vend-il ? » — et c'est la
 * question la moins décisive des quatre. Un vendeur qui perd de l'argent perd
 * rarement parce qu'il s'est trompé de dix centimes : il perd parce qu'il
 * s'attaque à un produit que trois cents boutiques poussent déjà à coups de
 * publicité, ou parce qu'il l'achète 40 % trop cher chez son fournisseur
 * habituel. Ces deux-là ne se voient pas sur une page de prix.
 *
 * Les quatre volets :
 *
 * 1. **Places de marché** — qui vend le même produit, à quel prix, avec quelles
 *    notes. La concurrence frontale.
 * 2. **Publicités** — Facebook Ad Library et la bibliothèque de contenus
 *    commerciaux de TikTok : qui investit, depuis quand, avec quel angle.
 *    La concurrence *payante*, qui est celle qui coûte cher à affronter.
 * 3. **Boutiques comparables** — ce que vendent les boutiques de la même niche,
 *    leur positionnement, leur gamme de prix.
 * 4. **Fournisseurs** — pour la même référence, ce que chacun demande.
 *
 * ---
 *
 * **Ce que ce fichier ne fait JAMAIS : lire les sites tiers lui-même.**
 *
 * C'est une décision déjà prise et écrite dans le mémo — « Pas de scraping
 * d'Amazon, de Cdiscount, de la bibliothèque publicitaire de Meta ni des
 * boutiques concurrentes ». Elle tient ici plus que partout ailleurs : les deux
 * bibliothèques publicitaires sont des applications JavaScript, aucun client
 * HTTP n'en tire une liste, et forcer le passage est le genre de geste qui fait
 * fermer un compte.
 *
 * D'où la construction du volet 2, qui est la seule honnête : on **compose les
 * adresses de recherche** des deux bibliothèques, pré-remplies avec les mots du
 * vendeur et son pays — un clic, il est dans la vraie donnée, à la source, sans
 * intermédiaire — et **le modèle cherche sur le web** ce qui est publiquement
 * documenté sur les annonceurs de cette niche, avec ses sources. Ce qu'on donne
 * est donc : un accès direct et exact, plus une synthèse sourcée. Ce qu'on ne
 * donne pas, on le dit.
 *
 * Le volet 4 n'appelle **aucun modèle** : les offres viennent des API
 * fournisseurs du vendeur, et la synthèse se calcule. Inventer une phrase
 * au-dessus de chiffres exacts n'aurait ajouté que du risque, et un coût.
 */

const MODEL = modele('AI_MODEL_ANALYSIS', MODELE_REDACTION)

/** Plafond de recherches par volet : chaque recherche est facturée. */
const MAX_RECHERCHES = 5

/**
 * Le sujet d'une analyse.
 *
 * Volontairement pas « un produit » : le vendeur analyse souvent **avant**
 * d'importer quoi que ce soit — c'est même le bon ordre. Une annonce de son
 * catalogue remplit simplement l'intitulé et les deux prix.
 */
export interface SujetAnalyse {
  /** Ce qu'on analyse, dans les mots du vendeur ou le titre de son annonce. */
  intitule: string
  /** Le pays visé, en deux lettres. Le marché n'est pas le même d'un pays à l'autre. */
  pays: string
  /** Prix d'achat (produit + port fournisseur), quand le sujet vient d'une annonce. */
  achat?: number | null
  /** Prix de vente envisagé, quand il existe. */
  vente?: number | null
}

/**
 * L'appel au modèle, injectable.
 *
 * Même dispositif que `shopifyCatalog` : le banc fournit un faux et éprouve la
 * lecture des réponses sans dépenser un centime ni dépendre du réseau. Rend le
 * texte brut — c'est notre code qui sait en tirer du JSON, et c'est ça qu'il
 * faut éprouver.
 */
export type AppelModele = (consigne: string, question: string, pays: string) => Promise<string>

export async function demanderAuModele(
  consigne: string,
  question: string,
  pays: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error("Les analyses ne sont pas disponibles sur ce serveur.")

  const message = await new Anthropic({ apiKey }).messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: systemeCachable(consigne),
    tools: [
      {
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: MAX_RECHERCHES,
        user_location: { type: 'approximate', country: pays },
      },
    ],
    messages: [{ role: 'user', content: question }],
  })

  return message.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === 'text')
    .map((bloc) => bloc.text)
    .join('\n')
}

/* ------------------------------------------------------------------------- *
 * Lecture tolérante. Le modèle enrobe parfois son JSON de prose.
 * ------------------------------------------------------------------------- */

function lireJson(texte: string): Record<string, unknown> {
  const trouve = texte.match(/\{[\s\S]*\}/)
  if (!trouve) return {}
  try {
    return JSON.parse(trouve[0])
  } catch {
    return {}
  }
}

function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null
}

function nombre(valeur: unknown): number | null {
  const n = typeof valeur === 'string' ? Number(valeur.replace(',', '.')) : valeur
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function liste(valeur: unknown): Record<string, unknown>[] {
  if (!Array.isArray(valeur)) return []
  return valeur.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
}

/**
 * Les adresses rendues au vendeur sont vérifiées, jamais recopiées telles quelles.
 *
 * Elles viennent du modèle et finissent dans un `href`. Une adresse `javascript:`
 * dans un lien que le vendeur va cliquer est une faille, et elle ne coûte rien à
 * fermer ici.
 */
function adresse(valeur: unknown): string | null {
  const v = texte(valeur)
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

function sources(valeur: unknown): string[] {
  if (!Array.isArray(valeur)) return []
  return valeur.map(adresse).filter((v): v is string => Boolean(v)).slice(0, 12)
}

/* ------------------------------------------------------------------------- *
 * Volet 1 — les places de marché.
 * ------------------------------------------------------------------------- */

export interface OffreMarketplace {
  place: string
  vendeur: string | null
  prix: number | null
  note: number | null
  url: string | null
}

export interface AnalyseMarketplaces {
  synthese: string
  prixBas: number | null
  prixHaut: number | null
  prixConseille: number | null
  concurrence: string | null
  offres: OffreMarketplace[]
  sources: string[]
}

const CONSIGNE_MARKETPLACES = `Tu es analyste de marché pour des vendeurs en dropshipping.

Ta mission : trouver QUI vend déjà ce produit sur les places de marché, à quel prix,
et avec quelle réputation.

Règles absolues :
- N'invente JAMAIS un prix, un vendeur, une note ou une adresse. Ce que tu n'as pas
  lu dans un résultat de recherche vaut null.
- Les prix sont en euros. Un prix lu dans une autre monnaie est converti, et tu le dis.
- Une note est sur 5. Ne la donne que si tu l'as lue.
- Dis franchement quand le produit est saturé : un vendeur préfère l'apprendre avant
  d'avoir publié, pas après avoir payé sa publicité.`

export async function analyserMarketplaces(
  sujet: SujetAnalyse,
  demander: AppelModele = demanderAuModele,
): Promise<AnalyseMarketplaces> {
  const question = `Produit : ${sujet.intitule}
Pays visé : ${sujet.pays}
${sujet.achat != null ? `Prix d'achat du vendeur : ${sujet.achat.toFixed(2)} €` : ''}
${sujet.vente != null ? `Prix de vente envisagé : ${sujet.vente.toFixed(2)} €` : ''}

Cherche ce produit sur les places de marché accessibles depuis ce pays, puis réponds
UNIQUEMENT en JSON valide, sans texte autour ni bloc de code :
{
  "synthese": "une phrase, le jugement d'ensemble",
  "prixBas": 0,
  "prixHaut": 0,
  "prixConseille": 0,
  "concurrence": "faible|moyenne|forte",
  "offres": [{"place": "Amazon", "vendeur": "nom de la boutique", "prix": 24.9, "note": 4.3, "url": "https://..."}],
  "sources": ["https://..."]
}
Mets null pour tout ce que tu n'as pas trouvé.`

  const parse = lireJson(await demander(CONSIGNE_MARKETPLACES, question, sujet.pays))

  return {
    synthese: texte(parse.synthese) ?? "Rien de concluant trouvé pour ce produit.",
    prixBas: nombre(parse.prixBas),
    prixHaut: nombre(parse.prixHaut),
    prixConseille: nombre(parse.prixConseille),
    concurrence: texte(parse.concurrence),
    offres: liste(parse.offres)
      .map((o) => ({
        place: texte(o.place) ?? 'Inconnue',
        vendeur: texte(o.vendeur),
        prix: nombre(o.prix),
        note: nombre(o.note),
        url: adresse(o.url),
      }))
      .slice(0, 15),
    sources: sources(parse.sources),
  }
}

/* ------------------------------------------------------------------------- *
 * Volet 2 — les publicités : Facebook Ad Library et TikTok.
 * ------------------------------------------------------------------------- */

export interface Publicite {
  annonceur: string
  plateforme: string
  angle: string | null
  format: string | null
  depuis: string | null
  url: string | null
}

export interface AnalysePublicites {
  synthese: string
  /** Les angles qui reviennent : prix, preuve, urgence, identité… */
  angles: string[]
  publicites: Publicite[]
  sources: string[]
  /** Les deux bibliothèques, pré-remplies. C'est la partie exacte du volet. */
  bibliotheques: Array<{ nom: string; url: string; quoi: string }>
}

const CONSIGNE_PUBLICITES = `Tu es analyste publicitaire pour des vendeurs en dropshipping.

Ta mission : dire ce qui est PUBLIQUEMENT documenté sur les publicités qui poussent ce
produit ou cette niche — quels annonceurs, quels angles de vente, quels formats.

Règles absolues :
- Tu n'as PAS accès au contenu des bibliothèques publicitaires : ce sont des
  applications JavaScript que la recherche web ne lit pas. Ne fais donc JAMAIS
  semblant d'y avoir lu une annonce précise.
- Ce que tu rapportes vient d'articles, d'études de cas, de pages de marques, de
  discussions publiques — et tu donnes l'adresse de chacun.
- Si tu ne trouves rien de solide, dis-le. Une liste inventée d'annonceurs ferait
  dépenser un budget publicitaire à côté de la plaque.
- L'angle est la promesse de vente (problème résolu, preuve, prix, urgence,
  identité, comparaison), pas un slogan que tu imagines.`

/**
 * Les adresses des deux bibliothèques, pré-remplies.
 *
 * **C'est la partie exacte du volet, et elle ne coûte rien.** Composer ces deux
 * adresses met le vendeur dans la vraie donnée, à la source, en un clic — ce
 * qu'aucune synthèse ne remplace. Les paramètres sont ceux des formulaires
 * publics des deux plateformes.
 */
export function bibliothequesPublicitaires(
  motsCles: string,
  pays: string,
): Array<{ nom: string; url: string; quoi: string }> {
  const q = encodeURIComponent(motsCles.trim())
  const region = (pays || 'FR').toUpperCase()
  return [
    {
      nom: 'Facebook Ad Library',
      url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${region}&q=${q}&search_type=keyword_unordered`,
      quoi: 'Toutes les publicités actives sur Facebook et Instagram pour ces mots-clés, avec leur date de début et leurs variantes.',
    },
    {
      nom: 'TikTok — bibliothèque de contenus commerciaux',
      url: `https://library.tiktok.com/ads?region=${region}&query=${q}&query_type=1&adv_biz_ids=&start_time=&end_time=`,
      quoi: 'Les publicités diffusées en Europe, avec l’annonceur, la période et le ciblage déclaré.',
    },
  ]
}

export async function analyserPublicites(
  sujet: SujetAnalyse,
  demander: AppelModele = demanderAuModele,
): Promise<AnalysePublicites> {
  const question = `Produit ou niche : ${sujet.intitule}
Pays visé : ${sujet.pays}

Cherche ce qui est publiquement documenté sur les publicités de cette niche, puis
réponds UNIQUEMENT en JSON valide, sans texte autour ni bloc de code :
{
  "synthese": "deux phrases : qui investit sur cette niche, et à quel point elle est disputée",
  "angles": ["preuve sociale", "prix cassé"],
  "publicites": [{"annonceur": "marque", "plateforme": "Facebook|Instagram|TikTok", "angle": "…", "format": "vidéo courte|carrousel|image", "depuis": "mars 2026", "url": "https://..."}],
  "sources": ["https://..."]
}
Laisse "publicites" vide plutôt que d'inventer des annonceurs.`

  const parse = lireJson(await demander(CONSIGNE_PUBLICITES, question, sujet.pays))

  return {
    synthese:
      texte(parse.synthese) ??
      "Rien de solide n'a été trouvé sur les publicités de cette niche — ouvrez les deux bibliothèques ci-dessous, elles font foi.",
    angles: Array.isArray(parse.angles)
      ? parse.angles.map(texte).filter((v): v is string => Boolean(v)).slice(0, 8)
      : [],
    publicites: liste(parse.publicites)
      .map((p) => ({
        annonceur: texte(p.annonceur) ?? 'Annonceur non nommé',
        plateforme: texte(p.plateforme) ?? 'Inconnue',
        angle: texte(p.angle),
        format: texte(p.format),
        depuis: texte(p.depuis),
        url: adresse(p.url),
      }))
      .slice(0, 15),
    sources: sources(parse.sources),
    bibliotheques: bibliothequesPublicitaires(sujet.intitule, sujet.pays),
  }
}

/* ------------------------------------------------------------------------- *
 * Volet 3 — les boutiques comparables.
 * ------------------------------------------------------------------------- */

export interface BoutiqueComparable {
  nom: string
  url: string | null
  positionnement: string | null
  gammePrix: string | null
  /** Ce qu'elle met en avant en ce moment. */
  enAvant: string[]
}

export interface AnalyseBoutiques {
  synthese: string
  boutiques: BoutiqueComparable[]
  sources: string[]
}

const CONSIGNE_BOUTIQUES = `Tu es analyste pour des vendeurs en ligne.

Ta mission : repérer les boutiques en ligne comparables sur cette niche — ce qu'elles
vendent, à quel positionnement, dans quelle gamme de prix, et ce qu'elles mettent en
avant en ce moment.

Règles absolues :
- Uniquement des boutiques que tu as réellement trouvées, avec leur adresse.
- Le positionnement se décrit en quelques mots (entrée de gamme, premium, spécialiste
  d'une niche, généraliste).
- Ne recopie pas le contenu de leurs pages : tu décris un positionnement, tu ne
  reproduis pas leurs textes.
- Si la niche n'a pas de boutique spécialisée identifiable, dis-le plutôt que
  d'aligner des noms au hasard.`

export async function analyserBoutiques(
  sujet: SujetAnalyse,
  demander: AppelModele = demanderAuModele,
): Promise<AnalyseBoutiques> {
  const question = `Niche ou produit : ${sujet.intitule}
Pays visé : ${sujet.pays}

Réponds UNIQUEMENT en JSON valide, sans texte autour ni bloc de code :
{
  "synthese": "deux phrases sur l'état de cette niche et la place qui reste à prendre",
  "boutiques": [{"nom": "…", "url": "https://...", "positionnement": "…", "gammePrix": "20 à 60 €", "enAvant": ["…"]}],
  "sources": ["https://..."]
}`

  const parse = lireJson(await demander(CONSIGNE_BOUTIQUES, question, sujet.pays))

  return {
    synthese: texte(parse.synthese) ?? "Aucune boutique comparable identifiée avec certitude.",
    boutiques: liste(parse.boutiques)
      .map((b) => ({
        nom: texte(b.nom) ?? 'Boutique non nommée',
        url: adresse(b.url),
        positionnement: texte(b.positionnement),
        gammePrix: texte(b.gammePrix),
        enAvant: Array.isArray(b.enAvant)
          ? b.enAvant.map(texte).filter((v): v is string => Boolean(v)).slice(0, 5)
          : [],
      }))
      .slice(0, 12),
    sources: sources(parse.sources),
  }
}

/* ------------------------------------------------------------------------- *
 * Volet 4 — les fournisseurs. Aucun modèle : des chiffres, et leur calcul.
 * ------------------------------------------------------------------------- */

export interface OffreFournisseur extends SupplierListing {
  fournisseur: string
  fournisseurLabel: string
}

export interface AnalyseFournisseurs {
  synthese: string
  offres: OffreFournisseur[]
  /** La meilleure offre trouvée, s'il y en a une avec un prix. */
  meilleure: OffreFournisseur | null
  /** L'écart entre la moins chère et la plus chère, en euros. */
  ecart: number | null
  /** La marge que la meilleure offre laisse au prix de vente envisagé, en %. */
  margePossible: number | null
  /** Ce qui n'a pas pu être interrogé, fournisseur par fournisseur. */
  refus: Array<{ fournisseur: string; raison: string }>
}

/**
 * Compare ce que chaque fournisseur relié demande pour la même référence.
 *
 * **Pas un appel de modèle, et c'est voulu.** Les chiffres viennent des API des
 * fournisseurs du vendeur : ils sont exacts. Faire rédiger une synthèse par un
 * modèle au-dessus de chiffres exacts n'ajouterait qu'un risque d'erreur et un
 * coût — la seule chose à dire se déduit des nombres, et elle se calcule.
 *
 * Conséquence commerciale assumée : **ce volet est gratuit**. Il ne nous coûte
 * rien d'autre que des appels aux API du vendeur, exactement comme les
 * catalogues connectés, qui sont gratuits eux aussi.
 */
export function analyserFournisseurs(
  sujet: SujetAnalyse,
  offres: OffreFournisseur[],
  refus: Array<{ fournisseur: string; raison: string }> = [],
): AnalyseFournisseurs {
  const chiffrees = offres.filter((o) => typeof o.prix === 'number' && o.prix > 0)
  const triees = [...chiffrees].sort((a, b) => (a.prix ?? 0) - (b.prix ?? 0))
  const meilleure = triees[0] ?? null
  const pire = triees[triees.length - 1] ?? null

  const ecart =
    meilleure && pire && meilleure !== pire
      ? Math.round(((pire.prix ?? 0) - (meilleure.prix ?? 0)) * 100) / 100
      : null

  const margePossible =
    meilleure?.prix && sujet.vente
      ? Math.round(((sujet.vente - meilleure.prix) / sujet.vente) * 1000) / 10
      : null

  return {
    synthese: composerSynthese(sujet, offres.length, meilleure, ecart, margePossible, refus),
    offres,
    meilleure,
    ecart,
    margePossible,
    refus,
  }
}

/**
 * Un nombre écrit en français.
 *
 * `toFixed` rend toujours un point décimal. La phrase de synthèse disait donc
 * « 3.09 EUR » à dix centimètres d'un tableau qui affiche « 3,09 EUR » — vu en
 * production le 16/09/2026. Ce n'est pas un détail d'esthétique : deux
 * écritures du même prix sur le même écran font douter du chiffre.
 */
function fr(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

function composerSynthese(
  sujet: SujetAnalyse,
  total: number,
  meilleure: OffreFournisseur | null,
  ecart: number | null,
  marge: number | null,
  refus: Array<{ fournisseur: string; raison: string }>,
): string {
  if (!total) {
    return refus.length
      ? `Aucune offre trouvée pour « ${sujet.intitule} » : ${refus.map((r) => `${r.fournisseur} — ${r.raison}`).join(' ; ')}`
      : `Aucun de vos fournisseurs reliés ne propose « ${sujet.intitule} ».`
  }

  const morceaux: string[] = [`${total} offre(s) relevée(s) chez vos fournisseurs reliés.`]

  if (meilleure?.prix != null) {
    morceaux.push(
      `La moins chère vient de ${meilleure.fournisseurLabel} à ${fr(meilleure.prix)} ${meilleure.devise}.`,
    )
  }

  /*
   * L'écart est le chiffre qui décide, pas le prix le plus bas : c'est lui qui
   * dit si changer de fournisseur vaut la peine. Un centime d'écart ne justifie
   * pas de refaire une fiche ; trois euros, si.
   */
  if (ecart != null && ecart > 0) {
    morceaux.push(`L'écart avec la plus chère est de ${fr(ecart)} € par pièce.`)
  }

  if (marge != null) {
    morceaux.push(
      marge > 0
        ? `À votre prix de vente, elle laisse ${marge.toFixed(1).replace(".", ",")} % de marge brute.`
        : `À votre prix de vente, même la moins chère est perdante (${marge.toFixed(1).replace(".", ",")} %).`,
    )
  }

  if (refus.length) {
    morceaux.push(`Non interrogé : ${refus.map((r) => `${r.fournisseur} (${r.raison})`).join(', ')}.`)
  }

  return morceaux.join(' ')
}
