/**
 * La page que l'administration Shopify affiche quand le marchand ouvre
 * DropShipper IA — l'application « intégrée ».
 *
 * **Ce que c'est, et ce que ce n'est pas.** Shopify rend cette page dans une
 * iframe de `admin.shopify.com`. Ce n'est donc pas notre site : c'est notre
 * vitrine à l'intérieur de chez eux. Un marchand qui installe l'app y arrive
 * en premier, et c'est la seule chose qu'il verra de nous tant qu'il n'aura
 * pas cliqué. Elle doit donc dire trois choses et rien d'autre : **qui nous
 * sommes**, **où en est sa boutique**, et **quoi faire maintenant**.
 *
 * **Pourquoi une page écrite à la main plutôt qu'un second front React.**
 * L'iframe charge cette page à chaque ouverture du menu Applications. Un bundle
 * Vite de plusieurs centaines de kilo-octets pour afficher quatre chiffres
 * ferait attendre le marchand à chaque visite, et il faudrait déployer un
 * second site — alors que Vercel ne sert pas `backend/`. Le HTML est donc
 * autonome, sans dépendance, hors App Bridge que Shopify impose.
 *
 * **App Bridge est obligatoire**, pas un confort : sans lui, l'app n'est pas
 * considérée comme intégrée, la barre de titre de Shopify n'apparaît pas, et
 * surtout aucun jeton de session n'est délivré — il n'y aurait alors aucun
 * moyen d'authentifier l'iframe, nos cookies n'y arrivant pas.
 *
 * **Rien n'est affiché sans avoir été demandé au serveur.** Les chiffres de la
 * page viennent de `/api/shopify/embed/etat`, appelé AVEC le jeton de session.
 * Écrire l'état dans le HTML au moment du rendu aurait été plus simple et
 * faux : la page est servie avant que la signature du jeton ait été vérifiée,
 * et on afficherait le catalogue d'une boutique à qui la demande.
 */

/** Échappe ce qui part dans le HTML. La boutique vient de la requête. */
function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface PageIntegree {
  /** La boutique, déjà normalisée et vérifiée par la signature de la requête. */
  shop: string
  /** La clé publique de l'app : App Bridge la lit dans la balise script. */
  cleApp: string
  /** L'adresse de notre site, pour les liens qui sortent de l'iframe. */
  site: string
}

