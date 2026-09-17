import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Newspaper, ExternalLink, Download, Send, Loader2, Lock } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { Markdown, blocsDe } from '../components/Markdown'
import { api } from '../lib/api'

/**
 * Fresh news — les rapports du jour des 48 agents, présentés comme un journal.
 *
 * **Une seule catégorie à la fois, complète.** Le vendeur choisit son rayon,
 * le jour (aujourd'hui, hier, ou une date des quinze derniers jours) ; en dessous, le rapport se déplie : la une (« Fresh news
 * Téléphonie ! » et l'accroche), les liens vers les blocs, puis les blocs
 * eux-mêmes — chaque section H2 du rapport est une case.
 *
 * **La liste des 20 produits n'est pas un tableau à lire, c'est une liste
 * d'annonces à importer.** Chaque ligne a « Voir » (chez nous si le
 * fournisseur est relié, sur le web sinon), « Importer » (direct, quand la
 * fiche se lit par l'API ou par l'adresse) et « Envoyer à l'extension » (la
 * file que l'agent extension relève dans le navigateur). Et « Tout » fait les
 * deux d'un coup, chaque produit par le chemin qui lui convient.
 *
 * Gratuit, réservé aux comptes à ≥ 500 drops : le serveur répond 402 avec le
 * manque, et la page le dit plutôt que de montrer une page vide.
 */
type Rapports = Awaited<ReturnType<typeof api.freshRapports>>
type Rapport = Rapports['rapports'][number]
type Produit = Rapport['produits'][number]
type Categorie = Awaited<ReturnType<typeof api.freshCategories>>[number]

const COULEURS = ['#a855f7,#ec4899', '#22d3ee,#a855f7', '#f59e0b,#ef4444', '#34d399,#22d3ee']

