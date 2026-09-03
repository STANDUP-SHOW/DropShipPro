import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, Eye, Download, Trash2, ExternalLink, ChevronRight, Loader2, LifeBuoy } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { ImageViewer, telechargerImage } from '../components/ImageViewer'
import { TicketDialog } from '../components/TicketDialog'
import { AgentBar } from '../components/AgentBar'
import { api, assetUrl } from '../lib/api'

type Image = Awaited<ReturnType<typeof api.visualGallery>>['images'][number]

/**
 * Mes pubs — les publicités rangées par annonce.
 *
 * Le book de Nadia les montre toutes à la suite, par date : bien pour retrouver
 * celle d'hier, mauvais pour un vendeur qui en a soixante. Ici c'est l'annonce
 * qui commande : on ouvre un produit, on voit ses visuels, on les récupère.
 *
 * **Ce que « Diffuser » veut dire ici, et c'est important :** aucune régie ne
 * nous laisse déposer une créative sans compte publicitaire validé, et aucun de
 * nos comptes ne l'est. Le bouton télécharge donc le fichier et ouvre le
 * gestionnaire de la régie. Écrire « Publier » serait mentir, et un vendeur qui
 * croit sa campagne partie ne la surveille pas.
 */

/** Où va le vendeur pour déposer sa créative, régie par régie. */
const GESTIONNAIRES: Record<string, { label: string; url: string }> = {
  facebook: { label: 'Meta Ads Manager', url: 'https://adsmanager.facebook.com/adsmanager' },
  instagram: { label: 'Meta Ads Manager', url: 'https://adsmanager.facebook.com/adsmanager' },
  'instagram-story': { label: 'Meta Ads Manager', url: 'https://adsmanager.facebook.com/adsmanager' },
  tiktok: { label: 'TikTok Ads Manager', url: 'https://ads.tiktok.com' },
  snapchat: { label: 'Snapchat Ads Manager', url: 'https://ads.snapchat.com' },
  google: { label: 'Google Ads', url: 'https://ads.google.com' },
}

const FORMATS: Record<string, string> = {
  facebook: 'Facebook — fil',
  instagram: 'Instagram — carré',
  'instagram-story': 'Instagram — story',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
  google: 'Google — display',
}

