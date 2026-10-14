import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDownWideNarrow, Boxes, Check, Download, ExternalLink, Loader2, Plus, Scale, Search, Send, Sparkles, Unplug } from 'lucide-react'
import { Layout } from '../components/Layout'
import { AgentBar } from '../components/AgentBar'
import { PlatformLogo } from '../components/PlatformLogo'
import { api } from '../lib/api'
import { PROPS_SANS_REMPLISSAGE } from '../lib/champSecret'

/**
 * Chercher un produit chez TOUS les fournisseurs reliés, d'un coup.
 *
 * **Le geste du sourcing n'est pas « ouvrir un catalogue ».** Demandé le
 * 16/09/2026 : « quand je clique sur écouteurs sans fil, je veux voir les
 * offres AliExpress, les offres CJ et les offres BigBuy ». On ne cherche pas
 * chez un fournisseur, on cherche un produit et on compare ce que chacun en
 * demande — c'est la comparaison qui est la décision. Une première version
 * imposait de choisir un fournisseur d'abord : elle faisait refaire la même
 * recherche trois fois et ne permettait jamais de comparer.
 *
 * **Chaque fournisseur porte son propre sort.** Une clé refusée chez l'un
 * n'efface pas les deux autres : sa colonne affiche le refus tel quel — et
 * « Invalid Token » dit quoi corriger, là où « erreur » ne dit rien. Un
 * fournisseur qui ne sait pas chercher le dit aussi, plutôt que de rendre
 * « aucun résultat » et de faire croire à un catalogue vide.
 *
 * **Rien n'est coché d'avance** : chaque import consomme un crédit d'annonce,
 * et soixante résultats cochés par défaut coûteraient soixante crédits au
 * premier clic distrait.
 *
 * ---
 *
 * **La page ne montrait pas ses catalogues** (refonte du 19/09/2026, demandée
 * par Max). Elle s'appelle « Catalogues connectés » et n'en nommait aucun :
 * les fournisseurs n'apparaissaient qu'en titre de section, et seulement s'ils
 * avaient répondu quelque chose. Un catalogue muet — clé révoquée, liaison
 * oubliée — était donc indiscernable d'un catalogue absent, et rien sur cette
 * page ne permettait de le débrancher. D'où la rangée de blocs en tête : un
 * par catalogue relié, son logo, son état, et le geste pour le détacher.
 *
 * **Et les trois entrées valaient d'être réunies.** Chercher par mots-clés,
 * surfer un rayon et regarder ce que les fournisseurs mettent en avant sont
 * trois façons de remplir le même tableau de résultats ; les rayons vivaient
 * pourtant au fond de la section d'un fournisseur, invisibles tant qu'on
 * n'avait pas fait défiler la page. Ils montent dans le bloc de recherche, à
 * côté du champ — un menu déroulant, les rayons groupés par fournisseur.
 *
 * ---
 *
 * **Refonte du 14/10/2026, demandée par Max.** Les statistiques fournisseurs
 * partent sur la page Fournisseurs, où elles vivent déjà. Le bloc de recherche
 * prend le menu « Tous mes fournisseurs » et le bouton « Comparer les offres »
 * de sa maquette. Les rayons viennent de l'API de CHAQUE fournisseur relié —
 * ils n'étaient rapportés que par BigBuy, d'où « aucun de vos catalogues ne se
 * parcourt par rayons » chez un vendeur relié à AliExpress et CJ. La case
 * Nouveautés interroge enfin le flux daté de chacun. Les offres arrivent dans
 * UNE liste, mélangée, chacune avec le nom du fournisseur qui la vend et son
 * bouton Importer — au tarif du catalogue connecté (`importCatalogue`).
 */
type Produit = Awaited<ReturnType<typeof api.supplierCatalog>>['fournisseurs'][number]['produits'][number]
type Bloc = Awaited<ReturnType<typeof api.supplierCatalog>>['fournisseurs'][number]
type Fournisseur = Awaited<ReturnType<typeof api.listSuppliers>>[number]
type Lien = Awaited<ReturnType<typeof api.listSupplierLinks>>[number]
/** Un rayon, et le fournisseur chez qui il existe : l'un sans l'autre ne s'ouvre pas. */
type Rayon = { supplier: string; supplierLabel: string; id: string; label: string }
/** Une offre dans la liste commune : le produit, et qui le vend. */
type Offre = Produit & { supplier: string; supplierLabel: string; cle: string }

