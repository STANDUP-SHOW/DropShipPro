import Anthropic from '@anthropic-ai/sdk'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MODELE_RAPIDE, MODELE_REDACTION, TARIFS, modele } from './aiModels.js'

/**
 * DropShop IA — la boutique écrite par le modèle (17/09/2026).
 *
 * Ce que Max a demandé : « un Lovable-like », après de très mauvais retours
 * sur la vitrine à thèmes. Une IA générative qui écrit une boutique moderne,
 * responsive, modifiable par simple demande — pas un choix dans un catalogue
 * de gabarits.
 *
 * ## Comment ça tient à 2 € la boutique
 *
 * **Le modèle n'écrit que ce qui est unique** : la page HTML entière — mise en
 * page, CSS, textes, écrans, animations. Il ne réécrit jamais la logique de
 * commerce, qui vit dans `dropshop/sdk.js` : catalogue vivant, navigation,
 * panier, commande, paiement Stripe, confirmation. C'est ce partage qui rend
 * une boutique de rêve possible à ce prix : ~30 000 jetons de sortie de Sonnet
 * 5 (~0,35 €) pour un design entier, et zéro risque que « le panier ne marche
 * plus » — le panier n'est pas dans ce que le modèle écrit.
 *
 * **Puis la page est TESTÉE, comme Lovable dit le faire.** `dropshop/verifier.cjs`
 * monte la page dans un navigateur simulé avec le vrai moteur et fait le
 * parcours d'un visiteur : accueil, catégorie, fiche, ajout au panier,
 * commande. Chaque manque est écrit pour être lu par le modèle, qui répare par
 * éditions ciblées (pas une réécriture entière). Deux réparations au plus ;
 * au-delà la création échoue et les drops sont rendus.
 *
 * **Deux modèles, comme demandé** : Sonnet 5 écrit la boutique (le design
 * demande du jugement), Haiku 4.5 applique les modifications et les
 * réparations — ce sont des éditions localisées, au format « chercher /
 * remplacer », dont la sortie tient en quelques centaines de jetons.
 *
 * ## Ce que le processus enfant protège
 *
 * jsdom exécute le JavaScript de la page, et jsdom n'est pas un bac à sable.
 * Cette page a été écrite par un modèle à partir d'un texte tapé par un
 * vendeur : une injection dans le brief pourrait lui faire écrire du code
 * hostile. Le vérificateur tourne donc dans un processus séparé, avec un
 * environnement VIDE (ni DATABASE_URL ni clés), un délai de 30 s et une sortie
 * bornée. Une évasion n'y trouve rien, et une boucle infinie n'y bloque rien.
 */

export class SiteImpossible extends Error {
  constructor(message: string, public readonly echecs: string[] = []) {
    super(message)
  }
}

/** Ce que le modèle reçoit du commerce, sans jamais rien inventer. */
export interface CatalogueBoutique {
  nom: string
  categories: Array<{ nom: string; nombre: number }>
  /** Quelques produits réels : titre, prix, photo, catégorie — pour que le modèle sache ce qu'il habille. */
  echantillon: Array<{ id: string; title: string; price: number; image: string | null; category: string | null }>
  logoEntete: string | null
  logoAccueil: string | null
  annonce: string
  /** Les couleurs lues dans le logo (hex + part), quand il y en a un. */
  couleursLogo?: Array<{ hex: string; part: number }>
  /** La gamme choisie par le vendeur à partir de son logo : imposée au modèle comme palette de départ. */
  gamme?: { nom: string; mode: 'sombre' | 'clair'; jetons: Record<string, string> } | null
  /** Le vendeur veut que ses visiteurs choisissent l'ambiance (modes visiteur). */
  modesVisiteur?: boolean
  /** Le dossier tiré de la bibliothèque de design, déjà rédigé. */
  dossierDesign?: string
  /** La direction choisie parmi les trois proposées : imposée au modèle. */
  direction?: Direction | null
}

/**
 * Une direction artistique : ce que le marchand choisit AVANT que la boutique
 * soit écrite (comme les trois propositions de Lovable). Courte à produire
 * (~25 s), montrée en carte avec palette, polices et concept.
 */
export interface Direction {
  id: string
  titre: string
  concept: string
  ambiance: 'sombre' | 'clair'
  matiere: 'nuit' | 'bois' | 'papier' | 'metal' | 'beton' | 'velours'
  palette: { fond: string; surface: string; texte: string; sourd: string; accent: string; accent2: string; ligne: string }
  polices: { titre: string; texte: string }
  hero: string
  boutons: string
  sections: string[]
}

const CONSIGNE_DIRECTIONS = `Tu es directeur artistique. Un marchand décrit sa boutique ; tu lui proposes TROIS directions artistiques vraiment différentes entre elles (pas trois variantes de la même), chacune pensée pour son commerce et sa clientèle. Il en choisira une, et la boutique sera écrite dans cette direction.

Réponds UNIQUEMENT par un bloc \`\`\`json :
{
  "directions": [
    {
      "id": "identifiant-court",
      "titre": "Nom évocateur (2-4 mots)",
      "concept": "Une phrase qui vend la direction au marchand : l'ambiance, ce que le visiteur ressent.",
      "ambiance": "sombre | clair",
      "matiere": "nuit | bois | papier | metal | beton | velours",
      "palette": { "fond": "#…", "surface": "#…", "texte": "#…", "sourd": "#…", "accent": "#…", "accent2": "#…", "ligne": "rgba(…)" },
      "polices": { "titre": "Nom Google Fonts", "texte": "Nom Google Fonts" },
      "hero": "Ce que montre le héros d'accueil et comment il bouge (une phrase).",
      "boutons": "Le dessin des boutons (une phrase).",
      "sections": ["Catégories en cartes matière", "Nouveautés", "…"]
    }
  ]
}

Règles : contraste texte/fond ≥ 4,5:1 ; polices réellement disponibles sur Google Fonts, appariement titrage + texte ; au moins une direction claire et une sombre ; si une palette est imposée (logo), les trois directions la respectent et varient sur la matière, la typographie et le concept ; pas de dégradé violet-bleu générique ; écris en français, pour un marchand, sans jargon.`

