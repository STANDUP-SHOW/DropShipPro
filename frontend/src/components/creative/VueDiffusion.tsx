import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { api } from '../../lib/api'
import { BandeReseaux } from '../BandeReseaux'
import { SocialConnect } from '../SocialConnect'
import { ListePubs } from '../ListePubs'
import { AgentBar } from '../AgentBar'
import { BarreCompacte, Entete, Fenetre } from './Creative'

type Etat = Awaited<ReturnType<typeof api.socialState>>

/*
 * Les quatre destinations du schéma : deux pages sociales, deux régies. La
 * distinction compte social / compte publicitaire est celle de SocialConnect,
 * où tout le reste se branche.
 */
const DESTINATIONS = [
  { id: 'instagram', label: 'Instagram', usage: 'Page sociale', pos: { left: '50%', top: '6%' } },
  { id: 'tiktok', label: 'TikTok', usage: 'Page sociale', pos: { left: '88%', top: '50%' } },
  { id: 'meta-ads', label: 'Meta Ads', usage: 'Régie publicitaire', pos: { left: '50%', top: '94%' } },
  { id: 'pinterest-ads', label: 'Pinterest Ads', usage: 'Régie publicitaire', pos: { left: '12%', top: '50%' } },
] as const

type Statut = { libelle: string; couleur: string; detail: string }

/** Le vrai statut d'une destination, lu dans l'état des raccordements. */
function statutDe(etat: Etat | null, id: string): Statut {
  if (!etat) return { libelle: 'Lecture…', couleur: 'var(--c-texte-2)', detail: '' }
  const comptes = (etat.comptes ?? []).filter((c) => c.platform === id && c.connected)
  if (comptes.length) {
    return {
      libelle: 'Relié',
      couleur: 'var(--c-lime)',
      detail: `Compte associé : ${comptes.map((c) => c.label || c.externalId).join(', ')}.`,
    }
  }
  if ((etat.enAttente ?? []).includes(id) || (etat.reseauxEnAttente ?? []).includes(id) || (etat.regiesEnAttente ?? []).includes(id)) {
    return {
      libelle: 'En attente des clés',
      couleur: 'var(--c-rose)',
      detail:
        "Le connecteur est écrit, mais DropShipper n'est pas encore déclaré auprès de cette plateforme. Il s'ouvrira dès que ce sera fait ; rien n'est simulé d'ici là.",
    }
  }
  if ([...(etat.reseaux ?? []), ...(etat.regies ?? [])].includes(id)) {
    return {
      libelle: 'À relier',
      couleur: 'var(--c-texte-2)',
      detail: 'Disponible : reliez-le plus bas, dans toutes vos connexions.',
    }
  }
  return { libelle: 'Non proposé', couleur: 'var(--c-texte-2)', detail: "Cette destination n'est pas proposée pour l'instant." }
}

/**
 * Réseaux & régies (vue 02 de l'audit du 15/10/2026).
 *
 * Les destinations et les créations d'abord, les explications ensuite. Les
 * statuts sont les vrais : un connecteur dont les clés manquent le dit, et
 * aucun schéma ne fait croire à une connexion réussie.
 */
