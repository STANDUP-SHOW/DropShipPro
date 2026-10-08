/**
 * Le texte long des onze pages /fonctions/<slug>/ — les « pages solutions »
 * (chantier SEO du 07/10/2026, d'après l'audit de dropship.io).
 *
 * Une entrée par thème de l'accueil (src/data/accueil-themes.json, même slug).
 * Le thème donne déjà l'accroche, les points et le paragraphe « En détail » ;
 * ici vivent ce que l'audit Semrush du 03/10 jugeait absent : un H1 au nom de
 * la fonction, un bloc « En bref » d'une cinquantaine de mots (la réponse
 * directe qu'un assistant reprend), un vrai texte en sections, et une FAQ
 * balisée FAQPage.
 *
 * Règle d'écriture, la même que llms.txt : rien d'inventé. Chaque prix recopie
 * backend/src/services/tarifs.ts (DROPS), chaque longueur de titre
 * backend/src/services/channelRules.ts (TITRE_MAX), chaque compte de canaux ou
 * de fournisseurs est calculé depuis les tables (seo-channels.cjs,
 * fournisseurs.json) — jamais recopié à la main. Le banc backend/check-geo.ts
 * relit les pages construites.
 *
 * `html` est écrit par nous et inséré tel quel : pas de texte venu d'ailleurs.
 */
const { canaux } = require('./seo-channels.cjs')
const FOURNISSEURS = require('../src/data/fournisseurs.json').fournisseurs.map((f) => f.label)

const nb = {}
for (const c of canaux) nb[c.type] = (nb[c.type] || 0) + 1
const NB_CANAUX = canaux.length
const NB_FOURN = FOURNISSEURS.length
const CHROME_STORE = 'https://chromewebstore.google.com/detail/dmhhfboiialjghjkjhfnipjafffpodlk'

/** Longueur maximale de titre par destination — recopie de TITRE_MAX (channelRules.ts). */
const TITRE_MAX = [
  ['Leboncoin', 50],
  ['Vinted', 70],
  ['eBay', 80],
  ['Kaufland', 80],
  ['Facebook Marketplace', 100],
  ['La Redoute, E.Leclerc, BHV, Kiabi, Spartoo', 120],
  ['Cdiscount', 132],
  ['Etsy', 140],
  ['Google Shopping', 150],
  ['Amazon', 200],
  ['Shopify, TikTok Shop', 255],
]

