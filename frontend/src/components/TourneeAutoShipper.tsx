import { useEffect, useRef, useState } from 'react'

/**
 * AutoShipper's daily round, animated for its home-page card (Max, 12/10/2026:
 * « une petite animation d'automatique… pour qu'on comprenne le fonctionnement »).
 *
 * Left: the AutoShipper cog inside its two looping arrows, in the logo's
 * pink → orange → yellow. Right: the steps of one round, lit one after the
 * other, then the loop starts over. The steps are the ones the AutoShipper
 * page lists (pages/Autopilot.tsx, SYSTEME), nothing more.
 *
 * Pure SVG + one timer: it only ticks while the card is on screen, and
 * « réduire les animations » shows the whole round at once, still.
 */
const ETAPES = [
  'Analyse de marché',
  'Import des produits',
  'Annonces optimisées',
  'Diffusion marketplaces',
  'Commandes',
  'Hotline',
  'Livraisons',
  'SAV',
  'Comptabilité',
]

const PAS_MS = 1100

export function TourneeAutoShipper() {
  const ref = useRef<HTMLDivElement>(null)
  const reduit = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [etape, setEtape] = useState(reduit ? ETAPES.length : 0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || reduit || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [reduit])

  useEffect(() => {
    if (!visible || reduit) return
    // One extra beat on « tout est fait » before the next round starts.
    const t = window.setInterval(() => setEtape((e) => (e >= ETAPES.length ? 0 : e + 1)), PAS_MS)
    return () => window.clearInterval(t)
  }, [visible, reduit])

  const fini = etape >= ETAPES.length

  return (
    <div ref={ref} className="tournee-as relative flex h-full w-full items-center gap-3 overflow-hidden bg-[#101321] px-3 sm:px-4" aria-hidden="true">
      <div className="relative flex h-full w-[38%] shrink-0 flex-col items-center justify-center">
        <svg viewBox="0 0 120 120" className="w-full max-w-[9rem]">
          <defs>
            <linearGradient id="as-degrade" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#e8357a" />
              <stop offset="0.55" stopColor="#f2804a" />
              <stop offset="1" stopColor="#ffc20e" />
            </linearGradient>
          </defs>
          {/* The two arrows of the loop, turning slowly. */}
          <g className={reduit ? '' : 'tournee-as-boucle'}>
            <path d="M24 52 A38 38 0 0 1 92 36" fill="none" stroke="url(#as-degrade)" strokeWidth="7" strokeLinecap="round" />
            <path d="M88 24 L96 40 L79 42 Z" fill="#ffc20e" />
            <path d="M96 68 A38 38 0 0 1 28 84" fill="none" stroke="url(#as-degrade)" strokeWidth="7" strokeLinecap="round" />
            <path d="M32 96 L24 80 L41 78 Z" fill="#e8357a" />
          </g>
          {/* The cog, turning the other way. */}
          <g className={reduit ? '' : 'tournee-as-rouage'}>
            {Array.from({ length: 8 }, (_, i) => (
              <rect key={i} x="55" y="33" width="10" height="12" rx="2" fill="url(#as-degrade)" transform={`rotate(${i * 45} 60 60)`} />
            ))}
            <circle cx="60" cy="60" r="19" fill="url(#as-degrade)" />
            <circle cx="60" cy="60" r="8" fill="#101321" />
          </g>
        </svg>
        <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--texte-2)] sm:text-[11px]">
          {fini ? 'Tournée faite' : 'Tournée du jour'}
        </p>
      </div>

      <ol className="flex min-w-0 flex-1 flex-col justify-center gap-[3px] py-2">
        {ETAPES.map((nom, i) => {
          const etat = i < etape ? 'fait' : i === etape ? 'en-cours' : 'a-venir'
          return (
            <li
              key={nom}
              className={`flex items-center gap-2 truncate text-[11px] leading-[1.3] transition-colors duration-300 sm:text-xs ${
                etat === 'a-venir' ? 'text-[var(--texte-3)]' : 'text-[var(--texte)]'
              } ${etat === 'en-cours' ? 'font-semibold' : ''}`}
            >
              <span
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                  etat === 'a-venir' ? 'border border-[var(--trait-fort)]' : 'tournee-as-pastille'
                } ${etat === 'en-cours' ? 'scale-125' : ''}`}
              >
                {etat === 'fait' && (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="#101321" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.2 5 8.5 9.5 3.5" />
                  </svg>
                )}
              </span>
              <span className="truncate">{nom}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
