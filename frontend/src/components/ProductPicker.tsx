import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageSquare, Sparkles, Search } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { VoirPlus, useVoirPlus } from './VoirPlus'

type Product = {
  id: string
  title: string
  aiTitle?: string | null
  aiDescription?: string | null
  images?: unknown
  price?: unknown
  shippingCost?: unknown
  sellingPrice?: unknown
  currency?: string
  categoryId?: string | null
  /** La boutique ou l annonce est rangee : sert a preselectionner l enseigne d une publicite. */
  shopId?: string | null
  sourceSite?: string | null
  createdAt?: string
  /** L avis de Nadia, garde sur l annonce : paye une fois, relu autant de fois. */
  adAdvice?: string | null
  adAdvisedAt?: string | null
}

const euros = (v: unknown, devise = 'EUR') =>
  `${Number(v ?? 0).toFixed(2).replace('.', ',')} ${devise === 'EUR' ? '€' : devise}`

const photos = (p: Product): string[] =>
  Array.isArray(p.images) ? (p.images as unknown[]).filter((i): i is string => typeof i === 'string') : []

/**
 * La fiche qui apparaît au survol.
 *
 * Une liste de titres tronqués ne suffit pas à choisir sur quel produit
 * dépenser un budget : il faut revoir la photo, le prix et la marge. Ouvrir la
 * fiche pour cela ferait perdre la liste, et donc la comparaison.
 */
