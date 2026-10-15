import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, Copy, Lock } from 'lucide-react'
import { api } from '../../lib/api'
import { AppelSuivant, BarreCompacte, Entete, Fenetre, Filtres, photoSecteur } from './Creative'

type Prompt = Awaited<ReturnType<typeof api.promptsRapports>>['prompts'][number]

const GENRES = [
  { id: 'tous', label: 'Tout' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Vidéo' },
] as const

/** Un titre court tiré du prompt lui-même : le titre du rapport est le même pour tous ses prompts. */
function titreDe(texte: string): string {
  const phrase = texte.trim().split(/(?<=[.!?:])\s/)[0] ?? texte
  return phrase.length > 72 ? `${phrase.slice(0, 70).trimEnd()}…` : phrase
}

function jourFr(iso: string, long = false): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString(
    'fr-FR',
    long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long' },
  )
}

/**
 * Prompts IA (vue 04 de l'audit du 15/10/2026) : une bibliothèque visuelle.
 *
 * Les prompts sont ceux que les agents déposent chaque jour dans leur rapport
 * marketing, images et vidéos. Chaque carte porte la photo de son rayon comme
 * repère d'univers — jamais présentée comme un résultat du prompt. Le genre
 * (image ou vidéo) est celui de la section d'où le prompt vient.
 *
 * Le prompt s'ouvre dans un champ modifiable : on l'adapte à son produit,
 * puis on copie sa version, sans le format en tête — c'est le texte qu'on
 * colle dans un générateur.
 */