/** Ce qui remplit la liste, et qui donc décide de son titre. */
type Mode = { sorte: 'nouveautes' } | { sorte: 'mots'; q: string } | { sorte: 'rayon'; rayon: Rayon }
/** L'ordre de la liste. « prix » est celui de « Comparer les offres ». */
type Tri = 'melange' | 'prix' | 'fournisseur'

const TRIS: Array<{ id: Tri; label: string }> = [
  { id: 'melange', label: 'Mélangées' },
  { id: 'prix', label: 'Prix le plus bas' },
  { id: 'fournisseur', label: 'Par fournisseur' },
]

const euros = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
const prixLisible = (p: Produit) =>
  p.prix === null
    ? 'prix inconnu'
    : p.devise === 'EUR'
      ? euros(p.prix)
      : `${p.prix.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.devise}`

/** An address reduced to what identifies the page: no query, no hash, no trailing slash. */
const adresse = (u: string) => u.split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase()
/** The longest run of digits in an address — the item id at AliExpress, CJ, BigBuy… */
const numero = (u: string) => (u.match(/\d{8,}/g) ?? []).sort((a, b) => b.length - a.length)[0] ?? null

/** Is this catalogue offer the very product the report pointed at? */
function estLeProduit(p: Produit, url: string) {
  if (p.url && adresse(p.url) === adresse(url)) return true
  if (p.ref.length >= 6 && url.includes(p.ref)) return true
  const n = numero(url)
  return Boolean(n && p.url && numero(p.url) === n)
}

/** A report title is a sentence; supplier search wants a few words. */
const raccourcir = (titre: string) =>
  titre
    .split(/[^\p{L}\p{N}]+/u)
    .filter((m) => m.length > 2)
    .slice(0, 5)
    .join(' ')

/** The last segment of a rayon label (« Maison › Cuisine » → « Cuisine »): what other suppliers can search. */
const motsDuRayon = (label: string) => label.split('›').pop()!.trim()

/**
 * Les offres de tous les blocs en une liste. Mélangées une à une (la première
 * de chacun, puis la deuxième…) : sans ça, le premier fournisseur à répondre
 * occuperait tout l'écran et les autres ne se verraient qu'en faisant défiler.
 */
function listeCommune(blocs: Bloc[], tri: Tri): Offre[] {
  const parBloc = blocs.map((b) =>
    b.produits.map((p) => ({ ...p, supplier: b.id, supplierLabel: b.label, cle: `${b.id}:${p.ref}` })),
  )
  if (tri === 'fournisseur') return parBloc.flat()
  const melange: Offre[] = []
  const longueur = Math.max(0, ...parBloc.map((l) => l.length))
  for (let i = 0; i < longueur; i++) for (const l of parBloc) if (l[i]) melange.push(l[i])
  if (tri === 'melange') return melange
  // Le prix en euros décide ; une offre sans prix comparable va au fond, jamais en tête.
  return [...melange].sort((a, b) => (a.prixEur ?? Infinity) - (b.prixEur ?? Infinity))
}

