import { useState } from 'react'

/**
 * Le fichier de logo, quand il existe.
 *
 * Le dossier `public/logos` compte 742 fichiers utilisables, mais leurs noms
 * viennent d'un paquet d'origine et ne suivent aucune règle : `amazon.png`,
 * `cdiscount-new-logo.png`, `temu_logo-svg.png`. Deviner le nom depuis
 * l'identifiant ne marche donc pas — d'où cette table, écrite une fois.
 *
 * **Le paquet ne couvre presque rien de ce qui compte** : ni Vinted, ni
 * Leboncoin, ni Shopify, ni AliExpress, ni BigBuy, ni aucun des huit
 * fournisseurs ajoutés le 31/08/2026. Vingt marques sur vingt-cinq tombaient
 * donc sur une pastille de deux lettres, et une liste de pastilles ne se
 * reconnaît pas — elle se lit.
 *
 * D'où le second recours : l'icône que le site publie lui-même, récupérée par
 * son domaine. Elle est petite, mais c'est la vraie marque, et elle vaut mieux
 * que « SU » sur un rond bleu.
 *
 * Le service de DuckDuckGo est préféré à celui de Google : il rend la même
 * chose, sans dire à Google quels fournisseurs le vendeur consulte.
 */
const FICHIERS: Record<string, string> = {
  // Destinations de vente.
  AMAZON: 'amazon.png',
  CDISCOUNT: 'cdiscount-new-logo.png',
  EBAY: 'ebay.png',
  ETSY: 'etsy.png',
  LA_REDOUTE: 'laredoute.png',
  KAUFLAND: 'kaufland_marketplace.png',
  LECLERC: 'eleclerc.png',
  BHV: 'bhvmarais.png',
  KIABI: 'kiabi_logo.png',
  BRANDALLEY: 'brandalley.png',
  SPARTOO: 'spartoo.png',
  MIINTO: 'miintomarketplace.png',
  TIKTOK_SHOP: 'tiktokshop_logo.png',
  FACEBOOK: 'facebookads.png',
  INSTAGRAM: 'instagram.png',

  // Plateformes d'acquisition.
  temu: 'temu_logo-svg.png',
  etsy: 'etsy.png',
}

/**
 * La couleur de repli, quand aucun fichier n'existe.
 *
 * Reprise de la marque quand on la connaît : une pastille orange pour Temu se
 * reconnaît du coin de l'œil, une pastille grise ne se reconnaît pas.
 */
export function PlatformLogo({
  id,
  label,
  color,
  size = 40,
  /** `md` pour les petites pastilles en ligne, `lg` pour les fiches. */
  arrondi = 'lg',
  /** Le domaine de la marque, quand on le connaît : « aliexpress.com ». */
  domain,
}: {
  /** L'identifiant, quand il en existe un : il donne accès au paquet local. */
  id?: string
  label: string
  color?: string
  size?: number
  domain?: string | null
  arrondi?: 'md' | 'lg'
}) {
  const fichier = id ? FICHIERS[id] : undefined
  /*
   * Deux recours, essayés dans l'ordre, chacun avec son propre échec.
   *
   * Un seul drapeau « cassé » ferait tomber directement sur la pastille quand
   * le fichier local manque, sans jamais essayer l'icône du site.
   */
  const [fichierCasse, setFichierCasse] = useState(false)
  const [iconeCassee, setIconeCassee] = useState(false)

  if (fichier && !fichierCasse) {
    return (
      <img
        src={`/logos/${fichier}`}
        alt=""
        onError={() => setFichierCasse(true)}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-${arrondi} bg-white/90 object-contain p-1`}
      />
    )
  }

  if (domain && !iconeCassee) {
    return (
      <img
        src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
        alt=""
        loading="lazy"
        onError={() => setIconeCassee(true)}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-${arrondi} bg-white/90 object-contain p-1.5`}
      />
    )
  }

  // La pastille typographique : deux lettres au plus, sur la couleur de la
  // marque. Elle identifie sans prétendre reproduire un logo qu'on n'a pas.
  const initiales = label
    .replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0].toUpperCase())
    .join('')

  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        backgroundColor: color ?? '#a855f7',
        fontSize: Math.round(size * 0.38),
      }}
      className={`grid shrink-0 place-items-center rounded-${arrondi} font-bold text-white`}
    >
      {initiales || '?'}
    </span>
  )
}
