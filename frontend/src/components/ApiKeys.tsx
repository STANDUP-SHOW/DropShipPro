import { useEffect, useState } from 'react'
import { KeyRound, Plus, Copy, Check, ShieldOff, AlertTriangle } from 'lucide-react'
import { api, apiRoot } from '../lib/api'

interface Key {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

function since(iso: string | null) {
  if (!iso) return 'jamais utilisée'
  return `dernier appel le ${new Date(iso).toLocaleDateString('fr-FR')}`
}

/**
 * Les clés d'API machine.
 *
 * Elles servent à un agent extérieur qui dépose ses trouvailles dans la boîte à
 * opportunités. Volontairement séparées des connexions marketplace : une clé ne
 * donne accès qu'à ce dépôt, jamais au catalogue, au paiement ni au compte.
 */
export function ApiKeys() {
  const [keys, setKeys] = useState<Key[]>([])
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function load() {
    api.listApiKeys().then(setKeys).catch(() => setError('Impossible de charger vos clés'))
  }

  useEffect(load, [])

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const created = await api.createApiKey(name.trim())
      setFresh({ name: created.name, key: created.key })
      setName('')
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(k: Key) {
    if (!window.confirm(`Révoquer « ${k.name} » ? L'agent qui l'utilise sera coupé immédiatement.`)) return
    try {
      await api.revokeApiKey(k.id)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const endpoint = `${apiRoot || window.location.origin}/api/agent/opportunities`
  const active = keys.filter((k) => !k.revokedAt)
  const revoked = keys.filter((k) => k.revokedAt)

  return (
    <div className="mt-6 max-w-lg rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <KeyRound size={16} className="text-amber-400" />
        <span>Clés pour mes agents</span>
      </h2>
      <p className="mt-1 text-xs text-gray-400">
        Une clé permet à un agent de veille de déposer ses trouvailles dans votre boîte à
        opportunités. Elle ne donne accès à rien d'autre : ni à votre catalogue, ni à vos moyens de
        paiement, ni à votre compte.
      </p>

      {fresh && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-amber-200">
            <AlertTriangle size={14} />
            <span>{`Copiez « ${fresh.name} » maintenant — elle ne sera plus affichée.`}</span>
          </p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={fresh.key}
              onFocus={(e) => e.target.select()}
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs outline-none"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(fresh.key)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFresh(null)}
            className="mt-2 text-xs text-amber-200/70 underline"
          >
            J'ai copié la clé
          </button>
        </div>
      )}

      {!keys.length && (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 px-3 py-4 text-center text-xs text-gray-500">
          Aucune clé — inutile tant que vous n'avez pas d'agent de veille.
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {active.map((k) => (
          <li
            key={k.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{k.name}</p>
              <p className="truncate font-mono text-xs text-gray-500">{`${k.prefix}… — ${since(k.lastUsedAt)}`}</p>
            </div>
            <button
              type="button"
              onClick={() => revoke(k)}
              title="Révoquer"
              className="shrink-0 rounded-lg border border-white/10 p-2 text-gray-400 hover:bg-white/5 hover:text-red-400"
            >
              <ShieldOff size={14} />
            </button>
          </li>
        ))}
        {revoked.map((k) => (
          <li key={k.id} className="rounded-xl border border-white/5 bg-black/10 p-3 opacity-50">
            <p className="truncate text-sm line-through">{k.name}</p>
            <p className="text-xs text-gray-500">Révoquée</p>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="Nom de l'agent (ex. Veille high-tech)"
          className="flex-1 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none"
        />
        <button
          type="button"
          onClick={create}
          disabled={busy || !name.trim()}
          className="btn-gradient inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
        >
          <Plus size={14} />
          <span>Créer</span>
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-xs text-gray-400">Adresse où l'agent dépose ses trouvailles</p>
        <input
          readOnly
          value={endpoint}
          onFocus={(e) => e.target.select()}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 font-mono text-xs outline-none"
        />
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-gray-300">
{`POST ${endpoint}
Authorization: Bearer VOTRE_CLE
Content-Type: application/json

{"opportunities": [{
  "source": "temu",
  "sourceUrl": "https://…",
  "title": "Casque sans fil ANC",
  "sourcePrice": 18.90,
  "marketPrice": 59.90,
  "salesCount": 4200,
  "euStock": true,
  "deliveryDays": 4,
  "warranty": "2 ans",
  "category": "Casques",
  "notes": "Pourquoi ce produit"
}]}`}
        </pre>
        <p className="mt-2 text-xs text-gray-500">
          Seuls <b className="text-gray-400">source</b>, <b className="text-gray-400">sourceUrl</b>,{' '}
          <b className="text-gray-400">title</b> et <b className="text-gray-400">sourcePrice</b> sont
          obligatoires. Laissez un champ vide plutôt que de l'inventer : un nombre de ventes à zéro
          se lit « ne se vend pas ».
        </p>
      </div>
    </div>
  )
}
