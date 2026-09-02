import { useCallback, useEffect, useRef, useState } from 'react'
import { Megaphone, Sparkles, Download, Trash2, Info, BarChart3 } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, assetUrl } from '../lib/api'
import { AdAccounts } from '../components/AdAccounts'
import { SocialConnect } from '../components/SocialConnect'
import { AgentBar } from '../components/AgentBar'
import { AgentBook } from '../components/AgentBook'
import { AdDialog } from '../components/AdDialog'
import { ProductPicker } from '../components/ProductPicker'

type State = Awaited<ReturnType<typeof api.visualState>>
type Detail = Awaited<ReturnType<typeof api.productVisuals>>

/**
 * Le service marketing.
 *
 * Trois choses au même endroit, parce qu'elles ne se décident pas séparément :
 * à qui demander avant de dépenser, quoi produire, et où le diffuser. L'atelier
 * publicité vivait seul dans son coin ; un visuel produit sans avoir regardé la
 * marge du produit est un visuel qu'on paiera deux fois.
 *
 * Ce que la page ne fait pas, et le dit : elle n'engage aucun budget. Le
 * ciblage et les enchères restent chez la régie, là où le vendeur voit ce qui
 * part de son compte.
 */
export default function Marketing() {
  const [state, setState] = useState<State | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [avis, setAvis] = useState<{ id: string; titre: string } | null>(null)
  // La liste se recharge apres un avis paye, sinon le bouton reste gris et le
  // vendeur reclique en croyant que rien n a marche.
  const rechargerProduits = useRef<(() => void) | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set(['instagram']))
  const [count, setCount] = useState(1)
  const [hint, setHint] = useState('')
  const [ctaLabel, setCtaLabel] = useState('Commander')
  const [ctaUrl, setCtaUrl] = useState('')
  const [argument, setArgument] = useState('')
  const [busy, setBusy] = useState(false)
  const [adCible, setAdCible] = useState<{ id: string; titre: string; shopId?: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.visualState().then(setState).catch(() => setError('Atelier indisponible'))
  }, [])

  useEffect(() => {
    if (!openId) {
      setDetail(null)
      return
    }
    setError(null)
    api.productVisuals(openId).then(setDetail).catch(() => setDetail(null))
  }, [openId])

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function generate() {
    if (!openId || !chosen.size) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.generateAds(openId, [...chosen], count, {
        hint: hint.trim() || undefined,
        ctaLabel: ctaLabel.trim() || undefined,
        ctaUrl: ctaUrl.trim() || undefined,
        argument: argument.trim() || undefined,
      })
      if (res.errors.length) setError(res.errors.join(' · '))
      setDetail((d) => (d ? { ...d, generated: [...res.images, ...d.generated] } : d))
      setState((s) => (s ? { ...s, credits: res.credits } : s))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await api.deleteImage(id).catch(() => undefined)
    setDetail((d) => (d ? { ...d, generated: d.generated.filter((g) => g.id !== id) } : d))
  }

  const ads = detail?.generated.filter((g) => g.kind === 'ad') ?? []
  const total = chosen.size * count

  return (
    <Layout>
      <AgentBar
        agentKey="marketing"
        nom="Nadia"
        emoji="📣"
        exemple="Demandez a Nadia : quel budget pour un CPA de douze euros ?"
      />

      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Megaphone size={22} className="text-emerald-400" />
        <span>Marketing</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Le service de Nadia : quel produit mérite un budget, quel angle convertit, quel format pour
        quel réseau — et la publicité qui va avec, aux dimensions exactes de chaque régie.
      </p>

      <div className="mt-4 flex max-w-3xl items-start gap-2 rounded-xl border border-sky-400/25 bg-sky-400/10 p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-sky-300" />
        <p className="text-xs leading-relaxed text-sky-100">
          Nous produisons <b>la publicité</b>, pas la campagne. Le budget, le ciblage et les enchères
          se règlent chez la régie, là où vous voyez ce que vous dépensez.
        </p>
      </div>

      {state ? (
        <p className="mt-4 text-sm text-gray-300">
          {`Il vous reste ${state.credits} image(s).`}
          {!state.configured ? (
            <span className="ml-2 text-xs text-amber-300">
              La génération n'est pas encore configurée sur le serveur.
            </span>
          ) : null}
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {/* ---------- Les produits, et les deux gestes qui comptent ---------- */}
      <h2 className="mt-8 font-bold">Mes produits</h2>
      <p className="mt-1 text-xs text-gray-500">
        Survolez une ligne pour revoir la fiche et sa marge. Demandez l'avis de Nadia avant de
        dépenser, puis générez la publicité.
      </p>

      <ProductPicker
        ouvert={openId}
        onAvis={(p) => {
          setAvis({ id: p.id, titre: p.aiTitle || p.title })
          setOpenId(null)
        }}
        onChange={(fn) => (rechargerProduits.current = fn)}
        onGenerer={(p) => {
          setAvis(null)
          // Une fenetre au milieu de l ecran, pas un panneau deplie plus bas :
          // le vendeur cliquait et ne voyait rien bouger.
          // La boutique ou l annonce est rangee est la proposition par defaut :
          // le vendeur la confirme au lieu de la deviner.
          setAdCible({ id: p.id, titre: p.aiTitle || p.title, shopId: p.shopId ?? null })
        }}
      />

      {/* L'avis s'ouvre sous la liste, sur le produit désigné : aller le chercher
          dans une autre page ferait perdre la comparaison en cours. */}
      {avis ? (
        <AvisNadia
          produit={avis}
          onFerme={() => setAvis(null)}
          onEcrit={() => rechargerProduits.current?.()}
        />
      ) : null}

      {openId && detail && detail.product.id === openId ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs text-gray-400">Où sera diffusée cette publicité ?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state?.formats.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle(f.id)}
                title={f.note}
                className={
                  chosen.has(f.id)
                    ? 'rounded-full bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold text-emerald-300'
                    : 'rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5'
                }
              >
                {`${f.label} · ${f.width}×${f.height}`}
              </button>
            ))}
          </div>

          {/* Ce qui sera écrit sur la publicité. Le titre, le prix et le logo
              viennent de l'annonce et de vos réglages : ils ne se saisissent pas
              ici, pour qu'un prix affiché soit toujours le vrai. */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label>
              <span className="block text-xs text-gray-400">Texte du bouton</span>
              <input
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="Commander"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label>
              <span className="block text-xs text-gray-400">Adresse affichée</span>
              <input
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="ma-boutique.fr"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
              />
            </label>
            <label>
              <span className="block text-xs text-gray-400">Argument court</span>
              <input
                value={argument}
                onChange={(e) => setArgument(e.target.value)}
                placeholder="Livraison offerte"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex-1">
              <span className="block text-xs text-gray-400">Ambiance de la scène (facultatif)</span>
              <input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Ex. angle rentrée, cible bricoleurs, ambiance chantier"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
              />
            </label>

            <label>
              <span className="block text-xs text-gray-400">Visuels par format</span>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="mt-1 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={generate}
              disabled={busy || !chosen.size || !state?.configured}
              className="btn-gradient inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              <Sparkles size={14} />
              <span>{busy ? 'Création…' : `Générer (${total} crédit(s))`}</span>
            </button>
          </div>

          <ul className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {ads.map((g) => (
              <li key={g.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
                <img src={assetUrl(g.path)} alt="" className="w-full rounded-lg object-cover" />
                <p className="mt-1 text-[11px] text-gray-500">
                  {`${g.platform ?? ''} · ${g.width}×${g.height}`}
                </p>
                <div className="mt-1 flex gap-1">
                  <a
                    href={assetUrl(g.path)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] hover:bg-white/5"
                  >
                    <Download size={11} />
                    <span>Télécharger</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => remove(g.id)}
                    className="inline-flex items-center rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-400 hover:bg-white/5 hover:text-red-400"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ---------- Comptes publicitaires, cliquables ---------- */}
      <SocialConnect />

      <AdAccounts />

      {/* ---------- Suivi des campagnes ---------- */}
      <h2 className="mt-10 flex items-center gap-2 font-bold">
        <BarChart3 size={16} className="text-purple-300" />
        <span>Suivi de mes campagnes</span>
      </h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
        Cette place attend les chiffres de vos campagnes — dépense, impressions, clics, coût par
        acquisition, marge nette par produit — régie par régie. Elle restera vide tant qu'aucun
        compte n'est relié : afficher des chiffres inventés ou des exemples serait pire que le vide,
        puisque c'est sur eux qu'on décide de couper une campagne ou de la doubler.
      </p>
      <p className="mt-3 max-w-3xl rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-gray-400">
        En attendant, Nadia sait lire les chiffres que vous lui recopiez depuis le gestionnaire de
        la régie : donnez-lui la dépense, le nombre de ventes et le produit concerné, elle vous dira
        si la campagne gagne ou perd de l'argent, et à partir de quel coût par acquisition il faut
        l'arrêter.
      </p>

      {adCible ? (
        <AdDialog
          productId={adCible.id}
          productTitle={adCible.titre}
          shopId={adCible.shopId}
          credits={state?.credits ?? null}
          coutParPub={state?.tarif?.pub}
          onClose={() => setAdCible(null)}
          onGenerated={(images, credits) => {
            setState((s) => (s ? { ...s, credits } : s))
            // Le book en bas de page se remplit tout de suite : la pub existe,
            // elle doit se voir sans recharger.
            setDetail((d) =>
              d ? { ...d, generated: [...(images as typeof d.generated), ...d.generated] } : d,
            )
          }}
        />
      ) : null}

      <AgentBook
        kind="ad"
        titre="Les publicités de Nadia"
        vide="Aucune publicité produite pour l'instant. Celles que vous ferez créer resteront ici, toutes annonces confondues."
      />
    </Layout>
  )
}

/**
 * L'avis de Nadia sur un produit, payé une fois et relu autant qu'on veut.
 *
 * Ce que ça remplace : une conversation pré-remplie. Le vendeur lisait la
 * réponse, fermait l'écran, et l'avis disparaissait — le lendemain il repayait
 * la même réponse sur le même produit sans s'en apercevoir.
 *
 * L'avis existant est donc servi sans rien facturer. « Refaire » est un geste
 * distinct, et il annonce son prix : c'est celui du vendeur qui a changé son
 * prix d'achat et veut un avis sur les nouveaux chiffres.
 */
function AvisNadia({
  produit,
  onFerme,
  onEcrit,
}: {
  produit: { id: string; titre: string }
  onFerme: () => void
  onEcrit: () => void
}) {
  const [texte, setTexte] = useState<string | null>(null)
  const [quand, setQuand] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const demander = useCallback(
    async (refaire: boolean) => {
      setBusy(true)
      setErreur(null)
      try {
        const r = await api.adAdvice(produit.id, refaire)
        setTexte(r.avis)
        setQuand(r.at)
        if (r.facture) onEcrit()
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Nadia n'a pas pu répondre.")
      } finally {
        setBusy(false)
      }
    },
    [produit.id, onEcrit],
  )

  useEffect(() => {
    demander(false)
  }, [demander])

  return (
    <section className="mt-4 rounded-xl border border-pink-400/30 bg-pink-500/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{`Avis de Nadia sur « ${produit.titre} »`}</p>
        <button type="button" onClick={onFerme} className="text-xs text-gray-400 hover:text-white">
          Fermer
        </button>
      </div>

      {busy ? <p className="mt-3 text-sm text-gray-400">Nadia regarde vos chiffres…</p> : null}
      {erreur ? <p className="mt-3 text-sm text-red-300">{erreur}</p> : null}

      {texte ? (
        <>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-100">{texte}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {quand ? (
              <span className="text-[11px] text-gray-500">
                {`Rendu le ${new Date(quand).toLocaleDateString('fr-FR')} — relisez-le autant que vous voulez.`}
              </span>
            ) : null}
            {/* Le prix est annoncé avant le clic, jamais découvert après. */}
            <button
              type="button"
              onClick={() => demander(true)}
              disabled={busy}
              className="ml-auto rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
            >
              Refaire l'avis (1 crédit)
            </button>
          </div>
        </>
      ) : null}
    </section>
  )
}
