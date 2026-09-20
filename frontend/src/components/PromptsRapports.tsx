import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Check, Image, Video, Loader2, Lock } from 'lucide-react'
import { api } from '../lib/api'

/**
 * Les prompts publicitaires du jour, tirés des rapports marketing.
 *
 * Chaque rapport marketing porte deux sections de prompts — images et vidéos —
 * écrits pour être copiés tels quels, avec le format visé en tête
 * (« TikTok 9:16 — 15 s »). Ils restaient enfouis dans le corps du rapport :
 * personne n'ouvre un rapport de huit sections pour retrouver un prompt.
 *
 * **Le tri est par rayon**, comme le reste : un vendeur de bijoux n'a que faire
 * des prompts du rayon bricolage. Le genre (image ou vidéo) est celui de la
 * section d'où le prompt vient, jamais deviné au vocabulaire.
 *
 * Le bouton copie le prompt **sans son format** : c'est le texte qu'on colle
 * dans un générateur, et l'entête ferait une ligne de consigne parasite.
 */
type Prompt = Awaited<ReturnType<typeof api.promptsRapports>>['prompts'][number]

/*
 * Une charge utile d'une autre forme ne doit JAMAIS faire tomber la page.
 *
 * Le 20/09 les routes rapports ont changé de forme sous les écrans : `d.analyses`,
 * `d.produits`, `d.prompts` sont passés à `undefined`, et le premier `.length`
 * a emporté toute l'application derrière l'ErrorBoundary. Un contrat qui bouge
 * est un état vide à afficher — « aucun rapport » — pas un écran blanc.
 */
function liste<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

export function PromptsRapports({ rayon }: { rayon?: string }) {
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [jours, setJours] = useState<string[]>([])
  const [jour, setJour] = useState('')
  const [genre, setGenre] = useState<'tous' | 'image' | 'video'>('tous')
  const [categorie, setCategorie] = useState('')
  const [copie, setCopie] = useState<string | null>(null)
  const [chargement, setChargement] = useState(true)
  const [porte, setPorte] = useState<{ seuil: number; drops: number } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    setChargement(true)
    setErreur(null)
    setPorte(null)
    api
      .promptsRapports({ rayon, jour: jour || undefined })
      .then((d) => {
        setPrompts(liste<Prompt>(d?.prompts))
        if (!jour) setJours(liste<string>(d?.jours))
      })
      .catch((e: Error & { status?: number; body?: { seuil?: number; drops?: number } }) => {
        setPrompts([])
        if (e.status === 402) setPorte({ seuil: e.body?.seuil ?? 500, drops: e.body?.drops ?? 0 })
        else setErreur(e.message)
      })
      .finally(() => setChargement(false))
  }, [rayon, jour])

  const categories = useMemo(() => {
    const vues = new Map<string, string>()
    for (const p of prompts) vues.set(p.categorie, p.categorieNom ?? p.categorie)
    return [...vues].map(([id, nom]) => ({ id, nom }))
  }, [prompts])

  const affiches = prompts.filter(
    (p) => (genre === 'tous' || p.genre === genre) && (!categorie || p.categorie === categorie),
  )

  async function copier(p: Prompt) {
    try {
      await navigator.clipboard.writeText(p.texte)
      setCopie(p.id)
      setTimeout(() => setCopie(null), 1500)
    } catch {
      // Le presse-papiers est refusé hors contexte sûr : le texte reste sélectionnable.
    }
  }

  if (porte) {
    return (
      <div className="mt-5 max-w-2xl rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5">
        <p className="flex items-center gap-2 font-bold text-amber-100">
          <Lock size={16} /> Réservé aux comptes à {porte.seuil} drops et plus
        </p>
        <p className="mt-2 text-sm text-amber-100/90">
          Les prompts du jour sont offerts, mais il vous faut {porte.seuil} drops en banque : vous en avez {porte.drops}.
        </p>
        <Link to="/credits" className="btn-gradient mt-4 inline-flex rounded-lg px-4 py-2 text-sm font-semibold">
          Recharger mes drops
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(['tous', 'image', 'video'] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGenre(g)}
            className={
              genre === g
                ? 'rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold'
                : 'rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5'
            }
          >
            {g === 'tous' ? 'Tout' : g === 'image' ? 'Images' : 'Vidéos'}
          </button>
        ))}

        {categories.length > 1 ? (
          <select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
          >
            <option value="" className="bg-[#1b1633]">
              Tous les rayons
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#1b1633]">
                {c.nom}
              </option>
            ))}
          </select>
        ) : null}

        {jours.length > 1 ? (
          <select
            value={jour}
            onChange={(e) => setJour(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400/60"
          >
            <option value="" className="bg-[#1b1633]">
              Tous les jours
            </option>
            {jours.map((j) => (
              <option key={j} value={j} className="bg-[#1b1633]">
                {new Date(j + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {erreur ? <p className="text-sm text-red-400">{erreur}</p> : null}
      {chargement ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin" /> Chargement…
        </p>
      ) : null}

      {!chargement && affiches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
          <p className="text-sm text-gray-400">Aucun prompt publicitaire pour l'instant.</p>
          <p className="mt-2 text-xs text-gray-500">
            Les agents en déposent chaque jour, un jeu par rayon, dans leur rapport marketing.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {affiches.map((p) => {
          const Icone = p.genre === 'image' ? Image : Video
          return (
            <article key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Icone size={14} className={p.genre === 'image' ? 'text-sky-300' : 'text-pink-300'} />
                <span className="text-xs font-semibold text-gray-200">{p.format ?? (p.genre === 'image' ? 'Image' : 'Vidéo')}</span>
                <span className="text-[11px] text-gray-500">{p.categorieNom}</span>
                <button
                  type="button"
                  onClick={() => copier(p)}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs hover:bg-white/5"
                >
                  {copie === p.id ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
                  <span>{copie === p.id ? 'Copié' : 'Copier'}</span>
                </button>
              </div>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-gray-200">
                {p.texte}
              </pre>
              <p className="mt-2 text-[11px] text-gray-500">
                {new Date(p.day + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · {p.themeNom}
              </p>
            </article>
          )
        })}
      </div>
    </div>
  )
}