export function VuePrompts() {
  const [prompts, setPrompts] = useState<Prompt[] | null>(null)
  const [jours, setJours] = useState<string[]>([])
  const [jour, setJour] = useState('')
  const [genre, setGenre] = useState<(typeof GENRES)[number]['id']>('tous')
  const [categorie, setCategorie] = useState('')
  const [porte, setPorte] = useState<{ seuil: number; drops: number } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ouvert, setOuvert] = useState<Prompt | null>(null)
  const [toutVoir, setToutVoir] = useState(false)

  useEffect(() => {
    setPrompts(null)
    setErreur(null)
    setPorte(null)
    api
      .promptsRapports({ jour: jour || undefined })
      .then((d) => {
        setPrompts(Array.isArray(d?.prompts) ? d.prompts : [])
        if (!jour) setJours(Array.isArray(d?.jours) ? d.jours : [])
      })
      .catch((e: Error & { status?: number; body?: { seuil?: number; drops?: number } }) => {
        setPrompts([])
        if (e.status === 402) setPorte({ seuil: e.body?.seuil ?? 500, drops: e.body?.drops ?? 0 })
        else setErreur(e.message)
      })
  }, [jour])

  const categories = useMemo(() => {
    const vues = new Map<string, string>()
    for (const p of prompts ?? []) vues.set(p.categorie, p.categorieNom ?? p.categorie)
    return [...vues].map(([id, nom]) => ({ id, nom }))
  }, [prompts])

  const affiches = (prompts ?? []).filter(
    (p) => (genre === 'tous' || p.genre === genre) && (!categorie || p.categorie === categorie),
  )
  const images = (prompts ?? []).filter((p) => p.genre === 'image').length
  const videos = (prompts ?? []).filter((p) => p.genre === 'video').length

  return (
    <>
      <div className="mt-3">
        <BarreCompacte>
          <span>
            <b>{prompts ? images : '…'}</b>
            {' prompts image'}
          </span>
          <span>
            <b>{prompts ? videos : '…'}</b>
            {' prompts vidéo'}
          </span>
          <span>Déposés chaque jour par les agents, un jeu par rayon.</span>
        </BarreCompacte>
      </div>

      <Entete
        surtitre="04 / La bibliothèque d'idées"
        ligne1="L'inspiration."
        ligne2="Prête à travailler."
        chapo="Choisissez un univers, ouvrez le prompt et adaptez-le à votre produit. Les images sont des repères d'univers, pas des résultats garantis."
      />

      {porte ? (
        <div className="c-panneau mt-8 max-w-2xl p-6">
          <p className="flex items-center gap-2 font-bold">
            <Lock size={16} className="text-[var(--c-rose)]" /> Réservé aux comptes à {porte.seuil} drops et plus
          </p>
          <p className="mt-2 text-sm text-[var(--c-texte-2)]">
            Les prompts du jour sont offerts, mais il vous faut {porte.seuil} drops en banque : vous en avez {porte.drops}.
          </p>
          <Link to="/credits" className="c-bouton mt-4">
            Recharger mes drops
          </Link>
        </div>
      ) : (
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="c-h2">Votre prochain point de départ.</h2>
            {/* Les tris, groupés dans un seul bloc. */}
            <div className="c-panneau flex flex-wrap items-center gap-2 p-2">
              <Filtres options={GENRES} valeur={genre} onChange={setGenre} />
              {categories.length > 1 ? (
                <select
                  aria-label="Rayon"
                  value={categorie}
                  onChange={(e) => setCategorie(e.target.value)}
                  className="c-champ !w-auto !py-1.5 !text-xs"
                >
                  <option value="">Tous les rayons</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              ) : null}
              {jours.length > 1 ? (
                <select
                  aria-label="Jour"
                  value={jour}
                  onChange={(e) => setJour(e.target.value)}
                  className="c-champ !w-auto !py-1.5 !text-xs"
                >
                  <option value="">Tous les jours</option>
                  {jours.map((j) => (
                    <option key={j} value={j}>
                      {jourFr(j, true)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          {erreur ? <p className="mt-4 text-sm text-red-300">{erreur}</p> : null}
          {prompts === null ? <p className="mt-6 text-sm text-[var(--c-texte-2)]">Chargement…</p> : null}
          {prompts !== null && affiches.length === 0 ? (
            <div className="c-panneau mt-6 p-8 text-center">
              <p className="text-sm text-[var(--c-texte-2)]">Aucun prompt publicitaire pour ce choix.</p>
              <p className="mt-2 text-xs text-[var(--c-texte-2)]">
                Les agents en déposent chaque jour, un jeu par rayon, dans leur rapport marketing.
              </p>
            </div>
          ) : null}

          <ul className="c-galerie mt-6">
            {(toutVoir ? affiches : affiches.slice(0, 9)).map((p) => {
              const photo = photoSecteur({ categorie: p.categorie })
              return (
                <li key={p.id} className="c-profil">
                  <button type="button" className="c-vignette !rounded-none" onClick={() => setOuvert(p)}>
                    {photo ? <img src={photo} alt="" loading="lazy" /> : null}
                    <span className="c-vignette-voile">
                      <span className="uppercase">
                        {`${p.genre === 'image' ? 'Image' : 'Vidéo'} / ${p.format ?? 'format libre'}`}
                      </span>
                      <ArrowUpRight size={16} />
                    </span>
                  </button>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="c-etiquette">{`${p.categorieNom} · ${jourFr(p.day)}`}</p>
                    <p className="mt-2 font-extrabold leading-snug">{titreDe(p.texte)}</p>
                    <p className="mt-2 line-clamp-3 text-sm text-[var(--c-texte-2)]">{p.texte}</p>
                    <button
                      type="button"
                      onClick={() => setOuvert(p)}
                      className="mt-auto inline-flex items-center gap-1 self-start pt-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--c-lime)]"
                    >
                      Lire & copier le prompt <ArrowUpRight size={14} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          {affiches.length > 9 ? (
            <button type="button" onClick={() => setToutVoir((v) => !v)} className="c-bouton-sec mt-5">
              {toutVoir ? 'Réduire' : `Voir les ${affiches.length} prompts`}
            </button>
          ) : null}

          <p className="mt-6 text-xs text-[var(--c-texte-2)]">
            Un prompt vidéo est un scénario à utiliser dans un générateur externe. Utilisez votre propre photo de
            référence et vérifiez le résultat avant publication.
          </p>
        </section>
      )}

      <AppelSuivant
        question="Besoin d'une direction pour votre secteur ?"
        libelle="Rencontrer les spécialistes"
        to="/rayons"
      />

      {ouvert ? <FenetrePrompt prompt={ouvert} onClose={() => setOuvert(null)} /> : null}
    </>
  )
}

function FenetrePrompt({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const [texte, setTexte] = useState(prompt.texte)
  const [copie, setCopie] = useState(false)

  async function copier() {
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(true)
      setTimeout(() => setCopie(false), 1500)
    } catch {
      // Presse-papiers refusé hors contexte sûr : le texte reste sélectionnable.
    }
  }

  return (
    <Fenetre titre={titreDe(prompt.texte)} onClose={onClose} large>
      <p className="mt-1 text-xs text-[var(--c-texte-2)]">
        {[prompt.genre === 'image' ? 'Image' : 'Vidéo', prompt.format, prompt.categorieNom, prompt.themeNom, jourFr(prompt.day, true)]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        rows={10}
        aria-label="Prompt modifiable"
        className="c-champ mt-4 font-mono !text-xs leading-relaxed"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="c-bouton" onClick={copier}>
          {copie ? <Check size={14} /> : <Copy size={14} />}
          <span>{copie ? 'Copié' : 'Copier le prompt'}</span>
        </button>
        {texte !== prompt.texte ? (
          <button type="button" className="c-bouton-sec" onClick={() => setTexte(prompt.texte)}>
            Revenir au texte d'origine
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-[var(--c-texte-2)]">
        Utilisez votre propre photo de référence et vérifiez le résultat avant publication.
      </p>
    </Fenetre>
  )
}
