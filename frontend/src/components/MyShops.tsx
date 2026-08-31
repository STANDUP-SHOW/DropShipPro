import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Copy, Check, ImagePlus, ChevronDown, Store } from 'lucide-react'
import { api, apiRoot, assetUrl } from '../lib/api'

/**
 * Mes sites : un grand bloc par boutique, qui contient tout ce qui la décrit.
 *
 * Ce que ça remplace : une liste de boutiques d'un côté, et **un seul** réglage
 * de filigrane pour toutes de l'autre. Un vendeur qui tient un site high-tech,
 * un site de mode homme et un site de cuisine n'a ni le même nom, ni le même
 * logo, ni la même signature sur ses photos — et il ne pouvait en régler qu'une.
 * Le modèle portait déjà le filigrane par boutique ; l'écran ne le lisait pas.
 *
 * Chaque champ du filigrane retombe séparément sur celui du compte quand il
 * n'est pas renseigné : une boutique qui n'a réglé que sa position garde le logo
 * du compte. Tout ou rien obligerait à tout ressaisir pour changer un détail.
 *
 * « Ajouter un site » est une ligne **sous** les blocs, hors d'eux : elle déplie
 * un bloc de plus, de la même forme que les autres. Un petit formulaire à part
 * aurait fait deux façons de décrire une boutique.
 */

/** Les neuf ancrages de sharp, dans la disposition d'un pavé numérique. */
const POSITIONS: Array<{ id: string; titre: string }> = [
  { id: 'northwest', titre: 'En haut à gauche' },
  { id: 'north', titre: 'En haut' },
  { id: 'northeast', titre: 'En haut à droite' },
  { id: 'west', titre: 'À gauche' },
  { id: 'center', titre: 'Au centre' },
  { id: 'east', titre: 'À droite' },
  { id: 'southwest', titre: 'En bas à gauche' },
  { id: 'south', titre: 'En bas' },
  { id: 'southeast', titre: 'En bas à droite' },
]

type Shop = Awaited<ReturnType<typeof api.listShops>>[number]

