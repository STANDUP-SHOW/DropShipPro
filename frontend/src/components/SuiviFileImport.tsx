import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Loader2, RotateCcw, X } from 'lucide-react'
import { api } from '../lib/api'
import { useExtensionVersion } from '../lib/extensionVersion'

/**
 * Le suivi, sur le site, des fiches envoyées à l'extension (ou à l'application desktop).
 *
 * **Pourquoi (21/11/2026).** Un client coche 15 gagnants, clique « Importer » : le
 * site répond « 15 fiche(s) envoyée(s) à l'extension » et plus rien. Les lignes
 * existent (`ImportQueue`, `GET /api/market-reports/file`) avec leur état, leur
 * motif d'échec et l'annonce créée, mais aucun écran du site ne les lisait : il
 * fallait savoir ouvrir le panneau de l'extension. L'extension ne relève RIEN
 * seule : tant que le vendeur n'a pas cliqué « Importer » dans sa « File d'import
 * du site », les lignes restent « en attente ».
 *
 * Ce bloc montre donc chaque ligne avec son état réel, dit l'étape suivante
 * (extension absente de ce navigateur, ou le clic à faire), donne le lien vers
 * l'annonce créée, le vrai motif d'un refus et un bouton pour relancer.
 */

type Ligne = Awaited<ReturnType<typeof api.fileImport>>[number]

const ACTIVES = new Set(['EN_ATTENTE', 'RELEVE'])
/** Un relevé dure moins d'une minute : au-delà de 10, l'onglet ou l'extension a été fermé en route. */
const RELEVE_BLOQUE_MS = 10 * 60 * 1000
const bloquee = (l: Ligne) =>
  l.status === 'RELEVE' && Date.now() - new Date(l.updatedAt ?? l.createdAt).getTime() > RELEVE_BLOQUE_MS

