/**
 * Reconnaître un jeton Shopify, et surtout dire lequel a été collé.
 *
 * Shopify distribue au moins cinq sortes de jetons, tous longs, tous opaques,
 * et un seul sert à publier un produit. Un vendeur qui en copie un mauvais n'a
 * aucun moyen de s'en apercevoir : « Ce jeton ne ressemble pas à un jeton
 * d'accès Admin » lui donne envie de le relire dix fois, alors que le problème
 * n'est pas la lecture, c'est la page où il l'a pris.
 *
 * D'où un message par préfixe. Constaté le 26/08/2026 : un vendeur bloqué une
 * soirée sur un jeton `atkn_` pris dans le Dev Dashboard, à l'endroit intitulé
 * « Jeton d'automatisation d'appli », dont la page précise elle-même qu'il ne
 * sert qu'aux flux CI/CD.
 */

/** Les préfixes qui donnent réellement accès à l'Admin API. */
const ADMIN = /^(shpat_|shpca_|shppa_|shpua_)/

/**
 * Ce qu'on sait des autres jetons, et où le vendeur l'a probablement pris.
 *
 * L'ordre compte peu, les préfixes ne se recouvrent pas. Ce qui compte, c'est
 * que chaque message dise **quelle page ouvrir**, pas seulement ce qui ne va pas.
 */
const AUTRES: Array<{ prefixe: RegExp; message: string }> = [
  {
    prefixe: /^atkn_/,
    message:
      "Ce jeton est un « jeton d'automatisation d'appli » du Dev Dashboard : il ne sert qu'aux flux CI/CD et ne donne aucun accès au catalogue. Le bon jeton se prend ailleurs — dans l'administration de votre boutique, Paramètres › Applications et canaux de vente › Développer des applications › votre app › API Admin, et il commence par shpat_.",
  },
  {
    prefixe: /^shpss_/,
    message:
      "Ce jeton est le secret partagé de l'application (shpss_), pas son jeton d'accès. Dans votre app, ouvrez l'onglet « Identifiants d'API Admin » : le jeton d'accès commence par shpat_.",
  },
  {
    prefixe: /^shptka_/,
    message:
      "Ce jeton vient de l'app Theme Access : il ne permet de toucher qu'aux thèmes, jamais aux produits. Créez une application personnalisée dans Paramètres › Applications et canaux de vente › Développer des applications.",
  },
  {
    prefixe: /^shpsa_/,
    message:
      "Ce jeton est un jeton d'organisation, pas un jeton de boutique. Le jeton d'accès Admin de votre app commence par shpat_.",
  },
]

/**
 * Rend le problème en clair, ou `null` quand le jeton est plausible.
 *
 * « Plausible » et pas « valide » : seul Shopify peut dire si un jeton marche.
 * Ce contrôle n'existe que pour éviter au vendeur d'attendre l'échec d'une
 * publication pour apprendre qu'il s'est trompé de page.
 */
export function diagnostiquerJetonShopify(jeton: string): string | null {
  const propre = jeton.trim()

  for (const { prefixe, message } of AUTRES) {
    if (prefixe.test(propre)) return message
  }

  if (!ADMIN.test(propre)) {
    return "Ce jeton ne ressemble à aucun jeton Shopify connu. Le jeton d'accès Admin commence par shpat_ et se trouve dans l'administration de votre boutique : Paramètres › Applications et canaux de vente › Développer des applications › votre app › API Admin.";
  }

  // La longueur a changé en avril 2026 : 32 caractères avant, 38 après. On
  // n'exige donc pas une longueur exacte, seulement qu'il y ait bien quelque
  // chose après le préfixe — un préfixe seul est un copier-coller raté.
  const corps = propre.replace(ADMIN, '')
  if (corps.length < 20) {
    return "Ce jeton semble incomplet : il n'y a presque rien après le préfixe. Recopiez-le en entier — Shopify ne l'affiche qu'une fois.";
  }

  return null
}
