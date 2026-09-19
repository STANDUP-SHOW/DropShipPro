import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Newspaper, Loader2, Lock } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { Markdown, blocsDe } from '../components/Markdown'
import { ListeProduitsRapport } from '../components/ListeProduitsRapport'
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
 * d'annonces à importer** — et elle vit dans `ListeProduitsRapport`, partagée
 * avec la page Produits gagnants et les rayons. Elle était écrite ici, et la
 * recopier ailleurs aurait fait deux boutons « Importer » qui ne font pas la
 * même chose selon la page d'où on les clique.
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
  const [message, setMessage] = useState<string | null>(null)

  const categorie = params.get('categorie') || categories[0]?.id || ''
  const jour = params.get('jour') || undefined

  useEffect(() => {
    api.freshCategories().then(setCategories).catch(() => setErreur('Impossible de lire les catégories.'))
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
                  <ListeProduitsRapport produits={b.produits} origine={b.rapport.id} onMessage={setMessage} />
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
