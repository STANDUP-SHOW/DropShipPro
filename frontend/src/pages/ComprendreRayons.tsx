import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Layout } from '../components/Layout'
import { PageCreative, Entete } from '../components/creative/Creative'
import { api } from '../lib/api'

/**
 * Public analyses, boosted rayons and Auto-SHIPPER, explained (Max, 23/10/2026).
 *
 * Three things that sound alike and are not: the daily analyses DropShipper
 * publishes for everyone (free, from 500 drops in the bank), the rayons a
 * seller selects in Auto-SHIPPER (free, they only pick what gets imported),
 * and a BOOSTED rayon (the seller's own chef writes a personal analysis, paid
 * at each pass). Prices come from GET /billing/plans, never written here.
 */
export default function ComprendreRayons() {
  const [tarifs, setTarifs] = useState<Record<string, number> | null>(null)

  useEffect(() => {
    api
      .listPlans()
      .then((p) => setTarifs(p.tarifs))
      .catch(() => setTarifs(null))
  }, [])

  const prix = (cle: string) => (tarifs && typeof tarifs[cle] === 'number' ? `${tarifs[cle]} drops` : 'quelques drops')

  return (
    <Layout>
      <PageCreative>
        <Entete
          surtitre="Comprendre"
          ligne1="Analyses offertes,"
          ligne2="rayons boostés."
          chapo="DropShipper vous offre chaque jour ses analyses et ses produits gagnants. Vous pouvez en plus booster les rayons de votre choix pour obtenir vos propres analyses, et laisser Auto-SHIPPER importer le tout."
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <section className="v-carte">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--c-texte-2)]">1 · Offert chaque jour</p>
            <h2 className="mt-2 text-lg font-bold text-[var(--c-texte)]">Les analyses DropShipper</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--c-texte-2)]">
              Chaque jour, DropShipper publie pour ses utilisateurs <b>24 analyses de rayon</b>, <b>24 analyses marketing</b> et{' '}
              <b>480 produits gagnants</b> (20 par rayon). Elles sont réalisées par nos agents d'analyse et publiées sur le site.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--c-texte-2)]">
              Elles sont gratuites pour tout compte qui a au moins <b>500 drops en banque</b>. Ce sont les mêmes pour tout le monde.
            </p>
            <Link to="/produits-gagnants" className="c-bouton mt-4 w-fit">
              <span>Voir les produits gagnants du jour</span>
              <ArrowUpRight size={15} />
            </Link>
          </section>

          <section className="v-carte">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--c-texte-2)]">2 · En option, payant</p>
            <h2 className="mt-2 text-lg font-bold text-[var(--c-texte)]">Booster un rayon</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--c-texte-2)]">
              Booster un rayon, c'est demander <b>votre propre analyse</b> à son chef de rayon : une analyse de marché sourcée et ses
              produits gagnants, faites pour vous seul. Deux vendeurs qui boostent le même rayon n'obtiennent pas les mêmes réponses.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-[var(--c-texte-2)]">
              <li>
                · <b>IA AUTO-MODE</b> du chef : une analyse par demi-journée tant qu'il est activé, {prix('autoModePassage')} par passage
                (rendus si le passage échoue).
              </li>
              <li>
                · <b>Ponctuellement</b>, depuis la page du rayon : une extraction de produits gagnants, {prix('gagnantExtrait')} par produit.
              </li>
            </ul>
            <p className="mt-2 text-sm leading-relaxed text-[var(--c-texte-2)]">Rien ne se lance sans vous : c'est vous qui l'activez.</p>
            <Link to="/rayons-boost" className="c-bouton mt-4 w-fit">
              <span>Booster un rayon</span>
              <ArrowUpRight size={15} />
            </Link>
          </section>

          <section className="v-carte">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--c-texte-2)]">3 · Tout automatique</p>
            <h2 className="mt-2 text-lg font-bold text-[var(--c-texte)]">Auto-SHIPPER IA</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--c-texte-2)]">
              Activé, Auto-SHIPPER importe chaque jour les produits gagnants <b>des rayons que vous sélectionnez</b> : lecture de la fiche
              fournisseur, annonce réécrite, photos, prix, publication. Sélectionner un rayon est gratuit ; la journée et chaque produit
              importé se paient en drops, comme indiqué sur sa page.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--c-texte-2)]">
              Un rayon sélectionné reçoit les produits gagnants offerts par DropShipper. S'il est <b>aussi boosté</b>, Auto-SHIPPER y ajoute
              les produits gagnants trouvés par votre chef de rayon : plus de choix sur les rayons qui comptent pour vous.
            </p>
            <Link to="/pilote" className="c-bouton mt-4 w-fit">
              <span>Régler Auto-SHIPPER</span>
              <ArrowUpRight size={15} />
            </Link>
          </section>
        </div>

        <section className="v-carte mt-4">
          <h2 className="text-lg font-bold text-[var(--c-texte)]">Un exemple : le rayon Électronique</h2>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-[var(--c-texte-2)]">
            <li>· Sélectionné dans Auto-SHIPPER, sans boost : Auto-SHIPPER importe les produits gagnants Électronique publiés par DropShipper.</li>
            <li>· Boosté, sans Auto-SHIPPER : votre chef écrit votre analyse et ses produits gagnants vous attendent sur la page du rayon.</li>
            <li>
              · Sélectionné <b>et</b> boosté : Auto-SHIPPER importe à la fois les produits gagnants de DropShipper et ceux de votre chef, dans la
              limite du nombre de produits par rayon que vous avez choisi.
            </li>
          </ul>
        </section>
      </PageCreative>
    </Layout>
  )
}
