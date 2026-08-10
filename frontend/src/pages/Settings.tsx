import { useEffect, useState } from 'react'
import { Puzzle, Download } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, assetUrl } from '../lib/api'
import { useAuth } from '../lib/auth'

interface PlatformInfo {
  id: string
  label: string
  automatable: boolean
  sellUrl: string | null
  note: string
}

export default function Settings() {
  const { user, refresh } = useAuth()
  const [shopName, setShopName] = useState(user?.shopName || '')
  const [watermarkText, setWatermarkText] = useState(user?.watermarkText || '')
  const [creds, setCreds] = useState<any[]>([])
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.listCredentials().then(setCreds)
    api.listPlatforms().then(setPlatforms)
  }, [])

  useEffect(() => {
    setShopName(user?.shopName || '')
    setWatermarkText(user?.watermarkText || '')
  }, [user])

  async function saveProfile() {
    await api.updateProfile({ shopName, watermarkText })
    await refresh()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function connectPlatform(platform: string, apiKey: string) {
    await api.saveCredential({ platform, data: apiKey ? { apiKey } : {} })
    setCreds(await api.listCredentials())
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold">Réglages</h1>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 space-y-4 max-w-lg">
        <h2 className="font-bold">Boutique</h2>
        <div>
          <label className="text-xs text-gray-400">Nom de la boutique</label>
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Texte du filigrane</label>
          <input
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="Ex : @maboutique"
            className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
          />
        </div>
        <button onClick={saveProfile} className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold">
          {saved ? 'Enregistré ✓' : 'Enregistrer'}
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-purple-400/30 bg-purple-500/5 p-5 max-w-lg">
        <div className="flex items-start gap-3">
          <Puzzle className="text-purple-300 shrink-0 mt-0.5" size={22} />
          <div className="flex-1">
            <h2 className="font-bold">Extension Google Chrome</h2>
            <p className="text-xs text-gray-400 mt-1">
              Importe un produit depuis Temu ou JoyBuy en un clic, et remplit
              automatiquement les formulaires de vente Vinted, Leboncoin, Facebook
              Marketplace et eBay — titre, description, prix et photos filigranées.
            </p>
            <a
              href={assetUrl('/api/public/extension.zip')}
              download="dropship-pro-extension.zip"
              className="btn-gradient mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
            >
              <Download size={15} /> Télécharger l'extension
            </a>
            <details className="mt-3">
              <summary className="text-xs text-purple-300 cursor-pointer">Comment l'installer ?</summary>
              <ol className="text-xs text-gray-400 mt-2 space-y-1 list-decimal list-inside">
                <li>Décompressez le fichier .zip téléchargé.</li>
                <li>
                  Ouvrez <code className="text-gray-300">chrome://extensions</code> dans Chrome.
                </li>
                <li>Activez le « Mode développeur » en haut à droite.</li>
                <li>Cliquez « Charger l'extension non empaquetée » et sélectionnez le dossier décompressé.</li>
                <li>Épinglez l'icône, connectez-vous, et publiez en un clic.</li>
              </ol>
            </details>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 max-w-lg">
        <h2 className="font-bold">Plateformes de vente</h2>
        <div className="mt-4 space-y-4">
          {platforms.filter((p) => p.id !== 'OWN_SITE').map((p) => {
            const cred = creds.find((c) => c.platform === p.id)
            return (
              <div key={p.id} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{p.label}</p>
                  {p.automatable ? (
                    <span className={`text-xs rounded-full px-2 py-0.5 ${cred?.connected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'}`}>
                      {cred?.connected ? 'Connecté' : 'Non connecté'}
                    </span>
                  ) : (
                    <span className="text-xs rounded-full px-2 py-0.5 bg-orange-500/20 text-orange-300">
                      Via l'extension
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">{p.note}</p>
                {/* No API key field for platforms with no public seller API — the
                    extension fills their form instead, so there is nothing to connect. */}
                {p.automatable && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const fd = new FormData(e.currentTarget)
                      connectPlatform(p.id, String(fd.get('apiKey') || ''))
                    }}
                    className="mt-2 flex gap-2"
                  >
                    <input name="apiKey" placeholder="Clé API / token" className="flex-1 rounded-lg bg-white/10 border border-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400" />
                    <button className="text-xs rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">Enregistrer</button>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}
