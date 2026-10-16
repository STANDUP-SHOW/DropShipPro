import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, ExternalLink, Check, ArrowUpRight } from 'lucide-react'
import { PageCreative, Entete, Fenetre, Filtres } from '../components/creative/Creative'
import { Logo } from '../components/Logo'
import { isAuthed } from '../lib/api'
import apiPower from '../data/api-power.json'
import PiedDePagePublic from '../components/PiedDePagePublic'

/**
 * API Power — tout ce que les API marketing, publicitaires et de publication
 * permettront une fois raccordées, et où leurs données arriveront.
 *
 * Page publique (demandée par Max le 25/09/2026) : un prospect doit pouvoir la
 * lire sans compte, et les robots aussi — build-geo.cjs en écrit une version
 * pré-rendue à la même adresse. Les deux lisent `data/api-power.json`, copie
 * engendrée du registre `backend/src/services/apiPower.ts` : rien n'est écrit
 * ici à la main, et l'état de chaque API est celui du code, pas celui qu'on
 * aimerait.
 */

/* Les mêmes formes que backend/src/services/apiPower.ts ; le JSON les porte, TypeScript ne les devine pas. */
type Etat = 'ecrit' | 'flux' | 'jeton' | 'prevu' | 'ecarte'
type Univers = keyof typeof apiPower.univers
interface Opportunite {
  id: string
  titre: string
  usage: string
  quoi: string
  donnees: string[]
  gestes: string[]
  ecran: string
}
interface Api {
  id: string
  univers: Univers
  nom: string
  editeur: string
  doc: string
  console: string
  quoi: string
  prerequis: string[]
  etat: Etat
  existant?: string
  opportunites: Opportunite[]
}
const APIS = apiPower.apis as unknown as Api[]
const LIBELLES = apiPower.libelles as { etat: Record<Etat, string>; usage: Record<string, string>; ecran: Record<string, string> }

const EXPLICATION_ETAT: Record<Etat, string> = {
  ecrit: "Le connecteur est écrit et éprouvé sur un faux serveur ; il reste à le confronter au vrai service (vérification d'entreprise, revue de l'application).",
  flux: 'Nous servons déjà le flux que cette API consomme ; elle ajoutera la mise à jour immédiate et la lecture des statuts.',
  jeton: 'Vous pouvez déjà coller votre jeton dans API Connect ; rien n’est encore lu ni diffusé, et l’écran le dit.',
  prevu: "Rien n'est écrit : l'opportunité est décrite pour être promise honnêtement, pas pour faire croire qu'elle existe.",
  ecarte: 'Non retenu, avec la raison.',
}

