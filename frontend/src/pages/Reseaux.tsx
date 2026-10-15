import { useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { PageCreative } from '../components/creative/Creative'
import { VueDiffusion } from '../components/creative/VueDiffusion'
import { VueAnalyses } from '../components/creative/VueAnalyses'
import { VuePrompts } from '../components/creative/VuePrompts'

/**
 * Trois vues, une page : Réseaux & régies, Analyses réseaux, Prompts IA.
 *
 * Le menu pointe directement sur une vue (`?vue=analyses`, `?vue=prompts`)
 * plutôt que sur une ancre : une ancre n'ouvre rien quand le contenu n'est pas
 * déjà rendu. Depuis l'audit du 15/10/2026, chacune est une composition
 * distinte de la navigation commune des pages marketing (02, 03, 04).
 */
export default function Reseaux() {
  const [params] = useSearchParams()
  const vue = params.get('vue')

  return (
    <Layout>
      <PageCreative>
        {vue === 'analyses' ? <VueAnalyses /> : vue === 'prompts' ? <VuePrompts /> : <VueDiffusion />}
      </PageCreative>
    </Layout>
  )
}
