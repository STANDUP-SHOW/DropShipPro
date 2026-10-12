import { useEffect, useRef, useState } from 'react'
import { PlatformLogo } from './PlatformLogo'
import type { LogoFrise } from './FriseLogos'

/**
 * Le bloc « fournisseurs ↔ canaux de vente » de l'accueil (Max, 12/10/2026).
 *
 * Il remplace les trois frises de logos : d'un côté les fournisseurs qui
 * défilent, de l'autre les canaux de vente, au centre l'icône DropShipper
 * entourée des réseaux sociaux. Des traits de lumière partent d'un fournisseur,
 * passent par l'icône et finissent sur un canal ; deux compteurs montent de 0
 * quand le bloc entre dans l'écran. Même esprit que la publicité du site et
 * que la ville de nuit du haut de page : la lumière vit dans le dessin (canvas),
 * jamais sur les lettres.
 *
 * Les chiffres ne sont pas écrits ici : ce sont les longueurs des listes
 * engendrées (fournisseurs.json, canaux.json).
 */

const RESEAUX = [
  { id: 'FACEBOOK', label: 'Facebook', domain: 'facebook.com', color: '#1877f2' },
  { id: 'INSTAGRAM', label: 'Instagram', domain: 'instagram.com', color: '#e1306c' },
  { id: 'TIKTOK', label: 'TikTok', domain: 'tiktok.com', color: '#000000' },
  { id: 'YOUTUBE', label: 'YouTube', domain: 'youtube.com', color: '#ff0000' },
  { id: 'PINTEREST', label: 'Pinterest', domain: 'pinterest.com', color: '#e60023' },
  { id: 'LINKEDIN', label: 'LinkedIn', domain: 'linkedin.com', color: '#0a66c2' },
  { id: 'SNAPCHAT', label: 'Snapchat', domain: 'snapchat.com', color: '#8a7300' },
  { id: 'X', label: 'X', domain: 'x.com', color: '#111111' },
]

/** Le laser : orange du logo côté fournisseur, rose côté canal. */
const TEINTES = ['#f28a4b', '#e85290', '#fdbf06', '#22d3ee']

function useVisible<T extends Element>(ref: React.RefObject<T | null>) {
  const [vu, setVu] = useState(false)
  const [dedans, setDedans] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      setDedans(e.isIntersecting)
      if (e.isIntersecting) setVu(true)
    }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return { vu, dedans }
}

