import { useEffect, useRef, useState } from 'react'
import { IllustrationTheme } from './IllustrationTheme'

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

/**
 * La boucle animée d'un thème (8 s, 1280 × 720, sans son), rendue par
 * docs/pub-video/accueil.cjs et déposée dans public/images/accueil/<slug>.mp4
 * avec son affiche <slug>.jpg (27/09/2026, posées le 29/09).
 *
 * Elle ne se charge ni ne joue tant que le bloc n'est pas à l'écran : onze
 * vidéos lancées ensemble feraient 13 Mo au premier affichage. L'affiche tient
 * la place jusque-là ; « réduire les animations » garde l'affiche seule, et une
 * vidéo absente retombe sur ImageOuRepli (affiche, puis illustration de repli).
 */
export function BoucleTheme({ poster, slug, alt }: { poster: string; slug: string; alt: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [enPanne, setEnPanne] = useState(false)
  const reduit = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const v = ref.current
    if (!v || reduit || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      ([e]) => {
        // play() appelé juste après avoir posé la source échoue en silence (vidéo
        // pas encore prête, constaté en aperçu) : l'attribut autoplay lance la
        // lecture dès que le navigateur peut, et se retire quand le bloc sort.
        if (e.isIntersecting) {
          v.muted = true
          v.autoplay = true
          if (!v.getAttribute('src')) v.src = poster.replace(/\.jpg$/, '.mp4')
          else v.play().catch(() => undefined)
        } else {
          v.autoplay = false
          v.pause()
        }
      },
      { threshold: 0.25 },
    )
    obs.observe(v)
    return () => obs.disconnect()
  }, [poster, reduit])

  if (reduit || enPanne) return <ImageOuRepli src={poster} slug={slug} alt={alt} actif={false} />
  return (
    <video
      ref={ref}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-label={alt}
      onError={() => setEnPanne(true)}
      className="h-full w-full object-cover"
    />
  )
}
