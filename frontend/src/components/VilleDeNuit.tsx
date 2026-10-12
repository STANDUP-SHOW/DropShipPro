import { useEffect, useRef } from 'react'

/**
 * Le fond de l'accueil : des villes de nuit qui défilent sans arrêt (Max,
 * 12/10/2026 : « grandes villes éclairées de nuit, néons type Tokyo, Miami,
 * beaucoup de couleurs, qui défilent de chaque côté, animé dès l'arrivée »).
 *
 * Tout est dessiné ici, sans vidéo : ses références venaient de Pinterest, donc
 * sans droit d'usage pour un site commercial. Trois plans d'immeubles en
 * parallaxe, des enseignes au néon, une rue mouillée qui reflète le tout et des
 * phares qui passent. Chaque plan est peint UNE fois dans une tuile hors écran
 * (lueurs et flou compris) ; une image ne fait ensuite que recopier les tuiles
 * décalées, ce qui tient sur un téléphone.
 *
 * À l'arrivée, les immeubles montent du sol, plan par plan. La boucle s'arrête
 * quand le bloc sort de l'écran ou que l'onglet est caché ; « réduire les
 * animations » garde une image fixe.
 */

const NEONS = ["#ff2d95", "#00e5ff", "#ffd400", "#ff4040", "#9b6bff", "#39ff88", "#ff8a1f", "#ff5ad1"]
const FENETRES = ['#ffd27a', '#ffe9b8', '#9fd8ff', '#ffb36b', '#c9b8ff']

type Plan = { tuile: HTMLCanvasElement; vitesse: number; retard: number }
type Phare = { x: number; v: number; y: number; couleur: string; long: number }

