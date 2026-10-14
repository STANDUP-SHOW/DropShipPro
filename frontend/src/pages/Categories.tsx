import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ChevronLeft, ChevronDown, FolderTree } from 'lucide-react'
import { Layout } from '../components/Layout'
import type { BlocData, TuileData } from '../components/stats/TuileStat'
import { Anneau, Beignet, Etiquette, Valeur, ecrire, nombre } from '../components/stats/VueEnsemble'
import { blocsDemo } from '../lib/statsDemo'
import { useDemo } from '../lib/demo'
import { api } from '../lib/api'

type Arbre = Awaited<ReturnType<typeof api.categoryTree>>
type Rayon = Arbre['arbre'][number]

/** Les filtres des rayons, en un seul bloc de boutons groupés (comme Mes annonces). */
const FILTRES = [
  { id: 'tous', label: 'Tous les rayons' },
  { id: 'utilises', label: 'Déjà utilisés' },
  { id: 'jamais', label: 'Jamais utilisés' },
  { id: 'apprises', label: 'Avec apprises' },
] as const
type Filtre = (typeof FILTRES)[number]['id']

const garde = (r: Rayon, f: Filtre) =>
  f === 'tous'
    ? true
    : f === 'utilises'
      ? r.uses > 0 || r.enfants.some((e) => e.uses > 0)
      : f === 'jamais'
        ? r.uses === 0 && r.enfants.every((e) => e.uses === 0)
        : r.enfants.some((e) => e.origin === 'learned')

const usagesDe = (r: Rayon) => r.uses + r.enfants.reduce((n, e) => n + e.uses, 0)

/**
 * Le référentiel produit, tel qu'on le parcourt.
 *
 * Deux niveaux, et c'est délibéré : les rayons en gros blocs avec leur icône
 * métier, les sous-catégories en petits blocs une fois qu'on est entré. Une
 * liste plate de deux cent quarante-huit entrées ne se lit pas — on la fait
 * défiler en espérant reconnaître un mot.
 *
 * Mise en page du 14/10/2026 (demande de Max) : le bloc statistiques compressé
 * en haut (un grand bloc, deux petits), quatre compteurs dont les annonces à
 * ranger, la reprise avec son « plus d'infos », puis un menu déroulant des
 * catégories et les filtres groupés.
 */
