import { useEffect, useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { api, getToken, apiRoot } from '../lib/api'

/**
 * Le bouton qui prépare le catalogue au format de Faire.
 *
 * **Faire n'a aucune API d'annonces.** Son portail marque ingère une feuille de
 * calcul, et c'est la seule voie qui passe à l'échelle. On produit donc le
 * fichier au gabarit officiel — quarante-neuf colonnes, lues dans leur modèle —
 * et le vendeur le dépose chez eux.
 *
 * **L'aperçu passe AVANT le téléchargement, et c'est le point.** Un catalogue
 * de deux cents fiches dont quarante manquent de photo doit le dire ici, sur
 * l'écran où le vendeur peut corriger — pas se faire refuser chez Faire trois
 * heures plus tard, avec un message qui ne nomme rien.
 *
 * **La remise de gros est affichée, jamais appliquée en silence.** Faire exige
 * un prix REVENDEUR, un troisième prix à côté du prix d'achat et du prix de
 * vente. Le défaut est la convention du métier — la moitié du prix de vente —
 * et le vendeur doit le voir pour le corriger. Un défaut caché sur un prix est
 * la meilleure façon de vendre à perte sans s'en apercevoir.
 */
export function ExportFaire() {
  const [remise, setRemise] = useState(50)
  const [apercu, setApercu] = useState<{ total: number; retenus: number; ecartes: Array<{ id: string; titre: string; raison: string }> } | null>(null)
  const [charge, setCharge] = useState(true)

  useEffect(() => {
    setCharge(true)
    api
      .faireApercu(remise / 100)
      .then(setApercu)
      .catch(() => setApercu(null))
      .finally(() => setCharge(false))
  }, [remise])

  /*
   * Le téléchargement passe par un `fetch` authentifié puis un objet-URL, et
   * non par un simple lien : l'API vit sur un autre domaine et n'a pas de
   * cookie de session — un `<a href>` arriverait sans jeton et recevrait un 401.
   */
  async function telecharger() {
    const r = await fetch(`${apiRoot}/api/products/meta/faire.csv?remiseGros=${remise / 100}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    if (!r.ok) return
    const url = URL.createObjectURL(await r.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `faire-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-sm font-semibold">Préparer le catalogue pour Faire</p>

      <label className="mt-2 block text-xs text-gray-400" htmlFor="faire-remise">
        Prix revendeur = <b className="text-white">{remise} %</b> du prix de vente
      </label>
      <input
        id="faire-remise"
        type="range"
        min={20}
        max={80}
        step={5}
        value={remise}
        onChange={(e) => setRemise(Number(e.target.value))}
        className="mt-1 w-full accent-purple-500"
      />
      <p className="text-[11px] text-gray-500">
        50 % est la convention du commerce de gros — le détaillant double pour revendre. À revoir
        selon vos marges : une ligne dont le prix de gros passe sous votre prix d'achat n'est pas
        exportée.
      </p>

      {charge ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
          <Loader2 size={12} className="animate-spin" /> Calcul…
        </p>
      ) : apercu ? (
        <div className="mt-2 text-xs">
          <p className="text-gray-300">
            <b className="text-white">{apercu.retenus}</b> annonce(s) sur {apercu.total} partiront.
          </p>
          {apercu.ecartes.length ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-amber-200">
                {`${apercu.ecartes.length} écartée(s) — voir pourquoi`}
              </summary>
              <ul className="mt-1 space-y-1">
                {apercu.ecartes.map((e) => (
                  <li key={e.id} className="text-[11px] text-gray-400">
                    <b className="text-gray-300">{e.titre}</b> — {e.raison}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={telecharger}
        disabled={!apercu?.retenus}
        className="btn-gradient mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        <FileDown size={14} />
        <span>Télécharger le fichier</span>
      </button>

      <p className="mt-2 text-[11px] text-gray-500">
        À déposer ensuite dans votre portail marque Faire, <i>Ajouter des produits › Importer une
        feuille de calcul</i>. Faire se charge de la mise en forme.
      </p>
    </div>
  )
}
