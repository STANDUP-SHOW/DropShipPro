import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldQuestion } from 'lucide-react'
import { api } from '../lib/api'

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`

type Roster = Awaited<ReturnType<typeof api.agentRoster>>
type Visuals = Awaited<ReturnType<typeof api.visualState>>
type Payment = { id: string; planId: string; amount: number; credits: number; createdAt: string }

/**
 * Ce que coûte chaque agent, au même endroit.
 *
 * Le prix était écrit sur la carte de l'agent, dans une autre page. Un vendeur
 * qui se demande où part son argent ne va pas relire onze fiches : il vient
 * ici. On y trouve donc les agents payants, les formules des chefs de rayon, et
 * ce qui est compris dans l'abonnement — dit explicitement, parce qu'un silence
 * se lit comme un supplément.
 */
export function AgentsCosts() {
  const [roster, setRoster] = useState<Roster | null>(null)
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof api.departmentCatalogue>> | null>(null)

  useEffect(() => {
    api.agentRoster().then(setRoster).catch(() => undefined)
    api.departmentCatalogue().then(setPlans).catch(() => undefined)
  }, [])

  const tous = roster ? [...roster.pipeline, ...roster.support] : []
  const payants = tous.filter((a) => a.monthly)
  const compris = tous.filter((a) => !a.monthly)

  return (
    <>
      <h2 className="text-lg font-bold">Ce que coûte chaque agent</h2>

      {payants.length ? (
        <>
          <p className="mt-1 text-sm text-gray-400">Agents qui se paient à part.</p>
          <div className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
            {payants.map((a) => (
              <div key={a.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-lg">{a.emoji}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{a.name}</span>
                    <span className="block truncate text-xs text-gray-500">{a.role}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold text-sky-300">
                    {`${euros(a.monthly!)} / mois`}
                  </span>
                  <span className="block text-[11px] text-gray-500">
                    {a.hired && a.paidUntil
                      ? `jusqu'au ${new Date(a.paidUntil).toLocaleDateString('fr-FR')}`
                      : 'pas embauché'}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <p className="mt-6 text-sm font-semibold">Chefs de rayon</p>
      <p className="mt-1 text-xs text-gray-500">
        Un tarif par rayon confié, et vingt-quatre heures offertes à l'embauche. Un abonnement
        expiré arrête l'agent mais conserve toutes ses trouvailles.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(plans?.plans ?? []).map((p) => (
          <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-lg font-bold">{euros(p.amount)}</p>
            <p className="text-xs font-semibold text-purple-200">{p.label}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{p.pitch}</p>
          </div>
        ))}
      </div>

      {roster?.rayons.length ? (
        <div className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
          {roster.rayons.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="truncate">{`${r.name} — ${r.label}`}</span>
              <span className={r.active ? 'shrink-0 text-xs text-emerald-300' : 'shrink-0 text-xs text-gray-500'}>
                {r.active && r.paidUntil
                  ? `jusqu'au ${new Date(r.paidUntil).toLocaleDateString('fr-FR')}`
                  : 'abonnement expiré'}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {compris.length ? (
        <>
          <p className="mt-6 text-sm font-semibold">Compris dans votre abonnement</p>
          <p className="mt-1 text-xs text-gray-500">
            Ceux-là ne vous coûtent rien de plus. Ce qui se décompte, ce sont les annonces qu'ils
            importent et les images qu'ils produisent, jamais leur présence.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {compris.map((a) => (
              <span
                key={a.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs"
              >
                <span>{a.emoji}</span>
                <span>{a.name}</span>
              </span>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}

/**
 * Le bloc noir : ce qu'un crédit paie réellement.
 *
 * Un vendeur qui voit son solde baisser sans comprendre pourquoi soupçonne le
 * compteur, puis l'application entière. Le détail est donc écrit noir sur
 * blanc, y compris ce qui ne coûte rien — c'est la moitié qui rassure.
 */
export function TransparenceCredits() {
  const [visuals, setVisuals] = useState<Visuals | null>(null)

  useEffect(() => {
    api.visualState().then(setVisuals).catch(() => undefined)
  }, [])

  const lignes: Array<{ quoi: string; combien: string; gratuit?: boolean }> = [
    { quoi: "Importer un produit — lecture de la fiche, réécriture complète par l'IA", combien: '1 annonce' },
    { quoi: 'Publier une annonce, sur une destination ou sur dix', combien: 'offert', gratuit: true },
    { quoi: 'Filigraner les photos', combien: 'offert', gratuit: true },
    { quoi: 'Poser une question à un chef de rayon, dans son rayon', combien: '1 annonce' },
    { quoi: 'Poser une question hors du rayon de cet agent', combien: 'rien, la réponse est refusée', gratuit: true },
    { quoi: "Parler aux agents du comptoir — hotline, commercial, SAV, livraisons, comptable", combien: 'offert', gratuit: true },
    { quoi: 'Analyser le marché d’un produit', combien: '1 annonce' },
    { quoi: 'Faire refaire une photo par Léa', combien: '1 image' },
    { quoi: 'Produire un visuel publicitaire, par format demandé', combien: '1 image' },
  ]

  return (
    <section className="mt-10 rounded-2xl border border-white/10 bg-black/60 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <ShieldQuestion size={17} className="text-purple-300" />
        <span>Transparence crédits IA</span>
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">
        Ce que chaque geste décompte, sans exception. Les deux compteurs sont séparés : les
        <b> annonces</b> paient le texte et l'analyse, les <b>images</b> paient ce que produisent les
        agents visuels. L'un ne se convertit pas en l'autre.
      </p>

      <ul className="mt-4 divide-y divide-white/10">
        {lignes.map((l) => (
          <li key={l.quoi} className="flex items-baseline justify-between gap-4 py-2 text-xs">
            <span className="text-gray-300">{l.quoi}</span>
            <span
              className={
                l.gratuit
                  ? 'shrink-0 font-semibold text-emerald-300'
                  : 'shrink-0 font-semibold text-purple-200'
              }
            >
              {l.combien}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-gray-500">
        Quand un agent échoue — modèle injoignable, génération refusée — rien n'est décompté, et ce
        qui avait été pris est rendu. Un import dont la réécriture n'aboutit pas vous laisse le texte
        du fournisseur et votre crédit.
      </p>

      {visuals ? (
        <p className="mt-3 text-[11px] text-gray-500">
          {`Solde images : ${visuals.credits}. `}
          <Link to="/marketing-photo" className="underline hover:text-gray-300">
            Recharger
          </Link>
        </p>
      ) : null}
    </section>
  )
}

/**
 * La dépense mois par mois.
 *
 * Un graphique dessiné à la main plutôt qu'une bibliothèque de plus : neuf
 * barres et une échelle ne valent pas cent kilo-octets de code tiers dans un
 * paquet que tout le monde télécharge.
 */
export function DepenseParMois({ payments }: { payments: Payment[] }) {
  if (!payments.length) {
    return (
      <p className="mt-3 text-sm text-gray-500">
        Aucun paiement pour l'instant : il n'y a rien à tracer.
      </p>
    )
  }

  const parMois = new Map<string, number>()
  for (const p of payments) {
    const d = new Date(p.createdAt)
    const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    parMois.set(cle, (parMois.get(cle) ?? 0) + p.amount)
  }

  const mois = [...parMois.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
  const plafond = Math.max(...mois.map(([, v]) => v))
  const total = mois.reduce((s, [, v]) => s + v, 0)

  return (
    <>
      <div className="mt-4 flex items-end gap-2 rounded-xl border border-white/10 bg-white/5 p-4">
        {mois.map(([cle, montant]) => {
          const [annee, m] = cle.split('-')
          return (
            <div key={cle} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] tabular-nums text-gray-400">{euros(montant)}</span>
              <div
                className="w-full rounded-t bg-gradient-to-t from-purple-500/40 to-purple-400"
                style={{ height: `${Math.max(4, Math.round((montant / plafond) * 120))}px` }}
                title={`${cle} · ${euros(montant)}`}
              />
              <span className="text-[10px] text-gray-500">
                {`${m}/${annee.slice(2)}`}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {`${euros(total)} sur ${mois.length} mois, soit ${euros(Math.round(total / mois.length))} par mois en moyenne.`}
      </p>
    </>
  )
}