export default function ApiPower() {
  const [univers, setUnivers] = useState<Univers | 'tous'>('tous')
  const [usage, setUsage] = useState<string>('tous')
  const [ouverte, setOuverte] = useState<Api | null>(null)
  const apis = APIS
  const { resume } = apiPower
  const libelles = LIBELLES
  const universList = Object.entries(apiPower.univers) as Array<[Univers, { label: string; color: string }]>
  const court = (u: Univers) => apiPower.univers[u].label.split(' — ')[0]
  const connecte = isAuthed()

  const visibles = useMemo(
    () =>
      apis.filter((a) => (univers === 'tous' || a.univers === univers) && (usage === 'tous' || a.opportunites.some((o) => o.usage === usage))),
    [apis, univers, usage],
  )
  // The planets of the hero: every publisher of the register, placed on two rings.
  const planetes = universList.map(([id], i) => {
    const n = universList.length
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const rayon = i % 2 ? 46 : 38
    return { id, nom: court(id), x: 50 + rayon * Math.cos(angle), y: 50 + rayon * Math.sin(angle) }
  })

  return (
    <div className="min-h-screen bg-[#0b0b0e] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Link to="/">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-gray-300">
          <a href="/tarifs/" className="hidden hover:text-white sm:inline">Tarifs</a>
          <a href="/faq/" className="hidden hover:text-white sm:inline">FAQ</a>
          <Link
            to={connecte ? '/api-links' : '/login'}
            className="rounded-lg border border-purple-400/40 bg-white/5 px-4 py-2 font-medium transition hover:bg-white/10"
          >
            {connecte ? 'Mes raccordements' : 'Se connecter'}
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <PageCreative sansNav={!connecte}>
          <Entete
            surtitre="10 / API Power"
            ligne1="Plus de connexions."
            ligne2="Plus de possibilités."
            chapo="Publier, mesurer, diffuser : découvrez ce que chaque service peut apporter et où en est son raccordement. L'état de chaque API est celui du code, pas celui qu'on aimerait."
          />

          {/* ---------- Le héros : l'écosystème ---------- */}
          <section className="v-heros-api mt-8">
            <div>
              <p className="c-etiquette !text-[var(--c-lime)]">L'écosystème DropShipper</p>
              <p className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
                Votre studio.
                <br />
                Un monde de connexions.
              </p>
              <dl className="mt-6 flex flex-wrap gap-8">
                <div>
                  <dt className="text-4xl font-semibold text-[var(--c-lime)]">{resume.retenues}</dt>
                  <dd className="mt-1 text-xs text-[var(--c-texte-2)]">API retenues</dd>
                </div>
                <div>
                  <dt className="text-4xl font-semibold text-[var(--c-lime)]">{resume.opportunites}</dt>
                  <dd className="mt-1 text-xs text-[var(--c-texte-2)]">opportunités décrites</dd>
                </div>
                <div>
                  <dt className="text-4xl font-semibold text-[var(--c-violet)]">{resume.parEtat.ecrit + resume.parEtat.flux + resume.parEtat.jeton}</dt>
                  <dd className="mt-1 text-xs text-[var(--c-texte-2)]">déjà amorcées</dd>
                </div>
              </dl>
            </div>
            <div className="v-systeme" aria-hidden>
              <div className="v-systeme-anneau" style={{ inset: '12%' }} />
              <div className="v-systeme-anneau" style={{ inset: '4%' }} />
              <div className="v-systeme-centre">
                <span>POWER</span>
                <span className="text-xl text-[var(--c-lime)]">✳</span>
              </div>
              <div className="v-systeme-tourne">
                {planetes.map((p) => (
                  <span key={p.id} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                    {p.nom}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* ---------- Choisir l'usage ---------- */}
          <section className="mt-12">
            <div className="v-titre-section">
              <div>
                <h2 className="c-h2">Choisissez l'usage.</h2>
                <p>{`${visibles.length} service${visibles.length > 1 ? 's' : ''} sur ${apis.length}, du registre API Power.`}</p>
              </div>
              <select className="c-champ !w-auto" value={univers} onChange={(e) => setUnivers(e.target.value as Univers | 'tous')} aria-label="Éditeur">
                <option value="tous">Tous les éditeurs</option>
                {universList.map(([id]) => (
                  <option key={id} value={id}>{court(id)}</option>
                ))}
              </select>
            </div>
            <div className="mt-3">
              <Filtres
                options={[{ id: 'tous', label: 'Tout' }, ...Object.entries(libelles.usage).map(([id, label]) => ({ id, label }))]}
                valeur={usage}
                onChange={setUsage}
              />
            </div>

            <div className="v-grille mt-5">
              {visibles.map((a) => {
                const usages = [...new Set(a.opportunites.map((o) => libelles.usage[o.usage]).filter(Boolean))]
                return (
                  <article key={a.id} id={a.id} className="v-api scroll-mt-24">
                    <div className="flex items-baseline gap-3">
                      <span className="v-api-initiale" style={{ color: apiPower.univers[a.univers].color === '#111111' ? '#f2f0eb' : apiPower.univers[a.univers].color }}>
                        {court(a.univers).slice(0, 1)}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-[var(--c-texte-2)]">
                        {court(a.univers)}
                        {usages.length ? ` / ${usages.slice(0, 2).join(', ')}` : ''}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold leading-snug">{a.nom}</h3>
                    <p className="line-clamp-3 text-sm text-[var(--c-texte-2)]">{a.quoi}</p>
                    <span className="v-etat mt-1" data-etat={a.etat}>{libelles.etat[a.etat]}</span>
                    <button type="button" className="c-bouton-sec mt-auto justify-center !text-xs" onClick={() => setOuverte(a)}>
                      Capacités &amp; disponibilité <ArrowUpRight size={12} />
                    </button>
                  </article>
                )
              })}
            </div>
            {visibles.length === 0 ? <p className="mt-6 text-sm text-[var(--c-texte-2)]">Aucune API ne correspond à ce filtre.</p> : null}
          </section>

          {/* ---------- Lire un état ---------- */}
          <section className="mt-12">
            <h2 className="c-h2">Lire l'état d'un raccordement</h2>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {(Object.keys(libelles.etat) as Etat[]).map((e) => (
                <li key={e} className="v-carte flex flex-col gap-2 !p-4">
                  <span className="v-etat" data-etat={e}>{libelles.etat[e]}</span>
                  <span className="text-sm text-[var(--c-texte-2)]">{EXPLICATION_ETAT[e]}</span>
                </li>
              ))}
            </ul>
            <p className="v-note mt-6">
              « Connecteur écrit » ne signifie pas connecté à votre compte. « Jeton accepté » ne signifie pas que les données sont lues.
              Les états reprennent le registre du code ; ils ne sont pas des tests de connexion.
            </p>
          </section>

          <section className="v-carte mt-12 text-center">
            <Zap className="mx-auto text-[var(--c-lime)]" size={26} />
            <h2 className="c-h2 mt-3">Vos raccordements se font dans API Connect</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--c-texte-2)]">
              Les jetons se collent une fois, ne sont jamais réaffichés, et chaque écran dit ce qui est lu, et ce qui ne l'est pas encore.
            </p>
            <Link to={connecte ? '/api-links' : '/register'} className="c-bouton mx-auto mt-6 w-fit">
              <span>{connecte ? 'Ouvrir API Connect' : 'Créer un compte, 120 drops offerts'}</span>
              <ArrowUpRight size={15} />
            </Link>
          </section>

          {ouverte ? (
            <Fenetre titre={ouverte.nom} onClose={() => setOuverte(null)} large>
              <p className="mt-1 text-xs uppercase tracking-wider text-[var(--c-texte-2)]">{`${court(ouverte.univers)} · ${ouverte.editeur}`}</p>
              <span className="v-etat mt-3" data-etat={ouverte.etat}>{libelles.etat[ouverte.etat]}</span>
              <p className="mt-2 text-xs text-[var(--c-texte-2)]">{EXPLICATION_ETAT[ouverte.etat]}</p>
              <p className="mt-4 text-sm leading-relaxed">{ouverte.quoi}</p>
              {ouverte.existant ? <p className="v-note mt-3">{ouverte.existant}</p> : null}
              {ouverte.opportunites.length ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {ouverte.opportunites.map((o) => (
                    <div key={o.id} className="v-carte !p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold">{o.titre}</h3>
                        <span className="shrink-0 rounded-full border border-[var(--c-trait)] px-2 py-0.5 text-[10px] text-[var(--c-violet)]">{libelles.usage[o.usage]}</span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--c-texte-2)]">{o.quoi}</p>
                      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--c-texte-2)]">Ce qui remonte</p>
                      <ul className="mt-1 space-y-1 text-xs">
                        {o.donnees.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--c-texte-2)]">Vos gestes</p>
                      <ul className="mt-1 space-y-1 text-xs">
                        {o.gestes.map((g) => (
                          <li key={g} className="flex gap-2">
                            <Check size={13} className="mt-0.5 shrink-0 text-[var(--c-lime)]" />
                            <span>{g}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-xs text-[var(--c-texte-2)]">
                        Dans le back-office : <span className="text-[var(--c-texte)]">{libelles.ecran[o.ecran]}</span>
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="mt-5 text-[10px] font-semibold uppercase tracking-wider text-[var(--c-texte-2)]">{`Prérequis chez ${ouverte.editeur}`}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {ouverte.prerequis.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p className="mt-4 flex flex-wrap gap-4">
                <a href={ouverte.doc} target="_blank" rel="noreferrer noopener" className="v-lien">
                  Documentation <ExternalLink size={12} />
                </a>
                <a href={ouverte.console} target="_blank" rel="noreferrer noopener" className="v-lien">
                  Console <ExternalLink size={12} />
                </a>
              </p>
            </Fenetre>
          ) : null}
        </PageCreative>
      </main>
      <PiedDePagePublic />
    </div>
  )
}
