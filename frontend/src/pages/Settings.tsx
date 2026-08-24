import { useEffect, useState } from 'react'
import { Puzzle, Download } from 'lucide-react'
import { Layout } from '../components/Layout'
import { PlatformBadge } from '../components/PlatformBadge'
import { MyShops } from '../components/MyShops'
import { ApiKeys } from '../components/ApiKeys'
import { api, assetUrl } from '../lib/api'
import { useAuth } from '../lib/auth'
import { INTEGRATION_LABEL, INTEGRATION_STYLE, type PlatformInfo } from '../lib/platforms'

export default function Settings() {
  const { user, refresh } = useAuth()
  const [shopName, setShopName] = useState(user?.shopName || '')
  const [watermarkText, setWatermarkText] = useState(user?.watermarkText || '')
  const [creds, setCreds] = useState<any[]>([])
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])
  const [saved, setSaved] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)

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

  const [credError, setCredError] = useState<{ platform: string; text: string } | null>(null)

  async function saveCredential(platform: string, data: Record<string, string>) {
    setCredError(null)
    try {
      await api.saveCredential({ platform, data })
      setCreds(await api.listCredentials())
    } catch (err) {
      setCredError({ platform, text: err instanceof Error ? err.message : 'Enregistrement impossible' })
    }
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

      <MyShops />

      <ApiKeys />

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 max-w-lg">
        <h2 className="font-bold">Sécurité</h2>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2.5">
          <div>
            <p className="text-sm">{user?.email}</p>
            <p className="text-xs text-gray-500">
              {user?.emailVerified ? 'Adresse confirmée' : 'Adresse non confirmée'}
            </p>
          </div>
          {user?.emailVerified ? (
            <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
              Vérifiée
            </span>
          ) : (
            <button
              onClick={async () => {
                setVerifyMsg('Envoi…')
                try {
                  await api.resendVerification()
                  setVerifyMsg('Email envoyé, vérifiez votre boîte.')
                } catch (err) {
                  setVerifyMsg(err instanceof Error ? err.message : 'Envoi impossible')
                }
              }}
              className="shrink-0 text-xs rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5"
            >
              Envoyer le lien
            </button>
          )}
        </div>
        {verifyMsg && <p className="text-xs text-gray-400 mt-2">{verifyMsg}</p>}

        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const form = e.currentTarget
            setPwdMsg(null)
            if (fd.get('next') !== fd.get('confirm')) {
              return setPwdMsg({ ok: false, text: 'Les deux nouveaux mots de passe ne correspondent pas' })
            }
            try {
              await api.changePassword(String(fd.get('current')), String(fd.get('next')))
              setPwdMsg({ ok: true, text: 'Mot de passe modifié.' })
              form.reset()
            } catch (err) {
              setPwdMsg({ ok: false, text: err instanceof Error ? err.message : 'Modification impossible' })
            }
          }}
          className="mt-5 space-y-3"
        >
          <h3 className="text-sm font-medium">Changer le mot de passe</h3>
          <input
            name="current"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Mot de passe actuel"
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
          />
          <input
            name="next"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Nouveau mot de passe (8 caractères min.)"
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
          />
          <input
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Confirmez le nouveau mot de passe"
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
          />
          <button className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold">Modifier</button>
          {pwdMsg && (
            <p className={`text-xs ${pwdMsg.ok ? 'text-emerald-300' : 'text-red-400'}`}>{pwdMsg.text}</p>
          )}
        </form>
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
                <li>Clic droit sur le .zip téléchargé › « Extraire tout… » › Extraire.</li>
                <li>
                  Ouvrez <code className="text-gray-300">chrome://extensions</code> dans Chrome.
                </li>
                <li>Activez le « Mode développeur » en haut à droite.</li>
                <li>Cliquez « Charger l'extension non empaquetée » et sélectionnez le dossier extrait.</li>
                <li>Épinglez l'icône, connectez-vous, et publiez en un clic.</li>
              </ol>
              <p className="mt-2 rounded-lg border border-orange-400/30 bg-orange-500/10 p-2 text-xs text-orange-200">
                Chrome ne trouve pas l'extension ? Le dossier choisi est encore l'intérieur du .zip —
                Windows en affiche le contenu comme un dossier, sans rien extraire. Refaites
                « Extraire tout… », ou faites glisser le dossier directement sur chrome://extensions.
              </p>
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
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium text-sm">
                    <PlatformBadge label={p.label} color={p.color} size={22} />
                    <span>{p.label}</span>
                  </p>
                  {p.automatable && !p.unavailable ? (
                    <span
                      className={`text-xs rounded-full px-2 py-0.5 ${cred?.connected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'}`}
                    >
                      {cred?.connected ? 'Connecté' : 'Non connecté'}
                    </span>
                  ) : (
                    <span className={`text-xs rounded-full px-2 py-0.5 ${INTEGRATION_STYLE[p.integration]}`}>
                      {INTEGRATION_LABEL[p.integration]}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">{p.note}</p>
                {p.warning && (
                  <p className="mt-2 rounded-lg border border-orange-400/30 bg-orange-500/10 px-2 py-1.5 text-xs text-orange-200">
                    {`⚠️ ${p.warning}`}
                  </p>
                )}

                {/* Shopify needs two values, and they are the only credentials that
                    are really used today — hence its own form rather than the
                    generic "clé API" field. */}
                {p.id === 'SHOPIFY' ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const fd = new FormData(e.currentTarget)
                      saveCredential('SHOPIFY', {
                        shopDomain: String(fd.get('shopDomain') || ''),
                        accessToken: String(fd.get('accessToken') || ''),
                      })
                    }}
                    className="mt-2 space-y-2"
                  >
                    <input
                      name="shopDomain"
                      defaultValue={cred?.hint ?? ''}
                      placeholder="ma-boutique.myshopify.com"
                      className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                    />
                    <input
                      name="accessToken"
                      type="password"
                      placeholder="Jeton d'accès Admin (shpat_…)"
                      className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                    />
                    <div className="flex items-center gap-2">
                      <button className="text-xs rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">
                        {cred?.connected ? 'Remplacer' : 'Connecter ma boutique'}
                      </button>
                      {cred?.connected && (
                        <button
                          type="button"
                          onClick={() => saveCredential('SHOPIFY', {})}
                          className="text-xs text-gray-400 hover:text-red-300"
                        >
                          Déconnecter
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                  // No API key field for platforms with no public seller API — the
                  // extension fills their form instead, so there is nothing to connect.
                  p.automatable && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        const fd = new FormData(e.currentTarget)
                        const apiKey = String(fd.get('apiKey') || '')
                        saveCredential(p.id, apiKey ? { apiKey } : {})
                      }}
                      className="mt-2 flex gap-2"
                    >
                      <input
                        name="apiKey"
                        placeholder="Clé API / token"
                        className="flex-1 rounded-lg bg-white/10 border border-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                      />
                      <button className="text-xs rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">
                        Enregistrer
                      </button>
                    </form>
                  )
                )}

                {credError?.platform === p.id && (
                  <p className="mt-2 text-xs text-red-400">{credError.text}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}
