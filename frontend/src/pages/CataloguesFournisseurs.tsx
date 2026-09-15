import { useEffect, useState } from 'react'
import { Boxes, Loader2, Search } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { PROPS_SANS_REMPLISSAGE } from '../lib/champSecret'

/**
 * Parcourir les catalogues des fournisseurs reliés, et importer depuis là.
 *
 * **Le trou que ça bouche.** La capacité vivait dans les connecteurs depuis des
 * semaines et n'était atteignable que de deux façons : en demandant à un chef
 * de rayon dans le chat, ou par l'enquête automatique. Aucun écran. Un vendeur
 * qui venait de relier CJ ne pouvait pas parcourir son catalogue — c'est-à-dire
 * exactement ce pour quoi il l'avait relié.
 *
 * **Ce qui ne sait pas chercher ne prétend pas chercher.** Les fournisseurs
 * n'ont pas les mêmes capacités et l'écran le dit : AliExpress cherche par
 * mots-clés, CJ aussi, BigBuy ni l'un ni l'autre. L'interroger dans le vide
 * rendrait « aucun résultat », ce qui ferait croire à un catalogue vide alors
 * que c'est notre connecteur qui ne sait pas demander.
 *
 * **Rien n'est coché d'avance.** Chaque import consomme un crédit d'annonce, et
 * une page de vingt résultats cochée par défaut coûterait vingt crédits au
 * premier clic distrait.
 */
type Fournisseur = { id: string; label: string; cherche: boolean; gagnants: boolean }
type Produit = {
  ref: string
  titre: string
  prix: number | null
  devise: string
  image: string | null
  url: string | null
  entrepot: 'europe' | 'chine' | null
}

export default function CataloguesFournisseurs() {
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])
  const [choisi, setChoisi] = useState<string>('')
  const [motsCles, setMotsCles] = useState('')
  const [produits, setProduits] = useState<Produit[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [cherche, setCherche] = useState(false)
  const [coches, setCoches] = useState<Set<string>>(new Set())
  const [importe, setImporte] = useState(false)
  const [bilan, setBilan] = useState<string | null>(null)

  async function interroger(supplier: string, q: string) {
    setCherche(true)
    setBilan(null)
    try {
      const r = await api.supplierCatalog(supplier, q)
      setFournisseurs(r.fournisseurs)
      if (r.choisi) setChoisi(r.choisi)
      setProduits(r.produits)
      setNote(r.note)
      setCoches(new Set())
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Lecture du catalogue impossible')
    } finally {
      setCherche(false)
    }
  }

  useEffect(() => {
    interroger('', '')
  }, [])

  const actif = fournisseurs.find((f) => f.id === choisi)

  async function importer() {
    setImporte(true)
    setBilan(null)
    try {
      const r = await api.importCatalogue(choisi, [...coches])
      const morceaux = [`${r.importes} annonce(s) importée(s)`]
      if (r.deja) morceaux.push(`${r.deja} déjà présente(s), non refacturée(s)`)
      if (r.echecs.length) morceaux.push(`${r.echecs.length} en échec`)
      setBilan(morceaux.join(' · '))
      setCoches(new Set())
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
          Cherchez directement dans le catalogue des fournisseurs que vous avez reliés, et importez
          ce qui vous intéresse — la fiche arrive réécrite, ses photos réhébergées et signées, sa
          catégorie posée. Pas besoin d'ouvrir leur site ni de coller la moindre adresse.
        </p>
      </div>

      {!fournisseurs.length && !cherche ? (
        <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Aucun fournisseur relié par API pour l'instant. Reliez-en un depuis{' '}
          <b>Sourcing › Fournisseurs</b> — AliExpress et CJ Dropshipping savent tous deux ouvrir leur
          catalogue.
        </p>
      ) : null}

      {fournisseurs.length ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {fournisseurs.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setChoisi(f.id)
                  interroger(f.id, motsCles)
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  f.id === choisi
                    ? 'border-purple-400/60 bg-purple-500/20 text-white'
                    : 'border-white/10 text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {f.label}
                {!f.cherche && !f.gagnants ? (
                  <span className="ml-1.5 text-[10px] text-gray-500">catalogue non lisible</span>
                ) : null}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              interroger(choisi, motsCles)
            }}
            className="mt-4 flex flex-wrap items-center gap-2"
          >
            <input
              {...PROPS_SANS_REMPLISSAGE}
              value={motsCles}
              onChange={(e) => setMotsCles(e.target.value)}
              placeholder={
                actif?.cherche
                  ? 'écouteurs sans fil, support de téléphone, lampe de bureau…'
                  : `${actif?.label ?? 'Ce fournisseur'} ne cherche pas par mots-clés`
              }
              disabled={!actif?.cherche}
              className="w-96 max-w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70 disabled:opacity-40"
            />
            <button
              disabled={cherche || !actif?.cherche}
              className="btn-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {cherche ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              <span>Chercher</span>
            </button>
            {actif?.gagnants ? (
              <button
                type="button"
                disabled={cherche}
                onClick={() => {
                  setMotsCles('')
                  interroger(choisi, '')
                }}
                className="rounded-lg border border-white/10 px-3 py-2.5 text-sm text-gray-300 hover:bg-white/5"
              >
                Ses meilleures ventes
              </button>
            ) : null}
          </form>

          {note ? <p className="mt-3 text-sm text-amber-200">{note}</p> : null}

          {produits.length ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                <button
                  onClick={() => setCoches(new Set(produits.map((p) => p.ref)))}
                  className="text-purple-300 underline hover:text-purple-200"
                >
                  Tout cocher
                </button>
                <button
                  onClick={() => setCoches(new Set())}
                  className="text-gray-400 underline hover:text-gray-200"
                >
                  Tout décocher
                </button>
                <span className="text-gray-500">{coches.size} sélectionné(s)</span>
                <button
                  onClick={importer}
                  disabled={importe || !coches.size}
                  className="btn-gradient ml-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {importe ? <Loader2 size={12} className="animate-spin" /> : null}
                  <span>Importer {coches.size || ''} produit(s)</span>
                </button>
              </div>

              {bilan ? <p className="mt-2 text-sm text-emerald-300">{bilan}</p> : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {produits.map((p) => {
                  const coche = coches.has(p.ref)
                  return (
                    <label
                      key={p.ref}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                        coche ? 'border-purple-400/60 bg-purple-500/10' : 'border-white/10 bg-white/[0.04]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={coche}
                        onChange={(e) =>
                          setCoches((s) => {
                            const n = new Set(s)
                            if (e.target.checked) n.add(p.ref)
                            else n.delete(p.ref)
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
            </>
          ) : null}
        </>
      ) : null}
    </Layout>
  )
}
