import { useEffect, useState } from 'react'
import { Palette, Sparkles, ExternalLink, Copy, Check, Loader2 } from 'lucide-react'
import { api, apiRoot } from '../lib/api'

/**
 * L'apparence d'une boutique : le thème, les textes, et l'adresse de la vitrine.
 *
 * **Le générateur d'abord, la bibliothèque ensuite.** Un vendeur qui vient
 * d'ajouter sa boutique ne sait pas ce qu'il veut : lui présenter vingt et une
 * vignettes le fait hésiter dix minutes puis prendre la première. Décrire son
 * commerce en une phrase est une question à laquelle il sait répondre, et le
 * choix des vingt et un reste là pour celui qui veut trancher lui-même.
 *
 * **Rien n'est enregistré sans un second geste.** La proposition s'essaie sur la
 * vraie boutique avec `?theme=` — une vignette ne dit pas si un thème tient sur
 * un catalogue réel — et c'est « Appliquer » qui écrit. Une génération qui
 * écrirait directement remplacerait des textes que le marchand a peut-être mis
 * une heure à écrire.
 */

type Theme = Awaited<ReturnType<typeof api.listThemes>>[number]
type Proposition = Awaited<ReturnType<typeof api.genererVitrine>>

const champ =
  'w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none transition focus:border-purple-400/70'

