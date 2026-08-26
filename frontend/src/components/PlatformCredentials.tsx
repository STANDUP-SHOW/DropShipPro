import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { PlatformBadge } from './PlatformBadge'
import { INTEGRATION_LABEL, INTEGRATION_STYLE, type PlatformInfo } from '../lib/platforms'

/**
 * Les clés d'accès aux places de marché.
 *
 * Extrait des Réglages pour être aussi montré sur la page API Links : c'est le
 * même bloc, et le vendeur qui cherche « où je mets ma clé Shopify » ne devrait
 * pas avoir à deviner laquelle des deux pages la porte.
 *
 * Une plateforme sans API vendeur n'a aucun champ : il n'y a rien à connecter,
 * c'est l'extension qui remplit son formulaire. Afficher un champ vide
 * laisserait croire à un raccordement possible.
 */
export function PlatformCredentials() {
  const [creds, setCreds] = useState<any[]>([])
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])
  const [credError, setCredError] = useState<{ platform: string; text: string } | null>(null)
  /** Laquelle des deux consoles Shopify le vendeur utilise. */
  const [voieShopify, setVoieShopify] = useState<'jeton' | 'oauth'>('jeton')

  useEffect(() => {
    api.listCredentials().then(setCreds).catch(() => undefined)
    api.listPlatforms().then((p) => setPlatforms(p as PlatformInfo[])).catch(() => undefined)
  }, [])

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
    <div className="mt-6 max-w-lg rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="font-bold">Clés des places de marché</h2>
      <p className="mt-1 text-xs text-gray-500">
        Une plateforme sans API vendeur n'a pas de champ : il n'y a rien à connecter, l'extension
        remplit son formulaire à votre place.
      </p>

      <div className="mt-4 space-y-4">
        {platforms
          .filter((p) => p.id !== 'OWN_SITE')
          .map((p) => {
            const cred = creds.find((c) => c.platform === p.id)
            return (
              <div key={p.id} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <PlatformBadge label={p.label} color={p.color} size={22} />
                    <span>{p.label}</span>
                  </p>
                  {p.automatable && !p.unavailable ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        cred?.connected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {cred?.connected ? 'Connecté' : 'Non connecté'}
                    </span>
                  ) : (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${INTEGRATION_STYLE[p.integration]}`}>
                      {INTEGRATION_LABEL[p.integration]}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">{p.note}</p>
                {p.warning ? (
                  <p className="mt-2 rounded-lg border border-orange-400/30 bg-orange-500/10 px-2 py-1.5 text-xs text-orange-200">
                    {`⚠️ ${p.warning}`}
                  </p>
                ) : null}

                {/* Shopify demande deux valeurs, et ce sont les seules
                    identifiants réellement utilisés aujourd'hui — d'où son
                    formulaire propre plutôt que le champ « clé API » générique. */}
                {p.id === 'SHOPIFY' ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const fd = new FormData(e.currentTarget)
                      saveCredential(
                        'SHOPIFY',
                        voieShopify === 'jeton'
                          ? {
                              shopDomain: String(fd.get('shopDomain') || ''),
                              accessToken: String(fd.get('accessToken') || ''),
                            }
                          : {
                              shopDomain: String(fd.get('shopDomain') || ''),
                              clientId: String(fd.get('clientId') || ''),
                              clientSecret: String(fd.get('clientSecret') || ''),
                            },
                      )
                    }}
                    className="mt-2 space-y-2"
                  >
                    <input
                      name="shopDomain"
                      defaultValue={cred?.hint ?? ''}
                      placeholder="ma-boutique.myshopify.com"
                      className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                    />

                    {/*
                      Shopify a deux consoles, et elles ne donnent pas la même
                      chose. Un vendeur qui ne trouve pas de jeton `shpat_` n'est
                      pas perdu : il est simplement dans le Dev Dashboard, qui
                      n'en délivre plus. Lui montrer les deux voies évite la
                      soirée passée à relire un jeton qui n'était pas le bon.
                    */}
                    <div className="flex gap-1 rounded-lg bg-black/30 p-1 text-[11px]">
                      {(
                        [
                          ['jeton', "Jeton d'accès Admin"],
                          ['oauth', 'Client ID / Secret'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setVoieShopify(id)}
                          className={`flex-1 rounded px-2 py-1 transition ${
                            voieShopify === id ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {voieShopify === 'jeton' ? (
                      <>
                        <input
                          name="accessToken"
                          type="password"
                          placeholder="Jeton d'accès Admin (shpat_… — pas atkn_)"
                          className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                        />
                        <p className="text-[11px] leading-relaxed text-gray-500">
                          Depuis <b>admin.shopify.com</b> : Paramètres › Applications et canaux de
                          vente › Développer des applications › votre app › API Admin.
                        </p>
                      </>
                    ) : (
                      <>
                        <input
                          name="clientId"
                          placeholder="Client ID"
                          className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                        />
                        <input
                          name="clientSecret"
                          type="password"
                          placeholder="Client Secret"
                          className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                        />
                        <p className="text-[11px] leading-relaxed text-gray-500">
                          Depuis <b>dev.shopify.com</b> : Apps › votre app › Settings › Credentials.
                          Rien à recopier ensuite, le jeton est renouvelé tout seul. L'app et la
                          boutique doivent appartenir à la même organisation Shopify.
                        </p>
                      </>
                    )}
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
                        {cred?.connected ? 'Remplacer' : 'Connecter ma boutique'}
                      </button>
                      {cred?.connected ? (
                        <button
                          type="button"
                          onClick={() => saveCredential('SHOPIFY', {})}
                          className="text-xs text-gray-400 hover:text-red-300"
                        >
                          Déconnecter
                        </button>
                      ) : null}
                    </div>
                  </form>
                ) : (
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
                        className="flex-1 rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                      />
                      <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
                        Enregistrer
                      </button>
                    </form>
                  )
                )}

                {credError?.platform === p.id ? (
                  <p className="mt-2 text-xs text-red-400">{credError.text}</p>
                ) : null}
              </div>
            )
          })}
      </div>
    </div>
  )
}
