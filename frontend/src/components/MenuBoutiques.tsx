import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { VERT_SHOPIFY } from '../lib/shopifyAffiliation'

/**
 * Le sac de courses de Shopify, à ses couleurs.
 *
 * Redessiné plutôt que téléversé : l'icône vit dans le menu, sur fond sombre
 * comme sur fond clair, et un PNG y serait flou. Le vert est celui de leur
 * charte (voir lib/shopifyAffiliation.ts) — écrire le nom d'un partenaire à ses
 * couleurs est la convention, et c'est ce que font les intégrateurs.
 */
function IconeShopify({ size = 16 }: { size?: number }) {
  return (
    <svg width={size + 2} height={size + 2} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path
        d="M15.3 4.3a.4.4 0 0 0-.36-.34l-1.5-.11-1.1-1.1a.5.5 0 0 0-.46-.12l-.6.18c-.36-1.03-1-1.48-1.7-1.48-.05 0-.1 0-.15.02C9.2.9 8.9.7 8.5.7 7.3.7 6.2 2.2 5.8 4.6l-1.6.5c-.5.16-.52.18-.58.65L2.3 17.9l9.3 1.74 5-1.08S15.31 4.4 15.3 4.3Zm-4.6-1.1-.95.3c0-.65-.08-1.2-.22-1.63.53.1.9.7 1.17 1.33ZM8.53 1.72c.15 0 .28.05.4.15-.53.28-1.1.9-1.34 2.17l-1.2.37c.34-1.55 1.14-2.7 2.14-2.7Z"
        fill={VERT_SHOPIFY}
      />
      <path d="m14.94 3.96-1.5-.11-1.1-1.1a.27.27 0 0 0-.15-.07l-.68 16.96 5-1.08S15.31 4.4 15.3 4.3a.4.4 0 0 0-.36-.34Z" fill="#5E8E3E" />
      <path
        d="M9.62 7.03 9.04 9.2s-.64-.3-1.4-.25c-1.12.07-1.13.78-1.12.95.06.96 2.58 1.17 2.72 3.42.11 1.77-.94 2.98-2.45 3.07-1.82.12-2.82-.96-2.82-.96l.38-1.64s1.01.76 1.82.71c.53-.03.72-.46.7-.77-.08-1.25-2.13-1.18-2.26-3.24C4.5 8.75 5.63 7.03 8.13 6.87c.97-.06 1.49.16 1.49.16Z"
        fill="#fff"
      />
    </svg>
  )
}

/** Le badge IA vert de la marque DropShop. */
function IconeBoutiqueIA({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-400 to-green-600 font-black text-white"
      style={{ width: size + 2, height: size + 2, fontSize: size * 0.5, boxShadow: '0 0 8px rgba(52,211,153,0.6)' }}
    >
      IA
    </span>
  )
}

/**
 * Un onglet du bloc : trois destinations au même rang, sur le dégradé rose.
 *
 * Trois formes derrière la même apparence — une route interne, un lien qui sort
 * de l'application, et l'onglet éteint quand la destination n'existe pas encore
 * (aucune boutique ouverte, Shopify pas relié). **L'éteint n'est pas masqué** :
 * un bouton qui disparaît laisse croire que la fonction n'existe pas ; éteint
 * avec son explication au survol, il dit qu'il manque une étape.
 */
function Onglet({ libelle, vers, externe, absent }: { libelle: string; vers: string; externe?: boolean; absent?: string }) {
  const classes =
    'btn-gradient block rounded-md px-1 py-1 text-center text-[10px] font-semibold text-white transition hover:brightness-110'

  if (absent) {
    return (
      <span
        title={absent}
        className={`${classes} cursor-not-allowed opacity-40 hover:brightness-100`}
        aria-disabled
      >
        {libelle}
      </span>
    )
  }
  return externe ? (
    <a href={vers} target="_blank" rel="noreferrer noopener" className={classes}>
      {libelle}
    </a>
  ) : (
    <Link to={vers} className={classes}>
      {libelle}
    </Link>
  )
}

