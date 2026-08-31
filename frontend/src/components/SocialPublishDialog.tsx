import { useEffect, useMemo, useState } from 'react'
import { X, Send, Check, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'
import { api, assetUrl } from '../lib/api'

/**
 * Publier une annonce sur les réseaux du vendeur, en la lui montrant d'abord.
 *
 * **Le défaut est de montrer, pas d'envoyer.** Une publication part sur la page
 * d'un vendeur, devant ses clients : c'est irréversible sans suppression
 * manuelle, et un texte mal coupé ou une photo de travers s'y voient tout de
 * suite. Il relit, il corrige, il envoie — comme pour « Déposer mon annonce »
 * sur Leboncoin, et pour la même raison.
 *
 * La case « ne plus me demander » existe parce qu'à la trentième annonce la
 * relecture devient une corvée, et qu'une corvée finit par se cliquer sans
 * lire. Elle est gardée dans le navigateur du vendeur : c'est sa décision, sur
 * sa machine, et elle ne suit pas les autres membres de l'équipe.
 *
 * **Un message par réseau**, parce que le même texte partout se voit — et parce
 * qu'Instagram ne rend aucun lien cliquable là où Facebook les accepte.
 */

const CLE_SANS_RELECTURE = 'dsp.social.sansRelecture'

/** Ce que le vendeur reconnaît, plutôt que la clé technique du réseau. */
const NOMS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  x: 'X',
  threads: 'Threads',
  pinterest: 'Pinterest',
  telegram: 'Telegram',
  youtube: 'YouTube',
}

const COULEURS: Record<string, string> = {
  facebook: '#1877f2',
  instagram: '#e1306c',
  tiktok: '#25f4ee',
  linkedin: '#0a66c2',
  x: '#e7e9ea',
  threads: '#a1a1aa',
  pinterest: '#e60023',
  telegram: '#2aabee',
  youtube: '#ff0000',
}

type Brouillon = Awaited<ReturnType<typeof api.socialDraft>>
type Resultat = Awaited<ReturnType<typeof api.socialPost>>

