import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calculator, AlertTriangle, RotateCcw, MessageSquare, Info } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { AgentBar } from '../components/AgentBar'
import { api } from '../lib/api'
import { useDemo } from '../lib/demo'
import { BandeauDemo } from '../components/ModeDemo'
import { DEMO_COMPTA } from '../lib/demoJeux'

type Data = Awaited<ReturnType<typeof api.accounting>>

const euros = (v: number, devise = 'EUR') =>
  `${v.toFixed(2).replace('.', ',')} ${devise === 'EUR' ? '€' : devise}`

const moisLisible = (cle: string) => {
  const [annee, m] = cle.split('-')
  const noms = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  return `${noms[Number(m) - 1] ?? m} ${annee}`
}

/**
 * Comptabilité et service après-vente, au même endroit.
 *
 * Ce qui est entré, et ce qui menace d'en ressortir : un remboursement n'est
 * pas une commande de moins, c'est de la marge déjà dépensée qui revient en
 * arrière. Les lire dans deux écrans séparés fait sous-estimer le second.
 *
 * Rien n'est estimé. Ce sont les commandes enregistrées, et ce que ces chiffres
 * ne contiennent pas est écrit noir sur blanc — la TVA, les frais de
 * plateforme, le port facturé à l'acheteur. Un tableau qui laisse croire à une
 * comptabilité complète est plus dangereux que pas de tableau du tout.
 */
