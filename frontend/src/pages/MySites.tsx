import { useState } from 'react'
import { Store, ChevronDown } from 'lucide-react'
import { Layout } from '../components/Layout'
import { MyShops } from '../components/MyShops'
import { ControlAgentToggle } from '../components/ControlAgentToggle'
import { WatermarkSettings } from '../components/WatermarkSettings'

/**
 * Mes sites : tout ce qui décrit une boutique, au même endroit.
 *
 * Ce que ça remplace : un écran « Réglages » qui empilait la boutique, le
 * filigrane, les clés d'API, les identifiants de places de marché et
 * l'extension. Cinq sujets sans rapport, et le seul qui se règle vraiment
 * souvent — une boutique de plus, un logo qui change — était au milieu.
 *
 * L'ordre suit le geste : on décrit ses boutiques, puis on dit comment leurs
 * photos sont signées, puis on décide si un agent relit les imports. Le reste
 * est parti ailleurs :
 *
 * - **Les identifiants de places de marché** vivent maintenant dans les onglets
 *   Vente et Acquisition, à côté de la plateforme concernée. Les régler à
 *   distance de la fiche qui les explique n'avait aucun sens.
 * - **La sécurité et l'extension** restent dans Réglages, qui ne contient plus
 *   qu'elles — deux choses qu'on fait une fois.
 * - **Les clés pour agents** ont été retirées : elles décrivaient un
 *   raccordement que personne n'utilisait.
 */
export default function MySites() {
  return (
    <Layout>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Store size={22} className="text-purple-300" />
          <span>Mes sites</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          Chaque boutique a son nom, ses rayons, son adresse de flux et son logo. Les annonces que
          vous y rangez n'apparaissent que dans son catalogue — un vendeur qui tient un site de mode
          et un site high-tech ne mélange jamais les deux.
        </p>
      </div>

      <MyShops />

      {/*
        Le filigrane par défaut du compte, replié.

        Il faisait doublon : chaque bloc de boutique porte déjà son propre
        filigrane, et celui-ci s'étalait en dessous comme s'il fallait le régler
        aussi. Le retirer tout à fait aurait pourtant coûté quelque chose — c'est
        lui que reprend une boutique dont un champ vaut « comme le compte », et
        sans écran pour le poser cette valeur ne serait plus réglable nulle part.

        Replié, donc : présent pour qui le cherche, absent pour qui ne le
        cherche pas.
      */}
      <FiligranePorDefaut />

      <ControlAgentToggle />
    </Layout>
  )
}

/**
 * Le filigrane du compte, derrière un dépli.
 *
 * Ce n'est pas un réglage qu'on ouvre : c'est la valeur de repli des boutiques
 * qui n'ont rien posé. Un vendeur qui n'a qu'une boutique la règle dans son
 * bloc et ne viendra jamais ici ; celui qui en a quatre y passe une fois pour
 * ne pas recopier la même signature quatre fois.
 */
function FiligranePorDefaut() {
  const [ouvert, setOuvert] = useState(false)

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center gap-2 p-4 text-left transition hover:bg-white/[0.05]"
      >
        <ChevronDown
          size={15}
          className={`shrink-0 text-gray-400 transition ${ouvert ? '' : '-rotate-90'}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Filigrane par défaut du compte</p>
          <p className="text-[11px] text-gray-500">
            Repris par les boutiques dont un réglage vaut « comme le compte ».
          </p>
        </div>
      </button>
      {ouvert ? (
        <div className="border-t border-white/10">
          <WatermarkSettings />
        </div>
      ) : null}
    </section>
  )
}
