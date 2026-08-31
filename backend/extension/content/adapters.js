/**
 * Adaptateurs par fournisseur.
 *
 * Le scan générique (image-scan.js) ratisse toute la page et classe ensuite.
 * Il marche partout et n'est jamais parfait : sur AliExpress il ramenait des
 * pictogrammes d'interface avant les photos, sur Temu il manquait la galerie
 * servie derrière un paramètre de redimensionnement.
 *
 * Chaque fournisseur, lui, range ses photos à un endroit précis et le fait
 * toujours de la même façon. Un adaptateur écrit une fois donne un résultat
 * juste à tous les coups, là où l'heuristique devine. Le générique reste, en
 * dessous : un site inconnu doit continuer de fonctionner, et un adaptateur qui
 * ne trouve rien doit s'effacer plutôt que de renvoyer une page vide.
 *
 * Écrit d'après une inspection en direct de chaque fiche produit, plateforme par
 * plateforme. Les classes CSS hachées (`eF4YXmH`, `pic--fwzAT`) sont
 * volontairement ignorées : elles changent à chaque déploiement du site.
 */
;(() => {
  if (typeof self === 'undefined' || self.dspAdapters) return

  /** Cherche récursivement le premier tableau non vide portant l'une des clés. */
  function findFirstArrayByKeys(root, keyNames, maxDepth = 8) {
    const seen = new Set()

    function walk(value, depth) {
      if (!value || typeof value !== 'object' || depth > maxDepth || seen.has(value)) return null
      seen.add(value)

      for (const key of keyNames) {
        if (Array.isArray(value[key]) && value[key].length) return value[key]
      }
      for (const key in value) {
        try {
          const hit = walk(value[key], depth + 1)
          if (hit) return hit
        } catch {
          // Un accès qui lève — getter protégé, objet natif — n'arrête pas la
          // recherche : on passe à la clé suivante.
        }
      }
      return null
    }

    return walk(root, 0)
  }

  /** Tout le texte des flux React Server Components, reconstitué. */
  function rscPayload() {
    try {
      const chunks = self.__next_f
      if (!Array.isArray(chunks)) return ''
      return chunks
        .map((c) => (Array.isArray(c) ? c[1] : c))
        .filter((c) => typeof c === 'string')
        .join('')
    } catch {
      return ''
    }
  }

  const ADAPTERS = [
    {
      key: 'aliexpress',
      label: 'AliExpress',
      matches: (host) => /aliexpress\./i.test(host),
      /**
       * La galerie vit dans un objet d'état dont le chemin change d'un
       * déploiement à l'autre. On cherche donc la clé, pas le chemin.
       */
      fromJson() {
        const found = findFirstArrayByKeys(self, ['mainImages', 'summImagePathList', 'imagePathList'])
        if (!found) return []
        return found
          .map((item) => (typeof item === 'string' ? item : item?.imageUrl || item?.imageKey))
          .filter(Boolean)
          .map((u) => (u.startsWith('http') ? u : `https://ae-pic-a1.aliexpress-media.com/kf/${u}`))
      },
      domSelectors: ['[class*="magnifier--wrap"] img', '[class*="slider--img"] img'],
      /** Le domaine des photos produit ; le reste de la page vient d'ailleurs. */
      imageHost: /aliexpress-media\.com$/i,
      pathHint: '/kf/',
      /** Les suffixes de redimensionnement s'enlèvent pour retrouver l'original. */
      fullSize: (url) => url.replace(/\.jpg_[^/]*$/i, '.jpg').replace(/_\d+x\d+q?\d*/gi, ''),
      variantSelector: '[class*="sku--wrap"] [data-sku-col], [class*="sku--wrap"] img',
    },

    {
      key: 'temu',
      label: 'Temu',
      matches: (host) => /temu\./i.test(host),
      /**
       * Temu vide délibérément ses modules d'état — galleryModule et
       * setSpecModule sont des objets vides jusque dans le rendu serveur. Le DOM
       * est la seule source, et il faut filtrer par le chemin plutôt que par le
       * domaine : le même CDN sert les avatars et les bandeaux.
       */
      fromJson: () => [],
      // Deux selecteurs : le chemin connu, et toute image du CDN produit. Le
      // second attrape ce que le premier rate quand Temu renomme un dossier.
      domSelectors: ['img[src*="product/fancy"]', 'img[src*="img.kwcdn.com"]'],
      imageHost: /^img\.kwcdn\.com$/i,
      excludeHosts: [/^aimg\./i, /^commimg\./i, /^avatar-eu\./i, /^img-eu\./i],
      /*
       * Plusieurs chemins, et non un seul.
       *
       * Temu renomme ses dossiers d images sans prevenir. Avec un litteral
       * unique, le jour ou il change, l adaptateur ne rend rien -- et le scan
       * generique reprend la main en ramassant l en-tete et les bannieres. Ces
       * trois-la couvrent ce qu on a vu ; si aucun ne correspond, l adaptateur
       * elargit au domaine seul en le disant dans la console.
       */
      pathHint: ['/product/fancy/', '/product/', '/goods/'],
      fullSize: (url) => url.replace(/\/w\/\d+/i, '/w/1300').replace(/\/q\/\d+/i, '/q/90'),
      variantSelector: 'div[role="radio"][aria-label]',
    },

    {
      key: 'dhgate',
      label: 'DHgate',
      matches: (host) => /dhgate\./i.test(host),
      /**
       * Les données passent par un flux React Server Components qui se vide
       * après hydratation. On lit le texte accumulé plutôt que l'objet.
       */
      fromJson() {
        const payload = rscPayload()
        if (!payload) return []
        const match = payload.match(/"oriImgList":\[(.*?)\]/)
        if (!match) return []
        return [...match[1].matchAll(/"(https:[^"]+)"/g)].map((m) => m[1].replace(/\\u002F/gi, '/'))
      },
      domSelectors: ['img#masterImg', 'img[src*="dhresource.com"][src*="/100x100/"]'],
      imageHost: /dhresource\.com$/i,
      pathHint: '/albu/',
      /** `0x0` est la pleine résolution ; les autres tailles sont des vignettes. */
      fullSize: (url) => url.replace(/\/(?:\d{2,4}x\d{2,4})\//, '/0x0/'),
      variantSelector: '[class*="sku"] img, [class*="attr"] img',
    },

    {
      key: 'banggood',
      label: 'Banggood',
      matches: (host) => /banggood\./i.test(host),
      /** `GV.mainImg` ne porte qu'une seule photo : inutilisable pour la galerie. */
      fromJson: () => [],
      domSelectors: ['.product-image-new .image-small img', '.product-image-new img'],
      imageHost: /staticbg\.com$/i,
      fullSize: (url) => url.replace(/thumb\/(?:list_grid|list|small|view)/i, 'thumb/large'),
      variantSelector: '.product-block .block-wrap img, .product-block .block-wrap a',
    },

    {
      key: 'etsy',
      label: 'Etsy',
      matches: (host) => /etsy\./i.test(host),
      /**
       * Le seul fournisseur à publier un JSON-LD conforme. `il_fullxfull` n'est
       * jamais chargé par une balise img : on ne l'obtient que par là.
       */
      fromJson() {
        const out = []
        for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
          try {
            const data = JSON.parse(script.textContent)
            const list = Array.isArray(data) ? data : [data]
            for (const entry of list) {
              if (entry?.['@type'] !== 'Product' || !entry.image) continue
              const images = Array.isArray(entry.image) ? entry.image : [entry.image]
              for (const img of images) {
                const url = typeof img === 'string' ? img : img?.contentURL || img?.url
                if (url) out.push(url)
              }
            }
          } catch {
            // Un bloc JSON-LD illisible n'empêche pas de lire les suivants.
          }
        }
        return out
      },
      domSelectors: ['img.carousel-image', 'li[data-carousel-pagination-item] img'],
      imageHost: /etsystatic\.com$/i,
      fullSize: (url) => url.replace(/il_\d+x?\w*\./i, 'il_fullxfull.'),
      variantSelector: 'select[id^="variation-selector"]',
    },

    {
      key: 'cjdropshipping',
      label: 'CJ Dropshipping',
      matches: (host) => /cjdropshipping\./i.test(host),
      fromJson() {
        try {
          const data = self.productDetailData
          if (data && Array.isArray(data.images)) return data.images.filter(Boolean)
        } catch {
          // Objet absent : le repli DOM prend la suite.
        }
        return []
      },
      domSelectors: ['img[src*="oss-cf.cjdropshipping.com"]'],
      imageHost: /cjdropshipping\.com$/i,
      /** Le suffixe de transformation masque le plein format. */
      fullSize: (url) => url.split('?x-oss-process=')[0],
      variantSelector: '[class*="variantKeys"] img, [class*="variantKeys"] div',
    },

    {
      key: 'zentrada',
      label: 'Zentrada',
      matches: (host) => /zentrada\./i.test(host),
      fromJson: () => [],
      domSelectors: ['img[src*="zentrada-network.eu"]', 'img[src*="cloudimg.io"]'],
      imageHost: /(zentrada-network\.eu|cloudimg\.io)$/i,
      pathHint: '/images/artikel/',
      /**
       * Les photos passent par un service de redimensionnement qui encode
       * l'adresse d'origine dans son propre chemin. La récupérer donne le
       * fichier tel que le fournisseur l'a déposé.
       */
      fullSize(url) {
        // Le proxy accepte l'adresse d'origine en clair ou encodée selon la
        // page : les deux formes existent, et n'en traiter qu'une laissait
        // passer une vignette de 240 pixels pour une photo produit.
        const proxy = url.match(/cloudimg\.io\/v\d+\/(https?(?::|%3A)[^?]+)/i)
        if (!proxy) return url
        try {
          return decodeURIComponent(proxy[1])
        } catch {
          return proxy[1]
        }
      },
      variantSelector: '[class*="variant"] img, select',
      needsAccount: true,
    },

    {
      key: 'bigbuy',
      label: 'BigBuy',
      matches: (host) => /bigbuy\./i.test(host),
      fromJson() {
        const found = findFirstArrayByKeys(self, ['imageUrls'])
        if (found) return found.filter((u) => typeof u === 'string')

        // Le flux se vide après hydratation : on relit son texte accumulé.
        const payload = rscPayload()
        const match = payload.match(/"imageUrls":\[(.*?)\]/)
        if (!match) return []
        return [...match[1].matchAll(/"(https:[^"]+)"/g)].map((m) => m[1].replace(/\\u002F/gi, '/'))
      },
      domSelectors: ['img[src*="bigbuy.eu"]'],
      imageHost: /^www\.bigbuy\.eu$/i,
      /** Les visuels de la partie éditoriale ne sont pas des photos produit. */
      excludeHosts: [/^cms\./i],
      fullSize: (url) => url,
      variantSelector: 'select, [class*="attribute"]',
    },

    {
      key: 'webdrop',
      label: 'Webdrop Market',
      matches: (host) => /webdrop-market\./i.test(host),
      /** PrestaShop range la grande version dans un attribut de la vignette. */
      fromJson() {
        return [...document.querySelectorAll('#product-images-thumbs img')]
          .map((img) => img.dataset?.imageLargeSrc)
          .filter(Boolean)
      },
      domSelectors: ['#product-images-thumbs img', '.js-qv-product-cover'],
      imageHost: /webdrop-market\.com$/i,
      fullSize: (url) => url.replace(/-(?:small|medium|home|cart)_default\//i, '-large_default/'),
      variantSelector: '.product-variants select, .product-variants input',
    },
  ]

  /** L'adaptateur de la page courante, ou null. */
  function dspAdapterFor(host = location.hostname) {
    return ADAPTERS.find((a) => a.matches(host)) ?? null
  }

  /**
   * Les photos du produit d'après l'adaptateur du site.
   *
   * Le JSON d'abord : quand il existe, il donne des adresses propres et déjà
   * dédupliquées, sans dépendre d'un sélecteur qui casse à la prochaine refonte.
   * Le DOM ensuite, filtré par domaine et par segment de chemin — jamais par
   * extension de fichier, puisque ces sites servent du .avif et du .webp avec
   * des suffixes de transformation.
   */
  function dspAdapterImages(adapter) {
    if (!adapter) return []

    const out = []
    /** Les adresses du bon domaine que le chemin attendu a ecartees. */
    const ecartes = []
    const push = (raw) => {
      if (typeof raw !== 'string' || !raw) return
      let url = raw.startsWith('//') ? `https:${raw}` : raw
      if (!url.startsWith('http')) return

      let host = ''
      try {
        host = new URL(url).hostname
      } catch {
        return
      }

      if (adapter.excludeHosts?.some((rx) => rx.test(host))) return
      if (adapter.imageHost && !adapter.imageHost.test(host)) return
      /*
       * Le chemin attendu, qui peut etre plusieurs.
       *
       * Un seul litteral rendait l adaptateur fragile : le jour ou le
       * fournisseur renomme son dossier, plus rien ne passe, le scan generique
       * reprend la main et ramasse les bannieres. On accepte donc une liste.
       */
      const chemins = adapter.pathHint
        ? Array.isArray(adapter.pathHint)
          ? adapter.pathHint
          : [adapter.pathHint]
        : null
      if (chemins && !chemins.some((c) => url.includes(c))) {
        // Retenu a part : si aucun chemin ne correspond nulle part, c est que
        // le fournisseur a change, et le savoir vaut mieux que se taire.
        ecartes.push(url)
        return
      }

      try {
        url = adapter.fullSize(url)
      } catch {
        // Une reconstruction ratée ne doit pas perdre l'adresse d'origine.
      }
      if (!out.includes(url)) out.push(url)
    }

    try {
      for (const url of adapter.fromJson()) push(url)
    } catch (err) {
      console.warn('DropShipper IA : lecture JSON impossible', err)
    }

    for (const selector of adapter.domSelectors ?? []) {
      for (const img of document.querySelectorAll(selector)) {
        push(img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src'))
        const srcset = img.getAttribute('srcset')
        if (srcset) for (const part of srcset.split(',')) push(part.trim().split(/\s+/)[0])
      }
    }

    /*
     * Un adaptateur qui ne rend rien alors que le domaine repondait.
     *
     * C est le signe que le fournisseur a renomme ses chemins. Se taire laissait
     * le scan generique ramasser l en-tete et les bannieres, sans que rien
     * n explique pourquoi les photos etaient mauvaises. On elargit au domaine
     * seul -- moins precis, mais toujours le bon serveur d images -- et on le
     * dit assez fort pour que ca remonte.
     */
    if (!out.length && ecartes.length) {
      console.warn(
        `DropShipper IA : ${adapter.label} — le chemin attendu ne correspond plus a rien. ` +
          `${ecartes.length} adresse(s) du bon domaine ont ete ecartees. Chemins vus : ` +
          [...new Set(ecartes.map((u) => cheminCourt(u)))].slice(0, 8).join(', '),
      )
      for (const url of ecartes) {
        let large = url
        try {
          large = adapter.fullSize(url)
        } catch {
          // L adresse d origine fait l affaire.
        }
        if (!out.includes(large)) out.push(large)
      }
    }

    return out
  }

  /** Les deux premiers segments d une adresse : « /product/fancy ». */
  function cheminCourt(url) {
    try {
      return new URL(url).pathname.split('/').slice(0, 3).join('/')
    } catch {
      return '?'
    }
  }

  /**
   * Ce que la page offre comme images, groupe par domaine et par chemin.
   *
   * A copier dans la console quand une selection est mauvaise. Un adaptateur se
   * corrige avec les vrais chemins du jour, pas avec ceux d il y a trois mois --
   * et personne ici ne voit la page du fournisseur.
   */
  function dspDiagnosticImages() {
    const adapter = dspAdapterFor()
    const vues = new Map()
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src') || ''
      if (!src.startsWith('http') && !src.startsWith('//')) continue
      const url = src.startsWith('//') ? `https:${src}` : src
      let cle
      try {
        const u = new URL(url)
        cle = `${u.hostname}${cheminCourt(url)}`
      } catch {
        continue
      }
      const vu = vues.get(cle) ?? { nombre: 0, exemple: url, largeur: 0 }
      vu.nombre++
      // La plus grande de chaque groupe : c est elle qui dit si ce sont des
      // photos produit ou des vignettes d interface.
      if (img.naturalWidth > vu.largeur) {
        vu.largeur = img.naturalWidth
        vu.exemple = url
      }
      vues.set(cle, vu)
    }

    const lignes = [...vues.entries()]
      .sort((a, b) => b[1].largeur - a[1].largeur)
      .map(([cle, v]) => `${String(v.nombre).padStart(3)} img  ${String(v.largeur).padStart(5)} px  ${cle}`)

    const rapport = [
      `Adaptateur : ${adapter ? adapter.label : 'aucun (scan generique)'}`,
      adapter?.pathHint ? `Chemin attendu : ${[].concat(adapter.pathHint).join(', ')}` : '',
      adapter ? `Retenues par l adaptateur : ${dspAdapterImages(adapter).length}` : '',
      '',
      'Domaines et chemins vus sur la page :',
      ...lignes,
    ]
      .filter(Boolean)
      .join('\n')

    console.log(rapport)
    return rapport
  }

  self.dspDiagnosticImages = dspDiagnosticImages
  self.dspAdapterFor = dspAdapterFor
  self.dspAdapterImages = dspAdapterImages
})()