export function pageIntegree({ shop, cleApp, site }: PageIntegree): string {
  const s = echapper(shop)
  const k = echapper(cleApp)
  const w = echapper(site.replace(/\/+$/, ''))

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DropShipper IA</title>
<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key="${k}"></script>
<style>
  :root {
    --fond: #ffffff; --encre: #1a1a1a; --encre-2: #5c5f62; --trait: #e3e3e3;
    --vert: #0f7b55; --vert-doux: #e6f4ee; --ambre: #8a6116; --ambre-doux: #fdf3dd;
    --degrade: linear-gradient(90deg, #a855f7, #ec4899);
  }
  @media (prefers-color-scheme: dark) {
    :root { --fond: #1a1a1a; --encre: #e3e3e3; --encre-2: #a8a8a8; --trait: #303030;
            --vert: #4ade80; --vert-doux: #14301f; --ambre: #fbbf24; --ambre-doux: #2f2612; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--fond); color: var(--encre);
         font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .page { max-width: 760px; margin: 0 auto; padding: 20px 16px 40px; }
  .marque { display: flex; align-items: center; gap: 10px; }
  .cube { width: 34px; height: 34px; border-radius: 9px; background: var(--degrade);
          display: grid; place-items: center; flex: 0 0 34px; }
  .nom { font-size: 19px; font-weight: 800; letter-spacing: -.01em;
         background: var(--degrade); -webkit-background-clip: text; background-clip: text; color: transparent; }
  h1 { font-size: 21px; font-weight: 700; margin: 18px 0 2px; }
  .sous { color: var(--encre-2); margin: 0; }
  .carte { border: 1px solid var(--trait); border-radius: 12px; padding: 16px; margin-top: 16px; }
  .etat { display: inline-flex; align-items: center; gap: 7px; border-radius: 999px;
          padding: 5px 12px; font-size: 13px; font-weight: 600; }
  .etat.ok { background: var(--vert-doux); color: var(--vert); }
  .etat.attente { background: var(--ambre-doux); color: var(--ambre); }
  .chiffres { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
              gap: 12px; margin-top: 16px; }
  .chiffre { border: 1px solid var(--trait); border-radius: 10px; padding: 12px 14px; }
  .chiffre .v { font-size: 24px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .chiffre .l { color: var(--encre-2); font-size: 12px; margin-top: 3px; }
  .gestes { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
  .bouton { display: inline-flex; align-items: center; gap: 7px; border-radius: 9px;
            padding: 10px 16px; font-size: 14px; font-weight: 600; text-decoration: none;
            border: 1px solid var(--trait); color: var(--encre); background: transparent; cursor: pointer; }
  .bouton.plein { background: var(--degrade); color: #fff; border-color: transparent; }
  ul { margin: 10px 0 0; padding-left: 20px; color: var(--encre-2); }
  li { margin: 5px 0; }
  .pied { color: var(--encre-2); font-size: 12px; margin-top: 26px; border-top: 1px solid var(--trait); padding-top: 14px; }
  .pied a { color: inherit; }
  .ligne-titre { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .solde { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .bandeau { border-radius: 9px; padding: 9px 12px; margin: 10px 0 0; font-size: 13px; font-weight: 600; }
  .bandeau.ok { background: var(--vert-doux); color: var(--vert); }
  .bandeau.attente { background: var(--ambre-doux); color: var(--ambre); }
  .packs { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 14px; }
  .pack { border: 1px solid var(--trait); border-radius: 10px; padding: 12px; text-align: left;
          background: transparent; color: var(--encre); cursor: pointer; font: inherit; }
  .pack:hover { border-color: #a855f7; }
  .pack:disabled { opacity: .55; cursor: wait; }
  .pack .d { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .pack .p { color: var(--encre-2); font-size: 12px; margin-top: 2px; }
  .pack .u { color: var(--encre-2); font-size: 11px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div class="page">

  <div class="marque">
    <span class="cube" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 128 128" fill="none">
        <path d="M64 24L104 46L104 84L64 106L24 84L24 46ZM24 46L64 66L104 46M64 66L64 106"
              stroke="#fff" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
    </span>
    <span class="nom">DropShipper IA</span>
  </div>

  <h1>Le dropshipping augmenté, depuis votre boutique</h1>
  <p class="sous">Boutique connectée : <b>${s}</b></p>

  <div class="carte">
    <span class="etat attente" id="etat">Vérification de la liaison…</span>
    <div class="chiffres" id="chiffres" hidden>
      <div class="chiffre"><div class="v" id="n-publiees">—</div><div class="l">annonces publiées ici</div></div>
      <div class="chiffre"><div class="v" id="n-catalogue">—</div><div class="l">annonces dans votre catalogue</div></div>
      <div class="chiffre"><div class="v" id="n-fournisseurs">—</div><div class="l">fournisseurs reliés</div></div>
    </div>
    <p class="sous" id="explication" style="margin-top:14px"></p>
    <div class="gestes">
      <a class="bouton plein" id="lien-ouvrir" href="${w}/statistiques" target="_blank" rel="noopener">Ouvrir DropShipper IA</a>
      <a class="bouton" href="${w}/produits" target="_blank" rel="noopener">Mes annonces</a>
      <a class="bouton" href="${w}/catalogues" target="_blank" rel="noopener">Chercher un produit chez mes fournisseurs</a>
    </div>
  </div>

  <div class="carte" id="carte-drops" hidden>
    <div class="ligne-titre">
      <b>Vos drops</b>
      <span class="solde"><span id="n-drops">—</span> drops</span>
    </div>
    <p class="sous" style="margin-top:4px">La monnaie de chaque action — import, réécriture, image, publicité. Achetés ici, ils sont facturés par Shopify avec votre abonnement.</p>
    <p class="bandeau ok" id="bandeau-credite" hidden></p>
    <p class="bandeau attente" id="bandeau-achat" hidden></p>
    <div class="packs" id="packs"></div>
  </div>

  <div class="carte">
    <b>Ce que DropShipper IA fait pour cette boutique</b>
    <ul>
      <li>Importer une fiche depuis n'importe quel fournisseur — 37 référencés, et n'importe quelle autre boutique.</li>
      <li>Réécrire l'annonce entière par l'IA : titre, description, attributs, mots-clés, catégorie.</li>
      <li>Poser votre filigrane sur les photos, puis publier ici — et sur vos autres canaux de vente.</li>
      <li>Surveiller prix et stocks chez le fournisseur : une rupture repasse l'annonce en brouillon.</li>
    </ul>
  </div>

  <p class="pied">
    DropShipper IA · <a href="${w}" target="_blank" rel="noopener">drop-shipper.fr</a> ·
    <a href="${w}/confidentialite" target="_blank" rel="noopener">Confidentialité</a><br>
    Aucun abonnement : vous payez chaque action à l'acte.
  </p>
</div>

<script>
/*
 * Le jeton de session est demandé à App Bridge, jamais stocké.
 *
 * Il vit une minute : le garder n'avancerait à rien, et le poser dans
 * localStorage l'exposerait pour rien. On en redemande un à chaque appel,
 * c'est le geste prévu par Shopify.
 */
(async function () {
  var etat = document.getElementById('etat')
  var explication = document.getElementById('explication')

  function echec(message) {
    etat.className = 'etat attente'
    etat.textContent = 'Liaison à terminer'
    explication.textContent = message
  }

  try {
    if (!window.shopify || typeof window.shopify.idToken !== 'function') {
      echec("Ouvrez cette page depuis le menu Applications de votre administration Shopify.")
      return
    }

    var jeton = await window.shopify.idToken()
    var reponse = await fetch('/api/shopify/embed/etat', {
      headers: { Authorization: 'Bearer ' + jeton },
    })

    if (!reponse.ok) {
      echec("La boutique n'est pas encore rattachée à un compte DropShipper IA. Ouvrez DropShipper IA, puis reliez Shopify depuis Réglages.")
      return
    }

    var d = await reponse.json()
    document.getElementById('n-publiees').textContent = d.publiees
    document.getElementById('n-catalogue').textContent = d.catalogue
    document.getElementById('n-fournisseurs').textContent = d.fournisseurs
    document.getElementById('chiffres').hidden = false
    if (d.reliee) montrerDrops(d)

    if (d.reliee) {
      etat.className = 'etat ok'
      etat.textContent = 'Boutique reliée'
      explication.textContent = d.publiees
        ? 'Vos annonces se publient ici depuis DropShipper IA.'
        : "Tout est prêt : importez un produit, et publiez-le sur cette boutique."
    } else {
      echec("La liaison existe mais elle est éteinte — l'application a sans doute été désinstallée puis réinstallée. Relancez-la depuis DropShipper IA, Réglages › Plateformes.")
    }
  } catch (e) {
    echec("Impossible de vérifier la liaison pour l'instant. Réessayez dans un instant.")
  }

  /*
   * Les recharges : un bouton par pack, l'achat s'ouvre chez Shopify.
   *
   * La page d'approbation de Shopify ne peut pas s'afficher dans l'iframe :
   * on y envoie la fenêtre entière (_top). Shopify ramène ensuite le marchand
   * ici par notre adresse de retour, et le serveur a déjà crédité ce que
   * Shopify dit approuvé — la page ne fait que l'afficher.
   */
  function montrerDrops(d) {
    var carte = document.getElementById('carte-drops')
    var packs = document.getElementById('packs')
    var solde = document.getElementById('n-drops')
    var bandeauCredite = document.getElementById('bandeau-credite')
    var bandeauAchat = document.getElementById('bandeau-achat')
    solde.textContent = Number(d.drops || 0).toLocaleString('fr-FR')

    if (d.credites && d.credites.length) {
      var total = d.credites.reduce(function (s, c) { return s + c.drops }, 0)
      bandeauCredite.textContent = 'Recharge créditée : +' + total.toLocaleString('fr-FR') + ' drops. Merci !'
      bandeauCredite.hidden = false
    } else if (/[?&]achat=attente/.test(location.search)) {
      bandeauAchat.textContent = "L'achat n'est pas encore approuvé chez Shopify. Dès qu'il l'est, les drops apparaissent ici."
      bandeauAchat.hidden = false
    } else if (/[?&]achat=erreur/.test(location.search)) {
      bandeauAchat.textContent = "Impossible de vérifier l'achat pour l'instant. Rouvrez cette page dans un instant : les drops seront crédités."
      bandeauAchat.hidden = false
    }

    packs.textContent = ''
    ;(d.packs || []).forEach(function (p) {
      var b = document.createElement('button')
      b.type = 'button'
      b.className = 'pack'
      var unitaire = (Number(p.prix) / p.drops * 100).toFixed(2).replace('.', ',')
      b.innerHTML = '<div class="d">' + p.drops.toLocaleString('fr-FR') + ' drops</div>' +
        '<div class="p">' + String(p.prix).replace('.', ',') + ' € TTC</div>' +
        '<div class="u">' + unitaire + ' c le drop</div>'
      b.addEventListener('click', function () { acheter(p.id, b) })
      packs.appendChild(b)
    })
    carte.hidden = false
  }

  async function acheter(packId, bouton) {
    var bandeauAchat = document.getElementById('bandeau-achat')
    bouton.disabled = true
    try {
      var jeton = await window.shopify.idToken()
      var r = await fetch('/api/shopify/embed/achat', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: packId }),
      })
      var j = await r.json()
      if (!r.ok || !j.confirmationUrl) {
        bandeauAchat.textContent = j.error || "Impossible d'ouvrir l'achat pour l'instant."
        bandeauAchat.hidden = false
        bouton.disabled = false
        return
      }
      window.open(j.confirmationUrl, '_top')
    } catch (e) {
      bandeauAchat.textContent = "Impossible d'ouvrir l'achat pour l'instant. Réessayez."
      bandeauAchat.hidden = false
      bouton.disabled = false
    }
  }
})()
</script>
</body>
</html>`
}
