import { useSearchParams } from 'react-router-dom'
import { Share2, Info, BarChart3, Newspaper, Wand2 } from 'lucide-react'
import { Layout } from '../components/Layout'
import { AgentBar } from '../components/AgentBar'
import { LogosHeader } from '../components/LogosHeader'
import { BandeReseaux } from '../components/BandeReseaux'
import { SocialConnect } from '../components/SocialConnect'
import { AdAccounts } from '../components/AdAccounts'
import { ListePubs } from '../components/ListePubs'
import { AnalysesRapports } from '../components/AnalysesRapports'
import { PromptsRapports } from '../components/PromptsRapports'

/**
 * Trois vues, une page.
 *
 * Les comptes et la diffusion d'un côté ; de l'autre ce que les agents
 * déposent chaque matin : l'analyse réseaux sociaux du rayon, et les prompts
 * publicitaires prêts à coller. Le menu pointe directement sur une vue
 * (`?vue=analyses`, `?vue=prompts`) plutôt que sur une ancre : une ancre
 * n'ouvre rien quand le contenu n'est pas déjà rendu.
 */
const VUES = [
  { id: 'comptes' as const, label: 'Comptes et diffusion', icon: Share2 },
  { id: 'analyses' as const, label: 'Analyses', icon: Newspaper },
  { id: 'prompts' as const, label: 'Prompts IA', icon: Wand2 },
]

/**
 * Réseaux — où l'on branche ses comptes et d'où l'on diffuse.
 *
 * Ces trois sections vivaient au bas de Commercialisation, après la liste des
 * produits, et elles n'y avaient rien à faire : choisir quel produit mérite un
 * budget et raccorder un compte Meta ne se font ni le même jour ni dans le même
 * état d'esprit. Le vendeur qui vient relier un compte n'a pas à faire défiler
 * tout son catalogue pour l'atteindre.
 *
 * L'ordre de la page suit le geste : on voit ses réseaux, on branche ce qui
 * manque, puis on diffuse ce qui est déjà produit. Laurence reste en haut,
 * parce qu'une question sur un réseau se pose devant le réseau.
 */
export default function Reseaux() {
  const [params, setParams] = useSearchParams()
  const vue = (VUES.find((v) => v.id === params.get('vue'))?.id ?? 'comptes') as (typeof VUES)[number]['id']

  return (
    <Layout>
      <LogosHeader />

      <AgentBar
        agentKey="marketing"
        nom="Laurence"
        emoji="📣"
        exemple="Demandez a Laurence : sur quel reseau lancer ce produit en premier ?"
      />

      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Share2 size={22} className="text-purple-300" />
        <span>Réseaux</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Vos réseaux sociaux et vos régies publicitaires, et la diffusion des publicités déjà créées.
        Vous vous connectez chez Meta, TikTok ou Google — jamais chez nous.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {VUES.map((v) => {
          const Icone = v.icon
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                const suivant = new URLSearchParams(params)
                if (v.id === 'comptes') suivant.delete('vue')
                else suivant.set('vue', v.id)
                setParams(suivant)
              }}
              className={
                vue === v.id
                  ? 'inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold'
                  : 'inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-gray-400 hover:bg-white/5'
              }
            >
              <Icone size={15} />
              <span>{v.label}</span>
            </button>
          )
        })}
      </div>

      {vue === 'analyses' ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 font-bold">
            <Newspaper size={16} className="text-emerald-400" />
            <span>Analyses réseaux sociaux</span>
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
            L'analyse réseaux écrite chaque jour pour chaque rayon : social places, publicités en cours, tendances du
            jour et tendances publicitaires. La plus récente en tête ; cliquez une ligne pour la lire.
          </p>
          <AnalysesRapports type="marketing" avecFiltreCategorie />
        </section>
      ) : null}

      {vue === 'prompts' ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 font-bold">
            <Wand2 size={16} className="text-pink-300" />
            <span>Prompts IA</span>
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
            Les prompts publicitaires déposés chaque jour par les agents, images et vidéos, rangés par rayon. Copiez-en
            un et collez-le dans votre générateur : ils sont écrits pour être utilisés tels quels, format compris.
          </p>
          <PromptsRapports />
        </section>
      ) : null}

      {vue !== 'comptes' ? null : (
        <>
      <BandeReseaux />

      <div className="mt-4 flex max-w-3xl items-start gap-2 rounded-xl border border-sky-400/25 bg-sky-400/10 p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-sky-300" />
        <p className="text-xs leading-relaxed text-sky-100">
          Nous déposons <b>la créative</b>, pas le budget. Le ciblage et les enchères se règlent chez
          la régie, là où vous voyez ce que vous dépensez.
        </p>
      </div>

      {/* ---------- Raccordements ---------- */}
      <SocialConnect />

      <AdAccounts />

      {/* ---------- Suivi des campagnes ---------- */}
      <h2 className="mt-10 flex items-center gap-2 font-bold">
        <BarChart3 size={16} className="text-purple-300" />
        <span>Suivi de mes campagnes</span>
      </h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
        Cette place attend les chiffres de vos campagnes — dépense, impressions, clics, coût par
        acquisition, marge nette par produit — régie par régie. Elle restera vide tant qu'aucun
        compte n'est relié : afficher des chiffres inventés ou des exemples serait pire que le vide,
        puisque c'est sur eux qu'on décide de couper une campagne ou de la doubler.
      </p>
      <p className="mt-3 max-w-3xl rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-gray-400">
        En attendant, Laurence sait lire les chiffres que vous lui recopiez depuis le gestionnaire de
        la régie : donnez-lui la dépense, le nombre de ventes et le produit concerné, elle vous dira
        si la campagne gagne ou perd de l'argent, et à partir de quel coût par acquisition il faut
        l'arrêter.
      </p>

      {/* ---------- Les publicités, et le bouton qui les diffuse ---------- */}
      <h2 className="mt-10 flex items-center gap-2 font-bold">
        <Share2 size={16} className="text-purple-300" />
        <span>Mes publicités à diffuser</span>
      </h2>
      <p className="mt-1 mb-4 max-w-3xl text-xs leading-relaxed text-gray-500">
        Les publicités déjà créées par Laurence, rangées par annonce. Elles sont payées : les revoir,
        les télécharger et les diffuser ne coûte rien.
      </p>

      <ListePubs ouRelier="cette page" />
        </>
      )}
    </Layout>
  )
}
