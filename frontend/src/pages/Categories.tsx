import { useEffect, useMemo, useState } from 'react'
import { Search, Sparkles, ChevronLeft, FolderTree } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

type Arbre = Awaited<ReturnType<typeof api.categoryTree>>
type Rayon = Arbre['arbre'][number]

/**
 * Le référentiel produit, tel qu'on le parcourt.
 *
 * Deux niveaux, et c'est délibéré : les rayons en gros blocs avec leur icône
 * métier, les sous-catégories en petits blocs une fois qu'on est entré. Une
 * liste plate de deux cent quarante-huit entrées ne se lit pas — on la fait
 * défiler en espérant reconnaître un mot.
 *
 * L'écran montre aussi ce que le référentiel a **appris**. C'est ce qui le
 * distingue d'une liste figée : chaque produit importé dont la catégorie
 * manquait enrichit le référentiel pour tout le monde, et une catégorie apprise
 * porte sa marque pour qu'on puisse la relire.
 */
export default function Categories() {
  const [arbre, setArbre] = useState<Arbre | null>(null)
  const [ouvert, setOuvert] = useState<Rayon | null>(null)
  const [recherche, setRecherche] = useState('')
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    api
      .categoryTree()
      .then(setArbre)
      .catch(() => undefined)
      .finally(() => setChargement(false))
  }, [])

  const besoin = recherche.trim().toLowerCase()

  /*
   * La recherche traverse les deux niveaux d'un coup.
   *
   * Un vendeur qui cherche « souris » ne sait pas si elle est rangée sous
   * « Électronique » ou sous « Ordinateurs » — c'est justement ce qu'il vient
   * demander. La faire chercher rayon par rayon reviendrait à lui répondre par
   * la question.
   */
  const resultats = useMemo(() => {
    if (!besoin || !arbre) return []
    const sortie: Array<{ rayon: Rayon; id: string; label: string; path: string; origin: string }> = []
    for (const rayon of arbre.arbre) {
      for (const enfant of rayon.enfants) {
        if (enfant.path.toLowerCase().includes(besoin)) {
          sortie.push({ rayon, ...enfant })
        }
      }
    }
    return sortie.slice(0, 60)
  }, [besoin, arbre])

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FolderTree size={22} className="text-purple-300" />
          <span>Catégories</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          Le référentiel qui range vos annonces sur chaque plateforme. Il apprend : un produit dont
          la catégorie manquait l'enrichit, et le suivant part au bon endroit tout seul.
        </p>
      </div>

      {arbre ? (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Chiffre valeur={arbre.rayons} libelle="rayons" />
          <Chiffre valeur={arbre.sousCategories} libelle="sous-catégories" />
          <Chiffre valeur={arbre.apprises} libelle="apprises à l'usage" accent />
        </div>
      ) : null}

      <label className="relative mb-6 block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher une catégorie — « souris », « robe », « dashcam »…"
          className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-purple-400/70"
        />
      </label>

      {chargement ? <p className="text-sm text-gray-500">Chargement…</p> : null}

      {/* --- La recherche prime sur la navigation --------------------------- */}
      {besoin ? (
        resultats.length ? (
          <ul className="space-y-1.5">
            {resultats.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5"
              >
                <span className="text-lg">{r.rayon.icone ?? '📦'}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{r.path}</span>
                {r.origin === 'learned' ? <Appris /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-gray-400">
            Aucune catégorie ne correspond. Ce n'est pas grave : importez le produit, le référentiel
            apprendra sa catégorie et l'ajoutera.
          </p>
        )
      ) : ouvert ? (
        /* --- Un rayon ouvert : ses sous-catégories en petits blocs --------- */
        <>
          <button
            type="button"
            onClick={() => setOuvert(null)}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white"
          >
            <ChevronLeft size={16} /> Tous les rayons
          </button>

          <h2 className="mb-4 flex items-center gap-3 text-lg font-bold">
            <span className="text-3xl">{ouvert.icone ?? '📦'}</span>
            <span>{ouvert.label}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal text-gray-400">
              {`${ouvert.enfants.length} sous-catégories`}
            </span>
          </h2>

          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ouvert.enfants.map((e) => (
              <li
                key={e.id}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 transition hover:border-purple-400/40"
              >
                <p className="text-sm leading-snug">{e.label}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span>{e.uses > 0 ? `${e.uses} annonce(s)` : 'aucune annonce'}</span>
                  {e.origin === 'learned' ? <Appris /> : null}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        /* --- L'accueil : les rayons en gros blocs -------------------------- */
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(arbre?.arbre ?? []).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOuvert(r)}
                className="flex h-full w-full flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-5 text-center transition hover:-translate-y-0.5 hover:border-purple-400/50 hover:bg-white/[0.08]"
              >
                <span className="text-4xl leading-none">{r.icone ?? '📦'}</span>
                <span className="text-sm font-medium leading-snug">{r.label}</span>
                <span className="text-[11px] text-gray-500">
                  {`${r.enfants.length} sous-catégories`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  )
}

/** La marque d'une catégorie que le référentiel a apprise tout seul. */
function Appris() {
  return (
    <span
      title="Catégorie apprise à l'import, pas livrée avec l'application"
      className="inline-flex items-center gap-0.5 rounded bg-purple-500/20 px-1.5 text-[10px] text-purple-200"
    >
      <Sparkles size={9} /> apprise
    </span>
  )
}

function Chiffre({ valeur, libelle, accent }: { valeur: number; libelle: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        accent ? 'border-purple-400/30 bg-purple-500/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <p className="text-2xl font-bold tabular-nums">{valeur}</p>
      <p className="mt-0.5 text-xs text-gray-400">{libelle}</p>
    </div>
  )
}
