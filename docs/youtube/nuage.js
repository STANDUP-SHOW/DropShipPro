/*
 * Le nuage de pastilles reliées au cerveau, partagé par la bannière YouTube et
 * la couverture Facebook : mêmes fournisseurs, mêmes marketplaces, même dessin.
 * Seule la géométrie change d'un format à l'autre — elle est passée à
 * `dessinerNuage(geo)` par chaque page.
 *
 * Les deux côtés ne montrent que ce que l'application fait vraiment : les
 * fournisseurs de backend/src/services/suppliers.ts (plus Shein, relevé par
 * l'extension) et les places de marché de backend/src/services/platforms.ts.
 *
 * `logo` = fichier du paquet du site ; `local` = fichier attendu dans
 * docs/youtube/logos/, avec `repli` = dessin de secours tant qu'il manque
 * (voir logos/LISEZMOI.md).
 */
const PAQUET = '../../frontend/public/logos/'
const LOCAL = 'logos/'
const ROSE = '#ff3ea5'
const NEONS = ['#fb923c', '#22d3ee', '#facc15', '#a3e635', '#a78bfa', '#38bdf8']

// Sources, à gauche : du plus gros au plus petit, une couleur néon chacun.
const SOURCES = [
  { local: 'aliexpress.png', repli: 'aliexpress' },
  { logo: 'temu_logo-svg.png', carre: true },
  { local: 'cj.png', repli: 'cj' },
  { local: 'bigbuy.png', repli: { texte: 'BigBuy', couleur: '#1d4ed8' } },
  { logo: 'shein-logo.png' },
  { local: 'alibaba.png', repli: { texte: 'Alibaba', couleur: '#ff6a00' } },
  { logo: 'etsy.png' },
  { local: 'vidaxl.png', repli: { texte: 'vidaXL', couleur: '#f37021' } },
  { logo: 'joom-logo-new.png' },
  { local: 'dhgate.png', repli: { texte: 'DHgate', couleur: '#e8402a' } },
  { local: 'banggood.png', repli: { texte: 'Banggood', couleur: '#ff6a00' } },
  { logo: 'zentrada.png' },
].map((p, i) => ({ ...p, c: NEONS[i % NEONS.length] }))

// Destinations, à droite : du plus gros au plus petit, tout en rose néon.
const DESTINATIONS = [
  { logo: 'amazon.png' }, { logo: 'tiktokshop_logo.png' }, { logo: 'ebay.png' }, { logo: 'cdiscount-new-logo.png' },
  { local: 'shopify.png', repli: { texte: 'shopify', couleur: '#5e8e3e' } },
  { local: 'vinted.png', repli: { texte: 'vinted', couleur: '#09b1ba' } },
  { local: 'leboncoin.png', repli: { texte: 'leboncoin', couleur: '#ff6e14' } },
  { logo: 'fnac.png' }, { logo: 'googleshoppingads.png' }, { logo: 'laredoute.png' }, { logo: 'eleclerc.png' },
  { logo: 'carrefour.png' }, { logo: 'kaufland_marketplace.png' }, { logo: 'auchan.png' }, { logo: 'boulanger.png' },
  { logo: 'leroymerlin.png' }, { logo: 'but.png' },
  { local: 'wish.png', repli: { texte: 'wish', couleur: '#111', taille: 0.3 } },
  { logo: 'bhvmarais.png' }, { logo: 'kiabi_logo.png' }, { logo: 'showroomprive.png' }, { logo: 'spartoo.png' },
  { logo: 'miintomarketplace.png' }, { logo: 'instagram.png', carre: true }, { logo: 'facebookads.png' }, { logo: 'bol-logo.png' },
  { logo: 'galerieslafayette.png' }, { logo: 'maisonsdumonde.png' }, { logo: '1200px-media_markt_logo-svg.png' }, { logo: 'ldlc.png' },
].map((p) => ({ ...p, c: ROSE }))

// Les dessins de secours, quand le fichier local manque : deux icônes
// redessinées, sinon le nom de la marque dans sa couleur.
const REPLIS = {
  aliexpress: () => `<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#f0432b"/><path d="M0 22V22C0 10 10 0 22 0H78C90 0 100 10 100 22Z" fill="#ff9d00"/><path d="M31 36V44A19 19 0 0 0 69 44V36" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/><text x="50" y="84" text-anchor="middle" font-size="16.5" font-weight="700" fill="#fff" font-family="Outfit,sans-serif">AliExpress</text></svg>`,
  cj: () => `<svg viewBox="0 0 100 100"><defs><linearGradient id="cj-fond" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7a21b"/><stop offset="1" stop-color="#e8641b"/></linearGradient></defs><rect width="100" height="100" rx="22" fill="url(#cj-fond)"/><text x="50" y="70" text-anchor="middle" font-size="58" fill="#fff" font-family="'Dancing Script',cursive" font-weight="700">CJ</text></svg>`,
}

