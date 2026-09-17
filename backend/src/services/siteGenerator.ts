import Anthropic from '@anthropic-ai/sdk'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MODELE_RAPIDE, MODELE_REDACTION, modele } from './aiModels.js'

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
  (html: string): Promise<{ ok: boolean; echecs: string[]; avertissements: string[] }>
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

## Format de réponse

Réponds UNIQUEMENT par le document HTML complet, dans un bloc \`\`\`html … \`\`\`. Aucune phrase avant ni après. Vise 600 à 1 100 lignes : complet mais sans redondance.`

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
- Ne change rien qui n'a pas été demandé.`

export function consigneCreation(): string {
  return `${DIRECTION_ARTISTIQUE}

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
    catalogue.logoEntete ? 'Le marchand a un logo d\'en-tête (c.boutique.logoEntete).' : 'Pas de logo d\'en-tête : le nom fait enseigne, soigne sa typographie.',
    catalogue.logoAccueil ? 'Le marchand a un grand logo d\'accueil (c.boutique.logoAccueil).' : '',
    catalogue.annonce ? `Bandeau d'annonce du marchand : « ${catalogue.annonce} »` : '',
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

export const verifierEnfant: Verificateur = (html) =>
  new Promise((resolve) => {
    const fichier = path.join(os.tmpdir(), `dropshop-${randomUUID()}.html`)
    fs.writeFileSync(fichier, html, 'utf8')
    const enfant = spawn(process.execPath, [path.join(DOSSIER, 'verifier.cjs'), fichier], {
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
  etape: 'ecriture' | 'verification' | 'reparation'
  tentative: number
}

export interface SiteFabrique {
  html: string
  modele: string
  tentatives: number
  avertissements: string[]
  jetons: { entree: number; sortie: number }
}

export const REPARATIONS_MAX = 2

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

  surEtape({ etape: 'ecriture', tentative: 1 })
  const reponse = await appeler({
    modele: modeleCreation,
    system: consigneCreation(),
    messages: [{ role: 'user', content: ficheCommerce(brief, catalogue) }],
    max_tokens: 48_000,
  })
  jetons.entree += reponse.entree
  jetons.sortie += reponse.sortie
  let html = extraireHtml(reponse.texte)
  if (!html) throw new SiteImpossible("Le modèle n'a pas rendu une page HTML complète.")

  let tentatives = 1
  let verdict = await new Promise<Awaited<ReturnType<Verificateur>>>((r) => { surEtape({ etape: 'verification', tentative: 1 }); r(verifier(html!)) })
  for (let n = 1; !verdict.ok && n <= REPARATIONS_MAX; n++) {
    surEtape({ etape: 'reparation', tentative: n })
    const repare = await reparerSite(html, verdict.echecs, appeler)
    jetons.entree += repare.jetons.entree
    jetons.sortie += repare.jetons.sortie
    html = repare.html
    tentatives++
    surEtape({ etape: 'verification', tentative: n + 1 })
    verdict = await verifier(html)
  }
  if (!verdict.ok) {
    throw new SiteImpossible('La boutique écrite ne passe pas le contrôle du visiteur après réparations.', verdict.echecs)
  }
  return { html, modele: modeleCreation, tentatives, avertissements: verdict.avertissements, jetons }
}

/* ---------- Modification et réparation : des éditions ciblées ---------- */

export interface SiteModifie {
  html: string
  resume: string
  modele: string
  jetons: { entree: number; sortie: number }
}

async function editer(
  html: string,
  demande: string,
  appeler: AppelModele,
  modeleEdition: string,
): Promise<SiteModifie> {
  const jetons = { entree: 0, sortie: 0 }
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: `# Page actuelle\n\n\`\`\`html\n${html}\n\`\`\`\n\n# Demande\n\n${demande}` },
  ]
  for (let essai = 1; essai <= 2; essai++) {
    const reponse = await appeler({ modele: modeleEdition, system: consigneEdition(), messages, max_tokens: 16_000 })
    jetons.entree += reponse.entree
    jetons.sortie += reponse.sortie

    // Une refonte entière est acceptée quand le modèle la juge nécessaire.
    const entier = /```html/i.test(reponse.texte) ? extraireHtml(reponse.texte) : null
    if (entier) return { html: entier, resume: 'Boutique refondue.', modele: modeleEdition, jetons }

    const editions = extraireEditions(reponse.texte)
    if (!editions || !editions.edits.length) {
      if (essai === 2) throw new SiteImpossible("Le modèle n'a pas rendu d'éditions applicables.")
      messages.push({ role: 'assistant', content: reponse.texte })
      messages.push({ role: 'user', content: 'Ta réponse ne contient pas de bloc ```json avec des "edits". Réponds au format demandé.' })
      continue
    }
    const applique = appliquerEditions(html, editions.edits)
    if (!applique.erreurs.length) return { html: applique.html, resume: editions.resume, modele: modeleEdition, jetons }
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
): Promise<SiteModifie & { avertissements: string[] }> {
  const modeleEdition = modele('AI_MODEL_SITE_MODIF', MODELE_RAPIDE)
  surEtape({ etape: 'ecriture', tentative: 1 })
  const edite = await editer(html, demande, appeler, modeleEdition)
  surEtape({ etape: 'verification', tentative: 1 })
  let verdict = await verifier(edite.html)
  let resultat = edite
  if (!verdict.ok) {
    surEtape({ etape: 'reparation', tentative: 1 })
    const repare = await reparerSite(edite.html, verdict.echecs, appeler)
    resultat = { ...edite, html: repare.html, jetons: { entree: edite.jetons.entree + repare.jetons.entree, sortie: edite.jetons.sortie + repare.jetons.sortie } }
    surEtape({ etape: 'verification', tentative: 2 })
    verdict = await verifier(resultat.html)
    if (!verdict.ok) throw new SiteImpossible('La modification casse la boutique et la réparation n\'a pas suffi.', verdict.echecs)
  }
  return { ...resultat, avertissements: verdict.avertissements }
}

export async function reparerSite(html: string, echecs: string[], appeler: AppelModele = appelAnthropic): Promise<SiteModifie> {
  const demande = `Le contrôle du visiteur a relevé ces manques. Corrige-les tous, sans toucher au reste du design :\n${echecs.map((e) => `- ${e}`).join('\n')}`
  return editer(html, demande, appeler, modele('AI_MODEL_SITE_MODIF', MODELE_RAPIDE))
}
