import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, ChevronRight, ChevronDown, Lock, Loader2, Newspaper } from 'lucide-react'
import { Markdown, blocsDe } from './Markdown'
import { ListeProduitsRapport } from './ListeProduitsRapport'
import { api } from '../lib/api'

/**
 * Les analyses des 48 agents, listées par date et dépliables.
 *
 * Fresh news montre UN jour d'UNE catégorie, en entier, comme un journal. Cette
 * liste-ci est l'autre lecture, celle qu'on cherche quand on sait ce qu'on veut :
 * toutes les analyses d'un rayon, la plus récente en tête, une ligne par
 * rapport, qu'on déplie pour lire.
 *
 * **Le même composant sert trois endroits** : le bloc « Analyses de marché » du
 * rayon (`rayon=<clé>`, type `rayon`), la page Analyses de marché du menu (sans
 * périmètre), et Réseaux › Analyses (type `marketing`). Les trois lisent la même
 * table — une écriture, trois vitrines.
 *
 * **Le corps n'est pas chargé avec la liste.** Soixante analyses complètes font
 * un mégaoctet de Markdown pour trois lignes lues ; il est demandé au dépliage.
 */
type Ligne = Awaited<ReturnType<typeof api.analysesRapports>>['analyses'][number]
type Complete = Awaited<ReturnType<typeof api.analyseRapport>>

function dateFr(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function AnalysesRapports({
  type,
  rayon,
  avecFiltreCategorie = false,
  limite,
}: {
  type: 'rayon' | 'marketing'
  /** La clé du chef de rayon, quand la liste est celle d'un rayon. */
  rayon?: string
  /** Le sélecteur de catégorie — pour les vues globales, inutile dans un rayon. */
  avecFiltreCategorie?: boolean
  limite?: number
}) {
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [categories, setCategories] = useState<Array<{ id: string; nom: string }>>([])
  const [categorie, setCategorie] = useState<string>('')
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [complete, setComplete] = useState<Complete | null>(null)
  const [chargement, setChargement] = useState(true)
  const [porte, setPorte] = useState<{ seuil: number; drops: number } | null>(null)
  const [sansCategorie, setSansCategorie] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    setChargement(true)
    setErreur(null)
    setPorte(null)
    setOuverte(null)
    setComplete(null)
    api
      .analysesRapports({ type, rayon, categorie: categorie || undefined, limite })
      .then((d) => {
        setLignes(d.analyses)
        setSansCategorie(d.rayonSansCategorie)
        if (avecFiltreCategorie && !categorie) setCategories(d.categories)
      })
      .catch((e: Error & { status?: number; body?: { seuil?: number; drops?: number } }) => {
        setLignes([])
        if (e.status === 402) setPorte({ seuil: e.body?.seuil ?? 500, drops: e.body?.drops ?? 0 })
        else setErreur(e.message)
      })
      .finally(() => setChargement(false))
  }, [type, rayon, categorie, limite, avecFiltreCategorie])

  useEffect(() => {
    if (!ouverte) return
    setComplete(null)
    api.analyseRapport(ouverte).then(setComplete).catch(() => setComplete(null))
  }, [ouverte])

  if (porte) {
    return (
      <div className="mt-5 max-w-2xl rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5">
        <p className="flex items-center gap-2 font-bold text-amber-100">
          <Lock size={16} /> Réservé aux comptes à {porte.seuil} drops et plus
        </p>
        <p className="mt-2 text-sm text-amber-100/90">
          Les analyses quotidiennes sont gratuites, mais elles sont pour les vendeurs qui vendent : il vous faut{' '}
          {porte.seuil} drops en banque, vous en avez {porte.drops}.
        </p>
        <Link to="/credits" className="btn-gradient mt-4 inline-flex rounded-lg px-4 py-2 text-sm font-semibold">
          Recharger mes drops
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-4">
      {avecFiltreCategorie && categories.length > 0 ? (
        <select
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
        >
          <option value="" className="bg-[#1b1633]">
            Tous les rayons
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id} className="bg-[#1b1633]">
              {c.nom}
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
          Ce rayon ne correspond à aucune catégorie d'analyse quotidienne — c'est le rayon fourre-tout du référentiel.
          Les analyses de tous les rayons sont dans{' '}
          <Link to="/analyse-marche" className="text-purple-300 underline">
            Analyses de marché
          </Link>
          .
        </p>
      ) : null}

      {!chargement && !sansCategorie && lignes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-sm text-gray-400">Aucune analyse déposée pour l'instant.</p>
          <p className="mt-2 text-xs text-gray-500">
            Les agents en écrivent une par rayon et par jour, disponible le matin. La version journal est dans{' '}
            <Link to="/fresh-news" className="text-purple-300 underline">
              Fresh news
            </Link>
            .
          </p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {lignes.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => setOuverte(ouverte === l.id ? null : l.id)}
              className={
                ouverte === l.id
                  ? 'flex w-full items-center gap-3 rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3 text-left'
                  : 'flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:border-purple-400/40'
              }
            >
              {ouverte === l.id ? (
                <ChevronDown size={15} className="shrink-0 text-emerald-300" />
              ) : (
                <ChevronRight size={15} className="shrink-0 text-gray-500" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{l.titre}</span>
                <span className="block text-xs text-gray-500">
                  {[dateFr(l.day), l.categorieNom, l.themeNom, l.produits ? `${l.produits} produits` : null]
                    .filter(Boolean)
                    .join(' — ')}
                </span>
              </span>
              <FileText size={15} className="shrink-0 text-gray-500" />
            </button>

            {ouverte === l.id ? (
              <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-4">
                {!complete || complete.id !== l.id ? (
                  <p className="text-sm text-gray-500">Ouverture…</p>
                ) : (
                  <>
                    {complete.accroche ? <p className="mb-3 text-sm text-gray-200">{complete.accroche}</p> : null}

                    {blocsDe(complete.body).map((b) => {
                      const estListe =
                        complete.type === 'rayon' && /produits/i.test(b.titre) && complete.produits.length > 0
                      return (
                        <section key={b.id} className="mt-4 first:mt-0">
                          {b.titre ? <h4 className="font-bold text-purple-200">{b.titre}</h4> : null}
                          {estListe ? (
                            <ListeProduitsRapport produits={complete.produits} origine={complete.id} avecSelection />
                          ) : (
                            <div className="mt-1">
                              <Markdown texte={b.corps} />
                            </div>
                          )}
                        </section>
                      )
                    })}

                    <p className="mt-4 flex items-center gap-1.5 border-t border-white/10 pt-3 text-xs text-gray-500">
                      <Newspaper size={12} />
                      <span>
                        {`Sources consultées : ${complete.sources}. `}
                        <Link
                          to={`/fresh-news?categorie=${encodeURIComponent(complete.categorie)}&jour=${complete.day}`}
                          className="text-purple-300 underline"
                        >
                          Voir le journal de ce jour
                        </Link>
                      </span>
                    </p>
                  </>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