export function MyShops() {
  const [shops, setShops] = useState<Shop[]>([])
  const [secteurs, setSecteurs] = useState<Array<{ id: string; label: string }>>([])
  const [ajout, setAjout] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = () => api.listShops().then(setShops).catch(() => setErreur('Chargement impossible'))

  useEffect(() => {
    charger()
    api
      .listCategories()
      .then((r) => setSecteurs(r.sectors ?? []))
      .catch(() => undefined)
  }, [])

  return (
    <section className="mt-6">
      {erreur ? <p className="mb-3 text-sm text-red-300">{erreur}</p> : null}

      <div className="space-y-4">
        {shops.map((shop) => (
          <BlocSite key={shop.id} shop={shop} secteurs={secteurs} onChange={charger} />
        ))}
      </div>

      {/*
        Hors des blocs, en dessous. Elle déplie un bloc de la même forme que les
        autres : le vendeur décrit sa quatrième boutique comme il a décrit la
        première.
      */}
      {ajout ? (
        <BlocSite
          neuf
          secteurs={secteurs}
          onChange={() => {
            setAjout(false)
            charger()
          }}
          onAnnuler={() => setAjout(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAjout(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 px-4 py-4 text-sm text-gray-400 transition hover:border-purple-400/50 hover:text-white"
        >
          <Plus size={16} />
          <span>Ajouter un site</span>
        </button>
      )}
    </section>
  )
}

function BlocSite({
  shop,
  neuf,
  secteurs,
  onChange,
  onAnnuler,
}: {
  shop?: Shop
  neuf?: boolean
  secteurs: Array<{ id: string; label: string }>
  onChange: () => void
  onAnnuler?: () => void
}) {
  const [nom, setNom] = useState(shop?.name ?? '')
  const [plateforme, setPlateforme] = useState(shop?.platform ?? '')
  const [rayons, setRayons] = useState<string[]>(shop?.sectors ?? [])
  const [logo, setLogo] = useState<string | null>(shop?.logo ?? null)
  const [filigraneOuvert, setFiligraneOuvert] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)
  const fichier = useRef<HTMLInputElement>(null)

  // Le filigrane : `null` veut dire « comme le compte ».
  const [actif, setActif] = useState(shop?.watermarkEnabled ?? true)
  const [texte, setTexte] = useState(shop?.watermarkText ?? '')
  const [taille, setTaille] = useState<number | null>(shop?.watermarkScale ?? null)
  const [opacite, setOpacite] = useState<number | null>(shop?.watermarkOpacity ?? null)
  const [position, setPosition] = useState<string | null>(shop?.watermarkPosition ?? null)

  const basculer = (id: string) =>
    setRayons((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]))

  async function enregistrer() {
    if (!nom.trim()) return setMessage('Donnez un nom à cette boutique.')
    setBusy(true)
    setMessage(null)
    try {
      if (neuf) {
        await api.createShop({ name: nom.trim(), platform: plateforme || undefined, sectors: rayons })
      } else {
        await api.renameShop(shop!.id, {
          name: nom.trim(),
          platform: plateforme || undefined,
          sectors: rayons,
          watermarkEnabled: actif,
          // Une chaîne vide veut dire « reprends celui du compte », et c'est
          // différent d'un texte volontairement vide : `null` le dit.
          watermarkText: texte.trim() || null,
          watermarkScale: taille,
          watermarkOpacity: opacite,
          watermarkPosition: position,
        })
      }
      onChange()
      setMessage('Enregistré ✓')
      setTimeout(() => setMessage(null), 1800)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Enregistrement impossible')
    } finally {
      setBusy(false)
    }
  }

  async function deposerLogo(f: File) {
    if (!shop) return
    setBusy(true)
    try {
      const { logo: chemin } = await api.uploadShopLogo(shop.id, f)
      setLogo(chemin)
      onChange()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Envoi impossible')
    } finally {
      setBusy(false)
    }
  }

  const flux = shop ? `${apiRoot}/api/public/shops/${shop.shopKey}/products` : null

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      {/* ---------- L'identité ---------- */}
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => (shop ? fichier.current?.click() : undefined)}
          title={shop ? 'Changer le logo' : "Enregistrez d'abord la boutique"}
          className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/30 ${
            shop ? 'hover:border-purple-400/50' : 'opacity-50'
          }`}
        >
          {logo ? (
            <img src={assetUrl(logo)} alt="" className="h-full w-full object-contain" />
          ) : (
            <ImagePlus size={20} className="text-gray-500" />
          )}
        </button>
        <input
          ref={fichier}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) deposerLogo(f)
            e.target.value = ''
          }}
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label className="text-xs text-gray-400">Nom commercial de la boutique</label>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="OGGUS High-Tech"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400">Plateforme du site</label>
            <input
              value={plateforme}
              onChange={(e) => setPlateforme(e.target.value)}
              placeholder="WordPress, PrestaShop, Shopify…"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
            />
          </div>
        </div>
      </div>

      {/* ---------- Les rayons vendus ---------- */}
      <div className="mt-4">
        <label className="text-xs text-gray-400">Rayons vendus dans cette boutique</label>
        <p className="mt-0.5 text-[11px] text-gray-500">
          Ils décident des catégories proposées à l'import. Aucun coché veut dire « tous » : qui n'a
          rien déclaré doit tout voir, jamais rien.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {secteurs.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => basculer(s.id)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                rayons.includes(s.id)
                  ? 'border-purple-400/60 bg-purple-500/20 text-white'
                  : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/25'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Le flux ---------- */}
      {flux ? (
        <div className="mt-4">
          <label className="text-xs text-gray-400">Flux pour la publication automatique</label>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-[11px] text-gray-300">
              {flux}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(flux)
                setCopie(true)
                setTimeout(() => setCopie(false), 1500)
              }}
              className="rounded-lg border border-white/10 px-2.5 py-2 text-gray-400 hover:bg-white/5 hover:text-white"
            >
              {copie ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            {`${shop!.products} annonce(s) rangée(s) dans cette boutique.`}
          </p>
        </div>
      ) : null}

      {/* ---------- Le filigrane de cette boutique ---------- */}
      {shop ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20">
          <button
            type="button"
            onClick={() => setFiligraneOuvert((o) => !o)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left"
          >
            <ChevronDown
              size={15}
              className={`shrink-0 text-gray-400 transition ${filigraneOuvert ? '' : '-rotate-90'}`}
            />
            <span className="text-sm font-medium">Filigrane des photos</span>
            <span className="ml-auto text-[11px] text-gray-500">
              {actif ? (texte || 'signé comme le compte') : 'désactivé'}
            </span>
          </button>

          {filigraneOuvert ? (
            <div className="space-y-4 border-t border-white/10 p-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={actif}
                  onChange={(e) => setActif(e.target.checked)}
                  className="accent-purple-500"
                />
                <span>Signer les photos de cette boutique</span>
              </label>

              <div>
                <label className="text-xs text-gray-400">
                  Texte du filigrane — vide pour reprendre celui du compte
                </label>
                <input
                  value={texte}
                  onChange={(e) => setTexte(e.target.value)}
                  placeholder={shop.name}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400">Position</label>
                <div className="mt-1 grid w-fit grid-cols-3 gap-1">
                  {POSITIONS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      title={p.titre}
                      onClick={() => setPosition(p.id)}
                      className={`h-7 w-9 rounded border text-[10px] transition ${
                        position === p.id
                          ? 'border-purple-400 bg-purple-500/30'
                          : 'border-white/10 bg-white/5 hover:border-white/25'
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  {POSITIONS.find((p) => p.id === position)?.titre ?? 'Comme le compte'}
                </p>
              </div>

              <Curseur
                label="Taille"
                valeur={taille}
                min={5}
                max={60}
                unite="%"
                onChange={setTaille}
              />
              <Curseur
                label="Intensité"
                valeur={opacite}
                min={5}
                max={100}
                unite="%"
                onChange={setOpacite}
              />

              <p className="text-[11px] leading-relaxed text-gray-500">
                La marque se pose <b>à l'export</b>, jamais sur l'original : changer de logo ne
                demande aucun réimport, et l'agent photo travaille sur une image propre.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ---------- Les actions ---------- */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={enregistrer}
          disabled={busy}
          className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {neuf ? 'Créer la boutique' : 'Enregistrer'}
        </button>

        {onAnnuler ? (
          <button
            type="button"
            onClick={onAnnuler}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-400 hover:bg-white/5"
          >
            Annuler
          </button>
        ) : null}

        {message ? <span className="text-xs text-purple-200">{message}</span> : null}

        {shop ? (
          <button
            type="button"
            onClick={async () => {
              /*
               * La suppression laisse les annonces en place : elles perdent leur
               * boutique et cessent d'être servies par un flux, ce qui se
               * rattrape. Les supprimer avec elle, non.
               */
              if (!window.confirm(`Supprimer « ${shop.name} » ? Ses annonces sont conservées.`)) return
              await api.deleteShop(shop.id)
              onChange()
            }}
            className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-300"
          >
            <Trash2 size={13} />
            <span>Supprimer ce site</span>
          </button>
        ) : (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-500">
            <Store size={12} />
            <span>Le logo et le filigrane se règlent une fois la boutique créée.</span>
          </span>
        )}
      </div>
    </div>
  )
}

/** Un curseur dont la valeur peut être « comme le compte ». */
function Curseur({
  label,
  valeur,
  min,
  max,
  unite,
  onChange,
}: {
  label: string
  valeur: number | null
  min: number
  max: number
  unite: string
  onChange: (v: number | null) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs text-gray-400">{label}</label>
        <span className="text-[11px] text-gray-500">
          {valeur === null ? 'comme le compte' : `${valeur}${unite}`}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          value={valeur ?? Math.round((min + max) / 2)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-purple-500"
        />
        {valeur !== null ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-gray-500 hover:text-white"
          >
            réinitialiser
          </button>
        ) : null}
      </div>
    </div>
  )
}
