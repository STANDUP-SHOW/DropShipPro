import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, Check, Loader2, Plus, Search, Sparkles, Unplug } from 'lucide-react'
import { Layout } from '../components/Layout'
import { AgentBar } from '../components/AgentBar'
import { BlocSection } from '../components/stats/BlocSection'
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
 */
type Produit = {
  ref: string
  titre: string
  prix: number | null
  devise: string
  image: string | null
  url: string | null
  entrepot: 'europe' | 'chine' | null
}
type Bloc = {
  id: string
  label: string
  cherche: boolean
  gagnants: boolean
  rayons?: boolean
  rayonsDisponibles?: Array<{ id: string; label: string }>
  rayonChoisi?: string | null
  produits: Produit[]
  note: string | null
}
type Fournisseur = Awaited<ReturnType<typeof api.listSuppliers>>[number]
type Lien = Awaited<ReturnType<typeof api.listSupplierLinks>>[number]
/** Un rayon, et le fournisseur chez qui il existe : l'un sans l'autre ne s'ouvre pas. */
type Rayon = { supplier: string; supplierLabel: string; id: string; label: string }

/** Ce qui remplit le tableau de résultats, et qui donc décide de son titre. */
type Mode = { sorte: 'nouveautes' } | { sorte: 'mots'; q: string } | { sorte: 'rayon'; rayon: Rayon }

