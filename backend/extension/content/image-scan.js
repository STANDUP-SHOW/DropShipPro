/**
 * Generic image discovery for any product page.
 *
 * Scanning `<img>` tags alone finds a fraction of a gallery: shops hide the real
 * URL in a data-* attribute, paint swatches with a CSS background, keep the full
 * gallery in an inline JSON blob, or render nothing until the element approaches
 * the viewport. This module looks in all of those places, with generic heuristics
 * only — no per-site selector, so it behaves the same on Banggood, Temu,
 * AliExpress or a plain Shopify shop.
 *
 * Two deliberate departures from the usual "download every image" extensions:
 *
 * - `data:`, `blob:` and serialised `<svg>`/`<canvas>` sources are skipped. Our
 *   server downloads each picture by URL to watermark it, and it cannot fetch an
 *   address that only exists inside the visitor's tab. Collecting them would only
 *   fill the picker with entries that fail on import.
 * - Page state objects are read from the text of `<script>` tags, never from
 *   `window.__NEXT_DATA__` and friends. A content script runs in an isolated
 *   world where those variables simply do not exist; reading them would silently
 *   return nothing.
 */

/** Attributes shops use to carry the real URL while `src` holds a placeholder. */
const DSP_IMAGE_ATTRS = [
  'data-src',
  'data-original',
  'data-lazy',
  'data-lazy-src',
  'data-bg',
  'data-background',
  'data-background-image',
  'data-img',
  'data-image',
  'data-url',
  'data-href',
  'data-thumb',
  'data-zoom-image',
  'data-large-image',
]

/** Safety rails: a huge page must not freeze the tab or flood the picker. */
const DSP_SCAN_LIMITS = { elements: 6000, urls: 1200, millis: 10000 }

