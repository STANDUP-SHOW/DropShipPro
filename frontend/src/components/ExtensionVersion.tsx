import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { api, apiRoot } from '../lib/api'

/**
 * Dit au vendeur que son extension est en retard.
 *
 * **Sans cet avertissement, une correction n'atteint jamais celui qui la
 * demande.** L'extension n'est pas au Chrome Web Store : elle s'installe en
 * chargeant un dossier, et rien ne la met à jour toute seule. Elle annonçait
 * pourtant sa version depuis toujours — sur `<html>` et par message — et
 * l'application la recevait puis la jetait : elle n'en tirait qu'un booléen,
 * « extension détectée ».
 *
 * Le 02/09/2026, quatre allers-retours sur un plafond de photos déjà corrigé,
 * parce que le vendeur tournait sur une version antérieure et que rien, nulle
 * part, ne le lui disait. Un défaut qui empêche toutes les autres corrections
 * d'arriver coûte plus cher que n'importe lequel d'entre eux.
 */

/** Compare deux versions « 1.22.0 » sans dépendance. */
function estAnterieure(installee: string, servie: string): boolean {
  const a = installee.split('.').map((n) => Number(n) || 0)
  const b = servie.split('.').map((n) => Number(n) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

/** La version annoncée par l'extension, si elle est installée. */
function versionInstallee(): string | null {
  return document.documentElement.dataset.dropshipProExtension || null
}

export function ExtensionVersion() {
  const [installee, setInstallee] = useState<string | null>(versionInstallee)
  const [servie, setServie] = useState<string | null>(null)

  useEffect(() => {
    /*
     * Le repère sur `<html>` peut manquer si le pont a démarré après nous.
     * On demande alors, comme le fait la fenêtre de publication.
     */
    if (!installee) {
      const surReponse = (e: MessageEvent) => {
        if (e.source === window && e.data?.type === 'dsp-extension-ready' && e.data.version) {
          setInstallee(String(e.data.version))
        }
      }
      window.addEventListener('message', surReponse)
      window.postMessage({ source: 'droppost-app', type: 'dsp-ping' }, window.location.origin)
      return () => window.removeEventListener('message', surReponse)
    }
  }, [installee])

  useEffect(() => {
    // Demandée seulement si une extension est là : inutile d'appeler le serveur
    // pour un vendeur qui n'en a pas installé.
    if (!installee) return
    api.versionExtension().then((r) => setServie(r.version)).catch(() => undefined)
  }, [installee])

  if (!installee || !servie || !estAnterieure(installee, servie)) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
      <span className="text-lg">⚠️</span>
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-amber-100">
        <strong>{`Votre extension est en ${installee}, la version ${servie} est disponible.`}</strong>{' '}
        Elle ne se met pas à jour toute seule : téléchargez-la, puis dans Chrome, ouvrez{' '}
        <code className="rounded bg-black/30 px-1">chrome://extensions</code>, retirez l'ancienne et
        chargez le dossier décompressé. Les corrections récentes ne s'appliquent qu'après.
      </p>
      <a
        href={`${apiRoot}/api/public/extension.zip`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-400/20 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/30"
      >
        <Download size={14} />
        <span>Télécharger</span>
      </a>
    </div>
  )
}