export default function CataloguesFournisseurs() {
  const [blocs, setBlocs] = useState<Bloc[]>([])
  const [motsCles, setMotsCles] = useState('')
  const [mode, setMode] = useState<Mode>({ sorte: 'nouveautes' })
  const [cherche, setCherche] = useState(true)
  const [coches, setCoches] = useState<Map<string, string>>(new Map())
  const [importe, setImporte] = useState(false)
  const [bilan, setBilan] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  // Les fiches d'annuaire (logo, domaine, couleur) et l'état des liaisons : la
  // réponse du catalogue ne porte ni l'un ni l'autre.
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [liens, setLiens] = useState<Lien[]>([])
  const [debranche, setDebranche] = useState<string | null>(null)

  /*
   * Les rayons sont ACCUMULÉS, jamais remplacés.
   *
   * Ils n'arrivent que dans la réponse du fournisseur qui les expose, et une
   * recherche par mots-clés peut très bien ne pas la rapporter. Vider la liste
   * à chaque réponse ferait clignoter le menu déroulant — et disparaître, au
   * moment précis où on vient de s'en servir, la seule façon de parcourir
   * BigBuy.
   */
  const [rayons, setRayons] = useState<Rayon[]>([])

  function retenirRayons(recus: Bloc[]) {
    setRayons((anciens) => {
      const connus = new Map(anciens.map((r) => [`${r.supplier}:${r.id}`, r]))
      for (const b of recus)
        for (const r of b.rayonsDisponibles ?? [])
          connus.set(`${b.id}:${r.id}`, { supplier: b.id, supplierLabel: b.label, id: r.id, label: r.label })
      return [...connus.values()]
    })
  }

  async function interroger(q: string, rayon?: { supplier: string; id: string }) {
    setCherche(true)
    setBilan(null)
    setErreur(null)
    try {
      const r = await api.supplierCatalog(rayon?.supplier ?? '', q, rayon?.id)
      retenirRayons(r.fournisseurs)
      /*
       * Un rayon ne recharge QUE son fournisseur : recharger tout le monde
       * effacerait les résultats que le vendeur est en train de comparer, ce
       * qui est précisément ce qu'il est venu faire ici.
       */
      setBlocs((anciens) =>
        rayon ? anciens.map((b) => r.fournisseurs.find((n) => n.id === b.id) ?? b) : r.fournisseurs,
      )
      if (!rayon) setCoches(new Map())
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture des catalogues impossible')
    } finally {
      setCherche(false)
    }
  }

  const rechargerLiens = () => api.listSupplierLinks().then(setLiens).catch(() => undefined)

  useEffect(() => {
    interroger('')
    api.listSuppliers().then(setFournisseurs).catch(() => undefined)
    rechargerLiens()
  }, [])

  const total = blocs.reduce((n, b) => n + b.produits.length, 0)

  /**
   * Les catalogues à montrer en tête : les liaisons reliées, dans l'ordre de
   * l'annuaire. La fiche d'annuaire donne le logo ; la liaison donne l'état.
   * Un fournisseur relié dont la fiche manquerait garde quand même son bloc —
   * il est relié, c'est le fait qui compte ici.
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
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de débrancher ce fournisseur.')
    } finally {
      setDebranche(null)
    }
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

  return (
    <Layout>
      {/* Le bloc « Fournisseurs » du tableau de bord, en tête : même adresse,
          même calcul, donc jamais deux chiffres différents selon l'écran. */}
      <BlocSection id="fournisseurs" />

      {/* L'agent en charge de ce qui se decide ici : choisir un produit à
          sourcer est une question de marketing, et elle se pose devant les
          offres — pas après avoir quitté l'écran pour aller la poser. */}
      <AgentBar
        agentKey="marketing"
        nom="Laurence"
        emoji="📣"
        exemple="Demandez à Laurence : ce produit se vend-il encore en France ?"
      />

      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Boxes size={22} className="text-purple-300" />
          <span>Catalogues connectés</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          Un mot-clé, et vous voyez ce que <b>chacun</b> de vos fournisseurs propose pour ce
          produit — avec son prix d'achat. Cochez ce qui vous intéresse, chez l'un ou chez plusieurs :
          la fiche arrive réécrite, ses photos réhébergées et signées, sa catégorie posée.
        </p>
      </div>

      {/* ---------- 1. Les catalogues reliés, quatre par ligne ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
          className="flex min-h-[7.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 p-4 text-center text-xs text-gray-400 transition hover:border-purple-400/50 hover:bg-white/[0.04] hover:text-white"
        >
          <Plus size={18} />
          <span>Relier un catalogue</span>
        </Link>
      </div>

      {!catalogues.length && !cherche ? (
        <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Aucun fournisseur relié par API pour l'instant. Reliez-en un depuis{' '}
          <b>Sourcing › Fournisseurs</b> — AliExpress et CJ Dropshipping savent tous deux ouvrir leur
          catalogue.
        </p>
      ) : null}

      {/* ---------- 2. Le bloc de recherche : trois entrées, un seul tableau ---------- */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setMode({ sorte: 'mots', q: motsCles.trim() })
            interroger(motsCles)
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              Cherchez un produit
            </span>
            <input
              {...PROPS_SANS_REMPLISSAGE}
              value={motsCles}
              onChange={(e) => setMotsCles(e.target.value)}
              placeholder="écouteurs sans fil, support de téléphone, lampe de bureau…"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
            />
          </label>
          <button
            disabled={cherche}
            className="btn-gradient mt-5 inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {cherche ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            <span>Chercher chez tous</span>
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
          {/* Surfer un rayon, sans mots-clés. Les rayons sont groupés par
              fournisseur : le même libellé peut exister chez deux d'entre eux
              et ne désigne pas le même rayon. */}
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              Ou surfez sur un rayon
            </span>
            <select
              value={mode.sorte === 'rayon' ? `${mode.rayon.supplier}:${mode.rayon.id}` : ''}
              disabled={!rayons.length}
              onChange={(e) => {
                const choisi = rayons.find((r) => `${r.supplier}:${r.id}` === e.target.value)
                if (!choisi) return
                setMode({ sorte: 'rayon', rayon: choisi })
                interroger('', { supplier: choisi.supplier, id: choisi.id })
              }}
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70 disabled:opacity-40"
            >
              <option value="">
                {rayons.length ? 'Catégories…' : 'Aucun de vos catalogues ne se parcourt par rayons'}
              </option>
              {[...new Set(rayons.map((r) => r.supplier))].map((supplier) => (
                <optgroup
                  key={supplier}
                  label={rayons.find((r) => r.supplier === supplier)!.supplierLabel}
                >
                  {rayons
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

          {/* Les nouveautés : ce que les fournisseurs mettent en avant EUX-MÊMES
              (leur flux « meilleures ventes »), pas un classement de notre
              invention. C'est aussi ce que la page affiche à l'ouverture. */}
          <button
            type="button"
            onClick={() => {
              setMotsCles('')
              setMode({ sorte: 'nouveautes' })
              interroger('')
            }}
            disabled={cherche}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${
              mode.sorte === 'nouveautes'
                ? 'border-purple-400/60 bg-purple-500/20 text-white'
                : 'border-white/15 text-gray-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Sparkles size={14} />
            <span>Nouveautés</span>
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          {mode.sorte === 'nouveautes'
            ? 'Nouveautés : ce que vos fournisseurs mettent en avant en ce moment.'
            : mode.sorte === 'rayon'
              ? `Rayon « ${mode.rayon.label} » chez ${mode.rayon.supplierLabel}.`
              : `Résultats pour « ${mode.q} », chez tous vos catalogues à la fois.`}
        </p>
      </section>

      {bilan ? <p className="mt-3 text-sm text-emerald-300">{bilan}</p> : null}
      {erreur ? <p className="mt-3 text-sm text-red-400">{erreur}</p> : null}

      {/* Collante, pour que le bouton d'import reste atteignable quel que soit
          l'endroit où on a coché. En dessous de la barre de titre du mobile
          (h-14, z-30), sinon elle passe DERRIÈRE et disparaît. */}
      {coches.size ? (
        <div className="sticky top-16 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-purple-400/40 bg-[#1b1633] p-3 md:top-2">
          <span className="text-sm">{`${coches.size} produit(s) coché(s)`}</span>
          <button
            type="button"
            onClick={importer}
            disabled={importe}
            className="btn-gradient ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {importe ? <Loader2 size={14} className="animate-spin" /> : null}
            <span>Importer {coches.size} produit(s)</span>
          </button>
        </div>
      ) : null}

      {mode.sorte === 'mots' && mode.q && !cherche && blocs.length && total === 0 ? (
        <p className="mt-4 text-sm text-gray-400">
          Aucun de vos fournisseurs n'a de résultat pour « {mode.q} ».
        </p>
      ) : null}

      {/* ---------- 3. Les offres, fournisseur par fournisseur ---------- */}
      <div className="mt-6 space-y-6">
        {blocs.map((b) => (
          <section key={b.id}>
            <h2 className="flex items-baseline gap-2 font-bold">
              <span>{b.label}</span>
              <span className="text-xs font-normal text-gray-500">
                {b.produits.length
                  ? `${b.produits.length} offre(s)`
                  : b.rayonsDisponibles?.length
                    ? 'se parcourt par rayons'
                    : ''}
              </span>
            </h2>
            {b.note ? <p className="mt-1 text-xs text-amber-200">{b.note}</p> : null}

            {b.produits.length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {b.produits.map((p) => {
                  const cle = `${b.id}:${p.ref}`
                  const coche = coches.has(cle)
                  return (
                    <label
                      key={cle}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                        coche ? 'border-purple-400/60 bg-purple-500/10' : 'border-white/10 bg-white/[0.04]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={coche}
                        onChange={(e) =>
                          setCoches((m) => {
                            const n = new Map(m)
                            if (e.target.checked) n.set(cle, b.id)
                            else n.delete(cle)
                            return n
                          })
                        }
                        className="mt-1 size-4 shrink-0 accent-purple-500"
                      />
                      {p.image ? (
                        <img
                          src={p.image}
                          alt=""
                          loading="lazy"
                          className="size-16 shrink-0 rounded-lg bg-white/90 object-contain"
                        />
                      ) : (
                        <span className="size-16 shrink-0 rounded-lg bg-white/5" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-3 block text-xs leading-snug">{p.titre}</span>
                        <span className="mt-1 block text-sm font-bold">
                          {p.prix !== null ? `${p.prix.toFixed(2)} ${p.devise}` : 'prix inconnu'}
                        </span>
                        {p.entrepot ? (
                          <span className="mt-0.5 block text-[10px] text-emerald-300">
                            entrepôt {p.entrepot}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : null}
          </section>
        ))}
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
    <div className="flex min-h-[7.5rem] flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
      <PlatformLogo id={id} label={label} color={color} domain={domain} size={36} />
      <p className="w-full truncate text-sm font-semibold" title={label}>
        {label}
      </p>

      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
        <Check size={11} />
        <span>Reliée</span>
      </span>

      <p className="text-[10px] text-gray-500">{offres ? `${offres} offre(s) affichée(s)` : '—'}</p>

      <button
        type="button"
        onClick={onDebrancher}
        disabled={occupe}
        className="mt-auto inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-gray-400 transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-40"
      >
        {occupe ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />}
        <span>Débrancher</span>
      </button>
    </div>
  )
}
