import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Images, Download, Trash2 } from 'lucide-react'
import { api, assetUrl } from '../lib/api'

type Image = Awaited<ReturnType<typeof api.visualGallery>>['images'][number]

/**
 * Le book d'un agent visuel.
 *
 * Tout ce qu'il a produit depuis le début, en bas de sa page, toutes annonces
 * confondues. Les images étaient rangées par produit : invisibles tant qu'on
 * n'ouvrait pas la bonne fiche, et donc oubliées. Un vendeur qui a payé trente
 * visuels veut les revoir sans se rappeler pour quel article il les avait
 * demandés — et surtout retrouver celui qui avait marché, pour le reprendre.
 *
 * Elles sont déjà payées : les revoir ne coûte rien, et les jeter est le seul
 * geste irréversible, d'où la confirmation.
 */
export function AgentBook({
  kind,
  titre,
  vide,
}: {
  kind: 'ad' | 'photo'
  titre: string
  vide: string
}) {
  const [images, setImages] = useState<Image[]>([])
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    api
      .visualGallery(kind)
      .then((r) => setImages(r.images))
      .catch(() => undefined)
      .finally(() => setChargement(false))
  }, [kind])

  async function jeter(id: string) {
    if (!window.confirm('Jeter cette image ? Elle ne sera pas régénérée sans un nouveau crédit.')) return
    await api.deleteImage(id).catch(() => undefined)
    setImages((v) => v.filter((i) => i.id !== id))
  }

  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 font-bold">
        <Images size={17} className="text-purple-300" />
        <span>{titre}</span>
        {images.length ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-normal text-gray-400">
            {images.length}
          </span>
        ) : null}
      </h2>

      {chargement ? (
        <p className="mt-3 text-sm text-gray-500">Chargement…</p>
      ) : images.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">{vide}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {images.map((img) => (
            <li key={img.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5">
              <img
                src={assetUrl(img.path)}
                alt=""
                loading="lazy"
                className="aspect-square w-full object-cover"
              />

              <div className="p-2">
                <p className="truncate text-[11px] text-gray-400" title={img.productTitle ?? ''}>
                  {img.productTitle ?? 'Annonce supprimée'}
                </p>
                <p className="text-[10px] text-gray-600">
                  {`${img.platform ? `${img.platform} · ` : ''}${img.width}×${img.height} · ${new Date(
                    img.createdAt,
                  ).toLocaleDateString('fr-FR')}`}
                </p>
              </div>

              <div className="absolute inset-x-0 top-0 flex justify-end gap-1 p-1 opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
                <a
                  href={assetUrl(img.path)}
                  target="_blank"
                  rel="noreferrer noopener"
                  title="Ouvrir en grand"
                  className="rounded bg-black/70 p-1.5 text-gray-200 hover:bg-black/90"
                >
                  <Download size={12} />
                </a>
                <button
                  type="button"
                  title="Jeter"
                  onClick={() => jeter(img.id)}
                  className="rounded bg-black/70 p-1.5 text-red-300 hover:bg-black/90"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {img.kept ? (
                <span className="absolute left-1 top-1 rounded bg-emerald-500/90 px-1 text-[9px] font-semibold">
                  UTILISÉE
                </span>
              ) : null}

              {img.productId ? (
                <Link
                  to={`/products/${img.productId}`}
                  className="absolute inset-x-0 bottom-0 bg-black/80 py-1 text-center text-[10px] opacity-0 transition group-hover:opacity-100"
                >
                  Voir l'annonce
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