/** Petit générateur pseudo-aléatoire : la même ville à chaque visite. */
function graine(n: number) {
  let s = n
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function peindrePlan(largeur: number, hauteur: number, sol: number, niveau: 0 | 1 | 2, dpr: number): HTMLCanvasElement {
  const r = graine(97 + niveau * 31)
  const c = document.createElement('canvas')
  c.width = Math.round(largeur * dpr)
  c.height = Math.round(hauteur * dpr)
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)

  // Le dessin des immeubles, au-dessus du sol, dans une toile à part : on la
  // recopie ensuite telle quelle puis renversée et floutée pour le reflet.
  const haut = document.createElement('canvas')
  haut.width = c.width
  haut.height = Math.round(sol * dpr)
  const h = haut.getContext('2d')!
  h.scale(dpr, dpr)

  // Du plus lointain au plus proche : bleuté et clair au fond, presque noir devant.
  const teintes = [
    ["#2b3170", "#1d2152"],
    ["#171c42", "#0e1230"],
    ["#0d1029", "#06071a"],
  ][niveau]
  const plage = [
    [0.3, 0.6],
    [0.3, 0.68],
    [0.36, 0.86],
  ][niveau]
  const largeurs = [
    [34, 80],
    [46, 110],
    [64, 150],
  ][niveau]

  let x = 0
  while (x < largeur) {
    const l = largeurs[0] + r() * (largeurs[1] - largeurs[0])
    // Le dernier immeuble se raccorde au premier : la tuile boucle sans couture.
    const lw = Math.min(l, largeur - x)
    const hb = sol * (plage[0] + r() * (plage[1] - plage[0]))
    const y = sol - hb
    const fond = h.createLinearGradient(0, y, 0, sol)
    fond.addColorStop(0, teintes[0])
    fond.addColorStop(1, teintes[1])
    h.fillStyle = fond
    h.fillRect(x, y, lw, hb)
    // Un gradin ou une flèche au sommet, pour casser les toits plats.
    const sommet = r()
    if (sommet < 0.3 && lw > 40) {
      h.fillRect(x + lw * 0.2, y - hb * 0.08, lw * 0.6, hb * 0.08 + 1)
    } else if (sommet < 0.42) {
      h.fillRect(x + lw / 2 - 1.5, y - 30, 3, 30)
    }
    // Un liseré de lumière sur l'arête, comme une façade éclairée par la rue.
    h.fillStyle = "rgba(160,170,255,0.10)"
    h.fillRect(x, y, 1.5, hb)

    // Les fenêtres : des points, des étages entiers allumés, ou des colonnes.
    const style = r()
    const pas = [5, 7, 9][niveau]
    const fw = [1.6, 2.5, 3.5][niveau]
    const fh = [1.6, 3, 4][niveau]
    const chaude = FENETRES[Math.floor(r() * FENETRES.length)]
    if (style < 0.55) {
      const densite = [0.22, 0.3, 0.36][niveau]
      for (let fy = y + 8; fy < sol - 6; fy += pas + fh) {
        for (let fx = x + 4; fx < x + lw - 5; fx += pas) {
          if (r() < densite) {
            h.globalAlpha = 0.45 + r() * 0.55
            h.fillStyle = r() < 0.7 ? chaude : FENETRES[Math.floor(r() * FENETRES.length)]
            h.fillRect(fx, fy, fw, fh)
          }
        }
      }
    } else if (style < 0.85) {
      for (let fy = y + 10; fy < sol - 6; fy += pas + fh + 2) {
        if (r() < 0.45) {
          h.globalAlpha = 0.3 + r() * 0.45
          h.fillStyle = chaude
          h.fillRect(x + 4, fy, lw - 8, fh * 0.8)
        }
      }
    } else {
      for (let fx = x + 6; fx < x + lw - 6; fx += pas * 2) {
        h.globalAlpha = 0.15 + r() * 0.3
        h.fillStyle = chaude
        h.fillRect(fx, y + 10, fw, hb - 16)
      }
    }
    h.globalAlpha = 1

    // Le feu rouge des antennes.
    if (niveau > 0 && sommet >= 0.3 && sommet < 0.42) {
      h.shadowColor = "#ff3355"
      h.shadowBlur = 10
      h.fillStyle = "#ff3355"
      h.fillRect(x + lw / 2 - 2, y - 32, 4, 4)
      h.shadowBlur = 0
    }

    // Les enseignes au néon, sur les deux plans proches.
    const nb = niveau === 2 ? 1 + Math.floor(r() * 3) : niveau === 1 ? (r() < 0.75 ? 1 : 2) : 0
    for (let k = 0; k < nb; k++) {
      const couleur = NEONS[Math.floor(r() * NEONS.length)]
      const sorte = r()
      h.shadowColor = couleur
      h.shadowBlur = niveau === 2 ? 18 : 10
      if (sorte < 0.45) {
        // Une enseigne verticale en tube : un cadre lumineux et ses lettres.
        const ew = 9 + r() * 9
        const eh = 50 + r() * (niveau === 2 ? 120 : 50)
        const ex = x + 4 + r() * Math.max(1, lw - ew - 8)
        const ey = y + 12 + r() * Math.max(1, hb * 0.55 - eh)
        h.fillStyle = "rgba(5,6,18,0.85)"
        h.fillRect(ex, ey, ew, eh)
        h.strokeStyle = couleur
        h.lineWidth = 2
        h.strokeRect(ex, ey, ew, eh)
        h.fillStyle = couleur
        for (let ly = ey + 6; ly < ey + eh - 7; ly += 11) h.fillRect(ex + 3, ly, ew - 6, 5)
      } else if (sorte < 0.8) {
        // Un caisson lumineux horizontal.
        const ew = Math.min(lw - 8, 34 + r() * 60)
        const eh = 12 + r() * 16
        const ex = x + 4 + r() * Math.max(1, lw - ew - 8)
        const ey = y + 10 + r() * Math.max(1, hb * 0.4)
        h.fillStyle = couleur
        h.globalAlpha = 0.9
        h.fillRect(ex, ey, ew, eh)
        h.globalAlpha = 1
        h.shadowBlur = 0
        h.fillStyle = "rgba(255,255,255,0.7)"
        for (let lx = ex + 5; lx < ex + ew - 8; lx += 11) h.fillRect(lx, ey + eh / 2 - 2, 7, 4)
      } else if (niveau === 2 && lw > 70) {
        // Un écran géant, comme à Shibuya : un dégradé de deux néons.
        const ew = lw * (0.55 + r() * 0.3)
        const eh = ew * (0.5 + r() * 0.3)
        const ex = x + (lw - ew) / 2
        const ey = y + 16 + r() * Math.max(1, hb * 0.3)
        const autre = NEONS[Math.floor(r() * NEONS.length)]
        const ecran = h.createLinearGradient(ex, ey, ex + ew, ey + eh)
        ecran.addColorStop(0, couleur)
        ecran.addColorStop(1, autre)
        h.fillStyle = ecran
        h.globalAlpha = 0.85
        h.fillRect(ex, ey, ew, eh)
        h.globalAlpha = 1
        h.shadowBlur = 0
        h.fillStyle = "rgba(255,255,255,0.35)"
        h.fillRect(ex + ew * 0.1, ey + eh * 0.62, ew * 0.5, eh * 0.1)
      }
      h.shadowBlur = 0
    }
    x += lw
  }

  // Le halo de la ville, derrière le plan lointain.
  if (niveau === 0) {
    const halo = g.createLinearGradient(0, sol * 0.4, 0, sol)
    halo.addColorStop(0, 'rgba(255,45,149,0)')
    halo.addColorStop(1, 'rgba(255,45,149,0.18)')
    g.fillStyle = halo
    g.fillRect(0, sol * 0.4, largeur, sol * 0.6)
  }

  g.drawImage(haut, 0, 0, largeur, sol)

  // Le reflet sur la rue mouillée : renversé, écrasé, flou, puis strié.
  g.save()
  g.globalAlpha = niveau === 2 ? 0.5 : 0.35
  g.filter = `blur(${niveau === 2 ? 3 : 2}px)`
  g.translate(0, sol * 2)
  g.scale(1, -1)
  g.drawImage(haut, 0, sol * 0.45, largeur, sol * 0.55)
  g.restore()
  g.filter = 'none'
  if (niveau === 2) {
    g.fillStyle = 'rgba(9,11,28,0.45)'
    for (let sy = sol + 3; sy < hauteur; sy += 5) g.fillRect(0, sy, largeur, 2)
  }
  return c
}

