import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { PlatformBadge } from './PlatformBadge'
import { INTEGRATION_LABEL, INTEGRATION_STYLE, type PlatformInfo } from '../lib/platforms'
import { MIRAKL_IDS } from '../lib/platformGuides'

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
/**
 * `only` restreint le bloc aux plateformes d'un onglet.
 *
 * Les identifiants se réglaient loin des fiches qui les expliquent : le vendeur
 * lisait « Shopify — jeton shpat_ » sur la page Vente, puis allait chercher le
 * champ dans Réglages. Chaque onglet porte désormais les siens, et la page qui
 * les rassemble tous reste pour qui veut tout voir.
 */
export function PlatformCredentials({ only, titre }: { only?: string[]; titre?: string } = {}) {
  const [creds, setCreds] = useState<any[]>([])
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])
  useEffect(() => {
    api.listCredentials().then(setCreds).catch(() => undefined)
    api.listPlatforms().then((p) => setPlatforms(p as PlatformInfo[])).catch(() => undefined)
  }, [])

  return (
    <div className="mt-6 max-w-2xl rounded-xl border border-white/10 bg-white/5 p-5">
      <h2 className="font-bold">{titre ?? 'Clés des places de marché'}</h2>
      <p className="mt-1 text-xs text-gray-500">
        Une plateforme sans API vendeur n'a pas de champ : il n'y a rien à connecter, l'extension
        remplit son formulaire à votre place.
      </p>

      <div className="mt-4 space-y-4">
        {platforms
          .filter((p) => p.id !== 'OWN_SITE')
          .filter((p) => !only || only.includes(p.id))
          .map((p) => {
            const cred = creds.find((c) => c.platform === p.id)
            return (
              <div key={p.id} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                <PlatformCredentialForm
                  platform={p}
                  cred={cred}
                  onSaved={async () => setCreds(await api.listCredentials())}
                />
              </div>
            )
          })}
      </div>
    </div>
  )
}

/**
 * Les identifiants d'une seule plateforme, avec ce qui les explique.
 *
 * Extrait pour vivre **dans le bloc de la plateforme** plutôt qu'en bas de page.
 * Le vendeur lisait « Shopify — jeton shpat_ » sur la fiche, puis descendait
 * chercher le champ dans un second bloc qui répétait le nom et la couleur : deux
 * fois la même plateforme, et le champ loin de l'explication.
 */
