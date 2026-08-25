import { useEffect, useState } from 'react'
import { Link2, Search, Truck, Share2, Store, Clock } from 'lucide-react'
import { api, type ProductReview } from '../lib/api'

/** Ce que coûte un avis. Écrit avant le clic, jamais découvert après. */
const COUT = 3

/**
 * « Info sur un produit ».
 *
 * Le vendeur colle l'adresse d'un produit qu'il envisage, le chef de rayon
 * cherche et rend un avis en trois volets : ce qu'en disent les fournisseurs,
 * les réseaux, et les places de marché. Trois publics qui ne disent pas la
 * même chose — un produit que tout le monde revend au même prix a déjà perdu
 * sa marge, une vague TikTok passée est un piège, et les avis négatifs d'Amazon
 * annoncent les litiges qu'on héritera.
 *
 * Un avis déjà rendu sur la même adresse est resservi sans repayer pendant une
 * semaine : sans ce garde-fou, un vendeur indécis paie quatre fois la même
 * réponse dans la journée.
 */
export function ProductInfo({ departmentId, agentName }: { departmentId: string; agentName: string }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avis, setAvis] = useState<ProductReview | null>(null)
  const [resservi, setResservi] = useState(false)
  const [historique, setHistorique] = useState<ProductReview[]>([])

  useEffect(() => {
    api
      .productInfoHistory(departmentId)
      .then((r) => setHistorique(r.reviews))
      .catch(() => undefined)
  }, [departmentId])

  async function demander() {
    const adresse = url.trim()
    if (!adresse || busy) return

    setBusy(true)
    setError(null)
    try {
      const res = await api.productInfo(departmentId, adresse)
      setAvis(res.review)
      setResservi(!res.billed)
      setHistorique((h) => [res.review, ...h.filter((a) => a.id !== res.review.id)])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const volets = avis
    ? [
        { icone: Truck, titre: 'Avis fournisseurs', texte: avis.suppliers },
        { icone: Share2, titre: 'Avis réseaux', texte: avis.social },
        { icone: Store, titre: 'Avis places de marché', texte: avis.marketplace },
      ]
    : []

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <header className="flex items-start gap-2.5">
        <Search size={17} className="mt-0.5 shrink-0 text-purple-300" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-wide">Info sur un produit</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            {`Collez l'adresse d'un produit que vous envisagez : ${agentName} cherche, puis vous dit ce qu'en disent les fournisseurs, les réseaux et les places de marché.`}
          </p>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="relative min-w-[14rem] flex-1">
          <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && demander()}
            placeholder="https://…"
            className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-purple-400/70"
          />
        </label>
        <button
          type="button"
          onClick={demander}
          disabled={busy || !url.trim()}
          className="btn-gradient shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          {busy ? `${agentName} cherche…` : `Demander un avis (${COUT} crédits)`}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-gray-500">
        Cinq recherches web au maximum. Un avis déjà rendu sur la même adresse vous est resservi
        sans repayer pendant une semaine.
      </p>

      {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}

      {avis ? (
        <article className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{avis.title || 'Produit'}</h3>
            {resservi ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-400">
                <Clock size={9} />
                <span>avis déjà rendu, non refacturé</span>
              </span>
            ) : null}
          </div>

          <p className="mt-2 rounded-lg border border-purple-400/30 bg-purple-500/10 p-3 text-sm leading-relaxed text-purple-100">
            {avis.verdict}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {volets.map((v) => (
              <div key={v.titre} className="rounded-lg bg-white/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <v.icone size={13} className="text-purple-300" />
                  <span>{v.titre}</span>
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-gray-300">
                  {v.texte || 'Rien de concluant trouvé sur ce volet.'}
                </p>
              </div>
            ))}
          </div>

          {avis.sources?.length ? (
            <div className="mt-3 border-t border-white/10 pt-2">
              <p className="text-[11px] text-gray-500">Sources consultées</p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {avis.sources.map((s) => (
                  <li key={s}>
                    <a
                      href={s}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[11px] text-purple-300 underline hover:text-purple-200"
                    >
                      {(() => {
                        try {
                          return new URL(s).hostname.replace(/^www\./, '')
                        } catch {
                          return s.slice(0, 40)
                        }
                      })()}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      ) : null}

      {historique.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-400">Avis déjà rendus</p>
          <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10">
            {historique.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setAvis(a)
                    setResservi(true)
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1 truncate">{a.title || a.url}</span>
                  <span className="shrink-0 text-[11px] text-gray-500">
                    {new Date(a.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
