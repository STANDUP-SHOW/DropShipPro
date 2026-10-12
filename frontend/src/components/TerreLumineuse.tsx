import { useEffect, useRef } from 'react'

/**
 * La Terre de nuit derrière le dernier appel de l'accueil (Max, 12/10/2026 :
 * « la terre qui bouge et qui s'illumine comme si le produit se décuplait
 * partout »).
 *
 * Dessinée ici, comme VilleDeNuit : la vidéo de référence vient de Pinterest et
 * n'est qu'une référence de style. Le globe est vu depuis l'orbite, l'horizon
 * en haut ; elle tourne, toujours éclairée, et des faisceaux de toutes les
 * couleurs partent en même temps de plusieurs pays vers plusieurs autres : les
 * échanges internationaux (Max, 12/10/2026 : plus d'écran noir entre deux vagues).
 *
 * Les terres viennent du tracé Natural Earth déjà utilisé par la carte du
 * tableau de bord (stats/monde-trace.ts), chargé seulement quand le bloc
 * approche de l'écran : 110 Ko que l'accueil n'a pas à payer au démarrage.
 * Les lumières sont dans l'image ; le texte posé dessus garde son voile.
 */

type Lieu = { lon: number; lat: number }
type Point = Lieu & { teinte: number; force: number; phase: number }
type Arc = { de: Lieu; vers: Lieu; t0: number; duree: number; teinte: number }

const RAD = Math.PI / 180
// Cyan of the reference, the logo's orange and rose, and a warm white.
const TEINTES = ['#5ee7ff', '#ffb347', '#f28a4b', '#ff7ab8', '#fff3d6']

function sprite(couleur: string, taille: number) {
  const c = document.createElement('canvas')
  c.width = c.height = taille
  const g = c.getContext('2d')!
  const r = taille / 2
  const d = g.createRadialGradient(r, r, 0, r, r, r)
  d.addColorStop(0, '#ffffff')
  d.addColorStop(0.18, couleur)
  d.addColorStop(0.45, couleur + '55')
  d.addColorStop(1, couleur + '00')
  g.fillStyle = d
  g.fillRect(0, 0, taille, taille)
  return c
}

function distance(a: Lieu, b: Lieu) {
  const s =
    Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD) +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((a.lon - b.lon) * RAD)
  return Math.acos(Math.max(-1, Math.min(1, s)))
}

