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

  /**
   * Best available source for one <img>.
   *
   * Galleries lazy-load: thumbnails past the fold have no `src` yet and a
   * naturalWidth of 0, which is why filtering on naturalWidth alone returned a
   * single photo out of ten. The real URL sits in data-src / data-original, or in
   * the largest candidate of a srcset.
   */
  function bestSource(img) {
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset')
    if (srcset) {
      const widest = srcset
        .split(',')
        .map((part) => {
          const [url, size] = part.trim().split(/\s+/)
          return { url, width: parseInt(size) || 0 }
        })
        .sort((a, b) => b.width - a.width)[0]
      if (widest?.url) return widest.url
    }
    return (
      img.currentSrc ||
      img.getAttribute('src') ||
      img.getAttribute('data-src') ||
      img.getAttribute('data-original') ||
      img.getAttribute('data-lazy-src') ||
      ''
    )
  }

  /** Rejects sprites, icons and tracking pixels by URL and by rendered size. */
  function looksLikeProductPhoto(img, url) {
    if (!url || !url.startsWith('http')) return false
    if (/sprite|icon|logo|avatar|pixel|badge|flag|placeholder|blank\.|1x1/i.test(url)) return false

    // A loaded image is judged on its real size; a lazy one on the box it occupies,
    // since its intrinsic dimensions aren't known yet.
    const natural = img.naturalWidth
    if (natural > 0) return natural >= 300
    const rect = img.getBoundingClientRect()
    return Math.max(rect.width, img.width || 0) >= 120
  }

  const JUNK = /sprite|icon|logo|avatar|pixel|badge|flag|placeholder|blank\.|1x1|thumb_|_50x50|_100x100/i

  /**
   * Second pass: pull image URLs out of the page source itself.
   *
   * A carousel usually keeps a single <img> and swaps its src, so scanning the DOM
   * finds one photo however long you wait — this is why an import came back with
   * a single image. The other shots are sitting in the inline JSON the gallery
   * reads from, so they are matched there, with the escaped slashes those blobs use.
   */
  function collectImagesFromSource() {
    const html = document.documentElement.innerHTML.replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
    const found = html.match(/https:\/\/[^"'\\\s)]+?\.(?:jpe?g|png|webp)/gi) || []

    const counts = new Map()
    for (const raw of found) {
      const url = raw.split('?')[0]
      if (JUNK.test(url)) continue
      // Product CDNs serve the gallery from one host; counting hosts finds it
      // without hard-coding a domain per supplier site.
      const host = url.slice(0, url.indexOf('/', 8))
      counts.set(host, (counts.get(host) ?? 0) + 1)
    }

    const mainHost = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (!mainHost) return []

    return [...new Set(found.map((u) => u.split('?')[0]).filter((u) => u.startsWith(mainHost) && !JUNK.test(u)))]
  }

  function collectImages() {
    const urls = new Set()
    for (const img of document.querySelectorAll('img')) {
      const src = bestSource(img)
      if (!looksLikeProductPhoto(img, src)) continue
      // Strip resize/quality parameters so the same photo isn't kept twice at two sizes.
      urls.add(src.split('?')[0])
      if (urls.size >= 10) break
    }

    // The DOM alone rarely exposes a whole carousel; top it up from the source.
    if (urls.size < 5) {
      for (const url of collectImagesFromSource()) {
        urls.add(url)
        if (urls.size >= 10) break
      }
    }

    return [...urls]
  }

  /**
   * Scrolls the gallery so lazy images start loading, then waits briefly.
   * Without this the page only ever exposes the photos already in view.
   */
  async function revealLazyImages() {
    const start = window.scrollY
    for (const y of [400, 900, 1500]) {
      window.scrollTo({ top: y, behavior: 'instant' })
      await new Promise((r) => setTimeout(r, 250))
    }
    window.scrollTo({ top: start, behavior: 'instant' })
    await new Promise((r) => setTimeout(r, 200))
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

  async function buildPayload() {
    await revealLazyImages()

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

    const payload = await buildPayload()
    if (!payload.title) {
      showBanner('Produit non reconnu sur cette page.', 'error')
      return
    }

    button.disabled = true
    button.textContent = 'Lecture des photos…'
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
