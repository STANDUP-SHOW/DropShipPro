/**
 * "Ajouter à DropShipper IA" button, injected on supplier product pages
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

  /** Minimum side, in pixels, for a picture to count as a product shot. */
  const MIN_SIDE = 500

  /**
   * Two URLs pointing at the same photo in different sizes share everything but
   * the size marker suppliers append (`_800x800`, `-450x450`…). Normalising on
   * that keeps one entry per actual photo.
   */
  function photoIdentity(url) {
    return url
      .split('?')[0]
      .replace(/[_-]\d{2,4}x\d{2,4}(?=\.\w+$)/i, '')
      .replace(/\/\d{2,4}x\d{2,4}\//, '/')
  }

  /** Loads a candidate just to read its real dimensions. */
  function measure(url) {
    return new Promise((resolve) => {
      const img = new Image()
      const done = (value) => {
        img.onload = img.onerror = null
        resolve(value)
      }
      img.onload = () => done({ url, width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => done(null)
      // A stalled request must not hold the whole import.
      setTimeout(() => done(null), 8000)
      img.src = url
    })
  }

  /**
   * Picks the product gallery.
   *
   * Earlier versions kept whatever appeared first on the page, which on a Temu
   * listing means the "you may also like" strip at the bottom: ten pictures, none
   * of them the product. Candidates are now measured for real and only the large
   * ones are kept — the gallery is shot at full size, recommendations are
   * thumbnails. It is the same criterion as a "large images only" filter in an
   * image-downloader extension.
   */
  /**
   * Variants of a URL that may serve the full-size original.
   *
   * Product CDNs encode the requested size in the path or the query
   * (`xxx_100x100.jpg`, `/200x200/xxx.jpg`, `?imageView2/2/w/300`). The page only
   * ever links the thumbnail, so measuring what is on the page finds nothing big
   * enough. Dropping the size marker usually returns the original — this is what
   * an image-downloader extension does to offer "large" versions.
   */
  function sizeVariants(url) {
    const out = [url]
    const bare = url.split('?')[0]
    if (bare !== url) out.push(bare)

    const stripped = bare
      .replace(/[_-]\d{2,4}x\d{2,4}(?=\.\w+$)/i, '')
      .replace(/\/\d{2,4}x\d{2,4}\//, '/')
      .replace(/[_-](?:thumb|small|medium|mini)(?=\.\w+$)/i, '')
    if (stripped !== bare) out.push(stripped)

    return out
  }

  /**
   * Product photos live under a recognisable path on every supplier CDN
   * (`/product/`, `/goods/`, `/item/`…), while banners, logos and interface
   * assets do not. Ranking on that puts the gallery ahead of the page furniture.
   */
  const PRODUCT_PATH = /\/(?:product|products|goods|item|items|sku|detail)\//i

  /**
   * Every image the browser actually downloaded for this page.
   *
   * This is the source that was missing. A carousel loads its photos then swaps
   * them out of the DOM, so scanning `<img>` tags finds only the visible one and
   * the page markup doesn't always carry the rest either. The resource timeline
   * keeps them all — it is how an image-downloader extension reports hundreds of
   * pictures on a page showing a handful.
   */
  function collectImagesFromNetwork() {
    try {
      return performance
        .getEntriesByType('resource')
        .filter((entry) => entry.initiatorType === 'img' || /\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(entry.name))
        .map((entry) => entry.name)
        .filter((url) => url.startsWith('http') && !JUNK.test(url))
    } catch {
      return []
    }
  }

  async function collectImages() {
    const candidates = new Set()

    for (const img of document.querySelectorAll('img')) {
      const src = bestSource(img)
      if (src && src.startsWith('http') && !JUNK.test(src)) candidates.add(src)
    }
    for (const url of collectImagesFromNetwork()) candidates.add(url)
    for (const url of collectImagesFromSource()) candidates.add(url)

    // Measuring costs one request each, so the pool is capped — but it must be
    // ordered first. Previously the DOM images (ads, logos, neighbouring
    // products) filled the whole quota and the real gallery, which comes from the
    // page source, was never reached: an import returned fifteen pictures without
    // one of the product.
    const ranked = [...candidates].sort((a, b) => Number(PRODUCT_PATH.test(b)) - Number(PRODUCT_PATH.test(a)))

    const probes = ranked.slice(0, 60).flatMap(sizeVariants)
    const measured = (await Promise.all([...new Set(probes)].map(measure))).filter(Boolean)

    const large = measured
      .filter((m) => Math.min(m.width, m.height) >= MIN_SIDE)
      .sort((a, b) => b.width * b.height - a.width * a.height)

    // Nothing big enough — a small gallery, or images blocked from measurement.
    // Fall back to the biggest available rather than returning nothing.
    const chosen = large.length ? large : measured.sort((a, b) => b.width * b.height - a.width * a.height)

    // Deduplicate: the same photo often appears at several sizes.
    const seen = new Set()
    const unique = []
    for (const item of chosen) {
      const identity = photoIdentity(item.url)
      if (seen.has(identity)) continue
      seen.add(identity)
      unique.push(item)
    }
    return unique
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

  /**
   * Visible text around the option pickers.
   *
   * DOM heuristics don't survive obfuscated class names, so the raw text goes to
   * the API and the model extracts sizes and colours from it. Sending the whole
   * page would be wasteful, so this keeps the region between the title and the
   * description, where pickers live.
   */
  function collectPageText() {
    const main =
      document.querySelector('main') ||
      document.querySelector('[class*="detail" i]') ||
      document.body
    return main.innerText.replace(/\n{2,}/g, '\n').slice(0, 4000)
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
      images: [],
      sourceCategory: collectCategory(),
      variants: collectVariants(),
      pageText: collectPageText(),
    }
  }

  /**
   * Progress panel shown above the button while the import runs.
   *
   * The whole thing takes 30 to 60 seconds — reading the page, AI rewrite, then
   * watermarking. Without a visible timer the page looks frozen and people click
   * again or leave.
   */
  function showProgress() {
    document.getElementById('dsp-progress')?.remove()

    const panel = document.createElement('div')
    panel.id = 'dsp-progress'
    Object.assign(panel.style, {
      width: '270px',
      padding: '12px 14px',
      borderRadius: '10px',
      background: 'rgba(20,24,44,.94)',
      border: '1px solid rgba(168,85,247,.45)',
      boxShadow: '0 8px 24px rgba(0,0,0,.4)',
      color: '#fff',
      font: '400 12px system-ui, sans-serif',
      backdropFilter: 'blur(6px)',
    })
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px">
        <span id="dsp-spin" style="display:inline-block;width:13px;height:13px;border:2px solid rgba(216,180,254,.3);border-top-color:#d8b4fe;border-radius:50%"></span>
        <span id="dsp-step">Lecture de la page…</span>
        <span id="dsp-timer" style="margin-left:auto;color:#d8b4fe;font-variant-numeric:tabular-nums">0 s</span>
      </div>
      <div style="margin-top:9px;height:3px;border-radius:999px;background:rgba(255,255,255,.12);overflow:hidden">
        <div id="dsp-bar" style="height:100%;width:8%;border-radius:999px;background:linear-gradient(90deg,#a855f7,#ec4899);transition:width .6s ease"></div>
      </div>
      <p style="margin:8px 0 0;color:#9ca3af;line-height:1.5">Ne fermez pas cet onglet. L'annonce s'ouvrira toute seule.</p>
    `
    document.getElementById('dsp-capture-wrap')?.prepend(panel)

    const started = Date.now()
    let spin = 0
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000)
      panel.querySelector('#dsp-timer').textContent = `${seconds} s`
      // The steps aren't measurable, so the bar advances on expected duration
      // and stops short of the end rather than pretending to be finished.
      panel.querySelector('#dsp-bar').style.width = `${Math.min(92, 8 + seconds * 2.2)}%`
      panel.querySelector('#dsp-spin').style.transform = `rotate(${(spin += 45)}deg)`
    }, 1000)

    return {
      step(label) {
        const el = panel.querySelector('#dsp-step')
        if (el) el.textContent = label
      },
      done(label) {
        clearInterval(timer)
        panel.querySelector('#dsp-bar').style.width = '100%'
        panel.querySelector('#dsp-spin').remove()
        panel.querySelector('#dsp-step').textContent = label
      },
      fail(label) {
        clearInterval(timer)
        panel.style.borderColor = 'rgba(248,113,113,.5)'
        panel.querySelector('#dsp-spin').remove()
        panel.querySelector('#dsp-step').textContent = label
      },
      remove: () => panel.remove(),
    }
  }

  /**
   * Lets the seller pick the photos.
   *
   * Guessing which pictures belong to the product failed on every attempt: these
   * pages hide the gallery behind obfuscated markup, and any rule that works on
   * one shop breaks on the next. Showing every image found, biggest first, and
   * letting the user tick them is the approach image-downloader extensions use —
   * it cannot silently pick the wrong ones.
   */
  function choosePhotos(found) {
    return new Promise((resolve) => {
      document.getElementById('dsp-picker-photos')?.remove()

      const overlay = document.createElement('div')
      overlay.id = 'dsp-picker-photos'
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483647',
        background: 'rgba(10,12,24,.86)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        font: '400 13px system-ui, sans-serif',
      })

      const panel = document.createElement('div')
      Object.assign(panel.style, {
        width: 'min(920px, 100%)',
        maxHeight: '86vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1b1633',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: '16px',
        color: '#fff',
        overflow: 'hidden',
      })

      // Biggest first: the gallery is shot at full size, the rest are thumbnails.
      const sorted = [...found].sort((a, b) => b.width * b.height - a.width * a.height)
      const preselected = new Set(sorted.filter((i) => Math.min(i.width, i.height) >= 500).slice(0, 10).map((i) => i.url))

      // Sizes actually present, so the seller can isolate the gallery: on Temu the
      // product shots are all 800×800 while the surrounding clutter is not.
      const sizes = [...new Set(sorted.map((i) => `${i.width}×${i.height}`))]
        .map((label) => ({ label, count: sorted.filter((i) => `${i.width}×${i.height}` === label).length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)

      panel.innerHTML = `
        <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.1);flex-shrink:0">
          <div style="font-weight:700;font-size:15px">Choisissez les photos du produit</div>
          <div style="color:#9ca3af;margin-top:3px">
            ${sorted.length} image(s) trouvées. Filtrez par dimensions pour isoler la galerie —
            sur Temu les photos produit font en général 800×800. 10 maximum.
          </div>
          <div id="dsp-filters" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px"></div>
        </div>
        <div id="dsp-grid" style="flex:1 1 auto;overflow-y:auto;padding:16px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));grid-auto-rows:170px;align-content:start;gap:14px"></div>
        <div style="padding:14px 20px;border-top:1px solid rgba(255,255,255,.1);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-shrink:0">
          <span id="dsp-count" style="color:#9ca3af"></span>
          <span style="display:flex;gap:8px">
            <button id="dsp-cancel" style="border:1px solid rgba(255,255,255,.15);background:none;color:#e5e7eb;border-radius:9px;padding:9px 16px;cursor:pointer;font:inherit">Annuler</button>
            <button id="dsp-ok" style="border:0;background:linear-gradient(90deg,#a855f7,#ec4899);color:#fff;border-radius:9px;padding:9px 20px;cursor:pointer;font:inherit;font-weight:600">Importer</button>
          </span>
        </div>`

      overlay.appendChild(panel)
      document.body.appendChild(overlay)

      const grid = panel.querySelector('#dsp-grid')
      const counter = panel.querySelector('#dsp-count')
      const filters = panel.querySelector('#dsp-filters')
      let filter = null

      const refreshCount = () => {
        counter.textContent = `${preselected.size} photo(s) sélectionnée(s)`
      }

      function drawFilters() {
        filters.innerHTML = ''
        const make = (label, value, count) => {
          const b = document.createElement('button')
          b.textContent = count === null ? label : `${label} (${count})`
          const on = filter === value
          Object.assign(b.style, {
            border: on ? '1px solid #a855f7' : '1px solid rgba(255,255,255,.15)',
            background: on ? 'rgba(168,85,247,.25)' : 'none',
            color: '#e5e7eb',
            borderRadius: '999px',
            padding: '5px 12px',
            cursor: 'pointer',
            font: '500 12px system-ui, sans-serif',
          })
          b.addEventListener('click', () => {
            filter = value
            drawFilters()
            drawGrid()
          })
          filters.appendChild(b)
        }
        make('Toutes', null, sorted.length)
        for (const s of sizes) make(s.label, s.label, s.count)
      }

      function drawGrid() {
        grid.innerHTML = ''
        const shown = filter ? sorted.filter((i) => `${i.width}×${i.height}` === filter) : sorted

        for (const item of shown) {
          const cell = document.createElement('button')
          const selected = () => preselected.has(item.url)
          Object.assign(cell.style, {
            position: 'relative',
            padding: '0',
            margin: '0',
            border: '2px solid transparent',
            borderRadius: '10px',
            overflow: 'hidden',
            cursor: 'pointer',
            background: '#0f172a',
            width: '100%',
            height: '170px',
            display: 'block',
          })
          cell.innerHTML = `
            <img src="${item.url}" loading="lazy" style="width:100%;height:100%;object-fit:contain;display:block;background:#0f172a" />
            <span style="position:absolute;left:5px;bottom:5px;background:rgba(0,0,0,.78);border-radius:5px;padding:2px 6px;font-size:10px;color:#fff">${item.width}×${item.height}</span>
            <span class="tick" style="position:absolute;right:5px;top:5px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;color:#fff"></span>`

          const paint = () => {
            cell.style.borderColor = selected() ? '#a855f7' : 'rgba(255,255,255,.08)'
            cell.style.opacity = selected() ? '1' : '.6'
            const tick = cell.querySelector('.tick')
            tick.style.background = selected() ? '#a855f7' : 'rgba(0,0,0,.65)'
            tick.textContent = selected() ? '✓' : ''
          }

          cell.addEventListener('click', () => {
            if (selected()) preselected.delete(item.url)
            else if (preselected.size < 10) preselected.add(item.url)
            paint()
            refreshCount()
          })

          paint()
          grid.appendChild(cell)
        }
      }

      drawFilters()
      drawGrid()
      refreshCount()

      const close = (value) => {
        overlay.remove()
        resolve(value)
      }
      panel.querySelector('#dsp-cancel').addEventListener('click', () => close(null))
      panel.querySelector('#dsp-ok').addEventListener('click', () => close([...preselected]))
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(null)
      })
    })
  }

  async function send(button) {
    const { token } = await chrome.storage.local.get('token')
    if (!token) {
      showBanner("Connectez-vous d'abord via l'icône DropShipper IA dans la barre d'outils.", 'error')
      return
    }

    button.disabled = true
    button.textContent = 'Import en cours…'
    const progress = showProgress()

    try {
      progress.step('Recherche des photos…')
      const found = await collectImages()

      const payload = await buildPayload()
      if (!payload.title) {
        progress.fail('Produit non reconnu sur cette page')
        button.textContent = 'Réessayer'
        button.disabled = false
        return
      }

      // The seller confirms which pictures are the product: no rule reliably
      // separates the gallery from the recommendation strip on these pages.
      progress.step(`${found.length} image(s) trouvées — à vous de choisir`)
      const picked = await choosePhotos(found)
      if (picked === null) {
        progress.remove()
        button.textContent = '✨ Ajouter à DropShipper IA'
        button.disabled = false
        return
      }
      payload.images = picked

      progress.step(`${payload.images.length} photo(s) — rédaction par l'IA…`)
      const product = await apiFetch('/api/products/capture', { method: 'POST', body: payload })

      progress.done('Annonce prête')
      button.textContent = '✓ Ajouté'

      // Opened only once the listing is complete, and only announced once it
      // actually happened: the previous version promised an opening that failed
      // silently when the app address was wrong.
      const opened = await chrome.runtime.sendMessage({
        type: 'dsp-open-product',
        productId: product?.id,
      })

      if (opened?.ok) {
        setTimeout(() => progress.remove(), 2500)
      } else {
        progress.fail(`Annonce enregistrée — ouvrez DropShipper IA${opened?.error ? ` (${opened.error})` : ''}`)
      }
    } catch (err) {
      progress.fail(`Échec : ${err.message}`)
      button.textContent = 'Réessayer'
      button.disabled = false
    }
  }

  /**
   * Is this a product page?
   *
   * The script now runs on every site so any supplier can be imported, but the
   * button must not appear on a home page, a search result or a blog post. These
   * are the marks a real product page carries.
   */
  function looksLikeProductPage() {
    const ogType = document.querySelector('meta[property="og:type"]')?.content ?? ''
    if (/product/i.test(ogType)) return true

    if (document.querySelector('meta[property="product:price:amount"]')) return true

    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
      if (/"@type"\s*:\s*"?\[?[^]{0,40}Product/i.test(el.textContent || '')) return true
    }

    // Otherwise: a title, a visible price and an image large enough to be a photo.
    const hasTitle = Boolean(document.querySelector('h1')?.textContent?.trim())
    const hasPrice = collectPrice() > 0
    const hasPhoto = [...document.querySelectorAll('img')].some((i) => (i.naturalWidth || i.width) >= 300)
    return hasTitle && hasPrice && hasPhoto
  }

  /** Sites the user has silenced with "Jamais sur ce site". */
  async function isMuted() {
    const { mutedSites = [] } = await chrome.storage.local.get('mutedSites')
    return mutedSites.includes(location.origin)
  }

  async function mute() {
    const { mutedSites = [] } = await chrome.storage.local.get('mutedSites')
    await chrome.storage.local.set({ mutedSites: [...new Set([...mutedSites, location.origin])] })
    document.getElementById('dsp-capture-wrap')?.remove()
  }

  async function mountButton() {
    if (document.getElementById('dsp-capture-wrap')) return
    if (!looksLikeProductPage()) return
    if (await isMuted()) return

    const wrap = document.createElement('div')
    wrap.id = 'dsp-capture-wrap'
    Object.assign(wrap.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483646',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '6px',
    })

    const button = document.createElement('button')
    button.id = 'dsp-capture-btn'
    button.textContent = '✨ Ajouter à DropShipper IA'
    Object.assign(button.style, {
      padding: '12px 20px',
      border: '0',
      borderRadius: '10px',
      font: '600 14px system-ui, sans-serif',
      color: '#fff',
      background: 'linear-gradient(90deg, #a855f7, #ec4899)',
      boxShadow: '0 8px 24px rgba(0,0,0,.35)',
      cursor: 'pointer',
    })
    button.addEventListener('click', () => send(button))

    // Deliberately readable rather than a discreet cross: a floating button on
    // someone's browsing needs an obvious way out.
    const never = document.createElement('button')
    never.textContent = 'Jamais sur ce site'
    Object.assign(never.style, {
      border: '0',
      background: 'rgba(20,24,44,.82)',
      color: '#cbd5e1',
      font: '500 11px system-ui, sans-serif',
      padding: '5px 12px',
      borderRadius: '999px',
      cursor: 'pointer',
      backdropFilter: 'blur(4px)',
      textDecoration: 'underline',
    })
    never.addEventListener('click', mute)

    wrap.append(button, never)
    document.body.appendChild(wrap)
  }

  // These pages are SPAs: the product view can mount well after load, and moving
  // between products doesn't reload the document.
  mountButton()
  new MutationObserver(mountButton).observe(document.documentElement, { childList: true, subtree: true })
})()
