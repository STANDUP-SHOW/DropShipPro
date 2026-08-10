
// Where each platform's "create listing" form lives. The content script for that
// platform picks the pending listing back up from chrome.storage once the tab loads.
const TARGETS = {
  VINTED: { label: 'Vinted', url: 'https://www.vinted.fr/items/new' },
  LEBONCOIN: { label: 'Leboncoin', url: 'https://www.leboncoin.fr/deposer-une-annonce' },
  EBAY: { label: 'eBay', url: 'https://www.ebay.fr/sl/sell' },
}

const app = document.getElementById('app')

async function getToken() {
  const { token } = await chrome.storage.local.get('token')
  return token
}

async function api(path, options = {}) {
  const token = await getToken()
  const res = await fetch(`${await getApiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Erreur ${res.status}`)
  }
  return res.json()
}

async function renderSettings() {
  const [apiBase, appUrl] = await Promise.all([getApiBase(), getAppUrl()])
  app.innerHTML = `
    <p class="muted">Adresses de votre installation DropShip Pro.</p>
    <label class="muted">API (backend)</label>
    <input id="apiBase" type="url" value="${apiBase}" placeholder="https://xxx.up.railway.app" />
    <label class="muted" style="margin-top:8px;display:block">Application (frontend)</label>
    <input id="appUrl" type="url" value="${appUrl}" placeholder="https://xxx.vercel.app" />
    <button class="primary" id="saveCfg">Enregistrer</button>
    <p class="link" id="backCfg" style="margin-top:10px">Retour</p>
  `
  document.getElementById('saveCfg').addEventListener('click', async () => {
    await setApiBase(document.getElementById('apiBase').value.trim())
    await setAppUrl(document.getElementById('appUrl').value.trim())
    // Drop the old session: a token issued by another backend isn't valid here.
    await chrome.storage.local.remove('token')
    renderLogin()
  })
  document.getElementById('backCfg').addEventListener('click', () => start())
}

function renderLogin(error) {
  app.innerHTML = `
    <p class="muted">Connectez-vous à votre compte DropShip Pro.</p>
    <input id="email" type="email" placeholder="Email" />
    <input id="password" type="password" placeholder="Mot de passe" />
    <button class="primary" id="loginBtn">Se connecter</button>
    ${error ? `<p class="error">${error}</p>` : ''}
    <p class="link" id="openCfg" style="margin-top:10px">Configurer les adresses</p>
  `
  document.getElementById('openCfg').addEventListener('click', renderSettings)
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value
    try {
      const res = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      await chrome.storage.local.set({ token: res.token })
      renderProducts()
    } catch (err) {
      renderLogin(err.message)
    }
  })
}

async function renderProducts() {
  app.innerHTML = '<p class="muted">Chargement des produits…</p>'
  let products
  try {
    products = await api('/api/products')
  } catch (err) {
    if (err.message.includes('401') || err.message.toLowerCase().includes('authenti')) {
      await chrome.storage.local.remove('token')
      return renderLogin()
    }
    return (app.innerHTML = `<p class="error">${err.message}</p>`)
  }

  if (!products.length) {
    app.innerHTML = '<p class="muted">Aucun produit importé. Ajoutez-en depuis l\'application.</p>'
    return
  }

  app.innerHTML =
    products
      .map((p) => {
        const finalPrice = (Number(p.price) * (1 + p.markupPercent / 100)).toFixed(2)
        const buttons = Object.entries(TARGETS)
          .map(([key, t]) => `<button data-product="${p.id}" data-target="${key}">${t.label}</button>`)
          .join('')
        return `
          <div class="product">
            <div class="product-title">${escapeHtml(p.aiTitle || p.title)}</div>
            <span class="price">${finalPrice} ${p.currency}</span>
            <div class="targets">${buttons}</div>
          </div>`
      })
      .join('') +
    '<p class="link" id="openCfg2">Configurer les adresses</p>' +
    '<p class="link" id="logout">Déconnexion</p>'

  document.getElementById('openCfg2').addEventListener('click', renderSettings)

  app.querySelectorAll('button[data-target]').forEach((btn) => {
    btn.addEventListener('click', () => startFill(btn.dataset.product, btn.dataset.target, btn))
  })
  document.getElementById('logout').addEventListener('click', async () => {
    await chrome.storage.local.remove('token')
    renderLogin()
  })
}

async function startFill(productId, target, btn) {
  btn.textContent = '…'
  try {
    const product = await api(`/api/products/${productId}`)
    const categories = await api(`/api/products/${productId}/category-preview`)
    // Resolved before the map: the callback below isn't async, so it can't await.
    const apiBase = await getApiBase()
    await chrome.storage.local.set({
      pendingListing: {
        target,
        title: product.aiTitle || product.title,
        description: product.aiDescription || product.description,
        price: (Number(product.price) * (1 + product.markupPercent / 100)).toFixed(2),
        category: categories[target],
        images: (product.images || []).map((img) => (img.startsWith('/') ? `${apiBase}${img}` : img)),
      },
    })
    await chrome.tabs.create({ url: TARGETS[target].url })
    window.close()
  } catch (err) {
    btn.textContent = 'Erreur'
    console.error(err)
  }
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function start() {
  getToken().then((token) => (token ? renderProducts() : renderLogin()))
}

start()
