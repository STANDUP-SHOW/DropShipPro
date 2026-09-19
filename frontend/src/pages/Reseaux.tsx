import { Share2, Info, BarChart3 } from 'lucide-react'
import { Layout } from '../components/Layout'
import { AgentBar } from '../components/AgentBar'
import { BandeReseaux } from '../components/BandeReseaux'
import { SocialConnect } from '../components/SocialConnect'
import { AdAccounts } from '../components/AdAccounts'
import { ListePubs } from '../components/ListePubs'

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
  return (
    <Layout>
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
    </Layout>
  )
}
