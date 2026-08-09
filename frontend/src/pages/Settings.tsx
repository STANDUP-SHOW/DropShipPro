import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

const PLATFORMS = [
  { key: 'EBAY', label: 'eBay', note: 'API Sell disponible — connectez votre token OAuth eBay.' },
  { key: 'AMAZON', label: 'Amazon', note: 'Selling Partner API — nécessite un compte vendeur Pro validé par Amazon.' },
  { key: 'LEBONCOIN', label: 'Leboncoin', note: "Pas d'API self-service : publication assistée uniquement." },
  { key: 'VINTED', label: 'Vinted', note: "Pas d'API publique : publication assistée uniquement." },
]

export default function Settings() {
  const { user, refresh } = useAuth()
  const [shopName, setShopName] = useState(user?.shopName || '')
  const [watermarkText, setWatermarkText] = useState(user?.watermarkText || '')
  const [creds, setCreds] = useState<any[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.listCredentials().then(setCreds)
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

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 max-w-lg">
        <h2 className="font-bold">Plateformes de vente</h2>
        <div className="mt-4 space-y-4">
          {PLATFORMS.map((p) => {
            const cred = creds.find((c) => c.platform === p.key)
            return (
              <div key={p.key} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{p.label}</p>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${cred?.connected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'}`}>
                    {cred?.connected ? 'Connecté' : 'Non connecté'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{p.note}</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const fd = new FormData(e.currentTarget)
                    connectPlatform(p.key, String(fd.get('apiKey') || ''))
                  }}
                  className="mt-2 flex gap-2"
                >
                  <input name="apiKey" placeholder="Clé API / token" className="flex-1 rounded-lg bg-white/10 border border-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400" />
                  <button className="text-xs rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">Enregistrer</button>
                </form>
              </div>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}