function Apercu({ product }: { product: Product }) {
  const revient = Number(product.price ?? 0) + Number(product.shippingCost ?? 0)
  const vente = Number(product.sellingPrice ?? 0)
  const marge = vente - revient
  const taux = revient > 0 ? (marge / revient) * 100 : null
  const image = photos(product)[0]

  return (
    <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-80 rounded-xl border border-white/15 bg-[#1b1633] p-3 shadow-2xl">
      <div className="flex gap-3">
        {image ? (
          <img
            src={assetUrl(image)}
            alt=""
            className="h-20 w-20 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-black/30 text-[10px] text-gray-500">
            aucune photo
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-snug">{product.aiTitle || product.title}</p>
          <p className="mt-1 text-[11px] text-gray-500">
            {product.sourceSite ? `Source : ${product.sourceSite}` : 'Source inconnue'}
          </p>
        </div>
      </div>

      {product.aiDescription ? (
        <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-gray-400">
          {product.aiDescription}
        </p>
      ) : null}

      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/10 pt-2 text-[11px]">
        <div>
          <p className="text-gray-500">Revient à</p>
          <p className="font-semibold tabular-nums">{euros(revient, product.currency)}</p>
        </div>
        <div>
          <p className="text-gray-500">Vendu</p>
          <p className="font-semibold tabular-nums text-purple-200">
            {euros(vente, product.currency)}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Marge</p>
          <p
            className={
              marge >= 0 ? 'font-semibold tabular-nums text-emerald-300' : 'font-semibold tabular-nums text-red-400'
            }
          >
            {`${marge >= 0 ? '+' : ''}${euros(marge, product.currency)}`}
          </p>
        </div>
      </div>

      {taux !== null ? (
        <p className="mt-1 text-[10px] text-gray-500">
          {`Soit ${taux.toFixed(0)} % du coût de revient. Le coût par acquisition doit tenir dedans.`}
        </p>
      ) : null}
    </div>
  )
}

/**
 * La liste des produits sur laquelle travaille le marketing.
 *
 * Deux gestes par ligne, parce que ce sont les deux seuls qui comptent ici :
 * demander l'avis avant de dépenser, et produire la publicité. Filtrable par
 * rayon et par date, parce qu'un catalogue de trois cents annonces ne se
 * parcourt pas en entier pour retrouver celle d'hier.
 */
export function ProductPicker({
  onAvis,
  onGenerer,
  ouvert,
  onChange,
}: {
  onAvis: (product: Product) => void
  onGenerer: (product: Product) => void
  ouvert: string | null
  /**
   * Rend la fonction qui recharge la liste.
   *
   * Sans elle, un avis fraichement paye n apparait pas : le bouton reste gris
   * jusqu au rechargement de la page, et le vendeur reclique en croyant que
   * rien n a marche.
   */
  onChange?: (recharger: () => void) => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [catalog, setCatalog] = useState<Array<{ id: string; group: string; label: string }>>([])
  const [categorie, setCategorie] = useState('')
  const [tri, setTri] = useState<'recent' | 'ancien' | 'marge'>('recent')
  const [recherche, setRecherche] = useState('')
  const [survol, setSurvol] = useState<string | null>(null)
  // Distinct du survol de la ligne : l apercu produit et la bulle d avis ne
  // s ouvrent pas au meme endroit et ne disent pas la meme chose.
  const [avisSurvole, setAvisSurvole] = useState<string | null>(null)

  const recharger = useCallback(() => {
    api.listProducts().then(setProducts).catch(() => undefined)
  }, [])

  useEffect(() => {
    recharger()
    api.listCategories().then((r) => setCatalog(r.categories)).catch(() => undefined)
  }, [recharger])

  useEffect(() => {
    onChange?.(recharger)
  }, [onChange, recharger])

  const labelCategorie = useMemo(() => {
    const m = new Map(catalog.map((c) => [c.id, c.label]))
    return (id: string | null | undefined) => (id ? m.get(id) ?? id : null)
  }, [catalog])

  // Seuls les rayons réellement présents au catalogue sont proposés : une liste
  // de cent treize catégories dont deux sont utilisées ne filtre rien.
  const categoriesUtilisees = useMemo(() => {
    const vues = new Set(products.map((p) => p.categoryId).filter(Boolean) as string[])
    return catalog.filter((c) => vues.has(c.id))
  }, [products, catalog])

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    const liste = products.filter((p) => {
      if (categorie && p.categoryId !== categorie) return false
      if (!terme) return true
      return (p.aiTitle || p.title || '').toLowerCase().includes(terme)
    })

    const marge = (p: Product) =>
      Number(p.sellingPrice ?? 0) - (Number(p.price ?? 0) + Number(p.shippingCost ?? 0))

    return [...liste].sort((a, b) => {
      if (tri === 'marge') return marge(b) - marge(a)
      const da = new Date(a.createdAt ?? 0).getTime()
      const db = new Date(b.createdAt ?? 0).getTime()
      return tri === 'recent' ? db - da : da - db
    })
  }, [products, categorie, recherche, tri])

  const { visibles, reste, plus, tout } = useVoirPlus(filtres)

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[12rem]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher une annonce"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm outline-none focus:border-purple-400/60"
          />
        </label>

        <select
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
        >
          <option value="">Tous les rayons</option>
          {categoriesUtilisees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          value={tri}
          onChange={(e) => setTri(e.target.value as typeof tri)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
        >
          <option value="recent">Ajout le plus récent</option>
          <option value="ancien">Ajout le plus ancien</option>
          <option value="marge">Meilleure marge</option>
        </select>
      </div>

      {visibles.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">
          {products.length
            ? 'Aucune annonce ne correspond à ce filtre.'
            : 'Aucune annonce au catalogue : importez un produit avant de lui faire une publicité.'}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
          {visibles.map((p) => {
            const image = photos(p)[0]
            return (
              <li
                key={p.id}
                className={`relative flex items-center gap-3 px-3 py-2.5 ${
                  ouvert === p.id ? 'bg-emerald-400/5' : ''
                }`}
                onMouseEnter={() => setSurvol(p.id)}
                onMouseLeave={() => setSurvol((s) => (s === p.id ? null : s))}
              >
                {image ? (
                  <img src={assetUrl(image)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-black/30" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{p.aiTitle || p.title}</p>
                  <p className="truncate text-[11px] text-gray-500">
                    {[
                      labelCategorie(p.categoryId) ?? 'Sans rayon',
                      p.createdAt ? new Date(p.createdAt).toLocaleDateString('fr-FR') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                <span className="shrink-0 text-sm font-semibold text-purple-200 max-sm:hidden">
                  {euros(p.sellingPrice, p.currency)}
                </span>

                {/*
                  Deux etats pour un meme geste, et la difference se voit.

                  Un avis est paye un credit et **garde sur l annonce** : une
                  fois rendu, le bouton ne demande plus, il consulte. Sans cette
                  distinction le vendeur reclique et repaie une reponse qu il a
                  deja eue, sans s en apercevoir autrement qu au releve.
                */}
                <button
                  type="button"
                  onClick={() => onAvis(p)}
                  onMouseEnter={() => p.adAdvice && setAvisSurvole(p.id)}
                  onMouseLeave={() => setAvisSurvole((a) => (a === p.id ? null : a))}
                  title={
                    p.adAdvice
                      ? "Relire l'avis de Nadia — deja paye"
                      : 'Demander a Nadia si ce produit merite un budget (1 credit)'
                  }
                  className={
                    p.adAdvice
                      ? 'relative inline-flex shrink-0 items-center gap-1 rounded-lg bg-gradient-to-r from-pink-500 to-fuchsia-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:brightness-110'
                      : 'inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs transition hover:bg-white/10'
                  }
                >
                  <MessageSquare size={12} />
                  <span className="max-sm:hidden">
                    {p.adAdvice ? 'Consulter avis Nadia' : 'Avis Nadia'}
                  </span>

                  {avisSurvole === p.id && p.adAdvice ? <BulleAvis texte={p.adAdvice} /> : null}
                </button>

                <button
                  type="button"
                  onClick={() => onGenerer(p)}
                  title="Créer une publicité pour ce produit"
                  className="btn-gradient inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                >
                  <Sparkles size={12} />
                  <span className="max-sm:hidden">Générer ad</span>
                </button>

                {survol === p.id ? <Apercu product={p} /> : null}
              </li>
            )
          })}
        </ul>
      )}

      <VoirPlus reste={reste} onPlus={plus} onTout={tout} />
    </>
  )
}

/**
 * L'avis de Nadia, lu au survol.
 *
 * Au survol et non au clic : le vendeur qui compare quatre produits veut relire
 * sans changer d'écran. Le clic reste disponible et ouvre l'avis en grand.
 *
 * `pointer-events-none` est indispensable : sans lui, la bulle passe sous le
 * curseur, déclenche son propre `mouseleave` sur le bouton, et clignote.
 */
function BulleAvis({ texte }: { texte: string }) {
  return (
    <span className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-80 rounded-xl border border-pink-400/30 bg-[#1b1633] p-3 text-left shadow-2xl">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-pink-300">
        Avis de Nadia
      </span>
      <span className="block max-h-56 overflow-hidden whitespace-pre-wrap text-[11px] font-normal leading-relaxed text-gray-200">
        {texte}
      </span>
      <span className="mt-1.5 block text-[10px] font-normal text-gray-500">
        Cliquez pour le lire en entier.
      </span>
    </span>
  )
}