export function SocialPublishDialog({
  productId,
  onClose,
}: {
  productId: string
  onClose: () => void
}) {
  const [donnees, setDonnees] = useState<Brouillon | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [choisis, setChoisis] = useState<Set<string>>(new Set())
  const [textes, setTextes] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<Set<string>>(new Set())
  const [envoi, setEnvoi] = useState(false)
  const [resultat, setResultat] = useState<Resultat | null>(null)

  useEffect(() => {
    api
      .socialDraft(productId)
      .then((d) => {
        setDonnees(d)
        setTextes(Object.fromEntries(d.brouillons.map((b) => [b.platform, b.texte])))
        // Les comptes connectés sont cochés d'office : c'est ce que le vendeur
        // veut neuf fois sur dix, et décocher est plus rapide que cocher.
        setChoisis(new Set(d.comptes.filter((c) => c.connected).map((c) => c.externalId)))
        // Les quatre premières photos : au-delà, un album devient un catalogue.
        setPhotos(new Set(d.medias.slice(0, 4)))
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Chargement impossible'))
  }, [productId])

  const comptes = donnees?.comptes ?? []
  const connectes = comptes.filter((c) => c.connected)

  /** Les réseaux réellement visés, pour n'afficher que ces messages-là. */
  const reseauxVises = useMemo(
    () => [...new Set(comptes.filter((c) => choisis.has(c.externalId)).map((c) => c.platform))],
    [comptes, choisis],
  )

  const basculer = (ensemble: Set<string>, valeur: string, poser: (s: Set<string>) => void) => {
    const suivant = new Set(ensemble)
    if (suivant.has(valeur)) suivant.delete(valeur)
    else suivant.add(valeur)
    poser(suivant)
  }

  async function envoyer() {
    if (!donnees) return
    setEnvoi(true)
    setErreur(null)
    try {
      /*
       * Un envoi par réseau, et non un seul pour tous.
       *
       * Le message diffère d'un réseau à l'autre : un envoi unique imposerait le
       * même texte partout, ce qui annule tout le travail de composition.
       */
      const parReseau = new Map<string, string[]>()
      for (const compte of comptes) {
        if (!choisis.has(compte.externalId)) continue
        parReseau.set(compte.platform, [...(parReseau.get(compte.platform) ?? []), compte.externalId])
      }

      const medias = [...photos]
      const resultats = await Promise.all(
        [...parReseau].map(([platform, cs]) =>
          api.socialPost({ comptes: cs, texte: textes[platform] ?? '', medias }),
        ),
      )

      setResultat({
        externalId: resultats[0]?.externalId ?? '',
        etat: resultats.every((r) => r.etat === 'publiee')
          ? 'publiee'
          : resultats.some((r) => r.parCompte.some((c) => c.etat === 'publiee'))
            ? 'partielle'
            : 'echouee',
        parCompte: resultats.flatMap((r) => r.parCompte),
      })
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Publication impossible')
    } finally {
      setEnvoi(false)
    }
  }

  const nom = (externalId: string) =>
    comptes.find((c) => c.externalId === externalId)?.label ?? externalId

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#1b1633]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <div>
            <h2 className="text-lg font-bold">Publier sur vos réseaux</h2>
            <p className="mt-0.5 text-xs text-gray-400">
              Relisez avant d'envoyer : une publication part devant vos clients.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </header>

        {erreur ? (
          <p className="m-5 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {erreur}
          </p>
        ) : null}

        {!donnees && !erreur ? (
          <p className="p-8 text-center text-sm text-gray-400">Chargement…</p>
        ) : null}

        {/* ---------- Ce qui s'est passé, une fois envoyé ---------- */}
        {resultat ? (
          <div className="p-5">
            <ul className="space-y-2">
              {resultat.parCompte.map((c) => (
                <li
                  key={c.compte}
                  className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${
                    c.etat === 'publiee'
                      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                      : 'border-red-400/30 bg-red-400/10 text-red-100'
                  }`}
                >
                  {c.etat === 'publiee' ? (
                    <Check size={16} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{nom(c.compte)}</p>
                    {/*
                      L'erreur est affichée telle quelle : elle vient du réseau et
                      dit quoi faire — reconnecter, attendre, ajouter une image.
                    */}
                    {c.erreur ? <p className="mt-0.5 opacity-90">{c.erreur}</p> : null}
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 underline underline-offset-2"
                      >
                        Voir la publication <ExternalLink size={12} />
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold hover:bg-purple-400"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : null}

        {/* ---------- La relecture ---------- */}
        {donnees && !resultat ? (
          <div className="space-y-5 p-5">
            {connectes.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-sm">
                <p className="font-medium">Aucun compte raccordé</p>
                <p className="mt-1 text-gray-400">
                  Reliez votre page Facebook ou votre compte Instagram dans Réglages › Réseaux
                  sociaux. Vous vous authentifiez chez Meta — nous ne voyons jamais votre mot de
                  passe.
                </p>
              </div>
            ) : (
              <>
                {/* --- Où publier --- */}
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Où publier
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {comptes.map((c) => {
                      const actif = choisis.has(c.externalId)
                      return (
                        <button
                          key={c.externalId}
                          type="button"
                          disabled={!c.connected}
                          onClick={() => basculer(choisis, c.externalId, setChoisis)}
                          title={c.connected ? undefined : 'Compte déconnecté : reliez-le à nouveau'}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            actif
                              ? 'border-purple-400/60 bg-purple-500/20'
                              : 'border-white/10 bg-white/5 hover:border-white/25'
                          }`}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: COULEURS[c.platform] ?? '#a855f7' }}
                          />
                          <span>{c.label ?? NOMS[c.platform] ?? c.platform}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>

                {/* --- Les photos --- */}
                {donnees.medias.length > 0 ? (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Photos — {photos.size} choisie(s)
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {donnees.medias.map((m) => {
                        const actif = photos.has(m)
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => basculer(photos, m, setPhotos)}
                            className={`relative h-16 w-16 overflow-hidden rounded-lg border-2 transition ${
                              actif ? 'border-purple-400' : 'border-transparent opacity-40'
                            }`}
                          >
                            <img src={assetUrl(m)} alt="" className="h-full w-full object-cover" />
                            {actif ? (
                              <span className="absolute right-0.5 top-0.5 rounded-full bg-purple-500 p-0.5">
                                <Check size={10} />
                              </span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                    {/* Instagram refuse un message sans image, et le refus
                        arriverait après l'envoi si on ne le disait pas ici. */}
                    {photos.size === 0 && reseauxVises.includes('instagram') ? (
                      <p className="mt-2 text-xs text-amber-300">
                        Instagram exige au moins une photo.
                      </p>
                    ) : null}
                  </section>
                ) : null}

                {/* --- Les messages, un par réseau --- */}
                {reseauxVises.map((r) => {
                  const brouillon = donnees.brouillons.find((b) => b.platform === r)
                  const texte = textes[r] ?? ''
                  return (
                    <section key={r}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Message — {NOMS[r] ?? r}
                        </h3>
                        <span className="text-xs text-gray-500">{texte.length} caractères</span>
                      </div>
                      <textarea
                        value={texte}
                        onChange={(e) => setTextes({ ...textes, [r]: e.target.value })}
                        rows={7}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-purple-400/70"
                      />
                      {brouillon?.note ? (
                        <p className="mt-1 text-xs text-gray-500">{brouillon.note}</p>
                      ) : null}
                    </section>
                  )
                })}

                {donnees.lien ? null : (
                  <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400">
                    Cette annonce n'est publiée sur aucun site : le message ne renvoie donc nulle
                    part. Publiez-la d'abord sur « Mon site » ou Shopify pour y ajouter un lien.
                  </p>
                )}
              </>
            )}
          </div>
        ) : null}

        {/* ---------- Le pied ---------- */}
        {donnees && !resultat && connectes.length > 0 ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-5">
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                onChange={(e) => {
                  try {
                    if (e.target.checked) localStorage.setItem(CLE_SANS_RELECTURE, '1')
                    else localStorage.removeItem(CLE_SANS_RELECTURE)
                  } catch {
                    // Navigation privée, stockage bloqué : la case ne se retient
                    // pas, et c'est sans conséquence — la relecture reste.
                  }
                }}
                className="accent-purple-500"
              />
              Ne plus me demander de relire
            </label>

            <button
              type="button"
              onClick={envoyer}
              disabled={envoi || choisis.size === 0}
              className="flex items-center gap-2 rounded-lg bg-purple-500 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-400 disabled:opacity-50"
            >
              {envoi ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {envoi ? 'Envoi…' : `Publier sur ${choisis.size} compte(s)`}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  )
}

/** Vrai quand le vendeur a demandé à ne plus relire. */
export function relectureDesactivee(): boolean {
  try {
    return localStorage.getItem(CLE_SANS_RELECTURE) === '1'
  } catch {
    return false
  }
}
