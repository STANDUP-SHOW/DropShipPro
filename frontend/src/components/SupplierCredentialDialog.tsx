import { useState } from 'react'
import { Check, ExternalLink, Package, RefreshCw, ShoppingCart, Truck } from 'lucide-react'
import { api } from '../lib/api'

/**
 * La saisie des identifiants d'un fournisseur.
 *
 * Sortie de la page « API Sourcing Connect », qui n'existe plus : les
 * fournisseurs tiennent désormais dans un seul écran, où chaque fiche porte à la
 * fois ce que le fournisseur vend et comment on s'y relie.
 */
type Supplier = Awaited<ReturnType<typeof api.listSuppliers>>[number]
type Lien = Awaited<ReturnType<typeof api.listSupplierLinks>>[number]

const CAPACITES = [
  { cle: 'lectureCatalogue' as const, icone: Package, titre: 'Lire le catalogue' },
  { cle: 'stockTempsReel' as const, icone: RefreshCw, titre: 'Stock et prix en direct' },
  { cle: 'commande' as const, icone: ShoppingCart, titre: 'Commander depuis ici' },
  { cle: 'suivi' as const, icone: Truck, titre: 'Numéro de suivi' },
]

/**
 * Le corps du raccordement, sans cadre.
 *
 * Il vivait dans une fenêtre modale. Le dépliage sur place le rend plus simple à
 * lire : le vendeur garde la fiche du fournisseur sous les yeux — ce qu'il vend,
 * ses mises en garde — pendant qu'il colle sa clé. Une fenêtre les lui cachait
 * au moment précis où il en avait besoin.
 */
export function FormulaireFournisseur({
  supplier,
  lien,
  onSaved,
}: {
  supplier: Supplier
  lien: Lien | undefined
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
          } finally {
      setBusy(false)
    }
  }

  return (
    <>
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
                  : champ.optionnel
                    ? `${champ.label} (facultatif)`
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
    </>
  )
}
