import { e } from './marketPages.js'
import { EDITEUR } from './marketLegal.js'
import { identiteDe, type IdentiteFacture } from './marketFactures.js'

/**
 * Les pages légales d'une vitrine de boutique (`/b/<adresse>`) : mentions
 * légales, conditions de vente, livraison et retours, contact.
 *
 * Constaté en ligne le 21/11/2026 : le pied de page des boutiques écrites par
 * l'IA renvoyait « Suivi de commande », « Garantie & SAV », « Retours »,
 * « Nous contacter » vers `#/boutique`, et aucune boutique n'avait de mentions
 * légales ni de CGV — obligatoires pour vendre en France.
 *
 * Écrites ici, une fois, et servies à toutes les vitrines : le moteur
 * (`dropshop/infos.js`) les affiche dans le cadre de la boutique. Rien
 * d'inventé : l'identité vient du vendeur (`User.factureIdentite`, saisie par
 * lui), les délais et garanties du Code de la consommation. Une identité
 * absente est dite telle quelle, jamais remplacée par une vraisemblable.
 */

export interface InfosVitrine {
  boutique: string
  vendeur: Pick<IdentiteFacture, 'raisonSociale' | 'adresse' | 'siret' | 'regime' | 'tva' | 'mentions'> | null
  paiement: 'marchand' | 'plateforme' | 'indisponible'
  pages: Record<string, { titre: string; html: string }>
}

const prixTexte = (n: number) => n.toFixed(2).replace('.', ',') + ' €'

