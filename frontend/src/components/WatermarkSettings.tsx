import { useEffect, useRef, useState } from 'react'
import { Stamp, Upload, Trash2 } from 'lucide-react'
import { api, apiRoot, assetUrl } from '../lib/api'

type Reglages = {
  watermarkEnabled: boolean
  watermarkText: string | null
  watermarkImage: string | null
  watermarkScale: number
  watermarkOpacity: number
  watermarkPosition: string
}

/** Les neuf ancrages de sharp, dans la disposition d'un pavé numérique. */
const POSITIONS: Array<{ id: string; titre: string }> = [
  { id: 'northwest', titre: 'En haut à gauche' },
  { id: 'north', titre: 'En haut' },
  { id: 'northeast', titre: 'En haut à droite' },
  { id: 'west', titre: 'À gauche' },
  { id: 'center', titre: 'Au centre' },
  { id: 'east', titre: 'À droite' },
  { id: 'southwest', titre: 'En bas à gauche' },
  { id: 'south', titre: 'En bas' },
  { id: 'southeast', titre: 'En bas à droite' },
]

/**
 * Le filigrane, réglable pour de vrai.
 *
 * Le serveur savait déjà poser un logo, choisir son coin, sa taille et son
 * opacité — l'écran ne proposait qu'un champ de texte. Le vendeur qui avait
 * déposé son logo ne pouvait donc pas s'en servir, et personne ne pouvait
 * couper le filigrane : le seul moyen était de vider le texte, ce qui faisait
 * retomber sur le nom de la boutique.
 *
 * Les valeurs par défaut sont celles demandées : logo en bas à droite, pleine
 * intensité.
 */
export function WatermarkSettings() {
  const [r, setR] = useState<Reglages | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fichier = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api
      .settingsProfile()
      .then((p) => setR(p as Reglages))
      .catch(() => setError('Réglages indisponibles'))
  }, [])

  async function enregistrer(patch: Partial<Reglages>) {
    if (!r) return
    const suivant = { ...r, ...patch }
    setR(suivant)
    setError(null)
    try {
      await api.updateProfile({
        watermarkEnabled: suivant.watermarkEnabled,
        watermarkText: suivant.watermarkText ?? '',
        watermarkScale: suivant.watermarkScale,
        watermarkOpacity: suivant.watermarkOpacity,
        watermarkPosition: suivant.watermarkPosition,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible')
    }
  }

  async function envoyerLogo(file: File) {
    setBusy(true)
    setError(null)
    try {
      const data = new FormData()
      data.append('logo', file)
      const res = await fetch(`${apiRoot}/api/settings/watermark-logo`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${localStorage.getItem('droppost_token') ?? ''}` },
        body: data,
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Envoi impossible')
      setR((cur) => (cur ? { ...cur, watermarkImage: payload.watermarkImage } : cur))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible')
    } finally {
      setBusy(false)
    }
  }

  async function retirerLogo() {
    await api.deleteWatermarkLogo().catch(() => undefined)
    setR((cur) => (cur ? { ...cur, watermarkImage: null } : cur))
  }

  if (!r) {
    return (
      <div className="mt-6 max-w-lg rounded-xl border border-white/10 bg-white/5 p-5">
        <p className="text-sm text-gray-500">{error ?? 'Chargement…'}</p>
      </div>
    )
  }

  return (
    <div className="mt-6 max-w-lg rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Stamp size={17} className="text-purple-300" />
        <span>Filigrane</span>
      </h2>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={r.watermarkEnabled}
          onChange={(e) => enregistrer({ watermarkEnabled: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-purple-500"
        />
        <span>
          <span className="block text-sm">Appliquer un filigrane sur mes photos</span>
          <span className="block text-xs leading-relaxed text-gray-500">
            Décoché, les photos sont quand même téléchargées et rangées chez nous sous un nom
            lisible pour le référencement : seule la marque n'est pas posée. Vos annonces ne
            pointent jamais vers les adresses du fournisseur, qui expirent.
          </span>
        </span>
      </label>

      <div className={r.watermarkEnabled ? 'mt-4 space-y-4' : 'mt-4 space-y-4 opacity-40'}>
        <div>
          <p className="text-xs text-gray-400">Logo (PNG, SVG, JPEG ou WebP — 2 Mo maximum)</p>
          <div className="mt-2 flex items-center gap-3">
            {r.watermarkImage ? (
              <img
                src={assetUrl(r.watermarkImage)}
                alt=""
                className="h-12 w-12 rounded-lg bg-white/90 object-contain p-1"
              />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-lg bg-black/30 text-[10px] text-gray-500">
                aucun
              </div>
            )}
            <input
              ref={fichier}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) envoyerLogo(f)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              disabled={busy || !r.watermarkEnabled}
              onClick={() => fichier.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-40"
            >
              <Upload size={12} />
              <span>{busy ? 'Envoi…' : r.watermarkImage ? 'Remplacer' : 'Déposer mon logo'}</span>
            </button>
            {r.watermarkImage ? (
              <button
                type="button"
                onClick={retirerLogo}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-300"
              >
                <Trash2 size={12} />
                <span>Retirer</span>
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            Sans logo, c'est le texte ci-dessous qui est posé.
          </p>
        </div>

        <div>
          <label className="text-xs text-gray-400">Texte du filigrane</label>
          <input
            value={r.watermarkText ?? ''}
            onChange={(e) => setR({ ...r, watermarkText: e.target.value })}
            onBlur={() => enregistrer({})}
            placeholder="Ex : @maboutique"
            disabled={!r.watermarkEnabled}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400 disabled:opacity-50"
          />
        </div>

        <div>
          <p className="text-xs text-gray-400">Position sur la photo</p>
          <div className="mt-2 grid w-32 grid-cols-3 gap-1">
            {POSITIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.titre}
                disabled={!r.watermarkEnabled}
                onClick={() => enregistrer({ watermarkPosition: p.id })}
                className={
                  r.watermarkPosition === p.id
                    ? 'aspect-square rounded bg-purple-500'
                    : 'aspect-square rounded border border-white/15 hover:bg-white/10'
                }
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            {POSITIONS.find((p) => p.id === r.watermarkPosition)?.titre ?? ''}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-xs text-gray-400">{`Intensité : ${r.watermarkOpacity} %`}</span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={r.watermarkOpacity}
              disabled={!r.watermarkEnabled}
              onChange={(e) => setR({ ...r, watermarkOpacity: Number(e.target.value) })}
              onMouseUp={() => enregistrer({})}
              onTouchEnd={() => enregistrer({})}
              className="mt-1 w-full accent-purple-500"
            />
          </label>
          <label>
            <span className="text-xs text-gray-400">{`Taille : ${r.watermarkScale} % de la largeur`}</span>
            <input
              type="range"
              min={5}
              max={60}
              step={1}
              value={r.watermarkScale}
              disabled={!r.watermarkEnabled}
              onChange={(e) => setR({ ...r, watermarkScale: Number(e.target.value) })}
              onMouseUp={() => enregistrer({})}
              onTouchEnd={() => enregistrer({})}
              className="mt-1 w-full accent-purple-500"
            />
          </label>
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
      {saved ? <p className="mt-3 text-xs text-emerald-300">Enregistré ✓</p> : null}
    </div>
  )
}
