/**
 * Le panneau latéral : choisir une annonce, puis la garder sous les yeux.
 *
 * Ce qu'il remplace : un panneau injecté dans la page, qui disparaissait au
 * premier changement d'écran. Un dépôt Leboncoin en fait quatre — le vendeur
 * choisissait son annonce, passait à l'étape suivante, et la liste avait
 * disparu avec sa sélection.
 *
 * Le panneau latéral de Chrome, lui, vit **à côté** de l'onglet et survit à la
 * navigation. Le vendeur voit son annonce et le formulaire en même temps, ce
 * qui est exactement ce qu'il faut pour relire pendant qu'il remplit.
 *
 * Deux états, et un seul à la fois :
 *
 * - **La liste** tant qu'aucune annonce n'est choisie : photo, titre, prix, un
 *   œil pour regarder, un bouton pour publier.
 * - **L'annonce en grand** dès qu'une publication est commencée, avec le bouton
 *   « Remplir cette étape ». Rien d'autre : montrer la liste à ce moment-là
 *   inviterait à changer d'annonce au milieu d'un dépôt, et le formulaire à
 *   moitié rempli garderait les champs de la première.
 */

const app = document.getElementById('app')

/** Les formulaires de dépôt, par plateforme. */
const CIBLES = {
  VINTED: { label: 'Vinted', url: 'https://www.vinted.fr/items/new' },
  LEBONCOIN: { label: 'Leboncoin', url: 'https://www.leboncoin.fr/deposer-une-annonce' },
  EBAY: { label: 'eBay', url: 'https://www.ebay.fr/sl/sell' },
  FACEBOOK: { label: 'Facebook', url: 'https://www.facebook.com/marketplace/create/item' },
}

/** L'hôte de l'onglet actif décide de la plateforme visée. */
const HOTES = [
  ['vinted', 'VINTED'],
  ['leboncoin', 'LEBONCOIN'],
  ['ebay', 'EBAY'],
  ['facebook', 'FACEBOOK'],
  ['amazon', 'AMAZON'],
  ['cdiscount', 'CDISCOUNT'],
  ['tiktokglobalshop', 'TIKTOK_SHOP'],
  ['merchants.google', 'GOOGLE_SHOPPING'],
]

let annonces = null
let filtre = ''
let photoActive = 0

function echapper(texte) {
  const d = document.createElement('div')
  d.textContent = texte ?? ''
  return d.innerHTML
}

async function jeton() {
  const { token } = await chrome.storage.local.get('token')
  return token
}

