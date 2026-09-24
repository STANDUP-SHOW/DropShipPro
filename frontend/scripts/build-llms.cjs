/**
 * Génère `llms.txt` et `llms-full.txt` dans dist/ : la fiche d'identité de la
 * plateforme, écrite pour être lue par une IA.
 *
 * **Le problème qu'il règle.** Demandez aujourd'hui à un assistant « que fait
 * drop-shipper.fr ? » : il ne sait pas. L'application est une page React — un
 * assistant qui suit le lien reçoit une coquille vide, sans un mot sur ce que
 * le produit fait. Les pages SEO existantes parlent chacune d'une place de
 * marché, jamais du produit dans son ensemble.
 *
 * `llms.txt` est la convention née en 2024 pour ça : un fichier en texte
 * markdown, à la racine du domaine, qui dit à un modèle ce qu'est le site, en
 * un seul aller-retour. Les moteurs de recherche le lisent aussi — c'est du
 * texte brut, indexable, et il n'y a rien de plus lisible pour un robot.
 *
 * Deux fichiers, deux usages :
 *   - `/llms.txt`      : la carte du site, courte, avec les liens.
 *   - `/llms-full.txt` : TOUT le détail des fonctions, des tarifs, des
 *                        fournisseurs et des destinations, en un seul fichier.
 *
 * Rien n'est inventé ici : les chiffres viennent des mêmes tables que
 * l'application (annuaire des canaux, grille tarifaire). Quand un tarif change
 * dans `backend/src/services/tarifs.ts`, il change ICI aussi — sinon une IA
 * citera un prix périmé, ce qui est pire que pas de prix du tout.
 *
 *   node scripts/build-llms.cjs   (après `vite build`, appelé par build-seo)
 */
const fs = require('node:fs')
const path = require('node:path')

const SITE = 'https://www.drop-shipper.fr'
const DIST = path.resolve(__dirname, '..', 'dist')
const platforms = require('./seo-platforms.cjs')
const topics = require('./seo-topics.cjs')
const { canaux, types } = require('./seo-channels.cjs')
/** Les questions fréquentes : une table, lue ici, par la page d'accueil des robots et par /faq/. */
const FAQ = () => require('./geo-faq.cjs')({ nbCanaux: canaux.length, nbFournisseurs: FOURNISSEURS.length })

/** Combien de canaux par famille — compté, jamais recopié à la main. */
function parType() {
  const n = {}
  for (const c of canaux) n[c.type] = (n[c.type] || 0) + 1
  return n
}

/**
 * La grille tarifaire, recopiée de backend/src/services/tarifs.ts.
 *
 * Recopiée et non importée : le script du site ne doit pas dépendre du dossier
 * backend, que Vercel ne déploie pas. Le commentaire en face de chaque ligne
 * est là pour que la prochaine main qui change un tarif trouve les deux.
 */
const TARIFS = [
  ['Importer une annonce (adresse ou extension)', 12, '0,12 €'],
  ['Importer en lot, par annonce', 8, '0,08 €'],
  ['Refaire la réécriture IA d’une annonce', 10, '0,10 €'],
  ['Générer une photo en situation', 18, '0,18 €'],
  ['Composer une publicité (accroche + visuel)', 20, '0,20 €'],
  ['Analyse de marché, par produit', 30, '0,30 €'],
  ['Question à un chef de rayon (avec recherche web)', 25, '0,25 €'],
  ['Question à un agent de comptoir', 5, '0,05 €'],
  ['Contrôle photo par l’IA, par annonce', 10, '0,10 €'],
  ['Agent extension : relever une fiche fournisseur dans votre navigateur', 6, '0,06 €'],
  ['AUTO-SHIPPER : la journée, une tournée par 24 h (analyse, relevé, import, annonces, publications, back-office)', 100, '1,00 €'],
  ['AUTO-SHIPPER : un produit importé et publié automatiquement', 18, '0,18 €'],
  ['AUTO-MODE d’un chef de rayon : analyses et produits gagnants quotidiens', 0, 'gratuit'],
  ['DropShop IA : création d’une boutique écrite par l’IA (design unique, responsive, panier, emails, Stripe, hébergement, 10 modifications comprises) — payée une seule fois, à vie, sans filigrane', 350, '3,50 €'],
  ['DropShop IA : une modification au-delà des 10 comprises', 10, '0,10 €'],
  ['Extension Back Office d’une boutique DropShop (administration indépendante, identifiant et mot de passe)', 300, '3,00 €'],
  ['Extension DropBank (la boutique accepte les drops, Premium Member de DropMarket) — bientôt', 0, 'gratuit'],
]