export function extraireDirections(texte: string): Direction[] {
  const bloc = /```json\s*\n([\s\S]*?)\n```/i.exec(texte)
  const brut = bloc ? bloc[1] : texte.match(/\{[\s\S]*\}/)?.[0]
  if (!brut) return []
  try {
    const obj = JSON.parse(brut) as { directions?: unknown }
    if (!Array.isArray(obj.directions)) return []
    return obj.directions
      .filter((d): d is Direction => Boolean(d) && typeof (d as Direction).titre === 'string' && typeof (d as Direction).palette === 'object')
      .slice(0, 3)
      .map((d, i) => ({
        ...d,
        id: typeof d.id === 'string' && d.id ? d.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-') : `direction-${i + 1}`,
        ambiance: d.ambiance === 'clair' ? 'clair' : 'sombre',
        matiere: (['nuit', 'bois', 'papier', 'metal', 'beton', 'velours'] as const).includes(d.matiere) ? d.matiere : d.ambiance === 'clair' ? 'papier' : 'nuit',
        sections: Array.isArray(d.sections) ? d.sections.filter((s): s is string => typeof s === 'string').slice(0, 8) : [],
      }))
  } catch {
    return []
  }
}

/** Trois directions pour ce brief. ~25 s, quelques centimes, aucune page écrite. */
export async function proposerDirections(brief: string, catalogue: CatalogueBoutique, appeler: AppelModele = appelAnthropic): Promise<Direction[]> {
  const reponse = await appeler({
    modele: modele('AI_MODEL_SITE_DIRECTIONS', MODELE_REDACTION),
    system: CONSIGNE_DIRECTIONS,
    messages: [{ role: 'user', content: ficheCommerce(brief, { ...catalogue, dossierDesign: catalogue.dossierDesign?.slice(0, 3500) }) }],
    max_tokens: 3500,
  })
  const directions = extraireDirections(reponse.texte)
  if (!directions.length) throw new SiteImpossible("Le modèle n'a pas rendu de directions lisibles.")
  return directions
}

/** Ce que le vendeur a coché à la création ; voyage avec le travail et le vérificateur. */
export interface OptionsSite {
  modesVisiteur?: boolean
  logo?: boolean
}

export interface AppelModele {
  (demande: {
    modele: string
    system: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    max_tokens: number
  }): Promise<{ texte: string; entree: number; sortie: number }>
}

export interface Verificateur {
  (html: string, options?: OptionsSite): Promise<{ ok: boolean; echecs: string[]; avertissements: string[] }>
}

const DOSSIER = ['dropshop', path.join('..', 'dropshop')].map((d) => path.resolve(d)).find((d) => fs.existsSync(d)) ?? path.resolve('dropshop')

function lireDossier(nom: string): string {
  return fs.readFileSync(path.join(DOSSIER, nom), 'utf8')
}

/* ---------- Les consignes ---------- */

