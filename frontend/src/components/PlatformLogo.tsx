import { useState } from 'react'

/**
 * Le fichier de logo, quand il existe.
 *
 * Le dossier `public/logos` compte 742 fichiers utilisables, mais leurs noms
 * viennent d'un paquet d'origine et ne suivent aucune règle : `amazon.png`,
 * `cdiscount-new-logo.png`, `temu_logo-svg.png`. Deviner le nom depuis
 * l'identifiant ne marche donc pas — d'où cette table, écrite une fois.
 *
 * Sept marques manquent au paquet — Vinted, Leboncoin, Shopify, AliExpress,
 * DHgate, Banggood, Wish — et d'autres manqueront. Elles tombent sur la
 * pastille typographique, qui vaut mieux qu'un carré vide ou qu'une image
 * cassée.
 */
const FICHIERS: Record<string, string> = {
  // Destinations de vente.
  AMAZON: 'amazon.png',
  CDISCOUNT: 'cdiscount-new-logo.png',
  EBAY: 'ebay.png',
  ETSY: 'etsy.png',
  LA_REDOUTE: 'laredoute.png',
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
}: {
  id: string
  label: string
  color?: string
  size?: number
}) {
  const fichier = FICHIERS[id]
  const [casse, setCasse] = useState(false)

  if (fichier && !casse) {
    return (
      <img
        src={`/logos/${fichier}`}
        alt=""
        onError={() => setCasse(true)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-lg bg-white/90 object-contain p-1"
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
      className="grid shrink-0 place-items-center rounded-lg font-bold text-white"
    >
      {initiales || '?'}
    </span>
  )
}