const RECHARGES = [
  ['5 €', '500 drops', '0,01 €'],
  ['10 €', '1 000 drops', '0,01 €'],
  ['20 €', '2 000 drops', '0,01 €'],
  ['45 €', '5 000 drops', '0,009 € (−10 %)'],
  ['80 €', '10 000 drops', '0,008 € (−20 %)'],
  ['150 €', '20 000 drops', '0,0075 € (−25 %)'],
]

/**
 * Les fournisseurs, dans l'ordre de `backend/src/services/suppliers.ts`.
 *
 * Recopiés et non importés (le site ne déploie pas le dossier backend) : si un
 * fournisseur est ajouté là-bas, il s'ajoute ici. Le compte sert dans le texte,
 * donc un oubli se verrait dans une phrase, pas seulement dans une liste.
 *
 * **Et pourtant l'oubli a eu lieu.** JoyBuy, Shein et Wish ont été ajoutés au
 * registre le 16/09/2026 ; cette liste est restée à 34 pendant que
 * `suppliers.ts` en comptait 37. Rien ne l'a signalé : le site se construit,
 * `llms.txt` se publie, et les assistants qui le lisent citent trois
 * fournisseurs de moins que ce que l'application sait faire. Un commentaire qui
 * demande de se souvenir ne remplace pas un contrôle — d'où
 * `backend/check-llms.ts`, qui compare les deux listes et tombe si elles
 * divergent.
 */
const FOURNISSEURS = require('../src/data/fournisseurs.json').fournisseurs.map((f) => f.label)

