import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, ExternalLink, Check } from 'lucide-react'
import { Logo } from '../components/Logo'
import { isAuthed } from '../lib/api'
import apiPower from '../data/api-power.json'
import { useThemeSombreForce } from '../lib/themeSombre'

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

const COULEUR_ETAT: Record<Etat, string> = {
  ecrit: 'border-emerald-400/60 bg-emerald-400/10 text-emerald-200',
  flux: 'border-sky-400/60 bg-sky-400/10 text-sky-200',
  jeton: 'border-amber-400/60 bg-amber-400/10 text-amber-200',
  prevu: 'border-white/20 bg-white/5 text-gray-300',
  ecarte: 'border-white/10 bg-white/5 text-gray-500',
}

const EXPLICATION_ETAT: Record<Etat, string> = {
  ecrit: "Le connecteur est écrit et éprouvé sur un faux serveur ; il reste à le confronter au vrai service (vérification d'entreprise, revue de l'application).",
  flux: 'Nous servons déjà le flux que cette API consomme ; elle ajoutera la mise à jour immédiate et la lecture des statuts.',
  jeton: 'Vous pouvez déjà coller votre jeton dans API Connect ; rien n’est encore lu ni diffusé, et l’écran le dit.',
  prevu: "Rien n'est écrit : l'opportunité est décrite pour être promise honnêtement, pas pour faire croire qu'elle existe.",
  ecarte: 'Non retenu, avec la raison.',
}

