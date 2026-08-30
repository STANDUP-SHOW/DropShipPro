/**
 * Shared form-filling helpers for the per-platform content scripts.
 *
 * These sites are React/Vue apps, so assigning `input.value` directly is ignored:
 * the framework tracks its own state and overwrites the DOM on the next render.
 * setNativeValue calls the underlying value setter and dispatches the events the
 * framework actually listens to, which is what makes the value stick.
 */

function setNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter ? setter.call(el, value) : (el.value = value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Waits for a selector to appear — these forms render progressively after load. */
function waitFor(selector, timeout = 15000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector)
    if (existing) return resolve(existing)

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)
  })
}

/** Tries several selectors in order and fills the first one that exists. */
async function fillFirst(selectors, value) {
  if (!value) return false
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (el) {
      setNativeValue(el, value)
      return true
    }
  }
  const el = await waitFor(selectors[0], 5000)
  if (el) {
    setNativeValue(el, value)
    return true
  }
  return false
}

/**
 * Injects downloaded images into a file input. Browsers forbid setting
 * input.files directly, but a DataTransfer holding real File objects is accepted
 * and is the same mechanism a drag-and-drop uses.
 */
async function attachImages(fileInput, imageUrls) {
  if (!fileInput || !imageUrls?.length) return 0
  const dt = new DataTransfer()
  let count = 0
  for (const [i, url] of imageUrls.entries()) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const blob = await res.blob()
      dt.items.add(new File([blob], `photo-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' }))
      count++
    } catch {
      // Skip images that fail to download rather than aborting the whole fill.
    }
  }
  if (!count) return 0
  fileInput.files = dt.files
  fileInput.dispatchEvent(new Event('change', { bubbles: true }))
  return count
}

/** Small on-page banner so the user sees what was filled and what needs manual work. */
function showBanner(message, tone = 'info') {
  document.getElementById('dsp-banner')?.remove()
  const bar = document.createElement('div')
  bar.id = 'dsp-banner'
  bar.textContent = message
  Object.assign(bar.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '2147483647',
    padding: '10px 16px',
    font: '600 13px system-ui, sans-serif',
    color: '#fff',
    background: tone === 'error' ? '#dc2626' : 'linear-gradient(90deg, #a855f7, #ec4899)',
    textAlign: 'center',
  })
  document.body.appendChild(bar)
  setTimeout(() => bar.remove(), 9000)
}

/** Reads and clears the listing queued by the popup, so a reload doesn't refill. */
async function consumePendingListing(expectedTarget) {
  const { pendingListing } = await chrome.storage.local.get('pendingListing')
  if (!pendingListing || pendingListing.target !== expectedTarget) return null
  await chrome.storage.local.remove('pendingListing')
  return pendingListing
}

/**
 * Lit l'annonce en attente sans la consommer.
 *
 * `consumePendingListing` l'effaçait au premier chargement. Sur Leboncoin, ce
 * premier chargement est l'étape « choisissez une catégorie » — il n'y a aucun
 * champ à remplir, et l'annonce était déjà perdue quand le vendeur arrivait au
 * formulaire. D'où « rien ne fonctionne ».
 *
 * L'annonce reste donc en réserve tant que le vendeur ne l'a pas relâchée.
 */
async function peekPendingListing(expectedTarget) {
  const { pendingListing } = await chrome.storage.local.get('pendingListing')
  if (!pendingListing || pendingListing.target !== expectedTarget) return null
  return pendingListing
}

/** Relâche l'annonce : le vendeur a fini, ou il a fermé le bouton. */
async function releasePendingListing() {
  await chrome.storage.local.remove('pendingListing')
}

/**
 * Le bouton qui reste, d'une étape à l'autre.
 *
 * Un dépôt d'annonce se fait en plusieurs pages — catégorie, description,
 * photos, prix, contact — et une page suivante n'est pas un rechargement : le
 * script du navigateur ne repart pas. Un remplissage lancé une seule fois au
 * chargement ne pouvait donc atteindre qu'une seule de ces pages, et pas la
 * bonne.
 *
 * Le bouton flotte au-dessus de la page, survit aux changements d'étape, et
 * remplit **ce qui est là maintenant**. Le vendeur clique à chaque étape ; c'est
 * lui qui décide, et c'est lui qui appuiera sur « Publier ».
 *
 * @param {object} options
 * @param {string} options.titre       Ce qu'annonce le bouton.
 * @param {() => Promise<{rempli: string[], manque: string[]}>} options.remplir
 */
function monterBoutonRemplissage({ titre, remplir, onFermer, listing }) {
  document.getElementById('dsp-fill-widget')?.remove()

  const boite = document.createElement('div')
  boite.id = 'dsp-fill-widget'
  Object.assign(boite.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    alignItems: 'flex-end',
    fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  })

  const etat = document.createElement('div')
  Object.assign(etat.style, {
    maxWidth: '320px',
    padding: '8px 12px',
    borderRadius: '10px',
    background: 'rgba(17, 12, 34, 0.94)',
    color: '#e5e7eb',
    fontSize: '12px',
    lineHeight: '1.45',
    boxShadow: '0 6px 24px rgba(0,0,0,.35)',
    display: 'none',
  })

  const rangee = document.createElement('div')
  Object.assign(rangee.style, { display: 'flex', gap: '6px', alignItems: 'center' })

  const bouton = document.createElement('button')
  bouton.type = 'button'
  bouton.textContent = titre
  Object.assign(bouton.style, {
    padding: '11px 18px',
    borderRadius: '999px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    color: '#fff',
    background: 'linear-gradient(90deg,#a855f7,#ec4899)',
    boxShadow: '0 6px 24px rgba(168,85,247,.45)',
  })

  const fermer = document.createElement('button')
  fermer.type = 'button'
  fermer.textContent = '✕'
  fermer.title = "J'ai fini : ne plus proposer"
  Object.assign(fermer.style, {
    width: '30px',
    height: '30px',
    borderRadius: '999px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#9ca3af',
    background: 'rgba(17, 12, 34, 0.94)',
  })

  const dire = (message, ton = 'info') => {
    etat.textContent = message
    etat.style.display = 'block'
    etat.style.color = ton === 'error' ? '#fca5a5' : ton === 'ok' ? '#a7f3d0' : '#e5e7eb'
  }

  bouton.addEventListener('click', async () => {
    bouton.disabled = true
    const avant = bouton.textContent
    bouton.textContent = 'Remplissage…'
    try {
      const { rempli, manque } = await remplir()
      if (!rempli.length) {
        /*
         * Rien rempli : on montre ce que la page contient.
         *
         * Sans ce releve, un formulaire qui a change de noms de champs donne un
         * echec muet, et il faut ouvrir l inspecteur pour comprendre. Avec lui,
         * le vendeur copie trois lignes et la correction est immediate.
         */
        const champs = releverChampsVisibles()
        dire(
          champs.length
            ? 'Aucun de nos champs sur cette etape. Champs vus ici — copiez-les pour nous : ' +
              champs.join(' | ')
            : "Aucun champ a remplir sur cette etape. Passez a la suivante et recliquez.",
          'error',
        )
      } else {
        dire(
          `Rempli : ${rempli.join(', ') || 'rien'}.` +
            (manque.length ? ` Pas trouvé ici : ${manque.join(', ')}.` : ''),
          manque.length ? 'info' : 'ok',
        )
      }
    } catch (e) {
      dire(`Remplissage impossible : ${e?.message || e}`, 'error')
    } finally {
      bouton.textContent = avant
      bouton.disabled = false
    }
  })

  fermer.addEventListener('click', async () => {
    boite.remove()
    await onFermer?.()
  })

  rangee.append(bouton, fermer)
  boite.append(etat, rangee)
  document.body.appendChild(boite)

  // L apercu de l annonce, au survol : au troisieme formulaire, le vendeur ne
  // sait plus laquelle il depose, et rien ne le lui dit.
  const apercu = listing ? monterApercu(boite, listing) : null
  if (apercu) {
    bouton.addEventListener('mouseenter', () => { apercu.style.display = 'flex' })
    bouton.addEventListener('mouseleave', () => { apercu.style.display = 'none' })
    bouton.addEventListener('focus', () => { apercu.style.display = 'flex' })
    bouton.addEventListener('blur', () => { apercu.style.display = 'none' })
  }

  /*
   * Le bouton se remet en place quand l'étape change.
   *
   * Un formulaire multi-étapes remonte souvent tout son DOM, et emporte le
   * bouton avec. Sans cette surveillance, il disparaît à la deuxième page —
   * exactement là où il devient utile.
   */
  const gardien = new MutationObserver(() => {
    if (!document.getElementById('dsp-fill-widget')) document.body.appendChild(boite)
  })
  gardien.observe(document.body, { childList: true })

  return { dire }
}

/**
 * L'aperçu de l'annonce, au survol du bouton.
 *
 * Un vendeur qui dépose sur Leboncoin a quitté DropShipper depuis plusieurs
 * écrans. Au troisième formulaire, il ne sait plus laquelle de ses annonces il
 * est en train de déposer — et il n'y a aucun moyen de le vérifier sans tout
 * abandonner pour revenir en arrière.
 *
 * Le survol la lui remet sous les yeux : la photo, le titre, le prix. Au survol
 * et non en permanence, parce qu'un encart posé sur un formulaire qu'on remplit
 * gêne plus qu'il n'aide.
 */
function monterApercu(boite, listing) {
  const carte = document.createElement('div')
  Object.assign(carte.style, {
    maxWidth: '300px',
    padding: '10px',
    borderRadius: '12px',
    background: 'rgba(17, 12, 34, 0.97)',
    boxShadow: '0 8px 30px rgba(0,0,0,.45)',
    display: 'none',
    gap: '10px',
    alignItems: 'flex-start',
    color: '#e5e7eb',
    fontSize: '12px',
    lineHeight: '1.4',
  })

  const photo = listing.images?.[0]
  if (photo) {
    const img = document.createElement('img')
    img.src = photo
    img.alt = ''
    Object.assign(img.style, {
      width: '64px',
      height: '64px',
      objectFit: 'cover',
      borderRadius: '8px',
      flexShrink: '0',
    })
    carte.appendChild(img)
  }

  const texte = document.createElement('div')
  texte.style.minWidth = '0'

  const titre = document.createElement('div')
  titre.textContent = listing.title || 'Annonce'
  Object.assign(titre.style, { fontWeight: '600', marginBottom: '3px', color: '#fff' })

  const prix = document.createElement('div')
  prix.textContent = listing.price ? `${listing.price} €` : ''
  Object.assign(prix.style, { color: '#d8b4fe', fontWeight: '600' })

  const lignes = document.createElement('div')
  lignes.textContent = [
    listing.category || '',
    listing.images?.length ? `${listing.images.length} photo(s)` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  Object.assign(lignes.style, { color: '#9ca3af', marginTop: '3px' })

  texte.append(titre, prix, lignes)
  carte.appendChild(texte)
  boite.insertBefore(carte, boite.firstChild)

  return carte
}

/**
 * Ce que la page contient vraiment, quand rien n'a été trouvé.
 *
 * Les sélecteurs d'un formulaire tiers sont des suppositions : personne chez
 * Leboncoin ne nous prévient quand ils changent un `name`, et une place de
 * marché refait son dépôt d'annonce une ou deux fois par an. Un remplissage qui
 * échoue en disant seulement « rien trouvé » ne mène nulle part — il faut
 * revenir, ouvrir l'inspecteur, et deviner.
 *
 * Ce relevé transforme un échec en information : le vendeur le copie, et les
 * vrais sélecteurs sont dans le message. La correction suivante ne devine plus.
 */
function releverChampsVisibles() {
  const champs = [...document.querySelectorAll('input, textarea, select')]
    .filter((el) => {
      if (el.type === 'hidden') return false
      const r = el.getBoundingClientRect()
      // Un champ de zéro pixel appartient à une étape masquée : le relever
      // noierait les vrais sous cent faux.
      return r.width > 0 && r.height > 0
    })
    .slice(0, 25)
    .map((el) => {
      const bout = [el.tagName.toLowerCase()]
      if (el.type && el.tagName === 'INPUT') bout.push(`[${el.type}]`)
      for (const attr of ['name', 'id', 'data-testid', 'data-qa-id', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(attr)
        if (v) bout.push(`${attr}="${v.slice(0, 40)}"`)
      }
      return bout.join(' ')
    })

  return champs
}

/**
 * Renseigne un champ **et le quitte**, comme le ferait une main.
 *
 * Certains formulaires n'agissent qu'au départ du curseur, pas à la frappe. Sur
 * Leboncoin, les suggestions de catégorie n'apparaissent qu'une fois le champ
 * titre quitté : rempli sans `blur`, le titre est bien là et l'étape reste
 * bloquée, sans que rien n'explique pourquoi.
 */
function setNativeValueAndBlur(el, value) {
  el.focus()
  setNativeValue(el, value)
  el.dispatchEvent(new Event('blur', { bubbles: true }))
  el.blur?.()
}

/**
 * Remplit un champ à autocomplétion et choisit dans la liste.
 *
 * Une combobox n'accepte pas la saisie libre : le texte reste à l'écran, la
 * valeur n'est pas retenue, et le formulaire refuse à la validation en désignant
 * un champ qui a pourtant l'air rempli. Il faut frapper, attendre la liste, et
 * cliquer une option.
 *
 * Rend `false` quand aucune suggestion n'est venue — au vendeur de choisir. On
 * ne prétend pas avoir rempli ce qu'on n'a pas rempli.
 */
async function remplirCombobox(el, value, attente = 2500) {
  if (!el || !value) return false

  el.focus()
  setNativeValue(el, value)
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }))
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }))

  const debut = Date.now()
  while (Date.now() - debut < attente) {
    // Les listes d'un formulaire React portent presque toujours un rôle ARIA :
    // c'est ce qui bouge le moins d'une refonte à l'autre.
    const option = document.querySelector(
      '[role="option"], [role="listbox"] li, [role="listbox"] [role="button"]',
    )
    if (option) {
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      option.click()
      return true
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  return false
}

/** Choisit une valeur dans un `<select>` par son texte, sans casse ni accent. */
function choisirDansSelect(select, textes) {
  if (!select) return false
  const nu = (s) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  for (const attendu of textes) {
    const option = [...select.options].find((o) => nu(o.textContent).includes(nu(attendu)))
    if (option) {
      select.value = option.value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }
  }
  return false
}