export default function MyAds() {
  const [images, setImages] = useState<Image[]>([])
  const [chargement, setChargement] = useState(true)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [affichee, setAffichee] = useState<Image | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)
  /** La pub que le vendeur signale : le ticket porte son identifiant. */
  const [signalee, setSignalee] = useState<Image | null>(null)
  /**
   * Les comptes publicitaires reellement relies.
   *
   * Ils decident de ce que « Diffuser » veut dire. Sans compte relie, la regie
   * n accepte aucun depot : le bouton telecharge et ouvre le gestionnaire, ce
   * qui est honnete. Avec un compte relie, il depose vraiment.
   */
  const [comptesPub, setComptesPub] = useState<Array<{ externalId: string; platform: string; label: string | null }>>([])

  useEffect(() => {
    api
      .visualGallery('ad')
      .then((r) => setImages(r.images))
      .catch(() => undefined)
      .finally(() => setChargement(false))

    api
      .socialState()
      .then((e) =>
        setComptesPub(
          e.configure
            ? e.comptes.filter((c) => c.isAdAccount && c.connected)
            : [],
        ),
      )
      .catch(() => undefined)
  }, [])

  /**
   * Groupé par annonce, les plus récentes d'abord.
   *
   * Les publicités dont l'annonce a été supprimée gardent leur groupe : elles
   * ont coûté un crédit, et les faire disparaître avec le produit reviendrait à
   * effacer ce que le vendeur a payé.
   */
  const groupes = useMemo(() => {
    const par = new Map<string, { titre: string; productId: string | null; pubs: Image[] }>()
    for (const img of images) {
      const cle = img.productId ?? '—'
      const groupe = par.get(cle) ?? {
        titre: img.productTitle ?? 'Annonce supprimée',
        productId: img.productId,
        pubs: [],
      }
      groupe.pubs.push(img)
      par.set(cle, groupe)
    }
    return [...par.values()]
  }, [images])

  const etiquetteDe = (img: Image, titre: string) =>
    ['pub', img.platform, titre].filter(Boolean).join('-')

  async function jeter(id: string) {
    if (!window.confirm('Jeter cette publicité ? Elle ne sera pas régénérée sans un nouveau crédit.')) return
    await api.deleteImage(id).catch(() => undefined)
    setImages((v) => v.filter((i) => i.id !== id))
  }

  /** Le compte publicitaire qui correspond au format de cette pub, s'il existe. */
  function comptePour(platform: string | null) {
    if (!platform) return null
    // Une story Instagram se dépose depuis Meta Ads, comme un post Facebook :
    // le format n'est pas la régie.
    const regie = platform.startsWith('instagram') || platform === 'facebook'
      ? 'meta-ads'
      : `${platform}-ads`
    return comptesPub.find((c) => c.platform === regie) ?? null
  }

  /**
   * Diffuser, et le mot veut dire deux choses selon ce qui est branché.
   *
   * **Compte publicitaire relié** : la campagne part vraiment, en revue chez la
   * régie. Aucune ne diffuse à la création — annoncer « en ligne » ferait croire
   * à une diffusion qui n'a pas commencé.
   *
   * **Rien de relié** : le fichier est téléchargé et le gestionnaire s'ouvre.
   * C'est le comportement honnête, et il reste : écrire « Publier » sur un
   * bouton qui ne publie pas est le meilleur moyen qu'un vendeur ne surveille
   * pas une campagne qui n'existe pas.
   */
  async function diffuser(img: Image, titre: string) {
    setEnCours(img.id)
    const compte = comptePour(img.platform)

    if (compte) {
      try {
        const campagne = await api.socialCampaign({
          compte: compte.externalId,
          nom: `${titre} — ${img.platform ?? 'pub'}`,
          objectif: 'trafic',
          // Un budget de départ modeste, que le vendeur ajuste chez la régie :
          // deviner un budget à sa place engagerait son argent.
          budgetJour: 500,
          creative: {
            image: assetUrl(img.path),
            titre: titre.slice(0, 120),
            texte: titre.slice(0, 600),
            url: window.location.origin,
          },
        })
        setEnCours(null)
        window.alert(
          `Campagne déposée chez ${compte.label ?? compte.platform} — état : ${campagne.etat}. Elle passe en revue chez la régie avant de diffuser ; ajustez son budget et son ciblage depuis leur gestionnaire.`,
        )
        return
      } catch (e) {
        setEnCours(null)
        window.alert(
          e instanceof Error
            ? `${e.message} La créative reste téléchargeable.`
            : 'Le dépôt a échoué. La créative reste téléchargeable.',
        )
        return
      }
    }

    // Le fichier d'abord : ouvrir la régie sans avoir la créative sous la main
    // oblige à revenir, et c'est là qu'on abandonne.
    await telechargerImage(assetUrl(img.path), etiquetteDe(img, titre))
    setEnCours(null)
    const gestionnaire = img.platform ? GESTIONNAIRES[img.platform] : null
    if (gestionnaire) window.open(gestionnaire.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Layout>
      <BlocSection id="plateforme" />
      {/* Nadia reste la, en haut : une question sur une pub se pose devant la
          pub, pas dans un autre ecran. */}
      <AgentBar
        agentKey="marketing"
        nom="Nadia"
        emoji="📣"
        exemple="Demandez a Nadia : quel format marche le mieux sur TikTok ?"
      />

      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Megaphone size={22} className="text-purple-300" />
          <span>Mes pubs</span>
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Les publicités créées par Nadia, rangées par annonce. Elles sont déjà payées : les revoir
          et les télécharger ne coûte rien.
        </p>
      </div>

      {chargement ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : groupes.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold">Aucune publicité pour l'instant</h2>
          <p className="mt-2 text-sm text-gray-400">
            Ouvrez une annonce et demandez à Nadia de créer une publicité : photo du produit, logo
            de la boutique, prix de vente et bouton vers la boutique.
          </p>
          <Link
            to="/dashboard"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            Voir mes annonces <ChevronRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groupes.map((groupe) => {
            const cle = groupe.productId ?? '—'
            const deplie = ouvert === cle
            return (
              <section key={cle} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                <button
                  type="button"
                  onClick={() => setOuvert(deplie ? null : cle)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5"
                >
                  <img
                    src={assetUrl(groupe.pubs[0].path)}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{groupe.titre}</p>
                    <p className="text-xs text-gray-500">
                      {`${groupe.pubs.length} publicité${groupe.pubs.length > 1 ? 's' : ''} · ${[
                        ...new Set(groupe.pubs.map((p) => (p.platform ? FORMATS[p.platform] ?? p.platform : '—'))),
                      ].join(', ')}`}
                    </p>
                  </div>
                  <ChevronRight
                    size={18}
                    className={`shrink-0 text-gray-500 transition ${deplie ? 'rotate-90' : ''}`}
                  />
                </button>

                {deplie && (
                  <div className="border-t border-white/10 p-4">
                    {/*
                      Une mosaïque en colonnes, pas une grille à cases égales.
                      Les formats vont du carré 1080 à la story 1080×1920 : les
                      forcer dans la même case rognerait les stories ou laisserait
                      des bandes noires autour des bannières. En colonnes, chaque
                      visuel garde ses proportions et les autres se referment
                      dessus.
                    */}
                    <ul className="columns-1 gap-3 sm:columns-2 lg:columns-3 [&>li]:mb-3 [&>li]:break-inside-avoid">
                      {groupe.pubs.map((img) => {
                        const gestionnaire = img.platform ? GESTIONNAIRES[img.platform] : null
                        return (
                          <li key={img.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                            <button
                              type="button"
                              onClick={() => setAffichee(img)}
                              className="block w-full"
                              title="Ouvrir en grand"
                            >
                              <img
                                src={assetUrl(img.path)}
                                alt=""
                                loading="lazy"
                                className="w-full"
                              />
                            </button>

                            <div className="p-3">
                              <p className="text-xs text-gray-300">
                                {img.platform ? FORMATS[img.platform] ?? img.platform : 'Format libre'}
                              </p>
                              <p className="text-[11px] text-gray-600">
                                {`${img.width}×${img.height} · ${new Date(img.createdAt).toLocaleDateString('fr-FR')}`}
                              </p>

                              <div className="mt-3 flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setAffichee(img)}
                                  title="Ouvrir en grand"
                                  className="rounded-lg bg-white/10 p-2 text-gray-200 hover:bg-white/20"
                                >
                                  <Eye size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => telechargerImage(assetUrl(img.path), etiquetteDe(img, groupe.titre))}
                                  title="Télécharger le fichier"
                                  className="rounded-lg bg-white/10 p-2 text-gray-200 hover:bg-white/20"
                                >
                                  <Download size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => jeter(img.id)}
                                  title="Jeter"
                                  className="rounded-lg bg-white/10 p-2 text-red-300 hover:bg-red-500/20"
                                >
                                  <Trash2 size={14} />
                                </button>

                                {/*
                                  Signaler, plutôt qu'un bouton qui recrédite.
                                  Un remboursement automatique se presse par
                                  réflexe et n'apprend rien : ni ce qui rate, ni
                                  sur quoi, ni à quelle fréquence.
                                */}
                                <button
                                  type="button"
                                  onClick={() => setSignalee(img)}
                                  title="Signaler : cette publicité est inutilisable"
                                  className="rounded-lg bg-white/10 p-2 text-amber-300 hover:bg-amber-500/20"
                                >
                                  <LifeBuoy size={14} />
                                </button>

                                {gestionnaire ? (
                                  <button
                                    type="button"
                                    onClick={() => diffuser(img, groupe.titre)}
                                    disabled={enCours === img.id}
                                    className="ml-auto flex items-center gap-1.5 rounded-lg bg-purple-500/80 px-3 py-2 text-xs font-medium hover:bg-purple-500 disabled:opacity-50"
                                  >
                                    {enCours === img.id ? (
                                      <Loader2 size={13} className="animate-spin" />
                                    ) : (
                                      <ExternalLink size={13} />
                                    )}
                                    <span>Diffuser</span>
                                  </button>
                                ) : null}
                              </div>

                              {/*
                                Ce que le bouton fait vraiment, dit sous le
                                bouton. Le même mot recouvre deux gestes très
                                différents selon ce qui est branché, et laisser
                                le vendeur deviner lequel serait le pire des
                                deux mondes.
                              */}
                              {comptePour(img.platform) ? (
                                <p className="mt-2 text-[11px] leading-relaxed text-emerald-300/80">
                                  {`« Diffuser » dépose la campagne sur ${comptePour(img.platform)?.label ?? 'votre compte publicitaire'}. Elle passe en revue chez la régie avant de diffuser.`}
                                </p>
                              ) : gestionnaire ? (
                                <p className="mt-2 text-[11px] leading-relaxed text-gray-600">
                                  {`« Diffuser » télécharge le fichier et ouvre ${gestionnaire.label} : aucun compte publicitaire n'est relié. Reliez-le depuis Marketing pour déposer directement.`}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        )
                      })}
                    </ul>

                    {groupe.productId ? (
                      <Link
                        to={`/products/${groupe.productId}`}
                        className="mt-4 inline-flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200"
                      >
                        Voir l'annonce <ChevronRight size={13} />
                      </Link>
                    ) : null}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {affichee ? (
        <ImageViewer
          url={assetUrl(affichee.path)}
          etiquette={etiquetteDe(affichee, affichee.productTitle ?? 'pub')}
          sousTitre={[
            affichee.platform ? FORMATS[affichee.platform] ?? affichee.platform : null,
            `${affichee.width}×${affichee.height}`,
          ]
            .filter(Boolean)
            .join(' · ')}
          onClose={() => setAffichee(null)}
        />
      ) : null}

      {signalee ? (
        <TicketDialog
          kind="pub"
          generatedImageId={signalee.id}
          productId={signalee.productId ?? undefined}
          sujetPropose={`Publicité inutilisable — ${signalee.productTitle ?? 'annonce'}`}
          onClose={() => setSignalee(null)}
        />
      ) : null}
    </Layout>
  )
}