export function PlatformCredentialForm({
  platform,
  cred,
  onSaved,
}: {
  platform: PlatformInfo
  cred?: { platform: string; connected: boolean; hint?: string | null }
  onSaved?: () => void
}) {
  const [credError, setCredError] = useState<{ platform: string; text: string } | null>(null)
  /** Laquelle des deux consoles Shopify le vendeur utilise. */
  const [voieShopify, setVoieShopify] = useState<'jeton' | 'oauth'>('jeton')
  /** eBay : le trio de renouvellement est replié tant qu'on ne le demande pas. */
  const [renouvellementEbay, setRenouvellementEbay] = useState(false)

  async function saveCredential(id: string, data: Record<string, string>) {
    setCredError(null)
    try {
      await api.saveCredential({ platform: id, data })
      onSaved?.()
    } catch (err) {
      setCredError({ platform: id, text: err instanceof Error ? err.message : 'Enregistrement impossible' })
    }
  }

  return (
<div>
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <PlatformBadge id={platform.id} label={platform.label} color={platform.color} size={22} domain={platform.domain} />
                <span>{platform.label}</span>
              </p>
              {platform.automatable && !platform.unavailable ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    cred?.connected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {cred?.connected ? 'Connecté' : 'Non connecté'}
                </span>
              ) : (
                <span className={`rounded-full px-2 py-0.5 text-xs ${INTEGRATION_STYLE[platform.integration]}`}>
                  {INTEGRATION_LABEL[platform.integration]}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">{platform.note}</p>
            {platform.warning ? (
              <p className="mt-2 rounded-lg border border-orange-400/30 bg-orange-500/10 px-2 py-1.5 text-xs text-orange-200">
                {`⚠️ ${platform.warning}`}
              </p>
            ) : null}

            {/* Shopify demande deux valeurs, et ce sont les seules
                identifiants réellement utilisés aujourd'hui — d'où son
                formulaire propre plutôt que le champ « clé API » générique. */}
            {platform.id === 'SHOPIFY' ? (
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
                      Rien à recopier ensuite, le jeton est renouvelé tout seul.
                    </p>
                    <p className="rounded-lg border border-orange-400/30 bg-orange-500/10 px-2 py-1.5 text-[11px] leading-relaxed text-orange-200">
                      Deux conditions, et elles bloquent tant qu'elles ne sont pas remplies :
                      l'app doit être <b>déjà installée sur la boutique</b> — ce qui demande un
                      déploiement au Shopify CLI — et l'app et la boutique doivent appartenir à
                      la <b>même organisation</b>. Si l'une des deux manque, prenez plutôt le
                      jeton d'accès Admin : rien à déployer.
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
            ) : platform.id === 'EBAY' ? (
              /*
               * eBay publie réellement : le champ nomme ce qu'il attend — un
               * jeton utilisateur, pas une « clé API » qui n'existe pas chez
               * eux. Le trio de renouvellement est facultatif et replié : un
               * jeton seul marche deux heures, et le message d'échec explique
               * quoi ajouter le moment venu.
               */
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  const accessToken = String(fd.get('accessToken') || '').trim()
                  const data: Record<string, string> = accessToken ? { accessToken } : {}
                  for (const cle of ['refreshToken', 'clientId', 'clientSecret'] as const) {
                    const valeur = String(fd.get(cle) || '').trim()
                    if (valeur) data[cle] = valeur
                  }
                  saveCredential('EBAY', data)
                }}
                className="mt-2 space-y-2"
              >
                <input
                  name="accessToken"
                  type="password"
                  placeholder="Jeton utilisateur OAuth (v^1.1#…)"
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                />
                <p className="text-[11px] leading-relaxed text-gray-500">
                  Depuis <b>developer.ebay.com</b> : votre application › User Tokens › Sign in to
                  Production, avec les portées <b>sell.inventory</b> et <b>sell.account</b>.
                </p>
                {renouvellementEbay ? (
                  <>
                    <input
                      name="refreshToken"
                      type="password"
                      placeholder="Refresh token"
                      className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                    />
                    <input
                      name="clientId"
                      placeholder="Client ID (App ID)"
                      className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                    />
                    <input
                      name="clientSecret"
                      type="password"
                      placeholder="Client Secret (Cert ID)"
                      className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                    />
                    <p className="text-[11px] leading-relaxed text-gray-500">
                      Les trois ensemble : le jeton est alors renouvelé tout seul, sans rien
                      recoller toutes les deux heures.
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRenouvellementEbay(true)}
                    className="text-[11px] text-gray-400 underline hover:text-white"
                  >
                    Ajouter le renouvellement automatique (le jeton seul expire au bout de 2 h)
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
                    {cred?.connected ? 'Remplacer' : 'Connecter mon compte eBay'}
                  </button>
                  {cred?.connected ? (
                    <button
                      type="button"
                      onClick={() => saveCredential('EBAY', {})}
                      className="text-xs text-gray-400 hover:text-red-300"
                    >
                      Déconnecter
                    </button>
                  ) : null}
                </div>
              </form>
            ) : MIRAKL_IDS.includes(platform.id) ? (
              /*
               * Un opérateur Mirakl demande deux valeurs, et le champ générique
               * n'en portait qu'une : le connecteur était branché côté serveur
               * et injoignable depuis l'écran — un compte « connecté » sans
               * adresse n'aurait su appeler personne.
               */
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  const baseUrl = String(fd.get('baseUrl') || '').trim()
                  const apiKey = String(fd.get('apiKey') || '').trim()
                  saveCredential(platform.id, baseUrl || apiKey ? { baseUrl, apiKey } : {})
                }}
                className="mt-2 space-y-2"
              >
                <input
                  name="baseUrl"
                  placeholder="Adresse du back-office (https://marchand.mirakl.net)"
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                />
                <input
                  name="apiKey"
                  type="password"
                  placeholder="Clé API"
                  className="w-full rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                />
                <p className="text-[11px] leading-relaxed text-gray-500">
                  L'adresse est celle de votre espace vendeur une fois connecté ; la clé se lit
                  dans <b>Mon compte › Paramètres › API</b>.
                </p>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
                    {cred?.connected ? 'Remplacer' : 'Connecter'}
                  </button>
                  {cred?.connected ? (
                    <button
                      type="button"
                      onClick={() => saveCredential(platform.id, {})}
                      className="text-xs text-gray-400 hover:text-red-300"
                    >
                      Déconnecter
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              platform.automatable && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const fd = new FormData(e.currentTarget)
                    const apiKey = String(fd.get('apiKey') || '')
                    saveCredential(platform.id, apiKey ? { apiKey } : {})
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


      {credError?.platform === platform.id ? (
        <p className="mt-2 text-xs text-red-400">{credError.text}</p>
      ) : null}
    </div>
  )
}
