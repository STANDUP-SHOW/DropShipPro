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
    // AVIF et GIF compris : les galeries récentes ne servent plus que de l'AVIF,
    // et l'omettre revenait à ne jamais voir les photos du produit dans le source.
    const found = html.match(/https:\/\/[^"'\\\s)]+?\.(?:jpe?g|png|webp|avif|gif)/gi) || []

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

  /**
   * Le côté minimum d'une photo retenue.
   *
   * Cinq cents pixels paraissait prudent et coupait exactement ce qu'on
   * cherchait : la galerie d'AliExpress est servie en 480×480, et chacune de ses
   * photos était donc écartée. Un import ramenait le mobilier de la page et pas
   * un seul cliché du produit.
   */
  const MIN_SIDE = 400

  /**
   * Combien de photos une annonce accepte.
   *
   * **Le même nombre que le serveur**, qui vaut 15 depuis le 02/09/2026
   * (`services/imageSelect.ts`). Il était écrit 10 ici, en dur, à trois
   * endroits — la présélection, la phrase d'explication et le compteur. Le
   * plafond avait été relevé partout ailleurs et ce fichier ne l'avait pas su :
   * le vendeur lisait « 15 photos » dans l'application et n'en cochait que dix
   * dans l'extension, sans que rien n'explique l'écart.
   *
   * Un nombre partagé entre deux programmes qui ne se parlent pas doit être
   * écrit une fois de chaque côté et porter la mention de l'autre. À défaut de
   * pouvoir l'importer, c'est ce commentaire qui tient lieu de lien.
   */
  const PHOTOS_MAX = 15

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
      let settled = false
      const done = (value) => {
        if (settled) return
        settled = true
        img.onload = img.onerror = null
        // Release the decoded bitmap at once: a few hundred product photos held
        // in memory are enough to freeze a low-power machine.
        img.src = ''
        resolve(value)
      }
      img.onload = () => done({ url, width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => done(null)
      // A stalled request must not hold the whole import.
      setTimeout(() => done(null), 5000)
      img.src = url
    })
  }

  /** How many candidates are downloaded at once, and how long the whole step may take. */
  /*
   * Le budget etait atteint avant la fin de la mesure.
   *
   * 260 candidats fois leurs variantes font jusqu a huit cents adresses a
   * mesurer. A douze de front et trente secondes, un CDN lent en laissait la
   * moitie non mesuree — donc jamais proposee. Le vendeur voyait dix photos la
   * ou la page en portait cent, et rien ne le lui disait.
   *
   * Le plafond de securite reste : il protege d une page qui expose des
   * milliers d adresses, et la boucle s arrete toujours.
   */
  const MEASURE_CONCURRENCY = 24
  const MEASURE_BUDGET_MS = 45000

  /**
   * Measures candidates a few at a time, with a budget for the whole step.
   *
   * A single `Promise.all` over the full list fired up to a thousand image
   * downloads simultaneously. The browser decodes each one into memory, and on a
   * small machine the tab stops responding — the import looked stuck on the
   * images step, on every site. The pool keeps the number of live requests low,
   * and the budget guarantees the step ends even when the CDN never answers.
   */
  /**
   * Ce que la page connait deja de ses propres images.
   *
   * **C est la difference avec ImageEye**, et elle explique « il les prend, nous
   * non ». Il ne mesure rien : il lit `naturalWidth` sur les images que le
   * navigateur a deja chargees pour afficher la page. Nous, nous rechargions
   * chacune par le reseau -- et une photo que le CDN sert lentement, refuse en
   * cross-origin ou fait expirer disparaissait purement et simplement, alors
   * qu elle etait affichee a l ecran avec ses dimensions connues.
   *
   * Les images du DOM sont donc mesurees d avance, gratuitement et sans echec
   * possible. Le reseau ne sert plus qu a ce que la page n a pas charge.
   */
  function tailleDejaConnues() {
    const connues = new Map()
    const noter = (url, w, h) => {
      if (!url || !w || !h) return
      const absolue = url.startsWith('//') ? `https:${url}` : url
      if (!absolue.startsWith('http')) return
      const vue = connues.get(absolue)
      // La plus grande vue l emporte : la meme adresse peut servir une vignette
      // et un agrandissement.
      if (!vue || w * h > vue.width * vue.height) connues.set(absolue, { url: absolue, width: w, height: h })
    }

    for (const img of document.querySelectorAll('img')) {
      noter(img.currentSrc || img.getAttribute('src'), img.naturalWidth, img.naturalHeight)
    }
    return connues
  }

  async function measureAll(urls) {
    const deadline = Date.now() + MEASURE_BUDGET_MS
    const connues = tailleDejaConnues()
    const measured = []
    const queue = []

    for (const url of urls) {
      const deja = connues.get(url)
      // Une image de moins de deux pixels de cote n est pas chargee : la mesurer
      // pour de vrai reste necessaire.
      if (deja && deja.width > 1 && deja.height > 1) measured.push(deja)
      else queue.push(url)
    }

    if (measured.length) {
      console.info(
        `DropShipper IA : ${measured.length} image(s) deja mesurees par la page, ${queue.length} a charger`,
      )
    }

    /*
     * Une mesure qui echoue ne fait plus disparaitre la photo.
     *
     * Un CDN lent, un refus cross-origin, un delai depasse : l adresse etait
     * jetee sans retour, et le vendeur voyait dix photos la ou la page en
     * portait cent. Elle est desormais rendue avec une taille inconnue -- zero --
     * ce qui la range dans la bande depliable au lieu de la selection par
     * defaut. Rien n est perdu, rien ne pollue.
     */
    const worker = async () => {
      while (queue.length) {
        if (Date.now() > deadline) {
          // Le budget est atteint : le reste n a pas ete tente, mais on le rend
          // quand meme plutot que de faire comme s il n existait pas.
          while (queue.length) measured.push({ url: queue.shift(), width: 0, height: 0, mesuree: false })
          return
        }
        const url = queue.shift()
        const result = await measure(url)
        measured.push(result ?? { url, width: 0, height: 0, mesuree: false })
      }
    }

    const workers = []
    for (let i = 0; i < Math.min(MEASURE_CONCURRENCY, queue.length); i++) workers.push(worker())
    await Promise.all(workers)

    return measured
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

    // Le même cliché est souvent servi en plusieurs formats. Tenter le jpg quand
    // on tient l'avif coûte une requête et rattrape les cas où le navigateur
    // refuse de mesurer le format récent.
    if (/\.avif$/i.test(stripped)) out.push(stripped.replace(/\.avif$/i, '.jpg'))

    return out
  }

  /**
   * Product photos live under a recognisable path on every supplier CDN
   * (`/product/`, `/goods/`, `/item/`…), while banners, logos and interface
   * assets do not. Ranking on that puts the gallery ahead of the page furniture.
   */
  const PRODUCT_PATH = /\/(?:product|products|goods|item|items|sku|detail)\//i

  /**
   * Ce qui n'est jamais une photo de produit.
   *
   * Écrit et utilisé trois fois, mais défini nulle part : chaque import qui
   * arrivait au classement des images levait « NOT_A_PHOTO is not defined » et
   * s'arrêtait là. C'est la panne « l'import bloque à l'étape des images, sur
   * tous les sites » — elle n'avait rien d'une machine lente, et le contrôle de
   * syntaxe ne pouvait pas la voir. D'où extension/check.cjs.
   *
   * Le mobilier de la page, en somme : icônes, logos, avatars, drapeaux, pixels
   * de mesure, sprites, vignettes minuscules et formats qui ne servent jamais à
   * une fiche produit.
   */
  const NOT_A_PHOTO =
    /sprite|icon|logo|avatar|pixel|badge|flag|placeholder|blank\.|1x1|loading|spinner|banner|\.svg(?:[?#]|$)|\.gif(?:[?#]|$)|_(?:[1-9]\d?|1[0-4]\d)x(?:[1-9]\d?|1[0-4]\d)\.|\/(?:assets|static)\/(?:icons?|ui|common)\//i

  /**
   * Ce qui est bien une photo, mais pas celle du produit ouvert.
   *
   * Une fiche affiche aussi les articles conseillés, les articles vus récemment
   * et les publicités : de vraies photos, au bon format, servies par le bon CDN.
   * Le score ne peut les distinguer que par le chemin, d'où cette liste — elle
   * pénalise sans exclure, car un fournisseur range parfois sa galerie sous
   * « /recommend/ » sans arrière-pensée.
   */
  const OFF_TOPIC =
    /recommend|related|similar|also-?(?:like|bought|viewed)|you-?may|cross-?sell|upsell|recently|sponsor|[-_\/](?:ads?|advert)[-_\/]/i

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

    /**
     * L'adaptateur du fournisseur, quand il en existe un.
     *
     * Chaque site range ses photos à un endroit précis et le fait toujours de la
     * même façon. Un adaptateur écrit une fois donne un résultat juste à tous
     * les coups, là où le scan générique devine — c'est ce qui ramenait des
     * pictogrammes d'interface avant les photos du produit.
     *
     * Ses adresses passent devant tout le reste. S'il ne trouve rien, le scan
     * générique reprend la main : un adaptateur muet ne doit pas vider la page.
     */
    const adapter = typeof dspAdapterFor === 'function' ? dspAdapterFor() : null
    const fromAdapter = []
    if (adapter) {
      try {
        for (const url of dspAdapterImages(adapter)) {
          fromAdapter.push(url)
          candidates.add(url)
        }
        console.info(
          `DropShipper IA : adaptateur ${adapter.label} — ${fromAdapter.length} photo(s)`,
        )
      } catch (err) {
        console.warn('DropShipper IA : adaptateur en échec, scan générique utilisé', err)
      }
    }

    // Generic deep scan (see content/image-scan.js): every element, not only
    // <img> — data-* attributes, CSS backgrounds, ::before/::after, <picture>,
    // <video poster>, open shadow roots, same-origin frames, and the gallery as
    // the page's own JSON describes it. This is what separates two photos from a
    // full gallery on shops that lazy-load or swap a single carousel <img>.
    try {
      for (const url of await dspScanPageImages()) {
        if (!JUNK.test(url)) candidates.add(url)
      }
    } catch (err) {
      // Repli sur l'ancien chemin : au moins provoquer le chargement différé,
      // que le scan approfondi aurait fait lui-même.
      console.warn('DropShipper IA : scan approfondi indisponible', err)
      await revealLazyImages()
    }

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
    /**
     * L'hôte qui sert la galerie.
     *
     * Une fiche produit charge ses photos depuis un CDN dédié — aliexpress-media,
     * kwcdn, cdn.shopify — et tout le reste (icônes, bannières, avatars) vient
     * d'ailleurs. Le repérer sans coder un domaine par fournisseur : c'est celui
     * qui sert le plus d'images sur la page.
     */
    const hostCount = new Map()
    for (const url of candidates) {
      if (NOT_A_PHOTO.test(url)) continue
      try {
        const host = new URL(url).host
        hostCount.set(host, (hostCount.get(host) ?? 0) + 1)
      } catch {
        // Une adresse illisible ne compte pour aucun hôte.
      }
    }
    const galleryHost = [...hostCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    /**
     * Le score décide de l'ordre, et donc de ce que le vendeur voit en premier.
     *
     * Sans lui, une page pouvait rendre cent quatre-vingts vignettes où les
     * icônes d'interface passaient devant les photos du produit.
     */
    /*
     * Les deux signaux que le relevé du serveur avait et pas celui-ci.
     *
     * L'extension travaille sur Temu et AliExpress, c'est-à-dire là où l'on
     * importe le plus, et elle triait avec un critère de moins. Deux relevés
     * qui divergent finissent par se tromper différemment, ce qui est pire
     * qu'un seul défaut.
     *
     * Comparés sur l'identité et non sur l'adresse : la page lie souvent la
     * vignette là où og:image donne l'original, et ce sont bien les deux mêmes
     * photos.
     */
    const meta = self.dspScanMeta ?? { declarees: [], mobilier: [] }
    const declarees = new Set((meta.declarees ?? []).map(photoIdentity))
    const mobilier = new Set((meta.mobilier ?? []).map(photoIdentity))

    const score = (url) => {
      if (NOT_A_PHOTO.test(url)) return -1000
      let value = 0
      const identite = photoIdentity(url)
      // Ce que le marchand déclare lui-même passe avant toute heuristique :
      // elle sait, les autres critères devinent.
      if (declarees.has(identite)) value += 5000
      // Le mobilier n'est jamais le produit, sur aucun site — sauf si le
      // marchand le déclare lui-même, ce que le bonus au-dessus rattrape.
      if (mobilier.has(identite)) value -= 4000
      try {
        if (galleryHost && new URL(url).host === galleryHost) value += 1000
      } catch {
        // Adresse illisible : elle garde son score de base.
      }
      if (PRODUCT_PATH.test(url)) value += 200
      if (OFF_TOPIC.test(url)) value -= 500
      return value
    }

    // Ce que l'adaptateur a désigné passe avant tout : il sait, le score devine.
    const adapterSet = new Set(fromAdapter)
    const ranked = [...candidates]
      .filter((u) => !NOT_A_PHOTO.test(u))
      // Le mobilier de page ne remonte pas dans le sélecteur : le vendeur
      // choisit ensuite, mais il ne doit pas avoir à décocher la bannière de
      // soldes du site à chaque import.
      .filter((u) => score(u) >= 0 || adapterSet.has(u))
      .sort((a, b) => {
        const byAdapter = Number(adapterSet.has(b)) - Number(adapterSet.has(a))
        return byAdapter !== 0 ? byAdapter : score(b) - score(a)
      })

    // Le plafond protège d'une page qui expose des milliers d'adresses, mais il
    // était atteint bien avant la fin du classement : des candidats n'étaient
    // jamais mesurés, donc jamais proposés. Le classement met désormais les
    // bonnes en tête, on peut en examiner davantage sans y perdre.
    const probes = ranked.slice(0, 260).flatMap(sizeVariants)
    const measured = await measureAll([...new Set(probes)])

    /*
     * Le classement survit à la mesure.
     *
     * Trier les images mesurées par surface décroissante jetait tout le travail
     * de score : le chemin produit, l'adaptateur du fournisseur, le CDN
     * dominant. Une bannière de 1600×900 passait donc devant une photo de
     * produit de 800×800, et le vendeur voyait « du mauvais » en tête alors que
     * le tri, lui, avait vu juste.
     *
     * La surface ne départage plus que des candidats de même rang — ce qu'elle
     * sait faire, et la seule chose qu'elle sache.
     */
    const rang = new Map(ranked.map((u, i) => [photoIdentity(u), i]))
    const rangDe = (url) => {
      const direct = rang.get(photoIdentity(url))
      if (direct !== undefined) return direct
      // Une variante pleine taille hérite du rang de l'adresse dont elle vient.
      return rang.has(photoIdentity(url.split('?')[0])) ? rang.get(photoIdentity(url.split('?')[0])) : 9999
    }

    const parRang = (a, b) => {
      const ecart = rangDe(a.url) - rangDe(b.url)
      return ecart !== 0 ? ecart : b.width * b.height - a.width * a.height
    }

    const large = measured
      .filter((m) => Math.min(m.width, m.height) >= MIN_SIDE)
      .sort(parRang)

    /*
     * Les adresses non mesurees, gardees a part.
     *
     * Elles ne peuvent pas etre selectionnees par defaut -- on ignore leur
     * taille, et proposer une banniere en premiere photo est le defaut qu on
     * corrige depuis le debut. Mais les jeter revient a faire mieux que le
     * navigateur ne sait faire : elles rejoignent la bande depliable, ou le
     * vendeur decide.
     */
    const nonMesurees = measured.filter((m) => m.mesuree === false)

    // Nothing big enough — a small gallery, or images blocked from measurement.
    // Fall back to the biggest available rather than returning nothing.
    // Le repli ne prend que ce qui a ete reellement mesure : proposer par
    // defaut une adresse dont on ignore la taille, c est reproduire le defaut
    // qu on corrige -- une banniere en premiere photo.
    const chosen = large.length ? large : measured.filter((m) => m.mesuree !== false).sort(parRang)

    // Deduplicate: the same photo often appears at several sizes.
    const seen = new Set()
    const unique = []
    for (const item of chosen) {
      const identity = photoIdentity(item.url)
      if (seen.has(identity)) continue
      seen.add(identity)
      unique.push(item)
    }

    /*
     * Le mobilier de page, mesuré à part plutôt qu'écarté sans retour.
     *
     * L'écarter du classement était juste : une bannière de soldes ne doit pas
     * disputer la première place à une photo du produit. Mais le jeter tout à
     * fait prive le vendeur d'un recours quand notre tri se trompe — et il se
     * trompera. Il est donc mesuré aussi, et rangé dans une bande à part que
     * l'on déplie si besoin. Rien n'est perdu, rien ne pollue.
     */
    /*
     * Ce qui est mis de cote, et qui ne doit pas disparaitre.
     *
     * Deux populations, et une seule etait recuperable : le mobilier de page
     * (score negatif), et les images **trop petites** pour le seuil. Les
     * secondes etaient jetees sans retour — or une fiche dont toutes les photos
     * font 350 px n a rien d anormal, et le vendeur se retrouvait devant une
     * liste vide sans comprendre.
     */
    const gardees = new Set(measured.map((m) => photoIdentity(m.url)))
    const petites = measured
      .filter((m) => m.mesuree !== false && Math.min(m.width, m.height) < MIN_SIDE)
      .sort(parRang)
      // Les non mesurees ferment la marche : ce sont les moins sures de toutes.
      .concat(nonMesurees.sort(parRang).slice(0, 40))
    const ecartes = [...candidates].filter((u) => !NOT_A_PHOTO.test(u) && score(u) < 0 && !adapterSet.has(u))
    const mobilierMesure = []
    if (ecartes.length) {
      const mesures = await measureAll([...new Set(ecartes.slice(0, 24))])
      const vus = new Set(unique.map((i) => photoIdentity(i.url)))
      for (const m of mesures.sort((a, b) => b.width * b.height - a.width * a.height)) {
        const identity = photoIdentity(m.url)
        if (vus.has(identity)) continue
        vus.add(identity)
        mobilierMesure.push(m)
        if (mobilierMesure.length >= 12) break
      }
    }

    // Les trop petites rejoignent la meme bande : rien n est perdu, rien ne
    // pollue la selection par defaut.
    const vusFinal = new Set([...unique, ...mobilierMesure].map((i) => photoIdentity(i.url)))
    for (const m of petites) {
      const identity = photoIdentity(m.url)
      if (vusFinal.has(identity)) continue
      vusFinal.add(identity)
      mobilierMesure.push(m)
      if (mobilierMesure.length >= 40) break
    }
    void gardees

    return { produits: unique, mobilier: mobilierMesure }
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
  /**
   * Le texte de la fiche, caractéristiques techniques comprises.
   *
   * Quinze mille caractères et non quatre mille. La coupe précédente tombait
   * avant le tableau des caractéristiques, qui est presque toujours sous la
   * galerie et sous la description : « bracelet acier inoxydable » et « 22
   * rubis sur le cadran » n'atteignaient donc jamais le serveur. Un import
   * ramenait une annonce lisse, sans rien de ce qui fait acheter.
   *
   * Les tableaux sont relevés à part et remis en tête : ce sont eux qui portent
   * les caractéristiques, et ils survivent ainsi à la coupe même sur une page
   * bavarde.
   */
  function collectPageText() {
    const main =
      document.querySelector('main') ||
      document.querySelector('[class*="detail" i]') ||
      document.body

    const tableaux = []
    for (const table of document.querySelectorAll('table, dl, [class*="spec" i], [class*="param" i], [class*="attribute" i]')) {
      const texte = (table.innerText || '').replace(/\n{2,}/g, '\n').trim()
      // Deux lignes au moins, sinon c'est une étiquette isolée ; et pas un
      // pavé entier, qui serait la page elle-même reprise deux fois.
      if (texte && texte.length > 20 && texte.length < 4000 && texte.includes('\n')) {
        tableaux.push(texte)
      }
      if (tableaux.length >= 6) break
    }

    const corps = (main.innerText || '').replace(/\n{2,}/g, '\n')
    const entete = tableaux.length ? `CARACTÉRISTIQUES\n${tableaux.join('\n\n')}\n\n` : ''
    return `${entete}${corps}`.slice(0, 15000)
  }

  /**
   * La description du fournisseur, la vraie.
   *
   * `og:description` est une accroche commerciale de cent cinquante caractères,
   * et c'était tout ce que le serveur recevait : la réécriture partait donc
   * d'un résumé publicitaire, sans une seule caractéristique technique. On
   * cherche d'abord un vrai bloc de description dans la page, et l'accroche ne
   * sert plus que de dernier recours.
   */
  function collectDescription() {
    const candidats = [
      '[class*="description" i]',
      '[id*="description" i]',
      '[class*="product-detail" i]',
      '[class*="detail-content" i]',
      '[itemprop="description"]',
    ]

    let meilleur = ''
    for (const selecteur of candidats) {
      for (const el of document.querySelectorAll(selecteur)) {
        const texte = (el.innerText || '').replace(/\n{2,}/g, '\n').trim()
        // Le plus long l'emporte : les sites imbriquent plusieurs conteneurs
        // « description », dont le plus externe porte le texte complet.
        if (texte.length > meilleur.length && texte.length < 20000) meilleur = texte
      }
      if (meilleur.length > 400) break
    }

    if (meilleur.length > 120) return meilleur.slice(0, 8000)

    return (
      document.querySelector('meta[property="og:description"]')?.content ||
      document.querySelector('meta[name="description"]')?.content ||
      meilleur ||
      ''
    )
  }

  /** Ce qu'un sélecteur d'options s'appelle, d'un fournisseur à l'autre. */
  const GROUPE_OPTIONS =
    '[class*="sku" i], [class*="variant" i], [class*="option" i], [class*="swatch" i], [class*="choice" i], [class*="attribute" i], [data-testid*="sku" i], [data-testid*="variant" i]'

  /** Ce qui porte le nom du groupe : « Taille », « Couleur », « Modèle ». */
  const ETIQUETTE = 'label, legend, dt, [class*="title" i], [class*="label" i], [class*="name" i]'

  /**
   * Les options réellement proposées à la sélection.
   *
   * Relevé structurel, forcément imparfait : ces sites obfusquent leurs classes
   * et changent de gabarit d'une catégorie à l'autre. Il ne se suffit pas à
   * lui-même — le serveur relit le texte de la page avec le modèle et fusionne
   * les deux relevés. Ici on ratisse plus large qu'avant, où seuls trois noms de
   * classe étaient reconnus et où un `<select>` natif, le cas le plus simple,
   * n'était pas regardé du tout.
   */
  function collectVariants() {
    const variants = {}

    const ajouter = (nom, valeurs) => {
      const propres = [...new Set(valeurs.map((v) => (v || '').trim()).filter((v) => v && v.length < 40))]
      if (propres.length > 1) variants[nom] = propres.slice(0, 25)
    }

    // Le cas simple, et le plus sûr : un <select> avec ses <option>.
    for (const select of document.querySelectorAll('select')) {
      const nom =
        select.getAttribute('aria-label') ||
        select.closest('label')?.textContent?.trim() ||
        document.querySelector(`label[for="${CSS.escape(select.id)}"]`)?.textContent?.trim() ||
        select.name
      if (!nom || nom.length > 40) continue
      const valeurs = [...select.options]
        .map((o) => o.textContent.trim())
        // « Choisir une taille » n'est pas une taille.
        .filter((v) => v && !/^(choisir|s[ée]lection|please|select|--)/i.test(v))
      ajouter(nom.replace(/\s*:\s*$/, ''), valeurs)
    }

    for (const group of document.querySelectorAll(GROUPE_OPTIONS)) {
      const brut = group.querySelector(ETIQUETTE)?.textContent?.trim()
      if (!brut || brut.length > 40) continue
      // Le nom vient souvent avec la valeur choisie : « Couleur : Noir ».
      const nom = brut.split(/[:：]/)[0].trim()
      if (!nom) continue

      const valeurs = [...group.querySelectorAll('button, li, [role="option"], [role="radio"], img[alt]')].map(
        (el) => el.getAttribute('aria-label') || el.getAttribute('alt') || el.textContent.trim(),
      )
      ajouter(nom, valeurs)
    }

    return Object.keys(variants).length ? variants : null
  }

  /**
   * Demande le relevé des variantes au script qui vit dans la page.
   *
   * **Il ne peut pas être appelé directement.** Ce fichier tourne dans le monde
   * isolé du script de contenu ; le releveur doit tourner dans celui de la page,
   * seul endroit d'où les propriétés React sont visibles. Deux mondes, deux tas
   * JavaScript : il n'y a pas de fonction commune, seulement le DOM.
   *
   * La charge revient en **texte JSON** : un objet passé dans le `detail` d'un
   * évènement franchit mal la frontière et arrive vide de l'autre côté, sans
   * erreur — le genre de panne qu'on met des heures à voir.
   */
  function releverSkuAliExpress() {
    if (!/aliexpress\./i.test(location.hostname)) return Promise.resolve(null)

    return new Promise((resolve) => {
      let repondu = false
      const fini = (valeur) => {
        if (repondu) return
        repondu = true
        window.removeEventListener('dsp-sku-reponse', surReponse)
        resolve(valeur)
      }

      const surReponse = (e) => {
        try {
          fini(e.detail ? JSON.parse(e.detail) : null)
        } catch {
          fini(null)
        }
      }

      window.addEventListener('dsp-sku-reponse', surReponse)
      window.dispatchEvent(new CustomEvent('dsp-sku-demande'))

      /*
       * Deux secondes, puis on continue sans les variantes.
       *
       * Le releveur peut ne pas être là — site non autorisé, page qui vient de
       * changer, enregistrement pas encore pris. Attendre indéfiniment
       * bloquerait tout l'import pour un supplément : les photos, le titre et
       * le prix valent d'être pris même sans la matrice.
       */
      setTimeout(() => fini(null), 2000)
    })
  }

  async function buildPayload() {
    // Pas de défilement ici : collectImages() vient de le faire, et le refaire
    // coûtait une seconde et demie pour rien.
    return {
      sourceUrl: location.href,
      title:
        document.querySelector('meta[property="og:title"]')?.content ||
        document.querySelector('h1')?.textContent?.trim() ||
        document.title,
      description: collectDescription(),
      price: collectPrice(),
      currency: /\$/.test(document.body.innerText.slice(0, 3000)) ? 'USD' : 'EUR',
      images: [],
      sourceCategory: collectCategory(),
      variants: collectVariants(),
      /*
       * Les combinaisons d AliExpress, avec leur prix et leur photo.
       *
       * `variants` ne porte que des libelles. Sans ces deux modules, une fiche
       * a douze couleurs se publie avec douze fois le meme prix et aucune
       * image -- non par defaut d appel, mais faute d avoir quoi que ce soit a
       * transmettre. La jointure est faite par le serveur, qu on peut corriger
       * sans republier l extension.
       */
      skuAliExpress: await releverSkuAliExpress(),
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
   * Le format d'un fichier, lu dans son adresse.
   *
   * Les CDN servent la même photo en plusieurs formats, et l'AVIF d'aujourd'hui
   * est le JPEG d'hier : afficher le format évite de télécharger dix fois le
   * même cliché en croyant varier.
   */
  function formatOf(url) {
    const m = url.split('?')[0].match(/\.(jpe?g|png|webp|avif|gif|bmp)$/i)
    return m ? m[1].toUpperCase().replace('JPEG', 'JPG') : '?'
  }

  /**
   * Le poids d'une image, quand le navigateur le sait déjà.
   *
   * Lu dans les mesures de performance de la page : l'image a été téléchargée
   * pour être affichée, sa taille est donc connue et gratuite. Une requête HEAD
   * par vignette donnerait le poids de toutes, au prix d'une centaine d'allers-
   * retours réseau — trop cher pour un renseignement de confort.
   */
  function weightOf(url) {
    try {
      const entry = performance.getEntriesByName(url)[0]
      const bytes = entry?.transferSize || entry?.encodedBodySize
      if (!bytes) return null
      return bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)} Mo`
        : `${Math.round(bytes / 1024)} Ko`
    } catch {
      return null
    }
  }

  /** Les trois tailles d'affichage de la grille, comme dans les outils du genre. */
  const AFFICHAGES = [
    { id: 'grand', label: 'Grand', colonne: '220px', hauteur: '240px' },
    { id: 'moyen', label: 'Moyen', colonne: '140px', hauteur: '170px' },
    { id: 'petit', label: 'Petit', colonne: '92px', hauteur: '110px' },
  ]

  /**
   * Lets the seller pick the photos.
   *
   * Guessing which pictures belong to the product failed on every attempt: these
   * pages hide the gallery behind obfuscated markup, and any rule that works on
   * one shop breaks on the next. Showing every image found, biggest first, and
   * letting the user tick them is the approach image-downloader extensions use —
   * it cannot silently pick the wrong ones.
   *
   * L'ergonomie reprend celle des extracteurs d'images qui font référence, parce
   * qu'elle a fait ses preuves : le format et les dimensions écrits sur chaque
   * vignette, des filtres qui annoncent leur nombre avant qu'on clique, un
   * réglage de densité, et de quoi tout effacer. Ce que nous ajoutons et qu'ils
   * n'ont pas : le tri met les photos du produit devant, et le mobilier de la
   * page est rangé à part au lieu d'être mélangé.
   */
  function choosePhotos(trouve) {
    const produits = Array.isArray(trouve) ? trouve : (trouve?.produits ?? [])
    const mobilier = Array.isArray(trouve) ? [] : (trouve?.mobilier ?? [])

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
        width: 'min(980px, 100%)',
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1b1633',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: '16px',
        color: '#fff',
        overflow: 'hidden',
      })

      /*
       * L'ordre affiché et les cases cochées viennent de `photo-preselect.js`.
       *
       * La règle a régressé deux fois en vivant ici, au milieu de la
       * construction de l'interface : aucun banc ne pouvait l'atteindre. Elle
       * est maintenant dans un fichier à part, éprouvé par
       * `check-preselection.cjs` sur une page qui mélange galerie, produits
       * recommandés et bannières.
       */
      const { ordre: sorted, coches } = window.__dspPreselectionnerPhotos(produits, {
        max: PHOTOS_MAX,
        coteMin: MIN_SIDE,
      })

      // Sizes actually present, so the seller can isolate the gallery: on Temu the
      // product shots are all 800×800 while the surrounding clutter is not.
      const sizes = [...new Set(sorted.map((i) => `${i.width}×${i.height}`))]
        .map((label) => ({ label, count: sorted.filter((i) => `${i.width}×${i.height}` === label).length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)

      // Les formats présents, avec leur nombre : on sait ce qu'on obtiendra
      // avant de cliquer, et un format absent ne s'affiche pas du tout.
      const formats = [...new Set(sorted.map((i) => formatOf(i.url)))]
        .map((label) => ({ label, count: sorted.filter((i) => formatOf(i.url) === label).length }))
        .sort((a, b) => b.count - a.count)

      /**
       * Une présélection, plutôt qu'une grille vide.
       *
       * Partir de zéro se défendait tant que rien ne distinguait une photo
       * produit d'une bannière. Ce n'est plus le cas : les images sont classées
       * par l'hôte qui sert la galerie, et une fiche partage presque toujours un
       * même format pour ses photos — huit cents sur huit cents chez Temu, mille
       * sur mille chez AliExpress.
       *
       * On coche donc le format le plus représenté parmi les grandes images. Le
       * vendeur corrige d'un clic ; il ne construit plus sa sélection de rien.
       */
      const preselected = new Set(coches)

      // Gardé pour la phrase d'explication : dire quel format domine reste utile
      // au vendeur qui veut filtrer d'un clic.
      const dominant = sizes.find((s) => {
        const [w, h] = s.label.split('×').map(Number)
        return s.count >= 3 && Math.min(w, h) >= MIN_SIDE
      })

      panel.innerHTML = `
        <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.1);flex-shrink:0">
          <div style="display:flex;align-items:baseline;gap:10px">
            <div style="font-weight:700;font-size:15px">Choisissez les photos du produit</div>
            <div style="color:#9ca3af;font-size:12px">${sorted.length} image(s) trouvée(s)</div>
          </div>
          <div style="color:#9ca3af;margin-top:3px">
            <b style="color:#e5e7eb">Cochez les photos du produit</b> — rien n'est
            présélectionné. Nous ne savons pas encore reconnaître à coup sûr les
            photos d'une fiche parmi les bannières et les produits recommandés :
            cocher à votre place ferait partir des images qui ne sont pas les
            vôtres. ${PHOTOS_MAX} maximum.${
              dominant
                ? ` Repère utile : le format le plus présent est ${dominant.label}, filtrez dessus si la galerie s'y trouve.`
                : ''
            }
          </div>

          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:10px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="color:#6b7280;font-size:11px">Taille</span>
              <span id="dsp-f-taille" style="display:flex;flex-wrap:wrap;gap:5px"></span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="color:#6b7280;font-size:11px">Format</span>
              <span id="dsp-f-format" style="display:flex;flex-wrap:wrap;gap:5px"></span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="color:#6b7280;font-size:11px">Affichage</span>
              <span id="dsp-f-vue" style="display:flex;gap:5px"></span>
            </div>
            <button id="dsp-clear" style="margin-left:auto;border:0;background:none;color:#a855f7;cursor:pointer;font:500 12px system-ui,sans-serif">Effacer les filtres</button>
          </div>

          <div style="display:flex;gap:8px;margin-top:10px">
            <button id="dsp-none" style="border:1px solid rgba(255,255,255,.15);background:none;color:#e5e7eb;border-radius:8px;padding:5px 12px;cursor:pointer;font:500 12px system-ui,sans-serif">Tout désélectionner</button>
            <button id="dsp-all" style="border:1px solid rgba(255,255,255,.15);background:none;color:#e5e7eb;border-radius:8px;padding:5px 12px;cursor:pointer;font:500 12px system-ui,sans-serif">Sélectionner ce qui est affiché</button>
          </div>
        </div>

        <div style="flex:1 1 auto;overflow-y:auto">
          <div id="dsp-grid" style="padding:16px 20px;display:grid;align-content:start;gap:14px"></div>
          <div id="dsp-mobilier-bloc" style="padding:0 20px 16px;display:${mobilier.length ? 'block' : 'none'}">
            <button id="dsp-mobilier-toggle" style="border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#9ca3af;border-radius:8px;padding:7px 12px;cursor:pointer;font:500 12px system-ui,sans-serif;width:100%;text-align:left">
              ▸ Mobilier de la page — ${mobilier.length} image(s) écartée(s) : en-tête, menu, pied, bannières
            </button>
            <div id="dsp-mobilier" style="display:none;margin-top:10px"></div>
          </div>
        </div>

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
      let filtreTaille = null
      let filtreFormat = null
      let vue = AFFICHAGES[1]

      const refreshCount = () => {
        counter.textContent = `${preselected.size} photo(s) sélectionnée(s) sur ${PHOTOS_MAX}`
      }

      /** Une pastille de filtre, allumée quand elle est active. */
      function pastille(hote, label, actif, onClick, compte) {
        const b = document.createElement('button')
        b.textContent = compte === undefined ? label : `${label} (${compte})`
        Object.assign(b.style, {
          border: actif ? '1px solid #a855f7' : '1px solid rgba(255,255,255,.15)',
          background: actif ? 'rgba(168,85,247,.25)' : 'none',
          color: actif ? '#e9d5ff' : '#e5e7eb',
          borderRadius: '999px',
          padding: '4px 10px',
          cursor: 'pointer',
          font: '500 11px system-ui, sans-serif',
        })
        b.addEventListener('click', onClick)
        hote.appendChild(b)
      }

      function drawFilters() {
        const taille = panel.querySelector('#dsp-f-taille')
        const format = panel.querySelector('#dsp-f-format')
        const vueHote = panel.querySelector('#dsp-f-vue')
        taille.innerHTML = ''
        format.innerHTML = ''
        vueHote.innerHTML = ''

        pastille(taille, 'Toutes', filtreTaille === null, () => {
          filtreTaille = null
          redraw()
        }, sorted.length)
        for (const s of sizes) {
          pastille(taille, s.label, filtreTaille === s.label, () => {
            filtreTaille = filtreTaille === s.label ? null : s.label
            redraw()
          }, s.count)
        }

        pastille(format, 'Tous', filtreFormat === null, () => {
          filtreFormat = null
          redraw()
        }, sorted.length)
        for (const f of formats) {
          pastille(format, f.label, filtreFormat === f.label, () => {
            filtreFormat = filtreFormat === f.label ? null : f.label
            redraw()
          }, f.count)
        }

        for (const a of AFFICHAGES) {
          pastille(vueHote, a.label, vue.id === a.id, () => {
            vue = a
            redraw()
          })
        }
      }

      /** Ce que les filtres laissent passer. */
      const visible = () =>
        sorted
          .filter((i) => !filtreTaille || `${i.width}×${i.height}` === filtreTaille)
          .filter((i) => !filtreFormat || formatOf(i.url) === filtreFormat)

      /** Une vignette, avec ses étiquettes de format, de dimensions et de poids. */
      function vignette(item, cochable) {
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
          height: vue.hauteur,
          display: 'block',
        })

        const poids = weightOf(item.url)
        const etiquette = (texte) =>
          `<span style="background:rgba(0,0,0,.78);border-radius:5px;padding:2px 6px;font-size:10px;color:#fff;white-space:nowrap">${texte}</span>`

        cell.innerHTML = `
          <img src="${item.url}" loading="lazy" style="width:100%;height:100%;object-fit:contain;display:block;background:#0f172a" />
          <span style="position:absolute;left:5px;top:5px;display:flex;gap:4px;flex-wrap:wrap;max-width:calc(100% - 40px)">
            ${etiquette(formatOf(item.url))}${etiquette(`${item.width}×${item.height}`)}${poids ? etiquette(poids) : ''}
          </span>
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
        return cell
      }

      function drawGrid() {
        grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${vue.colonne}, 1fr))`
        grid.style.gridAutoRows = vue.hauteur
        grid.innerHTML = ''
        for (const item of visible()) grid.appendChild(vignette(item, true))
      }

      function drawMobilier() {
        const hote = panel.querySelector('#dsp-mobilier')
        if (!hote) return
        hote.style.display = hote.dataset.ouvert === '1' ? 'grid' : 'none'
        hote.style.gridTemplateColumns = `repeat(auto-fill, minmax(${vue.colonne}, 1fr))`
        hote.style.gridAutoRows = vue.hauteur
        hote.style.gap = '14px'
        hote.innerHTML = ''
        for (const item of mobilier) hote.appendChild(vignette(item, true))
      }

      function redraw() {
        drawFilters()
        drawGrid()
        drawMobilier()
        refreshCount()
      }

      panel.querySelector('#dsp-clear').addEventListener('click', () => {
        filtreTaille = null
        filtreFormat = null
        redraw()
      })

      const bascule = panel.querySelector('#dsp-mobilier-toggle')
      if (bascule) {
        bascule.addEventListener('click', () => {
          const hote = panel.querySelector('#dsp-mobilier')
          const ouvert = hote.dataset.ouvert === '1'
          hote.dataset.ouvert = ouvert ? '0' : '1'
          bascule.textContent = `${ouvert ? '▸' : '▾'} Mobilier de la page — ${mobilier.length} image(s) écartée(s) : en-tête, menu, pied, bannières`
          drawMobilier()
        })
      }

      panel.querySelector('#dsp-none').addEventListener('click', () => {
        preselected.clear()
        redraw()
      })

      // Selects what the filter shows rather than everything: with a size filter
      // active this is the fastest way to take the whole gallery in one click.
      panel.querySelector('#dsp-all').addEventListener('click', () => {
        for (const item of visible()) {
          if (preselected.size >= 10) break
          preselected.add(item.url)
        }
        redraw()
      })

      redraw()

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
      // `found` porte désormais deux listes : les candidates du produit et le
      // mobilier de page, rangé à part dans le sélecteur.
      const combien = found?.produits?.length ?? (Array.isArray(found) ? found.length : 0)
      progress.step(`${combien} image(s) trouvées — à vous de choisir`)
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
   * Relève la fiche sans rien publier, pour la liste d'import groupé.
   *
   * **Le relevé se fait ici, à l'ajout, et non au moment de l'import.** Une
   * fiche AliExpress n'existe que dans le navigateur : son prix et ses
   * variantes sont chargés après l'affichage, et personne ne peut les relire
   * plus tard depuis un serveur. Garder l'adresse seule ferait une liste de
   * vingt-cinq adresses toutes inimportables.
   *
   * Les photos sont prises dans l'ordre du classement, sans demander. C'est
   * assumé et dit à l'écran : sur vingt-cinq produits, ouvrir vingt-cinq
   * sélecteurs n'est pas un lot. Le vendeur reprend ses photos annonce par
   * annonce ensuite, là où il reprend déjà ses prix.
   */
  async function releverPourLot() {
    const payload = await buildPayload()
    if (!payload.title) throw new Error('Produit non reconnu sur cette page')

    const trouve = await collectImages()
    const produits = Array.isArray(trouve) ? trouve : (trouve?.produits ?? [])
    payload.images = produits.slice(0, PHOTOS_MAX).map((i) => i.url)

    return payload
  }

  /*
   * Le panneau latéral demande, le script de contenu répond.
   *
   * `sendResponse` asynchrone impose de rendre `true` : sans lui, Chrome ferme
   * le canal dès la fin du gestionnaire et la réponse n'arrive jamais — panne
   * classique, silencieuse, et qui ressemble à un script absent.
   */
  chrome.runtime.onMessage.addListener((message, _expediteur, repondre) => {
    if (message?.type !== 'dsp-relever-pour-lot') return
    releverPourLot()
      .then((payload) => repondre({ ok: true, payload }))
      .catch((e) => repondre({ ok: false, error: e?.message || 'Relevé impossible' }))
    return true
  })

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
