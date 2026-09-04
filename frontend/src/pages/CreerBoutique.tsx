import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Store, ArrowRight } from 'lucide-react'
import { Layout } from '../components/Layout'
import { VitrineBlock } from '../components/VitrineBlock'
import { api } from '../lib/api'

type Boutique = Awaited<ReturnType<typeof api.listShops>>[number]

/**
 * Créez votre boutique en ligne — la création de boutique sortie de
 * « Mes sites » (06/09/2026) : Max la veut à part parce qu'elle sera
 * facturée en crédits, comme un produit à elle seule.
 *
 * Le parcours : nommer la boutique, la créer hébergée chez nous, puis le
 * module vitrine — description au modèle, thème choisi ou proposé, adresse
 * publique — le tout sur la même page. « Mes sites » reste l'endroit où l'on
 * gère les boutiques existantes ; ici on en fait naître une.
 */
export default function CreerBoutique() {
  const [boutiques, setBoutiques] = useState<Boutique[]>([])
  const [choisie, setChoisie] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function charger() {
    api
      .listShops()
      .then(setBoutiques)
      .catch(() => setErreur('Vos boutiques n\'ont pas pu être chargées.'))
  }

  useEffect(charger, [])

  /* Les boutiques hébergées ici : les seules dont la vitrine se compose. */
  const hebergees = boutiques.filter((b) => (b as { platform?: string | null }).platform === 'dropshipper')
  const active = hebergees.find((b) => b.id === choisie) ?? null

  async function creer() {
    if (!nom.trim()) return setErreur('Donnez un nom à votre boutique.')
    setBusy(true)
    setErreur(null)
    try {
      const creee = await api.createShop({ name: nom.trim(), platform: 'dropshipper' })
      setNom('')
      setChoisie(creee.id)
      charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Création impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 text-sm font-black text-white shadow-[0_0_14px_rgba(52,211,153,0.5)]">
          IA
        </span>
        <span className="bg-gradient-to-r from-emerald-400 via-green-200 to-white bg-clip-text text-transparent">
          Créez votre boutique en ligne
        </span>
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-400">
        Une vraie boutique à votre enseigne, hébergée ici et remplie par votre catalogue : vous la
        nommez, l'IA compose sa vitrine — thème, couleurs, textes — et elle est en ligne à sa propre
        adresse. Vos annonces s'y rangent par boutique, comme sur Mes sites.
      </p>

      {/* ---------- Étape 1 : nommer et créer ---------- */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
        <h2 className="flex items-center gap-2 font-bold">
          <Store size={16} className="text-emerald-300" />
          <span>1. Nommez votre boutique</span>
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && creer()}
            placeholder="Ex. Maison Lumea, TechNomade…"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400/70"
          />
          <button
            type="button"
            onClick={creer}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_14px_rgba(52,211,153,0.35)] transition hover:brightness-110 disabled:opacity-40"
          >
            <Sparkles size={15} />
            <span>{busy ? 'Création…' : 'Créer ma boutique'}</span>
          </button>
        </div>
        {erreur ? <p className="mt-2 text-xs text-red-400">{erreur}</p> : null}

        {hebergees.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-gray-500">Ou reprenez la vitrine d'une boutique existante :</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {hebergees.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setChoisie(b.id)}
                  className={
                    active?.id === b.id
                      ? 'rounded-full bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold text-emerald-200'
                      : 'rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5'
                  }
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---------- Étape 2 : la vitrine, composée par l'IA ---------- */}
      {active ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 font-bold">
            <Sparkles size={16} className="text-emerald-300" />
            <span>{`2. Composez la vitrine de ${active.name}`}</span>
          </h2>
          <div className="mt-3">
            <VitrineBlock shop={active as never} onSaved={charger} />
          </div>
        </section>
      ) : (
        <p className="mt-6 text-xs text-gray-500">
          Créez ou choisissez une boutique : le composeur de vitrine — description, thèmes, adresse
          publique — s'ouvre juste ici.
        </p>
      )}

      <p className="mt-8 text-xs text-gray-500">
        La gestion quotidienne — rayons, logo, filigrane — vit dans{' '}
        <Link to="/mes-sites" className="inline-flex items-center gap-1 text-purple-300 underline">
          <span>Mes sites</span>
          <ArrowRight size={11} />
        </Link>
        .
      </p>
    </Layout>
  )
}
