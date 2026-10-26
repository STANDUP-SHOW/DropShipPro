import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, Loader2, PackagePlus, Scale, Search, Store } from 'lucide-react'
import { Layout } from '../../components/Layout'
import { PlatformLogo } from '../../components/PlatformLogo'
import { BesoinDesktop, EntetePower, NavigateurIntegre } from '../../components/desktop/DesktopPower'
import { api } from '../../lib/api'
import { pont, type EtatNavigateur, type OffreRassemblee } from '../../lib/desktopPower'

type Bloc = Awaited<ReturnType<typeof api.supplierCatalog>>['fournisseurs'][number]
type Produit = Bloc['produits'][number] & { fournisseur: string; fournisseurNom: string; web?: boolean }

/** Où en est la recherche dans l'application, fournisseur par fournisseur. */
type Rassemblement = { etat: 'attente' | 'en-cours' | 'ok' | 'blocage' | 'erreur'; message?: string; produits: Produit[] }

/**
 * Les fournisseurs de SmartMarket. `api` : le catalogue se lit par l'API du
 * vendeur (services/supplierConnectors.ts, CONNECTEURS). Les autres n'ont pas
 * d'API produits ouverte : leur vraie page de recherche s'ouvre dans le
 * navigateur intégré de l'application. Les adresses de recherche sont celles
 * que ces sites utilisent eux-mêmes ; CJ et BigBuy passent par leur API.
 */
const FOURNISSEURS = [
  { id: 'aliexpress', nom: 'AliExpress', domaine: 'aliexpress.com', api: true, recherche: (q: string) => `https://fr.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}` },
  { id: 'cj', nom: 'CJ Dropshipping', domaine: 'cjdropshipping.com', api: true, recherche: null },
  { id: 'bigbuy', nom: 'BigBuy', domaine: 'bigbuy.eu', api: true, recherche: null },
  { id: 'temu', nom: 'Temu', domaine: 'temu.com', api: false, recherche: (q: string) => `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(q)}` },
  { id: 'alibaba', nom: 'Alibaba', domaine: 'alibaba.com', api: false, recherche: (q: string) => `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(q)}` },
  { id: 'shein', nom: 'Shein', domaine: 'shein.com', api: false, recherche: (q: string) => `https://fr.shein.com/pdsearch/${encodeURIComponent(q)}/` },
] as const

type IdFournisseur = (typeof FOURNISSEURS)[number]['id']

const euros = (n: number | null) => (n == null ? '—' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }))

/**
 * SmartMarket (DESKTOP POWER, 24/10/2026) : chercher un produit chez plusieurs
 * fournisseurs à la fois, importer d'un clic, comparer les offres cochées.
 *
 * Voie hybride (choix de Max, 26/10/2026) : les fournisseurs à API (AliExpress,
 * CJ, BigBuy, reliés par le vendeur) répondent par leur API ; Temu, Alibaba,
 * Shein (et AliExpress non relié) sont cherchés par le rassembleur de
 * l'application, sur leur propre page de recherche, dans la session du vendeur
 * (desktop/lib/rassembleur.js). Au premier signe de vérification anti-robot, il
 * s'arrête et ouvre la recherche dans le navigateur intégré : le vendeur la
 * règle lui-même. Jamais de contournement.
 */
