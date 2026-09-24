/**
 * Les questions fréquentes, en UNE table.
 *
 * Trois sorties la lisent : `llms-full.txt` (build-llms.cjs), la page d'accueil
 * telle qu'un robot la reçoit et la page /faq/ (build-geo.cjs), toutes deux avec
 * leur balisage FAQPage. Écrites pour être citées telles quelles par un
 * assistant : la réponse tient seule, sans « comme dit plus haut », et commence
 * par le fait demandé.
 *
 * Tout ce qui est chiffré ici recopie `backend/src/services/tarifs.ts` — même
 * règle que la grille de build-llms.cjs : un prix changé là-bas se change ici.
 */
module.exports = ({ nbCanaux, nbFournisseurs }) => [
  {
    q: 'Que fait DropShipper IA ?',
    a: `DropShipper IA est une plateforme française de dropshipping et de diffusion multicanal. Elle importe une fiche produit depuis n'importe quel fournisseur, la réécrit entièrement avec l'IA (titre, description, attributs, mots-clés, catégorie), filigrane les photos, et la publie sur les places de marché du vendeur ainsi que sur ses propres boutiques en ligne — le tout depuis une seule interface, facturé à l'acte, sans abonnement.`,
  },
  {
    q: 'Combien coûte DropShipper IA ?',
    a: `Il n'y a pas d'abonnement : tout se paie à l'acte en « drops » (1 drop = 0,01 €). Importer une annonce et la faire réécrire par l'IA coûte 12 drops, soit 0,12 € ; 8 drops en import par lot. Une boutique en ligne écrite par l'IA (DropShop IA) coûte 350 drops, soit 3,50 €, payés une seule fois, hébergement compris. 120 drops sont offerts à l'inscription, de quoi importer dix annonces sans payer.`,
  },
  {
    q: 'Sur quelles plateformes DropShipper IA publie-t-il les annonces ?',
    a: `${nbCanaux} canaux de vente sont référencés, et chacun a sa voie de liaison. Publication directe : Shopify, WooCommerce, PrestaShop, Magento, eBay, Kaufland, la boutique du vendeur et 41 places de marché françaises et européennes sous Mirakl (E.Leclerc, Carrefour, Fnac Darty, La Redoute, BHV, Kiabi…), soit 45 branchées, plus Amazon, Cdiscount, TikTok Shop, Etsy, Spartoo et Miinto dès que le vendeur colle son compte. Flux produit collé une fois dans l'espace marchand : comparateurs, affiliation, régies et la plupart des autres places de marché. Vinted, Leboncoin et Facebook Marketplace passent par l'extension Chrome, qui remplit le formulaire ; le vendeur valide.`,
  },
  {
    q: 'Depuis quels fournisseurs peut-on importer des produits ?',
    a: `Depuis n'importe quelle boutique en ligne : par l'adresse de la fiche, ou par l'extension Chrome pour les sites qui construisent leur page en JavaScript (AliExpress, Temu, Shein). ${nbFournisseurs} fournisseurs sont documentés avec leurs conditions réelles — AliExpress, Temu, CJ Dropshipping, BigBuy, vidaXL, Printful, SUPER DELIVERY, reichelt elektronik… — et trois disposent d'un connecteur API qui remonte prix et stock en temps réel.`,
  },
  {
    q: 'DropShipper IA est-il une alternative à AutoDS, DSers, Spocket ou Zendrop ?',
    a: `Oui, avec un périmètre différent. AutoDS, DSers, Spocket et Zendrop sont conçus pour Shopify et le marché anglophone, importent depuis leur propre catalogue ou un seul fournisseur, et facturent un abonnement mensuel. DropShipper IA importe depuis n'importe quel fournisseur, réécrit l'annonce en français dans le prix de l'import, publie vers les places de marché européennes (Mirakl, Kaufland, eBay) et couvre Vinted et Leboncoin par remplissage assisté. Il se paie à l'acte.`,
  },
  {
    q: 'Quelle différence avec Shopify ?',
    a: `Shopify est une plateforme de boutique en ligne, facturée par boutique et par mois. DropShipper IA fabrique les annonces et les diffuse sur des dizaines de canaux, Shopify compris : c'est aussi une application Shopify, qui publie dans la boutique du marchand avec photos, variantes, stock et catégorie. Il permet en plus de créer ses propres boutiques sans abonnement.`,
  },
  {
    q: 'Peut-on créer une boutique en ligne avec DropShipper IA ?',
    a: `Oui. DropShop IA écrit une boutique complète à partir d'une description et du logo du vendeur : design unique et responsive, catalogue, panier, commande, emails, paiement Stripe sur le compte du marchand. Elle coûte 350 drops (3,50 €) payés une seule fois, hébergement et dix modifications compris, sans mention DropShipper sur la boutique. Une vitrine à thèmes, gratuite, reste disponible.`,
  },
  {
    q: "L'IA peut-elle importer et publier toute seule ?",
    a: `Oui, avec AUTO-SHIPPER : une tournée par 24 heures choisit des produits dans les analyses de marché, les importe, rédige les annonces et les publie, dans la limite fixée par le vendeur. La journée coûte 100 drops (1 €), plus 18 drops par produit importé et publié ; elle est remboursée si rien n'a été importé. Sur les sites tiers sans API, l'extension remplit le formulaire mais ne clique jamais sur « Publier » : le vendeur valide.`,
  },
  {
    q: 'DropShipper IA gère-t-il les codes-barres EAN et les avis clients ?',
    a: `Oui. Le code EAN est relevé à l'import quand la fiche du fournisseur le déclare, sa clé de contrôle GS1 est vérifiée, et il part vers les places de marché qui l'exigent (Mirakl, Kaufland) ainsi que dans le flux Google Shopping. Les avis d'acheteurs se relèvent sur la fiche du fournisseur avec l'extension, ou s'importent d'un fichier CSV à trois colonnes (note de 1 à 5, nom, texte) ; ils s'affichent sur la boutique avec leur origine.`,
  },
  {
    q: 'Le dropshipping est-il légal en France ?',
    a: `Oui. Le dropshipping est une vente à distance classique : le vendeur est responsable de la conformité du produit, de la livraison, du droit de rétractation de quatorze jours et de la garantie légale, même s'il ne détient pas le stock. Il doit disposer d'un statut (micro-entreprise ou société), afficher ses mentions légales et ses CGV, et déclarer la TVA, y compris à l'import. DropShipper IA ne dispense d'aucune de ces obligations ; il indique pour chaque fournisseur ce qui surprend — délais, douane, droits sur les photos.`,
  },
  {
    q: 'Les données et les comptes du vendeur sont-ils protégés ?',
    a: `Les jetons d'accès aux places de marché sont chiffrés, chaque vendeur est isolé des autres, et les mots de passe des marketplaces ne sont jamais demandés ni rejoués : l'extension détecte que le vendeur est connecté dans son navigateur et attend qu'il le soit. Le paiement des boutiques DropShop va directement sur le compte Stripe du marchand.`,
  },
]