const DIRECTION_ARTISTIQUE = `Tu es le directeur artistique d'un studio réputé pour ne jamais livrer deux boutiques semblables. Un marchand te décrit la boutique de ses rêves ; tu la dessines et tu l'écris, entièrement, en une page HTML qui respecte le contrat ci-dessous à la lettre.

## Ta méthode

1. Lis le brief et le catalogue. Tire de son univers une identité visuelle SPÉCIFIQUE : les matières, les gestes, le vocabulaire de ce commerce — pas une boutique générique.
2. Fixe avant d'écrire : une palette de 4 à 6 jetons CSS nommés (fond, surface, texte, texte sourd, accent, ligne), deux polices Google Fonts choisies pour CE sujet (une de titrage avec du caractère, une de texte lisible), un concept de mise en page en une phrase. Écris-les en commentaire en tête du CSS.
3. Écris la page. Tout le CSS dans <style>, tous les écrans dans DropShop.pages(...).

## Ce qu'une boutique de rêve contient

- **Cadre** : en-tête collant avec logo ou nom (c.boutique.logoEntete quand il existe), navigation vers les catégories (c.categories), recherche ([data-recherche]), panier avec compteur (c.panier.nombre) ; bandeau d'annonce si c.boutique.annonce ; pied de page complet (catégories, service client, mentions, © année).
- **Accueil** : un héros qui est une thèse — la chose la plus caractéristique de ce commerce, avec de VRAIES photos du catalogue (c.photo(c.nouveautes[i])) en grande composition, l'accroche (c.boutique.accroche + accrocheSuite) et le sous-titre ; puis les catégories en cartes visuelles (image de la catégorie), les nouveautés (c.nouveautes), une section « pourquoi nous » ou histoire écrite pour ce commerce, des réassurances vraies (livraison suivie, paiement sécurisé, retours 14 jours — pas de chiffres inventés), et un appel à l'action vers la boutique.
- **Boutique** : recherche, filtres par catégorie (liens), grille de produits ; état vide élégant.
- **Catégorie** : titre, nombre, grille.
- **Fiche produit** : galerie (toutes les photos, vignettes cliquables gérées en CSS ou dans DropShop.apres), fil d'Ariane vers la catégorie, titre, prix en évidence, quantité ([data-quantite-pour]), bouton [data-ajouter] bien visible, description, points forts (bulletPoints), caractéristiques (attributes) en tableau, produits de la même catégorie (c.parCategorie).
- **Panier** : lignes avec photo, quantité modifiable ([data-moins]/[data-plus]), retirer, sous-total, port (c.panier.port ; « offerte » si 0), total, bouton vers #/commande ; état vide.
- **Commande** : récapitulatif + <form data-commande> soigné (name, email, phone, street, zip, city), erreur affichée (c.commande.erreur), bouton désactivé pendant c.commande.envoi, libellé « Payer … » si c.commande.paiement === 'stripe'.
- **Merci** : chaleureux, distingue c.merci.attente / c.merci.paye / commande enregistrée.
- **Introuvable** : bref, lien retour.

## Exigences de qualité

- Responsive d'abord : téléphone, tablette, ordinateur. Grilles fluides, navigation qui se replie sur mobile (menu horizontal défilant ou volet), images en object-fit, aucun débordement horizontal.
- Typographie soignée : échelle de tailles, interlignage, titres balancés (text-wrap: balance), lettrage des étiquettes en capitales espacées.
- Mouvement mesuré : transitions au survol, apparition douce des sections (préférer CSS ; DropShop.apres pour un carrousel ou un observateur). Respecter prefers-reduced-motion.
- Accessibilité : contrastes lisibles, focus visible, alt sur les images, boutons de vrais <button>.
- Pas d'emoji en guise d'icônes : des SVG inline simples. Pas de texte de remplissage : chaque phrase est écrite pour ce commerce, en français, au vouvoiement.
- Évite l'allure « générée » : pas de dégradé violet-bleu par défaut, pas de tout-centré, pas de cartes toutes identiques à ombre uniforme, pas d'Inter ou Space Grotesk par réflexe. Une seule audace visuelle, le reste calme.
- Prévois l'absence de photo (c.photo(p) === '') avec un visuel de remplacement en CSS (dégradé ou initiale), jamais une image cassée.
- Tout texte du catalogue passe par c.html(...).

## Le niveau attendu : une boutique qu'on croit faite sur mesure par un studio

Le marchand compare avec les meilleures boutiques générées ailleurs. Ce qu'il regarde, et ce que tu dois livrer :

- **De la matière dans les fonds, pas des aplats.** Des fonds qui ont une texture : dégradés superposés (linear + radial), grain léger (un motif SVG feTurbulence en data URI dans un ::before à faible opacité — c'est du CSS, autorisé), trames fines (repeating-linear-gradient à 2-3 px), reflets, vignettage. Un fond « bois », « métal brossé », « papier », « béton », « velours » se fait en dégradés répétés et en blend modes (background-blend-mode, mix-blend-mode), sans image. Le noir n'est jamais #000 pur : il est teinté par l'accent.
- **De la profondeur.** Ombres à plusieurs couches (une courte nette + une longue diffuse), panneaux en verre (backdrop-filter: blur + bordure claire à 10-15 % d'opacité), superpositions légères, éléments qui se chevauchent (une photo qui déborde de sa carte, un titre qui passe devant un visuel), un léger parallaxe du héros au défilement (dans DropShop.apres, transform sur le fond avec requestAnimationFrame, désactivé si prefers-reduced-motion).
- **Du mouvement dans les vignettes au survol.** Chaque carte produit et catégorie réagit : levée de 4 à 6 px, zoom de la photo (scale 1.05-1.08 dans un conteneur overflow:hidden), ombre qui s'étend, apparition d'un bouton ou d'un liseré d'accent, transition 250-350 ms en cubic-bezier. Les boutons ont un état survol et un état pressé.
- **Un diaporama d'accueil augmenté.** Le héros ne montre pas UNE photo figée : il fait défiler les photos des produits (c.nouveautes, jusqu'à 5) en fondu enchaîné ou en glissement lent (CSS @keyframes, ou DropShop.apres avec setInterval), avec effet Ken Burns (zoom lent), le titre par-dessus, des pastilles de navigation cliquables. Prévoir le cas d'un catalogue avec une seule photo (pas de mouvement) ou sans photo (fond en matière).
- **Des textes qui bougent.** Le titre du héros apparaît en cascade (mots ou lignes avec un délai d'animation croissant), un bandeau défilant (marquee) porte les catégories ou les promesses, les sections se révèlent au défilement (IntersectionObserver dans DropShop.apres, classe .visible, opacité ET translation), un chiffre ou un mot-clé peut avoir un soulignement animé. Tout respecte prefers-reduced-motion. Rien ne reste invisible si l'observateur ne se déclenche pas : l'état de repos est LISIBLE (opacité de départ 0 seulement dans une règle qui n'est appliquée que si JS a posé une classe sur <html>).
- **Le logo, au bon endroit.** Si c.boutique.logoEntete existe : en miniature dans la barre du haut, hauteur 34-44 px, avant le nom (ou à sa place si le logo porte le nom). Si c.boutique.logoAccueil existe : en grand au-dessus du titre du héros (largeur clamp(180px, 30vw, 460px)), sans étirement (object-fit: contain), avec un léger fondu à l'arrivée. Sans logo : le nom fait enseigne, dans la police de titrage, avec un signe distinctif (lettrine, trait, ligature).
- **Alignement irréprochable.** TOUT contenu textuel vit dans un conteneur .wrap { width: min(1200px, 92vw); margin-inline: auto; } — et .wrap ne reçoit JAMAIS width:100% par une seconde classe (c'est la faute qui colle un titre au bord de l'écran). Le héros plein écran met sa photo en fond (position absolue, inset 0) et son texte dans un .wrap. Aucun texte à moins de 16 px du bord sur téléphone. Les titres longs se coupent en lignes (max-width en ch, text-wrap: balance), jamais en débordement.
- **Code de niveau expert.** Variables CSS en tête, échelle typographique en clamp(), grilles en auto-fit/minmax, pas de sélecteurs qui se contredisent (une classe ne redéfinit pas ce qu'une autre pose sur le même élément), pas de !important, images en loading="lazy" hors héros, SVG inline pour les icônes, attributs aria sur les boutons d'icône, focus visible, contraste ≥ 4,5:1 pour le texte. Le JavaScript de la page est petit et propre : des fonctions de rendu pures, un seul DropShop.apres pour les effets, jamais de gestionnaire sur les gestes que le moteur branche.

## Modes visiteur (seulement si demandés dans la fiche)

Quand le marchand a coché « expérience immersive », la boutique propose au visiteur de changer d'ambiance : un sélecteur dans l'en-tête avec 4 boutons [data-mode="…"] (noms courts et évocateurs, propres à ce commerce — pas « Noir / Clair / Gradient / Colorful » recopiés), chacun avec son propre dessin de bouton (une pastille de couleur, un dégradé miniature, une icône), l'actif marqué (aria-pressed via la valeur de data-theme sur <html>). Chaque mode est une AMBIANCE COMPLÈTE définie en CSS sous [data-theme="…"] : fond, surfaces, texte, texte sourd, lignes, accents, matière du héros, ombres. Le mode par défaut (sans data-theme) est celui du brief. Quatre ambiances vraiment différentes : par exemple nuit profonde, papier clair, dégradé saturé, pastel coloré — pas une simple inversion. Toutes lisibles (contraste ≥ 4,5:1), toutes soignées.

## Format de réponse

Réponds UNIQUEMENT par le document HTML complet, dans un bloc \`\`\`html … \`\`\`. Aucune phrase avant ni après. Vise 700 à 1 300 lignes : complet, riche, sans redondance.`