// Les neurones du cerveau (repère 240 × 200 du dessin du cerveau).
const NEURONES = [[60, 80], [84, 58], [100, 112], [72, 132], [94, 152], [52, 108], [140, 66], [172, 80], [152, 118], [192, 118], [168, 150], [130, 152], [118, 56], [206, 92], [40, 90], [120, 178]]
const ARETES = [[0, 1], [0, 5], [1, 12], [2, 3], [2, 5], [3, 4], [4, 11], [6, 12], [6, 7], [7, 13], [7, 8], [8, 9], [9, 10], [10, 11], [8, 11], [14, 0], [14, 5], [12, 2], [6, 8], [15, 11], [15, 4]]

const NS = 'http://www.w3.org/2000/svg'
const el = (tag, attrs) => {
  const n = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  return n
}

/**
 * Dessine tout : pastilles, liens, neurones, anneaux.
 *
 * geo = {
 *   GRAINE,                       tirage au sort reproductible
 *   BANDE: { y0, y1 },            hauteur où les pastilles peuvent vivre
 *   GAUCHE: [x0, x1], DROITE: [x0, x1],   les deux nuages
 *   CERVEAU: { cx, cy, rx, ry },  ellipse qui épouse le contour du cerveau
 *   EXCLUS: [ {cx,cy,r} | {x0,x1,y0,y1} ],  zones interdites aux pastilles
 *   TAILLES: { sources: [max, min], destinations: [max, min] },
 *   ANNEAUX: [r1, r2, r3],        les anneaux de traitement
 *   EPAISSEUR: { source, destination },   des traits de lien
 * }
 */
