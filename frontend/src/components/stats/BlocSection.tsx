import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BlocStats, type BlocData } from './TuileStat'
import { blocsDemo } from '../../lib/statsDemo'
import { useDemo } from '../../lib/demo'
import { api } from '../../lib/api'

/**
 * Le bloc de statistiques d'une partie, posé en tête de sa page.
 *
 * **C'est la moitié du plan du 03/09/2026** : « chaque partie a son accueil
 * sur sa page statistiques, et les pages reliées ensuite ». L'accueil général
 * empile les quatorze blocs ; chaque page de section ouvre sur le sien — même
 * adresse, même calcul, donc jamais deux chiffres différents pour la même
 * chose selon l'écran.
 *
 * Le mode démonstration suit la même règle qu'à l'accueil : il ne s'affiche
 * QUE si la pilule DÉMO est levée (compte de démonstration). Une page de
 * section ne dit jamais autre chose que le tableau de bord.
 */
export function BlocSection({ id }: { id: string }) {
  const [bloc, setBloc] = useState<BlocData | null>(null)
  const [demo, setDemo] = useState(false)
  /*
   * Le mode DEMO n'est levé que par la pilule du tableau de bord (compte de
   * démonstration uniquement). Plus AUCUN automatisme de « compte vide » : une
   * page de section montre les vraies données, vides comprises, exactement
   * comme le tableau de bord (règle du 11/09/2026).
   */
  const [demoGlobal] = useDemo()

  useEffect(() => {
    const au = new Date()
    const du = new Date(au.getTime() - 30 * 86400000)
    api
      .tableauStats(du, au)
      .then((r) => {
        const blocs = demoGlobal ? blocsDemo(r.blocs) : r.blocs
        setBloc(blocs.find((b) => b.id === id) ?? null)
        setDemo(demoGlobal)
      })
      .catch(() => {
        // Les statistiques sont un bandeau, pas la page : leur panne ne doit
        // jamais empêcher de travailler en dessous.
      })
  }, [id, demoGlobal])

  if (!bloc) return null

  return (
    <div className="mb-5">
      <BlocStats bloc={bloc} />
      <p className="mt-1.5 text-right text-[10px] text-gray-600">
        {demo ? 'Chiffres de démonstration — vos ventes les remplaceront. ' : 'Trente derniers jours. '}
        <Link to="/statistiques" className="text-purple-400/80 underline-offset-2 hover:underline">
          Tableau de bord complet
        </Link>
      </p>
    </div>
  )
}
