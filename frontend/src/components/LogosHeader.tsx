import { useEffect, useState } from 'react'

/**
 * Bande d'en-tête horizontale avec tous les logos des réseaux et partenaires.
 *
 * Affiche tous les logos du dossier `public/logos/` dans une bande fine et
 * compacte en haut de la page. Les logos s'affichent dans un conteneur flex
 * horizontal avec défilement si nécessaire.
 */
export function LogosHeader() {
  const [logos, setLogos] = useState<{ path: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Charger la liste des logos depuis un fichier manifest généré à la build
    // ou depuis l'API backend si disponible
    const loadLogos = async () => {
      try {
        // Essayer de charger un manifest JSON généré à la build
        const response = await fetch('/logos-manifest.json')
        if (response.ok) {
          const data = await response.json()
          setLogos(data.logos || [])
        } else {
          // Fallback : liste prédéfinie des logos les plus importants
          setLogos(getDefaultLogos())
        }
      } catch {
        // Si ça échoue, utiliser la liste par défaut
        setLogos(getDefaultLogos())
      } finally {
        setLoading(false)
      }
    }

    loadLogos()
  }, [])

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-black/40 backdrop-blur-sm">
      <div className="min-h-[60px] overflow-x-auto">
        <ul className="flex gap-2 px-4 py-3 sm:gap-3 md:gap-4">
          {!loading && logos.length > 0
            ? logos.map((logo) => (
                <li
                  key={logo.path}
                  className="flex shrink-0 items-center justify-center"
                  title={logo.name}
                >
                  <picture>
                    {logo.path.includes('.png') && (
                      <source srcSet={logo.path.replace('.png', '.webp')} type="image/webp" />
                    )}
                    <img
                      src={logo.path}
                      alt={logo.name}
                      className="h-10 max-w-[60px] object-contain grayscale transition-all duration-200 hover:grayscale-0 sm:h-12 sm:max-w-[80px]"
                      loading="lazy"
                      onError={(e) => {
                        // Masquer les images qui ne peuvent pas se charger
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </picture>
                </li>
              ))
            : null}
          {loading && <li className="text-xs text-gray-500">Chargement des logos...</li>}
        </ul>
      </div>
    </header>
  )
}

/**
 * Liste par défaut des logos les plus importants si le manifest n'est pas disponible.
 */
function getDefaultLogos() {
  const logoNames = [
    'amazon',
    'ebay',
    'shopify',
    'etsy',
    'asos',
    'alltricks',
    'auchan',
    'carrefour',
    'cdiscount',
    'alibaba',
    'aliexpress',
    'temu',
    'shein',
    'wish',
    'vinted',
    'leboncoin',
    'facebook',
    'instagram',
    'tiktok',
    'youtube',
    'pinterest',
    'linkedin',
    'twitter',
    'snapchat',
  ]

  return logoNames
    .flatMap((name) => {
      // Essayer différentes extensions
      const extensions = ['.png', '.webp', '.jpg', '.svg']
      return extensions.map((ext) => ({
        path: `/logos/${name}${ext}`,
        name: name.charAt(0).toUpperCase() + name.slice(1),
      }))
    })
    .slice(0, 100) // Limiter pour la performance
}
