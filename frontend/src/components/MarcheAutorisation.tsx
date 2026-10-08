import { useEffect, useState } from 'react'
import { api } from '../lib/api'

/** Les places de marché qu'on relie par autorisation, pas par une clé collée. */
export const MARCHES_AUTORISATION = ['TIKTOK_SHOP', 'AMAZON', 'ALLEGRO', 'CDISCOUNT', 'ETSY', 'WISH']

type Etat = Awaited<ReturnType<typeof api.marchesEtat>>[number]

/**
 * Relier un compte vendeur TikTok Shop, Amazon, Allegro, Cdiscount, Etsy ou Wish.
 *
 * Le vendeur autorise DropShipper chez la plateforme ; il ne nous confie
 * aucun mot de passe. Cdiscount n'a pas d'écran d'autorisation : le vendeur
 * colle son Seller ID et ses identifiants API, éprouvés de la même façon. « Connecté » ne s'affiche qu'après un appel réel réussi
 * côté serveur, jamais sur la seule foi d'un formulaire enregistré.
 */
export function MarcheAutorisation({
  platform,
  label,
  onChange,
}: {
  platform: string
  label: string
  onChange?: () => void
}) {
  const [etat, setEtat] = useState<Etat | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [jeton, setJeton] = useState({ refreshToken: '', sellerId: '' })
  const [champs, setChamps] = useState<Record<string, string>>({})

  async function relire() {
    try {
      const tous = await api.marchesEtat()
      setEtat(tous.find((e) => e.platform === platform) ?? null)
    } catch {
      setEtat(null)
    }
  }

  useEffect(() => {
    void relire()
  }, [platform])

  async function relier() {
    setErreur(null)
    setBusy(true)
    try {
      const { url } = await api.marcheConnect(platform)
      window.location.href = url
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Autorisation impossible.')
      setBusy(false)
    }
  }

  async function delier() {
    setBusy(true)
    try {
      await api.marcheDelier(platform)
      await relire()
      onChange?.()
    } finally {
      setBusy(false)
    }
  }

  async function collerJeton(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    setBusy(true)
    try {
      await api.amazonJeton(jeton)
      setJeton({ refreshToken: '', sellerId: '' })
      await relire()
      onChange?.()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Amazon a refusé ce jeton.')
    } finally {
      setBusy(false)
    }
  }

  async function envoyerSaisie(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    setBusy(true)
    try {
      await api.marcheSaisie(platform, champs)
      setChamps({})
      await relire()
      onChange?.()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : `${label} a refusé ces identifiants.`)
    } finally {
      setBusy(false)
    }
  }

  if (!etat) return null
  const saisie = etat.saisie ?? []
  const saisieComplete = saisie.every((c) => (champs[c.cle] ?? '').trim())

  return (
    <div className="mt-3 space-y-2 text-xs">
      {!etat.appConfiguree ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-amber-200">
          <span className="font-semibold">En attente des clés. </span>
          {etat.manque}
        </p>
      ) : etat.relie ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-emerald-300">Relié : {etat.compte ?? label}</span>
          <button type="button" onClick={delier} disabled={busy} className="underline underline-offset-2 text-gray-400 disabled:opacity-50">
            Délier
          </button>
        </div>
      ) : !etat.autorisation ? (
        <form onSubmit={envoyerSaisie} className="space-y-1.5 rounded-lg border border-white/10 p-2">
          {saisie.map((c) => (
            <input
              key={c.cle}
              type={c.secret ? 'password' : 'text'}
              value={champs[c.cle] ?? ''}
              onChange={(e) => setChamps({ ...champs, [c.cle]: e.target.value })}
              placeholder={c.indice ? `${c.libelle} (${c.indice})` : c.libelle}
              autoComplete="off"
              className="w-full rounded border border-white/10 bg-black/30 px-2 py-1"
            />
          ))}
          <button
            type="submit"
            disabled={busy || !saisieComplete}
            className="btn-gradient rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {`Vérifier et relier ${label}`}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={relier}
          disabled={busy}
          className="btn-gradient rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {`Relier mon compte ${label}`}
        </button>
      )}

      {platform === 'AMAZON' && etat.appConfiguree && !etat.relie ? (
        <form onSubmit={collerJeton} className="space-y-1.5 rounded-lg border border-white/10 p-2">
          <p className="text-gray-400">
            Application privée : collez le jeton obtenu par « Autoriser l'application » dans Seller Central, et votre Seller ID.
          </p>
          <input
            value={jeton.refreshToken}
            onChange={(e) => setJeton({ ...jeton, refreshToken: e.target.value })}
            placeholder="Atzr|…"
            autoComplete="off"
            className="w-full rounded border border-white/10 bg-black/30 px-2 py-1"
          />
          <input
            value={jeton.sellerId}
            onChange={(e) => setJeton({ ...jeton, sellerId: e.target.value })}
            placeholder="Seller ID (A1B2C3…)"
            autoComplete="off"
            className="w-full rounded border border-white/10 bg-black/30 px-2 py-1"
          />
          <button type="submit" disabled={busy || !jeton.refreshToken || !jeton.sellerId} className="rounded border border-white/15 px-2 py-1 disabled:opacity-50">
            Vérifier et relier
          </button>
        </form>
      ) : null}

      {erreur ? <p className="text-red-300">{erreur}</p> : null}
    </div>
  )
}