/** Un bloc : le titre en gras de la marque, puis ses trois onglets. */
function BlocBoutique({
  icone,
  titre,
  prix,
  gratuit,
  onglets,
}: {
  icone: React.ReactNode
  titre: React.ReactNode
  prix: string
  gratuit?: boolean
  onglets: Array<{ libelle: string; vers: string; externe?: boolean; absent?: string }>
}) {
  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] p-2">
      {/*
        Le titre ne se tronque pas, il passe à la ligne.
        La colonne fait 224 px moins ses marges, soit 192 px utiles. Sur une
        seule ligne, l'icône, « Boutique DropShop » et la pastille de prix en
        demandent un peu plus de deux cents : le titre était rogné en
        « Boutique Dro… » des deux côtés — c'est-à-dire que la marque, seule
        raison d'être du bloc, disparaissait. On laisse donc l'ensemble revenir
        à la ligne : le nom d'abord, entier, la pastille dessous s'il le faut.
      */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {icone}
        <span className="text-[13px] font-bold leading-tight">{titre}</span>
        <span
          className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold ${
            gratuit ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-gray-400'
          }`}
        >
          {prix}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {onglets.map((o) => (
          <Onglet key={o.libelle} {...o} />
        ))}
      </div>
    </div>
  )
}

/**
 * Les deux boutiques du menu : la nôtre et celle de Shopify, au même rang.
 *
 * Deux entrées plates ne disaient que « créer ». Or créer est le geste qu'on ne
 * fait qu'une fois : ensuite on modifie et on regarde. Chaque marque porte donc
 * ses trois onglets — Créez, Modifier, Consulter — et son prix à côté du titre,
 * parce que la comparaison est justement l'argument : notre boutique est
 * gratuite et illimitée, celle de Shopify est facturée au mois et par boutique.
 *
 * **Les destinations de Shopify ne s'inventent pas.** « Modifier » et
 * « Consulter » ont besoin du domaine de la boutique reliée ; il arrive de
 * `/settings/credentials`, qui rend le domaine (`hint`) et jamais le jeton.
 * Sans liaison, les deux onglets restent éteints plutôt que de renvoyer au
 * hasard sur une page d'accueil Shopify qui ne serait pas la sienne.
 */
export function MenuBoutiques() {
  const [vitrine, setVitrine] = useState<string | null>(null)
  const [domaineShopify, setDomaineShopify] = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    // Le menu est rendu sur toutes les pages : ces deux relevés ne doivent
    // jamais faire échouer l'affichage, d'où le silence en cas de refus.
    api
      .listShops()
      .then((shops) => {
        if (!vivant) return
        const hebergee = shops.find((s) => s.slug)
        setVitrine(hebergee?.slug ? `${window.location.origin}/b/${hebergee.slug}` : null)
      })
      .catch(() => {})
    api
      .listCredentials()
      .then((creds) => {
        if (!vivant) return
        const shopify = creds.find((c) => c?.platform === 'SHOPIFY' && c?.connected && c?.hint)
        setDomaineShopify(shopify?.hint ?? null)
      })
      .catch(() => {})
    return () => {
      vivant = false
    }
  }, [])

  // admin.shopify.com/store/<poignée> : le domaine sans son suffixe technique.
  const poignee = domaineShopify?.replace(/\.myshopify\.com$/i, '') ?? null

  return (
    <>
      <BlocBoutique
        icone={<IconeBoutiqueIA size={16} />}
        titre={
          <span className="bg-gradient-to-r from-emerald-400 via-green-200 to-white bg-clip-text text-transparent">
            Boutique DropShop
          </span>
        }
        prix="Gratuit"
        gratuit
        onglets={[
          { libelle: 'Créez', vers: '/creer-boutique' },
          { libelle: 'Modifier', vers: '/mes-sites' },
          {
            libelle: 'Consulter',
            vers: vitrine ?? '',
            externe: true,
            absent: vitrine ? undefined : "Aucune vitrine DropShop pour l'instant — créez-en une.",
          },
        ]}
      />

      <BlocBoutique
        icone={<IconeShopify size={16} />}
        titre={
          <>
            Boutique <span style={{ color: VERT_SHOPIFY }}>Shopify</span>
          </>
        }
        prix="dès 27 €/mois"
        onglets={[
          /*
           * « Créez » mène à NOTRE écran, pas directement chez Shopify.
           *
           * Le lien de partenaire y est, en première étape — le parrainage est
           * préservé. Mais ouvrir la boutique n'est que le premier des quatre
           * gestes : sans l'écran qui enchaîne installation, choix des produits
           * et publication, le vendeur repart chez Shopify et ne revient jamais
           * finir le travail.
           */
          { libelle: 'Créez', vers: '/boutique-shopify' },
          {
            libelle: 'Modifier',
            vers: poignee ? `https://admin.shopify.com/store/${poignee}` : '',
            externe: true,
            absent: poignee ? undefined : 'Reliez votre boutique Shopify dans Market places.',
          },
          {
            libelle: 'Consulter',
            vers: domaineShopify ? `https://${domaineShopify}` : '',
            externe: true,
            absent: domaineShopify ? undefined : 'Reliez votre boutique Shopify dans Market places.',
          },
        ]}
      />
    </>
  )
}