export default function FreshNews() {
  const [params, setParams] = useSearchParams()
  const [categories, setCategories] = useState<Categorie[]>([])
  const [donnees, setDonnees] = useState<Rapports | null>(null)
  const [porte, setPorte] = useState<{ seuil: number; drops: number; message: string } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [liens, setLiens] = useState<Array<{ supplier: string; connected: boolean }>>([])
  const [fournisseurs, setFournisseurs] = useState<Array<{ id: string; name: string }>>([])
  const [message, setMessage] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)

  const categorie = params.get('categorie') || categories[0]?.id || ''
  const jour = params.get('jour') || undefined

  useEffect(() => {
    api.freshCategories().then(setCategories).catch(() => setErreur('Impossible de lire les catégories.'))
    api.listSupplierLinks().then((l) => setLiens(l)).catch(() => undefined)
    api.listSuppliers().then((s) => setFournisseurs((s as Array<{ id: string; label: string }>).map((x) => ({ id: x.id, name: x.label })))).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!categorie) return
    setChargement(true)
    setErreur(null)
    setPorte(null)
    api
      .freshRapports(categorie, jour)
      .then((d) => setDonnees(d))
      .catch((e: Error & { status?: number; body?: { seuil?: number; drops?: number } }) => {
        setDonnees(null)
        if (e.status === 402 || /500 drops/.test(e.message)) {
          setPorte({ seuil: e.body?.seuil ?? 500, drops: e.body?.drops ?? 0, message: e.message })
        } else setErreur(e.message)
      })
      .finally(() => setChargement(false))
  }, [categorie, jour])

  const cat = categories.find((c) => c.id === categorie)
  const couleur = COULEURS[Math.max(0, categories.findIndex((c) => c.id === categorie)) % COULEURS.length]

  function choisir(patch: Record<string, string | undefined>) {
    const suivant = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) suivant.set(k, v)
      else suivant.delete(k)
    }
    setParams(suivant)
  }

  /** Le fournisseur d'un produit, retrouvé par son nom dans l'annuaire — et s'il est relié. */
  function fournisseurDe(p: Produit) {
    const nom = p.fournisseur.toLowerCase()
    const f = fournisseurs.find((x) => x.name.toLowerCase() === nom || nom.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(nom))
    const relie = f ? liens.some((l) => l.supplier === f.id && l.connected) : false
    return { id: f?.id ?? null, relie }
  }

  async function importer(produits: Produit[], origine: string) {
    setEnCours(origine)
    setMessage(null)
    try {
      const directs = produits.filter((p) => p.import !== 'extension')
      const parExtension = produits.filter((p) => p.import === 'extension')
      let importes = 0
      let echecs = 0
      for (let i = 0; i < directs.length; i += 25) {
        const r = await api.importBatch(directs.slice(i, i + 25).map((p) => p.url))
        importes += r.imported
        echecs += r.failed
      }
      let enFile = 0
      if (parExtension.length) {
        const r = await api.fileImportAjouter(parExtension.map((p) => ({ url: p.url, titre: p.titre, fournisseur: p.fournisseur, mode: 'extension', origine })))
        enFile = r.ajoutes
      }
      const morceaux = []
      if (importes) morceaux.push(`${importes} annonce(s) importée(s)`)
      if (enFile) morceaux.push(`${enFile} fiche(s) envoyée(s) à l'extension`)
      if (echecs) morceaux.push(`${echecs} échec(s)`)
      setMessage(morceaux.length ? morceaux.join(' · ') + '.' : 'Rien à faire : tout était déjà importé ou en file.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "L'import n'a pas abouti.")
    } finally {
      setEnCours(null)
    }
  }

  async function versExtension(produits: Produit[], origine: string) {
    setEnCours(origine + ':ext')
    setMessage(null)
    try {
      const r = await api.fileImportAjouter(produits.map((p) => ({ url: p.url, titre: p.titre, fournisseur: p.fournisseur, mode: p.import, origine })))
      setMessage(`${r.ajoutes} fiche(s) envoyée(s) à l'extension${r.dejaEnFile ? `, ${r.dejaEnFile} déjà en file` : ''}. Elle les relève dès que votre navigateur est ouvert.`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "L'envoi n'a pas abouti.")
    } finally {
      setEnCours(null)
    }
  }

  const rayon = donnees?.rapports.find((r) => r.type === 'rayon')
  const marketing = donnees?.rapports.find((r) => r.type === 'marketing')
  const blocs = useMemo(() => {
    const tous: Array<{ id: string; titre: string; corps: string; rapport: Rapport; produits?: Produit[] }> = []
    for (const r of [rayon, marketing]) {
      if (!r) continue
      for (const b of blocsDe(r.body)) {
        const estListe = r.type === 'rayon' && /produits/i.test(b.titre) && r.produits.length > 0
        tous.push({ id: `${r.type}-${b.id}`, titre: b.titre || (r.type === 'rayon' ? 'Analyse' : 'Marketing'), corps: b.corps, rapport: r, produits: estListe ? r.produits : undefined })
      }
    }
    return tous
  }, [rayon, marketing])

  return (
    <Layout>
      <BlocSection id="marche" />

      <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold">
        <Newspaper size={22} className="text-emerald-400" />
        <span>Fresh news</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Chaque jour, pour chacun des 24 rayons, deux rapports : le marché et ses 20 produits à importer, et le marketing —
        social places, publicités, tendances, prompts. Offerts à partir de 500 drops en banque.
      </p>

      {/* ---------- Le sélecteur : rayon, jour, archives ---------- */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select
          value={categorie}
          onChange={(e) => choisir({ categorie: e.target.value, jour: undefined })}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id} className="bg-[#1b1633]">{c.nom}</option>
          ))}
        </select>

        {donnees?.aujourdhui ? (
          <>
            <Pilule actif={(jour ?? donnees.jour) === donnees.aujourdhui} onClick={() => choisir({ jour: donnees.aujourdhui })}>Aujourd'hui</Pilule>
            <Pilule actif={jour === donnees.hier} onClick={() => choisir({ jour: donnees.hier })}>Hier</Pilule>
          </>
        ) : null}

        <select
          value={jour ?? donnees?.jour ?? ''}
          onChange={(e) => choisir({ jour: e.target.value || undefined })}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
        >
          <option value="" className="bg-[#1b1633]">Les 15 derniers jours…</option>
          {(donnees?.disponibles ?? []).map((d) => (
            <option key={d} value={d} className="bg-[#1b1633]">{dateFr(d)}</option>
          ))}
        </select>

      </div>

      {erreur ? <p className="mt-4 text-sm text-red-400">{erreur}</p> : null}
      {message ? <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}

      {/* ---------- La porte : 500 drops ---------- */}
      {porte ? (
        <div className="mt-6 max-w-2xl rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5">
          <p className="flex items-center gap-2 font-bold text-amber-100"><Lock size={16} /> Réservé aux comptes à {porte.seuil} drops et plus</p>
          <p className="mt-2 text-sm text-amber-100/90">
            Les rapports sont gratuits, mais ils sont pour les vendeurs qui vendent : il vous faut {porte.seuil} drops en banque, vous en avez {porte.drops}.
          </p>
          <Link to="/credits" className="btn-gradient mt-4 inline-flex rounded-lg px-4 py-2 text-sm font-semibold">Recharger mes drops</Link>
        </div>
      ) : null}

      {chargement ? <p className="mt-6 flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> Le journal arrive…</p> : null}

      {/* ---------- La une ---------- */}
      {donnees && !porte ? (
        <article className="mt-6">
          <header className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">{donnees.jour ? dateFr(donnees.jour) : ''} · {rayon?.theme.nom ?? marketing?.theme.nom ?? ''}</p>
            <h2
              className="mt-1 break-words bg-gradient-to-r bg-clip-text text-3xl font-black leading-tight text-transparent sm:text-4xl"
              style={{ backgroundImage: `linear-gradient(90deg, ${couleur})` }}
            >
              Fresh news {cat?.nom ?? donnees.categorie.nom} !
            </h2>
            {rayon?.accroche || marketing?.accroche ? (
              <p className="mt-2 max-w-3xl text-base text-gray-200">{rayon?.accroche ?? marketing?.accroche}</p>
            ) : null}
            {donnees.rapports.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">Pas encore de rapport pour ce rayon ce jour-là. Les agents écrivent chaque matin.</p>
            ) : (
              <nav className="mt-4 flex flex-wrap gap-2">
                {blocs.map((b) => (
                  <a key={b.id} href={`#${b.id}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-gray-200 hover:border-purple-400/50">
                    {b.rapport.type === 'rayon' ? '📈 ' : '📣 '}{b.titre}
                  </a>
                ))}
              </nav>
            )}
          </header>

          {/* ---------- Les blocs ---------- */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {blocs.map((b) => (
              <section
                key={b.id}
                id={b.id}
                className={`scroll-mt-24 rounded-2xl border border-white/10 bg-white/5 p-5 ${b.produits ? 'md:col-span-2' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3
                    className="bg-gradient-to-r bg-clip-text text-lg font-extrabold text-transparent"
                    style={{ backgroundImage: `linear-gradient(90deg, ${couleur})` }}
                  >
                    {b.titre}
                  </h3>
                  <span className="text-[11px] uppercase tracking-wider text-gray-500">{b.rapport.type === 'rayon' ? 'Marché' : 'Marketing'}</span>
                </div>

                {b.produits ? (
                  <ListeProduits
                    produits={b.produits}
                    rapportId={b.rapport.id}
                    fournisseurDe={fournisseurDe}
                    enCours={enCours}
                    onImporter={(ps, origine) => importer(ps, origine)}
                    onExtension={(ps, origine) => versExtension(ps, origine)}
                  />
                ) : (
                  <div className="mt-2"><Markdown texte={b.corps} /></div>
                )}
              </section>
            ))}
          </div>

          {rayon || marketing ? (
            <p className="mt-6 text-xs text-gray-500">
              Sources consultées par les agents : {(rayon?.sources ?? 0) + (marketing?.sources ?? 0)}. Les liens des produits mènent chez le fournisseur ; les prix sont ceux relevés le jour du rapport.
            </p>
          ) : null}
        </article>
      ) : null}
    </Layout>
  )
}

function Pilule({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${actif ? 'btn-gradient' : 'border border-white/10 bg-white/5 text-gray-200 hover:border-purple-400/50'}`}
    >
      {children}
    </button>
  )
}

function dateFr(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function euros(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(2).replace('.', ',')} €`
}

/**
 * Les 20 produits : une liste d'annonces, pas un tableau.
 *
 * « Voir » ouvre chez nous quand le fournisseur est relié (le catalogue lu par
 * l'API), sur le web sinon. « Importer » n'existe que pour ce qui se lit sans
 * navigateur (api, url) ; le reste passe par l'agent extension.
 */
function ListeProduits({
  produits,
  rapportId,
  fournisseurDe,
  enCours,
  onImporter,
  onExtension,
}: {
  produits: Produit[]
  rapportId: string
  fournisseurDe: (p: Produit) => { id: string | null; relie: boolean }
  enCours: string | null
  onImporter: (ps: Produit[], origine: string) => void
  onExtension: (ps: Produit[], origine: string) => void
}) {
  const directs = produits.filter((p) => p.import !== 'extension').length
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span>{produits.length} produits — {directs} importables directement, {produits.length - directs} par l'extension.</span>
        <span className="ml-auto flex gap-2">
          <button type="button" disabled={enCours !== null} onClick={() => onImporter(produits, rapportId)} className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60">
            {enCours === rapportId ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Tout importer
          </button>
          <button type="button" disabled={enCours !== null} onClick={() => onExtension(produits, rapportId)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:border-purple-400/50 disabled:opacity-60">
            <Send size={12} /> Tout envoyer à l'extension
          </button>
        </span>
      </div>

      <ul className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10">
        {produits.map((p) => {
          const f = fournisseurDe(p)
          const cle = `${rapportId}:${p.rang}`
          return (
            <li key={p.rang} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold"><span className="text-gray-500">{p.rang}.</span> {p.titre}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {p.fournisseur}{f.relie ? <span className="ml-1 rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">relié</span> : null}
                  {' · '}achat {euros(p.prixAchat)} · vente {euros(p.prixVente)}{p.margePct !== null ? ` · marge ${Math.round(p.margePct)} %` : ''}
                  {p.pourquoi ? <span className="text-gray-500"> — {p.pourquoi}</span> : null}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {f.relie && f.id ? (
                  <Link to={`/catalogues?fournisseur=${encodeURIComponent(f.id)}&q=${encodeURIComponent(p.titre)}`} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold hover:border-purple-400/50">
                    <ExternalLink size={12} /> Voir chez nous
                  </Link>
                ) : (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold hover:border-purple-400/50">
                    <ExternalLink size={12} /> Voir sur le web
                  </a>
                )}
                {p.import !== 'extension' ? (
                  <button type="button" disabled={enCours !== null} onClick={() => onImporter([p], cle)} className="btn-gradient inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60">
                    {enCours === cle ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Importer · 12
                  </button>
                ) : null}
                <button type="button" disabled={enCours !== null} onClick={() => onExtension([p], cle)} className="inline-flex items-center gap-1 rounded-lg border border-purple-400/30 bg-purple-400/10 px-2.5 py-1.5 text-xs font-semibold text-purple-100 hover:border-purple-400/60 disabled:opacity-60">
                  {enCours === cle + ':ext' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Extension · 6 + 12
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
