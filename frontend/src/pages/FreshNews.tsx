import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader2, Lock, ArrowUpRight, Globe } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { Markdown, blocsDe } from '../components/Markdown'
import { ListeProduitsRapport } from '../components/ListeProduitsRapport'
import { PageCreative, Entete } from '../components/creative/Creative'
import { GrilleRapports, Provenance, dateLongue, liste, melange, pagePublique, type LigneRapport } from '../components/creative/Veille'
import { api } from '../lib/api'

/**
 * Fresh news — les rapports des 48 agents, présentés comme un journal
 * (maquette du 16/10/2026, vue 07).
 *
 * **D'abord la grille des rapports du jour**, dans un ordre mélangé, chacun
 * illustré par la photo de son rayon et titré par son rapport (demande de Max :
 * « des blocs aléatoires en grille avec des illustrations »). Un clic ouvre
 * l'édition du rayon dessous : la une, le rapport, l'angle créatif, l'essentiel
 * en notes qu'on déplie, puis la liste des produits à importer.
 *
 * **Chaque rapport a sa page publique**, écrite par le générateur SEO du
 * serveur au dépôt du rapport (garde-fou appliqué) : l'édition y renvoie, elle
 * n'en fabrique pas une seconde.
 *
 * **La liste des produits n'est pas un tableau à lire, c'est une liste
 * d'annonces à importer** — et elle vit dans `ListeProduitsRapport`, partagée
 * avec la page Produits gagnants et les rayons.
 */
type Rapports = Awaited<ReturnType<typeof api.freshRapports>>
type Rapport = Rapports['rapports'][number]
type Produit = Rapport['produits'][number]
type Categorie = Awaited<ReturnType<typeof api.freshCategories>>[number]

/** Douze cartes d'abord : la grille d'un jour en porte jusqu'à 48. */
const PREMIERES = 12