function Compteur({ cible, actif, calme }: { cible: number; actif: boolean; calme: boolean }) {
  const [n, setN] = useState(calme ? cible : 0)
  useEffect(() => {
    if (!actif || calme) {
      if (calme) setN(cible)
      return
    }
    const duree = 1800
    const t0 = performance.now()
    let raf = 0
    const pas = (t: number) => {
      const p = Math.min(1, (t - t0) / duree)
      setN(Math.round(cible * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(pas)
    }
    raf = requestAnimationFrame(pas)
    return () => cancelAnimationFrame(raf)
  }, [actif, calme, cible])
  return <span className="tabular-nums">{n.toLocaleString('fr-FR')}</span>
}

function Tuile({ l, i, cote }: { l: LogoFrise; i: number; cote: 'f' | 'c' }) {
  return (
    <li
      data-cote={cote}
      className={`hub-tuile ${l.large ? 'hub-tuile-large' : ''}`}
      style={{ ['--i' as string]: i % 12 }}
    >
      {l.logo ? (
        <img
          src={l.logo}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="max-h-full max-w-full object-contain"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <span className="grid h-10 w-10 place-items-center rounded-lg text-sm font-extrabold text-white" style={{ background: l.couleur || '#e85290' }}>
          {l.label.slice(0, 2).toUpperCase()}
        </span>
      )}
    </li>
  )
}

/** Une colonne qui défile sans fin, doublée pour boucler. */
function Colonne({ logos, cote, sens, duree }: { logos: LogoFrise[]; cote: 'f' | 'c'; sens: 'haut' | 'bas'; duree: number }) {
  return (
    <div className="hub-colonne" aria-hidden="true">
      <ul className="hub-piste" data-sens={sens} style={{ animationDuration: `${duree}s` }}>
        {[...logos, ...logos].map((l, i) => (
          <Tuile key={`${l.id}-${i}`} l={l} i={i} cote={cote} />
        ))}
      </ul>
    </div>
  )
}

export function HubLiaisons({ fournisseurs, canaux }: { fournisseurs: LogoFrise[]; canaux: LogoFrise[] }) {
  const bloc = useRef<HTMLElement>(null)
  const toile = useRef<HTMLCanvasElement>(null)
  const coeur = useRef<HTMLDivElement>(null)
  const { vu, dedans } = useVisible(bloc)
  const [calme, setCalme] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setCalme(mq.matches)
  }, [])

  // Les canaux sur deux colonnes, les fournisseurs sur deux colonnes : quatre
  // pistes, en sens contraire deux à deux.
  const f = [fournisseurs.filter((_, i) => i % 2 === 0), fournisseurs.filter((_, i) => i % 2 === 1)]
  const c = [canaux.filter((_, i) => i % 2 === 0), canaux.filter((_, i) => i % 2 === 1)]

  useEffect(() => {
    const cv = toile.current
    const section = bloc.current
    if (!cv || !section || !dedans || calme) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let L = 0
    let H = 0
    const taille = () => {
      const r = section.getBoundingClientRect()
      L = r.width
      H = r.height
      cv.width = Math.round(L * dpr)
      cv.height = Math.round(H * dpr)
      cv.style.width = `${L}px`
      cv.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    taille()
    const ro = new ResizeObserver(taille)
    ro.observe(section)

    type Rayon = { de: Element; vers: Element; t0: number; teinte: string }
    let rayons: Rayon[] = []
    let dernier = 0
    let raf = 0

    const visibles = (cote: 'f' | 'c') => {
      // Only tiles well inside their own lane, away from the faded edges.
      const voie = section.querySelector(`.hub-cote-${cote}`)
      if (!voie) return []
      const s = voie.getBoundingClientRect()
      const mx = s.width * 0.12
      const my = s.height * 0.18
      return Array.from(voie.querySelectorAll(`[data-cote="${cote}"]`)).filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.top > s.top + my && r.bottom < s.bottom - my && r.left > s.left + mx && r.right < s.right - mx
      })
    }
    const centre = (el: Element) => {
      const s = section.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top }
    }
    // A point on the quadratic curve a → b bending toward c.
    const point = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, t: number) => {
      const u = 1 - t
      return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }
    }

    const DUREE = 1700
    const image = (t: number) => {
      ctx.clearRect(0, 0, L, H)
      if (t - dernier > 360 && rayons.length < 7) {
        const fs = visibles('f')
        const cs = visibles('c')
        if (fs.length && cs.length) {
          rayons.push({
            de: fs[Math.floor(Math.random() * fs.length)],
            vers: cs[Math.floor(Math.random() * cs.length)],
            t0: t,
            teinte: TEINTES[Math.floor(Math.random() * TEINTES.length)],
          })
        }
        dernier = t
      }
      const hub = coeur.current ? centre(coeur.current) : { x: L / 2, y: H / 2 }
      rayons = rayons.filter((r) => t - r.t0 < DUREE)
      ctx.globalCompositeOperation = 'lighter'
      for (const r of rayons) {
        const p = (t - r.t0) / DUREE
        const a = centre(r.de)
        const b = centre(r.vers)
        // Two legs: supplier → hub, hub → channel, each bowed a little.
        const c1 = { x: (a.x + hub.x) / 2, y: (a.y + hub.y) / 2 - 40 }
        const c2 = { x: (hub.x + b.x) / 2, y: (hub.y + b.y) / 2 + 40 }
        const tete = Math.min(1, p * 1.6)
        const queue = Math.max(0, tete - 0.35)
        const fondu = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1
        const chemin = (de: number, a2: number) => {
          ctx.beginPath()
          const N = 28
          for (let k = 0; k <= N; k++) {
            const s = de + ((a2 - de) * k) / N
            const q = s < 0.5 ? point(a, hub, c1, s * 2) : point(hub, b, c2, (s - 0.5) * 2)
            if (k === 0) ctx.moveTo(q.x, q.y)
            else ctx.lineTo(q.x, q.y)
          }
        }
        // The faint trace that stays a moment, then the bright head.
        chemin(0, tete)
        ctx.strokeStyle = r.teinte + '22'
        ctx.lineWidth = 1
        ctx.globalAlpha = fondu
        ctx.stroke()
        chemin(queue, tete)
        ctx.strokeStyle = r.teinte
        ctx.lineWidth = 2
        ctx.shadowColor = r.teinte
        ctx.shadowBlur = 12
        ctx.stroke()
        ctx.shadowBlur = 0
        const q = tete < 0.5 ? point(a, hub, c1, tete * 2) : point(hub, b, c2, (tete - 0.5) * 2)
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(q.x, q.y, 2.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(image)
    }
    raf = requestAnimationFrame(image)
    const cache = () => {
      if (document.hidden) cancelAnimationFrame(raf)
      else raf = requestAnimationFrame(image)
    }
    document.addEventListener('visibilitychange', cache)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', cache)
    }
  }, [dedans, calme])

  return (
    <section
      ref={bloc}
      id="fournisseurs-et-canaux"
      className={`hub-bloc relative isolate overflow-hidden border-t border-[var(--trait)] ${vu ? 'hub-vu' : ''}`}
      aria-labelledby="hub-titre"
    >
      <canvas ref={toile} className="pointer-events-none absolute inset-0 z-10" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-5 py-12 md:px-6 md:py-16">
        <h2 id="hub-titre" className="text-center text-3xl font-extrabold tracking-tight md:text-5xl">
          Vos fournisseurs, <span className="text-gradient-brand">tous vos canaux</span>
        </h2>
        <div className="hub-grille mt-8 md:mt-12">
          <div className="hub-cote hub-cote-f">
            <Colonne logos={f[0]} cote="f" sens="haut" duree={Math.max(24, f[0].length * 2.2)} />
            <Colonne logos={f[1]} cote="f" sens="bas" duree={Math.max(24, f[1].length * 2.4)} />
          </div>

          <div className="hub-centre">
            <p className="hub-compteur">
              <strong><Compteur cible={fournisseurs.length} actif={vu} calme={calme} /></strong>
              <span>fournisseurs reliés</span>
            </p>
            <div ref={coeur} className="hub-coeur">
              <ul className="hub-orbite" aria-label="Réseaux sociaux">
                {RESEAUX.map((r, i) => (
                  <li key={r.id} style={{ ['--a' as string]: `${(360 / RESEAUX.length) * i}deg` }} title={r.label}>
                    <span className="hub-orbite-icone">
                      <PlatformLogo id={r.id} label={r.label} domain={r.domain} color={r.color} size={30} arrondi="md" />
                    </span>
                  </li>
                ))}
              </ul>
              <img src="/marque/dropshipper-icone.png" alt="DropShipper" width={96} height={96} className="hub-cube" />
            </div>
            <p className="hub-reseaux">Tous vos réseaux du même endroit</p>
            <p className="hub-compteur">
              <strong><Compteur cible={canaux.length} actif={vu} calme={calme} /></strong>
              <span>canaux de vente</span>
            </p>
          </div>

          <div className="hub-cote hub-cote-c">
            <Colonne logos={c[0]} cote="c" sens="bas" duree={Math.max(60, c[0].length * 1.6)} />
            <Colonne logos={c[1]} cote="c" sens="haut" duree={Math.max(60, c[1].length * 1.7)} />
          </div>
        </div>
      </div>
    </section>
  )
}