export function SuiviFileImport({ origine, rafraichir }: { origine: string; rafraichir: number }) {
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  const { presente } = useExtensionVersion()

  const charger = useCallback(async () => {
    try {
      const toutes = await api.fileImport()
      setLignes((Array.isArray(toutes) ? toutes : []).filter((l) => l.origine === origine))
      setErreur(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suivi illisible.')
    }
  }, [origine])

  useEffect(() => {
    void charger()
  }, [charger, rafraichir])

  // Relu toutes les 5 s tant qu'une fiche attend ou se relève : l'état change dans l'extension, pas ici.
  const actives = lignes.filter((l) => ACTIVES.has(l.status) && !bloquee(l))
  useEffect(() => {
    if (!actives.length) return
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void charger()
    }, 5000)
    return () => window.clearInterval(t)
  }, [actives.length, charger])

  async function relancer(l: Ligne) {
    setOccupe(l.id)
    try {
      // Une ligne refusée ne se rouvre pas côté serveur : on la retire et on la repose, même adresse.
      // Un relevé interrompu ne se retire pas tel quel : il est d'abord noté refusé.
      if (l.status === 'RELEVE') await api.fileImportEchec(l.id, 'Relevé interrompu (onglet ou extension fermé en route).')
      await api.fileImportRetirer(l.id)
      await api.fileImportAjouter([
        { url: l.url, titre: l.titre ?? undefined, fournisseur: l.fournisseur ?? undefined, mode: 'extension', origine },
      ])
      await charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La relance n'a pas abouti.")
    } finally {
      setOccupe(null)
    }
  }

  async function retirer(l: Ligne) {
    setOccupe(l.id)
    try {
      await api.fileImportRetirer(l.id)
      await charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le retrait n'a pas abouti.")
    } finally {
      setOccupe(null)
    }
  }

  if (!lignes.length && !erreur) return null

  const n = (s: string) => lignes.filter((l) => l.status === s).length
  const attente = n('EN_ATTENTE')
  const enCours = n('RELEVE')
  const importes = n('IMPORTE')
  const refuses = n('ECHEC')
  const parDesktop = actives.some((l) => l.mode === 'desktop')

  return (
    <section className="mt-4 rounded-xl border border-sky-400/30 bg-sky-500/5 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="text-sm font-bold text-white">Suivi de vos imports</h3>
        <span className="text-xs text-[#B8C0D0]">
          {[
            attente ? `${attente} en attente` : '',
            enCours ? `${enCours} en cours` : '',
            importes ? `${importes} importé${importes > 1 ? 's' : ''}` : '',
            refuses ? `${refuses} refusé${refuses > 1 ? 's' : ''}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {importes ? (
          <Link to="/dashboard" className="ml-auto text-xs font-semibold text-[#E85290] hover:underline">
            Voir dans Mes annonces →
          </Link>
        ) : null}
      </div>

      {attente > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {parDesktop ? (
            <>
              <strong>Ces fiches attendent l'application desktop.</strong> Elle les relève seule, sans clic, tant
              qu'elle est ouverte sur votre PC et connectée à votre compte. Fermée, rien ne bouge.
            </>
          ) : presente ? (
            <>
              <strong>Il reste une étape : l'extension n'importe qu'à votre signal.</strong> Cliquez l'icône
              DropShipper IA dans la barre de Chrome pour ouvrir son panneau, puis « 📥 File d'import du site » et
              « Tout importer en lot » (ou « Importer » pour une seule fiche). Laissez la fenêtre ouverte : chaque fiche s'ouvre, est lue puis refermée.
              L'état se met à jour ici tout seul.
            </>
          ) : (
            <>
              <strong>L'extension n'est pas détectée sur ce navigateur</strong> : sans elle, ces fiches restent en
              attente. Installez-la (Chrome), connectez-vous dedans avec ce compte, puis ouvrez son panneau, « 📥 File
              d'import du site » et « Tout importer en lot ».{' '}
              <Link to="/extension" className="font-semibold underline">
                Installer l'extension
              </Link>
            </>
          )}
        </div>
      ) : null}

      {erreur ? <p className="mt-2 text-xs text-red-400">{erreur}</p> : null}

      <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {lignes.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/5 px-3 py-2 text-xs">
            <Etat statut={bloquee(l) ? 'BLOQUE' : l.status} />
            <span className="min-w-0 flex-1 truncate text-[#F5F7FA]" title={l.titre || l.url}>
              {l.titre || l.url}
            </span>
            {l.status === 'IMPORTE' && l.productId ? (
              <Link to={`/products/${l.productId}`} className="font-semibold text-[#E85290] hover:underline">
                Voir l'annonce
              </Link>
            ) : null}
            {l.status === 'ECHEC' || bloquee(l) ? (
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={occupe !== null}
                  onClick={() => relancer(l)}
                  className="flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-white hover:bg-white/10 disabled:opacity-40"
                >
                  {occupe === l.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Relancer
                </button>
              </span>
            ) : null}
            {l.status !== 'RELEVE' ? (
              <button
                type="button"
                disabled={occupe !== null}
                onClick={() => retirer(l)}
                title="Retirer du suivi"
                className="text-gray-500 hover:text-white disabled:opacity-40"
              >
                <X size={14} />
              </button>
            ) : null}
            {l.status === 'ECHEC' ? (
              <p className="basis-full text-red-300">{l.erreur ? `Motif : ${l.erreur}` : 'Refusé sans motif transmis.'}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Etat({ statut }: { statut: string }) {
  if (statut === 'IMPORTE')
    return (
      <span className="flex items-center gap-1 font-semibold text-emerald-400">
        <CheckCircle2 size={13} /> Importé
      </span>
    )
  if (statut === 'ECHEC')
    return (
      <span className="flex items-center gap-1 font-semibold text-red-400">
        <AlertTriangle size={13} /> Refusé
      </span>
    )
  if (statut === 'BLOQUE')
    return (
      <span className="flex items-center gap-1 font-semibold text-amber-300" title="Relevé commencé il y a plus de 10 minutes sans aboutir">
        <AlertTriangle size={13} /> Interrompu
      </span>
    )
  if (statut === 'RELEVE')
    return (
      <span className="flex items-center gap-1 font-semibold text-[#f28a4b]">
        <Loader2 size={13} className="animate-spin" /> En cours
      </span>
    )
  return (
    <span className="flex items-center gap-1 font-semibold text-[#B8C0D0]">
      <Clock size={13} /> En attente
    </span>
  )
}
