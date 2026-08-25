import { useEffect, useState } from 'react'
import { Plug, X, Check, ExternalLink, Info, Package, RefreshCw, ShoppingCart, Truck } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { PlatformLogo } from '../components/PlatformLogo'

type Supplier = Awaited<ReturnType<typeof api.listSuppliers>>[number]
type Lien = Awaited<ReturnType<typeof api.listSupplierLinks>>[number]

/** Ce que chaque capacité veut dire, en français de vendeur. */
const CAPACITES = [
  { cle: 'lectureCatalogue' as const, icone: Package, titre: 'Lire le catalogue' },
  { cle: 'stockTempsReel' as const, icone: RefreshCw, titre: 'Stock et prix en direct' },
  { cle: 'commande' as const, icone: ShoppingCart, titre: 'Commander depuis ici' },
  { cle: 'suivi' as const, icone: Truck, titre: 'Numéro de suivi' },
]

/**
 * API Sourcing Connect : relier DropShipper aux fournisseurs.
 *
 * C'est la troisième voie d'acquisition, à côté de l'extension et de l'adresse
 * collée — et la plus sûre. Les quatre plateformes du marché (DSers, Syncee,
 * Koongo, Channable) passent par l'API officielle du fournisseur, jamais par du
 * scraping : les données arrivent complètes et en temps réel, et personne ne se
 * fait bannir.
 *
 * C'est aussi ce qui ouvre le reste : stock à jour, commande passée d'ici,
 * numéro de suivi remonté tout seul. Rien de tout cela n'est encore écrit, et
 * la page le dit — un fournisseur marqué « relié » qui ne rapporte aucun
 * produit se lirait comme une panne.
 */
