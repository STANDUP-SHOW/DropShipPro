import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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

      <Reprise />

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

/**
 * Reprend les annonces qui ne sont rangées nulle part.
 *
 * Deux populations, et aucune ne se voyait : celles importées avant que le
 * référentiel existe, et celles rangées à la main depuis un menu qui servait
 * encore l'ancien catalogue. Leur catégorie s'affichait, le vendeur les croyait
 * rangées, et la publication Shopify partait sans catégorie ni collection.
 *
 * Le bouton est ici plutôt qu'au fond des réglages : c'est la page où l'on
 * regarde le référentiel, donc celle où l'on se demande ce qu'il range vraiment.
 */
function Reprise() {
  const [encours, setEncours] = useState(false)
  const [bilan, setBilan] = useState<Awaited<ReturnType<typeof api.recategoriser>> | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  /**
   * La reprise, lot par lot jusqu'au bout.
   *
   * Elle se faisait d'un seul appel : quatre-vingt-onze annonces, chacune
   * pouvant demander un appel au modèle, et la requête coupée par le proxy bien
   * avant la fin. Le vendeur voyait « failed to fetch » — une panne réseau, qui
   * ne dit rien de ce qui avait été rangé, et qui laissait croire que la reprise
   * n'avait rien fait alors qu'elle avait travaillé une minute.
   *
   * Le bilan s'additionne à mesure : ce qui est rangé l'est déjà en base, même
   * si un lot suivant échoue. L'erreur ne remplace donc pas le compte, elle s'y
   * ajoute.
   */
  const lancer = async () => {
    setEncours(true)
    setErreur(null)

    const cumul = { examinees: 0, dejaRangees: 0, rangees: 0, restants: [] as Array<{ id: string; titre: string }>, suivant: null as string | null }
    let apres: string | undefined

    try {
      // Une borne dure : cent lots font deux mille cinq cents annonces, et une
      // boucle sans borne sur un curseur qui n'avance pas tournerait sans fin.
      for (let lot = 0; lot < 100; lot++) {
        const bilanLot = await api.recategoriser(apres)

        cumul.examinees += bilanLot.examinees
        cumul.dejaRangees += bilanLot.dejaRangees
        cumul.rangees += bilanLot.rangees
        cumul.restants = [...cumul.restants, ...bilanLot.restants].slice(0, 50)
        setBilan({ ...cumul })

        if (!bilanLot.suivant) break
        apres = bilanLot.suivant
      }
    } catch (e) {
      setErreur(
        cumul.examinees
          ? `${cumul.rangees} annonce(s) rangée(s) avant l'interruption : ${e instanceof Error ? e.message : 'reprise interrompue'}. Relancez pour continuer.`
          : e instanceof Error
            ? e.message
            : 'Reprise impossible',
      )
    } finally {
      setEncours(false)
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Reprendre les annonces non rangées</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-gray-400">
            Une annonce sans catégorie part sans catégorie ni collection sur Shopify, et sans que
            rien ne le signale. La reprise range ce qui peut l'être et vous rend le reste.
          </p>
        </div>
        <button
          type="button"
          onClick={lancer}
          disabled={encours}
          className="shrink-0 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-400 disabled:opacity-50"
        >
          {encours ? 'Reprise en cours…' : 'Reprendre'}
        </button>
      </div>

      {erreur ? <p className="mt-3 text-xs text-red-300">{erreur}</p> : null}

      {bilan ? (
        <div className="mt-3 border-t border-white/10 pt-3 text-xs">
          <p className="text-gray-300">
            {`${bilan.rangees} rangée(s) sur ${bilan.examinees} examinée(s) — ${bilan.dejaRangees} l'étaient déjà.`}
          </p>
          {bilan.restants.length ? (
            <>
              <p className="mt-2 text-gray-400">
                À ranger à la main depuis la fiche — le produit décide, pas nous :
              </p>
              <ul className="mt-1 space-y-0.5">
                {bilan.restants.map((r) => (
                  <li key={r.id}>
                    <Link to={`/products/${r.id}`} className="text-purple-300 hover:underline">
                      {r.titre}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
