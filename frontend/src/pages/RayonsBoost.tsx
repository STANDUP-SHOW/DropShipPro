import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Layout } from '../components/Layout'
import { PageCreative, Entete } from '../components/creative/Creative'
import { api } from '../lib/api'

/**
 * « Mon rayon BOOST » depuis la navigation 06 : il n'y a pas une page des
 * rayons boost mais une page par rayon (/rayon/<id>). On ouvre le premier
 * rayon en AUTO-MODE, sinon le premier confié ; sans rayon confié, on dit
 * où en confier un.
 */
export default function RayonsBoost() {
  const [cible, setCible] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    api
      .listDepartments()
      .then((l) => {
        const tous = Array.isArray(l) ? l : []
        setCible((tous.find((d) => d.autoMode) ?? tous[0])?.id ?? null)
      })
      .catch(() => setCible(null))
  }, [])

  if (cible) return <Navigate to={`/rayon/${cible}`} replace />

  return (
    <Layout>
      <PageCreative>
        <Entete
          surtitre="06 / Mon rayon BOOST"
          ligne1="Quel rayon souhaitez-vous"
          ligne2="booster ?"
          chapo="Un rayon BOOST est un rayon confié à son chef : il en surveille les produits, les prix et les tendances, et vous répond."
        />
        {cible === undefined ? (
          <p className="mt-8 text-sm text-[var(--c-texte-2)]">Chargement…</p>
        ) : (
          <div className="v-carte mt-8 max-w-2xl">
            <p className="text-sm text-[var(--c-texte-2)]">Aucun rayon n'est encore confié à un chef de rayon.</p>
            <Link to="/rayons" className="c-bouton mt-4 w-fit">
              <span>Choisir mes chefs de rayon</span>
              <ArrowUpRight size={15} />
            </Link>
          </div>
        )}
      </PageCreative>
    </Layout>
  )
}
