/*
 * DropShop — le moteur d'une boutique écrite par l'IA (17/09/2026).
 *
 * La page de la boutique est écrite par le modèle, unique à chaque marchand :
 * sa mise en page, ses couleurs, ses polices, ses textes, ses animations. Ce
 * fichier est ce qu'elle ne réécrit JAMAIS : le catalogue vivant lu depuis
 * DropShipper, la navigation, le panier, la commande, le paiement, la
 * confirmation. La page décrit des ÉCRANS (des fonctions qui rendent du HTML) ;
 * le moteur décide QUAND les afficher et QUOI leur donner.
 *
 * Le contrat, en entier — c'est aussi ce que lit le modèle :
 *
 *   DropShop.pages({
 *     cadre:       (c, contenu) => html,   // en-tête + contenu + pied, sur tous les écrans
 *     accueil:     (c) => html,
 *     boutique:    (c, { produits, recherche }) => html,
 *     categorie:   (c, categorie) => html,   // categorie = { nom, slug, nombre, image, produits }
 *     produit:     (c, produit) => html,
 *     panier:      (c) => html,
 *     commande:    (c) => html,              // doit contenir <form data-commande> (voir plus bas)
 *     merci:       (c) => html,
 *     introuvable: (c) => html,
 *   })
 *   DropShop.apres(fn)   // fn(page, c) appelée après chaque rendu (animations, carrousels)
 *
 * Le contexte `c` passé à chaque écran :
 *   c.boutique     { nom, slug, adresse, logoEntete, logoAccueil, annonce, accroche, accrocheSuite, sousTitre, fraisPort, portOffertDes }
 *   c.produits     tous les produits  { id, title, description, price, currency, images[], bulletPoints[], attributes{}, category, video, variants, ean, reviews }
 *   c.nouveautes   les 8 derniers
 *   c.categories   [{ nom, slug, nombre, image }]  créées depuis le catalogue
 *   c.produit(id)  c.parCategorie(slug)  c.rechercher(texte)  c.categorieDe(produit) → { nom, slug }
 *   c.panier       { lignes: [{ produit, quantite, total }], nombre, sousTotal, port, total, vide }
 *   c.prix(n)      « 24,90 € »        c.html(s)  échappe        c.photo(produit, i)  adresse d'une photo (ou vide)
 *   c.lien         { accueil, boutique, categorie(slug), produit(id), panier, commande, recherche(q) }
 *   c.route        { page, param }
 *   c.commande     { erreur, envoi, paiement: 'stripe' | 'sans' }
 *   c.merci        { nombre, paye, attente }
 *
 * Les gestes, reconnus par attribut — le moteur les branche lui-même, la page
 * n'écrit aucun gestionnaire d'événement :
 *   [data-ajouter="id"]   ajoute au panier (quantité : attribut data-quantite, ou l'input [data-quantite-pour="id"])
 *   [data-retirer="id"]   [data-plus="id"]   [data-moins="id"]   [data-vider]
 *   <form data-commande>  champs name, email, street, zip, city, phone (country facultatif)
 *   [data-recherche]      un <input> : Entrée mène à la boutique filtrée
 *   [data-mode="x"]       pose data-theme="x" sur <html> et s'en souvient (modes visiteur)
 *
 * Les adresses : #/  #/boutique  #/boutique?q=…  #/c/<slug>  #/p/<id>  #/panier  #/commande  #/merci
 */