export default function CataloguesFournisseurs() {
  /*
   * « Voir chez nous » depuis un produit gagnant arrive ici avec le produit
   * (11/10/2026 : la page s'ouvrait sur la sélection du jour, et le vendeur
   * devait refaire la recherche lui-même). On cherche donc ce produit, on met
   * son fournisseur en tête et on encadre l'offre — ou on dit qu'elle n'y est
   * pas, avec de quoi l'importer sur place.
   */
  const [params] = useSearchParams()
  const cible = params.get('q')
    ? {
        titre: params.get('q')!,
        fournisseur: params.get('fournisseur'),
        url: params.get('url'),
        mode: params.get('import'),
      }
    : null
  const defile = useRef(false)
  const [importCible, setImportCible] = useState<'cours' | string | null>(null)
  const [blocs, setBlocs] = useState<Bloc[]>([])
  const [motsCles, setMotsCles] = useState('')
  const [chez, setChez] = useState('')
  const [mode, setMode] = useState<Mode>({ sorte: 'nouveautes' })
  const [tri, setTri] = useState<Tri>('melange')
  const [cherche, setCherche] = useState(true)
  const [coches, setCoches] = useState<Map<string, string>>(new Map())
  const [importe, setImporte] = useState(false)
  /** Ce que l'import d'une offre seule a donné, par offre. */
  const [unitaires, setUnitaires] = useState<Map<string, 'cours' | string>>(new Map())
  const [bilan, setBilan] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  /** Le tarif d'un import depuis cette page, lu dans la grille du serveur (jamais écrit ici). */
  const [tarif, setTarif] = useState<number | null>(null)

  // Les fiches d'annuaire (logo, domaine, couleur) et l'état des liaisons : la
  // réponse du catalogue ne porte ni l'un ni l'autre.
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [liens, setLiens] = useState<Lien[]>([])
  const [debranche, setDebranche] = useState<string | null>(null)

  /** Les rayons de chaque catalogue relié, et pour ceux qui n'en rendent pas, pourquoi. */
  const [rayons, setRayons] = useState<Rayon[]>([])
  const [rayonsLus, setRayonsLus] = useState(false)
  const [rayonsNotes, setRayonsNotes] = useState<Array<{ label: string; note: string }>>([])

  function chargerRayons() {
    api
      .supplierRayons()
      .then((r) => {
        setRayons(
          r.fournisseurs.flatMap((f) => f.rayons.map((x) => ({ supplier: f.id, supplierLabel: f.label, id: x.id, label: x.label }))),
        )
        setRayonsNotes(r.fournisseurs.filter((f) => f.note).map((f) => ({ label: f.label, note: f.note! })))
      })
      .catch(() => undefined)
      .finally(() => setRayonsLus(true))
  }

  /**
   * Remplit la liste. Un rayon interroge son fournisseur par l'arbre, et — si
   * le vendeur regarde « tous ses fournisseurs » — cherche le nom du rayon chez
   * les autres : c'est ainsi qu'un rayon se retrouve chez chacun d'eux.
   */
  async function interroger(m: Mode, fournisseur = chez) {
    setCherche(true)
    setBilan(null)
    setErreur(null)
    setCoches(new Map())
    try {
      let recus: Bloc[]
      if (m.sorte === 'rayon') {
        const [proprietaire, autres] = await Promise.all([
          api.supplierCatalog({ supplier: m.rayon.supplier, rayon: m.rayon.id }),
          fournisseur
            ? Promise.resolve({ fournisseurs: [] as Bloc[] })
            : api.supplierCatalog({ q: motsDuRayon(m.rayon.label), sauf: m.rayon.supplier }),
        ])
        recus = [...proprietaire.fournisseurs, ...autres.fournisseurs]
      } else {
        recus = (await api.supplierCatalog({ supplier: fournisseur, q: m.sorte === 'mots' ? m.q : '' })).fournisseurs
      }
      setBlocs(recus)
      return recus
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture des catalogues impossible')
      return null
    } finally {
      setCherche(false)
    }
  }

  const rechargerLiens = () => api.listSupplierLinks().then(setLiens).catch(() => undefined)

  useEffect(() => {
    api.listSuppliers().then(setFournisseurs).catch(() => undefined)
    api
      .listPlans()
      .then((p) => setTarif(p.tarifs.importCatalogue ?? null))
      .catch(() => undefined)
    rechargerLiens()
    chargerRayons()
    if (!cible) {
      interroger({ sorte: 'nouveautes' })
      return
    }
    // The full title first; if nobody answers, the same search in a few words.
    setMotsCles(cible.titre)
    setMode({ sorte: 'mots', q: cible.titre })
    ;(async () => {
      const r = await interroger({ sorte: 'mots', q: cible.titre })
      const court = raccourcir(cible.titre)
      if (r && !r.some((b) => b.produits.length) && court && court !== cible.titre) {
        setMotsCles(court)
        setMode({ sorte: 'mots', q: court })
        await interroger({ sorte: 'mots', q: court })
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Les catalogues à montrer en tête : les liaisons reliées, dans l'ordre de
   * l'annuaire. La fiche d'annuaire donne le logo ; la liaison donne l'état.
   */
  const catalogues = useMemo(
    () =>
      liens
        .filter((l) => l.connected)
        .map((l) => ({
          lien: l,
          fiche: fournisseurs.find((f) => f.id === l.supplier),
          bloc: blocs.find((b) => b.id === l.supplier),
        })),
    [liens, fournisseurs, blocs],
  )
  const nomDe = (id: string) => fournisseurs.find((f) => f.id === id)?.label ?? id

  /** Débrancher : les identifiants sont effacés, le catalogue se referme. */
  async function debrancher(id: string, label: string) {
    if (!window.confirm(`Débrancher ${label} ? Les identifiants seront effacés.`)) return
    setDebranche(id)
    try {
      await api.deleteSupplierLink(id)
      await rechargerLiens()
      // Ses offres ne doivent pas rester affichées sous un catalogue détaché.
      setBlocs((anciens) => anciens.filter((b) => b.id !== id))
      setRayons((anciens) => anciens.filter((r) => r.supplier !== id))
      setCoches((m) => new Map([...m].filter(([, supplier]) => supplier !== id)))
      if (chez === id) setChez('')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de débrancher ce fournisseur.')
    } finally {
      setDebranche(null)
    }
  }

  // The report's supplier first: that is the one the seller came to see.
  const blocsAffiches = cible?.fournisseur
    ? [...blocs].sort((a, b) => Number(b.id === cible.fournisseur) - Number(a.id === cible.fournisseur))
    : blocs
  const offres = useMemo(() => listeCommune(blocsAffiches, tri), [blocsAffiches, tri])
  const blocCible = cible?.fournisseur ? blocs.find((b) => b.id === cible.fournisseur) ?? null : null
  const retrouve = cible?.url ? offres.find((o) => estLeProduit(o, cible.url!))?.cle ?? null : null
  const comparables = offres.filter((o) => o.prixEur !== null)
  const silences = blocsAffiches.filter((b) => b.note)

  useEffect(() => {
    if (!retrouve || defile.current) return
    defile.current = true
    document.getElementById(`offre-${retrouve}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [retrouve])

  /** Not in the catalogue: import it from its own address, as the report list does. */
  async function importerCible() {
    if (!cible?.url) return
    setImportCible('cours')
    try {
      if (cible.mode === 'extension') {
        const r = await api.fileImportAjouter([
          { url: cible.url, titre: cible.titre, fournisseur: blocCible?.label, mode: 'extension', origine: 'catalogues' },
        ])
        setImportCible(r.ajoutes ? "Fiche envoyée à l'extension : importez-la depuis sa « File d'import du site »." : "Déjà dans la file de l'extension.")
      } else {
        const r = await api.importBatch([cible.url])
        setImportCible(
          r.imported ? 'Produit importé : il est dans vos annonces.' : r.results[0]?.error ?? "L'import a échoué.",
        )
      }
    } catch (e) {
      setImportCible(e instanceof Error ? e.message : "L'import a échoué.")
    }
  }

  /** Une offre seule, par son bouton Importer. */
  async function importerUne(o: Offre) {
    setUnitaires((m) => new Map(m).set(o.cle, 'cours'))
    let message: string
    try {
      const r = await api.importCatalogue(o.supplier, [o.ref])
      message = r.importes
        ? 'Importé : il est dans vos annonces, en brouillon.'
        : r.deja
          ? 'Déjà dans vos annonces : non refacturé.'
          : r.echecs[0]?.raison ?? "L'import a échoué."
    } catch (e) {
      message = e instanceof Error ? e.message : "L'import a échoué."
    }
    setUnitaires((m) => new Map(m).set(o.cle, message))
  }

  /*
   * L'import est groupé PAR FOURNISSEUR, parce que la référence n'a de sens que
   * chez le sien : deux fournisseurs peuvent porter le même identifiant pour
   * deux produits sans rapport. La clé de la sélection est donc « fournisseur:
   * référence », jamais la référence seule.
   */
  async function importer() {
    setImporte(true)
    setBilan(null)
    try {
      const parFournisseur = new Map<string, string[]>()
      for (const [cle, supplier] of coches) {
        const ref = cle.slice(supplier.length + 1)
        parFournisseur.set(supplier, [...(parFournisseur.get(supplier) ?? []), ref])
      }

      let importes = 0
      let deja = 0
      let echecs = 0
      for (const [supplier, refs] of parFournisseur) {
        const r = await api.importCatalogue(supplier, refs)
        importes += r.importes
        deja += r.deja
        echecs += r.echecs.length
      }

      const morceaux = [`${importes} annonce(s) importée(s)`]
      if (deja) morceaux.push(`${deja} déjà présente(s), non refacturée(s)`)
      if (echecs) morceaux.push(`${echecs} en échec`)
      setBilan(morceaux.join(' · '))
      setCoches(new Map())
    } catch (e) {
      setBilan(e instanceof Error ? e.message : "L'import a échoué")
    } finally {
      setImporte(false)
    }
  }

  function chercher(comparer: boolean) {
    const q = motsCles.trim()
    if (!q) {
      setErreur(comparer ? 'Tapez le produit dont vous voulez comparer les offres.' : 'Tapez le nom d’un produit.')
      return
    }
    const m: Mode = { sorte: 'mots', q }
    setMode(m)
    if (comparer) setTri('prix')
    interroger(m)
  }

  const rayonsVisibles = chez ? rayons.filter((r) => r.supplier === chez) : rayons
  const suffixeTarif = tarif !== null ? ` · ${tarif} drops` : ''

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Boxes size={22} className="text-[#E85290]" />
          <span>Catalogues connectés</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-[#B8C0D0]">
          Cherchez un produit chez tous vos fournisseurs reliés à la fois, comparez leurs offres et
          importez celle qui vous convient
          {tarif !== null ? <> : <b className="text-[#F5F7FA]">{tarif} drops</b> l'annonce, seule la recomposition par l'IA est facturée.</> : '.'}
        </p>
      </div>

      {/* ---------- 1. Les catalogues reliés ---------- */}
      <section className="case-ds p-4 sm:p-5">
        <h2 className="text-lg font-bold">Connectez vos catalogues.</h2>
        <p className="mt-0.5 text-xs text-[#B8C0D0]">
          Les fournisseurs reliés par leur API. Débranchez-en un, ou reliez-en un autre.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {catalogues.map(({ lien, fiche, bloc }) => (
            <CarteCatalogue
              key={lien.supplier}
              id={lien.supplier}
              label={fiche?.label ?? lien.supplier}
              color={fiche?.color}
              domain={fiche?.domain}
              offres={bloc?.produits.length ?? 0}
              occupe={debranche === lien.supplier}
              onDebrancher={() => debrancher(lien.supplier, fiche?.label ?? lien.supplier)}
            />
          ))}

          {/* En relier un de plus : la case vide dit où aller, là où une grille
              qui s'arrête laisse croire qu'il n'y a rien d'autre à brancher. */}
          <Link
            to="/fournisseurs"
            className="flex min-h-[7.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 p-4 text-center text-xs text-[#B8C0D0] transition hover:border-[#E85290]/60 hover:bg-white/[0.04] hover:text-white"
          >
            <Plus size={18} />
            <span>Relier un catalogue</span>
          </Link>
        </div>

        {!catalogues.length && !cherche ? (
          <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            Aucun fournisseur relié par API pour l'instant. Reliez-en un depuis la page{' '}
            <b>Fournisseurs</b> : AliExpress, CJ Dropshipping et BigBuy ouvrent leur catalogue.
          </p>
        ) : null}
      </section>

      {cible && !cherche && retrouve ? (
        <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Voici « {cible.titre} »{blocCible ? <> chez <b>{blocCible.label}</b></> : null}, encadré ci-dessous. Importez-le,
          ou comparez avec les offres des autres fournisseurs.
        </p>
      ) : null}

      {cible && !cherche && !retrouve && blocs.length ? (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p>
            « {cible.titre} » n'apparaît pas tel quel
            {blocCible ? <> chez <b>{blocCible.label}</b></> : ' dans vos catalogues'}
            {offres.length ? ' : voici les offres les plus proches.' : '.'}
          </p>
          {cible.url ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={importerCible}
                disabled={importCible === 'cours'}
                className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {importCible === 'cours' ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : cible.mode === 'extension' ? (
                  <Send size={12} />
                ) : (
                  <Download size={12} />
                )}
                {cible.mode === 'extension' ? "Envoyer ce produit à l'extension" : 'Importer ce produit · 12'}
              </button>
              <a
                href={cible.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:border-[#E85290]/50"
              >
                <ExternalLink size={12} /> Voir la fiche du fournisseur
              </a>
              {importCible && importCible !== 'cours' ? <span className="text-xs">{importCible}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ---------- 2. Chercher, comparer, parcourir ---------- */}
      <section className="case-ds mt-5 p-4 sm:p-5">
        <h2 className="text-lg font-bold">Cherchez un produit chez vos fournisseurs</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            chercher(false)
          }}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <label className="min-w-[14rem] flex-[2]">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#B8C0D0]">Nom du produit</span>
            <input
              {...PROPS_SANS_REMPLISSAGE}
              value={motsCles}
              onChange={(e) => setMotsCles(e.target.value)}
              placeholder="écouteurs sans fil, lampe de bureau, sac à dos…"
              className="w-full rounded-xl border border-white/10 bg-[#101321] px-3 py-2.5 text-sm outline-none focus:border-[#E85290]/70"
            />
          </label>
          <label className="min-w-[11rem] flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#B8C0D0]">Chez</span>
            <select
              value={chez}
              onChange={(e) => {
                const v = e.target.value
                setChez(v)
                // The list follows the menu; a rayon from another supplier no longer applies.
                const m: Mode = mode.sorte === 'rayon' && v && v !== mode.rayon.supplier ? { sorte: 'nouveautes' } : mode
                setMode(m)
                interroger(m, v)
              }}
              className="w-full rounded-xl border border-white/10 bg-[#101321] px-3 py-2.5 text-sm outline-none focus:border-[#E85290]/70"
            >
              <option value="">Tous mes fournisseurs</option>
              {catalogues.map(({ lien, fiche }) => (
                <option key={lien.supplier} value={lien.supplier}>
                  {fiche?.label ?? lien.supplier}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={cherche}
            className="btn-gradient inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {cherche && mode.sorte === 'mots' && tri !== 'prix' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            <span>Chercher</span>
          </button>
          {/* Comparer : la même recherche, classée par prix ramené en euros. */}
          <button
            type="button"
            onClick={() => chercher(true)}
            disabled={cherche}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[#E85290]/60 px-4 py-2.5 text-sm font-semibold text-[#F5F7FA] transition hover:bg-[#E85290]/15 disabled:opacity-40"
          >
            <Scale size={14} />
            <span>Comparer les offres</span>
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
          {/* Surfer un rayon. Groupés par fournisseur : le même libellé peut
              exister chez deux d'entre eux et ne désigne pas le même rayon. */}
          <label className="min-w-[14rem] flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#B8C0D0]">
              Ou surfez sur un rayon
            </span>
            <select
              value={mode.sorte === 'rayon' ? `${mode.rayon.supplier}:${mode.rayon.id}` : ''}
              disabled={!rayonsVisibles.length}
              onChange={(e) => {
                const choisi = rayons.find((r) => `${r.supplier}:${r.id}` === e.target.value)
                if (!choisi) return
                const m: Mode = { sorte: 'rayon', rayon: choisi }
                setMode(m)
                interroger(m)
              }}
              className="w-full rounded-xl border border-white/10 bg-[#101321] px-3 py-2.5 text-sm outline-none focus:border-[#E85290]/70 disabled:opacity-40"
            >
              <option value="">
                {rayonsVisibles.length
                  ? 'Choisissez un rayon…'
                  : rayonsLus
                    ? 'Aucun rayon rendu par vos catalogues'
                    : 'Lecture des rayons…'}
              </option>
              {[...new Set(rayonsVisibles.map((r) => r.supplier))].map((supplier) => (
                <optgroup key={supplier} label={rayonsVisibles.find((r) => r.supplier === supplier)!.supplierLabel}>
                  {rayonsVisibles
                    .filter((r) => r.supplier === supplier)
                    .map((r) => (
                      <option key={`${r.supplier}:${r.id}`} value={`${r.supplier}:${r.id}`}>
                        {r.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>

          {/* Les nouveautés : ce que chaque fournisseur vient de mettre en
              ligne, selon sa propre API. C'est aussi l'ouverture de la page. */}
          <button
            type="button"
            onClick={() => {
              setMotsCles('')
              const m: Mode = { sorte: 'nouveautes' }
              setMode(m)
              interroger(m)
            }}
            disabled={cherche}
            aria-pressed={mode.sorte === 'nouveautes'}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
              mode.sorte === 'nouveautes'
                ? 'border-transparent bg-gradient-to-r from-[#f28a4b] to-[#e85290] text-white'
                : 'border-white/15 text-[#B8C0D0] hover:bg-white/5 hover:text-white'
            }`}
          >
            <Sparkles size={14} />
            <span>Nouveautés</span>
          </button>
        </div>

        {rayonsLus && rayonsNotes.length ? (
          <p className="mt-2 text-[11px] text-[#B8C0D0]">
            {rayonsNotes.map((n) => `${n.label} : ${n.note}`).join(' · ')}
          </p>
        ) : null}
      </section>

      {bilan ? <p className="mt-3 text-sm text-emerald-300">{bilan}</p> : null}
      {erreur ? <p className="mt-3 text-sm text-red-400">{erreur}</p> : null}

      {/* Collante, pour que l'import groupé reste atteignable quel que soit
          l'endroit où on a coché. Sous la barre de titre du mobile (h-14, z-30). */}
      {coches.size ? (
        <div className="sticky top-16 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#E85290]/40 bg-[#191E2E] p-3 md:top-2">
          <span className="text-sm">{`${coches.size} produit(s) coché(s)`}</span>
          <button
            type="button"
            onClick={importer}
            disabled={importe}
            className="btn-gradient ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {importe ? <Loader2 size={14} className="animate-spin" /> : null}
            <span>
              Importer {coches.size} produit(s)
              {tarif !== null ? ` · ${coches.size * tarif} drops` : ''}
            </span>
          </button>
        </div>
      ) : null}

      {/* ---------- 3. La liste commune ---------- */}
      <section className="mt-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">
            {mode.sorte === 'nouveautes'
              ? 'Nouveautés chez vos fournisseurs'
              : mode.sorte === 'rayon'
                ? `Rayon « ${mode.rayon.label} »`
                : tri === 'prix'
                  ? `Comparaison pour « ${mode.q} »`
                  : `Résultats pour « ${mode.q} »`}
          </h2>
          <span className="text-xs text-[#B8C0D0]">{cherche ? 'lecture…' : `${offres.length} offre(s)`}</span>

          {/* Le tri, en un seul bloc de boutons (règle de Max du 14/10/2026). */}
          <div
            role="group"
            aria-label="Trier les offres"
            className="ml-auto inline-flex max-w-full flex-wrap overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
          >
            {TRIS.map((t, i) => {
              const actif = tri === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTri(t.id)}
                  aria-pressed={actif}
                  className={`${i < TRIS.length - 1 ? 'border-r border-white/10 ' : ''}inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold transition ${
                    actif ? 'bg-gradient-to-r from-[#f28a4b] to-[#e85290] text-white' : 'text-[#B8C0D0] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {t.id === 'prix' ? <ArrowDownWideNarrow size={13} /> : null}
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {mode.sorte === 'rayon' && !chez ? (
          <p className="mt-1 text-xs text-[#B8C0D0]">
            Le rayon chez {mode.rayon.supplierLabel}, et « {motsDuRayon(mode.rayon.label)} » cherché chez vos autres fournisseurs.
          </p>
        ) : null}

        {tri === 'prix' && comparables.length > 1 ? (
          <p className="mt-2 text-xs text-[#B8C0D0]">
            Du moins cher ({euros(comparables[0].prixEur!)}, {comparables[0].supplierLabel}) au plus cher (
            {euros(comparables[comparables.length - 1].prixEur!)}, {comparables[comparables.length - 1].supplierLabel}).
            Prix d'achat ramenés en euros au taux BCE du jour ; frais de port non compris.
          </p>
        ) : null}

        {cherche && !offres.length ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-[#B8C0D0]">
            <Loader2 size={14} className="animate-spin" /> Lecture des catalogues…
          </p>
        ) : null}

        {!cherche && !offres.length && blocs.length ? (
          <p className="mt-4 text-sm text-[#B8C0D0]">Aucune offre à afficher : la raison de chaque fournisseur est ci-dessous.</p>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {offres.map((o, rang) => {
            const coche = coches.has(o.cle)
            const cherchee = o.cle === retrouve
            const etat = unitaires.get(o.cle)
            return (
              <article
                key={o.cle}
                id={`offre-${o.cle}`}
                className={`case-ds flex flex-col p-3 transition ${coche ? '!border-[#E85290]/70' : ''} ${
                  cherchee ? 'ring-2 ring-emerald-400/70' : ''
                }`}
              >
                <div className="flex gap-3">
                  {o.image ? (
                    <img src={o.image} alt="" loading="lazy" className="size-20 shrink-0 rounded-lg bg-white/90 object-contain" />
                  ) : (
                    <span className="grid size-20 shrink-0 place-items-center rounded-lg bg-white/5 text-[10px] text-[#B8C0D0]">sans photo</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-[#F5F7FA]">
                        <PlatformLogo
                          id={o.supplier}
                          label={nomDe(o.supplier)}
                          color={fournisseurs.find((f) => f.id === o.supplier)?.color}
                          domain={fournisseurs.find((f) => f.id === o.supplier)?.domain}
                          size={14}
                          arrondi="md"
                        />
                        {o.supplierLabel}
                      </span>
                      {tri === 'prix' && o.prixEur !== null && rang === 0 ? (
                        <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">meilleur prix</span>
                      ) : null}
                      {cherchee ? (
                        <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">le produit du rapport</span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-snug text-[#F5F7FA]" title={o.titre}>
                      {o.titre}
                    </p>
                    <p className="mt-1 text-sm font-bold">
                      {prixLisible(o)}
                      {o.devise !== 'EUR' && o.prixEur !== null ? (
                        <span className="ml-1.5 text-xs font-normal text-[#B8C0D0]">≈ {euros(o.prixEur)}</span>
                      ) : null}
                    </p>
                    {o.entrepot ? (
                      <p className="mt-0.5 text-[10px] text-emerald-300">entrepôt {o.entrepot === 'europe' ? 'en Europe' : 'en Chine'}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[#B8C0D0]">
                    <input
                      type="checkbox"
                      checked={coche}
                      onChange={(e) =>
                        setCoches((m) => {
                          const n = new Map(m)
                          if (e.target.checked) n.set(o.cle, o.supplier)
                          else n.delete(o.cle)
                          return n
                        })
                      }
                      className="size-4 accent-[#E85290]"
                    />
                    <span>Cocher</span>
                  </label>
                  {o.url ? (
                    <a
                      href={o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#B8C0D0] hover:text-white"
                    >
                      <ExternalLink size={12} /> Voir
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => importerUne(o)}
                    disabled={etat === 'cours'}
                    className="btn-gradient ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {etat === 'cours' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    <span>Importer{suffixeTarif}</span>
                  </button>
                </div>
                {etat && etat !== 'cours' ? <p className="mt-2 text-[11px] text-[#B8C0D0]">{etat}</p> : null}
              </article>
            )
          })}
        </div>

        {/* Ce que chaque fournisseur a répondu quand il n'a rien rendu (ou rendu
            autre chose que demandé) : un catalogue muet ne doit pas passer pour vide. */}
        {!cherche && silences.length ? (
          <ul className="mt-4 space-y-1 text-xs text-amber-200">
            {silences.map((b) => (
              <li key={b.id}>
                <b>{b.label}</b> : {b.note}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* L'agent en charge de ce qui se décide ici : choisir un produit à
          sourcer est une question de marketing, et elle se pose devant les
          offres — pas après avoir quitté l'écran. */}
      <div className="mt-8">
        <AgentBar
          agentKey="marketing"
          nom="Laurence"
          emoji="📣"
          exemple="Demandez à Laurence : ce produit se vend-il encore en France ?"
        />
      </div>
    </Layout>
  )
}

/**
 * Un catalogue relié : son logo, son état, et le geste pour le détacher.
 *
 * L'état est vert et se lit de loin, parce que c'est la question qu'on vient
 * poser ici — « est-ce qu'il répond encore ? ». Il n'est pas cliquable : un
 * bouton qui ne fait rien se presse quand même, et la déception coûte plus
 * cher que la pastille n'aurait rapporté. Le seul geste de la carte est donc
 * « Débrancher », et il demande confirmation.
 */
function CarteCatalogue({
  id,
  label,
  color,
  domain,
  offres,
  occupe,
  onDebrancher,
}: {
  id: string
  label: string
  color?: string
  domain?: string | null
  /** Ses offres dans le tableau du moment : la carte dit ce qu'il vient de rendre. */
  offres: number
  occupe: boolean
  onDebrancher: () => void
}) {
  return (
    <div className="flex min-h-[7.5rem] flex-col items-center gap-2 rounded-2xl border border-white/10 bg-[#101321] p-4 text-center">
      <PlatformLogo id={id} label={label} color={color} domain={domain} size={36} />
      <p className="w-full truncate text-sm font-semibold" title={label}>
        {label}
      </p>

      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
        <Check size={11} />
        <span>Reliée</span>
      </span>

      <p className="text-[10px] text-[#B8C0D0]">{offres ? `${offres} offre(s) affichée(s)` : '—'}</p>

      <button
        type="button"
        onClick={onDebrancher}
        disabled={occupe}
        className="mt-auto inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-[#B8C0D0] transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-40"
      >
        {occupe ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />}
        <span>Débrancher</span>
      </button>
    </div>
  )
}