export function VilleDeNuit({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const toile = ref.current
    if (!toile) return
    const ctx = toile.getContext('2d')
    if (!ctx) return
    const reduit = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    let L = 0
    let H = 0
    let sol = 0
    let dpr = 1
    let plans: Plan[] = []
    let phares: Phare[] = []
    let ciel: CanvasGradient | null = null
    let depart = performance.now()
    let image = 0
    let visible = true

    const construire = () => {
      const boite = toile.getBoundingClientRect()
      L = Math.max(320, Math.round(boite.width))
      H = Math.max(320, Math.round(boite.height))
      const mobile = L < 700
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5)
      toile.width = Math.round(L * dpr)
      toile.height = Math.round(H * dpr)
      sol = H * 0.8
      // Une tuile un peu plus large que l'écran : le motif ne se répète pas à l'œil.
      const tw = Math.max(L * 1.3, mobile ? 1100 : 1700)
      plans = [
        { tuile: peindrePlan(tw, H, sol, 0, dpr), vitesse: mobile ? 5 : 8, retard: 0 },
        { tuile: peindrePlan(tw * 1.1, H, sol, 1, dpr), vitesse: mobile ? 11 : 18, retard: 0.15 },
        { tuile: peindrePlan(tw * 1.2, H, sol, 2, dpr), vitesse: mobile ? 22 : 36, retard: 0.3 },
      ]
      const r = graine(7)
      phares = Array.from({ length: mobile ? 8 : 16 }, (_, i) => {
        const vers = i % 2 === 0 ? 1 : -1
        return {
          x: r() * L,
          v: vers * (40 + r() * 70),
          y: sol + 4 + r() * (H - sol) * 0.5,
          couleur: vers > 0 ? '#ffe9c4' : '#ff3b4f',
          long: 18 + r() * 34,
        }
      })
      ciel = ctx.createLinearGradient(0, 0, 0, sol)
      ciel.addColorStop(0, '#05061a')
      ciel.addColorStop(0.45, '#1a1145')
      ciel.addColorStop(0.8, '#4a1660')
      ciel.addColorStop(1, '#a0306e')
    }

    const dessiner = (t: number) => {
      const s = (t - depart) / 1000
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = ciel ?? '#101321'
      ctx.fillRect(0, 0, L, sol)
      ctx.fillStyle = '#07081a'
      ctx.fillRect(0, sol, L, H - sol)

      for (const p of plans) {
        const tw = p.tuile.width / dpr
        // La montée d'arrivée : chaque plan sort du sol, l'un après l'autre.
        const k = reduit ? 1 : Math.min(1, Math.max(0, (s - p.retard) / 1.4))
        const monte = (1 - (1 - k) ** 3) // ease-out
        const dy = (1 - monte) * H * 0.45
        const decal = reduit ? 0 : (s * p.vitesse) % tw
        ctx.globalAlpha = 0.25 + 0.75 * monte
        for (let x = -decal; x < L; x += tw) ctx.drawImage(p.tuile, x, dy, tw, H)
      }
      ctx.globalAlpha = 1

      // Les phares qui filent sur la rue.
      if (!reduit && s > 1) {
        for (const ph of phares) {
          const x = (((ph.x + ph.v * s) % (L + 80)) + L + 80) % (L + 80) - 40
          const g = ctx.createLinearGradient(x, 0, x - Math.sign(ph.v) * ph.long, 0)
          g.addColorStop(0, ph.couleur)
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.fillRect(Math.min(x, x - Math.sign(ph.v) * ph.long), ph.y, ph.long, 2)
        }
      }
    }

    const boucle = (t: number) => {
      dessiner(t)
      if (visible && !document.hidden) image = requestAnimationFrame(boucle)
    }
    const relancer = () => {
      cancelAnimationFrame(image)
      if (!reduit && visible && !document.hidden) image = requestAnimationFrame(boucle)
    }

    construire()
    depart = performance.now()
    if (reduit) dessiner(depart)
    else image = requestAnimationFrame(boucle)

    let attente: number | undefined
    const surTaille = () => {
      window.clearTimeout(attente)
      attente = window.setTimeout(() => {
        const avant = L
        construire()
        // Un téléphone qui affiche ou masque sa barre d'adresse ne doit pas
        // rejouer la montée : seule la largeur compte.
        if (Math.abs(avant - L) > 40) depart = performance.now() - 1600
        dessiner(performance.now())
      }, 150)
    }
    window.addEventListener('resize', surTaille)
    document.addEventListener('visibilitychange', relancer)
    const obs =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => {
            visible = e.isIntersecting
            relancer()
          })
        : null
    obs?.observe(toile)

    return () => {
      cancelAnimationFrame(image)
      window.clearTimeout(attente)
      window.removeEventListener('resize', surTaille)
      document.removeEventListener('visibilitychange', relancer)
      obs?.disconnect()
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className={`block h-full w-full ${className}`} />
}
