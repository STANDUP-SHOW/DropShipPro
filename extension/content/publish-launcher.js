/**
 * "Publier avec DropShipper IA" launcher, injected on marketplace listing forms.
 *
 * Opens a product picker in-page; choosing one queues it and immediately runs the
 * platform's fill script, so the user never has to go back to the toolbar popup.
 */
;(() => {
  
  const HOST_TO_PLATFORM = [
    ['vinted', 'VINTED'],
    ['leboncoin', 'LEBONCOIN'],
    ['ebay', 'EBAY'],
    ['amazon', 'AMAZON'],
    ['facebook', 'FACEBOOK'],
    ['cdiscount', 'CDISCOUNT'],
    ['tiktokglobalshop', 'TIKTOK_SHOP'],
    ['merchants.google', 'GOOGLE_SHOPPING'],
  ]
  const PLATFORM = HOST_TO_PLATFORM.find(([host]) => location.hostname.includes(host))?.[1] ?? null

  async function fetchProducts() {
    const { token } = await chrome.storage.local.get('token')
    if (!token) throw new Error('non-connecté')
    return apiFetch('/api/products')
  }

  function closePicker() {
    document.getElementById('dsp-picker')?.remove()
  }

  async function openPicker() {
    closePicker()

    const panel = document.createElement('div')
    panel.id = 'dsp-picker'
    Object.assign(panel.style, {
      position: 'fixed',
      right: '20px',
      bottom: '76px',
      zIndex: '2147483646',
      width: '330px',
      maxHeight: '60vh',
      overflowY: 'auto',
      padding: '14px',
      borderRadius: '12px',
      background: '#1e1b4b',
      color: '#e5e7eb',
      font: '13px system-ui, sans-serif',
      boxShadow: '0 10px 30px rgba(0,0,0,.5)',
      border: '1px solid rgba(255,255,255,.12)',
    })
    panel.innerHTML = '<b>Choisir un produit</b><p style="color:#9ca3af">Chargement…</p>'
    document.body.appendChild(panel)

    let products
    try {
      products = await fetchProducts()
    } catch (err) {
      panel.innerHTML =
        err.message === 'non-connecté'
          ? '<b>DropShipper IA</b><p style="color:#f87171">Connectez-vous via l\'icône de l\'extension.</p>'
          : `<b>DropShipper IA</b><p style="color:#f87171">${err.message}</p>`
      return
    }

    if (!products.length) {
      panel.innerHTML = '<b>DropShipper IA</b><p style="color:#9ca3af">Aucun produit importé.</p>'
      return
    }

    panel.innerHTML = '<b>Choisir un produit à publier</b>'
    for (const product of products) {
      const row = document.createElement('button')
      Object.assign(row.style, {
        display: 'block',
        width: '100%',
        textAlign: 'left',
        margin: '8px 0 0',
        padding: '8px',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,.12)',
        background: 'rgba(255,255,255,.06)',
        color: '#e5e7eb',
        cursor: 'pointer',
        font: '13px system-ui, sans-serif',
      })
      row.innerHTML = `<div style="font-weight:600">${(product.aiTitle || product.title).slice(0, 60)}</div>
        <div style="color:#d8b4fe;font-weight:700">${Number(product.sellingPrice ?? 0).toFixed(2)} ${product.currency}</div>`
      row.addEventListener('click', () => queueAndFill(product))
      panel.appendChild(row)
    }
  }

  async function queueAndFill(product) {
    const { token } = await chrome.storage.local.get('token')
    // Resolved before the map further down: that callback isn't async.
    const apiBase = await getApiBase()
    const categories = await apiFetch(`/api/products/${product.id}/category-preview`).catch(() => ({}))

    await chrome.storage.local.set({
      pendingListing: {
        target: PLATFORM,
        title: product.aiTitle || product.title,
        description: product.aiDescription || product.description,
        price: Number(product.sellingPrice ?? 0).toFixed(2),
        category: categories[PLATFORM],
        images: (product.images || []).map((img) => (img.startsWith('/') ? `${apiBase}${img}` : img)),
      },
    })
    closePicker()
    // The platform fill script only runs at page load, so re-run it now.
    chrome.runtime.sendMessage({ type: 'dsp-fill-now', platform: PLATFORM })
  }

  function mountButton() {
    if (!PLATFORM || document.getElementById('dsp-publish-btn')) return
    const button = document.createElement('button')
    button.id = 'dsp-publish-btn'
    button.textContent = '⚡ Publier avec DropShipper IA'
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
    button.addEventListener('click', () => (document.getElementById('dsp-picker') ? closePicker() : openPicker()))
    document.body.appendChild(button)
  }

  mountButton()
  new MutationObserver(mountButton).observe(document.documentElement, { childList: true, subtree: true })
})()