const DSP_IMAGE_EXT = /\.(?:jpe?g|png|webp|avif|gif|bmp)(?:[?#]|$)/i

/** Absolute URL, or null when the value cannot be fetched by our server. */
function dspAbsoluteUrl(value) {
  if (!value || typeof value !== 'string') return null
  const raw = value.trim().replace(/^["']|["']$/g, '')
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('#')) return null

  try {
    // Resolves relative ("/img/a.jpg") and protocol-relative ("//cdn/a.jpg") forms,
    // which a plain startsWith('http') test throws away.
    const url = new URL(raw, location.href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Widest candidate of a srcset.
 *
 * Handles both descriptor forms: `w` (width in pixels) and `x` (pixel density).
 * Without this the first entry wins, which is usually the smallest.
 */
function dspWidestFromSrcset(srcset) {
  if (!srcset) return null

  const candidates = srcset
    .split(',')
    .map((part) => {
      const [url, descriptor = ''] = part.trim().split(/\s+/)
      const width = /^(\d+(?:\.\d+)?)w$/.exec(descriptor)
      const density = /^(\d+(?:\.\d+)?)x$/.exec(descriptor)
      // Density is turned into a comparable weight so both forms sort together.
      const weight = width ? Number(width[1]) : density ? Number(density[1]) * 1000 : 1
      return { url, weight }
    })
    .filter((c) => c.url)
    .sort((a, b) => b.weight - a.weight)

  return candidates[0]?.url ?? null
}

/** Every url(...) inside a CSS value — a background can declare several layers. */
function dspUrlsFromCss(value) {
  if (!value || value === 'none') return []
  return [...value.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2])
}

/** Collects from one element, whatever kind of element it is. */
function dspSourcesOfElement(el, push) {
  const tag = el.tagName

  if (tag === 'IMG') {
    push(dspWidestFromSrcset(el.getAttribute('srcset') || el.getAttribute('data-srcset')))
    // currentSrc is what the browser actually picked, which can differ from src.
    push(el.currentSrc)
    push(el.getAttribute('src'))
  } else if (tag === 'SOURCE') {
    push(dspWidestFromSrcset(el.getAttribute('srcset')))
    push(el.getAttribute('src'))
  } else if (tag === 'VIDEO') {
    push(el.getAttribute('poster'))
  }

  for (const attr of DSP_IMAGE_ATTRS) {
    const value = el.getAttribute?.(attr)
    if (value) {
      // Some shops put a whole srcset in a data attribute.
      push(value.includes(',') && /\s\d+[wx]/.test(value) ? dspWidestFromSrcset(value) : value)
    }
  }

  // Inline style first — it is free to read. The computed style is what catches
  // backgrounds declared in an external stylesheet, and is the expensive part.
  for (const url of dspUrlsFromCss(el.style?.backgroundImage)) push(url)

  const computed = getComputedStyle(el)
  for (const url of dspUrlsFromCss(computed.backgroundImage)) push(url)
  for (const pseudo of ['::before', '::after']) {
    for (const url of dspUrlsFromCss(getComputedStyle(el, pseudo).content)) push(url)
  }
}

/** Walks a document or shadow root, following open shadow roots and same-origin iframes. */
function dspWalkRoot(root, push, state) {
  let elements
  try {
    elements = root.querySelectorAll('*')
  } catch {
    return
  }

  for (const el of elements) {
    if (state.scanned++ > DSP_SCAN_LIMITS.elements) return
    if (Date.now() > state.deadline) return

    try {
      dspSourcesOfElement(el, push)
    } catch {
      // A single hostile element must not abort the whole scan.
    }

    // Only open shadow roots are readable; a closed one is invisible to everyone.
    if (el.shadowRoot) dspWalkRoot(el.shadowRoot, push, state)

    if (el.tagName === 'IFRAME') {
      try {
        const doc = el.contentDocument
        if (doc) dspWalkRoot(doc, push, state)
      } catch {
        // Cross-origin frame: unreadable by design.
      }
    }
  }
}

/** Pulls image URLs out of a parsed JSON value, wherever they sit in the tree. */
function dspUrlsFromJson(value, out, depth = 0) {
  if (!value || depth > 8 || out.length > DSP_SCAN_LIMITS.urls) return

  if (typeof value === 'string') {
    if (DSP_IMAGE_EXT.test(value) || /^https?:\/\/[^\s"']+\/[^\s"']*image/i.test(value)) out.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) dspUrlsFromJson(item, out, depth + 1)
    return
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) dspUrlsFromJson(item, out, depth + 1)
  }
}

/**
 * The gallery as the page's own data describes it.
 *
 * On sites where the carousel swaps a single <img>, this is the only place the
 * other shots exist. Read from script text rather than from window: a content
 * script cannot see the page's global variables.
 */
function dspImagesFromScripts() {
  const out = []

  for (const script of document.querySelectorAll('script')) {
    const type = (script.getAttribute('type') || '').toLowerCase()
    const text = script.textContent
    if (!text || text.length > 4_000_000) continue

    if (type.includes('ld+json') || type.includes('json')) {
      try {
        dspUrlsFromJson(JSON.parse(text), out)
        continue
      } catch {
        // Malformed JSON-LD is common; fall through to the regex below.
      }
    }

    if (!/image|img|photo|gallery|\.jpe?g|\.png|\.webp/i.test(text)) continue

    // Escaped slashes are how framework payloads embed URLs.
    const unescaped = text.replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
    for (const match of unescaped.matchAll(/https?:\/\/[^\s"'\\<>]+?\.(?:jpe?g|png|webp|avif)/gi)) {
      out.push(match[0])
      if (out.length > DSP_SCAN_LIMITS.urls) return out
    }
  }

  return out
}

/**
 * Nudges the page into loading what it defers.
 *
 * Two mechanisms at once: scrolling triggers the IntersectionObserver most lazy
 * loaders rely on, and a MutationObserver picks up the nodes that arrive while
 * we are scrolling, which a single snapshot afterwards would miss.
 */
async function dspRevealLazyImages(onUrl) {
  const start = window.scrollY
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        try {
          dspSourcesOfElement(node, onUrl)
          for (const child of node.querySelectorAll?.('img, source, video, [style*="background"]') ?? []) {
            dspSourcesOfElement(child, onUrl)
          }
        } catch {
          // Ignore: this is a best-effort supplement to the main scan.
        }
      }
      if (record.type === 'attributes' && record.target.nodeType === 1) {
        try {
          dspSourcesOfElement(record.target, onUrl)
        } catch {
          // Same.
        }
      }
    }
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'style', ...DSP_IMAGE_ATTRS],
  })

  const height = document.body?.scrollHeight ?? 0
  for (const ratio of [0.15, 0.35, 0.6, 0.85]) {
    window.scrollTo({ top: Math.round(height * ratio), behavior: 'instant' })
    await new Promise((r) => setTimeout(r, 220))
  }
  window.scrollTo({ top: start, behavior: 'instant' })
  await new Promise((r) => setTimeout(r, 250))

  observer.disconnect()
}

/**
 * Every image URL the page exposes, absolute and deduplicated.
 *
 * Returns raw candidates: filtering by real size, ordering and picking is the
 * caller's job — capture.js measures them and shows the picker.
 */
async function dspScanPageImages() {
  const found = new Set()
  const state = { scanned: 0, deadline: Date.now() + DSP_SCAN_LIMITS.millis }

  const push = (value) => {
    if (found.size >= DSP_SCAN_LIMITS.urls) return
    const url = dspAbsoluteUrl(value)
    if (url) found.add(url)
  }

  // Lazy content first, with the observer catching what appears meanwhile.
  await dspRevealLazyImages(push)

  dspWalkRoot(document, push, state)
  for (const url of dspImagesFromScripts()) push(url)

  return [...found]
}
