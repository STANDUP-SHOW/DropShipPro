import { useEffect, useState } from 'react'
import { Link2, RefreshCw, AlertTriangle, Check, Megaphone, Loader2 } from 'lucide-react'
import { api } from '../lib/api'

type Etat = Awaited<ReturnType<typeof api.socialState>>

/**
 * Raccorder ses réseaux et ses régies publicitaires.
 *
 * **Le point qui rassure, et qui est vrai :** le vendeur s'authentifie chez
 * Meta, TikTok ou Google — jamais chez nous, jamais chez le moteur qui tient la
 * liaison. Aucun mot de passe ne transite par DropShipper. C'est la même règle
 * que pour les places de marché : nous ne rejouons jamais d'identifiants.
 *
 * Les réseaux et les régies sont séparés parce que ce ne sont pas les mêmes
 * gestes. Une page Facebook publie des posts ; un compte Meta Ads achète de la
 * publicité. Les mélanger produit le refus le plus obscur qui soit — « ce compte
 * ne peut pas créer de campagne » — trois écrans après le clic.
 */

/** Ce que le vendeur reconnaît, plutôt que la clé technique. */
const NOMS: Record<string, { label: string; emoji: string }> = {
  facebook: { label: 'Facebook', emoji: '👥' },
  instagram: { label: 'Instagram', emoji: '📷' },
  tiktok: { label: 'TikTok', emoji: '🎵' },
  youtube: { label: 'YouTube', emoji: '▶️' },
  linkedin: { label: 'LinkedIn', emoji: '💼' },
  x: { label: 'X', emoji: '✖️' },
  pinterest: { label: 'Pinterest', emoji: '📌' },
  threads: { label: 'Threads', emoji: '🧵' },
  'meta-ads': { label: 'Meta Ads', emoji: '📣' },
  'google-ads': { label: 'Google Ads', emoji: '🔍' },
  'tiktok-ads': { label: 'TikTok Ads', emoji: '🎯' },
  'linkedin-ads': { label: 'LinkedIn Ads', emoji: '📊' },
  'pinterest-ads': { label: 'Pinterest Ads', emoji: '📐' },
  'x-ads': { label: 'X Ads', emoji: '📈' },
}

const nomDe = (p: string) => NOMS[p] ?? { label: p, emoji: '🔗' }

export function SocialConnect() {
  const [etat, setEtat] = useState<Etat | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = () =>
    api
      .socialState()
      .then(setEtat)
      .catch(() => setErreur("L'état des raccordements n'a pas pu être lu."))

  useEffect(() => {
    charger()
  }, [])

  async function relier(platform: string) {
    setBusy(platform)
    setErreur(null)
    try {
      // L'adresse de retour ramène le vendeur ici même : revenir sur l'accueil
      // après une autorisation donne l'impression que rien ne s'est passé.
      const { url } = await api.socialConnect(platform, window.location.href)
      window.location.href = url
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Connexion impossible.')
      setBusy(null)
    }
  }

  async function rafraichir() {
    setBusy('sync')
    setErreur(null)
    try {
      await api.socialSync()
      await charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Relecture impossible.')
    } finally {
      setBusy(null)
    }
  }

  if (!etat) return null

  /* Rien n'est branché côté serveur : le dire, sans promettre de date. */
  if (!etat.configure) {
    return (
      <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="flex items-center gap-2 font-bold">
          <Link2 size={17} className="text-purple-300" />
          <span>Réseaux sociaux et publicités</span>
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
          Le raccordement direct aux régies — publier une campagne depuis ici, suivre ses
          performances — n'est pas encore activé sur ce serveur. En attendant, « Diffuser » télécharge
          la créative et ouvre le gestionnaire de la régie.
        </p>
      </section>
    )
  }

  const relies = (pub: boolean) => etat.comptes.filter((c) => c.isAdAccount === pub)

  const groupes = [
    {
      titre: 'Réseaux sociaux',
      aide: 'Pour publier des posts. Une page Facebook, un compte Instagram, une chaîne TikTok.',
      plateformes: etat.reseaux,
      comptes: relies(false),
      pub: false,
    },
    {
      titre: 'Régies publicitaires',
      aide: "Pour acheter de la publicité. C'est un compte différent de la page : Meta Ads n'est pas Facebook.",
      plateformes: etat.regies,
      comptes: relies(true),
      pub: true,
    },
  ]

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <Link2 size={17} className="text-purple-300" />
            <span>Réseaux sociaux et publicités</span>
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500">
            Vous vous connectez chez Meta, TikTok ou Google — jamais chez nous. Aucun mot de passe ne
            passe par DropShipper.
          </p>
        </div>
        <button
          type="button"
          onClick={rafraichir}
          disabled={busy !== null}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw size={14} className={busy === 'sync' ? 'animate-spin' : ''} />
          <span>Relire mes comptes</span>
        </button>
      </div>

      {erreur ? (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{erreur}</span>
        </p>
      ) : null}

      <div className="space-y-5">
        {groupes.map((g) => (
          <div key={g.titre}>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {g.pub ? <Megaphone size={14} className="text-purple-300" /> : null}
              <span>{g.titre}</span>
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{g.aide}</p>

            {/* Les comptes déjà reliés, en premier : c'est ce qu'on vient voir. */}
            {g.comptes.length ? (
              <ul className="mt-2 space-y-1.5">
                {g.comptes.map((c) => (
                  <li
                    key={c.id}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                      c.connected
                        ? 'border-emerald-400/25 bg-emerald-400/[0.07]'
                        : 'border-amber-400/30 bg-amber-400/10'
                    }`}
                  >
                    <span className="text-base">{nomDe(c.platform).emoji}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {c.label ?? nomDe(c.platform).label}
                    </span>
                    {c.connected ? (
                      <Check size={15} className="shrink-0 text-emerald-300" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => relier(c.platform)}
                        className="shrink-0 text-[11px] text-amber-300 underline underline-offset-2"
                      >
                        Reconnecter
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-2">
              {g.plateformes.map((p) => {
                const deja = g.comptes.some((c) => c.platform === p && c.connected)
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => relier(p)}
                    disabled={busy !== null}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-50 ${
                      deja
                        ? 'border-white/10 bg-white/[0.03] text-gray-500'
                        : 'border-white/15 hover:border-purple-400/50 hover:bg-white/5'
                    }`}
                  >
                    {busy === p ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <span>{nomDe(p).emoji}</span>
                    )}
                    <span>{deja ? `${nomDe(p).label} +` : nomDe(p).label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
