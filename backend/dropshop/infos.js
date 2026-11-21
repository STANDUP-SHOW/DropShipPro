/*
 * Pages légales, contact et réparations d'une vitrine — partagé par les
 * boutiques écrites par l'IA (sdk.js) et la vitrine à thèmes. Inséré par le
 * serveur (routes/vitrine.ts) avant le moteur : window.DropShopInfos.
 *
 * Constaté en ligne le 21/11/2026 : pied de page aux faux liens (#/boutique),
 * aucune page mentions légales / CGV / contact, et un bout de balise qui fuit
 * dans le bouton (« ">AJOUTER AU PANIER »). La page de chaque boutique est
 * écrite par le modèle et stockée : on la répare au rendu, sans la réécrire.
 */
;(function () {
  var PAGES = [
    { slug: 'mentions-legales', titre: 'Mentions légales' },
    { slug: 'cgv', titre: 'CGV' },
    { slug: 'livraison-retours', titre: 'Livraison et retours' },
    { slug: 'contact', titre: 'Contact' },
  ]
  var cache = null
  var etatContact = { envoi: false, ok: false, erreur: null }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  function charger(base) {
    if (!cache) {
      cache = fetch(base + '/infos')
        .then(function (r) { return r.ok ? r.json() : null })
        .catch(function () { return null })
    }
    return cache
  }

  /** Quelle page légale un libellé de lien désigne, ou null. */
  function pagePour(texte) {
    var t = String(texte || '').toLowerCase()
    if (/mention|l[ée]gal|confidentialit|donn[ée]es perso|cookie|rgpd/.test(t)) return 'mentions-legales'
    if (/cgv|conditions/.test(t)) return 'cgv'
    if (/retour|rembours|livraison|exp[ée]dition|garantie|sav|r[ée]tractation/.test(t)) return 'livraison-retours'
    if (/contact|[ée]crire|aide|faq|question|suivi|service client|support/.test(t)) return 'contact'
    return null
  }

  var STYLE =
    'max-width:820px;margin:0 auto;padding:48px 20px 64px;line-height:1.65;text-align:left'

  function rendre(slug, infos) {
    var page = infos && infos.pages && infos.pages[slug]
    if (!infos) return '<section style="' + STYLE + '"><p>Chargement…</p></section>'
    if (!page) return null
    var corps = page.html
    if (slug === 'contact') corps += formulaireContact()
    var menu = PAGES.map(function (p) {
      return '<a href="#/infos/' + p.slug + '" style="margin-right:14px;' + (p.slug === slug ? 'font-weight:700;' : 'opacity:.75;') + 'color:inherit">' + esc(p.titre) + '</a>'
    }).join('')
    return (
      '<section class="ds-infos" style="' + STYLE + '">' +
      '<nav style="font-size:.85em;margin-bottom:18px">' + menu + '</nav>' +
      '<h1 style="font-size:1.8em;margin:0 0 18px">' + esc(page.titre) + '</h1>' +
      '<div class="ds-infos-corps">' + corps + '</div>' +
      '</section>'
    )
  }

  function formulaireContact() {
    if (etatContact.ok) {
      return '<p style="margin-top:18px;padding:14px;border:1px solid currentColor;border-radius:10px">Message envoyé. Le vendeur vous répond par email.</p>'
    }
    var champ = 'display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:10px 12px;border:1px solid rgba(127,127,127,.5);border-radius:8px;font:inherit;background:transparent;color:inherit'
    return (
      '<form data-contact style="margin-top:18px">' +
      '<input name="nom" required minlength="2" maxlength="120" placeholder="Nom" style="' + champ + '" />' +
      '<input name="email" type="email" required maxlength="200" placeholder="Email" style="' + champ + '" />' +
      '<input name="sujet" maxlength="120" placeholder="Sujet (commande, retour, question…)" style="' + champ + '" />' +
      '<textarea name="message" required minlength="5" maxlength="4000" rows="6" placeholder="Votre message" style="' + champ + '"></textarea>' +
      (etatContact.erreur ? '<p style="color:#d33">' + esc(etatContact.erreur) + '</p>' : '') +
      '<button type="submit"' + (etatContact.envoi ? ' disabled' : '') + ' style="padding:10px 18px;border-radius:8px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;cursor:pointer">' +
      (etatContact.envoi ? 'Envoi…' : 'Envoyer') + '</button>' +
      '</form>'
    )
  }

  /** Branche le formulaire de contact. `apres` re-rend l'écran. */
  function brancher(base, apres) {
    document.addEventListener('submit', function (e) {
      var form = e.target
      if (!form || !form.matches || !form.matches('form[data-contact]')) return
      e.preventDefault()
      var fd = new FormData(form)
      var corps = {}
      ;['nom', 'email', 'sujet', 'message'].forEach(function (k) { var v = String(fd.get(k) || '').trim(); if (v) corps[k] = v })
      etatContact = { envoi: true, ok: false, erreur: null }
      apres()
      fetch(base + '/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j || {} } }) })
        .then(function (r) {
          if (!r.ok) throw new Error(r.j.error || "Le message n'a pas pu partir.")
          etatContact = { envoi: false, ok: true, erreur: null }
          apres()
        })
        .catch(function (err) {
          etatContact = { envoi: false, ok: false, erreur: err.message }
          apres()
        })
    })
  }

  /* Un bout de balise qui fuit dans le texte : « ">Ajouter au panier ». */
  var FUITE = /^(\s*)["']\s*\/?>\s*/

  function reparer(racine) {
    if (!racine) return
    // 1. Texte qui commence par `">` : reste d'un attribut mal fermé par le modèle.
    var w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, null)
    var n
    var fautifs = []
    while ((n = w.nextNode())) if (FUITE.test(n.nodeValue)) fautifs.push(n)
    fautifs.forEach(function (t) { t.nodeValue = t.nodeValue.replace(FUITE, '$1') })

    // 2. Liens morts dont le libellé désigne une page légale.
    var liens = racine.querySelectorAll('a')
    for (var i = 0; i < liens.length; i++) {
      var a = liens[i]
      var href = (a.getAttribute('href') || '').trim()
      if (/^#\/(infos|p|c|panier|commande|merci)\b/.test(href)) continue
      if (href && !/^(#|#\/|#\/boutique|#\/accueil|javascript:.*)$/i.test(href)) continue
      var cible = pagePour(a.textContent)
      if (cible) a.setAttribute('href', '#/infos/' + cible)
    }

    // 3. Chaque page légale doit être joignable : celles sans lien vont dans une ligne discrète en pied.
    var manquantes = PAGES.filter(function (p) { return !racine.querySelector('a[href="#/infos/' + p.slug + '"]') })
    if (manquantes.length && !racine.querySelector('[data-dropshop-legal]')) {
      var barre = document.createElement('nav')
      barre.setAttribute('data-dropshop-legal', '')
      barre.setAttribute('style', 'text-align:center;font-size:12px;padding:14px 10px;opacity:.8')
      barre.innerHTML = manquantes.map(function (p) {
        return '<a href="#/infos/' + p.slug + '" style="color:inherit;margin:0 8px">' + esc(p.slug === 'cgv' ? 'Conditions de vente' : p.titre) + '</a>'
      }).join('')
      var pieds = racine.querySelectorAll('footer')
      var pied = pieds.length ? pieds[pieds.length - 1] : null
      ;(pied || racine).appendChild(barre)
    }
  }

  window.DropShopInfos = { pages: PAGES, charger: charger, rendre: rendre, brancher: brancher, reparer: reparer, pagePour: pagePour }
})()
