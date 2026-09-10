import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Mail, Copy, Check, Download } from 'lucide-react'
import { Layout } from '../components/Layout'
import { useAuth } from '../lib/auth'
import { demoAutorise } from '../lib/demo'
import { api } from '../lib/api'

type Abonne = Awaited<ReturnType<typeof api.newsletterList>>['subscribers'][number]

/**
 * La liste des abonnés newsletter — vue ADMIN, réservée au compte de Max.
 *
 * Le garde `demoAutorise` ne fait que cacher la page ; la vraie sécurité est
 * côté serveur (requireAuth + requireAdmin sur GET /admin/newsletter). Un autre
 * compte qui forcerait la route reçoit un 403.
 */
export default function AdminNewsletter() {
  const { user } = useAuth()
  const [abonnes, setAbonnes] = useState<Abonne[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)

  const estAdmin = demoAutorise(user?.email)

  useEffect(() => {
    // On ne requête même pas si ce n'est pas l'admin : évite un 403 inutile et
    // un setState après démontage (la redirection ci-dessous suit).
    if (!estAdmin) return
    api
      .newsletterList()
      .then((r) => setAbonnes(r.subscribers))
      .catch((err) => setErreur(err instanceof Error ? err.message : 'Chargement impossible'))
      .finally(() => setChargement(false))
  }, [estAdmin])

  // Filet côté client : si ce n'est pas l'admin, on ne montre rien. La vraie
  // sécurité est serveur — requireAuth + requireAdmin renvoient 403.
  if (!estAdmin) return <Navigate to="/dashboard" replace />

  const dateCourte = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const copierEmails = () => {
    navigator.clipboard.writeText(abonnes.map((a) => a.email).join('\n'))
    setCopie(true)
    setTimeout(() => setCopie(false), 1800)
  }

  // Échappement CSV : chaque cellule est encadrée de guillemets (guillemets
  // internes doublés) et préfixée d'une apostrophe si elle commence par
  // =,+,-,@ ou un caractère de contrôle — sinon un tableur l'exécuterait comme
  // une formule. Le champ `source` vient d'un endpoint public : entrée non sûre.
  const celluleCsv = (v: string | null) => {
    const s = String(v ?? '')
    const sur = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return `"${sur.replace(/"/g, '""')}"`
  }

  const exporterCsv = () => {
    const lignes = [
      'email,source,date',
      ...abonnes.map((a) => [celluleCsv(a.email), celluleCsv(a.source), celluleCsv(a.createdAt)].join(',')),
    ]
    const blob = new Blob([lignes.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const lien = document.createElement('a')
    lien.href = url
    lien.download = 'newsletter-dropshipper.csv'
    lien.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Mail size={22} className="text-fuchsia-400" />
            <span>Newsletter</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {`${abonnes.length} abonné(s) à la newsletter DropShipper.`}
          </p>
        </div>
        {abonnes.length > 0 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copierEmails}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
            >
              {copie ? <Check size={13} /> : <Copy size={13} />}
              <span>{copie ? 'Copié' : 'Copier les emails'}</span>
            </button>
            <button
              type="button"
              onClick={exporterCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
            >
              <Download size={13} />
              <span>Exporter (CSV)</span>
            </button>
          </div>
        ) : null}
      </div>

      {erreur ? <p className="text-sm text-red-400">{erreur}</p> : null}

      {chargement ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : abonnes.length === 0 && !erreur ? (
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-gray-400">
          Aucun abonné pour l'instant. Le lien « S'abonner » des emails et la page{' '}
          <span className="text-purple-300">/newsletter</span> remplissent cette liste.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Inscrit le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {abonnes.map((a) => (
                <tr key={a.id} className="hover:bg-white/5">
                  <td className="px-4 py-3">{a.email}</td>
                  <td className="px-4 py-3 text-gray-400">{a.source ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{dateCourte(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}
