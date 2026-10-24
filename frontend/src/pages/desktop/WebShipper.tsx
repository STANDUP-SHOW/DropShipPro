import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Globe, ListPlus, PackagePlus } from 'lucide-react'
import { Layout } from '../../components/Layout'
import { BesoinDesktop, EntetePower, NavigateurIntegre } from '../../components/desktop/DesktopPower'
import { pont, type EtatNavigateur } from '../../lib/desktopPower'

/** Les fournisseurs proposés au départ : leur page d'accueil, rien de pré-rempli. */
const RACCOURCIS = [
  { nom: 'AliExpress', url: 'https://fr.aliexpress.com/' },
  { nom: 'Temu', url: 'https://www.temu.com/fr' },
  { nom: 'Alibaba', url: 'https://www.alibaba.com/' },
  { nom: 'Shein', url: 'https://fr.shein.com/' },
  { nom: 'CJ Dropshipping', url: 'https://cjdropshipping.com/' },
  { nom: 'BigBuy', url: 'https://www.bigbuy.eu/fr/' },
]

/**
 * WebShipper : le navigateur intégré de l'application (DESKTOP POWER, 24/10/2026).
 *
 * Le vendeur navigue chez n'importe quel fournisseur, dans un profil à part
 * (persist:webshipper) ; sur une fiche, « Importer » la lit DANS l'application —
 * Temu, Shein, AliExpress compris, que le serveur ne lit pas — et l'annonce
 * rejoint Mes annonces. C'est le même relevé que l'AUTO-SHIPPER utilise.
 */
export default function WebShipper() {
  const p = pont()
  const [etat, setEtat] = useState<EtatNavigateur | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [occupe, setOccupe] = useState(false)

  const url = etat?.url && /^https?:/.test(etat.url) ? etat.url : null
  const surFiche = Boolean(url && !/google\.[a-z.]+\/(search)?/i.test(url))

  const importer = async () => {
    if (!p || !url) return
    setOccupe(true)
    setMessage({ ok: true, texte: 'Lecture de la fiche dans l’application…' })
    const r = await p.importer({ url })
    setOccupe(false)
    setMessage(r.ok ? { ok: true, texte: 'Importée : l’annonce est dans Mes annonces.' } : { ok: false, texte: r.erreur || 'Import impossible.' })
  }
  const garder = async () => {
    if (!p || !url) return
    const r = await p.partager(url)
    setMessage(r.ok ? { ok: true, texte: 'Ajoutée à votre liste à importer (RemoteShipping).' } : { ok: false, texte: r.erreur || 'Lien refusé.' })
  }

  return (
    <Layout>
      <EntetePower
        icone={Globe}
        titre="WEBSHIPPER"
        chapo="Le navigateur intégré de DropShipper Desktop. Naviguez chez vos fournisseurs comme dans Chrome ; sur une fiche produit, « Importer » la lit dans l'application, photos comprises, et l'annonce réécrite rejoint Mes annonces (12 drops, comme tout import). C'est aussi ce navigateur que l'AUTO-SHIPPER utilise pour relever les fiches."
      />
      {!p ? (
        <BesoinDesktop ce="WebShipper ouvre les sites des fournisseurs dans l'application et en importe les fiches, y compris celles de Temu, Shein ou AliExpress que le serveur ne peut pas lire." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {RACCOURCIS.map((r) => (
              <button
                key={r.nom}
                type="button"
                onClick={() => p.navigateur.aller(r.url)}
                className="rounded-full border border-[var(--trait)] px-3 py-1 text-xs text-gray-300 transition hover:border-[var(--marque-rose)] hover:text-white"
              >
                {r.nom}
              </button>
            ))}
          </div>
          <NavigateurIntegre
            profil="webshipper"
            depart="https://www.google.fr/"
            hauteur={640}
            surEtat={setEtat}
            actions={
              <>
                <button type="button" disabled={!surFiche} onClick={garder} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--trait)] px-3 py-1.5 text-xs font-semibold text-gray-200 transition hover:border-[var(--marque-rose)] disabled:opacity-40">
                  <ListPlus size={14} /> Garder pour plus tard
                </button>
                <button type="button" disabled={!surFiche || occupe} onClick={importer} className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40">
                  <PackagePlus size={14} /> Importer cette fiche
                </button>
              </>
            }
          />
          {message ? <p className={`mt-2 text-xs ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>{message.texte}</p> : null}
          <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
            Vos connexions dans ce navigateur (compte fournisseur, cookies) restent sur votre ordinateur, dans un profil à part. Une vérification anti-robot s'affiche ? Réglez-la vous-même : l'application ne la contourne jamais. Pour publier :{' '}
            <Link to="/dashboard" className="underline hover:text-white">Mes annonces</Link>, puis « Publier ».
          </p>
        </>
      )}
    </Layout>
  )
}
