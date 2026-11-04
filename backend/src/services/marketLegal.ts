import { e } from './marketPages.js'
import { PAYS_LIVRES } from './marketStripe.js'
import { COMMISSION } from './market.js'

/**
 * Les pages d'information et les textes légaux de DropShop Market.
 *
 * Règle du projet : rien d'inventé. L'identité vient de max (mémoire du projet,
 * même table que frontend/src/data/entreprise.json, que Railway ne voit pas :
 * le Market vit sous backend/). Un champ à null n'est affiché nulle part.
 * Délais et garanties : ceux du Code de la consommation et du code, pas des
 * promesses.
 */
export const EDITEUR = {
  nom: 'Maxime Martinel',
  /** Nom commercial du service. */
  enseigne: 'DropShop Market',
  /** SIRET, forme juridique : seul max peut les donner (demandés le 27/10/2026). */
  siret: null as string | null,
  formeJuridique: null as string | null,
  tva: null as string | null,
  adresse: '2 rue Julien Imbert, 34500 Béziers, France',
  telephone: '07 46 47 69 68',
  email: 'contact@drop-shipper.fr',
  horaires: 'du lundi au vendredi, de 8 h à 20 h',
}

const NOMS_PAYS: Record<string, string> = {
  FR: 'France', BE: 'Belgique', LU: 'Luxembourg', CH: 'Suisse', MC: 'Monaco', DE: 'Allemagne',
  ES: 'Espagne', IT: 'Italie', NL: 'Pays-Bas', PT: 'Portugal', AT: 'Autriche', IE: 'Irlande',
}

export const paysLivres = () => PAYS_LIVRES.map((c) => NOMS_PAYS[c] ?? c).join(', ')

function lignesEditeur(): string {
  const l: Array<[string, string | null]> = [
    ['Éditeur', EDITEUR.nom],
    ['Forme juridique', EDITEUR.formeJuridique],
    ['SIRET', EDITEUR.siret],
    ['TVA intracommunautaire', EDITEUR.tva],
    ['Adresse', EDITEUR.adresse],
    ['Téléphone', EDITEUR.telephone],
    ['Email', EDITEUR.email],
    ['Directeur de la publication', EDITEUR.nom],
  ]
  return `<ul>${l.filter(([, v]) => v).map(([k, v]) => `<li><b>${e(k)} :</b> ${e(v)}</li>`).join('')}</ul>`
}

export interface PageInfo {
  titre: string
  description: string
  corps: (base: string) => string
}

const pct = `${Math.round(COMMISSION * 100)} %`

