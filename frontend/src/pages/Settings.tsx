import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Puzzle, Download, Settings as SettingsIcon } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, assetUrl } from '../lib/api'
import { useAuth } from '../lib/auth'

/**
 * Réglages : deux choses qu'on fait une fois.
 *
 * La sécurité du compte, et l'extension. Tout le reste est parti là où il se
 * décide — les boutiques et le filigrane dans « Mes sites », les identifiants
 * de places de marché à côté de la plateforme concernée, dans Vente et
 * Acquisition.
 *
 * Un écran de réglages qui rassemble tout ce qui n'a pas trouvé sa place finit
 * par n'avoir aucune place lui-même : le vendeur le parcourt en entier chaque
 * fois qu'il cherche un seul champ.
 */

export default function Settings() {
  const { user } = useAuth()
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <SettingsIcon size={22} className="text-purple-300" />
          <span>Réglages</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          Vos boutiques, leur logo et leur filigrane se règlent dans{' '}
          <Link to="/mes-sites" className="text-purple-300 underline">
            Mes sites
          </Link>
          . Les identifiants d'une place de marché se saisissent sur sa fiche, dans Vente ou
          Acquisition.
        </p>
      </div>

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

    </Layout>
  )
}