const REGLES_EDITION = `Tu modifies une boutique DropShop existante par ÉDITIONS CIBLÉES, sans la réécrire.

Réponds UNIQUEMENT par un bloc \`\`\`json contenant :
{
  "resume": "ce que tu as changé, en une phrase pour le marchand",
  "edits": [
    { "chercher": "extrait EXACT et UNIQUE de la page actuelle (1 à 12 lignes, copié à l'identique, espaces compris)", "remplacer": "le texte qui le remplace" }
  ]
}

Règles :
- Chaque "chercher" doit apparaître UNE seule fois dans la page : inclus assez de contexte pour être unique.
- Pour insérer, cherche un point d'ancrage et remplace-le par lui-même suivi du nouveau contenu.
- Pour supprimer, remplace par une chaîne vide ou par le contexte conservé.
- Respecte le contrat du moteur (ci-dessous) : les attributs data-*, DropShop.pages, aucun appel réseau, aucun script externe, tout texte du catalogue via c.html(...).
- Si la demande exige une refonte complète (changer tout le design), réponds à la place par le document entier dans un bloc \`\`\`html.
- Ne change rien qui n'a pas été demandé.
- Où placer ce qui est demandé : une demande qui ne nomme pas d'écran vise l'ACCUEIL (fonction accueil). « L'en-tête », « le menu », « le pied de page », « avant le pied de page » désignent le CADRE (fonction cadre), donc toutes les pages. « La fiche », « le produit » désignent l'écran produit ; « le panier », « la commande » les leurs. Une section ajoutée « avant le pied de page » va dans cadre, juste avant le <footer>, jamais dans une seule fiche produit — c'est la faute constatée sur la première boutique réelle.`

const RECETTES = `# Recettes de matière, de relief et de mouvement (dropshop/recettes.css)

Ces recettes sont ÉPROUVÉES et viennent des boutiques que le marchand trouve belles. Copie dans ton <style> celles que tu utilises (renomme-les si tu veux) et ADAPTE-les à tes jetons ; elles sont ta base, pas ton plafond. Une boutique sans matière dans ses fonds, sans ombres à couches, sans photos posées sur un plateau, sans survol vivant, est refusée par le marchand comme « bas de gamme ».

**Les photos fournisseurs sont presque toujours des packshots sur fond blanc.** Sur une ambiance sombre, un rectangle blanc brut posé sur du noir est laid : pose chaque photo sur un « plateau » clair avec de l'air autour (.carte .plateau, mix-blend-mode: multiply), ou en fond perdu avec un voile (.carte .visuel + .voile). Sur une ambiance claire, multiply fait disparaître le blanc. Le héros pose sa photo derrière un voile dégradé (.voile-hero) ou dans un cadre de matière.

**Les boutons forment un système** (.btn, .btn-secondaire, .btn-fantome) avec survol, pression, focus, flèche qui glisse — jamais un simple dégradé identique partout ; dans chaque mode visiteur, les boutons changent avec l'ambiance.

\`\`\`css
${lireDossier('recettes.css')}
\`\`\``

