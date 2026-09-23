import {
  BarChart3,
  Bot,
  Coins,
  Globe2,
  ImagePlus,
  MousePointerClick,
  Share2,
  Sparkles,
  Store,
  Truck,
  Wand2,
  type LucideIcon,
} from 'lucide-react'

/**
 * L'illustration de repli d'un thème de l'accueil : un dégradé à la couleur du
 * thème, une trame, et son pictogramme. Elle tient la place de l'image de Max
 * tant qu'elle n'est pas déposée dans /images/accueil/, et sert aussi de
 * vignette dans la grille des sections.
 */
const THEMES: Record<string, { icone: LucideIcon; de: string; a: string }> = {
  'scraping-produits': { icone: MousePointerClick, de: '#7c3aed', a: '#2563eb' },
  fournisseurs: { icone: Truck, de: '#0891b2', a: '#4f46e5' },
  'annonces-ia': { icone: Wand2, de: '#db2777', a: '#7c3aed' },
  'dropshop-ia': { icone: Store, de: '#059669', a: '#0d9488' },
  'visuels-ia': { icone: ImagePlus, de: '#f59e0b', a: '#ef4444' },
  'reseaux-sociaux': { icone: Share2, de: '#2563eb', a: '#db2777' },
  diffusion: { icone: Globe2, de: '#4f46e5', a: '#06b6d4' },
  'analyses-de-marche': { icone: BarChart3, de: '#16a34a', a: '#84cc16' },
  'agents-ia': { icone: Bot, de: '#8b5cf6', a: '#ec4899' },
  'auto-shipper': { icone: Sparkles, de: '#ea580c', a: '#facc15' },
  'les-drops': { icone: Coins, de: '#0ea5e9', a: '#8b5cf6' },
}

export function IllustrationTheme({ slug, className = '' }: { slug: string; className?: string }) {
  const t = THEMES[slug] ?? { icone: Sparkles, de: '#7c3aed', a: '#ec4899' }
  const Icone = t.icone
  return (
    <div
      aria-hidden="true"
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${t.de}, ${t.a})` }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,.35) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(0,0,0,.35) 0, transparent 45%), repeating-linear-gradient(45deg, rgba(255,255,255,.06) 0 2px, transparent 2px 14px)',
        }}
      />
      <Icone className="relative h-1/3 w-1/3 max-h-40 max-w-40 text-white/90 drop-shadow-lg" strokeWidth={1.25} />
    </div>
  )
}