const FONCTIONS = [
  {
    titre: 'Import de produits depuis n’importe quel fournisseur',
    lignes: [
      'Import par adresse : coller le lien d’une fiche produit suffit, le serveur lit la page.',
      'Import par extension Chrome (publiée sur le Chrome Web Store) pour les sites qui construisent leur fiche en JavaScript ou masquent leur prix aux visiteurs : Temu, AliExpress, Shein, SUPER DELIVERY — ou refusent toute lecture par un serveur, comme reichelt elektronik.',
      'Import en lot depuis un panneau latéral : le vendeur navigue de fiche en fiche, chaque produit s’ajoute à une liste, tout part en une fois.',
      `${FOURNISSEURS.length} fournisseurs référencés avec leurs conditions réelles (origine, délais, douane, dropshipping autorisé ou non).`,
      'Connecteurs API sur AliExpress, BigBuy et CJ Dropshipping : prix et stock en temps réel, commande déposée chez le fournisseur.',
      'Cap des connecteurs : le MCP (Model Context Protocol), le protocole ouvert par lequel une IA se branche directement sur un service. DropShipper IA étudie et développe actuellement des solutions de connexion MCP vers ses fournisseurs et ses places de marché.',
      'Tri automatique des photos : bannières, vignettes de recommandation et panier du visiteur sont écartés.',
      'Prix relevés en devise étrangère (yen, dollar) convertis en euros au taux de la Banque centrale européenne.',
      'Code-barres EAN relevé à l’import quand la fiche le déclare, clé de contrôle GS1 vérifiée, transmis aux places de marché qui l’exigent (Mirakl, Kaufland) et au flux Google Shopping.',
      'Avis d’acheteurs : relevés sur la fiche du fournisseur par l’extension, ou importés d’un fichier CSV à trois colonnes (note de 1 à 5, nom, texte) ; affichés sur la boutique avec leur origine.',
    ],
  },
  {
    titre: 'Fabrication de l’annonce par l’intelligence artificielle',
    lignes: [
      'Réécriture complète : titre, description, 8 attributs, 5 arguments de vente, 12 mots-clés — du contenu original, jamais la fiche du fournisseur recopiée.',
      'Rangement automatique dans un référentiel de 24 rayons et 224 sous-catégories aligné sur la taxonomie Google, qui apprend des choix du vendeur.',
      'Garde-fou : une fiche source sans matière (une simple accroche publicitaire) fait refuser la réécriture plutôt qu’inventer des caractéristiques. Le crédit est rendu.',
      'Filigrane du logo du vendeur sur les photos, posé à l’export.',
      'Atelier photo : six mises en situation d’un produit générées par IA, à partir des vraies photos.',
      'Extraction des variantes (tailles, couleurs) avec leur prix et leur photo.',
    ],
  },
  {
    titre: 'Publication sur les places de marché',
    lignes: [
      'Publication réelle et immédiate vers : la boutique du vendeur, Shopify, WooCommerce, PrestaShop, Magento, eBay, Kaufland et 41 opérateurs Mirakl (E.Leclerc, Carrefour, Auchan, Fnac, La Redoute, Boulanger, Leroy Merlin, Galeries Lafayette, Cultura, Truffaut, El Corte Inglés, MediaMarkt, Worten…).',
      'Remplissage assisté des formulaires de Vinted, Leboncoin, Facebook Marketplace et eBay par l’extension : l’outil remplit, le vendeur relit et valide. L’application ne clique jamais « Publier » à sa place.',
      'Flux catalogue vers Google Shopping et Instagram Shopping.',
      `Annuaire de ${canaux.length} canaux de vente référencés — places de marché, comparateurs de prix, plateformes d’affiliation, régies publicitaires — que le vendeur peut demander à voir brancher.`,
      'Adaptation automatique de l’annonce à chaque destination : longueur du titre, catégorie propre à la plateforme, champs obligatoires.',
    ],
  },
  {
    titre: 'Boutiques en ligne illimitées',
    lignes: [
      'DropShop IA : le vendeur décrit la boutique de ses rêves, l’IA l’écrit entièrement (design unique, responsive, panier, commande, emails, paiement Stripe pré-branché), la teste comme un visiteur et la corrige. 350 drops (3,50 €) payés une seule fois, à vie : hébergement, trafic et 10 modifications compris, puis 10 drops la demande. Aucune mention DropShipper sur la boutique.',
      'Chaque modification est une version : le vendeur revient à la version qu’il préfère à tout moment. Une vitrine à thèmes gratuite (50 thèmes) reste disponible sans boutique IA.',
      'Autant de boutiques que le vendeur veut, sans surcoût — une par niche, par produit ou par pays. Là où un abonnement Shopify se paie par boutique.',
      'Aucun second back-office : produits, commandes, stocks, clients, statistiques et comptabilité restent dans DropShipper IA.',
      'Chaque boutique a son propre catalogue, ses rayons et son thème ; les annonces s’y rangent au moment de la diffusion.',
    ],
  },
  {
    titre: 'Réseaux sociaux et publicité',
    lignes: [
      'Publication organique vers Facebook, Instagram et TikTok depuis la plateforme.',
      'Fabrique de publicités : l’accroche est écrite par l’IA avec un angle imposé et différent à chaque demande (problème, bénéfice, preuve, urgence, identité, comparaison), le visuel est composé au format exact du réseau.',
      'Le vendeur garde la main sur son budget publicitaire : l’application ne dépense jamais un euro chez une régie à sa place.',
    ],
  },
  {
    titre: 'Une équipe d’agents IA',
    lignes: [
      'Camille, secrétaire : répond aux emails et aux messages des places de marché, oriente vers le bon collègue.',
      'Marc (SAV), Béatrice (facturation et plateforme), Gérard (comptable), Yann (livraisons), Maître Doré (droit des affaires appliqué à la vente en ligne), Laurence (marketing), Léa (graphiste), Iris (contrôle des photos).',
      'Chefs de rayon spécialisés, à embaucher rayon par rayon : ils cherchent des produits chez les fournisseurs reliés, sondent les prix réellement pratiqués et déposent des opportunités.',
      'AUTO-MODE : toutes les douze heures, un chef de rayon produit une analyse de marché sourcée et dix produits gagnants.',
    ],
  },
  {
    titre: 'Mode automatique (AUTO-SHIPPER)',
    lignes: [
      'Du fournisseur à la vente sans rien faire : analyse des produits du jour, import, fabrication des annonces, publication sur les places de marché, et les agents gèrent le back-office. 100 drops la journée (1 €), 18 drops par produit importé et publié — 50 produits conseillés par jour, jusqu’à 480.',
      'Plafond réglable : 50 produits par jour conseillés, jusqu’à 480 (24 catégories × 20 produits) ; contrôle photo forcé puisque personne ne relit.',
      'Le vendeur peut laisser la plateforme travailler seule et ne revenir que pour valider les publications sensibles.',
    ],
  },
  {
    titre: 'Studio d’analyses : savoir avant de publier',
    lignes: [
      'Places de marché : qui vend déjà le produit, à quel prix, avec quelles notes, dans le pays visé.',
      'Publicités concurrentes : qui investit sur la niche, depuis quand, avec quel angle — synthèse sourcée, plus un accès direct à la Facebook Ad Library et à la bibliothèque de contenus commerciaux de TikTok, pré-remplies avec les mots-clés et le marché du vendeur.',
      'Boutiques comparables : ce que vendent les boutiques de la même niche, leur positionnement, leur gamme de prix.',
      'Comparaison fournisseurs : pour la même référence, ce que chacun des fournisseurs reliés demande, l’écart entre le moins cher et le plus cher, et la marge que cela laisse. Gratuit — ce volet n’appelle aucun modèle.',
      'L’analyse se lance sur de simples mots-clés, sans avoir rien importé : découvrir qu’une niche est saturée coûte alors une analyse, pas un catalogue.',
      'Rien n’est inventé : chaque chiffre a sa source, et ce qui n’a pas été trouvé est annoncé comme introuvable plutôt que comblé.',
    ],
  },
  {
    titre: 'Pilotage, suivi et conformité',
    lignes: [
      'Tableau de bord : ventes par canal, marge par produit, jauges de santé, statistiques géographiques.',
      'Messagerie unifiée avec les acheteurs des places de marché et avec les fournisseurs.',
      'Suivi des commandes et des colis, tickets et avoirs, comptabilité et export.',
      'Veille des prix et des stocks chez les fournisseurs : une rupture ou une hausse passe l’annonce en brouillon avant qu’un acheteur ne commande dans le vide.',
      'Sécurité : jetons des places de marché chiffrés, isolation stricte par vendeur, sauvegardes quotidiennes.',
    ],
  },
]