export function consigneCreation(): string {
  return `${DIRECTION_ARTISTIQUE}

${RECETTES}

# Contrat du moteur

${lireDossier('contrat.md')}

# Squelette de référence

Ce squelette montre le CONTRAT (les écrans, le contexte, les attributs), pas un design : ton design doit être entièrement le tien, autrement plus riche.

\`\`\`html
${lireDossier('exemple.html')}
\`\`\``
}

export function consigneEdition(): string {
  return `${REGLES_EDITION}

# Contrat du moteur

${lireDossier('contrat.md')}`
}

/* ---------- Le brief ---------- */

function ficheCommerce(brief: string, catalogue: CatalogueBoutique): string {
  const lignes = [
    `Nom de la boutique : ${catalogue.nom}`,
    `Ce que le marchand écrit de la boutique de ses rêves :`,
    brief.trim().slice(0, 4000),
    '',
    catalogue.categories.length
      ? `Catégories réelles du catalogue (créées automatiquement, elles peuvent changer — ne les écris pas en dur) : ${catalogue.categories.slice(0, 16).map((c) => `${c.nom} (${c.nombre})`).join(', ')}`
      : 'Le catalogue est encore vide : la boutique se remplira ensuite, dessine-la pour accueillir des produits.',
    catalogue.echantillon.length
      ? `Quelques produits réels, pour te représenter ce qui sera montré (les photos et prix viendront de c.nouveautes, jamais d'ici) :\n${catalogue.echantillon.slice(0, 8).map((p) => `- ${p.title} — ${p.price.toFixed(2)} € — ${p.category ?? 'sans catégorie'}${p.image ? ' — photo disponible' : ' — sans photo'}`).join('\n')}`
      : '',
    catalogue.logoEntete ? 'Le marchand a un logo d\'en-tête (c.boutique.logoEntete) : affiche-le dans la barre du haut.' : 'Pas de logo d\'en-tête : le nom fait enseigne, soigne sa typographie.',
    catalogue.logoAccueil ? 'Le marchand a un grand logo d\'accueil (c.boutique.logoAccueil) : en grand au-dessus du titre du héros.' : '',
    catalogue.couleursLogo?.length ? `Couleurs lues dans son logo : ${catalogue.couleursLogo.map((c) => `${c.hex} (${Math.round(c.part * 100)} %)`).join(', ')}.` : '',
    catalogue.gamme
      ? `PALETTE IMPOSÉE par le marchand, tirée de son logo — gamme « ${catalogue.gamme.nom} » (mode ${catalogue.gamme.mode}) : ${Object.entries(catalogue.gamme.jetons).map(([k, v]) => `${k} ${v}`).join(', ')}. Pars de ces jetons exactement pour le mode par défaut ; tu peux ajouter des nuances dérivées, pas changer la base.`
      : '',
    catalogue.direction
      ? `DIRECTION ARTISTIQUE CHOISIE PAR LE MARCHAND — « ${catalogue.direction.titre} » : ${catalogue.direction.concept} Ambiance ${catalogue.direction.ambiance}, matière « ${catalogue.direction.matiere} » (recette .matiere-${catalogue.direction.matiere}). Palette : ${Object.entries(catalogue.direction.palette).map(([k, v]) => `${k} ${v}`).join(', ')}. Polices : ${catalogue.direction.polices.titre} (titres) + ${catalogue.direction.polices.texte} (texte). Héros : ${catalogue.direction.hero} Boutons : ${catalogue.direction.boutons}${catalogue.direction.sections.length ? ` Sections : ${catalogue.direction.sections.join(' ; ')}.` : ''} Respecte cette direction à la lettre : c'est ce qu'il a choisi en la voyant.`
      : '',
    catalogue.modesVisiteur
      ? 'EXPÉRIENCE IMMERSIVE DEMANDÉE : ajoute les modes visiteur décrits dans la consigne (4 boutons [data-mode], 4 ambiances [data-theme] complètes).'
      : 'Pas de modes visiteur : une seule ambiance, celle du brief.',
    catalogue.annonce ? `Bandeau d'annonce du marchand : « ${catalogue.annonce} »` : '',
    catalogue.dossierDesign
      ? `\n# Bibliothèque de design — inspirations sélectionnées pour ce commerce\n\nChoisis, adapte, pousse plus loin ; ne recopie aucune recette telle quelle.\n\n${catalogue.dossierDesign}`
      : '',
  ]
  return lignes.filter(Boolean).join('\n')
}

/* ---------- Lecture des réponses ---------- */

export function extraireHtml(texte: string): string | null {
  const bloc = /```html\s*\n([\s\S]*?)\n```/i.exec(texte)
  const brut = bloc ? bloc[1] : texte
  const debut = brut.search(/<!doctype html>/i)
  if (debut < 0) return null
  const fin = brut.lastIndexOf('</html>')
  return (fin > debut ? brut.slice(debut, fin + '</html>'.length) : brut.slice(debut)).trim() + '\n'
}

export interface Edition {
  chercher: string
  remplacer: string
}

export function extraireEditions(texte: string): { resume: string; edits: Edition[] } | null {
  const bloc = /```json\s*\n([\s\S]*?)\n```/i.exec(texte)
  const brut = bloc ? bloc[1] : texte.match(/\{[\s\S]*\}/)?.[0]
  if (!brut) return null
  try {
    const obj = JSON.parse(brut) as { resume?: unknown; edits?: unknown }
    if (!Array.isArray(obj.edits)) return null
    const edits = obj.edits
      .filter((e): e is Edition => Boolean(e) && typeof (e as Edition).chercher === 'string' && typeof (e as Edition).remplacer === 'string')
      .filter((e) => e.chercher.length > 0)
    return { resume: typeof obj.resume === 'string' ? obj.resume : '', edits }
  } catch {
    return null
  }
}

