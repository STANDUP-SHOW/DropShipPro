import { useEffect, useState } from 'react'
import { Boxes, Loader2, Search } from 'lucide-react'
import { Layout } from '../components/Layout'
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

export default function CataloguesFournisseurs() {
  const [blocs, setBlocs] = useState<Bloc[]>([])
  const [motsCles, setMotsCles] = useState('')
  const [cherche, setCherche] = useState(true)
  const [coches, setCoches] = useState<Map<string, string>>(new Map())
  const [importe, setImporte] = useState(false)
  const [bilan, setBilan] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  async function interroger(q: string, rayon?: { supplier: string; id: string }) {
    setCherche(true)
    setBilan(null)
    setErreur(null)
    try {
      const r = await api.supplierCatalog(rayon?.supplier ?? '', q, rayon?.id)
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

  useEffect(() => {
    interroger('')
  }, [])

  const total = blocs.reduce((n, b) => n + b.produits.length, 0)

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
      <div className="mb-6">
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

      <form
        onSubmit={(e) => {
          e.preventDefault()
          interroger(motsCles)
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          {...PROPS_SANS_REMPLISSAGE}
          value={motsCles}
          onChange={(e) => setMotsCles(e.target.value)}
          placeholder="écouteurs sans fil, support de téléphone, lampe de bureau…"
          className="w-96 max-w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
        />
        <button
          disabled={cherche}
          className="btn-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {cherche ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          <span>Chercher chez tous</span>
        </button>
        {coches.size ? (
          <button
            type="button"
            onClick={importer}
            disabled={importe}
            className="btn-gradient ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {importe ? <Loader2 size={14} className="animate-spin" /> : null}
            <span>Importer {coches.size} produit(s)</span>
          </button>
        ) : null}
      </form>

      {bilan ? <p className="mt-3 text-sm text-emerald-300">{bilan}</p> : null}
      {erreur ? <p className="mt-3 text-sm text-red-400">{erreur}</p> : null}

      {!blocs.length && !cherche ? (
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Aucun fournisseur relié par API pour l'instant. Reliez-en un depuis{' '}
          <b>Sourcing › Fournisseurs</b> — AliExpress et CJ Dropshipping savent tous deux ouvrir leur
          catalogue.
        </p>
      ) : null}

      {motsCles && !cherche && blocs.length && total === 0 ? (
        <p className="mt-4 text-sm text-gray-400">
          Aucun de vos fournisseurs n'a de résultat pour « {motsCles} ».
        </p>
      ) : null}

      <div className="mt-6 space-y-6">
        {blocs.map((b) => (
          <section key={b.id}>
            <h2 className="flex items-baseline gap-2 font-bold">
              <span>{b.label}</span>
              <span className="text-xs font-normal text-gray-500">
                {b.produits.length ? `${b.produits.length} offre(s)` : b.cherche ? '' : 'catalogue non lisible'}
              </span>
            </h2>
            {b.note ? <p className="mt-1 text-xs text-amber-200">{b.note}</p> : null}

            {/* Les rayons, pour un fournisseur qui ne sait pas chercher. */}
            {b.rayonsDisponibles?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {b.rayonsDisponibles.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => interroger(motsCles, { supplier: b.id, id: r.id })}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                      r.id === b.rayonChoisi
                        ? 'border-purple-400/60 bg-purple-500/20 text-white'
                        : 'border-white/10 text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            ) : null}

            {b.produits.length ? (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
