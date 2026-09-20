import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import { ListeProduitsRapport, type ProduitAffiche } from './ListeProduitsRapport'
import { api } from '../lib/api'

/**
 * Les produits gagnants des rapports du jour.
 *
 * Chaque rapport rayon porte vingt produits en tableau normalisé ; cette liste
 * les lit à plat, du jour le plus récent au plus ancien. **Ce n'est pas un
 * tableau à lire mais une liste d'annonces à importer** : les cases à cocher
 * servent l'import en lot, et chaque ligne garde son chemin — direct pour ce qui
 * se lit sans navigateur, agent extension pour le reste.
 *
 * Le même composant sert la page Produits gagnants (tous rayons) et l'onglet du
 * rayon concerné (`rayon=<clé>`).
 */
/*
 * Une charge utile d'une autre forme ne doit JAMAIS faire tomber la page.
 *
 * Le 20/09 les routes rapports ont changé de forme sous les écrans : `d.analyses`,
 * `d.produits`, `d.prompts` sont passés à `undefined`, et le premier `.length`
 * a emporté toute l'application derrière l'ErrorBoundary. Un contrat qui bouge
 * est un état vide à afficher — « aucun rapport » — pas un écran blanc.
 */
function liste<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

export function GagnantsRapports({ rayon }: { rayon?: string }) {
  const [produits, setProduits] = useState<ProduitAffiche[]>([])
  const [jours, setJours] = useState<string[]>([])
  const [jour, setJour] = useState<string>('')
  const [chargement, setChargement] = useState(true)
  const [porte, setPorte] = useState<{ seuil: number; drops: number } | null>(null)
  const [sansCategorie, setSansCategorie] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    setChargement(true)
    setErreur(null)
    setPorte(null)
    api
      .gagnantsRapports({ rayon, jour: jour || undefined })
      .then((d) => {
        setProduits(liste<ProduitAffiche>(d?.produits))
        setSansCategorie(Boolean(d?.rayonSansCategorie))
        if (!jour) setJours(liste<string>(d?.jours))
      })
      .catch((e: Error & { status?: number; body?: { seuil?: number; drops?: number } }) => {
        setProduits([])
        if (e.status === 402) setPorte({ seuil: e.body?.seuil ?? 500, drops: e.body?.drops ?? 0 })
        else setErreur(e.message)
      })
      .finally(() => setChargement(false))
  }, [rayon, jour])

  if (porte) {
    return (
      <div className="mt-5 max-w-2xl rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5">
        <p className="flex items-center gap-2 font-bold text-amber-100">
          <Lock size={16} /> Réservé aux comptes à {porte.seuil} drops et plus
        </p>
        <p className="mt-2 text-sm text-amber-100/90">
          Les produits gagnants du jour sont offerts, mais il vous faut {porte.seuil} drops en banque : vous en avez{' '}
          {porte.drops}.
        </p>
        <Link to="/credits" className="btn-gradient mt-4 inline-flex rounded-lg px-4 py-2 text-sm font-semibold">
          Recharger mes drops
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-4">
      {jours.length > 1 ? (
        <select
          value={jour}
          onChange={(e) => setJour(e.target.value)}
          className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
        >
          <option value="" className="bg-[#1b1633]">
            Tous les jours disponibles
          </option>
          {jours.map((j) => (
            <option key={j} value={j} className="bg-[#1b1633]">
              {new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </option>
          ))}
        </select>
      ) : null}

      {erreur ? <p className="text-sm text-red-400">{erreur}</p> : null}
      {chargement ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin" /> Chargement…
        </p>
      ) : null}

      {!chargement && sansCategorie ? (
        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-gray-400">
          Ce rayon ne correspond à aucune catégorie d'analyse quotidienne. La liste de tous les rayons est dans{' '}
          <Link to="/produits-gagnants" className="text-purple-300 underline">
            Produits gagnants
          </Link>
          .
        </p>
      ) : null}

      {!chargement && !sansCategorie && produits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-sm text-gray-400">Aucun produit gagnant déposé pour l'instant.</p>
          <p className="mt-2 text-xs text-gray-500">
            Les agents déposent vingt produits par rayon et par jour, disponibles le matin.
          </p>
        </div>
      ) : null}

      {produits.length > 0 ? (
        <ListeProduitsRapport produits={produits} origine={rayon ? `rayon:${rayon}` : 'gagnants'} avecSelection avecProvenance />
      ) : null}
    </div>
  )
}