/**
 * Applique des éditions « chercher / remplacer ». Tout ou rien : une édition
 * dont l'extrait est absent ou ambigu fait échouer l'ensemble, avec la liste
 * des fautives — c'est ce qu'on renvoie au modèle pour qu'il corrige.
 */
export function appliquerEditions(html: string, edits: Edition[]): { html: string; erreurs: string[] } {
  const erreurs: string[] = []
  let resultat = html
  for (const e of edits) {
    const premiere = resultat.indexOf(e.chercher)
    if (premiere < 0) {
      erreurs.push(`Extrait introuvable dans la page : « ${e.chercher.slice(0, 120)}${e.chercher.length > 120 ? '…' : ''} »`)
      continue
    }
    if (resultat.indexOf(e.chercher, premiere + 1) >= 0) {
      erreurs.push(`Extrait présent plusieurs fois, ambigu : « ${e.chercher.slice(0, 120)}${e.chercher.length > 120 ? '…' : ''} »`)
      continue
    }
    resultat = resultat.slice(0, premiere) + e.remplacer + resultat.slice(premiere + e.chercher.length)
  }
  return { html: erreurs.length ? html : resultat, erreurs }
}

/* ---------- L'appel au modèle ---------- */

/**
 * Ce qu'un appel coûte, en dollars, d'après la grille d'`aiModels.ts`.
 * Les entrées mises en cache sont facturées au dixième : la consigne (recettes,
 * contrat, squelette) ne change jamais, donc dès le second appel elle est lue
 * en cache. On compte ici au tarif plein : le coût réel est en dessous.
 */
export function coutAppel(modeleUtilise: string, entree: number, sortie: number): number {
  const t = TARIFS[modeleUtilise] ?? TARIFS[MODELE_REDACTION]
  return (entree * t.in + sortie * t.out) / 1_000_000
}

export const appelAnthropic: AppelModele = async (d) => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new SiteImpossible("Le service d'écriture n'est pas configuré sur ce serveur.")
  const client = new Anthropic({ apiKey })
  // En flux : une boutique fait des dizaines de milliers de jetons, et l'appel
  // bloquant refuse ce qu'il estime trop long.
  const flux = client.messages.stream({
    model: d.modele,
    max_tokens: d.max_tokens,
    system: [{ type: 'text', text: d.system, cache_control: { type: 'ephemeral' } }],
    messages: d.messages,
  })
  const reponse = await flux.finalMessage()
  const texte = reponse.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return { texte, entree: reponse.usage.input_tokens, sortie: reponse.usage.output_tokens }
}

/* ---------- La vérification, dans un processus enfant à l'environnement vide ---------- */