const CONTENU = {
  'scraping-produits': {
    nom: 'Relevé de produits',
    h1: "Relevé de produits : importez n'importe quel produit, de n'importe quel site",
    title: 'Relevé de produits : import depuis tout fournisseur',
    description:
      "Importez un produit depuis AliExpress, Temu, Shein ou toute boutique : photos triées, variantes, prix en euros, EAN vérifié. 0,12 € l'annonce.",
    enBref: `Le relevé de produits de DropShipper IA importe une fiche depuis n'importe quelle boutique en ligne : par l'adresse collée, par l'extension Chrome (AliExpress, Temu, Shein) ou en lot. Photos triées, variantes, prix converti en euros, EAN vérifié et avis relevés partent vers l'IA. 12 drops (0,12 €) l'annonce, 8 en lot.`,
    sections: [
      {
        h2: 'Pourquoi le relevé décide de la qualité de l’annonce',
        html: `<p>Une annonce ne vaut que ce que le relevé lui a donné. Un produit importé sans ses variantes oblige à les ressaisir ; sans ses vraies photos, il ne passe pas la modération d'une place de marché ; sans prix fiable, il fait vendre à perte. Les outils qui ne lisent que le code d'une page ratent tout ce que le site affiche après coup : la galerie complète, le prix de la variante choisie, le stock réel.</p>
<p>DropShipper IA part du principe inverse : lire la fiche telle que vous la voyez. Ce qui est relevé — texte, photos, prix, variantes, code-barres, avis — part ensuite vers l'IA qui compose l'annonce. Le relevé et la réécriture sont facturés ensemble : 12 drops, soit 0,12 €, pour une annonce prête.</p>`,
      },
      {
        h2: 'Trois façons d’importer, selon le site',
        html: `<h3>L'adresse collée</h3>
<p>Pour les boutiques lisibles par un serveur, coller le lien de la fiche suffit. Le serveur lit la page, en extrait le produit et le transmet à l'IA. C'est le chemin le plus rapide pour les boutiques Shopify, WooCommerce et la plupart des grossistes européens.</p>
<h3>L'extension Chrome</h3>
<p>AliExpress, Temu et Shein construisent leur fiche en JavaScript : un serveur qui lit leur page reçoit une coquille vide. SUPER DELIVERY masque ses prix aux visiteurs non connectés, et reichelt elektronik refuse toute lecture par un serveur. Pour ces sites, l'<a href="${CHROME_STORE}" rel="noopener" target="_blank">extension Chrome de DropShipper IA</a> lit la page dans votre navigateur, une fois que le site a chargé sa galerie et son prix, et l'envoie à votre compte d'un clic.</p>
<h3>Le lot, depuis le panneau latéral</h3>
<p>Vous naviguez de fiche en fiche chez le fournisseur ; chaque produit s'ajoute à une liste dans le panneau latéral, et tout part en une fois. L'import en lot coûte 8 drops par annonce au lieu de 12 : c'est le mode à privilégier quand vous constituez un catalogue.</p>`,
      },
      {
        h2: 'Ce qui est relevé, et ce qui est écarté',
        html: `<ul>
<li><strong>Les photos du produit</strong>, et elles seules : bannières promotionnelles, vignettes de recommandation et articles du panier du visiteur sont écartés automatiquement.</li>
<li><strong>Les variantes</strong> (tailles, couleurs) avec leur prix et leur photo propres.</li>
<li><strong>Le prix</strong>, converti en euros au taux de la Banque centrale européenne quand la fiche l'affiche en yen ou en dollar.</li>
<li><strong>Le code-barres EAN</strong> quand la fiche le déclare : sa clé de contrôle GS1 est vérifiée, puis il part vers les places de marché qui l'exigent (Mirakl, Kaufland) et dans le flux Google Shopping.</li>
<li><strong>Les avis d'acheteurs</strong>, relevés sur la fiche par l'extension avec leur note, ou importés d'un fichier CSV à trois colonnes (note de 1 à 5, nom, texte), puis affichés sur votre boutique avec leur origine.</li>
</ul>
<p>Ce que la fiche ne dit pas n'est pas inventé. Une fiche sans description reste en brouillon plutôt que de recevoir des caractéristiques imaginées, et le crédit de réécriture est rendu.</p>`,
      },
      {
        h2: 'Après l’import : un produit surveillé',
        html: `<p>Le relevé ne s'arrête pas au premier import. La veille des prix et des stocks repasse chez le fournisseur : une rupture ou une hausse de prix fait passer l'annonce en brouillon avant qu'un acheteur ne commande un produit indisponible ou vendu à perte. Pour les fournisseurs reliés par API — AliExpress, BigBuy et CJ Dropshipping — prix et stock remontent en temps réel et la commande peut être déposée chez eux sans ressaisie.</p>
<p>Le produit importé rejoint votre catalogue : l'IA en écrit l'annonce (voir <a href="/fonctions/annonces-ia/">Annonces IA</a>), puis vous la diffusez sur vos boutiques et vos places de marché (voir <a href="/fonctions/diffusion/">Diffusion multicanal</a>).</p>`,
      },
      {
        h2: 'Combien coûte un import',
        html: `<p>Pas d'abonnement : chaque import se paie en drops, et 1 drop vaut 0,01 €.</p>
<ul>
<li>Import d'une annonce par adresse ou par extension, réécriture IA comprise : <strong>12 drops (0,12 €)</strong>.</li>
<li>Import en lot : <strong>8 drops (0,08 €)</strong> par annonce.</li>
<li>Relevé d'une fiche par l'agent de l'extension, dans votre navigateur : <strong>6 drops (0,06 €)</strong>.</li>
</ul>
<p>Les 120 drops offerts à l'inscription couvrent dix imports complets. Le détail de chaque action est sur la page <a href="/tarifs/">Tarifs</a>.</p>`,
      },
    ],
    faq: [
      {
        q: 'Peut-on importer un produit depuis AliExpress, Temu ou Shein ?',
        a: "Oui, par l'extension Chrome de DropShipper IA. Ces sites construisent leur fiche en JavaScript, illisible pour un serveur ; l'extension lit la page dans votre navigateur, une fois la galerie et le prix chargés, et l'envoie à votre compte en un clic.",
      },
      {
        q: 'Combien coûte l’import d’un produit ?',
        a: "12 drops, soit 0,12 €, réécriture de l'annonce par l'IA comprise. En lot, 8 drops (0,08 €) par annonce. 120 drops sont offerts à l'inscription, de quoi importer dix annonces sans payer.",
      },
      {
        q: 'Les photos importées sont-elles triées ?',
        a: "Oui. Seules les photos du produit sont gardées : bannières promotionnelles, vignettes de recommandation et articles du panier du visiteur sont écartés. Votre filigrane peut ensuite être posé à l'export.",
      },
      {
        q: 'Le prix est-il converti en euros ?',
        a: "Oui. Un prix relevé en yen ou en dollar est converti en euros au taux de la Banque centrale européenne. Vous fixez ensuite votre prix de vente ; le calculateur de marge gratuit aide à le choisir.",
      },
      {
        q: 'Que se passe-t-il si le fournisseur tombe en rupture ?',
        a: "La veille des prix et des stocks repasse chez le fournisseur : une rupture ou une hausse de prix fait passer l'annonce en brouillon avant qu'un acheteur ne commande dans le vide.",
      },
    ],
    outils: ['calculateur-marge', 'generateur-titre-annonce'],
  },

  fournisseurs: {
    nom: 'Fournisseurs',
    h1: `Fournisseurs : ${NB_FOURN} fournisseurs de dropshipping, avec leurs vraies conditions`,
    title: `Fournisseurs de dropshipping : ${NB_FOURN} documentés`,
    description: `${NB_FOURN} fournisseurs de dropshipping documentés : origine, délais, douane, dropshipping autorisé ou non. AliExpress, BigBuy et CJ reliés par API.`,
    enBref: `DropShipper IA documente ${NB_FOURN} fournisseurs de dropshipping avec leurs conditions réelles : pays d'expédition, délais, douane, dropshipping autorisé ou non, photos réutilisables ou non. AliExpress, BigBuy et CJ Dropshipping sont reliés par API pour le prix, le stock et la commande. Les autres boutiques s'importent par adresse ou extension Chrome.`,
    sections: [
      {
        h2: 'Choisir un fournisseur, c’est choisir un délai, une douane et des règles',
        html: `<p>Un catalogue ne dit pas tout. Le même produit expédié de Chine, d'Allemagne ou d'Espagne n'arrive ni dans le même délai, ni avec les mêmes frais à l'arrivée, et certains fournisseurs interdisent purement et simplement la revente de leurs photos. Un vendeur qui l'apprend après coup l'apprend souvent par une suspension de compte.</p>
<p>L'annuaire de DropShipper IA lit ces conditions sur les pages des fournisseurs eux-mêmes et les résume pour un vendeur : d'où part la marchandise, par où passe l'import, ce que les conditions d'utilisation autorisent. Quelques exemples relevés : SUPER DELIVERY ne fait pas de dropshipping et interdit la reprise des photos avant achat ; reichelt elektronik vend en détaillant, avec un port à chaque commande ; AliExpress annonce des délais qui comptent rarement le dédouanement.</p>`,
      },
      {
        h2: 'Trois fournisseurs reliés par leur API officielle',
        html: `<p>AliExpress, BigBuy et CJ Dropshipping sont reliés par leur API officielle. Concrètement :</p>
<ul>
<li>le prix et le stock remontent en temps réel, sans repasser par la fiche ;</li>
<li>la commande d'un client peut être déposée chez le fournisseur sans ressaisie ;</li>
<li>une rupture se voit avant la vente, pas après.</li>
</ul>
<p>Le raccordement se fait depuis votre compte, avec l'autorisation ou la clé d'API que le fournisseur vous délivre. Pour aller plus loin, la plateforme étudie et développe des connexions MCP (Model Context Protocol), le protocole ouvert par lequel une IA se branche directement sur un service, vers ses fournisseurs et ses places de marché.</p>`,
      },
      {
        h2: 'Les fournisseurs documentés',
        html: `<p>${FOURNISSEURS.join(', ')}.</p>
<p>Un fournisseur absent de la liste n'est pas exclu : toute boutique en ligne s'importe par l'adresse de sa fiche ou par l'<a href="${CHROME_STORE}" rel="noopener" target="_blank">extension Chrome</a> (voir <a href="/fonctions/scraping-produits/">Relevé de produits</a>).</p>`,
      },
      {
        h2: 'Comparer les fournisseurs pour une même référence',
        html: `<p>La comparaison fournisseurs met côte à côte, pour une même référence, ce que demande chacun des fournisseurs reliés, l'écart entre le moins cher et le plus cher, et la marge que cela vous laisse. Ce volet n'appelle aucun modèle d'IA : il est gratuit.</p>
<p>Pour vérifier une marge avant même de créer un compte, le <a href="/outils/calculateur-marge/">calculateur de marge gratuit</a> fait le calcul à partir du prix d'achat, des frais de port, de la commission de la place de marché et de la TVA.</p>`,
      },
      {
        h2: 'Les fournisseurs restent chez vous',
        html: `<p>Les prix d'achat et les adresses fournisseur relevés par vos imports ou par les analyses de marché ne sont jamais publiés : sur les pages publiques de DropShipper IA, seul le prix de vente conseillé apparaît. Votre sourcing reste votre avantage.</p>`,
      },
    ],
    faq: [
      {
        q: 'Combien de fournisseurs DropShipper IA connaît-il ?',
        a: `${NB_FOURN} fournisseurs sont documentés avec leurs conditions réelles, dont AliExpress, Temu, CJ Dropshipping, BigBuy, vidaXL, Printful, SUPER DELIVERY et reichelt elektronik. N'importe quelle autre boutique en ligne s'importe par son adresse ou par l'extension Chrome.`,
      },
      {
        q: 'Quels fournisseurs sont reliés par API ?',
        a: 'AliExpress, BigBuy et CJ Dropshipping, par leur API officielle : prix et stock en temps réel, et commande déposée chez le fournisseur sans ressaisie.',
      },
      {
        q: 'Peut-on réutiliser les photos d’un fournisseur ?',
        a: "Cela dépend du fournisseur, et l'annuaire le dit pour chacun quand ses conditions le précisent. SUPER DELIVERY, par exemple, interdit la reprise des photos avant achat. Les photos en situation générées par l'IA à partir de vos photos sont une alternative.",
      },
      {
        q: 'La comparaison de fournisseurs est-elle payante ?',
        a: "Non. La comparaison des prix d'une même référence chez les fournisseurs reliés n'appelle aucun modèle d'IA et reste gratuite.",
      },
    ],
    outils: ['calculateur-marge', 'roas-equilibre'],
  },

  'annonces-ia': {
    nom: 'Annonces IA',
    h1: "Annonces IA : des fiches produit réécrites par l'intelligence artificielle, sans invention",
    title: 'Annonces IA : fiches produit réécrites par l’IA',
    description:
      "L'IA réécrit titre, description, 5 arguments, 8 attributs, 12 mots-clés et catégorie, adaptés à chaque place de marché. Jamais inventé. 0,12 € l'annonce.",
    enBref: `Annonces IA réécrit chaque produit importé en français : titre en trois longueurs, description, 5 arguments de vente, 8 attributs, 12 mots-clés, méta-titre et catégorie parmi 224 sous-catégories. Chaque canal reçoit le titre à sa longueur (50 caractères pour Leboncoin, 200 pour Amazon). Rien n'est inventé. 12 drops l'annonce, import compris.`,
    sections: [
      {
        h2: 'Ce que l’IA écrit pour chaque produit',
        html: `<ul>
<li><strong>Trois titres</strong> : court, moyen et long, pour servir des destinations aux limites très différentes.</li>
<li><strong>Une description</strong> originale, jamais la fiche du fournisseur recopiée.</li>
<li><strong>Cinq arguments de vente</strong>, que les places de marché affichent en puces.</li>
<li><strong>Huit attributs structurés</strong> (matière, couleur, dimensions, genre, état…), que les places de marché transforment en filtres de recherche.</li>
<li><strong>Douze mots-clés</strong>, un méta-titre et une méta-description pour le référencement de votre boutique.</li>
<li><strong>Une catégorie</strong>, rangée dans un référentiel de 24 rayons et 224 sous-catégories aligné sur la taxonomie Google.</li>
</ul>`,
      },
      {
        h2: 'Pourquoi une annonce inventée est pire qu’une annonce absente',
        html: `<p>Un modèle de langage sait écrire une fiche convaincante sur n'importe quoi, y compris sur un produit dont il ne sait rien. Le résultat a l'air bon, il est publié, et ce sont des affirmations commerciales fausses au nom du vendeur : une matière qui n'est pas la bonne, une compatibilité qui n'existe pas. Le retour arrive sous forme de litige.</p>
<p>DropShipper IA mesure la matière de la fiche avant d'appeler le modèle. Les accroches publicitaires des fournisseurs (« Trouvez des offres incroyables… ») sont écartées, et le modèle n'écrit que ce que la fiche permet d'écrire. Une fiche sans matière fait refuser la réécriture : l'annonce reste en brouillon, et le crédit est rendu.</p>`,
      },
      {
        h2: 'Un titre par canal, à la bonne longueur',
        html: `<p>Aucun titre unique ne convient partout. Leboncoin coupe à 50 caractères là où Amazon en accepte 200 et en attend au moins 60 pour le référencement. DropShipper IA choisit, pour chaque destination, le titre qui tient dans sa limite :</p>
<table><thead><tr><th>Destination</th><th>Longueur maximale du titre</th></tr></thead><tbody>
${TITRE_MAX.map(([d, n]) => `<tr><td>${d}</td><td>${n} caractères</td></tr>`).join('\n')}
</tbody></table>
<p>Le <a href="/outils/generateur-titre-annonce/">générateur de titre gratuit</a> applique les mêmes limites, sans compte.</p>`,
      },
      {
        h2: 'Une catégorie trouvée, puis apprise de vos corrections',
        html: `<p>La catégorie est trouvée sans appel au modèle pour l'immense majorité des annonces : le référentiel reconnaît le produit à ses mots. Quand vous corrigez une catégorie, la correction est retenue et sert aux imports suivants. Au moment de publier, la catégorie est traduite dans celle de la destination — la taxonomie Google pour le flux Shopping, la catégorie propre à chaque place de marché.</p>`,
      },
      {
        h2: 'Le contrôle de conformité, avant de publier',
        html: `<p>Chaque place de marché a ses exigences, et une annonce refusée après coup coûte plus qu'une annonce complétée avant. Le moteur de conformité dit, pour chaque destination, ce qui manque : Amazon demande au moins cinq arguments et cinq attributs ; La Redoute exige le code EAN et au moins quatre attributs ; Cdiscount attend trois arguments de vente ; TikTok Shop veut au moins trois photos. Vous voyez la liste avant d'envoyer, pas dans un e-mail de refus.</p>`,
      },
      {
        h2: 'Prix',
        html: `<p>La réécriture est comprise dans le prix de l'import : <strong>12 drops (0,12 €)</strong> par annonce, 8 en lot. Refaire la réécriture d'une annonce coûte <strong>10 drops (0,10 €)</strong>. 120 drops sont offerts à l'inscription, sans carte demandée.</p>`,
      },
    ],
    faq: [
      {
        q: 'Que réécrit l’IA dans une annonce ?',
        a: "Tout : trois titres (court, moyen, long), la description, cinq arguments de vente, huit attributs, douze mots-clés, le méta-titre, la méta-description et la catégorie, parmi 24 rayons et 224 sous-catégories.",
      },
      {
        q: 'L’IA peut-elle inventer des caractéristiques ?',
        a: "Non, c'est le garde-fou central. La matière de la fiche est mesurée avant l'appel au modèle ; une fiche sans matière fait refuser la réécriture, l'annonce reste en brouillon et le crédit est rendu.",
      },
      {
        q: 'Le titre est-il adapté à chaque place de marché ?',
        a: "Oui. Chaque destination reçoit le titre qui tient dans sa limite : 50 caractères pour Leboncoin, 70 pour Vinted, 80 pour eBay et Kaufland, 200 pour Amazon, 255 pour Shopify.",
      },
      {
        q: 'Combien coûte une annonce réécrite par l’IA ?',
        a: "12 drops, soit 0,12 €, import compris ; 8 drops en lot. Refaire la réécriture coûte 10 drops. Il n'y a pas d'abonnement.",
      },
      {
        q: 'Les annonces sont-elles écrites en français ?',
        a: "Oui, dans la langue du marché visé, quelle que soit la langue de la fiche du fournisseur. La réécriture est comprise dans le prix de l'import.",
      },
    ],
    outils: ['generateur-titre-annonce', 'calculateur-marge'],
  },

  'dropshop-ia': {
    nom: 'DropShop IA',
    h1: "DropShop IA : une boutique en ligne écrite par l'IA, pour 3,50 € une seule fois",
    title: 'DropShop IA : boutique en ligne créée par l’IA, 3,50 €',
    description:
      "Décrivez votre boutique, déposez votre logo : l'IA écrit un site unique et responsive, avec panier, commande et paiement Stripe. 3,50 € une fois, à vie.",
    enBref: `DropShop IA écrit une boutique en ligne complète à partir de votre description et de votre logo : design unique et responsive, catalogue, panier, commande, e-mails et paiement Stripe sur votre propre compte. 350 drops (3,50 €) payés une seule fois, hébergement et dix modifications compris, sans aucune mention DropShipper sur la boutique.`,
    sections: [
      {
        h2: 'Une boutique écrite, pas un thème choisi dans un catalogue',
        html: `<p>Les constructeurs de boutiques vous font choisir un thème, puis le personnaliser case par case. DropShop IA fait l'inverse : vous décrivez la boutique que vous voulez et déposez votre logo, et le modèle écrit la page entière — design, CSS, écrans — dans les couleurs de votre logo. Trois directions vous sont proposées ; vous en choisissez une, et la boutique est générée.</p>
<p>Avant que vous la voyiez, un vérificateur la parcourt comme un visiteur : accueil, catégorie, fiche produit, panier, commande. Ce qui manque est corrigé. Ensuite, vous la modifiez par simples demandes en français ; dix modifications sont comprises.</p>`,
      },
      {
        h2: 'Un panier qui ne peut pas casser',
        html: `<p>Le design est écrit par l'IA ; la logique de commerce, jamais. Catalogue, panier, commande, paiement et confirmation vivent dans un moteur commun à toutes les boutiques DropShop. Une modification de design ne peut donc pas casser le tunnel d'achat : un panier DropShop ne peut pas « ne plus marcher » parce qu'une couleur a changé.</p>
<p>Le paiement passe par Stripe et arrive directement sur votre compte Stripe. DropShipper IA ne touche pas à votre argent.</p>`,
      },
      {
        h2: 'Branchée sur votre catalogue dès le premier jour',
        html: `<ul>
<li>Le catalogue est vivant : les produits importés et réécrits dans DropShipper IA s'y rangent au moment de la diffusion.</li>
<li>Les avis clients relevés chez le fournisseur ou importés en CSV s'affichent avec leur origine.</li>
<li>Les codes EAN sont transmis, et les flux Google Shopping et Meta sont servis automatiquement.</li>
<li>Commandes, stocks, clients, statistiques et comptabilité restent dans DropShipper IA : pas de second back-office à tenir.</li>
</ul>`,
      },
      {
        h2: 'Combien de boutiques ? Autant que vous voulez',
        html: `<p>Un abonnement de boutique se paie par boutique et par mois. Une boutique DropShop se paie une fois : vous pouvez en ouvrir une par niche, par produit ou par pays, chacune avec son catalogue, ses rayons et son design. Chaque modification crée une version, et vous revenez à la version que vous préférez à tout moment.</p>
<p>Sans boutique écrite par l'IA, une vitrine à thèmes gratuite (50 thèmes) reste disponible pour présenter vos produits.</p>`,
      },
      {
        h2: 'Les extensions, comme les applications d’une boutique',
        html: `<p>Des extensions s'ajoutent en drops. Le <strong>Back Office</strong> indépendant — une administration propre à la boutique, avec identifiant et mot de passe, pour un associé ou un employé — est disponible pour 300 drops (3 €). D'autres sont annoncées et pas encore ouvertes : DropBank (accepter les drops comme moyen de paiement), DropSEO, DropReviews et DropMarket, la place de marché qui réunira les boutiques DropShop.</p>`,
      },
      {
        h2: 'Prix',
        html: `<table><thead><tr><th>Action</th><th>Prix</th></tr></thead><tbody>
<tr><td>Création de la boutique (design unique, responsive, panier, e-mails, Stripe, hébergement, 10 modifications)</td><td>350 drops — 3,50 €, une seule fois</td></tr>
<tr><td>Une modification au-delà des 10 comprises</td><td>10 drops — 0,10 €</td></tr>
<tr><td>Extension Back Office</td><td>300 drops — 3,00 €</td></tr>
</tbody></table>
<p>Si la création n'aboutit pas, les drops sont rendus. Pour comparer avec une boutique existante, le <a href="/outils/detecteur-theme-shopify/">détecteur de thème Shopify</a> dit sur quel thème tourne n'importe quelle boutique Shopify.</p>`,
      },
    ],
    faq: [
      {
        q: 'Combien coûte une boutique DropShop IA ?',
        a: "350 drops, soit 3,50 €, payés une seule fois : hébergement, trafic et dix modifications compris. Une modification supplémentaire coûte 10 drops (0,10 €). Il n'y a pas d'abonnement.",
      },
      {
        q: 'Le paiement des clients arrive-t-il sur mon compte ?',
        a: 'Oui. La boutique encaisse par Stripe, directement sur votre compte Stripe. DropShipper IA ne touche pas à votre argent.',
      },
      {
        q: 'La boutique porte-t-elle la marque DropShipper ?',
        a: "Non. Aucune mention DropShipper n'apparaît sur une boutique DropShop : elle est à votre nom, dans les couleurs de votre logo.",
      },
      {
        q: 'Peut-on modifier la boutique après sa création ?',
        a: "Oui, par simples demandes en français. Dix modifications sont comprises, puis 10 drops la demande. Chaque modification crée une version, et vous pouvez revenir à n'importe laquelle.",
      },
      {
        q: 'Peut-on créer plusieurs boutiques ?',
        a: "Oui, autant que vous voulez, chacune payée une fois. Une boutique par niche, par produit ou par pays, avec son catalogue et son design.",
      },
    ],
    outils: ['detecteur-theme-shopify', 'calculateur-marge'],
  },

  'visuels-ia': {
    nom: 'Visuels et publicités IA',
    h1: "Visuels et publicités IA : photos en situation et pubs à vos couleurs",
    title: 'Visuels et publicités IA : photos et pubs à vos couleurs',
    description:
      "Photos en situation à partir des photos du fournisseur, publicités avec accroche IA dans la charte de votre logo, prompts vidéo. Dès 0,18 € l'image.",
    enBref: `Les visuels IA de DropShipper IA transforment la photo du fournisseur en photo en situation (18 drops) et composent des publicités complètes — accroche écrite par l'IA, palette et typographie tirées de votre logo — pour 20 drops. Chaque jour, des prompts image et vidéo sont livrés au format de chaque réseau. Votre filigrane est posé à l'export.`,
    sections: [
      {
        h2: 'Des photos en situation, avec le vrai produit',
        html: `<p>La photo du fournisseur sur fond blanc vend mal sur un réseau social, et la même photo publiée par cinquante vendeurs ne distingue personne. L'atelier photo génère des mises en situation à partir des vraies photos : le produit reste celui que l'acheteur recevra, seul le décor change, dans les tons de votre marque. Une photo en situation coûte 18 drops (0,18 €).</p>`,
      },
      {
        h2: 'Une publicité composée dans votre charte',
        html: `<p>Un visuel qui ne ressemble pas à votre marque est un visuel que vous jetez. DropShipper IA lit les couleurs de votre logo et en tire la charte de chaque publicité : palette, mise en page, typographie. Le contraste du texte du bouton est mesuré, pas deviné, pour rester lisible sur mobile.</p>
<p>L'accroche est écrite par l'IA avec un angle imposé, différent à chaque demande : problème, bénéfice, preuve, urgence, identité, comparaison. Trois publicités du même produit ne sont donc pas trois fois la même image. Le visuel est composé au format exact du réseau visé. Une publicité complète, accroche et visuel, coûte 20 drops (0,20 €).</p>`,
      },
      {
        h2: 'Des prompts image et vidéo chaque jour',
        html: `<p>Les analyses marketing quotidiennes livrent, catégorie par catégorie, des prompts d'images et de vidéos prêts à coller dans le générateur de votre choix, au format de chaque réseau : 9:16 pour TikTok, 4:5 pour Instagram, 16:9 pour LinkedIn. Ils sont publiés avec les <a href="/analyses/">analyses de marché</a>.</p>`,
      },
      {
        h2: 'Filigrane et contrôle des photos',
        html: `<p>Votre filigrane — logo ou texte — est posé à l'export sur chaque photo, dans le coin que vous choisissez. Il protège vos visuels contre la reprise par d'autres vendeurs, sans toucher aux originaux.</p>
<p>Iris, l'agent de contrôle photo, vérifie les images importées quand personne ne les regarde : en mode automatique, ce contrôle est forcé. Il coûte 10 drops (0,10 €) par annonce.</p>`,
      },
      {
        h2: 'Mesurer ce que rapporte une publicité',
        html: `<p>Une publicité se juge à ce qu'elle rapporte, pas à ce qu'elle coûte. Avant de lancer un budget, calculez votre <a href="/outils/roas-equilibre/">ROAS d'équilibre</a> — le retour minimal pour ne pas perdre d'argent — puis suivez votre <a href="/outils/calculateur-roas/">ROAS</a> et votre <a href="/outils/calculateur-cpa/">coût par acquisition</a> avec les calculateurs gratuits.</p>
<p>DropShipper IA ne dépense jamais un euro chez une régie publicitaire à votre place : les campagnes créées depuis la plateforme le sont en pause, et ne démarrent que sur votre demande.</p>`,
      },
    ],
    faq: [
      {
        q: 'Combien coûte une photo en situation générée par l’IA ?',
        a: "18 drops, soit 0,18 €. Le produit reste celui de la photo du fournisseur ; seul le décor change, dans les tons de votre marque.",
      },
      {
        q: 'Combien coûte une publicité composée par l’IA ?',
        a: "20 drops, soit 0,20 € : l'accroche écrite par l'IA avec un angle imposé et le visuel composé dans la charte de votre logo, au format du réseau visé.",
      },
      {
        q: 'Les publicités reprennent-elles les couleurs de ma marque ?',
        a: "Oui. La palette, la mise en page et la typographie sont tirées des couleurs de votre logo, et le contraste du texte est mesuré pour rester lisible.",
      },
      {
        q: 'DropShipper IA lance-t-il des campagnes payantes à ma place ?',
        a: "Non. Les campagnes créées depuis la plateforme le sont en pause et ne démarrent que sur votre demande explicite. Votre budget publicitaire reste entre vos mains.",
      },
    ],
    outils: ['calculateur-roas', 'roas-equilibre', 'calculateur-cpa'],
  },

  'reseaux-sociaux': {
    nom: 'Réseaux sociaux',
    h1: 'Réseaux sociaux : publiez vos produits sur Facebook, Instagram, TikTok et Pinterest',
    title: 'Réseaux sociaux : publier ses produits depuis un seul outil',
    description:
      "Publiez vos produits sur Facebook, Instagram, TikTok et Pinterest depuis DropShipper IA, par les connexions officielles. Flux Instagram Shopping inclus.",
    enBref: `Le module Réseaux sociaux de DropShipper IA publie vos produits en organique sur Facebook, Instagram, TikTok et Pinterest, par la connexion officielle de chaque réseau : vos mots de passe ne nous sont jamais confiés. Instagram Shopping et la boutique Facebook lisent un flux catalogue tenu à jour. Les campagnes payantes sont créées en pause.`,
    sections: [
      {
        h2: 'Une connexion officielle par réseau',
        html: `<p>DropShipper IA se relie à chaque réseau par son autorisation officielle : Meta pour Facebook et Instagram, TikTok, Pinterest. Vous autorisez l'accès chez le réseau lui-même ; votre mot de passe n'est jamais demandé ni stocké, et vous pouvez retirer l'accès à tout moment depuis votre compte.</p>
<p>L'état affiché est l'état réel. Un réseau s'affiche « Relier » quand il est prêt à être raccordé, et « Connecté » seulement après un vrai appel réussi au réseau — jamais sur la seule foi d'un formulaire rempli.</p>`,
      },
      {
        h2: 'Publier un produit en organique',
        html: `<p>Depuis la fiche d'un produit, le visuel, l'accroche et le lien vers votre boutique partent d'un clic vers les comptes choisis. Chaque envoi porte une clé unique : un double clic ne publie pas deux fois. Les comptes sont validés contre votre profil, jamais contre celui d'un autre client.</p>
<p>Les visuels peuvent être ceux du fournisseur, des photos en situation ou des publicités composées par l'IA dans votre charte (voir <a href="/fonctions/visuels-ia/">Visuels et publicités IA</a>).</p>`,
      },
      {
        h2: 'Instagram Shopping et la boutique Facebook',
        html: `<p>Les réseaux sociaux sont aussi un canal de vente. Instagram Shopping et la boutique Facebook lisent un flux catalogue que DropShipper IA tient à jour plusieurs fois par jour, avec le GTIN de chaque produit : chaque annonce publiée sur votre site y remonte toute seule, sans export à refaire.</p>`,
      },
      {
        h2: 'Les régies publicitaires, sous votre contrôle',
        html: `<p>Les régies Meta Ads, TikTok Ads et Pinterest Ads se relient de la même façon. Une campagne préparée depuis DropShipper IA est créée <strong>en pause</strong> : elle dépense de l'argent, elle ne démarre donc que sur votre demande explicite. La plateforme ne dépense jamais un euro chez une régie à votre place.</p>
<p>Avant de lancer un budget, fixez votre seuil de rentabilité avec le <a href="/outils/roas-equilibre/">calculateur de ROAS d'équilibre</a>, puis suivez vos résultats avec les calculateurs de <a href="/outils/calculateur-roas/">ROAS</a> et de <a href="/outils/calculateur-cpa/">CPA</a>.</p>`,
      },
      {
        h2: 'Savoir ce qui se dit d’un produit',
        html: `<p>L'analyse réseaux d'un produit dit ce que les réseaux en disent, si le produit « tourne » sur TikTok ou Facebook, et quelles publicités concurrentes sont actives ; elle coûte 30 drops (0,30 €). Le studio d'analyses ouvre aussi la bibliothèque publicitaire de Meta et celle de TikTok, pré-remplies avec vos mots-clés et votre marché. Les analyses marketing quotidiennes livrent en plus des angles et des prompts par catégorie.</p>`,
      },
    ],
    faq: [
      {
        q: 'Sur quels réseaux sociaux peut-on publier ?',
        a: 'Facebook et Instagram (par Meta), TikTok et Pinterest, en organique, par la connexion officielle de chaque réseau.',
      },
      {
        q: 'Faut-il donner son mot de passe Facebook ou TikTok ?',
        a: "Non. Vous autorisez l'accès chez le réseau lui-même ; votre mot de passe n'est jamais demandé ni stocké, et vous pouvez retirer l'accès à tout moment.",
      },
      {
        q: 'DropShipper IA peut-il lancer des publicités payantes ?',
        a: "Il peut préparer des campagnes sur Meta Ads, TikTok Ads et Pinterest Ads, toujours créées en pause. Elles ne démarrent que sur votre demande explicite.",
      },
      {
        q: 'Mes produits apparaissent-ils dans Instagram Shopping ?',
        a: "Oui, par le flux catalogue que DropShipper IA tient à jour plusieurs fois par jour : chaque annonce publiée sur votre site y remonte, avec son GTIN.",
      },
    ],
    outils: ['calculateur-roas', 'calculateur-cpa', 'roas-equilibre'],
  },

  diffusion: {
    nom: 'Diffusion multicanal',
    h1: `Diffusion multicanal : publiez vos annonces sur ${NB_CANAUX} canaux de vente`,
    title: `Diffusion multicanal : ${NB_CANAUX} canaux de vente`,
    description: `Publiez vos annonces sur Shopify, eBay, Kaufland, 41 enseignes Mirakl, Vinted, Leboncoin et ${NB_CANAUX} canaux référencés, chacun avec sa voie de liaison.`,
    enBref: `La diffusion multicanal de DropShipper IA publie une annonce sur ${NB_CANAUX} canaux référencés : publication directe sur Shopify, WooCommerce, PrestaShop, eBay, Kaufland et 41 enseignes Mirakl ; flux produit pour les comparateurs et l'affiliation ; remplissage assisté par l'extension pour Vinted, Leboncoin et Facebook Marketplace, où vous cliquez « Publier ».`,
    sections: [
      {
        h2: `${NB_CANAUX} canaux, cinq familles`,
        html: `<table><thead><tr><th>Famille</th><th>Canaux référencés</th></tr></thead><tbody>
<tr><td>Places de marché et enseignes</td><td>${nb.marketplace}</td></tr>
<tr><td>Comparateurs de prix</td><td>${nb.comparateur}</td></tr>
<tr><td>Régies publicitaires</td><td>${nb.regie}</td></tr>
<tr><td>Plateformes d'affiliation</td><td>${nb.affiliation}</td></tr>
<tr><td>Outils du commerce en ligne</td><td>${nb.outil}</td></tr>
</tbody></table>
<p>Chaque canal a sa voie de liaison, dite honnêtement : publication directe, flux produit, fichier à déposer, ou remplissage assisté. L'annuaire complet est sur la page <a href="/vendre-sur-marketplaces/">Où vendre</a>.</p>`,
      },
      {
        h2: 'La publication directe, par API',
        html: `<p>Pour ces destinations, l'annonce part entière — photos, variantes, stock, catégorie — sans rien ressaisir :</p>
<ul>
<li><strong>Shopify</strong>, où DropShipper IA est une application installée dans votre back-office, qui publie photos, variantes, stock et catégorie Google.</li>
<li><strong>Vos boutiques</strong> WooCommerce, PrestaShop, Magento, Drupal Commerce, BigCommerce, Wix, Shopware, Ecwid et Squarespace.</li>
<li><strong>eBay</strong> et <strong>Kaufland</strong>.</li>
<li><strong>41 enseignes opérées sous Mirakl</strong> : E.Leclerc, Carrefour, Auchan, Fnac, La Redoute, Boulanger, Leroy Merlin, Galeries Lafayette, Cultura, Truffaut, El Corte Inglés, MediaMarkt, Worten…</li>
</ul>
<p>Six connecteurs supplémentaires sont écrits et attendent votre compte vendeur : Amazon, Cdiscount, TikTok Shop, Etsy, Spartoo et Miinto.</p>`,
      },
      {
        h2: 'Le flux produit, pour tout le reste',
        html: `<p>Les comparateurs de prix, les plateformes d'affiliation, les régies et la majorité des places de marché lisent un flux produit : une adresse que vous collez une fois dans votre espace marchand, et qui se met à jour seule. C'est ainsi que les gestionnaires de flux les servent tous. Google Shopping et le catalogue Meta lisent vos flux avec le GTIN.</p>`,
      },
      {
        h2: 'Vinted, Leboncoin et Facebook Marketplace : vous gardez la main',
        html: `<p>Ces plateformes n'ont pas d'API publique d'annonces. L'extension Chrome ouvre leur formulaire dans votre navigateur, connecté à votre compte, et le remplit : titre à la bonne longueur, description, prix, photos. Vous relisez, et c'est vous qui cliquez « Publier ». Vos identifiants ne passent jamais par DropShipper IA, et aucune technique de contournement des protections anti-robot n'est employée.</p>`,
      },
      {
        h2: 'Une annonce adaptée à chaque destination',
        html: `<p>La même fiche ne part pas telle quelle partout. Le titre est choisi à la longueur de chaque canal — 50 caractères pour Leboncoin, 80 pour eBay, 200 pour Amazon —, la catégorie est traduite dans celle de la destination, et le contrôle de conformité dit avant l'envoi ce qui manque (EAN, attributs, nombre de photos). La publication en lot envoie une sélection entière, avec la catégorie déjà calculée.</p>
<p>Un canal manque ? Il se demande en un clic depuis l'annuaire, et l'ordre des prochains branchements suit ces demandes.</p>`,
      },
    ],
    faq: [
      {
        q: 'Sur combien de plateformes peut-on publier ?',
        a: `${NB_CANAUX} canaux sont référencés : ${nb.marketplace} places de marché et enseignes, ${nb.comparateur} comparateurs de prix, ${nb.regie} régies, ${nb.affiliation} plateformes d'affiliation et ${nb.outil} outils. Chacun a sa voie de liaison : publication directe, flux produit ou remplissage assisté.`,
      },
      {
        q: 'Peut-on publier sur Vinted et Leboncoin ?',
        a: "Oui, par remplissage assisté : l'extension Chrome remplit le formulaire dans votre navigateur, connecté à votre compte, et c'est vous qui cliquez « Publier ».",
      },
      {
        q: 'Quelles places de marché françaises sont reliées ?',
        a: 'Les 41 enseignes opérées sous Mirakl, dont E.Leclerc, Carrefour, Auchan, Fnac, La Redoute, Boulanger, Leroy Merlin, Galeries Lafayette et Cultura, ainsi que Kaufland et eBay.',
      },
      {
        q: 'Le titre est-il raccourci pour chaque plateforme ?',
        a: 'Oui. Chaque destination reçoit le titre qui tient dans sa limite : 50 caractères pour Leboncoin, 70 pour Vinted, 80 pour eBay, 200 pour Amazon.',
      },
      {
        q: 'La diffusion est-elle payante ?',
        a: "Non. L'import et la réécriture se paient (12 drops l'annonce) ; la publication, les flux catalogue et l'annuaire des canaux sont gratuits.",
      },
    ],
    outils: ['generateur-titre-annonce', 'calculateur-marge'],
  },

  'analyses-de-marche': {
    nom: 'Analyses de marché',
    h1: 'Analyses de marché : les produits gagnants du jour, catégorie par catégorie',
    title: 'Analyses de marché et produits gagnants chaque jour',
    description:
      "Chaque jour, des agents IA analysent 24 catégories : rapport de marché, 20 produits à importer, angles marketing et prompts publicitaires. Lecture libre.",
    enBref: `Les analyses de marché de DropShipper IA sont rédigées chaque jour par des agents IA : pour chacune des 24 catégories, un rapport de marché avec ses vingt produits à importer et un rapport marketing avec ses angles et prompts publicitaires. Les comptes importent les produits en un clic ; les analyses sont publiées pour tous, sans prix d'achat.`,
    sections: [
      {
        h2: 'Deux rapports par catégorie, chaque jour',
        html: `<p>Vingt-quatre catégories, deux agents par catégorie : un agent rayon et un agent marketing. Chaque matin, ils lisent le web sur le thème du jour — sept thèmes tournent dans chaque catégorie pour que les rapports ne se répètent pas — et rédigent :</p>
<ul>
<li><strong>un rapport de marché</strong>, avec vingt produits à importer, leur adresse, leur prix, la marge visée et la raison du choix ;</li>
<li><strong>un rapport marketing</strong>, avec les angles qui marchent, les audiences visées et des prompts d'images et de vidéos au format de chaque réseau.</li>
</ul>`,
      },
      {
        h2: 'Une règle : rien d’inventé',
        html: `<p>Une adresse de produit inventée ou un prix « vraisemblable » est pire qu'un champ vide : il fait perdre du temps et de l'argent. Les rapports ne citent que ce qui a été trouvé ; ce qui ne l'a pas été est annoncé comme introuvable. Un contrôle automatique compare chaque rapport à un contrat : nombre de produits, adresses distinctes, prix, verdict.</p>`,
      },
      {
        h2: 'Ce que lit un compte, ce que lit le public',
        html: `<p>Les comptes DropShipper IA lisent tout — fournisseur, prix d'achat, prix de vente conseillé, marge — et importent un produit gagnant en un clic, à l'unité ou en lot. Les rapports se comparent dans le temps : une mémoire commerciale relève ce qui a bougé et lève des alertes.</p>
<p>Les mêmes analyses sont publiées pour tous dans la rubrique <a href="/analyses/">Analyses de marché</a>, sans les adresses fournisseur ni les prix d'achat : seul le prix de vente conseillé y figure. Une édition du jour les rassemble, façon journal.</p>`,
      },
      {
        h2: 'Le studio d’analyses, sur un produit précis',
        html: `<p>Avant de publier un produit, le studio d'analyses répond aux questions qui décident :</p>
<ul>
<li>qui vend déjà le produit sur les places de marché, à quel prix, avec quelles notes ;</li>
<li>qui investit en publicité sur la niche, depuis quand, avec quel angle ;</li>
<li>ce que vendent les boutiques comparables et dans quelle gamme de prix ;</li>
<li>ce que demande chaque fournisseur relié pour la même référence (gratuit, sans appel au modèle).</li>
</ul>
<p>L'analyse se lance sur de simples mots-clés, sans rien avoir importé : découvrir qu'une niche est saturée coûte une analyse, pas un catalogue. Une analyse de marché par produit coûte 30 drops (0,30 €) ; une question à un chef de rayon, avec recherche web, 25 drops.</p>`,
      },
      {
        h2: 'L’AUTO-MODE, gratuit',
        html: `<p>En AUTO-MODE, un chef de rayon produit pour vous, gratuitement, une analyse de marché sourcée et ses produits gagnants à intervalle régulier. L'<a href="/fonctions/auto-shipper/">AUTO-SHIPPER</a> peut ensuite importer et publier ces produits sans intervention, dans la limite que vous fixez.</p>`,
      },
    ],
    faq: [
      {
        q: 'Combien de catégories sont analysées ?',
        a: 'Vingt-quatre catégories, chacune avec un agent rayon (rapport de marché et vingt produits) et un agent marketing (angles, audiences, prompts publicitaires). Sept thèmes tournent dans chaque catégorie.',
      },
      {
        q: 'Les analyses de marché sont-elles gratuites ?',
        a: "La lecture publique est libre, dans la rubrique Analyses de marché, sans prix d'achat ni adresse fournisseur. L'AUTO-MODE d'un chef de rayon est gratuit. Une analyse ciblée sur un produit coûte 30 drops (0,30 €).",
      },
      {
        q: 'Peut-on importer un produit gagnant directement ?',
        a: 'Oui, depuis un compte DropShipper IA : un clic importe le produit, à l’unité ou en lot, et l’IA en écrit l’annonce.',
      },
      {
        q: 'Les prix cités sont-ils vérifiés ?',
        a: "Les rapports ne citent que des prix et des adresses effectivement trouvés ; un champ introuvable reste vide plutôt que d'être comblé par un chiffre vraisemblable.",
      },
    ],
    outils: ['calculateur-marge', 'roas-equilibre'],
  },

  'agents-ia': {
    nom: 'Agents IA',
    h1: 'Agents IA : une équipe d’agents pour le SAV, la publicité, les photos et les produits',
    title: 'Agents IA pour e-commerce : SAV, pub, photos, produits',
    description:
      "Chefs de rayon, contrôle photo, SAV, comptabilité, juridique, publicité : des agents IA avec de vrais outils, chaque chiffre sourcé, un coût plafonné.",
    enBref: `Les agents IA de DropShipper IA couvrent chaque métier de la vente en ligne : chefs de rayon qui cherchent des produits chez les fournisseurs reliés, contrôle des photos, publicité, SAV, comptabilité, droit. Ce ne sont pas des chatbots : ils ont de vrais outils, citent leurs sources et travaillent sous un plafond quotidien annoncé.`,
    sections: [
      {
        h2: 'Un agent sans outils est un chatbot',
        html: `<p>Un assistant qui répond sans rien pouvoir vérifier se voit tout de suite : il parle bien et ne sait rien. Les agents de DropShipper IA ont des outils. Les chefs de rayon cherchent des produits chez les fournisseurs reliés et sondent les prix réellement pratiqués ; l'agent photo contrôle les images importées ; l'agent publicité écrit l'accroche et choisit la charte. Quand un fournisseur n'est pas relié, l'agent rend le geste à faire au lieu d'inventer une réponse.</p>`,
      },
      {
        h2: 'L’équipe',
        html: `<ul>
<li><strong>Les chefs de rayon</strong>, à embaucher rayon par rayon : ils cherchent des produits, sondent les prix et déposent des opportunités. En AUTO-MODE, ils produisent gratuitement une analyse de marché et ses produits gagnants.</li>
<li><strong>Camille</strong>, secrétaire : répond aux e-mails et aux messages des places de marché, et oriente vers le bon collègue.</li>
<li><strong>Marc</strong> (SAV), <strong>Béatrice</strong> (facturation et plateforme), <strong>Gérard</strong> (comptable), <strong>Yann</strong> (livraisons), <strong>Maître Doré</strong> (droit des affaires appliqué à la vente en ligne).</li>
<li><strong>Laurence</strong> (marketing) et <strong>Léa</strong> (graphiste), pour les campagnes et les visuels.</li>
<li><strong>Iris</strong>, qui contrôle les photos importées sans œil humain.</li>
</ul>`,
      },
      {
        h2: 'Des réponses bornées par le code, pas par une consigne',
        html: `<p>Un agent de comptoir — SAV, comptable, juriste — répond aux tickets avec la limite de ce qu'il peut accorder écrite dans le code, pas dans une consigne qu'un client habile pourrait contourner. Un refus de fournisseur est transmis tel quel. Chaque chiffre cité a sa source.</p>`,
      },
      {
        h2: 'Ce que coûte un agent',
        html: `<table><thead><tr><th>Action</th><th>Prix</th></tr></thead><tbody>
<tr><td>Question à un agent de comptoir</td><td>5 drops — 0,05 €</td></tr>
<tr><td>Question à un chef de rayon, avec recherche web</td><td>25 drops — 0,25 €</td></tr>
<tr><td>Avis d'un chef de rayon sur un produit (fournisseurs, réseaux, places de marché)</td><td>40 drops — 0,40 €</td></tr>
<tr><td>Contrôle photo par l'IA, par annonce</td><td>10 drops — 0,10 €</td></tr>
<tr><td>AUTO-MODE d'un chef de rayon</td><td>gratuit</td></tr>
</tbody></table>
<p>Une question de fait coûte moins qu'une question d'arbitrage, et chaque agent travaille sous un plafond quotidien annoncé d'avance : ce que vous payez est borné.</p>`,
      },
      {
        h2: 'Les agents et le mode automatique',
        html: `<p>Les agents sont aussi ceux qui travaillent quand vous ne regardez pas. L'<a href="/fonctions/auto-shipper/">AUTO-SHIPPER</a> s'appuie sur les analyses des chefs de rayon pour choisir les produits, et force le contrôle photo d'Iris puisque personne ne relit. Les <a href="/fonctions/analyses-de-marche/">analyses de marché</a> quotidiennes sont écrites par quarante-huit agents, un agent rayon et un agent marketing par catégorie.</p>`,
      },
    ],
    faq: [
      {
        q: 'Que font les agents IA de DropShipper IA ?',
        a: "Ils cherchent des produits, analysent les marchés, contrôlent les photos, écrivent les publicités, répondent au SAV, à la comptabilité et aux questions juridiques. Ils ont de vrais outils et citent leurs sources.",
      },
      {
        q: 'Combien coûte une question à un agent ?',
        a: '5 drops (0,05 €) pour un agent de comptoir, 25 drops (0,25 €) pour un chef de rayon avec recherche web. L’AUTO-MODE d’un chef de rayon est gratuit.',
      },
      {
        q: 'Un agent peut-il accorder un remboursement tout seul ?',
        a: "Seulement dans la limite écrite dans le code de la plateforme, pas dans une consigne. Au-delà, il transmet ; un refus de fournisseur est rapporté tel quel.",
      },
      {
        q: 'Les agents peuvent-ils inventer une information ?',
        a: "Non : chaque chiffre a une source, et un fournisseur non relié fait rendre le geste à faire plutôt qu'une réponse inventée.",
      },
    ],
    outils: ['calculateur-marge', 'calculateur-cpa'],
  },

  'auto-shipper': {
    nom: 'AUTO-SHIPPER IA',
    h1: 'AUTO-SHIPPER IA : le dropshipping en mode automatique, une tournée par jour',
    title: 'AUTO-SHIPPER IA : dropshipping automatique, 1 € par jour',
    description:
      "Une tournée par jour : l'IA choisit les produits, les importe, écrit les annonces et les publie. 1 € la journée + 0,18 € par produit, plafond réglable.",
    enBref: `AUTO-SHIPPER IA fait tourner le dropshipping en mode automatique : une fois par jour, il choisit des produits dans les analyses du matin, les importe, fait écrire les annonces, les publie sur vos canaux et contrôle les photos. 100 drops (1 €) la journée, 18 drops par produit publié, rendue si rien n'est importé. Vous fixez le plafond.`,
    sections: [
      {
        h2: 'Une tournée quotidienne, pas un bouton magique',
        html: `<p>L'AUTO-SHIPPER suit chaque jour le même parcours, à heure fixe :</p>
<ol>
<li>il lit les produits gagnants du matin dans les catégories que vous avez choisies ;</li>
<li>il écarte ceux que seul un navigateur peut relever, qui restent dans votre liste ;</li>
<li>il importe les autres et fait réécrire leurs annonces par l'IA ;</li>
<li>il passe les photos au contrôle de l'agent Iris, forcé puisque personne ne les regarde ;</li>
<li>il publie sur les destinations réglées, et les agents tiennent le back-office.</li>
</ol>`,
      },
      {
        h2: 'Combien ça coûte, et pourquoi c’est borné',
        html: `<ul>
<li>La journée : <strong>100 drops (1 €)</strong>, pour une tournée par 24 heures.</li>
<li>Chaque produit importé et publié : <strong>18 drops (0,18 €)</strong>.</li>
<li>Si rien n'a été importé, la journée est rendue.</li>
</ul>
<p>Vous fixez le plafond de produits par jour. Cinquante est le rythme conseillé ; quatre cent quatre-vingts, le maximum autorisé (24 catégories × 20 produits). À cinquante produits, une journée coûte 100 + 50 × 18 = 1 000 drops, soit 10 €.</p>`,
      },
      {
        h2: 'Ce qui ne part jamais sans vous',
        html: `<p>L'AUTO-SHIPPER publie par les voies directes (vos boutiques, Shopify, eBay, Kaufland, les enseignes Mirakl…). Sur Vinted, Leboncoin et Facebook Marketplace, qui n'ont pas d'API publique, l'extension remplit le formulaire et c'est vous qui validez. Les campagnes publicitaires, elles, sont toujours créées en pause : elles dépensent de l'argent, elles attendent votre accord.</p>
<p>Vous pouvez laisser la plateforme travailler seule et ne revenir que pour valider les publications sensibles.</p>`,
      },
      {
        h2: 'AUTO-MODE et AUTO-SHIPPER : deux étages',
        html: `<p>Les deux se ressemblent par le nom et se complètent. L'<strong>AUTO-MODE</strong> d'un chef de rayon est gratuit : il produit l'analyse de marché et la liste des produits gagnants de sa catégorie. L'<strong>AUTO-SHIPPER</strong> est l'étage suivant, payant : il prend ces produits, les importe, fait écrire les annonces et les publie. Vous pouvez n'utiliser que le premier et importer vous-même les produits qui vous plaisent, ou laisser le second faire la tournée chaque jour dans les catégories que vous avez choisies (voir <a href="/fonctions/analyses-de-marche/">Analyses de marché</a>).</p>`,
      },
      {
        h2: 'Avant d’automatiser : vérifier que la marge tient',
        html: `<p>Automatiser un produit à perte, c'est perdre plus vite. Avant de fixer un plafond, vérifiez la marge d'un produit type avec le <a href="/outils/calculateur-marge/">calculateur de marge</a> et votre seuil de rentabilité publicitaire avec le <a href="/outils/roas-equilibre/">calculateur de ROAS d'équilibre</a>. Les deux sont gratuits et sans compte.</p>`,
      },
    ],
    faq: [
      {
        q: 'Combien coûte l’AUTO-SHIPPER ?',
        a: "100 drops (1 €) la journée, plus 18 drops (0,18 €) par produit importé et publié. Si rien n'a été importé, la journée est rendue.",
      },
      {
        q: 'Combien de produits l’AUTO-SHIPPER publie-t-il par jour ?',
        a: 'Le nombre que vous fixez : cinquante par jour est le rythme conseillé, quatre cent quatre-vingts le maximum autorisé (24 catégories × 20 produits).',
      },
      {
        q: 'L’AUTO-SHIPPER publie-t-il sur Vinted ou Leboncoin à ma place ?',
        a: "Non. Sur ces plateformes sans API publique, l'extension remplit le formulaire et c'est vous qui validez la publication.",
      },
      {
        q: 'Les photos sont-elles contrôlées en mode automatique ?',
        a: "Oui, le contrôle photo de l'agent Iris est forcé en mode automatique, puisque personne ne relit les annonces avant leur publication.",
      },
    ],
    outils: ['calculateur-marge', 'roas-equilibre'],
  },

  'les-drops': {
    nom: 'Les drops',
    h1: 'Les drops : le dropshipping sans abonnement, payé à l’acte',
    title: 'Les drops : dropshipping sans abonnement, 0,01 € le drop',
    description:
      "Sans abonnement : chaque action a son prix en drops (1 drop = 0,01 €). Une annonce IA : 0,12 €. Une boutique : 3,50 € une fois. 120 drops offerts.",
    enBref: `Les drops sont la monnaie de DropShipper IA : 1 drop = 0,01 €, sans abonnement ni engagement. Chaque action a un prix affiché avant de cliquer — 12 drops pour une annonce importée et réécrite, 350 drops une seule fois pour une boutique. 120 drops sont offerts à l'inscription, et un crédit est rendu quand une action échoue.`,
    sections: [
      {
        h2: 'Pourquoi pas d’abonnement',
        html: `<p>Un abonnement se paie avant la première vente, que vous ayez importé dix produits ou aucun. Les drops renversent la logique : vous payez ce que vous faites, au moment où vous le faites, au prix affiché avant de cliquer. Un mois sans activité ne coûte rien.</p>`,
      },
      {
        h2: 'Les prix les plus courants',
        html: `<table><thead><tr><th>Action</th><th>Drops</th><th>En euros</th></tr></thead><tbody>
<tr><td>Importer une annonce, réécriture IA comprise</td><td>12</td><td>0,12 €</td></tr>
<tr><td>Importer en lot, par annonce</td><td>8</td><td>0,08 €</td></tr>
<tr><td>Refaire la réécriture d'une annonce</td><td>10</td><td>0,10 €</td></tr>
<tr><td>Photo en situation</td><td>18</td><td>0,18 €</td></tr>
<tr><td>Publicité (accroche + visuel)</td><td>20</td><td>0,20 €</td></tr>
<tr><td>Analyse de marché, par produit</td><td>30</td><td>0,30 €</td></tr>
<tr><td>Boutique DropShop IA, une seule fois</td><td>350</td><td>3,50 €</td></tr>
<tr><td>AUTO-SHIPPER, la journée</td><td>100</td><td>1,00 €</td></tr>
</tbody></table>
<p>La grille complète, action par action, est sur la page <a href="/tarifs/">Tarifs</a>.</p>`,
      },
      {
        h2: 'Les recharges : le drop moins cher en volume',
        html: `<p>Les recharges vont de 5 € (500 drops) à 150 € (20 000 drops). Le prix d'une action en drops ne change jamais ; c'est le drop qui coûte moins cher quand on en achète beaucoup : −10 % à 45 €, −20 % à 80 €, −25 % à 150 €.</p>`,
      },
      {
        h2: 'Exemple : un premier mois de lancement',
        html: `<p>Un vendeur qui démarre importe 50 produits en lot (50 × 8 = 400 drops), crée une boutique DropShop IA (350 drops, une seule fois) et compose 20 publicités (20 × 20 = 400 drops). Total : 1 150 drops, soit 11,50 €. Les 120 drops offerts en couvrent une partie ; une recharge de 20 € (2 000 drops) suffit pour le reste du mois, et ce qui n'est pas dépensé reste sur le compte. À titre de comparaison, la plupart des outils de dropshipping se paient au mois, avant la première vente.</p>`,
      },
      {
        h2: 'Un crédit rendu quand l’action échoue',
        html: `<p>Vous ne payez pas un échec. Une réécriture que le modèle n'a pas pu faire, une boutique dont la création n'aboutit pas, une journée d'AUTO-SHIPPER sans aucun import : les drops sont rendus.</p>`,
      },
      {
        h2: 'Ce qui ne coûte rien',
        html: `<ul>
<li>L'inscription, et 120 drops de bienvenue — de quoi importer dix annonces.</li>
<li>La vitrine à thèmes, les flux catalogue Google Shopping et Meta.</li>
<li>L'annuaire des ${NB_CANAUX} canaux de vente et des ${NB_FOURN} fournisseurs.</li>
<li>L'AUTO-MODE des chefs de rayon : analyses de marché et produits gagnants.</li>
<li>L'extension Chrome, et les six <a href="/outils/">outils gratuits</a> de ce site.</li>
</ul>`,
      },
    ],
    faq: [
      {
        q: 'Combien vaut un drop ?',
        a: "1 drop vaut 0,01 €. Avec les grosses recharges, il revient moins cher : jusqu'à 0,0075 € (−25 %) avec la recharge de 150 €.",
      },
      {
        q: 'Y a-t-il un abonnement ?',
        a: "Non. DropShipper IA se paie à l'acte, en drops, sans engagement : un mois sans activité ne coûte rien.",
      },
      {
        q: 'Combien de drops sont offerts à l’inscription ?',
        a: "120 drops, de quoi importer et faire réécrire dix annonces. Aucune carte n'est demandée à l'inscription.",
      },
      {
        q: 'Que se passe-t-il si une action échoue ?',
        a: "Les drops sont rendus : une réécriture que le modèle n'a pas faite, une boutique qui n'aboutit pas, une journée d'AUTO-SHIPPER sans import.",
      },
    ],
    outils: ['calculateur-marge', 'calculateur-roas'],
  },
}

module.exports = { CONTENU, CHROME_STORE }