export function infosVitrine(args: {
  nom: string
  factureIdentite: unknown
  paiement: InfosVitrine['paiement']
  fraisPort: number
  portOffertDes: number
}): InfosVitrine {
  const id = identiteDe(args.factureIdentite)
  const nom = args.nom
  const vendeurNom = id ? id.raisonSociale : nom

  const identite = id
    ? `<ul>
<li><b>Vendeur :</b> ${e(id.raisonSociale)}</li>
<li><b>Adresse :</b> ${e(id.adresse)}</li>
<li><b>SIRET :</b> ${e(id.siret)}</li>
<li><b>TVA :</b> ${id.regime === 'assujetti' && id.tva ? e(id.tva) : 'TVA non applicable, art. 293 B du CGI'}</li>
${id.mentions ? `<li>${e(id.mentions)}</li>` : ''}
</ul>`
    : `<p>Le vendeur n'a pas encore renseigné son identité légale (nom ou raison sociale, adresse, SIRET). Pour toute question, écrivez-lui depuis la <a href="#/infos/contact">page Contact</a>.</p>`

  const encaissement =
    args.paiement === 'marchand'
      ? `Le paiement se fait par carte sur la page sécurisée de Stripe, directement sur le compte du vendeur.`
      : args.paiement === 'plateforme'
        ? `Le paiement se fait par carte sur la page sécurisée de Stripe. Il est encaissé par DropShipper IA pour le compte du vendeur, à qui la vente est reversée.`
        : `Le paiement en ligne de cette boutique est momentanément indisponible : aucune commande ne peut être passée tant qu'il n'est pas rétabli.`

  const port =
    args.fraisPort > 0
      ? `Frais de livraison : ${prixTexte(args.fraisPort)}${args.portOffertDes > 0 ? `, offerts dès ${prixTexte(args.portOffertDes)} d'achat` : ''}. Ils sont affichés dans le panier avant le paiement.`
      : `La livraison est offerte.`

  const pages: InfosVitrine['pages'] = {
    'mentions-legales': {
      titre: 'Mentions légales',
      html: `
<h2>La boutique</h2>
<p><b>${e(nom)}</b> est une boutique en ligne indépendante. Le vendeur est seul responsable des produits proposés, de leurs descriptions et de l'exécution des commandes.</p>
${identite}
<h2>Plateforme technique</h2>
<p>Boutique propulsée par DropShipper IA (www.drop-shipper.fr), éditée par ${e(EDITEUR.nom)}, ${e(EDITEUR.adresse)} — ${e(EDITEUR.email)}.</p>
<h2>Hébergement</h2>
<p>Railway Corporation, États-Unis — railway.com</p>
<h2>Données personnelles</h2>
<p>Les informations saisies lors d'une commande (nom, adresse, email, téléphone) servent uniquement à l'exécuter et à vous contacter à son sujet. Vous pouvez demander leur consultation, leur rectification ou leur effacement depuis la <a href="#/infos/contact">page Contact</a>. Les données de carte bancaire sont saisies chez Stripe et ne transitent jamais par la boutique. Le panier est gardé dans votre navigateur ; la boutique ne pose pas de cookie publicitaire.</p>`,
    },
    cgv: {
      titre: 'Conditions générales de vente',
      html: `
<h2>1. Vendeur</h2>
<p>Les produits de la boutique ${e(nom)} sont vendus par ${e(vendeurNom)} (voir les <a href="#/infos/mentions-legales">mentions légales</a>). Le contrat de vente est conclu entre vous et ce vendeur.</p>
<h2>2. Prix</h2>
<p>Les prix sont indiqués en euros, toutes taxes comprises le cas échéant. ${e(port)} Le prix payé est celui affiché au moment de la commande.</p>
<h2>3. Commande</h2>
<p>Vous ajoutez les produits au panier, indiquez vos coordonnées puis validez le paiement. La commande est ferme une fois le paiement accepté.</p>
<h2>4. Paiement</h2>
<p>${e(encaissement)}</p>
<h2>5. Livraison</h2>
<p>Voir <a href="#/infos/livraison-retours">Livraison et retours</a>. Sauf délai différent indiqué sur la fiche, le vendeur livre au plus tard 30 jours après la commande (article L216-1 du Code de la consommation) ; passé ce délai, vous pouvez annuler la commande et être remboursé.</p>
<h2>6. Droit de rétractation</h2>
<p>Vous disposez de 14 jours à compter de la réception pour vous rétracter, sans avoir à vous justifier (articles L221-18 et suivants du Code de la consommation). Marche à suivre : <a href="#/infos/livraison-retours">Livraison et retours</a>.</p>
<h2>7. Garanties légales</h2>
<p>Les produits bénéficient de la garantie légale de conformité (articles L217-3 et suivants du Code de la consommation) : pendant deux ans à compter de la livraison, vous pouvez obtenir la réparation ou le remplacement d'un produit non conforme, ou à défaut son remboursement, sans frais. Ils bénéficient aussi de la garantie des vices cachés (articles 1641 et suivants du Code civil). Ces garanties s'exercent auprès du vendeur, depuis la <a href="#/infos/contact">page Contact</a>.</p>
<h2>8. Service client</h2>
<p>Par la <a href="#/infos/contact">page Contact</a> : votre message est transmis au vendeur, qui vous répond par email.</p>
<h2>9. Droit applicable</h2>
<p>Ces conditions sont soumises au droit français. En cas de litige, adressez d'abord une réclamation écrite au vendeur ; à défaut d'accord, vous pouvez recourir gratuitement à un médiateur de la consommation ou saisir les juridictions compétentes.</p>`,
    },
    'livraison-retours': {
      titre: 'Livraison et retours',
      html: `
<h2>Livraison</h2>
<p>${e(port)}</p>
<p>Le délai dépend du produit et de son lieu d'expédition. Sauf délai différent indiqué sur la fiche, le vendeur livre au plus tard 30 jours après la commande. Le risque de perte ou d'endommagement reste à la charge du vendeur jusqu'à la remise du colis.</p>
<h2>Suivre une commande</h2>
<p>Écrivez au vendeur depuis la <a href="#/infos/contact">page Contact</a> en indiquant votre nom et l'email utilisé pour la commande : il vous répond avec l'état de votre colis.</p>
<h2>14 jours pour changer d'avis</h2>
<p>Vous pouvez vous rétracter dans les 14 jours suivant la réception d'un produit, sans motif. Signalez-le depuis la <a href="#/infos/contact">page Contact</a> ; le vendeur vous indique l'adresse de retour. Renvoyez le produit dans les 14 jours suivant votre demande, dans son état d'origine.</p>
<p>Les frais de renvoi sont à votre charge, sauf si le produit est défectueux ou non conforme. Vous êtes remboursé de la totalité des sommes versées, livraison initiale comprise, au plus tard 14 jours après votre demande, sur le moyen de paiement utilisé ; le remboursement peut être différé jusqu'à la récupération du produit ou la preuve de son expédition.</p>
<p>Le droit de rétractation ne s'applique pas notamment aux biens personnalisés, aux biens susceptibles de se détériorer rapidement et aux biens descellés qui ne peuvent être renvoyés pour des raisons d'hygiène (article L221-28 du Code de la consommation).</p>
<h2>Produit abîmé, non conforme ou non reçu</h2>
<p>Signalez-le depuis la <a href="#/infos/contact">page Contact</a> : la garantie légale de conformité s'applique, sans frais pour vous.</p>`,
    },
    contact: {
      titre: 'Contact',
      html: `<p>Une question sur un produit, une commande, un retour ? Écrivez au vendeur : il vous répond par email.</p>`,
    },
  }

  return {
    boutique: nom,
    vendeur: id ? { raisonSociale: id.raisonSociale, adresse: id.adresse, siret: id.siret, regime: id.regime, tva: id.tva, mentions: id.mentions } : null,
    paiement: args.paiement,
    pages,
  }
}