async function appel(chemin) {
  const token = await jeton()
  const res = await fetch(`${await getApiBase()}${chemin}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) {
    const corps = await res.json().catch(() => ({}))
    throw new Error(corps.error || `Erreur ${res.status}`)
  }
  return res.json()
}

/** La plateforme de l'onglet regardé, ou `null` hors d'un site connu. */
async function plateformeCourante() {
  const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!onglet?.url) return null
  try {
    const hote = new URL(onglet.url).hostname
    return HOTES.find(([h]) => hote.includes(h))?.[1] ?? null
  } catch {
    return null
  }
}

// --- L'annonce en cours ------------------------------------------------------

/**
 * Montre l'annonce choisie, en grand, et rien d'autre.
 *
 * Le bouton dit « Remplir cette étape » et non « Publier » : sur Leboncoin il
 * sera cliqué quatre fois, une par écran. C'est le vendeur qui dépose — ce clic
 * final publie, il est irréversible, et il ne nous appartient pas.
 */
function montrerEnCours(listing) {
  const photos = listing.images ?? []
  const cible = CIBLES[listing.target]?.label ?? listing.target

  app.innerHTML = `
    <div class="bandeau">
      <span>📝</span>
      <span>Dépôt en cours sur <b>${echapper(cible)}</b> — cliquez à chaque écran.</span>
    </div>

    <div class="grande">
      ${
        photos.length
          ? `<img class="photo" id="photoGrande" src="${echapper(photos[photoActive] ?? photos[0])}" alt="" />
             <div class="vignettes">${photos
               .map(
                 (p, i) =>
                   `<img data-i="${i}" class="${i === photoActive ? 'on' : ''}" src="${echapper(p)}" alt="" />`,
               )
               .join('')}</div>`
          : '<div class="thumb vide" style="width:100%;height:140px">Aucune photo</div>'
      }

      <h2>${echapper(listing.title ?? '')}</h2>
      ${listing.price ? `<div class="price">${echapper(listing.price)} ${echapper(listing.currency ?? 'EUR')}</div>` : ''}

      <div class="detail">
        ${listing.category ? `<h3>Catégorie</h3><p>${echapper(listing.category)}</p>` : ''}
        ${listing.description ? `<h3>Description</h3><p>${echapper(listing.description)}</p>` : ''}
      </div>

      <button class="primary wide" id="remplir" style="margin-top:14px">Remplir cette étape</button>
      <p class="muted" style="margin-top:8px">
        C'est vous qui déposez : l'extension ne clique jamais sur « Publier ».
      </p>
      <p class="link" id="changer">Choisir une autre annonce</p>
    </div>
  `

  app.querySelectorAll('.vignettes img').forEach((img) => {
    img.addEventListener('click', () => {
      photoActive = Number(img.dataset.i)
      montrerEnCours(listing)
    })
  })

  document.getElementById('remplir').addEventListener('click', async () => {
    const bouton = document.getElementById('remplir')
    bouton.disabled = true
    bouton.textContent = 'Remplissage…'
    try {
      const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true })
      await chrome.runtime.sendMessage({
        type: 'dsp-fill-tab',
        platform: listing.target,
        tabId: onglet?.id,
      })
      bouton.textContent = 'Remplir cette étape'
    } catch (err) {
      bouton.textContent = 'Échec — réessayer'
      console.error(err)
    } finally {
      bouton.disabled = false
    }
  })

  document.getElementById('changer').addEventListener('click', async () => {
    await chrome.storage.local.remove('pendingListing')
    photoActive = 0
    demarrer()
  })
}

// --- La liste ----------------------------------------------------------------

function montrerListe(plateforme) {
  const cible = CIBLES[plateforme]
  const besoin = filtre.trim().toLowerCase()
  const visibles = besoin
    ? annonces.filter((p) => (p.aiTitle || p.title || '').toLowerCase().includes(besoin))
    : annonces

  app.innerHTML = `
    ${
      plateforme
        ? `<p class="muted" style="margin:0 0 10px">Choisissez l'annonce à déposer sur <b>${echapper(
            cible?.label ?? plateforme,
          )}</b>.</p>`
        : `<div class="bandeau"><span>ℹ️</span><span>Ouvrez un formulaire de dépôt (Vinted, Leboncoin, eBay) pour remplir une annonce. Vous pouvez déjà la regarder ici.</span></div>`
    }

    <input id="search" type="search" placeholder="Chercher une annonce…" value="${echapper(filtre)}" />

    ${
      visibles.length === 0
        ? `<p class="muted">${
            besoin ? 'Aucune annonce ne correspond.' : 'Aucune annonce pour le moment.'
          }</p>`
        : visibles
            .map((p) => {
              const photo = (p.images ?? [])[0]
              const prix = Number(p.sellingPrice ?? 0).toFixed(2)
              return `
                <div class="card">
                  ${
                    photo
                      ? `<img class="thumb" src="${echapper(photo)}" alt="" />`
                      : '<div class="thumb vide">sans photo</div>'
                  }
                  <div class="body">
                    <div class="title">${echapper(p.aiTitle || p.title)}</div>
                    <div class="price">${prix} ${echapper(p.currency ?? 'EUR')}</div>
                    <div class="row">
                      <button data-voir="${p.id}" title="Ouvrir la fiche dans DropShipper">👁</button>
                      ${
                        plateforme
                          ? `<button class="primary" data-publier="${p.id}">Publier ici</button>`
                          : `<button data-ouvrir="${p.id}">Ouvrir un formulaire</button>`
                      }
                    </div>
                  </div>
                </div>`
            })
            .join('')
    }
  `

  const recherche = document.getElementById('search')
  recherche.addEventListener('input', () => {
    filtre = recherche.value
    const position = recherche.selectionStart
    montrerListe(plateforme)
    // Le champ est recréé à chaque frappe : sans ça, le curseur repart au début
    // et la saisie devient impossible au troisième caractère.
    const suivant = document.getElementById('search')
    suivant.focus()
    suivant.setSelectionRange(position, position)
  })

  app.querySelectorAll('button[data-voir]').forEach((b) => {
    b.addEventListener('click', () =>
      chrome.runtime.sendMessage({ type: 'dsp-open-product', productId: b.dataset.voir }),
    )
  })

  app.querySelectorAll('button[data-publier]').forEach((b) => {
    b.addEventListener('click', () => choisir(b.dataset.publier, plateforme, b))
  })

  app.querySelectorAll('button[data-ouvrir]').forEach((b) => {
    b.addEventListener('click', async () => {
      // Sans plateforme déduite de l'onglet, Vinted est le formulaire le plus
      // courant : mieux vaut en ouvrir un que ne rien faire.
      await choisir(b.dataset.ouvrir, 'VINTED', b, true)
    })
  })
}

/**
 * Retient l'annonce choisie, et bascule le panneau en mode « en cours ».
 *
 * La charge utile vient du serveur et non d'un assemblage fait ici : depuis que
 * le filigrane se pose à l'export, les images brutes du produit sont les
 * originaux, et les envoyer poserait des photos **sans marque** sur Leboncoin.
 */
async function choisir(productId, plateforme, bouton, ouvrirOnglet = false) {
  bouton.disabled = true
  bouton.textContent = '…'
  try {
    const charge = await appel(`/api/products/${productId}/publish-payload`)
    await chrome.storage.local.set({ pendingListing: { target: plateforme, ...charge } })

    if (ouvrirOnglet) {
      await chrome.tabs.create({ url: CIBLES[plateforme].url })
    }
    photoActive = 0
    demarrer()
  } catch (err) {
    bouton.disabled = false
    bouton.textContent = 'Erreur'
    console.error(err)
  }
}

// --- Le démarrage ------------------------------------------------------------

async function demarrer() {
  const token = await jeton()
  if (!token) {
    app.innerHTML =
      '<p class="muted">Connectez-vous depuis l\'icône de l\'extension, puis rouvrez ce panneau.</p>'
    return
  }

  // Une publication déjà commencée prime sur tout : c'est ce que le vendeur est
  // en train de faire.
  const { pendingListing } = await chrome.storage.local.get('pendingListing')
  if (pendingListing) return montrerEnCours(pendingListing)

  const plateforme = await plateformeCourante()

  if (!annonces) {
    app.innerHTML = '<p class="muted">Chargement des annonces…</p>'
    try {
      annonces = await appel('/api/products')
    } catch (err) {
      app.innerHTML = `<p class="error">${echapper(err.message)}</p>`
      return
    }
  }

  montrerListe(plateforme)
}

/*
 * Le panneau se remet à jour quand l'annonce en cours change.
 *
 * Le launcher de la page peut la poser, le vendeur peut l'abandonner depuis un
 * autre onglet : sans cette écoute, le panneau afficherait encore la liste
 * pendant qu'un dépôt est commencé ailleurs.
 */
chrome.storage.onChanged.addListener((changements, zone) => {
  if (zone === 'local' && changements.pendingListing) demarrer()
})

demarrer()
