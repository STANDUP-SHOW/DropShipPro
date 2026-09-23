import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IllustrationTheme } from './IllustrationTheme'

export interface DiapoTheme {
  slug: string
  eyebrow: string
  titre: string
  accroche: string
  image: string
}

/**
 * Le diaporama d'arrivée : une image par thème de l'accueil, qui défile toute
 * seule et envoie, au clic, sur la section correspondante de la page.
 *
 * Demandé par Max le 23/09/2026 : « une animation avec un diaporama d'images
 * correspondant aux thèmes énoncés, cliquables pour envoyer sur le niveau de
 * page demandé ». Les images sont les siennes, déposées dans
 * /images/accueil/<slug>.jpg ; tant qu'une manque, l'illustration de repli
 * (IllustrationTheme) prend sa place, pour que la page ne montre jamais une
 * image cassée.
 *
 * Le défilement s'arrête quand la souris est dessus, quand l'onglet est caché,
 * et n'existe pas du tout pour qui a demandé moins de mouvement.
 */
export function AccueilDiaporama({ themes, intervalle = 5000 }: { themes: DiapoTheme[]; intervalle?: number }) {
  const [index, setIndex] = useState(0)
  const [pause, setPause] = useState(false)
  const reduit = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (pause || reduit.current || themes.length < 2) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') setIndex((i) => (i + 1) % themes.length)
    }, intervalle)
    return () => clearInterval(t)
  }, [pause, themes.length, intervalle])

  if (!themes.length) return null
  const courant = themes[index]

  const aller = (slug: string) => {
    document.getElementById(slug)?.scrollIntoView({ behavior: reduit.current ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <div
      className="relative mx-auto mt-10 max-w-5xl select-none"
      onMouseEnter={() => setPause(true)}
      onMouseLeave={() => setPause(false)}
      onFocus={() => setPause(true)}
      onBlur={() => setPause(false)}
      role="region"
      aria-roledescription="diaporama"
      aria-label="Ce que fait DropShipper IA"
    >
      <div className="relative aspect-[16/8] overflow-hidden rounded-3xl border border-white/10 bg-black/30 shadow-2xl shadow-purple-950/40">
        {themes.map((t, i) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => aller(t.slug)}
            aria-hidden={i !== index}
            tabIndex={i === index ? 0 : -1}
            className={`absolute inset-0 block w-full cursor-pointer text-left transition-opacity duration-700 ${
              i === index ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <ImageOuRepli src={t.image} slug={t.slug} alt="" actif={i === index} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b0714] via-[#0b0714]/80 to-transparent px-6 pb-6 pt-16 md:px-10 md:pb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">{t.eyebrow}</p>
              <h2 className="mt-1 text-2xl font-extrabold leading-tight md:text-4xl">{t.titre}</h2>
              <p className="mt-2 hidden max-w-2xl text-sm text-gray-300 md:block">{t.accroche}</p>
              <span className="mt-3 inline-block text-sm font-semibold text-purple-200 underline-offset-4 group-hover:underline">
                En savoir plus ↓
              </span>
            </div>
          </button>
        ))}

        <button
          type="button"
          aria-label="Thème précédent"
          onClick={() => setIndex((i) => (i - 1 + themes.length) % themes.length)}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur hover:bg-black/60"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          aria-label="Thème suivant"
          onClick={() => setIndex((i) => (i + 1) % themes.length)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur hover:bg-black/60"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2" role="tablist" aria-label="Thèmes">
        {themes.map((t, i) => (
          <button
            key={t.slug}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={t.eyebrow}
            title={t.eyebrow}
            onClick={() => setIndex(i)}
            className={`h-2.5 rounded-full transition-all ${i === index ? 'w-8 bg-purple-400' : 'w-2.5 bg-white/25 hover:bg-white/50'}`}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {courant.eyebrow} : {courant.titre}
      </p>
    </div>
  )
}

/** L'image de Max si elle existe ; sinon l'illustration de repli, sans image cassée. */
export function ImageOuRepli({ src, slug, alt, actif = true, className = '' }: { src: string; slug: string; alt: string; actif?: boolean; className?: string }) {
  const [manque, setManque] = useState(false)
  if (manque) return <IllustrationTheme slug={slug} className={className} />
  return (
    <img
      src={src}
      alt={alt}
      loading={actif ? 'eager' : 'lazy'}
      onError={() => setManque(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  )
}