export const verifierEnfant: Verificateur = (html, options = {}) =>
  new Promise((resolve) => {
    const fichier = path.join(os.tmpdir(), `dropshop-${randomUUID()}.html`)
    fs.writeFileSync(fichier, html, 'utf8')
    const drapeaux = [options.modesVisiteur ? '--modes' : '', options.logo ? '--logo' : ''].filter(Boolean)
    const enfant = spawn(process.execPath, [path.join(DOSSIER, 'verifier.cjs'), fichier, ...drapeaux], {
      env: { PATH: process.env.PATH ?? '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let sortie = ''
    let fini = false
    const terminer = (r: { ok: boolean; echecs: string[]; avertissements: string[] }) => {
      if (fini) return
      fini = true
      clearTimeout(chien)
      try { fs.unlinkSync(fichier) } catch { /* déjà parti */ }
      resolve(r)
    }
    const chien = setTimeout(() => {
      enfant.kill('SIGKILL')
      terminer({ ok: false, echecs: ['La vérification a dépassé 30 s : le JavaScript de la page ne rend jamais la main.'], avertissements: [] })
    }, 30_000)
    enfant.stdout.on('data', (d) => { if (sortie.length < 200_000) sortie += String(d) })
    enfant.on('error', (e) => terminer({ ok: false, echecs: [`Le vérificateur n'a pas pu démarrer : ${e.message}`], avertissements: [] }))
    enfant.on('close', () => {
      try {
        terminer(JSON.parse(sortie) as { ok: boolean; echecs: string[]; avertissements: string[] })
      } catch {
        terminer({ ok: false, echecs: [`Le vérificateur n'a rien rendu de lisible : ${sortie.slice(0, 200)}`], avertissements: [] })
      }
    })
  })

/* ---------- Création ---------- */

export interface Etape {
  etape: 'ecriture' | 'verification' | 'reparation' | 'finition'
  tentative: number
}

export interface SiteFabrique {
  html: string
  modele: string
  tentatives: number
  avertissements: string[]
  jetons: { entree: number; sortie: number }
  /** Coût de production en dollars, au tarif plein (le cache le réduit). */
  cout: number
}

/**
 * Trois réparations : la seconde boutique réelle est tombée après deux, sur
 * deux manques dont les messages ne disaient pas quoi corriger. Les messages
 * nomment désormais la règle fautive ; une troisième chance coûte quelques
 * centimes de Haiku contre deux euros rendus et cinq minutes perdues.
 */
export const REPARATIONS_MAX = 3

/**
 * Écrit la boutique, la vérifie, la répare — ou échoue proprement.
 */
export async function fabriquerSite(
  brief: string,
  catalogue: CatalogueBoutique,
  appeler: AppelModele = appelAnthropic,
  verifier: Verificateur = verifierEnfant,
  surEtape: (e: Etape) => void = () => undefined,
): Promise<SiteFabrique> {
  const modeleCreation = modele('AI_MODEL_SITE', MODELE_REDACTION)
  const jetons = { entree: 0, sortie: 0 }
  let cout = 0

  surEtape({ etape: 'ecriture', tentative: 1 })
  const reponse = await appeler({
    modele: modeleCreation,
    system: consigneCreation(),
    messages: [{ role: 'user', content: ficheCommerce(brief, catalogue) }],
    max_tokens: 48_000,
  })
  jetons.entree += reponse.entree
  jetons.sortie += reponse.sortie
  cout += coutAppel(modeleCreation, reponse.entree, reponse.sortie)
  let html = extraireHtml(reponse.texte)
  if (!html) throw new SiteImpossible("Le modèle n'a pas rendu une page HTML complète.")

  const options: OptionsSite = { modesVisiteur: Boolean(catalogue.modesVisiteur), logo: Boolean(catalogue.logoEntete) }
  let tentatives = 1
  surEtape({ etape: 'verification', tentative: 1 })
  let verdict = await verifier(html, options)
  for (let n = 1; !verdict.ok && n <= REPARATIONS_MAX; n++) {
    surEtape({ etape: 'reparation', tentative: n })
    const repare = await reparerSite(html, verdict.echecs, appeler)
    jetons.entree += repare.jetons.entree
    jetons.sortie += repare.jetons.sortie
    cout += repare.cout
    html = repare.html
    tentatives++
    surEtape({ etape: 'verification', tentative: n + 1 })
    verdict = await verifier(html, options)
  }
  if (!verdict.ok) {
    throw new SiteImpossible('La boutique écrite ne passe pas le contrôle du visiteur après réparations.', verdict.echecs)
  }

  /*
   * La finition : un second regard de directeur artistique sur une page qui
   * MARCHE déjà. Le premier passage écrit ; celui-ci relit contre une liste
   * précise (matière, relief, photos sur plateau, système de boutons, survol,
   * rythme) et corrige par éditions. Si la page finie ne passe plus le
   * contrôle, on garde la page d'avant : on ne perd jamais une boutique qui
   * marchait pour un coup de vernis.
   */
  surEtape({ etape: 'finition', tentative: 1 })
  try {
    const finie = await finirSite(html, catalogue, appeler)
    jetons.entree += finie.jetons.entree
    jetons.sortie += finie.jetons.sortie
    cout += finie.cout
    if (finie.html !== html) {
      surEtape({ etape: 'verification', tentative: tentatives + 1 })
      const apres = await verifier(finie.html, options)
      if (apres.ok) {
        html = finie.html
        verdict = apres
      } else {
        console.warn('[dropshop] finition écartée : ' + apres.echecs[0])
      }
    }
  } catch (e) {
    console.warn('[dropshop] finition impossible : ' + (e instanceof Error ? e.message : e))
  }
  return { html, modele: modeleCreation, tentatives, avertissements: verdict.avertissements, jetons, cout }
}

const CHECKLIST_FINITION = `Tu es le directeur artistique qui relit une boutique que ton studio vient d'écrire. Elle fonctionne ; elle doit maintenant être BELLE, au niveau d'oguss.fr. Relis le code contre cette liste et corrige tout ce qui manque, par éditions ciblées (format ci-dessous). Ne casse rien : le moteur, les attributs data-*, DropShop.pages, les écrans restent.

1. MATIÈRE : chaque grande zone de fond (héros, sections alternées, pied) a une texture réelle — dégradés superposés, grain (.grain), trame, bois/papier/métal/nuit (recettes). Aucun aplat nu, aucun #000 pur.
2. RELIEF : cartes et panneaux portent des ombres à couches (.ombre-lux/.ombre-douce) ou du verre (.verre) ; au moins un chevauchement (photo qui déborde, titre devant un visuel).
3. PHOTOS : les packshots sont posés sur un plateau clair avec de l'air (.plateau + multiply) ou en fond perdu avec voile ; jamais un rectangle blanc brut sur fond sombre. Le héros : diaporama (.diapo) ou Ken Burns (.kenburns) sous un voile (.voile-hero).
4. BOUTONS : un système (.btn / .btn-secondaire / .btn-fantome) avec survol qui lève, pression, focus, flèche ; pas deux boutons identiques pour deux rôles différents ; les modes visiteur changent aussi les boutons.
5. SURVOL : toute carte lève et zoome sa photo ; liens de navigation avec état ; transitions 250-350 ms.
6. MOUVEMENT : titre en cascade (.cascade), sections en .reveal (avec html.js-anime posé dans DropShop.apres et un IntersectionObserver), un marquee ou un soulignement animé ; prefers-reduced-motion respecté ; état de repos lisible.
7. RYTHME : sections espacées (.section), eyebrow + titre balancé + séparateur ; grilles auto-fit ; rien de collé au bord (.wrap partout, jamais width:100% dessus).
8. TYPOGRAPHIE : deux polices Google chargées et vraiment utilisées (titres ≠ texte), échelle en clamp(), lettrage des étiquettes.
9. LOGO : s'il existe, dans l'en-tête (34-44 px) et en grand sur l'accueil ; sinon une enseigne typographique travaillée.
10. MOBILE : navigation repliée ou défilante, grilles à 1-2 colonnes, héros lisible, aucun débordement.

Si plus de la moitié de la liste manque, réécris la page entière (bloc \`\`\`html) en gardant les mêmes écrans et les mêmes textes ; sinon, des éditions.`

/** Le second regard : la page marche, on la rend belle. */
export async function finirSite(html: string, catalogue: CatalogueBoutique, appeler: AppelModele = appelAnthropic): Promise<SiteModifie> {
  const modeleFinition = modele('AI_MODEL_SITE_FINITION', MODELE_REDACTION)
  const demande = `${CHECKLIST_FINITION}\n\nRappel du commerce : ${catalogue.nom}${catalogue.gamme ? ` — palette imposée « ${catalogue.gamme.nom} »` : ''}${catalogue.modesVisiteur ? ' — modes visiteur demandés' : ''}.`
  return editer(html, demande, appeler, modeleFinition, `${REGLES_EDITION}\n\n${RECETTES}\n\n# Contrat du moteur\n\n${lireDossier('contrat.md')}`)
}

/* ---------- Modification et réparation : des éditions ciblées ---------- */

export interface SiteModifie {
  html: string
  resume: string
  modele: string
  jetons: { entree: number; sortie: number }
  /** Coût en dollars au tarif plein. */
  cout: number
}

async function editer(
  html: string,
  demande: string,
  appeler: AppelModele,
  modeleEdition: string,
  consigne: string = consigneEdition(),
): Promise<SiteModifie> {
  const jetons = { entree: 0, sortie: 0 }
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: `# Page actuelle\n\n\`\`\`html\n${html}\n\`\`\`\n\n# Demande\n\n${demande}` },
  ]
  let cout = 0
  for (let essai = 1; essai <= 2; essai++) {
    const reponse = await appeler({ modele: modeleEdition, system: consigne, messages, max_tokens: 48_000 })
    jetons.entree += reponse.entree
    jetons.sortie += reponse.sortie
    cout += coutAppel(modeleEdition, reponse.entree, reponse.sortie)

    // Une refonte entière est acceptée quand le modèle la juge nécessaire.
    const entier = /```html/i.test(reponse.texte) ? extraireHtml(reponse.texte) : null
    if (entier) return { html: entier, resume: 'Boutique refondue.', modele: modeleEdition, jetons, cout }

    const editions = extraireEditions(reponse.texte)
    if (!editions || !editions.edits.length) {
      if (essai === 2) throw new SiteImpossible("Le modèle n'a pas rendu d'éditions applicables.")
      messages.push({ role: 'assistant', content: reponse.texte })
      messages.push({ role: 'user', content: 'Ta réponse ne contient pas de bloc ```json avec des "edits". Réponds au format demandé.' })
      continue
    }
    const applique = appliquerEditions(html, editions.edits)
    if (!applique.erreurs.length) return { html: applique.html, resume: editions.resume, modele: modeleEdition, jetons, cout }
    if (essai === 2) throw new SiteImpossible('Les éditions du modèle ne correspondent pas à la page.', applique.erreurs)
    messages.push({ role: 'assistant', content: reponse.texte })
    messages.push({
      role: 'user',
      content: `Certaines éditions ne s'appliquent pas :\n${applique.erreurs.map((e) => `- ${e}`).join('\n')}\nRecopie les extraits à l'identique depuis la page actuelle, avec assez de contexte pour qu'ils soient uniques, et renvoie l'ensemble des éditions.`,
    })
  }
  throw new SiteImpossible('Éditions impossibles.')
}

