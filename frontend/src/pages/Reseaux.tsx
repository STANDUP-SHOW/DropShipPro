import { useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { PageCreative } from '../components/creative/Creative'
import { VueDiffusion } from '../components/creative/VueDiffusion'
import { VueAnalyses } from '../components/creative/VueAnalyses'
import { VuePrompts } from '../components/creative/VuePrompts'
import { MesAnalysesAds } from '../components/desktop/MesAnalysesAds'

/**
 * Trois vues, une page : Réseaux & régies, Analyses réseaux, Prompts IA.
 *
 * Le menu pointe directement sur une vue (`?vue=analyses`, `?vue=prompts`)
 * plutôt que sur une ancre : une ancre n'ouvre rien quand le contenu n'est pas
 * déjà rendu. Depuis l'audit du 15/10/2026, chacune est une composition
 * distinte de la navigation commune des pages marketing (02, 03, 04).
 */
export default function Reseaux() {
  const [params, setParams] = useSearchParams()
  const vue = params.get('vue')
  // Analyses réseaux : celles des agents DropShipper, ou les miennes (AdsAnalyser, DESKTOP POWER du 24/10/2026).
  const perso = vue === 'analyses' && params.get('source') === 'perso'

  return (
    <Layout>
      <PageCreative>
        {vue === 'analyses' ? (
          <div className="mt-3 flex gap-2 text-xs">
            {[
              { id: null, label: 'Analyses DropShipper' },
              { id: 'perso', label: 'Mes analyses perso' },
            ].map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => setParams(f.id ? { vue: 'analyses', source: f.id } : { vue: 'analyses' })}
                className={`rounded-full border px-3 py-1 font-semibold ${(f.id === 'perso') === perso ? 'border-[var(--c-rose,#ffa2c7)] text-white' : 'border-white/15 text-gray-400'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
        {perso ? (
          <div className="mt-6">
            <MesAnalysesAds />
          </div>
        ) : vue === 'analyses' ? (
          <VueAnalyses />
        ) : vue === 'prompts' ? (
          <VuePrompts />
        ) : (
          <VueDiffusion />
        )}
      </PageCreative>
    </Layout>
  )
}