export default function Categories() {
  const [arbre, setArbre] = useState<Arbre | null>(null)
  const [ouvert, setOuvert] = useState<Rayon | null>(null)
  const [choisie, setChoisie] = useState<string | null>(null)
  const [filtre, setFiltre] = useState<Filtre>('tous')
  const [ordre, setOrdre] = useState<'alpha' | 'usages'>('alpha')
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    api
      .categoryTree()
      .then(setArbre)
      .catch(() => undefined)
      .finally(() => setChargement(false))
  }, [])

  const rayons = useMemo(() => {
    const liste = (arbre?.arbre ?? []).filter((r) => garde(r, filtre))
    return ordre === 'usages'
      ? [...liste].sort((a, b) => usagesDe(b) - usagesDe(a))
      : [...liste].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [arbre, filtre, ordre])

  /*
   * Le menu déroulant remplace la recherche (demande de Max du 14/10/2026) :
   * un rayon l'ouvre, une sous-catégorie ouvre son rayon et s'y allume.
   */
  const choisir = (valeur: string) => {
    if (!arbre) return
    if (!valeur) {
      setOuvert(null)
      setChoisie(null)
      return
    }
    const [rayonId, enfantId] = valeur.split('|')
    const rayon = arbre.arbre.find((r) => r.id === rayonId) ?? null
    setOuvert(rayon)
    setChoisie(enfantId ?? null)
  }

  useEffect(() => {
    if (!choisie) return
    document.getElementById(`cat-${choisie}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [choisie])

  return (
    <Layout>
      <StatsRayons />

      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FolderTree size={22} className="text-[var(--marque-rose)]" />
          <span>Catégories</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--texte-2)]">
          Le référentiel qui range vos annonces sur chaque plateforme. Il apprend : un produit dont
          la catégorie manquait l'enrichit, et le suivant part au bon endroit tout seul.
        </p>
      </div>

      {arbre ? (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Chiffre valeur={arbre.rayons} libelle="rayons" />
          <Chiffre valeur={arbre.sousCategories} libelle="sous-catégories" />
          <Chiffre valeur={arbre.apprises} libelle="apprises à l'usage" />
          <Chiffre
            valeur={arbre.aRanger.annonces}
            libelle={arbre.aRanger.annonces > 1 ? 'annonces à ranger' : 'annonce à ranger'}
            allume={arbre.aRanger.annonces > 0}
            vers={arbre.aRanger.annonces > 0 ? `/dashboard?categorie=${encodeURIComponent(arbre.aRanger.categoryId)}` : undefined}
          />
        </div>
      ) : null}

      <Reprise aRanger={arbre?.aRanger ?? null} />

      {/* Le menu des catégories, puis les filtres groupés et l'ordre. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="block w-full min-w-0 sm:w-72">
          <span className="sr-only">Choisir une catégorie</span>
          <select
            value={ouvert ? `${ouvert.id}${choisie ? `|${choisie}` : ''}` : ''}
            onChange={(e) => choisir(e.target.value)}
            className="w-full rounded-xl border border-[var(--trait)] bg-[var(--panneau)] px-3 py-2.5 text-sm text-[var(--texte)] outline-none focus:border-[var(--marque-rose)]"
          >
            <option value="">Toutes les catégories</option>
            {[...(arbre?.arbre ?? [])]
              .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
              .map((r) => (
                <optgroup key={r.id} label={`${r.icone ?? '📦'} ${r.label}`}>
                  <option value={r.id}>{`Tout le rayon ${r.label}`}</option>
                  {r.enfants.map((e) => (
                    <option key={e.id} value={`${r.id}|${e.id}`}>
                      {e.origin === 'learned' ? `${e.label} (apprise)` : e.label}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </label>

        {!ouvert ? (
          <>
            <div role="group" aria-label="Filtrer les rayons" className="inline-flex max-w-full flex-wrap overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              {FILTRES.map((x) => {
                const n = (arbre?.arbre ?? []).filter((r) => garde(r, x.id)).length
                const actif = filtre === x.id
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => setFiltre(x.id)}
                    aria-pressed={actif}
                    className={`border-r border-white/10 px-3.5 py-2 text-sm font-semibold transition last:border-r-0 ${
                      actif ? 'bg-gradient-to-r from-[#f28a4b] to-[#e85290] text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span>{x.label}</span>
                    <span className={`ml-1.5 text-xs ${actif ? 'text-white/80' : 'text-gray-500'}`}>{n}</span>
                  </button>
                )
              })}
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--texte-2)]">
              <span>Ordre</span>
              <select
                value={ordre}
                onChange={(e) => setOrdre(e.target.value as 'alpha' | 'usages')}
                className="rounded-lg border border-[var(--trait)] bg-[var(--panneau)] px-2 py-1.5 text-xs text-[var(--texte)] outline-none"
              >
                <option value="alpha">De A à Z</option>
                <option value="usages">Les plus utilisés</option>
              </select>
            </label>
          </>
        ) : null}
      </div>

      {chargement ? <p className="text-sm text-gray-500">Chargement…</p> : null}

      {ouvert ? (
        /* --- Un rayon ouvert : ses sous-catégories en petits blocs --------- */
        <>
          <button
            type="button"
            onClick={() => choisir('')}
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
                id={`cat-${e.id}`}
                className={`rounded-xl border px-3 py-2.5 transition ${
                  choisie === e.id ? 'border-[var(--marque-rose)] bg-[#e85290]/10' : 'border-white/10 bg-white/5 hover:border-[#e85290]/40'
                }`}
              >
                <p className="text-sm leading-snug">{e.label}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
                  <span>{e.uses > 0 ? `${e.uses} annonce(s)` : 'aucune annonce'}</span>
                  {e.origin === 'learned' ? <Appris /> : null}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : rayons.length || chargement ? (
        /* --- L'accueil : les rayons en gros blocs -------------------------- */
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rayons.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => choisir(r.id)}
                className="flex h-full w-full flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-5 text-center transition hover:-translate-y-0.5 hover:border-[#e85290]/50 hover:bg-white/[0.08]"
              >
                <span className="text-4xl leading-none">{r.icone ?? '📦'}</span>
                <span className="text-sm font-medium leading-snug">{r.label}</span>
                <span className="text-[11px] text-gray-400">
                  {`${r.enfants.length} sous-catégories`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-gray-400">
          Aucun rayon dans ce filtre.
        </p>
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

/** Un compteur ; « allumé » quand il y a quelque chose à faire, et alors cliquable. */
function Chiffre({ valeur, libelle, allume, vers }: { valeur: number; libelle: string; allume?: boolean; vers?: string }) {
  const classe = `block rounded-xl border px-4 py-3 ${
    allume ? 'border-[#e85290]/50 bg-gradient-to-br from-[#f28a4b]/15 to-[#e85290]/15 transition hover:border-[#e85290]' : 'border-white/10 bg-white/5'
  }`
  const contenu = (
    <>
      <p className="text-2xl font-bold tabular-nums">{valeur}</p>
      <p className={`mt-0.5 text-xs ${allume ? 'text-[var(--texte)]' : 'text-gray-400'}`}>{libelle}</p>
    </>
  )
  return vers ? (
    <Link to={vers} className={classe} title="Voir ces annonces">
      {contenu}
    </Link>
  ) : (
    <div className={classe}>{contenu}</div>
  )
}

/**
 * Le bloc statistiques « Rayons et catégories », compressé (demande de Max du
 * 14/10/2026) : un grand bloc à gauche, deux petits à droite de quatre
 * chiffres chacun. Mêmes données que la vue d'ensemble (bloc `rayons` de
 * /stats/tableau, trente jours, mode démonstration compris) ; une tuile sans
 * donnée affiche « — » avec sa raison au survol, rien n'est estimé.
 */
function StatsRayons() {
  const [bloc, setBloc] = useState<BlocData | null>(null)
  const [demo, setDemo] = useState(false)
  const [demoGlobal] = useDemo()

  useEffect(() => {
    const au = new Date()
    const du = new Date(au.getTime() - 30 * 86400000)
    api
      .tableauStats(du, au)
      .then((r) => {
        const blocs = demoGlobal ? blocsDemo(r.blocs) : r.blocs
        setBloc(blocs.find((b) => b.id === 'rayons') ?? null)
        setDemo(demoGlobal)
      })
      .catch(() => {
        // Les statistiques sont un bandeau, pas la page : leur panne ne doit
        // jamais empêcher de travailler en dessous.
      })
  }, [demoGlobal])

  if (!bloc) return null
  const lire = (id: string) => bloc.tuiles.find((t) => t.id === id)
  const repartition = lire('repartition')
  const ranges = nombre(lire('produits'))
  const sansRayon = nombre(lire('sans-rayon'))
  const total = (ranges ?? 0) + (sansRayon ?? 0)
  const part = ranges !== null && total ? Math.round((ranges / total) * 100) : null

  return (
    <div className="mb-5">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <section className="case-ds flex min-w-0 flex-col p-4 lg:col-span-7">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[var(--texte)]">Rayons et catégories</h2>
            <span className="text-[10px] text-[var(--texte-3)]">30 derniers jours</span>
          </div>
          <div className="grid flex-1 grid-cols-1 items-center gap-5 sm:grid-cols-2">
            <div className="space-y-4">
              <div>
                <Etiquette>{repartition?.label ?? 'Catégories distinctes'}</Etiquette>
                <p title={ecrire(repartition) === '—' ? repartition?.raison : undefined} className="text-5xl font-extrabold leading-tight text-[var(--texte)]">
                  {ecrire(repartition)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Anneau pour={part} teinte="#e85290" centre={part === null ? '—' : `${part} %`} taille={96} />
                <p className="max-w-[12rem] text-xs leading-snug text-[var(--texte-2)]">Part de vos produits rangés dans un rayon.</p>
              </div>
            </div>
            <div className="min-w-0">
              <Etiquette>Vos produits par rayon</Etiquette>
              <div className="mt-2">
                <Beignet parts={repartition?.parts} vide="Aucun produit rangé pour l'instant." />
              </div>
            </div>
          </div>
        </section>

        <div className="grid min-w-0 grid-cols-1 gap-3 lg:col-span-5">
          <PetitBloc titre="Ventes par rayon" tuiles={[lire('ca'), lire('ventes'), lire('marge'), lire('rentable')]} />
          <PetitBloc titre="Rangement" tuiles={[lire('rayons'), lire('produits'), lire('sans-rayon'), lire('dominant')]} />
        </div>
      </div>
      <p className="mt-1.5 text-right text-[10px] text-[var(--texte-3)]">
        {demo ? 'Chiffres de démonstration — vos ventes les remplaceront. ' : ''}
        <Link to="/statistiques" className="text-[var(--marque-orange)] underline-offset-2 hover:underline">
          Vue d'ensemble
        </Link>
      </p>
    </div>
  )
}

function PetitBloc({ titre, tuiles }: { titre: string; tuiles: Array<TuileData | undefined> }) {
  return (
    <section className="case-ds min-w-0 p-4">
      <h2 className="mb-2 text-sm font-bold text-[var(--texte)]">{titre}</h2>
      <div className="grid grid-cols-2 gap-2">
        {tuiles.map((t, i) => (
          <div key={t?.id ?? i} className="min-w-0 rounded-xl bg-white/[0.03] p-3">
            <Etiquette>{t?.label ?? '—'}</Etiquette>
            <div className="truncate">
              <Valeur t={t} petite />
            </div>
          </div>
        ))}
      </div>
    </section>
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
function Reprise({ aRanger }: { aRanger: Arbre['aRanger'] | null }) {
  const [encours, setEncours] = useState(false)
  const [infos, setInfos] = useState(false)
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
    <section className="case-ds mb-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Reprendre les annonces non rangées</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-[var(--texte-2)]">
            La reprise range ce qui peut l'être et vous rend le reste.
          </p>
          <button
            type="button"
            onClick={() => setInfos((v) => !v)}
            aria-expanded={infos}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--marque-orange)] hover:underline"
          >
            {infos ? "Moins d'infos" : "Plus d'infos"}
            <ChevronDown size={13} className={`transition ${infos ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <button
          type="button"
          onClick={lancer}
          disabled={encours}
          className="btn-gradient shrink-0 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {encours ? 'Reprise en cours…' : 'Reprendre'}
        </button>
      </div>

      {/*
        La salle d'attente, dite en toutes lettres (19/09/2026), repliée sous
        « Plus d'infos » depuis le 14/10/2026 : le compteur « à ranger » en haut
        de page dit déjà qu'il y a quelque chose à faire.
      */}
      {infos ? (
        <div className="mt-3 max-w-3xl space-y-2 border-t border-white/10 pt-3 text-xs leading-relaxed text-[var(--texte-2)]">
          <p>
            Une annonce non rangée est dans <b className="text-[var(--texte)]">Nouveauté et usage spécial</b>, qui
            n'est pas un rayon mais une salle d'attente : c'est là qu'atterrit un produit dont la catégorie
            n'a pas été reconnue, introuvable dans la liste ou mal lue à l'import.{' '}
            <b className="text-[var(--texte)]">Tant qu'elle y est, elle ne s'affiche dans aucun rayon.</b>
          </p>
          <p>
            Une annonce sans catégorie part aussi sans catégorie ni collection sur Shopify, sans que rien
            ne le signale.
          </p>
          <p>
            Changer sa catégorie depuis la fiche est le seul geste qui l'en sort, et c'est aussi celui qui
            apprend au référentiel à reconnaître ce produit : le prochain du même genre partira au bon
            endroit tout seul.
          </p>
          {aRanger && aRanger.annonces > 0 ? (
            <Link
              to={`/dashboard?categorie=${encodeURIComponent(aRanger.categoryId)}`}
              className="inline-flex font-semibold text-[var(--marque-orange)] hover:underline"
            >
              {`Voir les ${aRanger.annonces} annonce(s) à ranger`}
            </Link>
          ) : null}
        </div>
      ) : null}

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