export function TerreLumineuse() {
  const toile = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = toile.current
    const parent = cv?.parentElement
    if (!cv || !parent) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const calme = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let annule = false
    let raf = 0
    let visible = false
    let lancer: (() => void) | null = null

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        if (visible && lancer) lancer()
      },
      { rootMargin: '300px 0px' },
    )
    io.observe(parent)

    import('./stats/monde-trace').then(({ MONDE_D, CENTRES_ISO }) => {
      if (annule) return
      // Land mask: the equirectangular trace (360 × 180) filled once.
      const m = document.createElement('canvas')
      m.width = 360
      m.height = 180
      const mg = m.getContext('2d')!
      mg.fill(new Path2D(MONDE_D))
      const px = mg.getImageData(0, 0, 360, 180).data
      const terre = (x: number, y: number) => px[(Math.floor(y) * 360 + Math.floor(x)) * 4 + 3] > 0

      const mobile = window.innerWidth < 768
      const voulus = mobile ? 9000 : 22000
      const points: Point[] = []
      // Half the lights scattered over land, half gathered around "cities",
      // which gives the clustered look of a night photograph.
      const villes: Array<[number, number]> = []
      for (let essai = 0; villes.length < 500 && essai < 20000; essai++) {
        const x = Math.random() * 360
        const y = 10 + Math.random() * 120
        if (terre(x, y)) villes.push([x, y])
      }
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.6
      for (let essai = 0; points.length < voulus && essai < voulus * 12; essai++) {
        let x: number
        let y: number
        if (essai % 2) {
          const v = villes[Math.floor(Math.random() * villes.length)]
          x = (v[0] + gauss() * 1.4 + 360) % 360
          y = Math.max(1, Math.min(179, v[1] + gauss()))
        } else {
          x = Math.random() * 360
          y = 8 + Math.random() * 140
        }
        if (!terre(x, y)) continue
        const r = Math.random()
        points.push({
          lon: x - 180,
          lat: 90 - y,
          teinte: r < 0.45 ? 0 : r < 0.75 ? 1 : r < 0.85 ? 2 : r < 0.92 ? 3 : 4,
          force: 0.35 + Math.random() * 0.65,
          phase: Math.random() * Math.PI * 2,
        })
      }
      // Faint filaments between close lights, like roads seen from orbit.
      const liens: Array<[number, number]> = []
      const grille = new Map<string, number[]>()
      points.forEach((p, i) => {
        const k = `${Math.floor(p.lon)}:${Math.floor(p.lat)}`
        const l = grille.get(k)
        if (l) l.push(i)
        else grille.set(k, [i])
      })
      points.forEach((p, i) => {
        if (i % 2) return
        const voisins = grille.get(`${Math.floor(p.lon)}:${Math.floor(p.lat)}`) ?? []
        let n = 0
        for (const j of voisins) {
          if (j <= i) continue
          liens.push([i, j])
          if (++n >= 2) break
        }
      })
      const hubs: Lieu[] = Object.values(CENTRES_ISO).map(([x, y]) => ({ lon: x - 180, lat: 90 - y }))
      const france = CENTRES_ISO.FRA ? { lon: CENTRES_ISO.FRA[0] - 180, lat: 90 - CENTRES_ISO.FRA[1] } : { lon: 2, lat: 46 }
      const lutins = TEINTES.map((c) => sprite(c, 32))

      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5)
      let L = 0
      let H = 0
      const taille = () => {
        L = parent.clientWidth
        H = parent.clientHeight
        cv.width = Math.round(L * dpr)
        cv.height = Math.round(H * dpr)
        cv.style.width = `${L}px`
        cv.style.height = `${H}px`
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      taille()
      let attente = 0
      const ro = new ResizeObserver(() => {
        clearTimeout(attente)
        attente = window.setTimeout(taille, 150)
      })
      ro.observe(parent)

      // The view latitude below the equator puts the northern lights along
      // the horizon, as seen from orbit in the reference.
      const PHI0 = -24 * RAD
      const cosT = Math.cos(PHI0)
      const sinT = Math.sin(PHI0)
      const geometrie = () => {
        const R = Math.max(L * 0.9, H * 1.2)
        return { R, cx: L / 2, cy: H * 0.2 + R }
      }
      const projette = (p: Lieu, rot: number, R: number, cx: number, cy: number, haut = 1) => {
        const la = p.lat * RAD
        const lo = (p.lon + rot) * RAD
        const x = Math.cos(la) * Math.sin(lo)
        const y = Math.sin(la)
        const z = Math.cos(la) * Math.cos(lo)
        const y2 = y * cosT - z * sinT
        const z2 = y * sinT + z * cosT
        return { x: cx + R * haut * x, y: cy - R * haut * y2, z: z2 }
      }

      let arcs: Arc[] = []
      let dernierArc = 0
      const t0 = performance.now()
      const MAX_ARCS = mobile ? 14 : 26

      const image = (maintenant: number) => {
        const t = calme ? 0 : maintenant - t0
        // Turns westward, about a full turn a minute and a half; starts with Europe facing the viewer.
        const rot = -france.lon - 8 + t * 0.004
        const { R, cx, cy } = geometrie()

        ctx.clearRect(0, 0, L, H)
        // Atmosphere along the horizon.
        const atm = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.08)
        atm.addColorStop(0, 'rgba(70,170,255,0)')
        atm.addColorStop(0.3, 'rgba(70,170,255,0.55)')
        atm.addColorStop(0.55, 'rgba(110,90,255,0.18)')
        atm.addColorStop(1, 'rgba(70,170,255,0)')
        ctx.fillStyle = atm
        ctx.beginPath()
        ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2)
        ctx.fill()
        // The night side of the planet.
        const sol = ctx.createLinearGradient(0, cy - R, 0, H)
        sol.addColorStop(0, '#0b1a33')
        sol.addColorStop(0.25, '#08101f')
        sol.addColorStop(1, '#05070f')
        ctx.fillStyle = sol
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, Math.PI * 2)
        ctx.fill()

        ctx.globalCompositeOperation = 'lighter'
        // Every light stays on; each one only twinkles a little.
        for (const p of points) {
          const q = projette(p, rot, R, cx, cy)
          if (q.z <= 0.02 || q.y < -10 || q.y > H + 10) continue
          const scintille = 0.8 + 0.2 * Math.sin(t * 0.004 + p.phase)
          const a = p.force * scintille * Math.min(1, q.z * 3)
          if (a < 0.03) continue
          const s = (2.6 + 6 * p.force) * (0.55 + q.z * 0.6)
          ctx.globalAlpha = a
          ctx.drawImage(lutins[p.teinte], q.x - s, q.y - s, s * 2, s * 2)
        }
        ctx.globalAlpha = 1

        // The filaments, always lit.
        ctx.lineWidth = 0.7
        for (const [teinte, couleur] of [[0, '#5ee7ff'], [1, '#ffb347']] as const) {
          ctx.strokeStyle = couleur
          ctx.globalAlpha = 0.28
          ctx.beginPath()
          for (const [i, j] of liens) {
            const a = points[i]
            if ((a.teinte === 0) !== (teinte === 0)) continue
            const b = points[j]
            const qa = projette(a, rot, R, cx, cy)
            if (qa.z <= 0.05 || qa.y < -10 || qa.y > H + 10) continue
            const qb = projette(b, rot, R, cx, cy)
            ctx.moveTo(qa.x, qa.y)
            ctx.lineTo(qb.x, qb.y)
          }
          ctx.stroke()
        }
        ctx.globalAlpha = 1

        // Several beams at once, from several countries to several others,
        // both ends inside the visible part of the globe.
        const face = (l: Lieu) => {
          const q = projette(l, rot, R, cx, cy)
          return q.z > 0.04 && q.x > L * 0.04 && q.x < L * 0.96 && q.y > H * 0.08 && q.y < H * 0.95
        }
        const remplir = (combien: number, age: number) => {
          // Candidates on screen: the visible country centres, and lit places
          // (so beams keep flying when an ocean faces us).
          const vus: Lieu[] = hubs.filter(face)
          for (let k = 0; k < 300; k++) {
            const q = points[Math.floor(Math.random() * points.length)]
            if (face(q)) vus.push(q)
          }
          if (vus.length < 2) return
          for (let essai = 0; essai < combien * 12 && combien > 0; essai++) {
            const de = vus[Math.floor(Math.random() * vus.length)]
            const vers = vus[Math.floor(Math.random() * vus.length)]
            const ang = distance(de, vers)
            if (ang < 0.08 || ang > 1.6) continue
            const duree = 1500 + Math.random() * 1100
            arcs.push({ de, vers, t0: t - age * Math.random() * duree, duree, teinte: Math.floor(Math.random() * 4) })
            combien--
          }
        }
        if (calme && !arcs.length) remplir(MAX_ARCS, 1)
        else if (!calme && !arcs.length) remplir(Math.ceil(MAX_ARCS / 2), 1)
        if (!calme && maintenant - dernierArc > 100 && arcs.length < MAX_ARCS) {
          remplir(1, 0)
          dernierArc = maintenant
        }
        if (!calme) arcs = arcs.filter((a) => t - a.t0 < a.duree + 600)
        for (const a of arcs) {
          const p = calme ? 1 : Math.min(1, (t - a.t0) / a.duree)
          const fondu = !calme && t - a.t0 > a.duree ? 1 - (t - a.t0 - a.duree) / 600 : 1
          const ang = distance(a.de, a.vers)
          const N = 40
          const pts: { x: number; y: number; z: number }[] = []
          for (let k = 0; k <= N; k++) {
            const u = (k / N) * p
            // Spherical interpolation between the two places.
            const la1 = a.de.lat * RAD, lo1 = a.de.lon * RAD, la2 = a.vers.lat * RAD, lo2 = a.vers.lon * RAD
            const s = Math.sin(ang) || 1
            const A = Math.sin((1 - u) * ang) / s
            const B = Math.sin(u * ang) / s
            const X = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2)
            const Y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2)
            const Z = A * Math.sin(la1) + B * Math.sin(la2)
            const lieu = { lat: Math.atan2(Z, Math.hypot(X, Y)) / RAD, lon: Math.atan2(Y, X) / RAD }
            const levee = 1 + 0.035 * Math.sin((k / N) * Math.PI) * Math.min(1, ang)
            pts.push(projette(lieu, rot, R, cx, cy, levee))
          }
          if (pts[pts.length - 1].z < -0.2) continue
          const couleur = TEINTES[a.teinte]
          ctx.strokeStyle = couleur
          ctx.globalAlpha = 0.7 * fondu
          ctx.lineWidth = 1.4
          ctx.beginPath()
          pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
          ctx.stroke()
          // The bright head.
          const tete = pts.slice(Math.max(0, pts.length - 9))
          ctx.globalAlpha = fondu
          ctx.lineWidth = 2.6
          ctx.shadowColor = couleur
          ctx.shadowBlur = 10
          ctx.beginPath()
          tete.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
          ctx.stroke()
          ctx.shadowBlur = 0
          // A flash where the beam leaves.
          if (p < 1) {
            const dep = pts[0]
            const r = 5 + 9 * (1 - p)
            ctx.globalAlpha = 0.7 * (1 - p)
            ctx.drawImage(lutins[a.teinte], dep.x - r, dep.y - r, r * 2, r * 2)
          }
          if (p >= 1) {
            const fin2 = pts[pts.length - 1]
            const r = 6 + 18 * Math.min(1, (t - a.t0 - a.duree) / 600)
            ctx.globalAlpha = 0.6 * fondu
            ctx.drawImage(lutins[a.teinte], fin2.x - r, fin2.y - r, r * 2, r * 2)
          }
          ctx.globalAlpha = 1
        }
        ctx.globalCompositeOperation = 'source-over'

        if (!calme && visible && !document.hidden) raf = requestAnimationFrame(image)
        else raf = 0
      }

      lancer = () => {
        if (!raf) raf = requestAnimationFrame(image)
      }
      const reprise = () => {
        if (!document.hidden && visible) lancer?.()
      }
      document.addEventListener('visibilitychange', reprise)
      if (calme) image(performance.now())
      else if (visible) lancer()

      const nettoie = () => {
        ro.disconnect()
        clearTimeout(attente)
        document.removeEventListener('visibilitychange', reprise)
      }
      cleanup.push(nettoie)
    })

    const cleanup: Array<() => void> = []
    return () => {
      annule = true
      cancelAnimationFrame(raf)
      io.disconnect()
      cleanup.forEach((f) => f())
    }
  }, [])

  return <canvas ref={toile} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
}
