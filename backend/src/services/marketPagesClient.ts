import type { MarketAdresse, MarketClient } from '@prisma/client'
import { e, gabarit, grille, prixTexte } from './marketPages.js'
import type { Annonce, Rayon } from './market.js'
import type { LigneResolue } from './marketPanier.js'
import { PAGES_INFO, EDITEUR, paysLivres } from './marketLegal.js'
import { identify } from './tracking.js'

/**
 * Les pages du client de DropShop Market : panier, compte, commandes, suivi,
 * retours, liste d'envies, contact et pages d'information. Rendues côté
 * serveur comme le reste du Market ; aucune n'est indexée sauf les pages
 * d'information (aide, CGV, livraison…), utiles à Google.
 */

interface Commun {
  base: string
  rayons?: Rayon[]
}

function page(c: Commun, titre: string, corps: string, opts: { chemin?: string | null; description?: string } = {}) {
  return gabarit({
    base: c.base,
    titre: `${titre} | DropShop Market`,
    description: opts.description ?? titre,
    chemin: opts.chemin ?? null,
    indexable: opts.chemin != null,
    corps,
    rayons: c.rayons,
  })
}

const alerte = (erreur?: string | null, succes?: string | null) =>
  `${erreur ? `<div class="erreur" role="alert">${e(erreur)}</div>` : ''}${succes ? `<div class="succes" role="status">${e(succes)}</div>` : ''}`

const dateFr = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

// ——— Panier et commande ———