export default function ApiPower() {
  useThemeSombreForce()
  const [univers, setUnivers] = useState<Univers | 'tous'>('tous')
  const [usage, setUsage] = useState<string>('tous')
  const apis = APIS
  const { resume } = apiPower
  const libelles = LIBELLES
  const universList = Object.entries(apiPower.univers) as Array<[Univers, { label: string; color: string }]>

  const visibles = useMemo(
    () =>
      apis.filter((a) => (univers === 'tous' || a.univers === univers) && (usage === 'tous' || a.opportunites.some((o) => o.usage === usage))),
    [apis, univers, usage],
  )

  return (
    <div className="min-h-screen bg-app-gradient text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-gray-300">
          <a href="/tarifs/" className="hover:text-white">Tarifs</a>
          <a href="/faq/" className="hover:text-white">FAQ</a>
          <Link
            to={isAuthed() ? '/api-links' : '/login'}
            className="rounded-lg border border-purple-400/40 bg-white/5 px-4 py-2 font-medium transition hover:bg-white/10"
          >
            {isAuthed() ? 'Mes raccordements' : 'Se connecter'}
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="pt-8 text-center md:pt-14">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-purple-300">API Power</p>
          <h1 className="neon neon-2 mx-auto mt-3 max-w-4xl text-4xl font-extrabold leading-tight md:text-6xl">
            Ce que les API marketing débloquent, une fois connectées
          </h1>
          <p className="texte-neon mx-auto mt-6 max-w-3xl text-xl md:text-2xl">
            Meta, Google, TikTok, Pinterest et les autres exposent des API. Chacune ouvre des gestes précis — publier, mesurer, cibler,
            répondre — et chaque donnée a une place dans votre back-office. Voici la liste complète, avec l'état réel de chaque raccordement.
          </p>
          <dl className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-4 text-center">
            <Compteur n={resume.retenues} label="API retenues" />
            <Compteur n={resume.opportunites} label="opportunités" />
            <Compteur n={resume.parEtat.ecrit + resume.parEtat.flux + resume.parEtat.jeton} label="déjà amorcées" />
          </dl>
        </section>

        <section className="mt-14 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-bold">Lire l'état d'un raccordement</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {(Object.keys(libelles.etat) as Etat[]).map((e) => (
              <li key={e} className="flex gap-3 text-sm">
                <span className={`mt-0.5 h-fit shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${COULEUR_ETAT[e]}`}>{libelles.etat[e]}</span>
                <span className="text-gray-300">{EXPLICATION_ETAT[e]}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="sticky top-0 z-10 -mx-6 mt-10 flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#0b0714]/90 px-6 py-3 backdrop-blur">
          <Filtre actif={univers === 'tous'} onClick={() => setUnivers('tous')}>Tous les éditeurs</Filtre>
          {universList.map(([id, u]) => (
            <Filtre key={id} actif={univers === id} onClick={() => setUnivers(id)}>
              {u.label.split(' — ')[0]}
            </Filtre>
          ))}
          <span className="mx-2 hidden h-5 w-px bg-white/15 md:block" />
          <Filtre actif={usage === 'tous'} onClick={() => setUsage('tous')}>Tous les usages</Filtre>
          {Object.entries(libelles.usage).map(([id, label]) => (
            <Filtre key={id} actif={usage === id} onClick={() => setUsage(id)}>
              {label}
            </Filtre>
          ))}
        </div>

        <div className="mt-8 space-y-8">
          {visibles.map((a, i) => (
            <article key={a.id} id={a.id} className="scroll-mt-24 rounded-3xl border border-white/10 bg-black/20 p-6 md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">{apiPower.univers[a.univers].label.split(' — ')[0]}</p>
                  <h2 className={`neon neon-${(i % 6) + 1} mt-1 text-2xl font-extrabold md:text-3xl`}>{a.nom}</h2>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${COULEUR_ETAT[a.etat]}`}>{libelles.etat[a.etat]}</span>
              </div>
              <p className="texte-neon mt-4 text-lg">{a.quoi}</p>
              {a.existant ? <p className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-gray-300">{a.existant}</p> : null}

              {a.opportunites.length ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {a.opportunites.map((o) => (
                    <div key={o.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold">{o.titre}</h3>
                        <span className="shrink-0 rounded-full bg-purple-500/20 px-2 py-0.5 text-[11px] font-semibold text-purple-200">{libelles.usage[o.usage]}</span>
                      </div>
                      <p className="mt-2 text-sm text-gray-300">{o.quoi}</p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Ce qui remonte</p>
                      <ul className="mt-1 space-y-1 text-sm text-gray-300">
                        {o.donnees.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Vos gestes</p>
                      <ul className="mt-1 space-y-1 text-sm text-gray-300">
                        {o.gestes.map((g) => (
                          <li key={g} className="flex gap-2">
                            <Check size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                            <span>{g}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-xs text-gray-500">
                        Dans le back-office : <span className="text-gray-300">{libelles.ecran[o.ecran]}</span>
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              <details className="mt-5 text-sm text-gray-400">
                <summary className="cursor-pointer text-gray-300">Prérequis chez {a.editeur}</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {a.prerequis.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p className="mt-2 flex flex-wrap gap-4">
                  <a href={a.doc} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-purple-300 hover:underline">
                    Documentation <ExternalLink size={12} />
                  </a>
                  <a href={a.console} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-purple-300 hover:underline">
                    Console <ExternalLink size={12} />
                  </a>
                </p>
              </details>
            </article>
          ))}
          {visibles.length === 0 ? <p className="text-center text-gray-400">Aucune API ne correspond à ce filtre.</p> : null}
        </div>

        <section className="mt-16 rounded-3xl border border-purple-400/30 bg-gradient-to-br from-[#160d2e] to-[#0b0714] p-8 text-center">
          <Zap className="mx-auto text-purple-300" size={28} />
          <h2 className="neon neon-4 mt-3 text-2xl font-extrabold md:text-3xl">Vos raccordements se font dans API Connect</h2>
          <p className="texte-neon mx-auto mt-3 max-w-2xl text-lg">
            Les jetons se collent une fois, ne sont jamais réaffichés, et chaque écran dit ce qui est lu — et ce qui ne l'est pas encore.
          </p>
          <Link
            to={isAuthed() ? '/api-links' : '/register'}
            className="btn-gradient mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold"
          >
            {isAuthed() ? 'Ouvrir API Connect' : 'Créer un compte — 120 drops offerts'}
          </Link>
        </section>
      </main>
    </div>
  )
}

function Compteur({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <dt className="neon neon-3 text-3xl font-extrabold md:text-4xl">{n}</dt>
      <dd className="mt-1 text-xs uppercase tracking-wider text-gray-400">{label}</dd>
    </div>
  )
}

function Filtre({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        actif ? 'border-purple-400 bg-purple-500/30 text-white' : 'border-white/15 bg-white/5 text-gray-300 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}
