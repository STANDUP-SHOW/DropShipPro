import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LifeBuoy,
  PackageX,
  Clock,
  ShoppingCart,
  MessageSquare,
  ArrowRight,
  Check,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { SupportChat } from '../components/SupportChat'
import { api, assetUrl } from '../lib/api'
import { useDemo } from '../lib/demo'
import { BandeauDemo } from '../components/ModeDemo'
import { DEMO_SAV } from '../lib/demoJeux'

/**
 * Le service après-vente : ce qui va mal, et ce qui va mal bientôt.
 *
 * Pas une liste de commandes de plus. « Commandes » montre tout, par date ;
 * celle-ci ne montre que ce qui demande une réponse — et surtout, elle montre
 * **avant que le client écrive**.
 *
 * Un colis parti sans numéro de suivi n'est pas encore un litige. Il le devient
 * au troisième message resté sans réponse, et il aurait suffi de s'en
 * apercevoir. C'est là toute la différence entre un écran de SAV et une boîte de
 * réception : l'un anticipe, l'autre encaisse.
 *
 * L'ordre des trois blocs est celui du coût, pas de la chronologie.
 */

type Data = Awaited<ReturnType<typeof api.savOverview>>

export default function AfterSales() {
  const [data, setData] = useState<Data | null>(null)
  const [demo] = useDemo()
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    api
      .savOverview()
      .then(setData)
      .catch(() => setErreur('Impossible de charger le service après-vente.'))
  }, [])

  // Le mode demo sert le jeu d'exemple ; les vraies donnees reviennent en le coupant.
  const affiche = demo ? (DEMO_SAV as unknown as Data) : data
  const rien =
    affiche &&
    !affiche.sansSuivi.length &&
    !affiche.tropLong.length &&
    !affiche.jamaisCommande.length &&
    !affiche.conversations.length

  return (
    <Layout>
      <BlocSection id="sav-clients" />
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <LifeBuoy size={22} className="text-amber-300" />
          <span>SAV</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          Ce qui demande une réponse, et ce qui en demandera une bientôt. Un colis sans suivi n'est
          pas encore un litige — il le devient au troisième message resté sans réponse.
        </p>
      </div>

      {/*
        Marc en haut, parce que c'est ici qu'on a besoin de lui : devant une
        commande qui dérape, pas dans une page d'agents.
      */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <SupportChat agentKey="sav" />
      </div>

      {erreur ? <p className="mt-4 text-sm text-red-300">{erreur}</p> : null}
      {!affiche && !erreur ? <p className="mt-6 text-sm text-gray-500">Chargement…</p> : null}

      {rien ? (
        <div className="mt-6 rounded-xl border border-emerald-400/25 bg-emerald-400/5 px-4 py-8 text-center">
          <Check size={22} className="mx-auto text-emerald-300" />
          <p className="mt-2 font-semibold">Rien à traiter</p>
          <p className="mt-1 text-sm text-gray-400">
            Aucun colis sans suivi, aucune commande oubliée, aucune conversation ouverte.
          </p>
        </div>
      ) : null}

      {affiche ? (
        <div className="mt-6 space-y-6">
          <Bloc
            titre="Expédiées sans numéro de suivi"
            explication="C'est le premier motif de litige sur toutes les places de marché : sans numéro, vous ne pouvez pas répondre « où est mon colis ». Renseignez-le depuis Livraisons."
            icone={PackageX}
            couleur="border-red-400/30 bg-red-400/5"
            lignes={affiche.sansSuivi}
          />

          <Bloc
            titre="En route depuis trop longtemps"
            explication="Au-delà de trois semaines, la fenêtre de réclamation approche. Prendre les devants coûte un message ; l'attendre coûte le litige."
            icone={Clock}
            couleur="border-amber-400/30 bg-amber-400/5"
            lignes={affiche.tropLong}
          />

          <Bloc
            titre="Vendues et jamais commandées"
            explication="La vente est encaissée et rien n'est parti chez le fournisseur. Personne ne s'en aperçoit avant la réclamation de l'acheteur."
            icone={ShoppingCart}
            couleur="border-purple-400/30 bg-purple-400/5"
            lignes={affiche.jamaisCommande}
            action={{ to: '/fournisseurs', label: 'Commander' }}
          />

          {affiche.conversations.length ? (
            <section className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="flex items-center gap-2 font-bold">
                <MessageSquare size={16} className="text-purple-300" />
                <span>Conversations ouvertes</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal text-gray-400">
                  {affiche.conversations.length}
                </span>
              </h2>
              <p className="mt-1 text-xs text-gray-500">Ce que vos clients ont déjà écrit.</p>

              <ul className="mt-4 divide-y divide-white/5">
                {affiche.conversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/messages?conversation=${c.id}`}
                      className="flex items-center gap-3 py-2.5 transition hover:opacity-80"
                    >
                      {/* Non lu : une pastille, pas une couleur de fond — la
                          liste doit rester lisible quand tout est non lu. */}
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          c.unread ? 'bg-purple-400' : 'bg-transparent'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.customerName}</p>
                        <p className="truncate text-xs text-gray-500">
                          {c.subject || `Conversation ${c.platform}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-gray-500">
                        {new Date(c.lastMessageAt).toLocaleDateString('fr-FR')}
                      </span>
                      <ArrowRight size={14} className="shrink-0 text-gray-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      <BandeauDemo />
    </Layout>
  )
}

function Bloc({
  titre,
  explication,
  icone: Icone,
  couleur,
  lignes,
  action,
}: {
  titre: string
  explication: string
  icone: React.ElementType
  couleur: string
  lignes: Data['sansSuivi']
  action?: { to: string; label: string }
}) {
  // Un bloc vide n'est pas une bonne nouvelle qu'il faut annoncer trois fois :
  // le message « rien à traiter » est en haut, une fois, et il suffit.
  if (!lignes.length) return null

  return (
    <section className={`rounded-xl border p-5 ${couleur}`}>
      <h2 className="flex items-center gap-2 font-bold">
        <Icone size={16} />
        <span>{titre}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal text-gray-300">
          {lignes.length}
        </span>
      </h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-400">{explication}</p>

      <ul className="mt-4 space-y-2">
        {lignes.map((l) => (
          <li
            key={l.id}
            className="flex flex-wrap items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5"
          >
            {l.produit.image ? (
              <img
                src={assetUrl(l.produit.image)}
                alt=""
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded bg-white/5" />
            )}

            <div className="min-w-0 flex-1">
              <Link to={`/orders/${l.id}`} className="text-sm font-medium hover:underline">
                {l.produit.titre}
              </Link>
              <p className="mt-0.5 text-xs text-gray-400">
                {`${l.buyerName} · ${l.platform} · ${l.amount.toFixed(2)} ${l.currency}`}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-500">{l.raison}</p>
            </div>

            <Link
              to={action?.to ?? `/orders/${l.id}`}
              className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5"
            >
              {action?.label ?? 'Ouvrir'}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
