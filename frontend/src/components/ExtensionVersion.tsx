import { useEffect, useState } from 'react'
import { Puzzle, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { CHROME_STORE_URL } from '../lib/extension'

/**
 * Dit au vendeur que son extension est en retard.
 *
 * **Sans cet avertissement, une correction n'atteint jamais celui qui la
 * demande.** L'extension annonce sa version sur `<html>` et par message ;
 * l'application la compare à celle qu'elle sert (le manifeste livré).
 *
 * Le 02/09/2026, quatre allers-retours sur un plafond de photos déjà corrigé,
 * parce que le vendeur tournait sur une version antérieure et que rien, nulle
 * part, ne le lui disait. Un défaut qui empêche toutes les autres corrections
 * d'arriver coûte plus cher que n'importe lequel d'entre eux.
 *
 * **Depuis le passage au Chrome Web Store (10/09/2026), le remède a changé.**
 * L'ancien message disait « retéléchargez le .zip et rechargez le dossier » —
 * c'est précisément ce qu'il ne faut plus faire : cela réinstalle la copie en
 * mode développeur, qui ne se met jamais à jour, alors que la version du store
 * se met à jour toute seule. Symptôme vu chez Max le 10/09 : la 1.29 installée
 * depuis le store, mais l'app affiche encore 1.28 — les DEUX copies étaient
 * présentes, et l'ancienne (mode développeur) estampille encore la page. Le
 * seul geste manuel qui reste est donc de RETIRER l'ancienne, pas d'en
 * réinstaller une. L'alerte pointe vers le store et l'explique.
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
      <div className="min-w-0 flex-1 text-xs leading-relaxed text-amber-100">
        <p>
          <strong>{`Votre extension est en ${installee}, la version ${servie} est disponible.`}</strong>{' '}
          Elle est maintenant sur le Chrome Web Store et s'y met à jour toute seule — Chrome propage
          les mises à jour en quelques heures.
        </p>
        <p className="mt-1 flex items-start gap-1.5 text-amber-200/90">
          <RefreshCw size={12} className="mt-0.5 shrink-0" />
          <span>
            Toujours l'ancienne version après plusieurs heures ? Vous avez sans doute encore la copie
            installée « en mode développeur ». Ouvrez{' '}
            <code className="rounded bg-black/30 px-1">chrome://extensions</code>, retirez-la, et
            gardez uniquement celle du Chrome Web Store — c'est elle qui se met à jour seule.
          </span>
        </p>
      </div>
      <a
        href={CHROME_STORE_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-400/20 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/30"
      >
        <Puzzle size={14} />
        <span>Ouvrir le Chrome Web Store</span>
      </a>
    </div>
  )
}
