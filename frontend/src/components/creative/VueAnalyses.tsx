import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Lock } from 'lucide-react'
import { api } from '../../lib/api'
import { Markdown, blocsDe } from '../Markdown'
import { AnalysesRapports } from '../AnalysesRapports'
import { AppelSuivant, BarreCompacte, Entete, Fenetre, photoSecteur } from './Creative'

type Ligne = Awaited<ReturnType<typeof api.analysesRapports>>['analyses'][number]
type Complete = Awaited<ReturnType<typeof api.analyseRapport>>

function dateFr(iso: string, long = true): string {
  const d = new Date(iso + 'T12:00:00Z')
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long' })
}

const sources = (n: number) => (n > 1 ? `${n} sources consultées` : n === 1 ? '1 source consultée' : 'sources non relevées')

/**
 * Analyses réseaux (vue 03 de l'audit du 15/10/2026) : un magazine de veille.
 *
 * La une est la plus récente des analyses marketing des agents, les suivantes
 * en sommaire numéroté. Chaque article dit son rayon, sa date et le nombre de
 * sources consultées — ce que le rapport porte, rien de plus : il n'a pas de
 * note de confiance, et aucune n'est inventée. L'archive complète reste
 * dessous, filtrable par rayon.
 */
export function VueAnalyses() {
  const [lignes, setLignes] = useState<Ligne[] | null>(null)
  const [porte, setPorte] = useState<{ seuil: number; drops: number } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ouverte, setOuverte] = useState<Ligne | null>(null)

  useEffect(() => {
    api
      .analysesRapports({ type: 'marketing', limite: 12 })
      .then((d) => setLignes(Array.isArray(d?.analyses) ? d.analyses : []))
      .catch((e: Error & { status?: number; body?: { seuil?: number; drops?: number } }) => {
        setLignes([])
        if (e.status === 402) setPorte({ seuil: e.body?.seuil ?? 500, drops: e.body?.drops ?? 0 })
        else setErreur(e.message)
      })
  }, [])

  const une = lignes?.[0] ?? null
  const sommaire = (lignes ?? []).slice(1, 5)
  const photoUne = une ? photoSecteur({ categorie: une.categorie }) : null

  return (
    <>
      <div className="mt-3">
        <BarreCompacte>
          <span>
            <b>{lignes ? lignes.length : '…'}</b>
            {' analyses récentes'}
          </span>
          <span>
            {'Dernière : '}
            <b>{une ? dateFr(une.day, false) : lignes ? 'aucune' : '…'}</b>
          </span>
          <span>Une analyse par rayon et par jour, écrite par les agents.</span>
        </BarreCompacte>
      </div>

      <Entete
        surtitre="03 / Le carnet créatif"
        ligne1="Voir les signaux."
        ligne2="Trouver votre angle."
        chapo="Une veille qui nourrit la création : des idées lisibles, des sources à consulter, une prochaine action claire."
      />

      {porte ? (
        <div className="c-panneau mt-8 max-w-2xl p-6">
          <p className="flex items-center gap-2 font-bold">
            <Lock size={16} className="text-[var(--c-rose)]" /> Réservé aux comptes à {porte.seuil} drops et plus
          </p>
          <p className="mt-2 text-sm text-[var(--c-texte-2)]">
            Les analyses quotidiennes sont gratuites, mais il vous faut {porte.seuil} drops en banque : vous en avez{' '}
            {porte.drops}.
          </p>
          <Link to="/credits" className="c-bouton mt-4">
            Recharger mes drops
          </Link>
        </div>
      ) : (
        <div className="c-magazine mt-8">
          {une ? (
            <button type="button" className="c-une" onClick={() => setOuverte(une)}>
              {photoUne ? <img src={photoUne} alt="" /> : null}
              <p className="c-etiquette !text-[var(--c-rose)]">{`Le carnet du jour / ${dateFr(une.day)}`}</p>
              <p className="mt-3 text-[clamp(28px,3.2vw,44px)] font-extrabold leading-[1.05] tracking-tight">{une.titre}</p>
              {une.accroche ? <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#f4dce7]">{une.accroche}</p> : null}
              <p className="mt-4 text-xs text-[#f4dce7]">
                {[une.categorieNom, une.themeNom, sources(une.sources)].filter(Boolean).join(' · ')}
              </p>
              <span className="c-bouton mt-5 self-start">
                <span>Ouvrir le carnet</span>
                <ArrowUpRight size={15} />
              </span>
            </button>
          ) : (
            <div className="c-une">
              <p className="c-etiquette !text-[var(--c-rose)]">Le carnet du jour</p>
              <p className="mt-3 text-3xl font-extrabold leading-tight">
                {lignes === null ? 'Chargement…' : 'Aucune analyse déposée pour l’instant.'}
              </p>
              {lignes !== null ? (
                <p className="mt-3 text-sm text-[#f4dce7]">
                  Les agents en écrivent une par rayon et par jour ; elle paraît ici le matin.
                </p>
              ) : null}
              {erreur ? <p className="mt-3 text-sm text-red-300">{erreur}</p> : null}
            </div>
          )}

          <ol className="c-panneau divide-y divide-[var(--c-trait)] px-6">
            {sommaire.length === 0 ? (
              <li className="py-6 text-sm text-[var(--c-texte-2)]">
                Les analyses suivantes s'aligneront ici, la plus récente en tête.
              </li>
            ) : null}
            {sommaire.map((l, i) => (
              <li key={l.id}>
                <button type="button" onClick={() => setOuverte(l)} className="flex w-full gap-4 py-5 text-left">
                  <span className="c-numero">{String(i + 2).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="c-etiquette block">{[l.categorieNom, l.themeNom].filter(Boolean).join(' / ')}</span>
                    <span className="mt-1 block text-lg font-extrabold leading-snug">{l.titre}</span>
                    {l.accroche ? (
                      <span className="mt-1 line-clamp-2 block text-sm text-[var(--c-texte-2)]">{l.accroche}</span>
                    ) : null}
                    <span className="mt-1 block text-xs text-[var(--c-texte-2)]">
                      {`${dateFr(l.day, false)} · ${sources(l.sources)}`}
                    </span>
                  </span>
                  <ArrowUpRight size={16} className="mt-1 shrink-0 text-[var(--c-texte-2)]" />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <section className="mt-14">
        <p className="c-etiquette">Le parcours</p>
        <h2 className="c-h2 mt-2">De l'observation à la création.</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ['01', 'Observer', 'Identifier le signal, sa date et la source.'],
            ['02', 'Interpréter', 'Comprendre l’angle sans le confondre avec une preuve de performance.'],
            ['03', 'Créer', 'Préparer un brief et décliner une première piste.'],
          ].map(([n, t, d]) => (
            <div key={n} className="c-panneau p-5">
              <span className="c-numero">{n}</span>
              <p className="mt-3 text-lg font-extrabold">{t}</p>
              <p className="mt-1 text-sm text-[var(--c-texte-2)]">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {porte ? null : (
        <section className="mt-14">
          <h2 className="c-h2">Toutes les analyses.</h2>
          <p className="mt-2 text-sm text-[var(--c-texte-2)]">L'archive complète, par rayon, la plus récente en tête.</p>
          <AnalysesRapports type="marketing" avecFiltreCategorie />
        </section>
      )}

      <AppelSuivant question="Un angle vous inspire ?" libelle="Passer au prompt" to="/reseaux?vue=prompts" />

      {ouverte ? <Article ligne={ouverte} onClose={() => setOuverte(null)} /> : null}
    </>
  )
}

/** Un article du carnet, lu en entier, avec sa source et la suite : le brief. */
function Article({ ligne, onClose }: { ligne: Ligne; onClose: () => void }) {
  const [complete, setComplete] = useState<Complete | null>(null)
  const [echec, setEchec] = useState(false)

  useEffect(() => {
    api
      .analyseRapport(ligne.id)
      .then(setComplete)
      .catch(() => setEchec(true))
  }, [ligne.id])

  return (
    <Fenetre titre={ligne.titre} onClose={onClose} large>
      <p className="mt-1 text-xs text-[var(--c-texte-2)]">
        {[dateFr(ligne.day), ligne.categorieNom, ligne.themeNom, sources(ligne.sources)].filter(Boolean).join(' · ')}
      </p>
      {echec ? <p className="mt-4 text-sm text-red-300">Cette analyse n'a pas pu être ouverte.</p> : null}
      {!complete && !echec ? <p className="mt-4 text-sm text-[var(--c-texte-2)]">Ouverture…</p> : null}
      {complete ? (
        <div className="mt-4">
          {complete.accroche ? <p className="mb-3 text-sm">{complete.accroche}</p> : null}
          {blocsDe(complete.body ?? '').map((b) => (
            <section key={b.id} className="mt-4 first:mt-0">
              {b.titre ? <h3 className="font-bold text-[var(--c-violet)]">{b.titre}</h3> : null}
              <div className="mt-1">
                <Markdown texte={b.corps} />
              </div>
            </section>
          ))}
        </div>
      ) : null}
      <div className="c-panneau mt-5 p-4">
        <p className="c-etiquette">À transformer en brief</p>
        <p className="mt-2 text-sm text-[var(--c-texte-2)]">
          Définir un sujet principal, une accroche et une séquence visuelle. Garder le produit lisible à chaque étape.
          Une analyse décrit un signal observé ; ce n'est pas une preuve de performance.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/marketing?brief=1" className="c-bouton">
          <span>Préparer un brief</span>
          <ArrowUpRight size={15} />
        </Link>
        <Link
          to={`/fresh-news?categorie=${encodeURIComponent(ligne.categorie)}&jour=${ligne.day}`}
          className="c-bouton-sec"
        >
          Voir le journal de ce jour
        </Link>
      </div>
    </Fenetre>
  )
}