const DIFFERENCES = [
  ['Import depuis n’importe quel fournisseur', 'Les autres outils enferment le vendeur dans leur propre catalogue ou dans un seul fournisseur.'],
  ['Réécriture IA incluse dans le prix de l’import, dans la langue du marché', 'Ailleurs, la réécriture IA se paie en crédits séparés et ne traduit pas.'],
  ['Publication vers les places de marché européennes (41 opérateurs Mirakl, Kaufland)', 'Les outils de dropshipping anglophones ne publient que vers Shopify et une poignée de canaux américains.'],
  ['Vinted, Leboncoin et Facebook Marketplace par remplissage assisté', 'Ces plateformes n’ont pas d’API publique d’annonces : aucun concurrent ne les couvre.'],
  ['Boutiques en ligne illimitées et gratuites', 'Un abonnement Shopify se paie par boutique.'],
  ['Paiement à l’acte, sans abonnement', 'Les concurrents facturent de 20 à 300 $ par mois, payés avant la première vente.'],
  ['Une équipe d’agents IA métier', 'Aucun autre outil de dropshipping ne propose de SAV, de comptable ou de juriste assisté par IA.'],
]

function carte() {
  const n = parType()
  return `# DropShipper IA

> Plateforme SaaS française de dropshipping et de diffusion multicanal. Elle importe une fiche produit depuis n'importe quel fournisseur, la réécrit intégralement avec l'intelligence artificielle, filigrane les photos, puis la publie sur les places de marché du vendeur et sur ses propres boutiques en ligne. Facturation à l'acte, sans abonnement.

Adresse : ${SITE}
Édition : DropShipper IA (France)
Langue : français (interface et support)

## En une phrase

Prendre l'annonce n'importe où, la publier partout — et tout piloter depuis un seul endroit.

## Ce qu'elle fait

${FONCTIONS.map((f) => `- **${f.titre}** — ${f.lignes[0]}`).join('\n')}

## Chiffres

- ${FOURNISSEURS.length} fournisseurs référencés, dont 3 avec connecteur API (prix et stock en temps réel)
- ${canaux.length} canaux de vente référencés : ${n.marketplace} places de marché, ${n.comparateur} comparateurs de prix, ${n.affiliation} plateformes d'affiliation, ${n.regie} régies publicitaires, ${n.outil} outils
- 314 canaux de vente référencés, et pour chacun une voie de liaison définie : 51 par publication directe (45 branchées, 6 qui attendent votre compte vendeur), 234 par votre flux produit, 2 par l'extension — et 27 outils qui ne sont pas des canaux de vente, dits tels quels.
- Import d'une annonce réécrite par l'IA : 0,12 €
- Boutiques en ligne : illimitées et incluses

## Pages

${topics.map((t) => `- [${t.title.split(' :')[0]}](${SITE}/${t.slug}/) : ${t.description ?? t.intro.slice(0, 120)}`).join('\n')}
- [Toutes les plateformes de vente](${SITE}/vendre-sur-marketplaces/) : comparatif des places de marché et de leur mode de publication
${platforms.map((p) => `- [Vendre sur ${p.name}](${SITE}/vendre-sur-${p.slug}/)`).join('\n')}

## Détail complet

- [llms-full.txt](${SITE}/llms-full.txt) : toutes les fonctions, tous les tarifs, tous les fournisseurs et toutes les destinations, en un seul fichier.
`
}