export function VitrineBlock({
  shop,
  onSaved,
}: {
  shop: { id: string; name: string; slug: string | null; themeId: string; storefront: Record<string, string | number> | null }
  onSaved: () => void
}) {
  const [themes, setThemes] = useState<Theme[]>([])
  const [description, setDescription] = useState('')
  const [propose, setPropose] = useState<Proposition | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)
  const [tousLesThemes, setTousLesThemes] = useState(false)

  useEffect(() => {
    api.listThemes().then(setThemes).catch(() => {
      // La bibliothèque indisponible n'empêche pas de régler le reste de la
      // boutique : le bloc se contente de ne pas proposer de vignettes.
    })
  }, [])

  const adresse = shop.slug ? `${apiRoot}/b/${shop.slug}` : null
  const actuel = themes.find((t) => t.id === shop.themeId)

  async function generer() {
    setEnCours(true)
    setErreur(null)
    try {
      setPropose(await api.genererVitrine(shop.id, description))
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Génération impossible')
    } finally {
      setEnCours(false)
    }
  }

  async function appliquer(themeId: string, contenu?: Proposition['contenu']) {
    setErreur(null)
    try {
      await api.renameShop(shop.id, {
        themeId,
        // Les textes ne partent que s'il y en a : choisir un thème dans la
        // bibliothèque ne doit pas effacer l'accroche déjà écrite.
        ...(contenu ? { storefront: { ...(shop.storefront ?? {}), ...contenu } } : {}),
      })
      setPropose(null)
      onSaved()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Enregistrement impossible')
    }
  }

  /** L'adresse d'essai : la vraie boutique, avec un autre thème, sans rien écrire. */
  const essai = (themeId: string) => (adresse ? `${adresse}?theme=${themeId}` : null)

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Palette size={15} className="text-purple-300" />
          <span>Apparence de la vitrine</span>
        </p>
        {actuel ? (
          <span className="text-[11px] text-gray-400">{`${actuel.nom} · ${actuel.structure.nom}`}</span>
        ) : null}
      </header>

      {/* --- L'adresse publique -------------------------------------------- */}
      {adresse ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
          <code className="min-w-0 flex-1 truncate text-[11px] text-gray-300">{adresse}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(adresse)
              setCopie(true)
              setTimeout(() => setCopie(false), 1500)
            }}
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-gray-400 hover:bg-white/5"
            title="Copier l'adresse"
          >
            {copie ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <a
            href={adresse}
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-gray-400 hover:bg-white/5"
            title="Ouvrir la vitrine"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      ) : (
        <p className="text-[11px] text-gray-500">
          Cette boutique n'a pas encore d'adresse de vitrine. Renommez-la pour qu'elle en reçoive une.
        </p>
      )}

      {/* --- Le générateur -------------------------------------------------- */}
      <div>
        <label className="text-xs text-gray-400">Décrivez votre commerce en une phrase</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Je vends des bijoux en argent et des montres pour hommes, plutôt haut de gamme."
          className={`${champ} mt-1`}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generer}
            disabled={enCours || description.trim().length < 10}
            className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {enCours ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            <span>{enCours ? 'Écriture…' : 'Habiller ma vitrine'}</span>
          </button>
          <span className="text-[11px] text-gray-500">
            1 crédit — rendu si rien n'est écrit
          </span>
        </div>
      </div>

      {erreur ? (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{erreur}</p>
      ) : null}

      {/* --- La proposition -------------------------------------------------- */}
      {propose ? (
        <div className="space-y-3 rounded-xl border border-purple-400/40 bg-purple-500/10 p-3">
          <p className="text-xs text-purple-100">{propose.raison}</p>

          <div className="rounded-lg bg-black/25 p-3">
            <p className="text-lg font-semibold leading-tight">
              {propose.contenu.accroche}
              <br />
              <span className="text-purple-300">{propose.contenu.accrocheSuite}</span>
            </p>
            <p className="mt-1.5 text-xs text-gray-400">{propose.contenu.sousTitre}</p>
            {propose.contenu.annonce ? (
              <p className="mt-2 rounded bg-purple-500/20 px-2 py-1 text-[11px]">{propose.contenu.annonce}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => appliquer(propose.themeId, propose.contenu)}
              className="btn-gradient rounded-lg px-3 py-1.5 text-xs font-semibold"
            >
              Appliquer
            </button>
            {essai(propose.themeId) ? (
              <a
                href={essai(propose.themeId)!}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                <span>Voir sur ma boutique</span>
                <ExternalLink size={11} />
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => setPropose(null)}
              className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white"
            >
              Écarter
            </button>
          </div>
          {propose.rayonsRetenus.length ? (
            <p className="text-[11px] text-gray-500">
              {`Choisi d'après vos rayons : ${propose.rayonsRetenus.slice(0, 4).join(', ')}`}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* --- La bibliothèque -------------------------------------------------- */}
      {themes.length ? (
        <div>
          <button
            type="button"
            onClick={() => setTousLesThemes((v) => !v)}
            className="text-[11px] text-purple-300 hover:underline"
          >
            {tousLesThemes ? 'Masquer les thèmes' : `Choisir moi-même parmi ${themes.length} thèmes`}
          </button>

          {tousLesThemes ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {themes.map((t) => (
                <Vignette
                  key={t.id}
                  theme={t}
                  choisi={t.id === shop.themeId}
                  essai={essai(t.id)}
                  onChoisir={() => appliquer(t.id)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Un thème, montré par ses vraies couleurs.
 *
 * L'aperçu n'est pas une image mais les jetons de la palette posés sur trois
 * blocs. Rien à générer, rien à stocker, et la vignette suit automatiquement une
 * palette corrigée — ce qui arrive : le banc a déjà rattrapé cinquante-deux
 * contrastes insuffisants.
 */
function Vignette({
  theme,
  choisi,
  essai,
  onChoisir,
}: {
  theme: Theme
  choisi: boolean
  essai: string | null
  onChoisir: () => void
}) {
  const a = theme.apercu
  return (
    <div
      className={`overflow-hidden rounded-xl border transition ${
        choisi ? 'border-purple-400/70' : 'border-white/10 hover:border-white/25'
      }`}
    >
      <div className="flex h-16" style={{ background: a.background }}>
        <div className="flex-1 p-2">
          <div className="h-2 w-3/4 rounded-sm" style={{ background: a.foreground }} />
          <div className="mt-1 h-1.5 w-1/2 rounded-sm" style={{ background: a.accent }} />
          <div className="mt-2 h-4 w-12 rounded" style={{ background: a.primary }} />
        </div>
        <div className="w-12 border-l" style={{ background: a.card, borderColor: a.accent }} />
      </div>

      <div className="p-2.5">
        <p className="text-xs font-semibold">{theme.nom}</p>
        <p className="truncate text-[10.5px] text-gray-500">{theme.structure.nom}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onChoisir}
            disabled={choisi}
            className={`rounded-md px-2 py-1 text-[11px] transition ${
              choisi ? 'bg-purple-500/20 text-purple-200' : 'border border-white/15 hover:bg-white/5'
            }`}
          >
            {choisi ? 'En place' : 'Choisir'}
          </button>
          {essai ? (
            <a
              href={essai}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[11px] text-gray-500 hover:text-white"
              title="Essayer sur ma boutique, sans enregistrer"
            >
              Essayer
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