function dessinerNuage(geo) {
  const taille = (i, n, max, min) => Math.round(max - (i * (max - min)) / Math.max(1, n - 1))
  SOURCES.forEach((p, i) => (p.d = taille(i, SOURCES.length, ...geo.TAILLES.sources)))
  DESTINATIONS.forEach((p, i) => (p.d = taille(i, DESTINATIONS.length, ...geo.TAILLES.destinations)))

  // Tirage au sort reproductible (mulberry32) : même graine, même dessin.
  const alea = (() => { let a = geo.GRAINE; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } })()

  // Pose chaque pastille au hasard dans sa région, sans heurter ni les zones
  // exclues ni les pastilles déjà posées ; rétrécit si elle ne trouve pas de place.
  const poses = []
  function placer(liste, [x0, x1]) {
    for (const p of liste) {
      let d = p.d, place = false
      for (let essai = 0; essai < 20000 && !place; essai++) {
        if (essai && essai % 2500 === 0 && d > 40) d = Math.round(d * 0.93)
        const r = d / 2
        const x = x0 + r + alea() * (x1 - x0 - d)
        const y = geo.BANDE.y0 + r + alea() * (geo.BANDE.y1 - geo.BANDE.y0 - d)
        const heurte = geo.EXCLUS.some((e) => 'r' in e ? Math.hypot(x - e.cx, y - e.cy) < e.r + r : x + r > e.x0 && x - r < e.x1 && y + r > e.y0 && y - r < e.y1)
        if (heurte) continue
        if (poses.some((q) => Math.hypot(x - q.x, y - q.y) < r + q.d / 2 + 12)) continue
        Object.assign(p, { x, y, d })
        poses.push(p)
        place = true
      }
      if (!place) document.title = 'PASTILLE SANS PLACE : ' + (p.logo || p.local)
    }
  }
  placer(SOURCES, geo.GAUCHE)
  placer(DESTINATIONS, geo.DROITE)

  // Où les flux touchent le cerveau : sur l'ellipse, répartis dans l'ordre
  // vertical des pastilles pour que les liens ne se croisent pas.
  const { cx, cy, rx, ry } = geo.CERVEAU
  const surCerveau = (liste, angleDebut, angleFin) => {
    const tri = [...liste].sort((a, b) => a.y - b.y)
    tri.forEach((p, i) => {
      const t = tri.length === 1 ? 0.5 : i / (tri.length - 1)
      const a = ((angleDebut + (angleFin - angleDebut) * t) * Math.PI) / 180
      p.ancre = [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
    })
  }
  surCerveau(SOURCES, 232, 128)     // bord gauche, de haut en bas
  surCerveau(DESTINATIONS, -56, 56) // bord droit, de haut en bas

  const halos = document.getElementById('halos')
  const traits = document.getElementById('traits')
  const paquets = document.getElementById('paquets')
  const courbe = ([x0, y0], [x1, y1]) => {
    const dx = (x1 - x0) * 0.5
    return `M${x0} ${y0}C${x0 + dx} ${y0} ${x1 - dx} ${y1} ${x1} ${y1}`
  }
  function lien(depart, arrivee, couleur, graine, epaisseur) {
    const d = courbe(depart, arrivee)
    halos.append(el('path', { d, fill: 'none', stroke: couleur, 'stroke-width': epaisseur * 3, opacity: .5, filter: 'url(#neon)', 'stroke-linecap': 'round' }))
    traits.append(el('path', { d, fill: 'none', stroke: couleur, 'stroke-width': epaisseur, 'stroke-linecap': 'round' }))
    const coeur = el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 1.2, opacity: .7, 'stroke-linecap': 'round' })
    traits.append(coeur)
    // Les paquets de données qui circulent, figés à des positions décalées par lien.
    const L = coeur.getTotalLength()
    const k = epaisseur / 3
    for (const t of [0.3, 0.68]) {
      const p = coeur.getPointAtLength(((t + graine * 0.045) % 1) * L)
      paquets.append(el('circle', { cx: p.x, cy: p.y, r: 9 * k, fill: couleur, opacity: .5, filter: 'url(#neon-doux)' }))
      paquets.append(el('circle', { cx: p.x, cy: p.y, r: 4.2 * k, fill: '#fff' }))
    }
    // La pointe, à l'arrivée.
    const fin = coeur.getPointAtLength(L)
    const avant = coeur.getPointAtLength(L - 10)
    const a = (Math.atan2(fin.y - avant.y, fin.x - avant.x) * 180) / Math.PI
    const pointe = 'M-12 -7L3 0L-12 7Z'
    const pose = `translate(${fin.x} ${fin.y}) rotate(${a}) scale(${k})`
    paquets.append(el('path', { d: pointe, fill: couleur, transform: pose, filter: 'url(#neon-doux)' }))
    paquets.append(el('path', { d: pointe, fill: couleur, transform: pose }))
  }
  // Le point de départ d'un lien : sur le bord de la pastille, face au cerveau.
  const bord = (p, cible) => {
    const a = Math.atan2(cible[1] - p.y, cible[0] - p.x)
    return [p.x + (p.d / 2 - 3) * Math.cos(a), p.y + (p.d / 2 - 3) * Math.sin(a)]
  }
  SOURCES.forEach((p, i) => lien(bord(p, p.ancre), p.ancre, p.c, i, geo.EPAISSEUR.source))
  DESTINATIONS.forEach((p, i) => lien(p.ancre, bord(p, p.ancre), p.c, i + 10, geo.EPAISSEUR.destination))

  const fabriqueRepli = (repli, d) => {
    const div = document.createElement('div')
    if (typeof repli === 'string') {
      div.className = 'repli'
      div.innerHTML = REPLIS[repli]()
    } else {
      // Un mot : sa taille se règle sur sa longueur pour remplir la pastille.
      div.className = 'repli mot'
      const taille = repli.taille ?? Math.min(0.3, 1.25 / repli.texte.length)
      div.style.cssText = `color:${repli.couleur};font-size:${Math.round(d * taille)}px`
      div.textContent = repli.texte
    }
    return div
  }
  const conteneur = document.getElementById('pastilles')
  for (const p of [...SOURCES, ...DESTINATIONS]) {
    const div = document.createElement('div')
    div.className = 'pastille' + (p.carre ? ' carre' : '')
    div.style.cssText = `left:${p.x}px;top:${p.y}px;width:${p.d}px;height:${p.d}px;--c:${p.c};--d:${p.d}px`
    const img = document.createElement('img')
    img.src = p.local ? LOCAL + p.local : PAQUET + p.logo
    img.alt = ''
    if (p.repli) img.onerror = () => img.replaceWith(fabriqueRepli(p.repli, p.d))
    div.append(img)
    conteneur.append(div)
  }

  // Le réseau de neurones, dans le repère du cerveau.
  const reseau = document.getElementById('reseau')
  const neurones = document.getElementById('neurones')
  for (const [a, b] of ARETES) {
    reseau.append(el('line', { x1: NEURONES[a][0], y1: NEURONES[a][1], x2: NEURONES[b][0], y2: NEURONES[b][1] }))
  }
  NEURONES.forEach(([x, y], i) => {
    neurones.append(el('circle', { cx: x, cy: y, r: 5, fill: ROSE, opacity: .8, filter: 'url(#neon-doux)' }))
    neurones.append(el('circle', { cx: x, cy: y, r: i % 3 === 0 ? 3.2 : 2.4, fill: '#fff' }))
  })

  // Les anneaux de traitement autour du cerveau, avec leurs points lumineux.
  const anneaux = document.getElementById('anneaux')
  const [r1, r2, r3] = geo.ANNEAUX
  ;[[r1, .55, '10 14', 3], [r2, .35, '3 22', 2.5], [r3, .22, '40 30', 2]].forEach(([r, o, dash, w], i) => {
    anneaux.append(el('circle', { cx, cy, r, stroke: ROSE, 'stroke-width': w, 'stroke-dasharray': dash, opacity: o, transform: `rotate(${i * 37} ${cx} ${cy})` }))
  })
  ;[[r1, 20], [r1, 200], [r2, 110], [r2, 290], [r3, 60], [r3, 250]].forEach(([r, deg]) => {
    const x = cx + r * Math.cos((deg * Math.PI) / 180), y = cy + r * Math.sin((deg * Math.PI) / 180)
    anneaux.append(el('circle', { cx: x, cy: y, r: 10, fill: ROSE, opacity: .5, filter: 'url(#neon-doux)' }))
    anneaux.append(el('circle', { cx: x, cy: y, r: 4, fill: '#fff' }))
  })
}
