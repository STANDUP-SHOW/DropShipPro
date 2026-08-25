import { useEffect, useState } from 'react'
import { Link2, X, Check } from 'lucide-react'
import { api } from '../lib/api'

/**
 * Les régies, et ce que chaque raccordement exige réellement.
 *
 * Ce ne sont pas des détails d'implémentation : ce sont des démarches que le
 * vendeur doit faire lui-même, au nom de son entreprise, et qui prennent des
 * semaines. Les écrire ici lui évite d'attendre un bouton magique.
 */
const REGIES = [
  {
    id: 'meta',
    label: 'Meta — Facebook et Instagram',
    exige: 'Un compte Business Manager, une page, et une application Meta validée par leur revue.',
    ou: 'business.facebook.com → Paramètres → Comptes publicitaires',
    idLabel: 'Identifiant du compte publicitaire (act_…)',
    console: 'https://developers.facebook.com/apps',
  },
  {
    id: 'google',
    label: 'Google Ads',
    exige: "Un compte Google Ads actif et un jeton de développeur, accordé après examen du compte.",
    ou: 'Google Ads → Outils → Accès et sécurité',
    idLabel: 'Numéro client Google Ads (123-456-7890)',
    console: 'https://ads.google.com/aw/apicenter',
  },
  {
    id: 'tiktok',
    label: 'TikTok Ads',
    exige: 'Un compte TikTok for Business et une application approuvée sur leur console développeur.',
    ou: 'TikTok Ads Manager → Compte → Informations',
    idLabel: 'Advertiser ID',
    console: 'https://business-api.tiktok.com',
  },
  {
    id: 'x',
    label: 'X Ads',
    exige: "Un compte publicitaire X et un accès à l'API Ads, accordé au cas par cas.",
    ou: 'ads.x.com → Paramètres du compte',
    idLabel: 'Account ID',
    console: 'https://developer.x.com',
  },
  {
    id: 'snapchat',
    label: 'Snapchat Ads',
    exige: 'Un compte Snap Business et une application enregistrée.',
    ou: 'Ads Manager → Paramètres du compte',
    idLabel: 'Ad Account ID',
    console: 'https://developers.snap.com',
  },
  {
    id: 'pinterest',
    label: 'Pinterest Ads',
    exige: 'Un compte professionnel Pinterest et un accès API validé.',
    ou: 'Ads Manager → Paramètres du compte publicitaire',
    idLabel: 'Ad Account ID',
    console: 'https://developers.pinterest.com',
  },
]

type Compte = Awaited<ReturnType<typeof api.listAdAccounts>>[number]
type Regie = (typeof REGIES)[number]

/**
 * Le raccordement d'une régie.
 *
 * Ce que l'application fait de ces identifiants aujourd'hui : elle les garde,
 * rien de plus. Ni diffusion, ni relevé de campagne ne sont écrits. C'est dit
 * ici, dans la fenêtre, avant que le vendeur colle son jeton — un compte marqué
 * « relié » qui ne remonte aucun chiffre se lit sinon comme une panne, et l'on
 * cherche pendant des jours un défaut qui n'existe pas.
 */
function Fenetre({
  regie,
  compte,
  onClose,
  onSaved,
}: {
  regie: Regie
  compte: Compte | undefined
  onClose: () => void
  onSaved: () => void
}) {
  const [accountId, setAccountId] = useState(compte?.accountId ?? '')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await api.saveAdAccount(regie.id, accountId.trim(), token.trim())
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setBusy(false)
    }
  }

  async function detach() {
    if (!window.confirm(`Détacher ${regie.label} ? Le jeton sera effacé.`)) return
    setBusy(true)
    try {
      await api.deleteAdAccount(regie.id)
      onSaved()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1633] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-bold">{`Relier ${regie.label}`}</h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
          À lire avant de coller quoi que ce soit : <b>ce compte sera conservé, rien de plus</b>.
          La diffusion depuis DropShipper et le relevé de vos campagnes ne sont pas encore écrits.
          Relier maintenant vous fait gagner l'étape le jour où ils le seront ; cela ne fera
          apparaître aucun chiffre aujourd'hui.
        </p>

        <p className="mt-4 text-xs leading-relaxed text-gray-400">
          <b>Ce qu'il faut :</b> {regie.exige}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {`Où le trouver : ${regie.ou}`}
        </p>
        <a
          href={regie.console}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1 inline-block text-xs text-purple-300 underline hover:text-purple-200"
        >
          Ouvrir la console développeur de la régie ↗
        </a>

        <label className="mt-4 block">
          <span className="text-xs text-gray-400">{regie.idLabel}</span>
          <input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-xs text-gray-400">
            {compte?.connected ? "Jeton d'accès (laissez vide pour garder l'actuel)" : "Jeton d'accès"}
          </span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            placeholder={compte?.connected ? '••••••••••••' : ''}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
          />
        </label>
        <p className="mt-1 text-[11px] text-gray-600">
          Le jeton n'est jamais réaffiché : une fois enregistré, il ne ressort plus du serveur.
        </p>

        {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}

        <div className="mt-5 flex justify-between gap-2">
          {compte?.connected ? (
            <button
              type="button"
              onClick={detach}
              disabled={busy}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
            >
              Détacher
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy || !accountId.trim() || (!token.trim() && !compte?.connected)}
            className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {busy ? 'Enregistrement…' : 'Relier'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AdAccounts() {
  const [comptes, setComptes] = useState<Compte[]>([])
  const [ouvert, setOuvert] = useState<Regie | null>(null)

  function recharger() {
    api.listAdAccounts().then(setComptes).catch(() => undefined)
  }

  useEffect(recharger, [])

  const relie = (id: string) => comptes.find((c) => c.network === id)

  return (
    <>
      <h2 className="mt-10 flex items-center gap-2 font-bold">
        <Link2 size={16} className="text-purple-300" />
        <span>Mes comptes publicitaires</span>
      </h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
        Cliquez une régie pour la relier. Le raccordement servira à deux choses : diffuser le visuel
        sans passer par un téléchargement, et rapatrier ici les chiffres de vos campagnes.{' '}
        <b>Ni l'une ni l'autre n'est encore écrite</b> — relier aujourd'hui conserve vos
        identifiants et vous fait gagner l'étape, rien de plus.
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {REGIES.map((r) => {
          const compte = relie(r.id)
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOuvert(r)}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{r.label}</span>
                  {compte?.connected ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">
                      <Check size={10} />
                      <span>relié</span>
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-gray-400">
                      non relié
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-gray-500">
                  {compte?.connected ? `Compte ${compte.accountId}` : r.exige}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {ouvert ? (
        <Fenetre
          regie={ouvert}
          compte={relie(ouvert.id)}
          onClose={() => setOuvert(null)}
          onSaved={recharger}
        />
      ) : null}
    </>
  )
}