export function pagePanier(c: Commun & { lignes: LigneResolue[]; epuisees: LigneResolue[]; disparues: number; total: number; suggestions: Annonce[]; message?: string | null }) {
  const { base } = c
  const ligne = (l: LigneResolue, epuisee = false) => `<div class="ligne-panier">
<a href="${base}${l.offre.chemin}">${l.offre.image ? `<img src="${e(l.offre.image)}" alt="" loading="lazy">` : '<span></span>'}</a>
<div><a href="${base}${l.offre.chemin}"><b>${e(l.offre.titreProduit)}</b></a>
${l.offre.libelleVariante ? `<div class="muted">${e(l.offre.libelleVariante)}</div>` : ''}
<div class="muted" style="font-size:13px">Vendu par ${e(l.annonce.vendeur.nom)}${l.annonce.prime ? ' · <span class="prime">⚡ PRIME</span>' : ''}</div>
${epuisee ? '<div class="erreur" style="margin:6px 0 0;padding:4px 10px;display:inline-block">Épuisé : ne sera pas commandé</div>' : `<div class="muted" style="font-size:13px;color:#0b6b46">En stock</div>`}
<form class="q" method="post" action="${base}/panier/modifier" style="margin-top:6px">
<input type="hidden" name="offre" value="${e(l.offre.id)}">
${epuisee ? '' : `<label class="muted" style="font-size:13px">Qté <select name="quantite" onchange="this.form.submit()">${Array.from({ length: 10 }, (_, i) => `<option${i + 1 === l.quantite ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label><noscript><button class="lien-bouton" type="submit">Mettre à jour</button></noscript>`}
<button class="lien-bouton" type="submit" name="quantite" value="0">Supprimer</button>
</form></div>
<div class="px"><b>${e(prixTexte(l.total, l.offre.devise))}</b></div></div>`

  const nb = c.lignes.reduce((t, l) => t + l.quantite, 0)
  const corps = c.lignes.length || c.epuisees.length
    ? `<h1>Votre panier</h1>${alerte(null, c.message)}${c.disparues ? `<div class="erreur">${c.disparues} article${c.disparues > 1 ? 's ont' : ' a'} été retiré${c.disparues > 1 ? 's' : ''} du Market et ne figure${c.disparues > 1 ? 'nt' : ''} plus dans votre panier.</div>` : ''}
<div class="deux"><div class="bloc" style="margin-top:0">${c.lignes.map((l) => ligne(l)).join('')}${c.epuisees.map((l) => ligne(l, true)).join('')}</div>
<aside class="bloc" style="margin-top:0"><p style="font-size:18px">Sous-total (${nb} article${nb > 1 ? 's' : ''}) : <b>${e(prixTexte(c.total))}</b></p>
<p class="muted">Livraison comprise. Paiement sécurisé par Stripe.</p>
${c.lignes.length ? `<p><a class="btn" style="width:100%" href="${base}/commande">Passer la commande</a></p>` : ''}
<p class="muted" style="font-size:13px">Vous pourrez vous rétracter 14 jours après réception (<a href="${base}/retours">retours</a>).</p></aside></div>`
    : `<h1>Votre panier est vide</h1>${alerte(null, c.message)}<div class="vide">Parcourez les nouveautés et ajoutez des produits à votre panier.<br><br><a class="btn" href="${base}/">Voir les nouveautés</a></div>`
  return page(c, 'Panier', `${corps}${c.suggestions.length ? `<h2>Vous aimerez aussi</h2>${grille(base, c.suggestions)}` : ''}`)
}

export function pageCommande(c: Commun & { lignes: LigneResolue[]; total: number; client: MarketClient | null; adresse: MarketAdresse | null; erreur?: string | null }) {
  const { base } = c
  const parVendeur = new Map<string, LigneResolue[]>()
  for (const l of c.lignes) parVendeur.set(l.annonce.vendeur.nom, [...(parVendeur.get(l.annonce.vendeur.nom) ?? []), l])
  const corps = `<h1>Passer la commande</h1>${alerte(c.erreur)}
<div class="deux"><div>
<div class="bloc" style="margin-top:0"><h2 style="margin-top:0">1. Vos coordonnées</h2>
${c.client ? `<p>Connecté en tant que <b>${e(c.client.nom)}</b> (${e(c.client.email)}). La commande sera dans <a href="${base}/compte/commandes">vos commandes</a>.</p>` : `<p>Vous commandez <b>sans compte</b> : vous suivrez la commande avec son numéro et votre email. <a href="${base}/compte/connexion?retour=${encodeURIComponent('/commande')}">Se connecter</a> ou <a href="${base}/compte/inscription?retour=${encodeURIComponent('/commande')}">créer un compte</a> pour la retrouver dans votre espace.</p>`}</div>
<div class="bloc"><h2 style="margin-top:0">2. Adresse de livraison</h2>
${c.adresse ? `<p>Adresse proposée sur la page de paiement :<br><b>${e(c.adresse.nom)}</b><br>${e(c.adresse.ligne1)}${c.adresse.ligne2 ? `, ${e(c.adresse.ligne2)}` : ''}<br>${e(c.adresse.codePostal)} ${e(c.adresse.ville)} (${e(c.adresse.pays)})</p><p class="muted"><a href="${base}/compte/adresses">Gérer mes adresses</a> · vous pourrez aussi la modifier au paiement.</p>` : `<p>Vous la saisirez sur la page de paiement sécurisée. Pays livrés : ${e(paysLivres())}.</p>`}</div>
<div class="bloc"><h2 style="margin-top:0">3. Vérifiez vos articles</h2>
${[...parVendeur.entries()]
  .map(
    ([vendeur, lignes]) => `<p class="muted" style="margin:10px 0 0">Expédié par <b>${e(vendeur)}</b></p>${lignes
      .map((l) => `<div class="ligne-panier" style="grid-template-columns:64px 1fr auto">${l.offre.image ? `<img src="${e(l.offre.image)}" alt="" style="width:64px;height:64px">` : '<span></span>'}<div>${l.quantite} × ${e(l.offre.titreProduit)}${l.offre.libelleVariante ? `<div class="muted">${e(l.offre.libelleVariante)}</div>` : ''}</div><b>${e(prixTexte(l.total, l.offre.devise))}</b></div>`)
      .join('')}`,
  )
  .join('')}
<p><a href="${base}/panier">Modifier le panier</a></p></div></div>
<aside class="bloc" style="margin-top:0"><form method="post" action="${base}/commande">
<p>Articles : ${e(prixTexte(c.total))}<br>Livraison : comprise<br><span style="font-size:20px">Total : <b>${e(prixTexte(c.total))}</b></span></p>
<button class="btn" style="width:100%" type="submit">Payer ${e(prixTexte(c.total))}</button>
<p class="muted" style="font-size:12px;margin-top:10px">En validant, vous acceptez les <a href="${base}/cgv">conditions générales de vente</a> et reconnaissez que la commande vous oblige à payer. Vous serez redirigé vers la page de paiement sécurisée de Stripe.</p>
</form></aside></div>`
  return page(c, 'Passer la commande', corps)
}

// ——— Compte : connexion, inscription, mot de passe ———

const champRetour = (retour?: string | null) => (retour ? `<input type="hidden" name="retour" value="${e(retour)}">` : '')

export function pageConnexion(c: Commun & { erreur?: string | null; succes?: string | null; email?: string; retour?: string | null }) {
  const { base } = c
  return page(
    c,
    'Se connecter',
    `<div class="bloc" style="max-width:480px;margin:20px auto"><h1>Se connecter</h1>${alerte(c.erreur, c.succes)}
<form class="formulaire" method="post" action="${base}/compte/connexion">${champRetour(c.retour)}
<label>Email<input type="email" name="email" required autocomplete="email" value="${e(c.email ?? '')}"></label>
<label>Mot de passe<input type="password" name="motDePasse" required autocomplete="current-password"></label>
<button class="btn" type="submit">Se connecter</button></form>
<p><a href="${base}/compte/oubli">Mot de passe oublié ?</a></p>
<hr style="border:0;border-top:1px solid var(--trait);margin:18px 0">
<p>Nouveau sur DropShop Market ?</p><p><a class="btn-second" href="${base}/compte/inscription${c.retour ? `?retour=${encodeURIComponent(c.retour)}` : ''}">Créer votre compte</a></p></div>`,
  )
}

export function pageInscription(c: Commun & { erreur?: string | null; nom?: string; email?: string; retour?: string | null }) {
  const { base } = c
  return page(
    c,
    'Créer un compte',
    `<div class="bloc" style="max-width:480px;margin:20px auto"><h1>Créer votre compte</h1>${alerte(c.erreur)}
<form class="formulaire" method="post" action="${base}/compte/inscription">${champRetour(c.retour)}
<label>Votre nom<input name="nom" required maxlength="80" autocomplete="name" value="${e(c.nom ?? '')}"></label>
<label>Email<input type="email" name="email" required autocomplete="email" value="${e(c.email ?? '')}"></label>
<label>Mot de passe (8 caractères au moins)<input type="password" name="motDePasse" required minlength="8" autocomplete="new-password"></label>
<button class="btn" type="submit">Créer mon compte</button></form>
<p class="muted" style="font-size:13px">Un email de confirmation vous est envoyé. En créant un compte, vous acceptez les <a href="${base}/cgv">conditions générales</a> et la <a href="${base}/confidentialite">politique de confidentialité</a>.</p>
<p>Déjà client ? <a href="${base}/compte/connexion${c.retour ? `?retour=${encodeURIComponent(c.retour)}` : ''}">Se connecter</a></p></div>`,
  )
}

export function pageOubli(c: Commun & { envoye?: boolean; erreur?: string | null }) {
  const { base } = c
  return page(
    c,
    'Mot de passe oublié',
    `<div class="bloc" style="max-width:480px;margin:20px auto"><h1>Mot de passe oublié</h1>${alerte(c.erreur, c.envoye ? "Si un compte existe avec cette adresse, un email avec un lien de réinitialisation vient de lui être envoyé (valable une heure). Pensez à regarder dans les indésirables." : null)}
<form class="formulaire" method="post" action="${base}/compte/oubli"><label>Email<input type="email" name="email" required autocomplete="email"></label>
<button class="btn" type="submit">Recevoir le lien</button></form>
<p><a href="${base}/compte/connexion">Retour à la connexion</a></p></div>`,
  )
}

export function pageReinitialiser(c: Commun & { jeton: string; erreur?: string | null }) {
  const { base } = c
  return page(
    c,
    'Nouveau mot de passe',
    `<div class="bloc" style="max-width:480px;margin:20px auto"><h1>Choisissez un nouveau mot de passe</h1>${alerte(c.erreur)}
<form class="formulaire" method="post" action="${base}/compte/reinitialiser"><input type="hidden" name="jeton" value="${e(c.jeton)}">
<label>Nouveau mot de passe (8 caractères au moins)<input type="password" name="motDePasse" required minlength="8" autocomplete="new-password"></label>
<button class="btn" type="submit">Enregistrer</button></form></div>`,
  )
}

// ——— Espace client ———

type Onglet = 'accueil' | 'commandes' | 'adresses' | 'envies' | 'securite'

function menuCompte(base: string, on: Onglet) {
  const l: Array<[Onglet, string, string]> = [
    ['accueil', '/compte', 'Mon compte'],
    ['commandes', '/compte/commandes', 'Mes commandes'],
    ['adresses', '/compte/adresses', 'Mes adresses'],
    ['envies', '/compte/envies', "Liste d'envies"],
    ['securite', '/compte/securite', 'Connexion et sécurité'],
  ]
  return `<nav class="menu-compte">${l.map(([k, h, t]) => `<a class="${k === on ? 'on' : ''}" href="${base}${h}">${t}</a>`).join('')}<form method="post" action="${base}/compte/deconnexion" style="display:inline"><button class="lien-bouton" type="submit" style="padding:7px 6px">Se déconnecter</button></form></nav>`
}

function bandeauConfirmation(base: string, client: MarketClient) {
  if (client.emailConfirmeAt) return ''
  return `<div class="erreur">Votre adresse email n'est pas encore confirmée. Cliquez sur le lien reçu par email. <form method="post" action="${base}/compte/renvoyer" style="display:inline"><button class="lien-bouton" type="submit">Renvoyer l'email</button></form></div>`
}

export function pageCompte(c: Commun & { client: MarketClient; nbCommandes: number; nbEnvies: number; nbAdresses: number; succes?: string | null }) {
  const { base, client } = c
  const tuile = (h: string, t: string, d: string) => `<a class="bloc" style="margin:0;display:block" href="${base}${h}"><b>${t}</b><p class="muted" style="margin:4px 0 0">${d}</p></a>`
  return page(
    c,
    'Mon compte',
    `<h1>Bonjour ${e(client.nom)}</h1>${menuCompte(base, 'accueil')}${alerte(null, c.succes)}${bandeauConfirmation(base, client)}
<div class="etapes">
${tuile('/compte/commandes', 'Mes commandes', `${c.nbCommandes} commande${c.nbCommandes > 1 ? 's' : ''} · suivre, retourner, laisser un avis`)}
${tuile('/compte/adresses', 'Mes adresses', `${c.nbAdresses} adresse${c.nbAdresses > 1 ? 's' : ''} de livraison`)}
${tuile('/compte/envies', "Liste d'envies", `${c.nbEnvies} produit${c.nbEnvies > 1 ? 's' : ''} gardé${c.nbEnvies > 1 ? 's' : ''}`)}
${tuile('/compte/securite', 'Connexion et sécurité', 'Mot de passe, suppression du compte')}
${tuile('/contact', 'Service client', 'Une question, un problème : écrivez-nous')}
</div>`,
  )
}

export interface LigneVue {
  id: string
  titre: string
  variante: string | null
  quantite: number
  montant: number
  devise: string
  statut: string
  paye: boolean
  suivi: string | null
  transporteur: string | null
  image: string | null
  chemin: string | null
  vendeur: string
  retour: string | null
  avisLaisse: boolean
  peutRetour: boolean
  peutAvis: boolean
}

export interface CommandeVue {
  numero: string
  date: Date
  lignes: LigneVue[]
  total: number
  devise: string
  adresse: string
}

export function statutLisible(statut: string, paye: boolean): string {
  if (!paye) return 'Paiement non abouti'
  return { NEW: 'Payée · en préparation', ORDERED_FROM_SUPPLIER: 'En préparation', SHIPPED: 'Expédiée', DELIVERED: 'Livrée', REFUNDED: 'Remboursée' }[statut] ?? statut
}

const lienSuivi = (numero: string, transporteur: string | null) => identify(numero, transporteur).url

export function pageCommandes(c: Commun & { client: MarketClient; commandes: CommandeVue[] }) {
  const { base } = c
  const corps = c.commandes.length
    ? c.commandes
        .map(
          (o) => `<div class="bloc"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><span class="muted">Commandée le ${e(dateFr(o.date))} · Total <b>${e(prixTexte(o.total, o.devise))}</b></span><span class="muted">N° <b>${e(o.numero)}</b> · <a href="${base}/compte/commandes/${encodeURIComponent(o.numero)}">Détails</a> · <a href="${base}/compte/commandes/${encodeURIComponent(o.numero)}/recu">Récapitulatif</a></span></div>
${o.lignes.map((l) => `<div class="ligne-panier" style="grid-template-columns:64px 1fr auto">${l.image ? `<img src="${e(l.image)}" alt="" style="width:64px;height:64px">` : '<span></span>'}<div>${l.chemin ? `<a href="${base}${l.chemin}">${e(l.titre)}</a>` : e(l.titre)}<div class="muted" style="font-size:13px">${l.quantite} × · ${e(l.vendeur)}</div></div><span class="statut">${e(statutLisible(l.statut, l.paye))}</span></div>`).join('')}</div>`,
        )
        .join('')
    : `<div class="vide">Vous n'avez pas encore passé de commande.<br><br><a class="btn" href="${base}/">Découvrir les produits</a></div>`
  return page(c, 'Mes commandes', `<h1>Mes commandes</h1>${menuCompte(base, 'commandes')}${corps}`)
}

/**
 * Le détail d'une commande, pour le client connecté OU pour l'invité qui a
 * donné numéro + email (`preuve`, renvoyée dans chaque formulaire).
 */
export function pageDetailCommande(c: Commun & { commande: CommandeVue; client: MarketClient | null; preuve?: { numero: string; email: string } | null; erreur?: string | null; succes?: string | null }) {
  const { base, commande: o } = c
  const preuve = c.preuve ? `<input type="hidden" name="numero" value="${e(c.preuve.numero)}"><input type="hidden" name="email" value="${e(c.preuve.email)}">` : ''
  const lignes = o.lignes
    .map(
      (l) => `<div class="bloc"><div class="ligne-panier" style="grid-template-columns:80px 1fr auto;padding-top:0">${l.image ? `<img src="${e(l.image)}" alt="" style="width:80px;height:80px">` : '<span></span>'}
<div>${l.chemin ? `<a href="${base}${l.chemin}"><b>${e(l.titre)}</b></a>` : `<b>${e(l.titre)}</b>`}${l.variante ? `<div class="muted">${e(l.variante)}</div>` : ''}<div class="muted" style="font-size:13px">${l.quantite} × · Vendu et expédié par ${e(l.vendeur)}</div>
<div style="margin-top:6px"><span class="statut">${e(statutLisible(l.statut, l.paye))}</span></div>
${l.suivi ? `<p style="margin:8px 0 0">Suivi : <b>${e(l.suivi)}</b>${l.transporteur ? ` (${e(l.transporteur)})` : ''} · <a href="${e(lienSuivi(l.suivi, l.transporteur))}" target="_blank" rel="noopener">Suivre le colis ↗</a></p>` : l.paye && l.statut !== 'REFUNDED' ? '<p class="muted" style="margin:8px 0 0">Le numéro de suivi apparaîtra ici dès l\'expédition (et vous sera envoyé par email).</p>' : ''}
${l.retour ? `<p class="succes" style="margin:8px 0 0">Retour demandé : ${e(l.retour)}. Le vendeur vous répond par email avec l'adresse de retour.</p>` : ''}</div>
<b>${e(prixTexte(l.montant, l.devise))}</b></div>
${
  l.peutRetour
    ? `<details style="margin-top:10px"><summary class="lien-bouton" style="display:inline">Demander un retour</summary><form class="formulaire" method="post" action="${base}/retour" style="margin-top:10px">${preuve}<input type="hidden" name="ligne" value="${e(l.id)}">
<label>Motif<select name="motif" required><option value="retractation">Je change d'avis (rétractation 14 jours)</option><option value="defectueux">Produit défectueux ou abîmé</option><option value="non-conforme">Produit non conforme à la description</option><option value="erreur">Mauvais article reçu</option><option value="non-recu">Colis non reçu</option></select></label>
<label>Précisions<textarea name="message" maxlength="2000" placeholder="Décrivez le problème (facultatif pour une rétractation)."></textarea></label>
<button class="btn-second" type="submit">Envoyer la demande</button></form></details>`
    : ''
}
${
  l.peutAvis
    ? `<details style="margin-top:10px"><summary class="lien-bouton" style="display:inline">Laisser un avis</summary><form class="formulaire" method="post" action="${base}/compte/avis" style="margin-top:10px"><input type="hidden" name="ligne" value="${e(l.id)}">
<label>Note<select name="etoiles" required><option value="5">★★★★★ Excellent</option><option value="4">★★★★☆ Bien</option><option value="3">★★★☆☆ Correct</option><option value="2">★★☆☆☆ Décevant</option><option value="1">★☆☆☆☆ Mauvais</option></select></label>
<label>Votre avis<textarea name="texte" required minlength="10" maxlength="2000"></textarea></label>
<button class="btn-second" type="submit">Publier mon avis</button>
<p class="muted" style="font-size:12px;margin:0">Publié avec votre prénom et la mention « Achat vérifié ».</p></form></details>`
    : l.avisLaisse
      ? '<p class="muted" style="margin:8px 0 0">✓ Merci pour votre avis.</p>'
      : ''
}</div>`,
    )
    .join('')
  return page(
    c,
    `Commande ${o.numero}`,
    `${c.client ? menuCompte(base, 'commandes') : ''}<h1>Commande ${e(o.numero)}</h1>${alerte(c.erreur, c.succes)}
<p class="muted">Passée le ${e(dateFr(o.date))} · Total <b>${e(prixTexte(o.total, o.devise))}</b>, livraison comprise${o.adresse ? ` · Livraison : ${e(o.adresse)}` : ''}</p>
<p class="non-imprime">${c.client ? `<a href="${base}/compte/commandes/${encodeURIComponent(o.numero)}/recu">Récapitulatif imprimable</a> · ` : ''}<a href="${base}/contact?numero=${encodeURIComponent(o.numero)}">Un problème avec cette commande ?</a></p>
${lignes}`,
  )
}

export function pageRecu(c: Commun & { commande: CommandeVue; client: MarketClient }) {
  const o = c.commande
  return page(
    c,
    `Récapitulatif ${o.numero}`,
    `<div class="bloc"><h1>Récapitulatif de commande</h1>
<p>Commande <b>${e(o.numero)}</b> du ${e(dateFr(o.date))}<br>Client : ${e(c.client.nom)} (${e(c.client.email)})<br>Livraison : ${e(o.adresse)}</p>
<table class="caract"><tr><td><b>Article</b></td><td><b>Vendeur</b></td><td><b>Qté</b></td><td style="text-align:right"><b>Montant TTC</b></td></tr>
${o.lignes.filter((l) => l.paye).map((l) => `<tr><td>${e(l.titre)}${l.variante ? ` — ${e(l.variante)}` : ''}</td><td>${e(l.vendeur)}</td><td>${l.quantite}</td><td style="text-align:right">${e(prixTexte(l.montant, l.devise))}</td></tr>`).join('')}
<tr><td>Livraison</td><td></td><td></td><td style="text-align:right">comprise</td></tr>
<tr><td><b>Total payé</b></td><td></td><td></td><td style="text-align:right"><b>${e(prixTexte(o.total, o.devise))}</b></td></tr></table>
<p class="muted" style="font-size:13px">Paiement par Stripe à DropShop Market (${e(EDITEUR.nom)}, ${e(EDITEUR.adresse)}), pour le compte des vendeurs. Ce récapitulatif n'est pas une facture : la facture de chaque article est émise par son vendeur, sur demande depuis la page de contact.</p>
<p class="non-imprime"><button class="btn" type="button" onclick="window.print()">Imprimer</button></p></div>`,
  )
}

export function pageAdresses(c: Commun & { client: MarketClient; adresses: MarketAdresse[]; erreur?: string | null; succes?: string | null }) {
  const { base } = c
  const pays = paysLivres()
  return page(
    c,
    'Mes adresses',
    `<h1>Mes adresses</h1>${menuCompte(base, 'adresses')}${alerte(c.erreur, c.succes)}
<div class="etapes">${c.adresses
      .map(
        (a) => `<div class="bloc">${a.parDefaut ? '<span class="statut">Par défaut</span>' : ''}<p style="margin-top:8px"><b>${e(a.nom)}</b><br>${e(a.ligne1)}${a.ligne2 ? `<br>${e(a.ligne2)}` : ''}<br>${e(a.codePostal)} ${e(a.ville)}<br>${e(a.pays)}${a.telephone ? `<br>${e(a.telephone)}` : ''}</p>
<form method="post" action="${base}/compte/adresses/action" style="display:flex;gap:12px"><input type="hidden" name="id" value="${e(a.id)}">${a.parDefaut ? '' : '<button class="lien-bouton" name="action" value="defaut">Par défaut</button>'}<button class="lien-bouton" name="action" value="supprimer">Supprimer</button></form></div>`,
      )
      .join('')}</div>
<div class="bloc"><h2 style="margin-top:0">Ajouter une adresse</h2><form class="formulaire" method="post" action="${base}/compte/adresses">
<label>Nom complet<input name="nom" required maxlength="80" autocomplete="name"></label>
<label>Adresse<input name="ligne1" required maxlength="120" autocomplete="address-line1"></label>
<label>Complément (facultatif)<input name="ligne2" maxlength="120" autocomplete="address-line2"></label>
<label>Code postal<input name="codePostal" required maxlength="12" autocomplete="postal-code"></label>
<label>Ville<input name="ville" required maxlength="80" autocomplete="address-level2"></label>
<label>Pays<select name="pays">${['FR', 'BE', 'LU', 'CH', 'MC', 'DE', 'ES', 'IT', 'NL', 'PT', 'AT', 'IE'].map((p) => `<option>${p}</option>`).join('')}</select></label>
<label>Téléphone (facultatif)<input name="telephone" maxlength="30" autocomplete="tel"></label>
<label class="coche" style="flex-direction:row;align-items:center;font-weight:400"><input type="checkbox" name="parDefaut" value="1"> Adresse par défaut</label>
<button class="btn" type="submit">Enregistrer l'adresse</button></form>
<p class="muted" style="font-size:13px">Pays livrés : ${e(pays)}.</p></div>`,
  )
}

export function pageEnvies(c: Commun & { client: MarketClient; annonces: Annonce[]; succes?: string | null }) {
  const { base } = c
  const corps = c.annonces.length
    ? `<div class="grille">${c.annonces
        .map((a) => {
          const o = a.offres[0]
          return `<div class="carte"><a class="lien" href="${base}${o.cheminProduit}"><div class="img">${o.image ? `<img src="${e(o.image)}" alt="" loading="lazy">` : ''}</div><div class="txt"><div class="t">${e(o.titreProduit)}</div><div class="p">${e(prixTexte(o.prix, o.devise))}</div></div></a>
<form method="post" action="${base}/compte/envies/retirer"><input type="hidden" name="produit" value="${e(a.product.id)}"><button class="btn-panier" type="submit">Retirer</button></form></div>`
        })
        .join('')}</div>`
    : `<div class="vide">Votre liste d'envies est vide. Sur une fiche produit, cliquez « ♡ Ajouter à ma liste d'envies ».</div>`
  return page(c, "Liste d'envies", `<h1>Ma liste d'envies</h1>${menuCompte(base, 'envies')}${alerte(null, c.succes)}${corps}`)
}

export function pageSecurite(c: Commun & { client: MarketClient; erreur?: string | null; succes?: string | null }) {
  const { base, client } = c
  return page(
    c,
    'Connexion et sécurité',
    `<h1>Connexion et sécurité</h1>${menuCompte(base, 'securite')}${alerte(c.erreur, c.succes)}${bandeauConfirmation(base, client)}
<div class="bloc"><p>Nom : <b>${e(client.nom)}</b><br>Email : <b>${e(client.email)}</b>${client.emailConfirmeAt ? ' ✓ confirmé' : ''}<br>Client depuis le ${e(dateFr(client.createdAt))}</p></div>
<div class="bloc"><h2 style="margin-top:0">Changer de mot de passe</h2><form class="formulaire" method="post" action="${base}/compte/securite">
<label>Mot de passe actuel<input type="password" name="actuel" required autocomplete="current-password"></label>
<label>Nouveau mot de passe<input type="password" name="nouveau" required minlength="8" autocomplete="new-password"></label>
<button class="btn" type="submit">Changer</button></form></div>
<div class="bloc"><h2 style="margin-top:0">Supprimer mon compte</h2><p class="muted">Vos adresses et votre liste d'envies sont effacées. Vos commandes restent chez les vendeurs (obligations comptables et garanties) mais ne sont plus liées à un compte.</p>
<form class="formulaire" method="post" action="${base}/compte/supprimer"><label>Mot de passe<input type="password" name="motDePasse" required autocomplete="current-password"></label><button class="btn-second" type="submit">Supprimer définitivement</button></form></div>`,
  )
}

// ——— Suivi sans compte, contact, pages d'information ———

export function pageSuivi(c: Commun & { erreur?: string | null; numero?: string; email?: string }) {
  const { base } = c
  return page(
    c,
    'Suivre une commande',
    `<div class="bloc" style="max-width:520px;margin:20px auto"><h1>Suivre une commande</h1>${alerte(c.erreur)}
<p class="muted">Sans compte : indiquez le numéro reçu par email (« DSM-… ») et l'adresse email utilisée pour la commande.</p>
<form class="formulaire" method="get" action="${base}/suivi"><label>Numéro de commande<input name="numero" required placeholder="DSM-XXXXXXXX" value="${e(c.numero ?? '')}"></label>
<label>Email<input type="email" name="email" required value="${e(c.email ?? '')}"></label><button class="btn" type="submit">Voir ma commande</button></form>
<p>Vous avez un compte ? <a href="${base}/compte/commandes">Mes commandes</a></p></div>`,
    { description: 'Suivez votre commande DropShop Market avec son numéro et votre email.' },
  )
}

export const SUJETS_CONTACT: Record<string, string> = {
  commande: 'Ma commande (suivi, retard)',
  retour: 'Retour ou remboursement',
  produit: 'Question sur un produit',
  paiement: 'Paiement',
  compte: 'Mon compte',
  facture: 'Demande de facture',
  signaler: 'Signaler un produit',
  autre: 'Autre',
}

export function pageContact(c: Commun & { client: MarketClient | null; envoye?: boolean; erreur?: string | null; numero?: string; valeurs?: { nom?: string; email?: string; message?: string; sujet?: string } }) {
  const { base } = c
  const v = c.valeurs ?? {}
  return page(
    c,
    'Contacter le service client',
    `<h1>Contacter le service client</h1>${alerte(c.erreur, c.envoye ? "Message envoyé. Une copie vous a été adressée par email ; nous vous répondons à cette adresse." : null)}
<div class="deux"><div class="bloc" style="margin-top:0"><form class="formulaire" style="max-width:none" method="post" action="${base}/contact">
<label>Votre nom<input name="nom" required maxlength="80" value="${e(v.nom ?? c.client?.nom ?? '')}"></label>
<label>Email<input type="email" name="email" required value="${e(v.email ?? c.client?.email ?? '')}"></label>
<label>Sujet<select name="sujet">${Object.entries(SUJETS_CONTACT).map(([k, t]) => `<option value="${k}"${(v.sujet ?? (c.numero ? 'commande' : '')) === k ? ' selected' : ''}>${e(t)}</option>`).join('')}</select></label>
<label>Numéro de commande (si elle est concernée)<input name="numero" maxlength="20" placeholder="DSM-XXXXXXXX" value="${e(c.numero ?? '')}"></label>
<label>Message<textarea name="message" required minlength="10" maxlength="4000">${e(v.message ?? '')}</textarea></label>
<input type="text" name="site" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
<button class="btn" type="submit">Envoyer</button></form></div>
<aside class="bloc" style="margin-top:0"><h2 style="margin-top:0">Autres moyens</h2><p>Email : <a href="mailto:${e(EDITEUR.email)}">${e(EDITEUR.email)}</a><br>Téléphone : ${e(EDITEUR.telephone)}<br><span class="muted">${e(EDITEUR.horaires)}</span></p>
<p><a href="${base}/aide">Questions fréquentes</a><br><a href="${base}/suivi">Suivre une commande</a><br><a href="${base}/retours">Retours et remboursements</a></p></aside></div>`,
    { chemin: '/contact', description: 'Contactez le service client de DropShop Market : commande, livraison, retour, remboursement.' },
  )
}

export function pageInfo(c: Commun & { cle: keyof typeof PAGES_INFO | string }) {
  const p = PAGES_INFO[c.cle]
  return page(c, p.titre, `<div class="texte-legal"><h1>${e(p.titre)}</h1>${p.corps(c.base)}</div>`, { chemin: `/${c.cle}`, description: p.description })
}
