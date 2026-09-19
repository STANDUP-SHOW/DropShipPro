/**
 * Fresh news import queue executor.
 *
 * Items queued from the Fresh news feature (/fresh-news page) in the app
 * are stored on the server and polled here. Users can then import them
 * directly via the extension UI, bypassing the /fresh-news page entirely.
 *
 * The queue is displayed in the sidepanel and items can be imported with
 * a single click, just like batch imports but sourced from Fresh news
 * recommendations instead of manual browsing.
 */

const MAX_QUEUE_ITEMS = 25
const CLE_QUEUE = 'freshNewsQueue'
const CLE_ONGLET_QUEUE = 'freshNewsQueueTab'

function echapperTexte(texte) {
  const d = document.createElement('div')
  d.textContent = texte ?? ''
  return d.innerHTML
}

async function jeton() {
  const { token } = await chrome.storage.local.get('token')
  return token
}

async function appel(chemin, options = {}) {
  const token = await jeton()
  const res = await fetch(`${await getApiBase()}${chemin}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  })
  if (!res.ok) {
    const corps = await res.json().catch(() => ({}))
    throw new Error(corps.error || `Erreur ${res.status}`)
  }
  return res.json()
}

/**
 * Polls the server for queued Fresh news items and caches them locally.
 * Called periodically to refresh the queue.
 */
async function chargerQueue() {
  try {
    const reponse = await appel('/market-reports/file')
    if (Array.isArray(reponse)) {
      await chrome.storage.local.set({ [CLE_QUEUE]: reponse })
      return reponse
    }
    return []
  } catch (err) {
    console.error('Erreur de chargement de la file Fresh news:', err)
    // Return cached queue on error
    const { [CLE_QUEUE]: cached = [] } = await chrome.storage.local.get(CLE_QUEUE)
    return cached
  }
}

/**
 * Removes a single queued item from the server.
 */
async function retirerItem(itemId) {
  try {
    await appel(`/market-reports/file/${itemId}`, { method: 'DELETE' })
    // Refresh the queue after removal
    return await chargerQueue()
  } catch (err) {
    console.error('Erreur de suppression:', err)
    throw err
  }
}

/**
 * Removes an item from the queue.
 * In Fresh news workflow, removing from queue marks it as handled/processed.
 * The actual import happens on the backend when the item is queued.
 */
async function importerItem(item) {
  // Remove from queue to mark as processed
  if (item.id) {
    return await retirerItem(item.id)
  }
  return { ok: true }
}

/**
 * Displays the Fresh news queue in the sidepanel.
 *
 * `hote` is the element to render into; `surRetour` returns to the main panel.
 */
async function montrerQueueFreshNews(hote, surRetour) {
  let queue = await chargerQueue()
  let occupe = false

  function rendu() {
    const visibles = queue.slice(0, MAX_QUEUE_ITEMS)
    const depassement = queue.length > MAX_QUEUE_ITEMS

    hote.innerHTML = `
      <div class="bandeau">
        <span>📰</span>
        <span>File Fresh news (${queue.length} article${queue.length > 1 ? 's' : ''})</span>
      </div>

      ${
        visibles.length === 0
          ? '<p class="muted">Aucun article en attente.</p>'
          : `
      <div class="lot-items">
        ${visibles
          .map((item, idx) => {
            const fourn = item.fournisseur ? ` • ${echapperTexte(item.fournisseur)}` : ''
            return `
          <div class="lot-item">
            <div class="titre">${echapperTexte(item.titre || 'Sans titre')}</div>
            <div class="source">${echapperTexte(item.origine || 'Fresh news')}${fourn}</div>
            <div class="actions">
              <button class="primary" data-importer="${idx}" ${occupe ? 'disabled' : ''}>Importer</button>
              <button class="danger" data-retirer="${idx}" ${occupe ? 'disabled' : ''}>✕</button>
            </div>
          </div>
        `
          })
          .join('')}
      </div>

      ${depassement ? '<p class="muted">Les articles au-delà de 25 seront importés à la visite suivante.</p>' : ''}

      ${
        visibles.length > 0
          ? `
        <button class="primary wide" id="importer-tout" ${occupe ? 'disabled' : ''} style="margin-top:14px">
          Importer tous les articles (${visibles.length})
        </button>
      `
          : ''
      }
    `
    }

      <p class="link" id="retour" style="margin-top:10px">Retour</p>
    `

    document.getElementById('retour')?.addEventListener('click', surRetour)

    hote.querySelectorAll('button[data-importer]').forEach((b) => {
      b.addEventListener('click', async () => {
        const idx = Number(b.dataset.importer)
        const item = visibles[idx]
        if (!item) return

        occupe = true
        rendu()

        try {
          await importerItem(item)
          queue.splice(queue.indexOf(item), 1)
          rendu()
        } catch (err) {
          const msg = err.message || 'Erreur d\'import'
          hote.insertAdjacentHTML('afterbegin', `<p class="error">${echapperTexte(msg)}</p>`)
          occupe = false
          rendu()
        }
      })
    })

    hote.querySelectorAll('button[data-retirer]').forEach((b) => {
      b.addEventListener('click', async () => {
        const idx = Number(b.dataset.retirer)
        const item = visibles[idx]
        if (!item) return

        occupe = true
        rendu()

        try {
          if (item.id) {
            queue = await retirerItem(item.id)
          } else {
            queue.splice(idx, 1)
          }
          rendu()
        } catch (err) {
          const msg = err.message || 'Erreur de suppression'
          hote.insertAdjacentHTML('afterbegin', `<p class="error">${echapperTexte(msg)}</p>`)
          occupe = false
          rendu()
        }
      })
    })

    document.getElementById('importer-tout')?.addEventListener('click', async () => {
      occupe = true
      rendu()

      let errors = 0
      let success = 0

      for (const item of visibles) {
        try {
          await importerItem(item)
          if (item.id) {
            queue = queue.filter((it) => it.id !== item.id)
          }
          success++
        } catch (err) {
          console.error('Erreur d\'import:', err)
          errors++
        }
      }

      const msg =
        errors === 0
          ? `${success} article${success > 1 ? 's' : ''} importé${success > 1 ? 's' : ''}.`
          : `${success} importé${success > 1 ? 's' : ''}, ${errors} échec${errors > 1 ? 's' : ''}.`

      hote.insertAdjacentHTML('afterbegin', `<p class="muted">${msg}</p>`)
      occupe = false
      rendu()
    })
  }

  rendu()
}

/**
 * Periodically polls the server for new Fresh news queue items.
 * Called from background.js.
 */
async function demarrerPollingQueue() {
  // Poll every 30 seconds when sidepanel is open
  setInterval(async () => {
    const { [CLE_ONGLET_QUEUE]: ongletOuvert } = await chrome.storage.local.get(CLE_ONGLET_QUEUE)
    if (ongletOuvert) {
      await chargerQueue()
    }
  }, 30000)
}

// Start polling on load
demarrerPollingQueue()
