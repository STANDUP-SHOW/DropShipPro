import { useEffect, useRef, useState } from 'react'
import { Palette, Sparkles, ExternalLink, Copy, Check, Loader2, PenLine, Search, ImagePlus, Trash2 } from 'lucide-react'
import { api, apiRoot, assetUrl } from '../lib/api'
import { PriceInput } from './PriceInput'

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
  shop: {
    id: string
    name: string
    slug: string | null
    themeId: string
    storefront: Record<string, string | number> | null
    vitrineLogoEntete?: string | null
    vitrineLogoAccueil?: string | null
  }
  onSaved: () => void
}) {
  const [themes, setThemes] = useState<Theme[]>([])
  const [description, setDescription] = useState('')
  const [propose, setPropose] = useState<Proposition | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)
  const [tousLesThemes, setTousLesThemes] = useState(false)
  const [filtreStructure, setFiltreStructure] = useState('')
  const [rechercheTheme, setRechercheTheme] = useState('')
  const [editeur, setEditeur] = useState(false)
  const [textes, setTextes] = useState({ accroche: '', accrocheSuite: '', sousTitre: '', annonce: '' })
  const [fraisPort, setFraisPort] = useState(4.9)
  const [portOffertDes, setPortOffertDes] = useState(79)
  const [sauve, setSauve] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)

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

  /** Ouvre l'éditeur sur ce qui est réellement en place, jamais sur du vide. */
  function ouvrirEditeur() {
    const sf = shop.storefront ?? {}
    setTextes({
      accroche: typeof sf.accroche === 'string' ? sf.accroche : '',
      accrocheSuite: typeof sf.accrocheSuite === 'string' ? sf.accrocheSuite : '',
      sousTitre: typeof sf.sousTitre === 'string' ? sf.sousTitre : '',
      annonce: typeof sf.annonce === 'string' ? sf.annonce : '',
    })
    setFraisPort(typeof sf.fraisPort === 'number' ? sf.fraisPort : 4.9)
    setPortOffertDes(typeof sf.portOffertDes === 'number' ? sf.portOffertDes : 79)
    setEditeur(true)
  }

  /**
   * Écrit les textes de la vitrine, champ par champ.
   *
   * PATCH remplace le JSON `storefront` en entier : on repart donc de ce qui est
   * stocké et on renvoie l'objet complet. Un champ texte vidé est retiré de
   * l'objet — la vitrine retombe alors sur son texte d'usine, ce que le libellé
   * du bloc annonce ; les deux montants partent toujours, 0 est une valeur
   * (port offert).
   */
  async function enregistrerTextes() {
    setErreur(null)
    setEnregistrement(true)
    try {
      const sf: Record<string, string | number> = { ...(shop.storefront ?? {}) }
      for (const cle of ['accroche', 'accrocheSuite', 'sousTitre', 'annonce'] as const) {
        const net = textes[cle].trim()
        if (net) sf[cle] = net
        else delete sf[cle]
      }
      sf.fraisPort = fraisPort
      sf.portOffertDes = portOffertDes
      await api.renameShop(shop.id, { storefront: sf })
      setSauve(true)
      setTimeout(() => setSauve(false), 1800)
      onSaved()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setEnregistrement(false)
    }
  }

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

      {/* --- Les logos de la vitrine ---------------------------------------- */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <LogoVitrine
          shopId={shop.id}
          emplacement="entete"
          titre="Logo de l'en-tête"
          aide="Dans la barre de titre, à côté du nom. Petit, PNG ou SVG."
          actuel={shop.vitrineLogoEntete ?? null}
          onSaved={onSaved}
        />
        <LogoVitrine
          shopId={shop.id}
          emplacement="accueil"
          titre="Logo d'accueil"
          aide="Au-dessus du titre, sur la page d'accueil. Grand (~500 px), PNG ou SVG."
          actuel={shop.vitrineLogoAccueil ?? null}
          onSaved={onSaved}
        />
      </div>

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

      {/* --- L'éditeur des textes -------------------------------------------- */}
      <div>
        <button
          type="button"
          onClick={() => (editeur ? setEditeur(false) : ouvrirEditeur())}
          className="inline-flex items-center gap-1.5 text-[11px] text-purple-300 hover:underline"
        >
          <PenLine size={11} />
          <span>{editeur ? 'Masquer les textes' : 'Écrire moi-même les textes et la livraison'}</span>
        </button>

        {editeur ? (
          <div className="mt-3 space-y-2.5 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <label className="text-xs text-gray-400">Accroche (1ʳᵉ ligne du titre)</label>
                <input
                  value={textes.accroche}
                  onChange={(e) => setTextes((t) => ({ ...t, accroche: e.target.value }))}
                  maxLength={120}
                  placeholder="Notre sélection,"
                  className={`${champ} mt-1`}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Suite de l'accroche</label>
                <input
                  value={textes.accrocheSuite}
                  onChange={(e) => setTextes((t) => ({ ...t, accrocheSuite: e.target.value }))}
                  maxLength={120}
                  placeholder="choisie pour vous."
                  className={`${champ} mt-1`}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400">Sous-titre</label>
              <textarea
                value={textes.sousTitre}
                onChange={(e) => setTextes((t) => ({ ...t, sousTitre: e.target.value }))}
                maxLength={400}
                rows={2}
                placeholder="Livraison suivie. Paiement sécurisé. Retours sous 14 jours."
                className={`${champ} mt-1`}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Bandeau d'annonce (tout en haut de la vitrine)</label>
              <input
                value={textes.annonce}
                onChange={(e) => setTextes((t) => ({ ...t, annonce: e.target.value }))}
                maxLength={200}
                placeholder="Livraison offerte dès 79 € — laissez vide pour ne rien afficher"
                className={`${champ} mt-1`}
              />
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <label className="text-xs text-gray-400">Frais de port (€)</label>
                <PriceInput value={fraisPort} onCommit={setFraisPort} className={`${champ} mt-1`} />
              </div>
              <div>
                <label className="text-xs text-gray-400">Port offert dès (€)</label>
                <PriceInput value={portOffertDes} onCommit={setPortOffertDes} className={`${champ} mt-1`} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={enregistrerTextes}
                disabled={enregistrement}
                className="btn-gradient rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {sauve ? <span className="text-xs text-purple-200">Enregistré ✓</span> : null}
              <span className="text-[11px] text-gray-500">
                Un champ texte laissé vide reprend le texte d'usine.
              </span>
            </div>
          </div>
        ) : null}
      </div>

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
            <BibliothequeThemes
              themes={themes}
              filtreStructure={filtreStructure}
              onFiltre={setFiltreStructure}
              recherche={rechercheTheme}
              onRecherche={setRechercheTheme}
              themeChoisi={shop.themeId}
              essai={essai}
              onChoisir={(id) => appliquer(id)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * La bibliothèque dépliée, avec de quoi s'y retrouver à cinquante thèmes.
 *
 * À vingt et un, une grille suffisait ; à cinquante, elle fait dix-sept rangées.
 * Le filtre réutilise ce que chaque thème sait déjà de lui-même — sa structure
 * et ses secteurs — plutôt que d'inventer une taxonomie de plus.
 */
function BibliothequeThemes({
  themes,
  filtreStructure,
  onFiltre,
  recherche,
  onRecherche,
  themeChoisi,
  essai,
  onChoisir,
}: {
  themes: Theme[]
  filtreStructure: string
  onFiltre: (id: string) => void
  recherche: string
  onRecherche: (v: string) => void
  themeChoisi: string
  essai: (themeId: string) => string | null
  onChoisir: (themeId: string) => void
}) {
  const structures = [...new Map(themes.map((t) => [t.structure.id, t.structure])).values()]
  const terme = recherche.trim().toLowerCase()
  const visibles = themes.filter((t) => {
    if (filtreStructure && t.structure.id !== filtreStructure) return false
    if (!terme) return true
    return `${t.nom} ${t.secteurs.join(' ')}`.toLowerCase().includes(terme)
  })

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onFiltre('')}
          className={`rounded-full border px-2.5 py-1 text-xs transition ${
            filtreStructure === '' ? 'border-purple-400/60 bg-purple-500/20 text-white' : 'border-white/10 text-gray-400 hover:bg-white/5'
          }`}
        >
          {`Tous (${themes.length})`}
        </button>
        {structures.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onFiltre(filtreStructure === s.id ? '' : s.id)}
            title={s.pour}
            className={`rounded-full border px-2.5 py-1 text-xs transition ${
              filtreStructure === s.id ? 'border-purple-400/60 bg-purple-500/20 text-white' : 'border-white/10 text-gray-400 hover:bg-white/5'
            }`}
          >
            {`${s.nom} (${themes.filter((t) => t.structure.id === s.id).length})`}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={recherche}
          onChange={(e) => onRecherche(e.target.value)}
          placeholder="Rechercher un thème ou un secteur — bijoux, gaming, bébé…"
          className={`${champ} pl-8`}
        />
      </div>

      {visibles.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((t) => (
            <Vignette key={t.id} theme={t} choisi={t.id === themeChoisi} essai={essai(t.id)} onChoisir={() => onChoisir(t.id)} />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-gray-500">Aucun thème ne correspond — essayez un autre mot.</p>
      )}
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
        <p className="truncate text-[10px] text-gray-600">{theme.secteurs.join(' · ')}</p>
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

/**
 * Un logo de vitrine, téléversable et effaçable.
 *
 * PNG ou SVG, gardé tel quel côté serveur (pas le traitement du filigrane). La
 * vignette montre ce qui est en place sur un damier, pour qu'un logo transparent
 * se voie ; l'aperçu se rafraîchit par un compteur anti-cache, parce que
 * l'adresse peut ne pas changer si le serveur réécrit au même endroit.
 */
function LogoVitrine({
  shopId,
  emplacement,
  titre,
  aide,
  actuel,
  onSaved,
}: {
  shopId: string
  emplacement: 'entete' | 'accueil'
  titre: string
  aide: string
  actuel: string | null
  onSaved: () => void
}) {
  const entree = useRef<HTMLInputElement>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  async function choisir(fichier: File | undefined) {
    if (!fichier) return
    setErreur(null)
    setEnCours(true)
    try {
      await api.uploadVitrineLogo(shopId, emplacement, fichier)
      setVersion((v) => v + 1)
      onSaved()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Envoi impossible')
    } finally {
      setEnCours(false)
      if (entree.current) entree.current.value = ''
    }
  }

  async function effacer() {
    setErreur(null)
    setEnCours(true)
    try {
      await api.deleteVitrineLogo(shopId, emplacement)
      onSaved()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Suppression impossible')
    } finally {
      setEnCours(false)
    }
  }

  const apercu = actuel ? `${assetUrl(actuel)}${actuel.includes('?') ? '&' : '?'}v=${version}` : null

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-medium text-gray-300">{titre}</p>
      <p className="mt-0.5 text-[11px] text-gray-500">{aide}</p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => entree.current?.click()}
          disabled={enCours}
          className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-[conic-gradient(#0000_90deg,#ffffff14_0_180deg,#0000_0_270deg,#ffffff14_0)] bg-[length:14px_14px] disabled:opacity-50"
          title="Choisir un fichier"
        >
          {enCours ? (
            <Loader2 size={16} className="animate-spin text-gray-400" />
          ) : apercu ? (
            <img src={apercu} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <ImagePlus size={18} className="text-gray-500" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => entree.current?.click()}
              disabled={enCours}
              className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] hover:bg-white/5 disabled:opacity-50"
            >
              {actuel ? 'Remplacer' : 'Téléverser'}
            </button>
            {actuel ? (
              <button
                type="button"
                onClick={effacer}
                disabled={enCours}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-gray-400 hover:bg-white/5 disabled:opacity-50"
              >
                <Trash2 size={11} />
                <span>Retirer</span>
              </button>
            ) : null}
          </div>
          {erreur ? <p className="mt-1 text-[11px] text-red-300">{erreur}</p> : null}
        </div>
      </div>
      <input
        ref={entree}
        type="file"
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => choisir(e.target.files?.[0])}
      />
    </div>
  )
}
