import { Router } from 'express'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma.js'
import { apiBaseUrl } from '../lib/urls.js'

/**
 * La vitrine d'une boutique, servie à son adresse lisible.
 *
 * ```
 * https://…/b/ma-boutique
 * ```
 *
 * **Une seule page pour toutes les boutiques.** Elle ne contient aucun produit
 * et aucune couleur : elle reçoit ici la clé de la boutique, puis va chercher
 * son thème et son catalogue. C'est ce qui permet d'avoir des centaines de
 * vitrines sans avoir des centaines de sites à construire, à déployer et à
 * corriger un par un — le contraire exact d'un générateur de code.
 *
 * **Palier 1, volontairement.** Un chemin plutôt qu'un sous-domaine : aucune
 * entrée DNS, aucun certificat, ça marche le jour même. Les sous-domaines
 * (`ma-boutique.drop-shipper.fr`) et les domaines propres viendront quand le
 * reste sera éprouvé, et ne changeront rien à cette page.
 */
export const vitrineRouter = Router()

/**
 * Là où la page peut être, selon qui exécute le serveur.
 *
 * **Elle vit sous `backend/`, et c'est obligatoire.** Railway déploie avec
 * `backend/` pour racine : un dossier au niveau du dépôt est simplement absent
 * du conteneur. C'est le piège qui avait déjà mis l'extension en 404 — ici il
 * donnait un 500 et une boutique injoignable, alors que la page existait sur la
 * machine de développement et que tous les bancs passaient.
 *
 * La règle qui s'en dégage : **une page servie par l'API vit avec l'API**. Les
 * vitrines autonomes (`storefront/`, `storefront-imprimerie/`) restent à la
 * racine, parce que personne ne les sert — on les dépose ailleurs.
 */
const CHEMINS = [
  path.join('storefront-boutique', 'index.html'),
  path.join('..', 'storefront-boutique', 'index.html'),
]

function pageVitrine(): string | null {
  const trouve = CHEMINS.map((c) => path.resolve(c)).find((c) => existsSync(c))
  return trouve ? readFileSync(trouve, 'utf8') : null
}

/** Échappe ce qui est injecté dans une balise `<script>`. */
function pourScript(valeur: string) {
  return JSON.stringify(valeur).replace(/</g, '\\u003c')
}

/**
 * Le moteur des boutiques écrites par l'IA (`dropshop/sdk.js`), inséré dans
 * la page au moment de la servir : la boutique part en un seul document, et
 * le moteur se met à jour avec l'API sans qu'aucune page ne soit réécrite.
 */
const CHEMINS_SDK = [path.join('dropshop', 'sdk.js'), path.join('..', 'dropshop', 'sdk.js')]

function moteurDropShop(): string | null {
  const trouve = CHEMINS_SDK.map((c) => path.resolve(c)).find((c) => existsSync(c))
  return trouve ? readFileSync(trouve, 'utf8') : null
}

vitrineRouter.get('/:slug', async (req, res) => {
  const boutique = await prisma.shop.findUnique({
    where: { slug: req.params.slug },
    select: { shopKey: true, name: true, slug: true, siteHtml: true, siteVersion: true },
  })
  if (!boutique) {
    return res
      .status(404)
      .type('html')
      .send('<!doctype html><meta charset="utf-8"><p>Cette boutique n\'existe pas.</p>')
  }

  /*
   * La boutique écrite par l'IA (DropShop IA, 17/09/2026) passe devant la
   * vitrine à thèmes dès qu'elle existe. Même clé, même catalogue, même
   * commande : seule la page change — et c'est la sienne.
   */
  if (boutique.siteHtml) {
    const moteur = moteurDropShop()
    if (!moteur) {
      console.error('moteur DropShop introuvable, cherche dans', CHEMINS_SDK.map((c) => path.resolve(c)))
      return res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><p>Boutique indisponible.</p>')
    }
    const config = `<script>window.BOUTIQUE=${JSON.stringify({ api: apiBaseUrl(req), shopKey: boutique.shopKey, slug: boutique.slug, nom: boutique.name }).replace(/</g, '\\u003c')};</script>`
    const moteurInline = `<script>${moteur.replace(/<\/script/gi, '<\\/script')}</script>`
    let page = boutique.siteHtml.replace(/<script[^>]+src=["']\/dropshop\/sdk\.js["'][^>]*><\/script>/i, () => moteurInline)
    if (!page.includes(moteurInline)) page = page.replace('</body>', `${moteurInline}\n</body>`)
    page = page.replace('</head>', `${config}\n</head>`)
    res.type('html')
    // Court : le vendeur qui vient de modifier sa boutique veut la voir tout de suite.
    res.set('Cache-Control', 'public, max-age=30')
    res.set('X-DropShop-Version', String(boutique.siteVersion))
    return res.send(page)
  }

  const page = pageVitrine()
  if (!page) {
    // Journalisé avec les chemins essayés : « introuvable » tout seul ne dit
    // pas quelle disposition de déploiement le serveur a réellement.
    console.error('vitrine introuvable, cherchee dans', CHEMINS.map((c) => path.resolve(c)))
    return res.status(500).type('html').send('<!doctype html><meta charset="utf-8"><p>Vitrine indisponible.</p>')
  }

  /*
   * La configuration est injectée, pas devinée.
   *
   * La page pourrait déduire l'adresse de l'API de la sienne, mais elle est
   * aussi ouverte en local et depuis un fichier pendant le développement. Une
   * seule source, écrite par le serveur qui la sert, évite le lot de cas
   * particuliers qui finissent par se contredire.
   *
   * **La clé de boutique voyage ici et c'est sans risque** : elle n'ouvre que
   * le flux public, celui que la vitrine affiche de toute façon à ses
   * visiteurs. Ce qui ne doit jamais sortir, ce sont les jetons de place de
   * marché — et ceux-là ne sont lus par aucune route publique.
   */
  const config =
    `<script>window.BOUTIQUE=${JSON.stringify({ api: apiBaseUrl(req), shopKey: boutique.shopKey })};</script>`

  res.type('html')
  // Court : le vendeur qui change son thème veut le voir tout de suite, mais
  // la page elle-même est identique pour tous et vaut d'être mise en cache.
  res.set('Cache-Control', 'public, max-age=60')
  res.send(page.replace('</head>', `${config}\n  </head>`))
})

export { pourScript }
