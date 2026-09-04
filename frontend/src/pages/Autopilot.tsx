import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plane, Play, AlertTriangle, Info } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

type Config = Awaited<ReturnType<typeof api.getAutopilot>>
type Run = Awaited<ReturnType<typeof api.autopilotRuns>>['runs'][number]

const ACTION_STYLE: Record<string, string> = {
  importé: 'text-emerald-300',
  publié: 'text-sky-300',
  écarté: 'text-gray-500',
  échec: 'text-red-400',
}

/**
 * Le pilote automatique.
 *
 * L'écran assume ce qu'il fait : il prend de l'argent et remplit un catalogue
 * pendant que le vendeur dort. Les garde-fous sont donc montrés avant les
 * réglages, et l'historique détaille chaque décision ligne par ligne.
 */
export default function Autopilot() {
  const [config, setConfig] = useState<Config | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [openRun, setOpenRun] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function loadRuns() {
    api.autopilotRuns().then((r) => setRuns(r.runs)).catch(() => undefined)
  }

  useEffect(() => {
    api.getAutopilot().then(setConfig).catch(() => setError('Réglages indisponibles'))
    loadRuns()
  }, [])

  if (!config) {
    return (
      <Layout>
        <p className="text-sm text-gray-500">{error ?? 'Chargement…'}</p>
      </Layout>
    )
  }

  const s = config.settings

  function update(patch: Partial<typeof s>) {
    setConfig((c) => (c ? { ...c, settings: { ...c.settings, ...patch } } : c))
  }

  async function save(next = s) {
    setSaving(true)
    setError(null)
    try {
      await api.saveAutopilot(next)
      setMessage('Réglages enregistrés')
      setTimeout(() => setMessage(null), 2000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function runNow() {
    setRunning(true)
    setError(null)
    setMessage(null)
    try {
      const r = await api.runAutopilot()
      setMessage(
        `${r.imported} importée(s), ${r.published} publiée(s), ${r.skipped} écartée(s), ${r.failed} en échec.`,
      )
      loadRuns()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  function toggleDestination(id: string) {
    const next = s.destinations.includes(id)
      ? s.destinations.filter((d) => d !== id)
      : [...s.destinations, id]
    update({ destinations: next })
  }

  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Plane size={22} className="text-emerald-400" />
        <span>Pilote automatique</span>
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        Chaque jour, il reprend les produits conseillés par vos chefs de rayon, importe ceux qui
        passent vos critères, et les publie.
      </p>

      <section className="mt-6 max-w-2xl rounded-xl border border-white/10 bg-white/5 p-5">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => {
              const next = { ...s, enabled: e.target.checked }
              update({ enabled: e.target.checked })
              save(next)
            }}
            className="h-5 w-5 accent-emerald-400"
          />
          <span className="font-semibold">
            {s.enabled ? 'Pilote automatique activé' : 'Pilote automatique désactivé'}
          </span>
        </label>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-400">Imports maximum par jour</label>
            <input
              type="number"
              min={1}
              max={50}
              value={s.dailyLimit}
              onChange={(e) => update({ dailyLimit: Number(e.target.value) || 1 })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              {`Soit ${s.dailyLimit} crédit(s) par jour au maximum.`}
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-400">Marge minimale exigée</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={1000}
                value={s.minMargin}
                onChange={(e) => update({ minMargin: Number(e.target.value) || 0 })}
                className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
              />
              <span className="text-sm text-gray-400">%</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              Un produit sans prix marché relevé est écarté : la marge est alors inconnue.
            </p>
          </div>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={s.requireEuStock}
            onChange={(e) => update({ requireEuStock: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-emerald-400"
          />
          <span className="text-sm">
            <span>N'importer que si le stock européen est confirmé</span>
            <span className="mt-0.5 block text-[11px] text-gray-500">
              Sévère : la plupart des trouvailles arrivent avec un stock « non vérifié ».
            </span>
          </span>
        </label>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={s.autoPublish}
            onChange={(e) => update({ autoPublish: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-emerald-400"
          />
          <span className="text-sm">
            <span>Publier automatiquement après import</span>
            <span className="mt-0.5 block text-[11px] text-gray-500">
              Sur les destinations cochées ci-dessous, sans repasser par vous.
            </span>
          </span>
        </label>

        {s.autoPublish && (
          <div className="mt-3 flex flex-wrap gap-2">
            {config.destinations.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDestination(d.id)}
                className={
                  s.destinations.includes(d.id)
                    ? 'rounded-full bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold text-emerald-300'
                    : 'rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5'
                }
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => save()}
            disabled={saving}
            className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            type="button"
            onClick={runNow}
            disabled={running || !s.enabled}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
          >
            <Play size={14} />
            <span>{running ? 'Passage en cours…' : 'Lancer un passage maintenant'}</span>
          </button>

          {message && <span className="text-xs text-emerald-300">{message}</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>

        {!s.enabled && (
          <p className="mt-3 flex items-center gap-1 text-xs text-gray-500">
            <Info size={13} />
            <span>Activez le pilote pour pouvoir lancer un passage.</span>
          </p>
        )}
      </section>

      <section className="mt-8 max-w-2xl">
        <h2 className="font-bold">Ce qu'il a fait</h2>
        <p className="mt-1 text-xs text-gray-500">
          Chaque passage, avec le détail de chaque décision. Vous devez pouvoir comprendre au réveil
          ce qui s'est décidé pendant la nuit.
        </p>

        {!runs.length && (
          <p className="mt-4 rounded-xl border border-dashed border-white/15 px-3 py-6 text-center text-xs text-gray-500">
            Aucun passage pour l'instant.
          </p>
        )}

        <ul className="mt-4 space-y-2">
          {runs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenRun(openRun === r.id ? null : r.id)}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10"
              >
                <p className="text-sm font-semibold">
                  {new Date(r.createdAt).toLocaleString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <p className="text-xs text-gray-500">
                  {`${r.imported} importée(s) · ${r.published} publiée(s) · ${r.skipped} écartée(s) · ${r.failed} en échec`}
                </p>
              </button>

              {openRun === r.id && Array.isArray(r.log) && (
                <ul className="mt-1 space-y-1 rounded-xl border border-white/10 bg-black/20 p-3">
                  {r.log.map((line, i) => (
                    <li key={i} className="flex flex-wrap gap-2 text-xs">
                      <span className={ACTION_STYLE[line.action] ?? 'text-gray-400'}>
                        {line.action}
                      </span>
                      <span className="text-gray-300">{line.titre}</span>
                      <span className="text-gray-500">{`— ${line.raison}`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-xs text-gray-500">
        Les produits proposés viennent de vos{' '}
        <Link to="/rayons" className="underline">
          chefs de rayon
        </Link>
        . Sans agent embauché, le pilote n'a rien à traiter.
      </p>

      {/*
        L'avertissement vit SOUS les blocs, pas avant — demandé le 05/09/2026 :
        un encart jaune en tête de page fait de l'anti-vente. La phrase « la
        publication automatique ne concerne que votre site et Shopify » était
        devenue fausse (45 destinations live et 87 canaux servis par flux) :
        retirée. Ne reste que la seule mise en garde qui protège le vendeur.
      */}
      <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
        <div className="text-xs leading-relaxed text-amber-100">
          <p>
            <b>Chaque import consomme un crédit</b> et remplit votre catalogue. Le plafond quotidien
            est la seule chose qui vous protège d'un agent trop généreux : commencez bas.
          </p>
          <p className="mt-1">
            Vinted, Leboncoin et Facebook Marketplace exigent que vous validiez vous-même — publier
            à votre place enfreindrait leurs conditions et ferait suspendre votre compte vendeur.
          </p>
        </div>
      </div>
    </Layout>
  )
}
