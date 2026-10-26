import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Download, Loader2, Monitor, RotateCw, ShieldAlert } from 'lucide-react'
import { LIEN_DESKTOP } from '../../pages/ApplicationDesktop'
import { pont, type EtatNavigateur } from '../../lib/desktopPower'

/**
 * Les pièces communes des pages DESKTOP POWER : l'en-tête de page, le bloc
 * « ouvrez l'application » hors de l'application, et le navigateur intégré.
 * Charte de l'espace connecté : Montserrat (hérité), cartes `case-ds`, rose
 * #E85290 et orange de la marque.
 */

export function EntetePower({ icone: Icone, titre, chapo }: { icone: ElementType; titre: string; chapo: string }) {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <Icone size={22} className="text-[var(--marque-rose)]" />
        <h1 className="text-xl font-extrabold tracking-wide">{titre}</h1>
        <span className="rounded-full border border-[var(--marque-rose)]/40 px-2 py-0.5 text-[10px] font-bold tracking-widest text-[var(--marque-rose)]">DESKTOP POWER</span>
      </div>
      <p className="mb-5 mt-1 max-w-3xl text-xs leading-relaxed text-gray-400">{chapo}</p>
    </>
  )
}

/** Hors de l'application : ce que la page fera, et l'installeur. Rien n'est simulé. */
export function BesoinDesktop({ ce }: { ce: string }) {
  return (
    <section className="case-ds flex flex-col gap-3 p-5 md:flex-row md:items-center">
      <Monitor size={28} className="shrink-0 text-[var(--marque-orange)]" />
      <div className="flex-1">
        <h2 className="text-sm font-bold">Cette page s'utilise dans l'application DropShipper Desktop</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          {ce} Installez l'application pour Windows, connectez-vous : le site s'y ouvre en pleine page, avec cette section active.
        </p>
      </div>
      <a href={LIEN_DESKTOP} className="btn-gradient inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold">
        <Download size={16} /> Télécharger l'application
      </a>
    </section>
  )
}

/** La part visible de l'emplacement, en pixels de la page : l'application y pose sa vue. */
function zoneVisible(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const x = Math.max(0, r.left)
  const y = Math.max(0, r.top)
  const droite = Math.min(window.innerWidth, r.right)
  const bas = Math.min(window.innerHeight, r.bottom)
  return { x, y, width: Math.max(0, droite - x), height: Math.max(0, bas - y) }
}

/**
 * Le navigateur intégré (WebShipper) : une vraie vue de navigateur de
 * l'application, posée par-dessus l'emplacement réservé dans la page. Elle suit
 * l'emplacement quand la page défile ou change de taille, et se retire quand la
 * page se ferme. Un menu de la page ne passe pas par-dessus elle : c'est une
 * fenêtre à part, pas un élément de la page.
 */
export function NavigateurIntegre({
  profil,
  depart,
  forcer = false,
  hauteur = 620,
  actions,
  surEtat,
}: {
  profil: string
  /** L'adresse ouverte au premier affichage ; changer de clé React pour en ouvrir une autre. */
  depart?: string
  /** Ouvrir `depart` même si la vue avait déjà une page (sinon elle la retrouve). */
  forcer?: boolean
  hauteur?: number
  /** Les boutons propres à la page (Importer, Analyser…), à droite de la barre d'adresse. */
  actions?: ReactNode
  surEtat?: (e: EtatNavigateur) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [etat, setEtat] = useState<EtatNavigateur | null>(null)
  const [saisie, setSaisie] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const p = pont()

  useEffect(() => {
    if (!p || !ref.current) return
    const el = ref.current
    let image = 0
    const placer = () => {
      cancelAnimationFrame(image)
      image = requestAnimationFrame(() => p.navigateur.placer(zoneVisible(el)))
    }
    const off = p.surNavigateur((e) => {
      if (e.profil !== profil) return
      setEtat(e)
      if (e.url) setSaisie(e.url)
      surEtat?.(e)
    })
    p.navigateur.ouvrir({ profil, url: depart, forcer, zone: zoneVisible(el) }).then((r) => {
      if (!r.ok) setErreur(r.erreur || 'Navigateur indisponible.')
      if (r.etat) {
        setEtat(r.etat)
        if (r.etat.url) setSaisie(r.etat.url)
        surEtat?.(r.etat)
      }
    })
    const obs = new ResizeObserver(placer)
    obs.observe(el)
    window.addEventListener('scroll', placer, true)
    window.addEventListener('resize', placer)
    return () => {
      off()
      obs.disconnect()
      cancelAnimationFrame(image)
      window.removeEventListener('scroll', placer, true)
      window.removeEventListener('resize', placer)
      p.navigateur.masquer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil, depart])

  if (!p) return null

  const aller = async () => {
    setErreur(null)
    const r = await p.navigateur.aller(saisie)
    if (!r.ok) setErreur(r.erreur || 'Adresse refusée.')
  }

  const bouton = 'rounded-lg border border-[var(--trait)] p-1.5 text-gray-300 transition hover:border-[var(--marque-rose)] hover:text-white disabled:opacity-40'

  return (
    <div className="case-ds overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--trait)] p-2">
        <button type="button" className={bouton} disabled={!etat?.peutRetour} onClick={() => p.navigateur.retour()} aria-label="Page précédente">
          <ArrowLeft size={15} />
        </button>
        <button type="button" className={bouton} disabled={!etat?.peutAvancer} onClick={() => p.navigateur.avancer()} aria-label="Page suivante">
          <ArrowRight size={15} />
        </button>
        <button type="button" className={bouton} onClick={() => p.navigateur.recharger()} aria-label="Recharger">
          {etat?.chargement ? <Loader2 size={15} className="animate-spin" /> : <RotateCw size={15} />}
        </button>
        <form
          className="min-w-[200px] flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            aller()
          }}
        >
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Adresse ou recherche"
            className="w-full rounded-lg border border-[var(--trait)] bg-[var(--nuit)] px-3 py-1.5 text-xs text-white outline-none focus:border-[var(--marque-rose)]"
          />
        </form>
        {actions}
      </div>
      {etat?.bloque ? (
        <p className="flex items-start gap-2 border-b border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          Le site demande une vérification (« {etat.bloque} ») : réglez-la vous-même dans le bloc ci-dessous. L'application ne contourne jamais une vérification.
        </p>
      ) : null}
      {erreur ? <p className="border-b border-[var(--trait)] px-3 py-2 text-[11px] text-red-300">{erreur}</p> : null}
      <div ref={ref} style={{ height: hauteur }} className="flex items-center justify-center bg-[var(--nuit)] text-xs text-gray-500">
        Chargement du navigateur…
      </div>
    </div>
  )
}
