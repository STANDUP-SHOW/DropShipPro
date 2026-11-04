import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { api, type SynthesePublique } from '../../lib/api'
import { dateLongue } from './Veille'

/**
 * The daily synthesis on Fresh Market News (Max, 04/11/2026): the day's
 * counters, a scrolling band of each rayon's flagship product, a carousel of
 * what rises on TikTok and Reels, and the day's news, each with its public
 * page at /fresh-market-news/<date>/<id>/ (served by the API, not React).
 * Public face only: no buying price, supplier, margin or ROI ever reaches it.
 * Nothing shows until a synthesis has been imported.
 */
export function SynthesesDuJour() {
  const [s, setS] = useState<SynthesePublique | null>(null)

  useEffect(() => {
    api
      .syntheses()
      .then((d) => setS(d?.derniere ?? null))
      .catch(() => setS(null))
  }, [])

  if (!s) return null
  const c = s.compteurs
  const phares = s.blocs?.bandeauPhares ?? []
  const tendances = s.blocs?.carrouselTendances ?? []
  const actualites = Array.isArray(s.actualites) ? s.actualites : []
  const chiffres: Array<[number, string]> = [
    [c.rayons, 'rayons analysés'],
    [c.produitsAnalyses, 'produits passés au crible'],
    [c.produitsPhares, 'produits phares'],
    [c.tendancesReseaux, 'tendances réseaux'],
    [c.aRisque, 'produits à éviter'],
  ]

  return (
    <section className="mt-10">
      <div className="v-titre-section">
        <div>
          <h2 className="c-h2">La synthèse du {dateLongue(s.date)}</h2>
          <p>Tous les rayons lus ensemble : ce qui ressort, ce qui monte, ce qu'il vaut mieux laisser de côté.</p>
        </div>
      </div>

      <div className="v-synthese-chiffres mt-5">
        {chiffres
          .filter(([n]) => n > 0)
          .map(([n, libelle]) => (
            <div key={libelle} className="v-synthese-chiffre">
              <b>{n}</b>
              <span>{libelle}</span>
            </div>
          ))}
      </div>

      {phares.length ? (
        <div className="c-bandeau mt-6" aria-label="Le produit phare de chaque rayon">
          <div className="c-bandeau-piste">
            {[0, 1].map((tour) => (
              <span key={tour} aria-hidden={tour === 1 || undefined}>
                {phares.map((p, i) => (
                  <span key={`${tour}-${i}`}>
                    {p.nom.toUpperCase()} <i>{p.rayon}</i>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {tendances.length ? (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--c-texte-2)]">Ce qui monte sur TikTok et Reels</p>
          <div className="v-carrousel mt-3">
            <div className="v-carrousel-piste" style={{ animationDuration: `${Math.max(30, tendances.length * 6)}s` }}>
              {[0, 1].map((tour) =>
                tendances.map((p, i) => (
                  <div key={`${tour}-${i}`} className="v-carrousel-carte" aria-hidden={tour === 1 || undefined}>
                    <span>{p.rayon}</span>
                    <b>{p.nom}</b>
                  </div>
                )),
              )}
            </div>
          </div>
        </div>
      ) : null}

      {actualites.length ? (
        <div className="v-synthese-actus mt-6">
          {actualites.map((a) => (
            <a key={a.id} className="v-carte v-synthese-actu" href={`/fresh-market-news/${s.date}/${a.id}/`}>
              <b>{a.titre}</b>
              {a.chapo ? <span>{a.chapo}</span> : null}
              <em>
                Lire l'article <ArrowUpRight size={13} />
              </em>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  )
}