;(function () {
  'use strict'

  var CONF = window.BOUTIQUE || {}
  var base = (CONF.api || '') + '/api/public/shops/' + (CONF.shopKey || '')
  var CLE_PANIER = 'dropshop-panier-' + (CONF.shopKey || 'x')
  var CLE_MODE = 'dropshop-mode-' + (CONF.shopKey || 'x')

  var ecrans = {}
  var apresRendu = []
  var apparence = null
  var produits = []
  var etatCommande = { erreur: null, envoi: false, paiement: 'sans' }
  var etatMerci = { nombre: 0, paye: false, attente: false }
  var pageCourante = null
  var pret = false

  /* ---------- Outils ---------- */
  function html(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }
  function prix(p) {
    var n = Number(p)
    if (isNaN(n)) return ''
    // « 2 990,00 € » et non « 2990,00 € » : l'espace fine des milliers, comme
    // sur n'importe quel ticket français. Vu sur la première boutique réelle.
    var parts = n.toFixed(2).split('.')
    var entier = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
    return entier + ',' + parts[1] + ' €'
  }
  function slug(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'divers'
  }
  function photoAbsolue(u) {
    if (!u) return ''
    return u.indexOf('http') === 0 ? u : (CONF.api || '') + (u.charAt(0) === '/' ? '' : '/') + u
  }
  function photo(p, i) {
    if (!p || !p.images || !p.images.length) return ''
    return photoAbsolue(p.images[Math.min(i || 0, p.images.length - 1)])
  }

  /* ---------- Catégories : la sous-catégorie quand il y en a une, le rayon sinon ---------- */
  function categorieDe(p) {
    var chemin = String((p && p.category) || '').split('>').map(function (s) { return s.trim() }).filter(Boolean)
    var nom = chemin.length ? chemin[chemin.length - 1] : 'Divers'
    return { nom: nom, slug: slug(nom) }
  }
  function categories() {
    var parSlug = {}
    var ordre = []
    produits.forEach(function (p) {
      var c = categorieDe(p)
      if (!parSlug[c.slug]) {
        parSlug[c.slug] = { nom: c.nom, slug: c.slug, nombre: 0, image: photo(p, 0) }
        ordre.push(c.slug)
      }
      parSlug[c.slug].nombre++
      if (!parSlug[c.slug].image) parSlug[c.slug].image = photo(p, 0)
    })
    return ordre.map(function (s) { return parSlug[s] }).sort(function (a, b) { return b.nombre - a.nombre })
  }
  function parCategorie(s) {
    return produits.filter(function (p) { return categorieDe(p).slug === s })
  }
  function parId(id) {
    for (var i = 0; i < produits.length; i++) if (produits[i].id === id) return produits[i]
    return null
  }
  function rechercher(q) {
    var mots = String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean)
    if (!mots.length) return produits.slice()
    return produits.filter(function (p) {
      var t = (p.title + ' ' + (p.description || '') + ' ' + (p.category || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      return mots.every(function (m) { return t.indexOf(m) >= 0 })
    })
  }

  /* ---------- Panier ---------- */
  function lirePanier() {
    try { return JSON.parse(localStorage.getItem(CLE_PANIER) || '[]') } catch (e) { return [] }
  }
  function ecrirePanier(p) {
    try { localStorage.setItem(CLE_PANIER, JSON.stringify(p)) } catch (e) {}
  }
  function panierVue() {
    var contenu = (apparence && apparence.contenu) || {}
    var fraisPort = Number(contenu.fraisPort != null ? contenu.fraisPort : 4.9)
    var offertDes = Number(contenu.portOffertDes != null ? contenu.portOffertDes : 79)
    var lignes = []
    lirePanier().forEach(function (l) {
      var p = parId(l.productId)
      if (p) lignes.push({ produit: p, quantite: l.quantity, total: Math.round(Number(p.price) * l.quantity * 100) / 100 })
    })
    var sousTotal = Math.round(lignes.reduce(function (s, l) { return s + l.total }, 0) * 100) / 100
    var port = lignes.length === 0 || sousTotal >= offertDes ? 0 : fraisPort
    return {
      lignes: lignes,
      nombre: lignes.reduce(function (s, l) { return s + l.quantite }, 0),
      sousTotal: sousTotal,
      port: port,
      total: Math.round((sousTotal + port) * 100) / 100,
      vide: lignes.length === 0,
    }
  }
  function ajouter(id, quantite) {
    if (!parId(id)) return
    var p = lirePanier()
    var q = Math.max(1, Math.min(20, Number(quantite) || 1))
    var ligne = null
    for (var i = 0; i < p.length; i++) if (p[i].productId === id) ligne = p[i]
    if (ligne) ligne.quantity = Math.min(20, ligne.quantity + q)
    else p.push({ productId: id, quantity: q })
    ecrirePanier(p)
  }
  function quantite(id, delta) {
    var p = lirePanier()
    for (var i = 0; i < p.length; i++) {
      if (p[i].productId !== id) continue
      p[i].quantity = Math.min(20, p[i].quantity + delta)
      if (p[i].quantity <= 0) p.splice(i, 1)
      break
    }
    ecrirePanier(p)
  }
  function retirer(id) {
    ecrirePanier(lirePanier().filter(function (l) { return l.productId !== id }))
  }

  /* ---------- Modes visiteur ---------- */
  function poserMode(m) {
    if (!m) return
    document.documentElement.setAttribute('data-theme', m)
    try { localStorage.setItem(CLE_MODE, m) } catch (e) {}
  }
  try { var memo = localStorage.getItem(CLE_MODE); if (memo) poserMode(memo) } catch (e) {}

  /* ---------- Routage ---------- */
  function lireRoute() {
    var h = (location.hash || '#/').replace(/^#/, '')
    var q = ''
    var i = h.indexOf('?')
    if (i >= 0) { q = h.slice(i + 1); h = h.slice(0, i) }
    var params = {}
    q.split('&').forEach(function (kv) {
      if (!kv) return
      var eq = kv.indexOf('=')
      var k = decodeURIComponent(eq >= 0 ? kv.slice(0, eq) : kv)
      params[k] = decodeURIComponent((eq >= 0 ? kv.slice(eq + 1) : '').replace(/\+/g, ' '))
    })
    var m
    if (h === '/' || h === '') return { page: 'accueil', param: null, params: params }
    if (h === '/boutique') return { page: 'boutique', param: params.q || '', params: params }
    if ((m = /^\/c\/(.+)$/.exec(h))) return { page: 'categorie', param: decodeURIComponent(m[1]), params: params }
    if ((m = /^\/p\/(.+)$/.exec(h))) return { page: 'produit', param: decodeURIComponent(m[1]), params: params }
    if (h === '/panier') return { page: 'panier', param: null, params: params }
    if (h === '/commande') return { page: 'commande', param: null, params: params }
    if (h === '/merci') return { page: 'merci', param: null, params: params }
    return { page: 'introuvable', param: h, params: params }
  }
  var lien = {
    accueil: '#/',
    boutique: '#/boutique',
    categorie: function (s) { return '#/c/' + encodeURIComponent(s) },
    produit: function (id) { return '#/p/' + encodeURIComponent(id) },
    panier: '#/panier',
    commande: '#/commande',
    recherche: function (q) { return '#/boutique?q=' + encodeURIComponent(q || '') },
  }

  function contexte(route) {
    var b = (apparence && apparence.boutique) || {}
    var contenu = (apparence && apparence.contenu) || {}
    return {
      boutique: {
        nom: b.nom || (CONF.nom || 'Boutique'),
        slug: CONF.slug || '',
        adresse: location.origin + location.pathname,
        logoEntete: b.logoEntete || b.logo || null,
        logoAccueil: b.logoAccueil || null,
        annonce: contenu.annonce || '',
        accroche: contenu.accroche || '',
        accrocheSuite: contenu.accrocheSuite || '',
        sousTitre: contenu.sousTitre || '',
        fraisPort: Number(contenu.fraisPort != null ? contenu.fraisPort : 4.9),
        portOffertDes: Number(contenu.portOffertDes != null ? contenu.portOffertDes : 79),
      },
      produits: produits,
      nouveautes: produits.slice(0, 8),
      categories: categories(),
      produit: parId,
      parCategorie: parCategorie,
      rechercher: rechercher,
      categorieDe: categorieDe,
      panier: panierVue(),
      prix: prix,
      html: html,
      photo: photo,
      lien: lien,
      route: { page: route.page, param: route.param },
      commande: { erreur: etatCommande.erreur, envoi: etatCommande.envoi, paiement: etatCommande.paiement },
      merci: { nombre: etatMerci.nombre, paye: etatMerci.paye, attente: etatMerci.attente },
    }
  }

  function ecran(nom, c, arg) {
    var f = ecrans[nom]
    if (typeof f !== 'function') {
      return '<section style="padding:40px 20px"><p>Écran « ' + html(nom) + ' » non décrit.</p></section>'
    }
    return f(c, arg)
  }

  /*
   * Le logo est POSÉ PAR LE MOTEUR, comme le panier.
   *
   * La page est écrite une fois, par le modèle, à partir de ce que la boutique
   * avait ce jour-là. Un marchand qui dépose son logo APRÈS la création ne
   * voyait donc rien changer : le fichier partait bien, `/theme` le servait
   * bien, et la page n'avait tout simplement aucune balise pour l'afficher.
   * Rien n'échouait, rien ne le disait, et la seule réparation était de
   * réécrire la boutique — 350 drops pour un logo.
   *
   * C'est la même règle que pour le panier : ce qui est mécanique appartient au
   * moteur, la page ne décrit que ce qui lui est propre. Une page qui affiche
   * déjà le logo n'est pas touchée (on reconnaît son adresse dans un `<img>`) ;
   * une page qui ne l'affiche pas le reçoit.
   */
  function poserLogos(c, route) {
    var app = document.getElementById('app')
    if (!app) return

    function dejaLa(src) {
      var imgs = app.querySelectorAll('img')
      for (var i = 0; i < imgs.length; i++) {
        // getAttribute plutôt que .src : le navigateur résout .src en absolu.
        if ((imgs[i].getAttribute('src') || '') === src) return true
      }
      return false
    }

    if (c.boutique.logoEntete && !dejaLa(c.boutique.logoEntete)) {
      var img = document.createElement('img')
      img.src = c.boutique.logoEntete
      img.alt = c.boutique.nom
      img.style.cssText = 'height:38px;width:auto;max-width:200px;object-fit:contain;vertical-align:middle'
      var barre = app.querySelector('header')
      if (barre) {
        // Dans la barre, à côté du nom : le premier lien vers l'accueil est
        // l'enseigne dans toutes les pages écrites jusqu'ici.
        var enseigne = barre.querySelector('a[href="#/"], a[href$="#/"]')
        var hote = document.createElement('span')
        hote.style.cssText = 'display:inline-flex;align-items:center;gap:10px'
        hote.appendChild(img)
        if (enseigne && enseigne.parentNode) enseigne.parentNode.insertBefore(hote, enseigne)
        else barre.insertBefore(hote, barre.firstChild)
      } else {
        var bandeau = document.createElement('div')
        bandeau.style.cssText = 'padding:14px 20px'
        bandeau.appendChild(img)
        app.insertBefore(bandeau, app.firstChild)
      }
    }

    if (route.page === 'accueil' && c.boutique.logoAccueil && !dejaLa(c.boutique.logoAccueil)) {
      var grand = document.createElement('img')
      grand.src = c.boutique.logoAccueil
      grand.alt = c.boutique.nom
      grand.style.cssText =
        'display:block;margin:0 auto 24px;width:clamp(180px,30vw,460px);height:auto;object-fit:contain'
      // Au-dessus du titre du héros, c'est-à-dire du premier titre de la page.
      var titre = app.querySelector('h1')
      if (titre && titre.parentNode) titre.parentNode.insertBefore(grand, titre)
      else app.insertBefore(grand, app.firstChild)
    }
  }

  function rendre() {
    if (!pret) return
    var app = document.getElementById('app')
    if (!app) return
    var route = lireRoute()
    var c = contexte(route)
    var contenu
    try {
      switch (route.page) {
        case 'accueil': contenu = ecran('accueil', c); break
        case 'boutique': contenu = ecran('boutique', c, { produits: rechercher(route.param), recherche: route.param || '' }); break
        case 'categorie': {
          var cat = null
          c.categories.forEach(function (k) { if (k.slug === route.param) cat = k })
          if (!cat) { contenu = ecran('introuvable', c) } else {
            cat.produits = parCategorie(cat.slug)
            contenu = ecran('categorie', c, cat)
          }
          break
        }
        case 'produit': {
          var p = parId(route.param)
          contenu = p ? ecran('produit', c, p) : ecran('introuvable', c)
          break
        }
        case 'panier': contenu = ecran('panier', c); break
        case 'commande': contenu = c.panier.vide && !etatCommande.envoi ? ecran('panier', c) : ecran('commande', c); break
        case 'merci': contenu = ecran('merci', c); break
        default: contenu = ecran('introuvable', c)
      }
      app.innerHTML = typeof ecrans.cadre === 'function' ? ecrans.cadre(c, contenu || '', route.page) : contenu || ''
    } catch (e) {
      app.innerHTML = '<section style="padding:40px 20px;font-family:system-ui"><p>Cette page a rencontré un problème d\'affichage.</p></section>'
      if (window.console) console.error('[dropshop] rendu', e)
    }
    // Après l'écriture de la page, jamais avant : on regarde ce qu'elle affiche
    // réellement pour ne poser que ce qui manque.
    try { poserLogos(c, route) } catch (e) { if (window.console) console.error('[dropshop] logos', e) }
    if (pageCourante !== route.page + '/' + route.param) {
      pageCourante = route.page + '/' + route.param
      try { window.scrollTo(0, 0) } catch (e) {}
    }
    var titre = c.boutique.nom
    if (route.page === 'produit' && parId(route.param)) titre = parId(route.param).title + ' — ' + titre
    document.title = titre
    apresRendu.forEach(function (fn) { try { fn(route.page, c) } catch (e) { if (window.console) console.error('[dropshop] apres', e) } })
  }

  /* ---------- Gestes ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target : null
    if (!el) return
    var t
    if ((t = el.closest('[data-ajouter]'))) {
      e.preventDefault()
      var id = t.getAttribute('data-ajouter')
      var q = Number(t.getAttribute('data-quantite'))
      var champ = document.querySelector('[data-quantite-pour="' + id + '"]')
      if (champ && champ.value) q = Number(champ.value)
      ajouter(id, q || 1)
      var libelle = t.getAttribute('data-ajoute') || 'Ajouté ✓'
      var avant = t.innerHTML
      t.innerHTML = html(libelle)
      setTimeout(function () { if (t.isConnected) t.innerHTML = avant }, 1200)
      rendre()
      return
    }
    if ((t = el.closest('[data-retirer]'))) { e.preventDefault(); retirer(t.getAttribute('data-retirer')); rendre(); return }
    if ((t = el.closest('[data-plus]'))) { e.preventDefault(); quantite(t.getAttribute('data-plus'), 1); rendre(); return }
    if ((t = el.closest('[data-moins]'))) { e.preventDefault(); quantite(t.getAttribute('data-moins'), -1); rendre(); return }
    if ((t = el.closest('[data-vider]'))) { e.preventDefault(); ecrirePanier([]); rendre(); return }
    if ((t = el.closest('[data-mode]'))) { e.preventDefault(); poserMode(t.getAttribute('data-mode')); rendre(); return }
  })
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return
    var el = e.target
    if (el && el.matches && el.matches('[data-recherche]')) {
      e.preventDefault()
      location.hash = lien.recherche(el.value)
    }
  })
  document.addEventListener('submit', function (e) {
    var form = e.target
    if (!form || !form.matches || !form.matches('form[data-commande]')) return
    e.preventDefault()
    var fd = new FormData(form)
    var val = function (k) { return String(fd.get(k) || '').trim() }
    var buyer = { name: val('name'), street: val('street'), zip: val('zip'), city: val('city') }
    if (val('email')) buyer.email = val('email')
    if (val('phone')) buyer.phone = val('phone')
    if (val('country')) buyer.country = val('country')
    if (buyer.name.length < 2 || buyer.street.length < 3 || buyer.zip.length < 2 || !buyer.city) {
      etatCommande.erreur = 'Vérifiez vos coordonnées : nom, adresse, code postal et ville sont nécessaires.'
      rendre()
      return
    }
    var lignes = lirePanier()
    if (!lignes.length) { location.hash = lien.panier; return }
    etatCommande.envoi = true
    etatCommande.erreur = null
    rendre()
    fetch(base + '/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyer: buyer, lignes: lignes, retour: location.origin + location.pathname }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, corps: j || {} } }) })
      .then(function (r) {
        if (!r.ok) throw new Error(r.corps.error || 'La commande n\'a pas pu partir.')
        if (r.corps.paiement) {
          // Paiement chez Stripe, sur le compte du marchand : le panier se vide
          // au retour, une fois le paiement confirmé — pas avant.
          location.href = r.corps.paiement
          return
        }
        etatMerci = { nombre: panierVue().nombre, paye: false, attente: false }
        ecrirePanier([])
        etatCommande.envoi = false
        location.hash = '#/merci'
      })
      .catch(function (err) {
        etatCommande.envoi = false
        etatCommande.erreur = err.message
        rendre()
      })
  })

  /* ---------- Retour de paiement ---------- */
  function confirmerPaiement() {
    var session = new URLSearchParams(location.search).get('session_id')
    if (!session) return Promise.resolve()
    etatMerci = { nombre: panierVue().nombre, paye: false, attente: true }
    return fetch(base + '/checkout/' + encodeURIComponent(session))
      .then(function (r) { return r.json() })
      .then(function (j) {
        etatMerci.attente = false
        etatMerci.paye = Boolean(j && j.paye)
        if (etatMerci.paye) ecrirePanier([])
      })
      .catch(function () { etatMerci.attente = false })
      .then(function () {
        try { history.replaceState(null, '', location.pathname + '#/merci') } catch (e) {}
        location.hash = '#/merci'
      })
  }

  /* ---------- Chargement ---------- */
  function charger() {
    return Promise.all([
      fetch(base + '/theme').then(function (r) { return r.json() }),
      fetch(base + '/products').then(function (r) { return r.json() }),
    ]).then(function (res) {
      apparence = res[0] || {}
      produits = (res[1] && res[1].products) || []
      if (!apparence.boutique) apparence.boutique = {}
      if (!apparence.boutique.nom) apparence.boutique.nom = (res[1] && res[1].shop && res[1].shop.name) || CONF.nom || 'Boutique'
      etatCommande.paiement = res[1] && res[1].paiement === 'stripe' ? 'stripe' : 'sans'
      // Les logos servis en /storage : absolus, pour un onglet ouvert sur le domaine du vendeur.
      ;['logo', 'logoEntete', 'logoAccueil'].forEach(function (k) {
        if (apparence.boutique[k]) apparence.boutique[k] = photoAbsolue(apparence.boutique[k])
      })
      pret = true
    })
  }

  window.addEventListener('hashchange', rendre)

  var lance = false
  function lancer() {
    if (lance) return
    lance = true
    charger()
      .then(confirmerPaiement)
      .then(rendre)
      .catch(function (e) {
        var app = document.getElementById('app')
        if (app) app.innerHTML = '<section style="padding:60px 20px;text-align:center;font-family:system-ui"><p>La boutique est momentanément indisponible — réessayez dans un instant.</p></section>'
        if (window.console) console.error('[dropshop] chargement', e)
      })
  }

  window.DropShop = {
    pages: function (definition) {
      ecrans = definition || {}
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lancer)
      else lancer()
    },
    apres: function (fn) { if (typeof fn === 'function') apresRendu.push(fn) },
    rendre: rendre,
    prix: prix,
    html: html,
    lien: lien,
    version: '1.0',
  }
})()