/** Une demande du marchand, appliquée puis vérifiée ; réparée une fois si elle casse quelque chose. */
export async function modifierSite(
  html: string,
  demande: string,
  appeler: AppelModele = appelAnthropic,
  verifier: Verificateur = verifierEnfant,
  surEtape: (e: Etape) => void = () => undefined,
  options: OptionsSite = {},
): Promise<SiteModifie & { avertissements: string[] }> {
  const modeleEdition = modele('AI_MODEL_SITE_MODIF', MODELE_RAPIDE)
  surEtape({ etape: 'ecriture', tentative: 1 })
  const edite = await editer(html, demande, appeler, modeleEdition)
  surEtape({ etape: 'verification', tentative: 1 })
  let verdict = await verifier(edite.html, options)
  let resultat = edite
  if (!verdict.ok) {
    surEtape({ etape: 'reparation', tentative: 1 })
    const repare = await reparerSite(edite.html, verdict.echecs, appeler)
    resultat = { ...edite, html: repare.html, cout: edite.cout + repare.cout, jetons: { entree: edite.jetons.entree + repare.jetons.entree, sortie: edite.jetons.sortie + repare.jetons.sortie } }
    surEtape({ etape: 'verification', tentative: 2 })
    verdict = await verifier(resultat.html, options)
    if (!verdict.ok) throw new SiteImpossible('La modification casse la boutique et la réparation n\'a pas suffi.', verdict.echecs)
  }
  return { ...resultat, avertissements: verdict.avertissements }
}

export async function reparerSite(html: string, echecs: string[], appeler: AppelModele = appelAnthropic): Promise<SiteModifie> {
  const demande = `Le contrôle du visiteur a relevé ces manques. Corrige-les tous, sans toucher au reste du design :\n${echecs.map((e) => `- ${e}`).join('\n')}`
  return editer(html, demande, appeler, modele('AI_MODEL_SITE_MODIF', MODELE_RAPIDE))
}
