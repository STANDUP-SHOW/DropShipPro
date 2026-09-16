import { BlocNotifications } from './BlocNotifications'
import { BlocExtension } from './BlocExtension'
import { BlocDrops } from './BlocDrops'

/**
 * La ligne sous le bandeau des six jauges.
 *
 * **Refondue le 16/09/2026, et la demande était précise :** même hauteur que les
 * statistiques du dessus, titre HORS du bloc, petites tuiles en dessous, et le
 * grand cadre retiré. Les proportions de largeur ne bougent pas — deux tiers à
 * gauche, un tiers à droite.
 *
 * Le raisonnement derrière la demande vaut d'être écrit : ces deux lignes
 * portent la même chose — des chiffres qu'on surveille d'un coup d'œil sur
 * toutes les pages. Les habiller différemment, l'une en cellules nues et
 * l'autre en panneaux encadrés à en-tête, faisait croire à deux natures
 * différentes et volait deux centimètres de hauteur à chaque page du site.
 *
 * Le tiers de droite se partage en deux : l'extension Chrome et le portefeuille
 * de drops, ce dernier venant du menu latéral — un solde n'est pas une
 * destination de navigation, c'est un chiffre, sa place est sur la ligne des
 * chiffres.
 */

/** Le titre d'une section, posé AU-DESSUS des tuiles et non dans un cadre. */
function Titre({ children }: { children: string }) {
  return (
    <h2 className="mb-1.5 px-0.5 text-[9px] font-bold uppercase leading-none tracking-widest text-gray-500">
      {children}
    </h2>
  )
}

export function BandeauNotifications() {
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <Titre>Notifications</Titre>
        <BlocNotifications />
      </section>

      <section className="lg:col-span-1">
        <Titre>Extension & portefeuille</Titre>
        {/* Deux tuiles à parts égales, du même gabarit que celles de gauche :
            c'est ce qui aligne les deux colonnes sur une seule hauteur. */}
        <div className="flex gap-2">
          <BlocExtension />
          <BlocDrops />
        </div>
      </section>
    </div>
  )
}