export default function FreshNews() {
  const [params, setParams] = useSearchParams()
  const [categories, setCategories] = useState<Categorie[]>([])
  const [lignes, setLignes] = useState<LigneRapport[]>([])
  const [jourGrille, setJourGrille] = useState<string>('')
  const [tout, setTout] = useState(false)
  const [donnees, setDonnees] = useState<Rapports | null>(null)
  const [porte, setPorte] = useState<{ seuil: number; drops: number; message: string } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [chargementGrille, setChargementGrille] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [ouverte, setOuverte] = useState<string | null>(null)
  const edition = useRef<HTMLElement>(null)

  const categorie = params.get('categorie') || ''
  const jour = params.get('jour') || undefined

  useEffect(() => {
    api
      .freshCategories()
      .then((c) => setCategories(liste<Categorie>(c)))
      .catch(() => undefined)
    api
      .analysesRapports({ limite: 200 })
      .then((d) => setLignes(liste<LigneRapport>(d?.analyses)))
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setChargementGrille(false))
  }, [])

  useEffect(() => {
    if (!categorie) {
      setDonnees(null)
      return
    }
    setChargement(true)
    setErreur(null)
    setPorte(null)
    setOuverte(null)
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

  /* ---------- La grille : les jours, le jour montré, ses rapports mélangés ---------- */
  const jours = useMemo(() => [...new Set(lignes.map((l) => l.day))].sort().reverse(), [lignes])
  const jourMontre = jourGrille || jours[0] || ''
  const duJour = useMemo(() => melange(lignes.filter((l) => l.day === jourMontre), jourMontre), [lignes, jourMontre])
  const rayonsDuJour = new Set(duJour.map((l) => l.categorie)).size
  const visibles = tout ? duJour : duJour.slice(0, PREMIERES)

  function choisir(patch: Record<string, string | undefined>) {
    const suivant = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) suivant.set(k, v)
      else suivant.delete(k)
    }
    setParams(suivant)
  }

  function ouvrir(r: LigneRapport) {
    choisir({ categorie: r.categorie, jour: r.day })
    window.setTimeout(() => edition.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  /* ---------- L'édition ouverte ---------- */
  const rapports = liste<Rapport>(donnees?.rapports)
  const rayon = rapports.find((r) => r.type === 'rayon')
  const marketing = rapports.find((r) => r.type === 'marketing')
  const produits = liste<Produit>(rayon?.produits)
  const directs = produits.filter((p) => p.import !== 'extension').length
  const cat = categories.find((c) => c.id === categorie)
  const nomRayon = cat?.nom ?? donnees?.categorie?.nom ?? ''
  const jourEdition = donnees?.jour ?? jour ?? ''
  const ligneDe = (r?: Rapport) => (r ? lignes.find((l) => l.id === r.id) : undefined)
  const notes = useMemo(() => {
    const tous: Array<{ id: string; titre: string; corps: string; type: Rapport['type'] }> = []
    for (const r of [rayon, marketing]) {
      if (!r) continue
      for (const b of blocsDe(r.body ?? '')) {
        // The product list has its own block below: as a note it would only repeat it.
        if (r.type === 'rayon' && /produits/i.test(b.titre) && produits.length > 0) continue
        tous.push({ id: `${r.type}-${b.id}`, titre: b.titre || (r.type === 'rayon' ? 'Analyse' : 'Marketing'), corps: b.corps, type: r.type })
      }
    }
    return tous
  }, [rayon, marketing, produits.length])
  const premierMarketing = notes.find((n) => n.type === 'marketing')

  return (
    <Layout>
      <BlocSection id="marche" />
      <PageCreative>
        <Entete
          surtitre="07 / Fresh news"
          ligne1="Le signal du jour."
          ligne2="Votre prochain angle."
          chapo="Le marché, les produits et le marketing réunis dans une lecture courte. Puis les détails, quand vous en avez besoin."
        />

        {/* ---------- La grille des rapports ---------- */}
        <section className="mt-10">
          <div className="v-titre-section">
            <div>
              <h2 className="c-h2">{jourMontre ? `Les rapports du ${dateLongue(jourMontre)}` : 'Les rapports du jour'}</h2>
              <p>
                {duJour.length
                  ? `${duJour.length} rapports, ${rayonsDuJour} rayon${rayonsDuJour > 1 ? 's' : ''}, dans un ordre mélangé. Touchez un titre pour ouvrir son édition.`
                  : 'Chaque jour, deux rapports pour chacun des 24 rayons : le marché et ses 20 produits, et le marketing.'}
              </p>
            </div>
            {jours.length > 1 ? (
              <label className="flex items-center gap-2 text-xs text-[var(--c-texte-2)]">
                Jour
                <select className="c-champ !w-auto" value={jourMontre} onChange={(e) => { setJourGrille(e.target.value); setTout(false) }}>
                  {jours.map((d) => (
                    <option key={d} value={d}>{dateLongue(d)}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {chargementGrille ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-[var(--c-texte-2)]"><Loader2 size={14} className="animate-spin" /> Le journal arrive…</p>
          ) : duJour.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--c-texte-2)]">Pas encore de rapport déposé. Les agents écrivent chaque matin.</p>
          ) : (
            <div className="mt-5">
              <GrilleRapports rapports={visibles} illustree actif={rayon?.id ?? marketing?.id ?? null} onOuvrir={ouvrir} />
              {duJour.length > PREMIERES ? (
                <button type="button" className="c-bouton-sec mt-4" onClick={() => setTout((t) => !t)}>
                  {tout ? 'Montrer moins de rapports' : `Montrer les ${duJour.length - PREMIERES} autres rapports`}
                </button>
              ) : null}
            </div>
          )}
        </section>

        {erreur ? <p className="mt-4 text-sm text-red-400">{erreur}</p> : null}
        {message ? <p className="mt-4 rounded-xl border border-[var(--c-lime)]/40 bg-[#1d2a10] px-4 py-3 text-sm text-[var(--c-lime)]">{message}</p> : null}

        {/* ---------- La porte : 500 drops, si le serveur la ferme ---------- */}
        {porte ? (
          <div className="v-carte mt-8 max-w-2xl">
            <p className="flex items-center gap-2 font-bold"><Lock size={16} /> Réservé aux comptes à {porte.seuil} drops et plus</p>
            <p className="mt-2 text-sm text-[var(--c-texte-2)]">
              Les rapports sont gratuits, mais il vous faut {porte.seuil} drops en banque : vous en avez {porte.drops}.
            </p>
            <Link to="/credits" className="c-bouton mt-4 w-fit">Recharger mes drops</Link>
          </div>
        ) : null}

        <section ref={edition} className="scroll-mt-24">
          {chargement ? (
            <p className="mt-10 flex items-center gap-2 text-sm text-[var(--c-texte-2)]"><Loader2 size={14} className="animate-spin" /> L'édition arrive…</p>
          ) : null}

          {/* ---------- L'édition d'un rayon ---------- */}
          {donnees && !porte && !chargement && rapports.length > 0 ? (
            <article className="mt-14">
              <div className="v-edition">
                <b>{`${nomRayon} / ${rayon?.theme.nom ?? marketing?.theme.nom ?? ''}`}</b>
                <span>{jourEdition ? `Édition disponible · ${dateLongue(jourEdition)}` : null}</span>
              </div>

              <div className="v-deux mt-4" data-ratio="news">
                <div className="v-une">
                  <span className="v-filigrane" aria-hidden>
                    {jourEdition ? new Date(jourEdition + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).replace('.', '') : ''}
                  </span>
                  <p className="c-etiquette">La une / synthèse de votre rapport</p>
                  <h2 className="mt-4" data-long={(rayon?.titre || marketing?.titre || '').length > 48 ? '1' : undefined}>{rayon?.titre || marketing?.titre || `Fresh news ${nomRayon}`}</h2>
                  {rayon?.accroche || marketing?.accroche ? <p className="mt-4">{rayon?.accroche ?? marketing?.accroche}</p> : null}
                  <div className="relative mt-5 flex flex-wrap gap-2">
                    <a href="#essentiel" className="v-bouton-une">Lire les points clés <ArrowUpRight size={13} /></a>
                    {ligneDe(rayon) || rayon ? (
                      <a href={pagePublique(ligneDe(rayon) ?? { categorie, day: jourEdition, theme: rayon!.theme.id, type: 'rayon' })} target="_blank" rel="noreferrer" className="v-bouton-une">
                        <Globe size={13} /> Page publique du rapport
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {rayon ? (
                    <div className="v-carte">
                      <p className="c-etiquette">Le rapport</p>
                      <p className="mt-3 text-6xl font-semibold leading-none text-[var(--c-lime)]">{produits.length}</p>
                      <p className="mt-2 text-xl font-semibold">produits repérés</p>
                      {produits.length ? (
                        <p className="mt-2 text-xs text-[var(--c-texte-2)]">
                          {`${directs} import${directs > 1 ? 's' : ''} direct${directs > 1 ? 's' : ''}, ${produits.length - directs} via l'extension.`}
                        </p>
                      ) : null}
                      {produits.length ? (
                        <a href="#selection" className="c-bouton-sec mt-4 !text-xs">Voir la sélection <ArrowUpRight size={12} /></a>
                      ) : null}
                    </div>
                  ) : null}
                  {marketing ? (
                    <div className="v-carte">
                      <p className="c-etiquette">L'angle créatif</p>
                      <p className="mt-3 text-xl font-semibold leading-snug">{marketing.titre}</p>
                      {marketing.accroche ? <p className="mt-2 text-xs leading-relaxed text-[var(--c-texte-2)]">{marketing.accroche}</p> : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {premierMarketing ? (
                          <a href={`#${premierMarketing.id}`} onClick={() => setOuverte(premierMarketing.id)} className="c-bouton-sec !text-xs">
                            Ouvrir les pistes sociales <ArrowUpRight size={12} />
                          </a>
                        ) : null}
                        <a href={pagePublique(ligneDe(marketing) ?? { categorie, day: jourEdition, theme: marketing.theme.id, type: 'marketing' })} target="_blank" rel="noreferrer" className="c-bouton-sec !text-xs">
                          <Globe size={12} /> Page publique
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* ---------- L'essentiel ---------- */}
              {notes.length ? (
                <section id="essentiel" className="mt-12 scroll-mt-24">
                  <div className="v-titre-section">
                    <h2 className="c-h2">L'essentiel, sans le bruit.</h2>
                    <span className="c-etiquette rounded-md border border-[var(--c-trait)] px-2 py-1">Résumé éditorial</span>
                  </div>
                  <div className="v-notes mt-4">
                    {notes.map((n, i) => {
                      const ouvert = ouverte === n.id
                      return (
                        <article key={n.id} id={n.id} data-ouvert={ouvert ? '1' : '0'} className="v-carte scroll-mt-24">
                          <p className="c-etiquette !text-[var(--c-lime)]">
                            {String(i + 1).padStart(2, '0')} / {n.type === 'rayon' ? 'Marché' : 'Marketing'}
                          </p>
                          <h3 className="mt-3 text-lg font-semibold leading-snug">{n.titre}</h3>
                          {ouvert ? (
                            <div className="mt-3"><Markdown texte={n.corps} /></div>
                          ) : (
                            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--c-texte-2)]">{extrait(n.corps)}</p>
                          )}
                          <button type="button" className="c-bouton-sec mt-4 !text-xs" onClick={() => setOuverte(ouvert ? null : n.id)}>
                            {ouvert ? 'Replier' : 'Développer'} <ArrowUpRight size={12} />
                          </button>
                        </article>
                      )
                    })}
                  </div>
                </section>
              ) : null}

              {/* ---------- La sélection à importer ---------- */}
              {rayon && produits.length ? (
                <section id="selection" className="mt-12 scroll-mt-24">
                  <h2 className="c-h2">{`Les ${produits.length} produits du rapport`}</h2>
                  <div className="v-outil mt-4">
                    <ListeProduitsRapport produits={produits} origine={rayon.id} onMessage={setMessage} />
                  </div>
                </section>
              ) : null}

              <p className="v-note mt-8">
                {`Cette édition est datée du ${jourEdition ? dateLongue(jourEdition) : 'jour du rapport'}. Les notes reprennent le rapport ; elles ne sont pas une nouvelle vérification de ses sources (${(rayon?.sources ?? 0) + (marketing?.sources ?? 0)} consultées par les agents). Les liens mènent chez le fournisseur ; les prix sont ceux relevés le jour du rapport, à reconfirmer avant import. Chaque rapport a sa page publique, écrite automatiquement pour le référencement, sans prix d'achat, fournisseur ni marge.`}
              </p>
            </article>
          ) : null}

          {donnees && !porte && !chargement && rapports.length === 0 ? (
            <p className="mt-10 text-sm text-[var(--c-texte-2)]">Pas de rapport pour ce rayon ce jour-là. Les agents écrivent chaque matin.</p>
          ) : null}
        </section>

        <Provenance texte="Rapports des agents · deux par jour et par rayon, gratuits" libelle="Toutes les pages publiques des analyses" to="/analyses/" />
      </PageCreative>
    </Layout>
  )
}

/** Le début d'un bloc en texte simple, pour la note repliée. */
function extrait(corps: string): string {
  return corps
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*\|.*$/gm, ' ')
    .replace(/[#*_>`[\]]|\(https?:[^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260)
}