export function VueDiffusion() {
  const [etat, setEtat] = useState<Etat | null>(null)
  const [details, setDetails] = useState<(typeof DESTINATIONS)[number] | null>(null)

  useEffect(() => {
    api.socialState().then(setEtat).catch(() => setEtat(null))
  }, [])

  const relies = (etat?.comptes ?? []).filter((c) => c.connected)
  const pages = relies.filter((c) => !c.isAdAccount).length
  const regies = relies.filter((c) => c.isAdAccount).length

  const descendre = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <>
      <div className="mt-3">
        <BarreCompacte>
          <span>
            <b>{etat ? pages : '…'}</b>
            {pages > 1 ? ' pages sociales reliées' : ' page sociale reliée'}
          </span>
          <span>
            <b>{etat ? regies : '…'}</b>
            {regies > 1 ? ' régies reliées' : ' régie reliée'}
          </span>
          <span>Vous vous connectez chez Meta, TikTok ou Google — jamais chez nous.</span>
        </BarreCompacte>
      </div>

      <Entete
        surtitre="02 / La diffusion"
        ligne1="La bonne création."
        ligne2="Au bon endroit."
        chapo="Vos pages sociales et vos régies, clairement séparées. Préparez les formats avant la diffusion."
      />

      <div className="mt-8 grid gap-4 lg:grid-cols-12">
        <section className="c-panneau p-6 lg:col-span-7">
          <p className="c-etiquette">Du studio aux écrans</p>
          <div className="mt-4 grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
            <div className="c-orbite">
              <div className="c-orbite-anneau" />
              <div className="c-orbite-centre">
                <span>Studio</span>
                <span className="text-lg">✳</span>
              </div>
              {DESTINATIONS.map((d) => {
                const s = statutDe(etat, d.id)
                return (
                  <div key={d.id} className="c-noeud" style={d.pos}>
                    <span className="rounded-full border border-[var(--c-trait)] bg-[var(--c-panneau-2)] px-3 py-1 font-bold">
                      {d.label}
                    </span>
                    <span style={{ color: s.couleur }}>{s.libelle}</span>
                  </div>
                )
              })}
            </div>
            <ol className="space-y-3">
              {['Choisir', 'Adapter', 'Vérifier', 'Diffuser'].map((e, i) => (
                <li key={e} className="flex items-baseline gap-3">
                  <span className="c-numero !text-lg">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-bold">{e}</span>
                </li>
              ))}
              <li className="pt-2">
                <button type="button" className="c-bouton" onClick={() => descendre('sortie')}>
                  <span>Voir les déclinaisons</span>
                  <ArrowUpRight size={15} />
                </button>
              </li>
            </ol>
          </div>
        </section>

        <section className="c-panneau p-6 lg:col-span-5">
          <p className="c-etiquette">Vos connexions</p>
          <p className="c-h2 mt-2">Deux usages. Deux connexions.</p>
          <ul className="mt-5 divide-y divide-[var(--c-trait)]">
            {DESTINATIONS.map((d) => {
              const s = statutDe(etat, d.id)
              return (
                <li key={d.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{d.label}</span>
                    <span className="block text-xs text-[var(--c-texte-2)]">
                      {d.usage}
                      {' · '}
                      <span style={{ color: s.couleur }}>{s.libelle}</span>
                    </span>
                  </span>
                  <button type="button" className="c-bouton-sec !py-1.5 !text-xs" onClick={() => setDetails(d)}>
                    Détails
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" className="c-bouton-sec mt-4" onClick={() => descendre('connexions')}>
            Toutes les connexions
          </button>
        </section>
      </div>

      <div className="mt-8">
        <BandeReseaux />
      </div>

      <section id="sortie" className="mt-12 scroll-mt-6">
        <h2 className="c-h2">Votre prochaine sortie.</h2>
        <p className="mt-2 text-sm text-[var(--c-texte-2)]">
          Un aperçu par format, une validation avant diffusion. Vos publicités sont déjà payées : les revoir, les
          télécharger et les diffuser ne coûte rien.
        </p>
        <div className="mt-4">
          <ListePubs ouRelier="cette page" />
        </div>
        <p className="mt-4 text-xs text-[var(--c-texte-2)]">
          Le budget média et le coût de création sont distincts : nous déposons la créative, le ciblage et les enchères
          se règlent chez la régie, là où vous voyez ce que vous dépensez.
        </p>
      </section>

      <section id="connexions" className="mt-12 scroll-mt-6">
        <SocialConnect />
      </section>

      <section className="mt-12 grid gap-4 lg:grid-cols-2">
        <div className="c-panneau p-6">
          <p className="c-etiquette">Suivi de vos campagnes</p>
          <p className="mt-3 text-sm leading-relaxed text-[var(--c-texte-2)]">
            Cette place attend les chiffres de vos régies reliées : dépense, impressions, clics, coût par acquisition.
            Elle reste vide tant qu'aucune n'en remonte, car c'est sur ces chiffres qu'on coupe ou qu'on double une
            campagne.
          </p>
        </div>
        <div className="c-panneau p-6">
          <AgentBar
            agentKey="marketing"
            nom="Laurence"
            emoji="📣"
            exemple="Demandez a Laurence : sur quel reseau lancer ce produit en premier ?"
          />
          <p className="mt-3 text-xs text-[var(--c-texte-2)]">
            Recopiez-lui la dépense et les ventes d'une campagne : elle vous dit si elle gagne de l'argent et à quel coût
            par acquisition l'arrêter.
          </p>
        </div>
      </section>

      {details ? (
        <Fenetre titre={details.label} onClose={() => setDetails(null)}>
          <p className="mt-1 text-sm text-[var(--c-texte-2)]">{details.usage}</p>
          {(() => {
            const s = statutDe(etat, details.id)
            return (
              <>
                <p className="mt-4 font-bold" style={{ color: s.couleur }}>
                  {s.libelle}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--c-texte-2)]">{s.detail}</p>
              </>
            )
          })()}
          <p className="mt-4 text-sm leading-relaxed text-[var(--c-texte-2)]">
            {details.usage === 'Page sociale'
              ? 'Une page sociale publie des posts. L’autorisation se donne sur l’écran de la plateforme ; aucun mot de passe ne passe par DropShipper.'
              : 'Une régie achète de la publicité : nous y déposons la créative, le budget reste réglé chez elle. L’autorisation se donne sur l’écran de la plateforme ; aucun mot de passe ne passe par DropShipper.'}
          </p>
          <button
            type="button"
            className="c-bouton mt-5"
            onClick={() => {
              setDetails(null)
              descendre('connexions')
            }}
          >
            <span>Gérer mes connexions</span>
            <ArrowUpRight size={15} />
          </button>
        </Fenetre>
      ) : null}
    </>
  )
}
