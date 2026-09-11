import { useState } from 'react'
import { Check, Loader2, Pencil } from 'lucide-react'
import { PriceInput } from './PriceInput'
import { api } from '../lib/api'

/**
 * Le prix de vente, modifiable depuis la miniature — sans ouvrir la fiche.
 *
 * Voulu le 11/09/2026 : changer un prix sur une annonce parmi cent ne devrait
 * pas coûter deux allers-retours de page. Un clic sur le prix ouvre un champ
 * (PriceInput, qui tolère la virgule du pavé français) ; il s'enregistre en le
 * quittant ou avec Entrée, via le même PATCH que la fiche
 * (`updateProduct { sellingPrice }`). Rien n'est facturé : c'est une écriture,
 * pas une réécriture.
 *
 * La carte est un lien : chaque clic ici arrête la navigation
 * (preventDefault + stopPropagation), comme les autres commandes de la carte.
 */
export function PrixModifiable({
  produit,
  onChange,
  className = '',
}: {
  produit: { id: string; sellingPrice?: number | null; currency?: string | null }
  /** Prévenir la liste pour qu'elle mette la carte (et son tri) à jour. */
  onChange: (id: string, prix: number) => void
  className?: string
}) {
  const [edition, setEdition] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)
  const [erreur, setErreur] = useState(false)

  const prix = Number(produit.sellingPrice ?? 0)
  const devise = produit.currency || 'EUR'

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  async function enregistrer(valeur: number) {
    setEdition(false)
    if (valeur === prix) return
    setBusy(true)
    setErreur(false)
    try {
      await api.updateProduct(produit.id, { sellingPrice: valeur })
      onChange(produit.id, valeur)
      setOk(true)
      setTimeout(() => setOk(false), 1300)
    } catch {
      // L'écriture a échoué : on ne touche pas au prix affiché, et on le signale.
      setErreur(true)
      setTimeout(() => setErreur(false), 2500)
    } finally {
      setBusy(false)
    }
  }

  if (edition) {
    return (
      <span onClick={stop} className="inline-flex items-center gap-1">
        <PriceInput
          value={prix}
          autoFocus
          onCommit={enregistrer}
          className="w-20 rounded-md border border-purple-400/60 bg-black/40 px-1.5 py-0.5 text-sm font-bold text-purple-100 outline-none focus:border-purple-300"
        />
        <span className="text-xs text-gray-500">{devise}</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e)
        setEdition(true)
      }}
      title="Modifier le prix de vente"
      className={`group/prix -mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-bold transition hover:bg-white/10 ${
        erreur ? 'text-red-300' : 'text-purple-300'
      } ${className}`}
    >
      <span>{`${prix.toFixed(2)} ${devise}`}</span>
      {busy ? (
        <Loader2 size={12} className="animate-spin text-gray-400" />
      ) : ok ? (
        <Check size={12} className="text-emerald-400" />
      ) : (
        <Pencil size={11} className="text-purple-300/70 opacity-50 transition group-hover/prix:opacity-100" />
      )}
    </button>
  )
}