export default function ApiSourcing() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [liens, setLiens] = useState<Lien[]>([])
  const [ouvert, setOuvert] = useState<Supplier | null>(null)

  function recharger() {
    api.listSupplierLinks().then(setLiens).catch(() => undefined)
  }

  useEffect(() => {
    api.listSuppliers().then(setSuppliers).catch(() => undefined)
    recharger()
  }, [])

  const avecApi = suppliers.filter((s) => s.api)
  const sansApi = suppliers.filter((s) => !s.api)
  const lienDe = (id: string) => liens.find((l) => l.supplier === id)

  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Plug size={22} className="text-emerald-400" />
        <span>API Sourcing Connect</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Relier DropShipper à vos fournisseurs par leur API officielle. C'est la troisième voie
        d'acquisition, à côté de l'extension et de l'adresse collée — et la seule qui donne le stock
        en direct, la commande depuis ici et le numéro de suivi.
      </p>

      <div className="mt-4 flex max-w-3xl items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-amber-300" />
        <p className="text-xs leading-relaxed text-amber-100">
          <b>À lire avant de coller quoi que ce soit.</b> Relier un fournisseur conserve vos
          identifiants, rien de plus : <b>aucun connecteur n'est encore écrit</b>. Ni lecture de
          catalogue, ni commande, ni suivi. Le faire maintenant vous fait gagner l'étape le jour où
          ils le seront — cela n'importera aucun produit aujourd'hui.
        </p>
      </div>

      <h2 className="mt-8 font-bold">Fournisseurs avec une API officielle</h2>
      <p className="mt-1 text-xs text-gray-500">
        Chaque fiche dit ce que l'API permet réellement, et ce qu'il faut obtenir pour y accéder.
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {avecApi.map((s) => {
          const lien = lienDe(s.id)
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setOuvert(s)}
                className="flex h-full w-full flex-col rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
              >
                <div className="flex items-start gap-3">
                  <PlatformLogo id={s.id} label={s.label} color={s.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.label}</p>
                    <p className="truncate text-[11px] text-gray-500">{s.api!.nom}</p>
                  </div>
                  {lien?.connected ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">
                      <Check size={10} />
                      <span>relié</span>
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-gray-400">
                      non relié
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-1 flex-wrap gap-1.5">
                  {CAPACITES.filter((c) => s.api![c.cle]).map((c) => (
                    <span
                      key={c.cle}
                      className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-300"
                    >
                      <c.icone size={9} />
                      <span>{c.titre}</span>
                    </span>
                  ))}
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {sansApi.length ? (
        <>
          <h2 className="mt-10 font-bold">Sans API publique</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
            Ces fournisseurs ne publient pas d'API ouverte aux revendeurs. L'import passe par
            l'extension, qui lit la fiche déjà affichée dans votre navigateur — c'est précisément ce
            pour quoi elle existe.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {sansApi.map((s) => (
              <li
                key={s.id}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs"
              >
                <PlatformLogo id={s.id} label={s.label} color={s.color} size={18} />
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {ouvert?.api ? (
        <Fenetre
          supplier={ouvert}
          lien={lienDe(ouvert.id)}
          onClose={() => setOuvert(null)}
          onSaved={recharger}
        />
      ) : null}
    </Layout>
  )
}

function Fenetre({
  supplier,
  lien,
  onClose,
  onSaved,
}: {
  supplier: Supplier
  lien: Lien | undefined
  onClose: () => void
  onSaved: () => void
}) {
  const api_ = supplier.api!
  const [valeurs, setValeurs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enregistrer() {
    setBusy(true)
    setError(null)
    try {
      await api.saveSupplierLink(supplier.id, valeurs)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setBusy(false)
    }
  }

  async function detacher() {
    if (!window.confirm(`Détacher ${supplier.label} ? Les identifiants seront effacés.`)) return
    setBusy(true)
    try {
      await api.deleteSupplierLink(supplier.id)
      onSaved()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1633] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <PlatformLogo id={supplier.id} label={supplier.label} color={supplier.color} size={44} />
            <div>
              <h2 className="font-bold">{supplier.label}</h2>
              <p className="text-xs text-gray-500">{api_.nom}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
          Ce raccordement sera <b>conservé, rien de plus</b>. Le connecteur qui lira le catalogue,
          passera les commandes et remontera le suivi n'est pas encore écrit.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {CAPACITES.map((c) => (
            <div
              key={c.cle}
              className={
                api_[c.cle]
                  ? 'flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-2 text-xs text-emerald-200'
                  : 'flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-gray-500'
              }
            >
              <c.icone size={12} className="shrink-0" />
              <span>{c.titre}</span>
              {api_[c.cle] ? <Check size={11} className="ml-auto shrink-0" /> : null}
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-gray-400">
          <b>Ce qu'il faut :</b> {api_.exige}
        </p>
        <a
          href={api_.console}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1 inline-flex items-center gap-1 text-xs text-purple-300 underline hover:text-purple-200"
        >
          <span>Ouvrir la console développeur</span>
          <ExternalLink size={11} />
        </a>

        <div className="mt-4 space-y-3">
          {api_.champs.map((champ) => (
            <label key={champ.cle} className="block">
              <span className="text-xs text-gray-400">
                {lien?.champs.includes(champ.cle) && champ.secret
                  ? `${champ.label} (laissez vide pour garder l'actuel)`
                  : champ.label}
              </span>
              <input
                type={champ.secret ? 'password' : 'text'}
                autoComplete="off"
                value={valeurs[champ.cle] ?? ''}
                onChange={(e) => setValeurs((v) => ({ ...v, [champ.cle]: e.target.value }))}
                placeholder={lien?.champs.includes(champ.cle) ? '••••••••' : ''}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
              />
            </label>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-gray-600">
          Rien n'est réaffiché une fois enregistré : le serveur ne renvoie que le nom des champs
          remplis.
        </p>

        {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}

        <div className="mt-5 flex justify-between gap-2">
          {lien?.connected ? (
            <button
              type="button"
              onClick={detacher}
              disabled={busy}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
            >
              Détacher
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={enregistrer}
            disabled={busy}
            className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {busy ? 'Enregistrement…' : 'Relier'}
          </button>
        </div>
      </div>
    </div>
  )
}