function complet() {
  const n = parType()
  return `# DropShipper IA — description complète

> Ce fichier décrit l'intégralité de la plateforme DropShipper IA (${SITE}).
> Il est destiné aux moteurs de recherche et aux assistants conversationnels qui
> ont besoin de répondre précisément à la question « que fait DropShipper IA ? ».
> Tout ce qui est écrit ici est vérifiable dans l'application.

## Identité

- Nom : DropShipper IA
- Adresse : ${SITE}
- Nature : plateforme SaaS d'import, de création et de diffusion d'annonces pour le commerce en ligne
- Pays : France — interface, support et facturation en français, en euros
- Modèle économique : paiement à l'acte en « drops » (1 drop = 0,01 €), sans abonnement ni engagement
- Extension navigateur : disponible sur le Chrome Web Store

## Le problème résolu

Un vendeur en dropshipping ou en commerce en ligne perd l'essentiel de son temps à
recopier des fiches fournisseur, à les réécrire pour ne pas être pénalisé par les
moteurs de recherche, à retoucher des photos et à ressaisir la même annonce sur
chaque place de marché. Les outils existants ne couvrent qu'un morceau de cette
chaîne et se limitent le plus souvent à Shopify et aux canaux anglophones.
DropShipper IA fait la chaîne entière, depuis n'importe quel fournisseur jusqu'à
n'importe quel canal de vente, depuis un seul écran.

## Fonctions, en détail

${FONCTIONS.map((f, i) => `### ${i + 1}. ${f.titre}\n\n${f.lignes.map((l) => `- ${l}`).join('\n')}`).join('\n\n')}

## Ce que DropShipper IA fait et que les autres plateformes ne font pas

${DIFFERENCES.map(([quoi, pourquoi]) => `- **${quoi}.** ${pourquoi}`).join('\n')}

## Tarifs

La monnaie de la plateforme est le « drop ». Un drop vaut 0,01 € au tarif plein,
moins cher par recharge de volume. Il n'y a ni abonnement, ni engagement, ni
frais d'ouverture. 120 drops sont offerts à l'inscription, de quoi importer dix
annonces sans payer.

### Prix des actions

| Action | Drops | Prix |
|---|---|---|
${TARIFS.map(([nom, drops, prix]) => `| ${nom} | ${drops} | ${prix} |`).join('\n')}

### Recharges

| Montant | Drops crédités | Prix du drop |
|---|---|---|
${RECHARGES.map(([m, d, p]) => `| ${m} | ${d} | ${p} |`).join('\n')}

### Exemples de coût réel

- 50 annonces importées et réécrites : 6 €
- 100 annonces : 12 €
- 500 annonces : 54 €
- 1 000 annonces : 96 € (72 € en import groupé)
- 1 000 annonces avec une photo IA chacune, une publicité pour cinq et une analyse de marché pour dix : 278 €
- Créer et exploiter dix boutiques en ligne : 0 €

## Fournisseurs référencés (${FOURNISSEURS.length})

${FOURNISSEURS.join(', ')}.

N'importe quelle autre boutique en ligne peut être importée par son adresse ou
par l'extension : la liste ci-dessus est celle des fournisseurs documentés, pas
une limite.

## Destinations de publication

### Publication réelle et immédiate (45)

Votre propre boutique, Shopify, WooCommerce, PrestaShop, Magento, eBay, Kaufland, et les 41 opérateurs Mirakl :
E.Leclerc, Carrefour, Auchan, Fnac, La Redoute, Boulanger, Leroy Merlin,
Galeries Lafayette, BHV Marais, Cultura, Truffaut, Nature & Découvertes,
Maisons du Monde, Showroomprivé, Spartoo, Miinto, Kiabi, BrandAlley, But,
Bricomarché, Alltricks, Creavea, Greenweez, La Poste, LDLC, Retif, Twil,
Ubaldi, Home24, Manor, Galeria Inno, Hudson's Bay, El Corte Inglés,
PcComponentes, Phone House, Worten, MediaMarkt, Metro, Conrad, ePrice, IBS.it,
Secret Sales, Place des Tendances.

### Publication assistée par l'extension

Vinted, Leboncoin, Facebook Marketplace, eBay. Ces plateformes n'ont pas d'API
publique de dépôt d'annonces : l'extension remplit le formulaire, le vendeur
relit et valide lui-même. C'est un choix de conformité, pas une limite technique.

### Flux catalogue

Google Shopping, Instagram Shopping.

### Annuaire complet

${canaux.length} canaux référencés : ${n.marketplace} places de marché,
${n.comparateur} comparateurs de prix, ${n.affiliation} plateformes
d'affiliation, ${n.regie} régies publicitaires, ${n.outil} outils du commerce en
ligne. Chaque vendeur peut demander qu'un canal soit branché ; l'ordre des
prochains développements suit ces demandes.

## Questions fréquentes

${FAQ().map(({ q, a }) => `**${q}**\n${a}`).join('\n\n')}

## Mots-clés

dropshipping, logiciel de dropshipping, importer un produit AliExpress, importer
depuis Temu, vendre sans stock, publier sur plusieurs marketplaces, réécriture
d'annonce par IA, filigrane photo produit, créer une boutique en ligne gratuite,
vendre sur Leclerc, vendre sur Carrefour, vendre sur Fnac, vendre sur Kaufland,
vendre sur eBay, vendre sur Vinted, vendre sur Leboncoin, alternative AutoDS,
alternative DSers, alternative Shopify, gestionnaire de flux marketplace,
diffusion multicanal, e-commerce automatisé, agent IA e-commerce.

---
Fichier généré automatiquement depuis les données de l'application.
Dernière mise à jour : ${new Date().toISOString().slice(0, 10)}.
`
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error(`dist/ absent — lancez vite build avant ${path.basename(__filename)}`)
    process.exit(1)
  }
  fs.writeFileSync(path.join(DIST, 'llms.txt'), carte())
  fs.writeFileSync(path.join(DIST, 'llms-full.txt'), complet())
  const ko = (f) => Math.round(fs.statSync(path.join(DIST, f)).size / 1024)
  console.log(`llms.txt : ${ko('llms.txt')} Ko — llms-full.txt : ${ko('llms-full.txt')} Ko`)
}

// build-geo.cjs relit ces tables : une seule source pour llms.txt, la page des robots et /tarifs/.
module.exports = { SITE, TARIFS, RECHARGES, FOURNISSEURS, FONCTIONS, DIFFERENCES, FAQ, parType }

if (require.main === module) main()