export default function SmartMarket() {
  const p = pont()
  const [choisis, setChoisis] = useState<Set<IdFournisseur>>(new Set(['aliexpress', 'temu']))
  const [q, setQ] = useState('')
  const [cherche, setCherche] = useState('')
  const [blocs, setBlocs] = useState<Bloc[] | null>(null)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [compare, setCompare] = useState<Map<string, Produit>>(new Map())
  const [tableau, setTableau] = useState(false)
  const [importes, setImportes] = useState<Record<string, string>>({})
  const [web, setWeb] = useState<IdFournisseur | null>(null)
  const [etatNav, setEtatNav] = useState<EtatNavigateur | null>(null)
  const [messageWeb, setMessageWeb] = useState<string | null>(null)
  const [rassembles, setRassembles] = useState<Partial<Record<IdFournisseur, Rassemblement>>>({})

  const tous = choisis.size === FOURNISSEURS.length
  const basculer = (id: IdFournisseur) =>
    setChoisis((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // Le rassembleur, un fournisseur après l'autre (l'application n'en lit qu'un à la fois).
  const rassembler = async (ids: IdFournisseur[], mots: string) => {
    if (!p || !ids.length) return
    setRassembles((r) => ({ ...r, ...Object.fromEntries(ids.map((id) => [id, { etat: 'attente', produits: [] }])) }))
    for (const id of ids) {
      const f = FOURNISSEURS.find((x) => x.id === id)!
      setRassembles((r) => ({ ...r, [id]: { etat: 'en-cours', produits: [] } }))
      const r = await p.rassembler({ fournisseur: id, q: mots }).catch((e: Error) => ({ ok: false, erreur: e.message }) as Awaited<ReturnType<typeof p.rassembler>>)
      const produitsWeb: Produit[] = (r.produits ?? []).map((o: OffreRassemblee) => ({ ...o, prix: o.prixEur, devise: 'EUR', fournisseur: id, fournisseurNom: f.nom, web: true }))
      setRassembles((m) => ({
        ...m,
        [id]: r.ok
          ? { etat: 'ok', produits: produitsWeb, message: produitsWeb.length ? undefined : 'aucune offre lisible sur la page de résultats' }
          : { etat: r.blocage ? 'blocage' : 'erreur', message: r.erreur, produits: [] },
      }))
      // Une vérification anti-robot : la recherche s'ouvre dans le navigateur, le vendeur la règle lui-même.
      if (r.blocage) {
        setWeb(id)
        break
      }
    }
  }

  const lancer = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const mots = q.trim()
    if (!mots) return
    setCherche(mots)
    setErreur(null)
    setTableau(false)
    setRassembles({})
    const sansApi = FOURNISSEURS.filter((f) => !f.api && choisis.has(f.id)).map((f) => f.id)
    if (!p && sansApi.length && !web) setWeb(sansApi[0])
    let reliesApi = new Set<string>()
    if (FOURNISSEURS.some((f) => f.api && choisis.has(f.id))) {
      setChargement(true)
      try {
        const r = await api.supplierCatalog({ q: mots })
        setBlocs(r.fournisseurs)
        reliesApi = new Set(r.fournisseurs.map((b) => b.id))
      } catch (err) {
        setErreur((err as Error).message)
        setBlocs([])
      } finally {
        setChargement(false)
      }
    } else setBlocs([])
    // AliExpress non relié : le rassembleur le cherche aussi, comme les fournisseurs sans API.
    const parAppli = [...sansApi, ...(choisis.has('aliexpress') && !reliesApi.has('aliexpress') ? (['aliexpress'] as IdFournisseur[]) : [])]
    await rassembler(parAppli, mots)
  }

  const produits: Produit[] = useMemo(
    () =>
      (blocs ?? [])
        .filter((b) => choisis.has(b.id as IdFournisseur))
        .flatMap((b) => b.produits.map((x) => ({ ...x, fournisseur: b.id, fournisseurNom: b.label } as Produit)))
        .concat(FOURNISSEURS.filter((f) => choisis.has(f.id)).flatMap((f) => rassembles[f.id]?.produits ?? [])),
    [blocs, choisis, rassembles],
  )
  const relies = new Set((blocs ?? []).map((b) => b.id))

  const importer = async (x: Produit) => {
    const cle = `${x.fournisseur}:${x.ref}`
    setImportes((m) => ({ ...m, [cle]: '…' }))
    try {
      if (x.web) {
        // Lue dans l'application (Temu, Shein…), comme « Importer cette fiche ».
        if (!p || !x.url) throw new Error('Ouvrez l’application desktop.')
        const r = await p.importer({ url: x.url })
        setImportes((m) => ({ ...m, [cle]: r.ok ? 'Importé' : r.erreur || 'Refusé' }))
        return
      }
      const r = await api.importCatalogue(x.fournisseur, [x.ref])
      setImportes((m) => ({ ...m, [cle]: r.importes ? 'Importé' : r.deja ? 'Déjà importé' : r.echecs[0]?.raison || 'Refusé' }))
    } catch (err) {
      setImportes((m) => ({ ...m, [cle]: (err as Error).message }))
    }
  }

  const cocher = (x: Produit) =>
    setCompare((m) => {
      const n = new Map(m)
      const cle = `${x.fournisseur}:${x.ref}`
      if (n.has(cle)) n.delete(cle)
      else n.set(cle, x)
      return n
    })

  const fWeb = FOURNISSEURS.find((f) => f.id === web)
  const urlWeb = fWeb && fWeb.recherche && cherche ? fWeb.recherche(cherche) : undefined
  const surFiche = Boolean(etatNav?.url && fWeb && !/search|wholesale|pdsearch/i.test(etatNav.url))

  const comparees = [...compare.values()].sort((a, b) => (a.prixEur ?? Infinity) - (b.prixEur ?? Infinity))

  return (
    <Layout>
      <EntetePower
        icone={Store}
        titre="SMARTMARKET"
        chapo="Cherchez un produit chez plusieurs fournisseurs à la fois. AliExpress, CJ et BigBuy répondent par leur API (reliez-les dans Catalogues connectés) ; Temu, Alibaba et Shein sont lus par l'application, sur leur propre page de recherche, dans votre session. Cochez des offres et comparez-les."
      />

      <section className="case-ds p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setChoisis(tous ? new Set() : new Set(FOURNISSEURS.map((f) => f.id)))}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${tous ? 'border-[var(--marque-rose)] bg-[var(--marque-rose)]/15 text-white' : 'border-[var(--trait)] text-gray-300'}`}
          >
            Tous
          </button>
          {FOURNISSEURS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => basculer(f.id)}
              aria-pressed={choisis.has(f.id)}
              className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition ${choisis.has(f.id) ? 'border-[var(--marque-rose)] bg-[var(--marque-rose)]/15 text-white' : 'border-[var(--trait)] text-gray-400 hover:text-white'}`}
            >
              <PlatformLogo id={f.id} label={f.nom} domain={f.domaine} size={24} arrondi="md" />
              {f.nom}
              {choisis.has(f.id) ? <Check size={12} /> : null}
            </button>
          ))}
        </div>
        <form onSubmit={lancer} className="mt-3 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Un produit, ou une catégorie : mini pc, lampe de chevet…"
            className="flex-1 rounded-lg border border-[var(--trait)] bg-[var(--nuit)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--marque-rose)]"
          />
          <button type="submit" className="btn-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold">
            <Search size={15} /> Chercher
          </button>
        </form>
        {compare.size ? (
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-300">
            <span>{compare.size} offre(s) cochée(s)</span>
            <button type="button" onClick={() => setTableau(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--marque-rose)] px-3 py-1.5 font-bold text-white">
              <Scale size={14} /> Comparer
            </button>
            <button type="button" onClick={() => setCompare(new Map())} className="text-gray-500 underline">
              Vider
            </button>
          </div>
        ) : null}
      </section>

      {tableau && comparees.length ? (
        <section className="case-ds mt-4 overflow-x-auto p-4">
          <h2 className="mb-2 text-sm font-bold">Tableau comparatif</h2>
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1.5">Fournisseur</th>
                <th>Offre</th>
                <th>Prix (€, taux BCE du jour)</th>
                <th>Entrepôt</th>
                <th>Écart au moins cher</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {comparees.map((x) => (
                <tr key={`${x.fournisseur}:${x.ref}`} className="border-t border-[var(--trait)]">
                  <td className="py-2 font-semibold">{x.fournisseurNom}</td>
                  <td className="max-w-[280px] truncate">{x.titre}</td>
                  <td>{euros(x.prixEur)}</td>
                  <td>{x.entrepot === 'europe' ? 'Europe' : x.entrepot === 'chine' ? 'Chine' : 'Non dit'}</td>
                  <td>{x.prixEur != null && comparees[0].prixEur != null ? (x.prixEur === comparees[0].prixEur ? 'le moins cher' : `+ ${euros(x.prixEur - comparees[0].prixEur)}`) : '—'}</td>
                  <td>{x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline"><ExternalLink size={12} /> fiche</a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-gray-500">Ce sont les offres que vous avez cochées : rien ne dit qu'elles sont strictement le même produit. Le port n'est pas compris quand l'API ne le donne pas.</p>
        </section>
      ) : null}

      {chargement ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={14} className="animate-spin" /> Recherche chez vos fournisseurs reliés…
        </p>
      ) : null}
      {erreur ? <p className="mt-4 text-xs text-red-300">{erreur}</p> : null}
      {Object.keys(rassembles).length ? (
        <ul className="mt-3 space-y-1 text-xs">
          {FOURNISSEURS.filter((f) => rassembles[f.id]).map((f) => {
            const r = rassembles[f.id]!
            return (
              <li key={f.id} className={r.etat === 'blocage' ? 'text-amber-200' : r.etat === 'erreur' ? 'text-red-300' : 'text-gray-400'}>
                {r.etat === 'en-cours' ? <Loader2 size={12} className="mr-1 inline animate-spin" /> : null}
                {f.nom} (lu par l'application) :{' '}
                {r.etat === 'attente' ? 'en file' : r.etat === 'en-cours' ? 'lecture de la page de recherche…' : r.etat === 'ok' ? r.message || `${r.produits.length} offre(s)` : r.message}
              </li>
            )
          })}
        </ul>
      ) : null}

      {blocs ? (
        <>
          {FOURNISSEURS.filter((f) => f.api && choisis.has(f.id) && !relies.has(f.id) && !rassembles[f.id]).map((f) => (
            <p key={f.id} className="mt-3 text-xs text-gray-400">
              {f.nom} n'est pas relié à votre compte :{' '}
              <Link to="/catalogues" className="underline hover:text-white">reliez-le dans Catalogues connectés</Link>
              {f.recherche ? ' ou cherchez-le dans le navigateur ci-dessous.' : '.'}
            </p>
          ))}
          {(blocs ?? []).filter((b) => b.note && choisis.has(b.id as IdFournisseur)).map((b) => (
            <p key={`note-${b.id}`} className="mt-2 text-[11px] text-amber-200">
              {b.label} : {b.note}
            </p>
          ))}
          {produits.length ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {produits.map((x) => {
                const cle = `${x.fournisseur}:${x.ref}`
                return (
                  <article key={cle} className="case-ds flex flex-col overflow-hidden">
                    {x.image ? <img src={x.image} alt="" loading="lazy" className="aspect-square w-full bg-white object-contain" /> : null}
                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--marque-rose)]">{x.fournisseurNom}</span>
                      <h3 className="line-clamp-2 text-xs font-semibold">{x.titre}</h3>
                      <p className="text-sm font-extrabold">{euros(x.prixEur)}</p>
                      <div className="mt-auto flex items-center gap-2">
                        <button type="button" onClick={() => importer(x)} disabled={Boolean(importes[cle])} className="btn-gradient inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-60">
                          <PackagePlus size={14} /> {importes[cle] ?? 'Importer'}
                        </button>
                        <label className="flex items-center gap-1 text-[11px] text-gray-400">
                          <input type="checkbox" checked={compare.has(cle)} onChange={() => cocher(x)} /> Comparer
                        </label>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : !chargement && FOURNISSEURS.some((f) => f.api && choisis.has(f.id) && relies.has(f.id)) ? (
            <p className="mt-4 text-xs text-gray-400">Aucune offre pour « {cherche} » chez vos fournisseurs reliés.</p>
          ) : null}
        </>
      ) : null}

      {FOURNISSEURS.some((f) => !f.api && choisis.has(f.id)) || web ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold">Leur page de recherche, dans l'application</h2>
          {!p ? (
            <BesoinDesktop ce="Temu, Alibaba et Shein n'ont pas d'API produits : SmartMarket ouvre leur vraie page de recherche dans le navigateur de l'application, où vous importez la fiche d'un clic." />
          ) : !cherche ? (
            <p className="text-xs text-gray-400">Lancez une recherche : l'application lit leurs résultats ; vous pouvez aussi ouvrir leur page ici.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-2">
                {FOURNISSEURS.filter((f) => f.recherche && choisis.has(f.id)).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setWeb(f.id)}
                    className={`flex items-center gap-2 rounded-lg border py-1 pl-1 pr-3 text-xs font-semibold ${web === f.id ? 'border-[var(--marque-rose)] text-white' : 'border-[var(--trait)] text-gray-400'}`}
                  >
                    <PlatformLogo id={f.id} label={f.nom} domain={f.domaine} size={22} arrondi="md" /> Voir chez {f.nom}
                  </button>
                ))}
              </div>
              {urlWeb ? (
                <NavigateurIntegre
                  profil="webshipper"
                  depart={urlWeb}
                  forcer
                  hauteur={620}
                  surEtat={setEtatNav}
                  actions={
                    <button
                      type="button"
                      disabled={!surFiche}
                      onClick={async () => {
                        setMessageWeb('Lecture de la fiche dans l’application…')
                        const r = await p.importer({ url: etatNav!.url! })
                        setMessageWeb(r.ok ? 'Importée : l’annonce est dans Mes annonces.' : r.erreur || 'Import impossible.')
                      }}
                      className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                    >
                      <PackagePlus size={14} /> Importer cette fiche
                    </button>
                  }
                />
              ) : null}
              {messageWeb ? <p className="mt-2 text-xs text-gray-300">{messageWeb}</p> : null}
              <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                Ouvrez une fiche, puis « Importer cette fiche ». Ces sites affichent parfois une vérification anti-robot : réglez-la vous-même, l'application ne la contourne jamais.
              </p>
            </>
          )}
        </section>
      ) : null}
    </Layout>
  )
}