export default function Accounting() {
  const [data, setData] = useState<Data | null>(null)
  const [demo] = useDemo()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .accounting()
      .then(setData)
      .catch(() => setError('Les chiffres n’ont pas pu être chargés'))
  }, [])

  // En mode demo, le jeu d'exemple s'affiche meme si le vrai chargement rate.
  if (error && !demo) {
    return (
      <Layout>
        <p className="text-sm text-red-400">{error}</p>
      </Layout>
    )
  }

  if (!data && !demo) {
    return (
      <Layout>
        <p className="text-sm text-gray-500">Chargement…</p>
      </Layout>
    )
  }

  const affiche = demo ? (DEMO_COMPTA as unknown as Data) : (data as Data)

  const total = affiche.parPlateforme.reduce(
    (s, p) => ({
      commandes: s.commandes + p.commandes,
      rembourses: s.rembourses + p.rembourses,
      chiffre: s.chiffre + p.chiffre,
      marge: s.marge + p.marge,
    }),
    { commandes: 0, rembourses: 0, chiffre: 0, marge: 0 },
  )

  const plafond = Math.max(1, ...affiche.parMois.map((m) => m.chiffre))

  return (
    <Layout>
      <BlocSection id="finances" />
      <AgentBar
        agentKey="comptable"
        nom="Beatrice"
        emoji="🧮"
        exemple="Demandez a Beatrice : quelle TVA sur une vente hors UE ?"
      />

      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Calculator size={22} className="text-emerald-400" />
        <span>Comptabilité et SAV</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Ce qui est entré, et ce qui menace d'en ressortir. Les chiffres sont ceux de vos commandes
        enregistrées, jamais une estimation.
      </p>

      <div className="mt-4 flex max-w-3xl items-start gap-2 rounded-xl border border-sky-400/25 bg-sky-400/10 p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-sky-300" />
        <p className="text-xs leading-relaxed text-sky-100">{affiche.avertissement}</p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-500">Commandes</p>
          <p className="text-xl font-bold tabular-nums">{total.commandes}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-500">Chiffre d'affaires</p>
          <p className="text-xl font-bold tabular-nums text-purple-200">{euros(total.chiffre)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-500">Marge brute</p>
          <p
            className={
              total.marge >= 0
                ? 'text-xl font-bold tabular-nums text-emerald-300'
                : 'text-xl font-bold tabular-nums text-red-400'
            }
          >
            {euros(total.marge)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-gray-500">Remboursements</p>
          <p className="text-xl font-bold tabular-nums text-amber-300">{total.rembourses}</p>
        </div>
      </div>

      {/* ---------- Mois par mois ---------- */}
      <h2 className="mt-8 font-bold">Mois par mois</h2>
      {affiche.parMois.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Aucune commande enregistrée.</p>
      ) : (
        <>
          <div className="mt-3 flex items-end gap-2 rounded-xl border border-white/10 bg-white/5 p-4">
            {affiche.parMois.map((m) => (
              <div key={m.mois} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-gray-400">{euros(m.chiffre)}</span>
                <div
                  className="w-full rounded-t bg-gradient-to-t from-purple-500/40 to-purple-400"
                  style={{ height: `${Math.max(4, Math.round((m.chiffre / plafond) * 120))}px` }}
                  title={`${moisLisible(m.mois)} · ${euros(m.chiffre)}`}
                />
                <span className="text-[10px] text-gray-500">{moisLisible(m.mois)}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
            {[...affiche.parMois].reverse().map((m) => (
              <div key={m.mois} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium">{moisLisible(m.mois)}</span>
                <span className="flex items-center gap-4 text-xs">
                  <span className="text-gray-400">{`${m.commandes} vente(s)`}</span>
                  {m.rembourses ? (
                    <span className="text-amber-300">{`${m.rembourses} remb.`}</span>
                  ) : null}
                  <span className="tabular-nums text-purple-200">{euros(m.chiffre)}</span>
                  <span className={m.marge >= 0 ? 'tabular-nums text-emerald-300' : 'tabular-nums text-red-400'}>
                    {`${m.marge >= 0 ? '+' : ''}${euros(m.marge)}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---------- Par plateforme ---------- */}
      <h2 className="mt-8 font-bold">Par plateforme</h2>
      {affiche.parPlateforme.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Aucune vente enregistrée.</p>
      ) : (
        <div className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
          {affiche.parPlateforme.map((p) => (
            <div key={p.platform} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="font-medium">{p.platform}</span>
              <span className="flex items-center gap-4 text-xs">
                <span className="text-gray-400">{`${p.commandes} vente(s)`}</span>
                {p.rembourses ? <span className="text-amber-300">{`${p.rembourses} remb.`}</span> : null}
                <span className="tabular-nums text-purple-200">{euros(p.chiffre)}</span>
                <span className={p.marge >= 0 ? 'tabular-nums text-emerald-300' : 'tabular-nums text-red-400'}>
                  {`${p.marge >= 0 ? '+' : ''}${euros(p.marge)}`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ---------- SAV ---------- */}
      <h2 className="mt-10 flex items-center gap-2 font-bold">
        <AlertTriangle size={17} className="text-amber-300" />
        <span>Service après-vente</span>
      </h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
        Les échanges acheteurs encore ouverts, et les commandes remboursées. Marc, votre agent SAV,
        peut rédiger les réponses ; vous les relisez avant l'envoi.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <MessageSquare size={14} className="text-purple-300" />
            <span>{`Litiges et questions ouverts (${affiche.litiges.length})`}</span>
          </p>
          {affiche.litiges.length === 0 ? (
            <p className="mt-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-500">
              Aucun échange acheteur en cours.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
              {affiche.litiges.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2.5 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.customerName}</span>
                    <span className="block truncate text-gray-500">{l.subject || 'Sans objet'}</span>
                  </span>
                  <span className="shrink-0 text-gray-500">{l.platform}</span>
                  {l.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" /> : null}
                </li>
              ))}
            </ul>
          )}
          <Link to="/messages" className="mt-2 inline-block text-xs text-purple-300 underline">
            Ouvrir la messagerie
          </Link>
        </section>

        <section>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <RotateCcw size={14} className="text-amber-300" />
            <span>{`Remboursements (${affiche.remboursements.length})`}</span>
          </p>
          {affiche.remboursements.length === 0 ? (
            <p className="mt-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-500">
              Aucun remboursement enregistré.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
              {affiche.remboursements.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-xs">
                  <span className="min-w-0 flex-1 truncate">{r.titre}</span>
                  <span className="shrink-0 text-gray-500">{r.platform}</span>
                  <span className="shrink-0 tabular-nums text-amber-300">
                    {`-${euros(r.montant, r.devise)}`}
                  </span>
                  <span className="shrink-0 text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/agents/sav" className="mt-2 inline-block text-xs text-purple-300 underline">
            Parler à Marc, agent SAV
          </Link>
        </section>
      </div>

      <BandeauDemo />
    </Layout>
  )
}
