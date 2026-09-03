import { useEffect, useState } from 'react'
import { FolderTree, Layers3, Trash2, Loader2, AlertTriangle, Wand2 } from 'lucide-react'
import { api } from '../lib/api'

/**
 * Ce qu'on peut faire d'un lot d'annonces cochées, en dehors de la publication.
 *
 * Trois gestes qui n'existaient pas et qui se font sinon annonce par annonce :
 * ranger, poser une option, supprimer. Sur trente annonces importées d'un coup,
 * c'est trente allers-retours qu'on ne fait pas — et donc qu'on ne fait pas du
 * tout : les annonces restent mal rangées et sans options.
 *
 * **Les trois demandent une confirmation, et la suppression une de plus.** Une
 * action en lot est irréversible par construction : elle touche ce qui est
 * coché, et ce qui est coché n'est plus à l'écran une fois la liste rechargée.
 */

type Categorie = { id: string; group: string; label: string }
type Jeu = { id: string; nom: string; valeurs: string[]; aide: string }

export function BulkActions({
  ids,
  onFait,
}: {
  ids: string[]
  /** Rechargement de la liste, plus le message à afficher. */
  onFait: (message: string) => void
}) {
  const [ouvert, setOuvert] = useState<'categorie' | 'options' | 'supprimer' | 'reecrire' | null>(null)
  const [categories, setCategories] = useState<Categorie[]>([])
  const [jeux, setJeux] = useState<Jeu[]>([])
  const [choixCategorie, setChoixCategorie] = useState('')
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    api.listCategories().then((r) => setCategories(r.categories)).catch(() => undefined)
    api.jeuxOptions().then(setJeux).catch(() => undefined)
  }, [])

  async function lancer(corps: Parameters<typeof api.actionLot>[0]) {
    setBusy(true)
    setErreur(null)
    try {
      const r = await api.actionLot(corps)
      /*
       * Le compte-rendu dit les trois chiffres, pas seulement le succès.
       *
       * « 12 traitées » sur un lot de 20 laisse chercher les 8 autres. Dire
       * qu'elles étaient déjà dans cet état est une réponse ; ne rien dire est
       * une inquiétude.
       */
      const bouts = [`${r.faites} annonce(s) traitée(s)`]
      if (r.inchangees) bouts.push(`${r.inchangees} déjà dans cet état`)
      if (r.echecs.length) bouts.push(`${r.echecs.length} en échec`)
      onFait(`${r.message ? `${r.message} ` : ''}${bouts.join(' · ')}.`)
      setOuvert(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Action impossible')
    } finally {
      setBusy(false)
    }
  }

  /*
   * `whitespace-nowrap` : un bouton se replie entier, jamais en son milieu.
   *
   * Sans lui, « Refaire la réécriture IA » se coupe sur deux lignes dès que la
   * barre se resserre, et les quatre boutons prennent des hauteurs différentes.
   * C'est la rangée qui doit se replier, pas le libellé.
   */
  const bouton =
    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/15 px-3 py-2 text-xs transition hover:bg-white/5 disabled:opacity-40'

  return (
    <>
      {/*
        Refaire la réécriture, en lot.
        Né d'une panne : quand l'IA ne répond pas, l'import garde le texte du
        fournisseur plutôt que d'échouer, et rend le crédit. Des dizaines
        d'annonces arrivent alors complètes et inutilisables — trente le
        02/09/2026 — et les reprendre une par une, c'est trente allers-retours.
      */}
      <button type="button" disabled={!ids.length} onClick={() => setOuvert('reecrire')} className={bouton}>
        <Wand2 size={14} />
        <span>Refaire la réécriture IA</span>
      </button>
      <button type="button" disabled={!ids.length} onClick={() => setOuvert('categorie')} className={bouton}>
        <FolderTree size={14} />
        <span>Changer de catégorie</span>
      </button>
      <button type="button" disabled={!ids.length} onClick={() => setOuvert('options')} className={bouton}>
        <Layers3 size={14} />
        <span>Ajouter une option</span>
      </button>
      <button
        type="button"
        disabled={!ids.length}
        onClick={() => setOuvert('supprimer')}
        className={`${bouton} text-red-300 hover:bg-red-500/10`}
      >
        <Trash2 size={14} />
        <span>Supprimer</span>
      </button>

      {ouvert ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setOuvert(null)}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1b1633] p-5">
            {/* --- Ranger --------------------------------------------------- */}
            {ouvert === 'categorie' ? (
              <>
                <h2 className="text-base font-bold">{`Ranger ${ids.length} annonce(s)`}</h2>
                <p className="mt-1 text-xs text-gray-400">
                  La catégorie décide de ce qui part sur chaque place de marché, et du rayon de votre
                  boutique.
                </p>
                <select
                  value={choixCategorie}
                  onChange={(e) => setChoixCategorie(e.target.value)}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
                >
                  <option value="">Choisir une catégorie…</option>
                  {/*
                    Groupées par rayon : le référentiel en compte 224, et une
                    liste à plat se parcourt à l'aveugle.
                  */}
                  {[...new Set(categories.map((c) => c.group))].map((groupe) => (
                    <optgroup key={groupe} label={groupe}>
                      {categories
                        .filter((c) => c.group === groupe)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </>
            ) : null}

            {/* --- Poser une option ----------------------------------------- */}
            {ouvert === 'options' ? (
              <>
                <h2 className="text-base font-bold">{`Ajouter une option à ${ids.length} annonce(s)`}</h2>
                <p className="mt-1 text-xs text-gray-400">
                  Une annonce qui porte déjà cette option n'est pas touchée : des tailles relevées
                  chez le fournisseur valent mieux qu'une liste standard.
                </p>
                <div className="mt-3 space-y-2">
                  {jeux.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      disabled={busy}
                      onClick={() => lancer({ ids, action: 'options', jeu: j.id })}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-purple-400/50 hover:bg-white/[0.08] disabled:opacity-50"
                    >
                      <p className="text-sm font-semibold">{j.nom}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-gray-400">{j.aide}</p>
                      {j.valeurs.length ? (
                        <p className="mt-1.5 text-[11px] text-purple-300">{j.valeurs.join(' · ')}</p>
                      ) : null}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {/* --- Refaire la réécriture -------------------------------------- */}
            {ouvert === 'reecrire' ? (
              <>
                <h2 className="text-base font-bold">{`Refaire la réécriture de ${ids.length} annonce(s)`}</h2>
                <p className="mt-2 text-xs leading-relaxed text-gray-400">
                  L'IA repart du <strong className="text-gray-200">titre et de la description
                  d'origine</strong>, conservés dans l'annonce, et réécrit titre, description,
                  arguments de vente, attributs et mots-clés. Elle ne retourne pas sur la page du
                  fournisseur : une fiche AliExpress se reprend donc comme une autre.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-gray-400">
                  Vos photos, votre prix et votre rangement ne sont pas touchés. Ce que vous avez
                  saisi vous-même dans les attributs et les arguments n'est remplacé que si l'IA en
                  rend davantage.
                </p>
                <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-400">
                  {`1 crédit annonce par annonce, soit ${ids.length} au total. Une annonce que l'IA ne réécrit pas n'est pas facturée.`}
                </p>
              </>
            ) : null}

            {/* --- Supprimer ------------------------------------------------- */}
            {ouvert === 'supprimer' ? (
              <>
                <h2 className="flex items-center gap-2 text-base font-bold text-red-200">
                  <AlertTriangle size={16} />
                  <span>{`Supprimer ${ids.length} annonce(s) ?`}</span>
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-gray-400">
                  Les annonces sont supprimées définitivement, avec leurs textes réécrits et leur
                  rangement. <strong className="text-gray-200">Les photos restent</strong> sur le
                  serveur, mais plus rien ne pointera vers elles.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-gray-400">
                  Ce qui est déjà publié ailleurs — une boutique, une place de marché — n'est pas
                  retiré : la suppression est chez nous, pas chez eux.
                </p>
              </>
            ) : null}

            {erreur ? (
              <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {erreur}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOuvert(null)}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
              >
                Annuler
              </button>
              {ouvert === 'categorie' ? (
                <button
                  type="button"
                  disabled={busy || !choixCategorie}
                  onClick={() => lancer({ ids, action: 'categorie', categoryId: choixCategorie })}
                  className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                  <span>Ranger</span>
                </button>
              ) : null}
              {ouvert === 'reecrire' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => lancer({ ids, action: 'reecrire' })}
                  className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                  <span>{busy ? 'Réécriture en cours…' : `Réécrire les ${ids.length}`}</span>
                </button>
              ) : null}
              {ouvert === 'supprimer' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => lancer({ ids, action: 'supprimer' })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/80 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : null}
                  <span>Supprimer définitivement</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
