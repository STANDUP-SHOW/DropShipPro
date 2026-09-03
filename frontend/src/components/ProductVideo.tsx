import { useEffect, useRef, useState } from 'react'
import { Film, Loader2, Trash2, Upload } from 'lucide-react'
import { api, assetUrl, uploadProductVideo } from '../lib/api'
import type { PlatformInfo } from '../lib/platforms'

/**
 * La vidéo de l'annonce : celle du vendeur, jamais celle du fournisseur.
 *
 * **Décision du 03/09/2026, dite mot pour mot :** « je ne veux pas de capture
 * vidéo du fournisseur, juste ajouter une vidéo sur nos produits, qu'elle soit
 * utilisée quand la plateforme de destination l'accepte. Fournisseurs :
 * uniquement photos. »
 *
 * Le bloc dit donc deux choses, et la seconde compte autant que la première :
 * où la vidéo servira réellement, et où elle ne servira pas. Un vendeur qui
 * téléverse une vidéo pour Vinted sans savoir que Vinted n'en prend pas aurait
 * travaillé pour rien — et ne l'apprendrait qu'en regardant son annonce en
 * ligne.
 */
export function ProductVideo({
  productId,
  videoUrl,
  onChange,
}: {
  productId: string
  videoUrl: string | null
  onChange: () => void | Promise<void>
}) {
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<string[]>([])
  const [sansVideo, setSansVideo] = useState<string[]>([])
  const champ = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api
      .listPlatforms()
      .then((liste: PlatformInfo[]) => {
        setDestinations(liste.filter((p) => p.video).map((p) => p.label))
        /*
         * Seules les destinations où l'on publie vraiment sont citées.
         *
         * Lister les vingt places de marché en attente ferait une liste que
         * personne ne lit, et laisserait croire qu'on y publie déjà.
         */
        setSansVideo(
          liste
            .filter((p) => !p.video && (p.integration === 'live' || p.integration === 'feed'))
            .map((p) => p.label),
        )
      })
      .catch(() => undefined)
  }, [])

  async function envoyer(fichier: File | undefined) {
    if (!fichier) return
    setEnvoi(true)
    setErreur(null)
    try {
      await uploadProductVideo(productId, fichier)
      await onChange()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Envoi impossible')
    } finally {
      setEnvoi(false)
    }
  }

  async function retirer() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.supprimerVideo(productId)
      await onChange()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suppression impossible')
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2">
        <Film size={17} className="text-purple-300" />
        <h2 className="text-sm font-bold">Vidéo du produit</h2>
      </div>

      {videoUrl ? (
        <>
          <video
            src={assetUrl(videoUrl)}
            controls
            playsInline
            preload="metadata"
            className="mt-3 w-full rounded-xl border border-white/10 bg-black"
          />
          <button
            type="button"
            onClick={retirer}
            disabled={envoi}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
          >
            {envoi ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            <span>Retirer la vidéo</span>
          </button>
        </>
      ) : (
        <label
          className="mt-3 flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-white/12 p-4 text-center transition hover:border-white/25"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            envoyer(e.dataTransfer.files?.[0])
          }}
        >
          <input
            ref={champ}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              envoyer(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {envoi ? <Loader2 size={19} className="animate-spin text-purple-300" /> : <Upload size={19} className="text-purple-300" />}
          <span className="text-sm font-medium">{envoi ? 'Envoi…' : 'Ajouter une vidéo'}</span>
          <span className="text-xs text-gray-500">MP4, WebM ou MOV · 50 Mo maximum</span>
        </label>
      )}

      {erreur ? <p className="mt-2 text-xs text-red-400">{erreur}</p> : null}

      {/*
        Ce que le vendeur obtient, et ce qu'il n'obtient pas.
        Les deux lignes ensemble : « où ça sert » seul laisse croire que le reste
        suivra un jour prochain, et personne ne saurait dire quand.
      */}
      {destinations.length ? (
        <p className="mt-3 text-xs leading-relaxed text-gray-400">
          {`Envoyée à : ${destinations.join(', ')}.`}
          {sansVideo.length ? ` Non prise par ${sansVideo.join(', ')} — l'annonce y part sans vidéo.` : ''}
        </p>
      ) : null}

      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        Votre propre vidéo. Rien n'est repris de la fiche du fournisseur : elle est diffusée en flux et
        non en fichier, et la revendre sous votre enseigne poserait une question de droits.
        <strong className="text-gray-400"> Pas de filigrane sur la vidéo</strong>, contrairement aux photos.
      </p>
    </div>
  )
}
