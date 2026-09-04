import { useEffect, useMemo, useState } from 'react'
import { FileText, Trash2, Printer, Share2, MessageCircle, Send, Mail, Link2, Check } from 'lucide-react'
import { api } from '../lib/api'
import { useDemo } from '../lib/demo'
import { BandeauDemo } from './ModeDemo'
import { DEMO_RAPPORTS, demoCorpsRapport } from '../lib/demoJeux'

type Summary = Awaited<ReturnType<typeof api.listReports>>['reports'][number]
type Full = Awaited<ReturnType<typeof api.getReport>>

function frenchDay(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/**
 * Rend le Markdown simple des rapports.
 *
 * Volontairement minimal — titres, listes, gras — et sans jamais interpréter de
 * HTML : le corps vient d'un agent extérieur, et l'insérer tel quel dans la page
 * reviendrait à lui laisser exécuter ce qu'il veut dans le navigateur du
 * vendeur.
 */
function renderBody(body: string) {
  return body.split('\n').map((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) return <div key={i} className="h-2" />

    if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      return (
        <p key={i} className="mt-4 font-bold">
          {trimmed.replace(/^#+\s*/, '')}
        </p>
      )
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      return (
        <p key={i} className="ml-4 text-sm text-gray-300">
          {`• ${trimmed.slice(2)}`}
        </p>
      )
    }
    return (
      <p key={i} className="text-sm leading-relaxed text-gray-300">
        {trimmed}
      </p>
    )
  })
}

const NETWORKS = [
  { id: 'facebook', label: 'Facebook', icon: Share2, url: (t: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}&quote=${encodeURIComponent(t)}` },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, url: (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}` },
  { id: 'telegram', label: 'Telegram', icon: Send, url: (t: string) => `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(t)}` },
  { id: 'email', label: 'E-mail', icon: Mail, url: (t: string) => `mailto:?subject=${encodeURIComponent('Rapport de veille')}&body=${encodeURIComponent(t)}` },
]

export function ReportList({ section, department }: { section: string; department?: string }) {
  const [reports, setReports] = useState<Summary[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [full, setFull] = useState<Full | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  const [demo] = useDemo()

  useEffect(() => {
    setLoading(true)
    setOpenId(null)
    setFull(null)
    // Le mode démo sert son jeu d'analyses MARKET ; rien ne part ni ne s'écrit.
    if (demo && section === 'MARKET') {
      setReports(DEMO_RAPPORTS as unknown as Summary[])
      setLoading(false)
      return
    }
    api
      .listReports(section, department)
      .then((r) => setReports(r.reports))
      .catch(() => setReports([]))
      .finally(() => setLoading(false))
  }, [section, department, demo])

  useEffect(() => {
    if (!openId) return
    if (openId.startsWith('demo-')) {
      setFull(demoCorpsRapport(openId) as unknown as Full)
      return
    }
    api.getReport(openId).then(setFull).catch(() => setFull(null))
  }, [openId])

  const selected = useMemo(() => reports.filter((r) => chosen.has(r.id)), [reports, chosen])

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function removeSelection() {
    if (!window.confirm(`Supprimer ${selected.length} rapport(s) ?`)) return
    // Les rapports de démonstration ne s'effacent qu'à l'écran.
    for (const r of selected.filter((x) => !x.id.startsWith('demo-'))) await api.deleteReport(r.id).catch(() => undefined)
    setReports((list) => list.filter((r) => !chosen.has(r.id)))
    if (openId && chosen.has(openId)) {
      setOpenId(null)
      setFull(null)
    }
    setChosen(new Set())
  }

  /**
   * L'export PDF passe par l'impression du navigateur.
   *
   * Aucune bibliothèque à embarquer, et le résultat est un vrai PDF que le
   * vendeur peut enregistrer ou envoyer. La fenêtre n'écrit que du texte, jamais
   * le HTML du rapport.
   */
  function exportPdf() {
    if (!full) return
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return

    const doc = win.document
    doc.title = `${full.title} — ${full.day}`
    const style = doc.createElement('style')
    style.textContent =
      'body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 24px;color:#111;line-height:1.6}h1{font-size:20px}small{color:#666}p{margin:6px 0;font-size:14px;white-space:pre-wrap}'
    doc.head.appendChild(style)

    const h1 = doc.createElement('h1')
    h1.textContent = full.title
    const date = doc.createElement('small')
    date.textContent = frenchDay(full.day)
    const body = doc.createElement('p')
    // textContent, jamais innerHTML : le rapport vient d'un agent extérieur.
    body.textContent = full.body
    doc.body.append(h1, date, body)

    win.print()
  }

  function shareText() {
    if (!full) return ''
    const head = `${full.title} — ${frenchDay(full.day)}`
    const extract = full.body.slice(0, 400)
    return `${head}\n\n${extract}${full.body.length > 400 ? '…' : ''}`
  }

  if (loading) return <p className="mt-6 text-sm text-gray-500">Chargement…</p>

  if (!reports.length) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-white/15 p-8 text-center">
        <p className="text-sm text-gray-400">Aucun rapport archivé pour cette section.</p>
        <p className="mt-2 text-xs text-gray-500">
          Vos agents en déposent un par jour. Ils s'empilent ici, du plus récent au plus ancien.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-5">
      {chosen.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <span className="text-xs text-gray-400">{`${chosen.size} rapport(s) sélectionné(s)`}</span>
          <button
            type="button"
            onClick={removeSelection}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5 hover:text-red-400"
          >
            <Trash2 size={13} />
            <span>Supprimer</span>
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {reports.map((r) => (
          <li key={r.id}>
            <div
              className={
                openId === r.id
                  ? 'flex items-center gap-3 rounded-xl border border-emerald-400/40 bg-emerald-400/5 p-3'
                  : 'flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3'
              }
            >
              <input
                type="checkbox"
                checked={chosen.has(r.id)}
                onChange={() => toggle(r.id)}
                className="h-4 w-4 shrink-0 accent-emerald-400"
              />
              <button
                type="button"
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-semibold">{r.title}</p>
                {/* Date, rayon et rédacteur se lisent sans ouvrir la ligne. */}
                <p className="text-xs text-gray-500">
                  {[
                    frenchDay(r.day),
                    typeof r.summary?.rayon === 'string' ? r.summary.rayon : null,
                    typeof r.summary?.redacteur === 'string' ? `rédigé par ${r.summary.redacteur}` : null,
                  ]
                    .filter(Boolean)
                    .join(' — ')}
                </p>
              </button>
              <FileText size={15} className="shrink-0 text-gray-500" />
            </div>

            {openId === r.id && (
              <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-4">
                {!full && <p className="text-sm text-gray-500">Ouverture…</p>}
                {full && full.id === r.id && (
                  <>
                    {full.summary && Object.keys(full.summary).length > 0 && (
                      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                        {Object.entries(full.summary).map(([key, value]) => (
                          <div key={key}>
                            <dt className="text-gray-500">{key}</dt>
                            <dd className="font-semibold">{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    <div className="max-h-[32rem] overflow-y-auto pr-1">{renderBody(full.body)}</div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                      <button
                        type="button"
                        onClick={exportPdf}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                      >
                        <Printer size={13} />
                        <span>Exporter en PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSharing((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
                      >
                        <Share2 size={13} />
                        <span>Partager</span>
                      </button>

                      {sharing && (
                        <div className="flex flex-wrap items-center gap-2">
                          {NETWORKS.map((n) => {
                            const Icon = n.icon
                            return (
                              <a
                                key={n.id}
                                href={n.url(shareText())}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs hover:bg-white/5"
                              >
                                <Icon size={13} />
                                <span>{n.label}</span>
                              </a>
                            )
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(shareText())
                              setCopied(true)
                              setTimeout(() => setCopied(false), 1500)
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs hover:bg-white/5"
                          >
                            {copied ? <Check size={13} /> : <Link2 size={13} />}
                            <span>{copied ? 'Copié' : 'Copier le texte'}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Instagram et TikTok n'acceptent pas de partage de texte
                        depuis un site : le dire plutôt que d'afficher un bouton
                        qui ouvrirait une page inutile. */}
                    {sharing && (
                      <p className="mt-2 text-[11px] text-gray-500">
                        Instagram et TikTok n'acceptent pas le partage de texte depuis un
                        navigateur. Copiez le texte, puis collez-le dans l'application.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <BandeauDemo />
    </div>
  )
}
