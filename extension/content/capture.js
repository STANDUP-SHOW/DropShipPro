/**
 * "Ajouter à DropShip Pro" button, injected on supplier product pages
 * (Temu, JoyBuy, AliExpress…).
 *
 * This is what the server-side scraper can't do: those sites load price and the
 * photo gallery by XHR after render, so the HTML the backend fetches has neither.
 * Here the page is already rendered in the user's own browser, so we read the
 * finished DOM and send the complete product to the API.
 */
;(() => {
  
  function parsePrice(text) {
    if (!text) return 0
    const m = text.replace(/\s/g, '').match(/(\d+[.,]?\d*)/)
    return m ? parseFloat(m[1].replace(',', '.')) : 0
  }

  function collectImages() {
    const urls = new Set()
    // Product galleries use large images; skip icons, sprites and tracking pixels.
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.src
      if (!src || !src.startsWith('http')) continue
      const w = img.naturalWidth || img.width
      if (w < 300) continue
      if (/sprite|icon|logo|avatar|pixel/i.test(src)) continue
      urls.add(src.split('?')[0])
      if (urls.size >= 8) break
    }
    return [...urls]
  }

  function collectPrice() {
    const meta = document.querySelector('meta[property="product:price:amount"]')?.content
    if (meta) return parsePrice(meta)

    // Otherwise take the most prominent on-page price: scan elements whose text
    // is a currency amount and keep the one rendered largest.
    let best = { value: 0, size: 0 }
    for (const el of document.querySelectorAll('div,span,p,strong,b,h1,h2,h3')) {
      if (el.children.length > 0) continue
      const text = el.textContent?.trim()
      if (!text || text.length > 20) continue
      if (!/[€$£]|EUR|USD/i.test(text)) continue
      const value = parsePrice(text)
      if (!value) continue
      const size = parseFloat(getComputedStyle(el).fontSize) || 0
      if (size > best.size) best = { value, size }
    }
    return best.value
  }

  function collectCategory() {
    const crumbs = [...document.querySelectorAll('[class*="breadcrumb" i] a, nav a')]
      .map((a) => a.textContent.trim())
      .filter((t) => t && t.length < 40 && !/^(accueil|home)$/i.test(t))
    return crumbs.slice(-1)[0] || null
  }

  function collectVariants() {
    // Size/colour pickers are rendered as labelled option groups; capture the
    // visible choices so the user can carry them into the marketplace listing.
    const variants = {}
    for (const group of document.querySelectorAll('[class*="sku" i], [class*="variant" i], [class*="option" i]')) {
      const label = group.querySelector('label, [class*="title" i]')?.textContent?.trim()
      if (!label || label.length > 30) continue
      const values = [...group.querySelectorAll('button, li, [role="option"]')]
        .map((el) => el.getAttribute('aria-label') || el.textContent.trim())
        .filter((v) => v && v.length < 30)
      if (values.length > 1) variants[label] = [...new Set(values)].slice(0, 20)
    }
    return Object.keys(variants).length ? variants : null
  }

  function buildPayload() {
    return {
      sourceUrl: location.href,
      title:
        document.querySelector('meta[property="og:title"]')?.content ||
        document.querySelector('h1')?.textContent?.trim() ||
        document.title,
      description:
        document.querySelector('meta[property="og:description"]')?.content ||
        document.querySelector('meta[name="description"]')?.content ||
        '',
      price: collectPrice(),
      currency: /\$/.test(document.body.innerText.slice(0, 3000)) ? 'USD' : 'EUR',
      images: collectImages(),
      sourceCategory: collectCategory(),
      variants: collectVariants(),
    }
  }

  async function send(button) {
    const { token } = await chrome.storage.local.get('token')
    if (!token) {
      showBanner("Connectez-vous d'abord via l'icône DropShip Pro dans la barre d'outils.", 'error')
      return
    }

    const payload = buildPayload()
    if (!payload.title) {
      showBanner('Produit non reconnu sur cette page.', 'error')
      return
    }

    button.disabled = true
    button.textContent = 'Import en cours…'
    try {
      const res = await fetch(`${await getApiBase()}/api/products/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`)
      showBanner(
        `Ajouté à DropShip Pro : ${payload.images.length} photo(s), prix ${payload.price || '—'} ${payload.currency}.`,
      )
      button.textContent = '✓ Ajouté'
    } catch (err) {
      showBanner(`Échec de l'import : ${err.message}`, 'error')
      button.textContent = 'Réessayer'
      button.disabled = false
    }
  }

  function mountButton() {
    if (document.getElementById('dsp-capture-btn')) return
    const button = document.createElement('button')
    button.id = 'dsp-capture-btn'
    button.textContent = '+ Ajouter à DropShip Pro'
    Object.assign(button.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483646',
      padding: '12px 18px',
      border: '0',
      borderRadius: '10px',
      font: '600 14px system-ui, sans-serif',
      color: '#fff',
      background: 'linear-gradient(90deg, #a855f7, #ec4899)',
      boxShadow: '0 8px 24px rgba(0,0,0,.35)',
      cursor: 'pointer',
    })
    button.addEventListener('click', () => send(button))
    document.body.appendChild(button)
  }

  // These pages are SPAs: the product view can mount well after load, and moving
  // between products doesn't reload the document.
  mountButton()
  new MutationObserver(mountButton).observe(document.documentElement, { childList: true, subtree: true })
})()
