/**
 * The AI filling agent — the part that makes one extension work on every marketplace.
 *
 * Instead of a hand-written selector map per site (which breaks on every redesign
 * and would never cover 19 destinations), it:
 *   1. detects whether the user is logged in, and waits if not,
 *   2. serialises whatever form the page actually shows,
 *   3. asks the DropShipper IA API which value goes in which field,
 *   4. types the answers in and uploads the photos.
 *
 * It never fills credentials, and never clicks the final publish button: the seller
 * stays the one who publishes.
 */
;(() => {
  
  /** Labels a control by everything a human would read around it. */
  function describeField(el, index) {
    const id = el.id
    const labelFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : null
    const label =
      el.getAttribute('aria-label') ||
      labelFor ||
      el.closest('label')?.textContent ||
      el.getAttribute('placeholder') ||
      el.getAttribute('name') ||
      // Fall back to the nearest preceding text node, which is how most French
      // marketplaces render their field captions.
      el.parentElement?.previousElementSibling?.textContent ||
      ''

    const field = {
      ref: `f${index}`,
      label: label.replace(/\s+/g, ' ').trim().slice(0, 80),
      type: el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.type || 'text',
    }
    if (el.placeholder) field.placeholder = el.placeholder.slice(0, 60)
    if (el.required) field.required = true
    if (el.maxLength > 0 && el.maxLength < 100000) field.maxLength = el.maxLength
    if (el.tagName === 'SELECT') {
      field.options = [...el.options].map((o) => o.text.trim()).filter(Boolean).slice(0, 60)
    }
    return field
  }

  /** Field types we must never touch, whatever the model says. */
  const FORBIDDEN = /password|email|tel|card|cvc|iban|credit/i

  function collectFields() {
    const els = [...document.querySelectorAll('input, textarea, select')].filter((el) => {
      if (el.type === 'hidden' || el.disabled || el.readOnly) return false
      if (FORBIDDEN.test(el.type) || FORBIDDEN.test(el.name || '') || FORBIDDEN.test(el.id || '')) return false
      if (el.type === 'file' || el.type === 'submit' || el.type === 'button') return false
      // Skip anything not actually on screen (collapsed steps, hidden tabs).
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    return { els, fields: els.map(describeField).slice(0, 120) }
  }

  /**
   * Heuristic login check: a listing form only renders for a signed-in seller, so
   * the presence of a login form (or a visible "se connecter" action) means we wait.
   */
  function looksLoggedOut() {
    if (document.querySelector('input[type="password"]')) return true
    const text = document.body.innerText.slice(0, 2000).toLowerCase()
    return /connectez-vous|se connecter pour|veuillez vous connecter|sign in to continue/.test(text)
  }

  const api = (path, options) => apiFetch(path, options)

  function applyPlan(plan, els) {
    let applied = 0
    for (const assignment of plan.assignments) {
      const index = Number(assignment.ref.replace('f', ''))
      const el = els[index]
      if (!el) continue

      if (el.tagName === 'SELECT') {
        const option = [...el.options].find((o) => o.text.trim() === assignment.value)
        if (!option) continue
        el.value = option.value
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        setNativeValue(el, assignment.value)
      }
      applied++
    }
    return applied
  }

  async function run(job) {
    if (looksLoggedOut()) {
      showBanner(`Connectez-vous à ${job.platformLabel}, DropShipper IA démarrera tout seul.`, 'error')
      chrome.runtime.sendMessage({ type: 'dsp-needs-login', platform: job.platform })
      return { status: 'awaiting-login' }
    }

    showBanner(`DropShipper IA travaille sur ${job.platformLabel} — ne fermez pas cet onglet.`)

    const { els, fields } = collectFields()
    if (!fields.length) return { status: 'no-form' }

    const plan = await api(`/api/products/${job.productId}/fill-plan`, { method: 'POST', body: { platform: job.platform, fields } })

    const applied = applyPlan(plan, els)
    const fileInput = document.querySelector('input[type="file"]')
    const images = await attachImages(fileInput, job.images)

    const blocking = plan.skipped.filter((s) => s.reason !== 'non renseigné')
    showBanner(
      `${job.platformLabel} : ${applied} champ(s) remplis, ${images} photo(s).` +
        (blocking.length ? ` À compléter : ${blocking.map((s) => s.label).join(', ')}.` : '') +
        ' Relisez puis publiez vous-même.',
      blocking.length ? 'error' : 'info',
    )

    return { status: 'filled', applied, images, skipped: plan.skipped }
  }

  // The background worker drives this script once the tab is ready.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'dsp-run-agent') return
    run(message.job)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => {
        showBanner(`Échec sur ${message.job.platformLabel} : ${err.message}`, 'error')
        sendResponse({ ok: false, error: err.message })
      })
    return true // async response
  })
})()