export const PAGES_INFO: Record<string, PageInfo> = {
  'mentions-legales': {
    titre: 'Mentions légales',
    description: 'Éditeur, directeur de la publication et hébergeur de DropShop Market.',
    corps: (base) => `
<h2>Éditeur du site</h2>
<p>DropShop Market (drop-shop.cloud) est une place de marché éditée par DropShipper IA :</p>
${lignesEditeur()}
<h2>Hébergement</h2>
<ul><li>Railway Corporation, États-Unis — railway.com</li></ul>
<h2>Propriété intellectuelle</h2>
<p>Les fiches produits, photos et descriptions sont publiées par les vendeurs, sous leur responsabilité. La marque, le logo et la présentation du site sont la propriété de l'éditeur.</p>
<h2>Signaler un contenu</h2>
<p>Pour signaler un produit ou un contenu illicite, écrivez-nous depuis la <a href="${base}/contact">page de contact</a> (sujet « Signaler un produit ») ou à ${e(EDITEUR.email)} ; nous le retirons s'il enfreint la loi ou nos conditions.</p>`,
  },

  cgv: {
    titre: 'Conditions générales de vente',
    description: "Conditions générales d'utilisation et de vente de DropShop Market : commande, prix, paiement, livraison, rétractation, garanties.",
    corps: (base) => `
<h2>1. Qui vend quoi</h2>
<p>DropShop Market est une <b>place de marché</b> : les produits sont vendus par des boutiques indépendantes (les « vendeurs »), inscrites sur DropShipper. Le nom du vendeur figure sur chaque fiche (« Vendu par … »). Le contrat de vente est conclu entre vous et le vendeur ; DropShop Market, édité par ${e(EDITEUR.nom)} (voir les <a href="${base}/mentions-legales">mentions légales</a>), met en relation, encaisse le paiement pour le compte des vendeurs et assure le service client.</p>
<h2>2. Classement des produits</h2>
<p>Les listes sont classées par date de publication, des plus récentes aux plus anciennes, ou selon le tri que vous choisissez (prix, note). La rubrique « En vedette » de l'accueil met en avant les articles Prime, puis les mieux notés. Aucun vendeur ne paie pour être mieux placé.</p>
<h2>3. Rémunération de la plateforme</h2>
<p>Chaque vendeur reverse à DropShop Market une commission de ${pct} du prix de vente. Elle est incluse dans le prix affiché : vous ne payez rien de plus.</p>
<h2>4. Prix</h2>
<p>Les prix sont en euros, toutes taxes comprises le cas échéant, <b>livraison comprise</b>. Le prix payé est celui affiché au moment de la commande.</p>
<h2>5. Commande</h2>
<p>Vous ajoutez des produits au panier, vérifiez le récapitulatif puis validez le paiement : la commande est ferme une fois le paiement accepté. Un email de confirmation vous est envoyé avec votre numéro de commande. Un panier peut réunir les produits de plusieurs vendeurs : chacun expédie ses articles séparément. Vous pouvez commander avec un compte client ou sans compte.</p>
<h2>6. Paiement</h2>
<p>Le paiement se fait sur la page sécurisée de notre prestataire Stripe (carte bancaire et moyens proposés sur cette page). Vos données de carte ne transitent jamais par nos serveurs. Le montant est débité à la validation de la commande.</p>
<h2>7. Livraison</h2>
<p>Voir la page <a href="${base}/livraison">Livraison</a> : pays desservis, délais, suivi.</p>
<h2>8. Droit de rétractation (14 jours)</h2>
<p>Vous disposez de 14 jours à compter de la réception d'un produit pour vous rétracter, sans avoir à vous justifier. La marche à suivre, les frais de retour et le délai de remboursement sont détaillés sur la page <a href="${base}/retours">Retours et remboursements</a>.</p>
<h2>9. Garanties légales</h2>
<p>Les produits bénéficient de la <b>garantie légale de conformité</b> (articles L217-3 et suivants du Code de la consommation) : pendant deux ans à compter de la livraison, vous pouvez obtenir la réparation ou le remplacement d'un produit non conforme, ou à défaut son remboursement, sans frais. Ils bénéficient aussi de la <b>garantie des vices cachés</b> (articles 1641 et suivants du Code civil). Ces garanties s'exercent auprès du vendeur ; écrivez-nous depuis la <a href="${base}/contact">page de contact</a>, nous transmettons et suivons votre demande.</p>
<h2>10. Service client et réclamations</h2>
<p>Par la <a href="${base}/contact">page de contact</a>, par email à ${e(EDITEUR.email)} ou par téléphone au ${e(EDITEUR.telephone)} (${e(EDITEUR.horaires)}).</p>
<h2>11. Comptes clients</h2>
<p>Le compte est gratuit. Vous êtes responsable de la confidentialité de votre mot de passe. Vous pouvez supprimer votre compte à tout moment depuis votre espace client.</p>
<h2>12. Données personnelles</h2>
<p>Voir la page <a href="${base}/confidentialite">Confidentialité et cookies</a>.</p>
<h2>13. Droit applicable</h2>
<p>Ces conditions sont soumises au droit français. En cas de litige, adressez d'abord une réclamation écrite au service client ; à défaut d'accord, le litige peut être porté devant les juridictions compétentes.</p>`,
  },

  livraison: {
    titre: 'Livraison',
    description: 'Pays livrés, délais et suivi des colis sur DropShop Market. Livraison comprise dans le prix.',
    corps: (base) => `
<h2>Livraison comprise</h2>
<p>Le prix affiché comprend la livraison : aucun frais de port n'est ajouté au paiement.</p>
<h2>Pays livrés</h2>
<p>${e(paysLivres())}.</p>
<h2>Délais</h2>
<ul>
<li><b>Articles Prime (⚡)</b> : en stock en France, le vendeur s'engage à les expédier le jour même, pour une livraison en 24 h en France métropolitaine.</li>
<li><b>Autres articles</b> : chaque vendeur expédie depuis son propre entrepôt ou celui de son fournisseur ; le délai dépend donc du produit. Sauf délai différent indiqué sur la fiche, le vendeur doit livrer au plus tard <b>30 jours</b> après la commande (article L216-1 du Code de la consommation). Passé ce délai, vous pouvez annuler la commande et être remboursé.</li>
</ul>
<h2>Plusieurs vendeurs, plusieurs colis</h2>
<p>Si votre panier réunit plusieurs vendeurs, chacun expédie ses articles séparément : vous recevez un email avec le numéro de suivi à chaque expédition.</p>
<h2>Suivre un colis</h2>
<p>Depuis <a href="${base}/compte/commandes">vos commandes</a>, ou sans compte avec votre numéro de commande et votre email sur <a href="${base}/suivi">Suivre une commande</a>.</p>
<h2>Colis abîmé ou non reçu</h2>
<p>Signalez-le depuis la <a href="${base}/contact">page de contact</a> en indiquant votre numéro de commande : nous le transmettons au vendeur et suivons la demande jusqu'à sa résolution. Le risque de perte ou d'endommagement reste à la charge du vendeur jusqu'à la remise du colis.</p>`,
  },

  retours: {
    titre: 'Retours et remboursements',
    description: 'Droit de rétractation de 14 jours, retour et remboursement sur DropShop Market.',
    corps: (base) => `
<h2>14 jours pour changer d'avis</h2>
<p>Vous pouvez vous rétracter dans les <b>14 jours</b> suivant la réception d'un produit, sans motif (articles L221-18 et suivants du Code de la consommation).</p>
<h2>Comment faire</h2>
<ol>
<li>Ouvrez votre commande (dans <a href="${base}/compte/commandes">vos commandes</a>, ou sur <a href="${base}/suivi">Suivre une commande</a> sans compte) et cliquez « Demander un retour » sur l'article concerné. Vous pouvez aussi nous écrire depuis la <a href="${base}/contact">page de contact</a>, ou envoyer le formulaire ci-dessous.</li>
<li>Le vendeur vous communique l'adresse de retour par email.</li>
<li>Renvoyez le produit dans les 14 jours suivant votre demande, dans son état d'origine.</li>
</ol>
<h2>Frais de retour</h2>
<p>Les frais de renvoi sont à votre charge, sauf si le vendeur les prend en charge ou si le produit est défectueux ou non conforme (dans ce cas, garantie légale de conformité : aucun frais).</p>
<h2>Remboursement</h2>
<p>Vous êtes remboursé de la totalité des sommes versées, livraison comprise, au plus tard <b>14 jours</b> après la réception de votre demande, sur le moyen de paiement utilisé. Le remboursement peut être différé jusqu'à la récupération du produit ou la preuve de son expédition.</p>
<h2>Exceptions</h2>
<p>Le droit de rétractation ne s'applique pas notamment aux biens confectionnés selon vos spécifications ou nettement personnalisés, aux biens susceptibles de se détériorer rapidement, et aux biens descellés après la livraison qui ne peuvent être renvoyés pour des raisons d'hygiène (article L221-28 du Code de la consommation).</p>
<h2>Formulaire de rétractation</h2>
<p class="muted">À compléter et envoyer depuis la <a href="${base}/contact">page de contact</a> ou par email à ${e(EDITEUR.email)} :</p>
<div class="bloc" style="margin-top:8px"><p>À l'attention de DropShop Market, ${e(EDITEUR.adresse)}, ${e(EDITEUR.email)} :<br>
Je vous notifie par la présente ma rétractation du contrat portant sur la vente du bien ci-dessous :<br>
— Numéro de commande :<br>— Commandé le / reçu le :<br>— Nom :<br>— Adresse :<br>— Date :</p></div>`,
  },

  confidentialite: {
    titre: 'Confidentialité et cookies',
    description: 'Données personnelles et cookies sur DropShop Market.',
    corps: (base) => `
<h2>Responsable du traitement</h2>
<p>${e(EDITEUR.nom)}, ${e(EDITEUR.adresse)} — ${e(EDITEUR.email)}.</p>
<h2>Ce que nous collectons, et pourquoi</h2>
<ul>
<li><b>Compte client</b> : nom, email, mot de passe (stocké chiffré, jamais en clair), adresses de livraison — pour gérer votre compte et vos commandes.</li>
<li><b>Commandes</b> : produits, montants, nom, adresse de livraison, téléphone, email — pour exécuter la vente. Ces informations sont transmises au vendeur concerné, qui en a besoin pour expédier.</li>
<li><b>Paiement</b> : traité par Stripe ; nous ne voyons ni ne stockons vos numéros de carte.</li>
<li><b>Messages au service client</b> : pour vous répondre.</li>
</ul>
<h2>Durées de conservation</h2>
<p>Le compte est conservé tant que vous l'utilisez ; vous pouvez le supprimer à tout moment depuis votre espace client. Les données de commande sont conservées le temps exigé par les obligations comptables et les garanties légales.</p>
<h2>Vos droits</h2>
<p>Accès, rectification, effacement, opposition, portabilité : écrivez à ${e(EDITEUR.email)} ou depuis la <a href="${base}/contact">page de contact</a>. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
<h2>Cookies</h2>
<p>Le site n'utilise que des cookies <b>nécessaires à son fonctionnement</b>, exemptés de consentement : <code>dsm_panier</code> (le contenu de votre panier, 60 jours) et <code>dsm_session</code> (votre connexion, 30 jours). Aucun cookie publicitaire ni de mesure d'audience.</p>`,
  },

  aide: {
    titre: 'Aide et questions fréquentes',
    description: "Aide DropShop Market : commande, paiement, livraison, retours, compte client.",
    corps: (base) => `
<h2>Où est ma commande ?</h2>
<p>Dans <a href="${base}/compte/commandes">vos commandes</a>, ou sans compte sur <a href="${base}/suivi">Suivre une commande</a> (numéro de commande « DSM-… » et email). Vous recevez un email avec le numéro de suivi à chaque expédition.</p>
<h2>Quels sont les délais de livraison ?</h2>
<p>Articles Prime : 24 h en France métropolitaine. Autres articles : selon le vendeur, 30 jours au plus sauf délai indiqué sur la fiche. <a href="${base}/livraison">Tout sur la livraison</a>.</p>
<h2>Comment retourner un article ?</h2>
<p>Vous avez 14 jours après réception. <a href="${base}/retours">Retours et remboursements</a>.</p>
<h2>Le paiement est-il sécurisé ?</h2>
<p>Oui : il se fait sur la page de paiement de Stripe ; vos données de carte ne passent pas par nos serveurs.</p>
<h2>Dois-je créer un compte ?</h2>
<p>Non, vous pouvez commander sans compte. Le compte vous permet de retrouver vos commandes, vos adresses et votre liste d'envies, et de laisser un avis vérifié après achat.</p>
<h2>J'ai oublié mon mot de passe</h2>
<p><a href="${base}/compte/oubli">Réinitialisez-le ici</a> : un lien vous est envoyé par email.</p>
<h2>Qui me vend le produit ?</h2>
<p>Le vendeur indiqué sur la fiche (« Vendu par … »). DropShop Market encaisse le paiement et assure le service client. <a href="${base}/cgv">Conditions générales de vente</a>.</p>
<h2>Une autre question ?</h2>
<p><a class="btn" href="${base}/contact">Contacter le service client</a></p>`,
  },
}
