import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleAlert, Loader2, LogIn, Puzzle, RefreshCw, ShieldCheck, Store, X } from 'lucide-react'
import { Layout } from '../../components/Layout'
import { BesoinDesktop, EntetePower, NavigateurIntegre } from '../../components/desktop/DesktopPower'
import { pont, useDesktop, type PlateformeSession } from '../../lib/desktopPower'

const CREER: Record<PlateformeSession['id'], string> = {
  VINTED: 'https://www.vinted.fr/',
  LEBONCOIN: 'https://www.leboncoin.fr/',
  FACEBOOK: 'https://www.facebook.com/marketplace/',
}

const dateFr = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * MarketPlus (DESKTOP POWER, 24/10/2026) : relier Vinted, Leboncoin et
 * Facebook Marketplace à l'application, puis, si le vendeur le veut, leur mode
 * automatique.
 *
 * Le vendeur se connecte LUI-MÊME dans le navigateur de l'application : ses
 * identifiants ne passent jamais chez nous (CLAUDE.md). La plateforme est dite
 * « connectée » seulement quand son formulaire de dépôt s'ouvre sans demander de
 * connexion — vérifié dans l'application, jamais supposé. Le mode automatique
 * suit la décision de Max du 29/09/2026 : accord explicite, risque affiché,
 * plafonds et espacement, arrêt au premier captcha, journal.
 */
export default function MarketPlus() {
  const p = pont()
  const etat = useDesktop()
  const [ouverte, setOuverte] = useState<PlateformeSession['id'] | null>(null)
  const [verif, setVerif] = useState<string | null>(null)
  const [accepte, setAccepte] = useState<Record<string, boolean>>({})

  const plateformes = etat?.plateformes ?? []
  const enCours = plateformes.find((x) => x.id === ouverte)

  // Connecté dans le navigateur : il se referme seul, la carte passe au vert.
  useEffect(() => {
    if (enCours?.session?.connecte) setOuverte(null)
  }, [enCours?.session?.connecte])

  const verifier = async (id: PlateformeSession['id']) => {
    if (!p) return
    setVerif(id)
    await p.verifierSession(id)
    setVerif(null)
  }

  return (
    <Layout>
      <EntetePower
        icone={Store}
        titre="MARKETPLUS"
        chapo="Diffusez vos annonces sur Facebook Marketplace, Leboncoin et Vinted. Reliez ici vos comptes une fois : l'application publie ensuite dans votre propre session, à la main ou en mode automatique."
      />

      <section className="case-ds mb-4 p-4 text-xs leading-relaxed text-gray-300">
        <p className="font-bold text-white">Avant de commencer</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>
            Créez vos comptes sur un navigateur normal, type Chrome : <a href={CREER.VINTED} target="_blank" rel="noreferrer" className="underline">Vinted</a>,{' '}
            <a href={CREER.LEBONCOIN} target="_blank" rel="noreferrer" className="underline">Leboncoin</a>,{' '}
            <a href={CREER.FACEBOOK} target="_blank" rel="noreferrer" className="underline">Facebook Marketplace</a>. Attendez que le compte soit créé et vérifié (e-mail, téléphone).
          </li>
          <li>Ensuite, connectez-vous ici, dans l'application : « Se connecter » ouvre la plateforme dans le navigateur intégré. Une fois connecté, il se referme et la plateforme est marquée connectée.</li>
          <li>Vous pouvez alors publier sur cette plateforme et, si vous le voulez, activer son mode automatique.</li>
        </ol>
        <p className="mt-2 text-gray-400">Vos identifiants ne passent jamais chez nous : vous les tapez sur le site de la plateforme, et la session reste sur votre ordinateur.</p>
      </section>

      {!p ? (
        <>
          <BesoinDesktop ce="MarketPlus relie Vinted, Leboncoin et Facebook Marketplace à l'application, qui publie dans votre propre session." />
          <section className="case-ds mt-4 flex items-start gap-3 p-4 text-xs text-gray-300">
            <Puzzle size={20} className="shrink-0 text-[var(--marque-orange)]" />
            <p>
              Pour publier sur Vinted, Leboncoin et Facebook Marketplace, vous pouvez utiliser l'<Link to="/extension" className="underline">extension Chrome</Link> (publication assistée : elle remplit le formulaire, vous publiez) ou DropShipper Desktop, l'application. Nous vous conseillons l'application : elle garde vos sessions, publie à votre place quand vous l'y autorisez, et s'arrête d'elle-même au premier blocage.
            </p>
          </section>
        </>
      ) : !etat ? (
        <Loader2 size={16} className="animate-spin text-gray-400" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {plateformes.map((x) => {
              const connecte = Boolean(x.session?.connecte)
              return (
                <section key={x.id} className={`case-ds flex flex-col gap-3 p-4 ${connecte ? 'border-emerald-400/40' : ''}`}>
                  <div className="flex items-center gap-2">
                    <h2 className="flex-1 text-sm font-bold">{x.nom}</h2>
                    {connecte ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300">
                        <CheckCircle2 size={14} /> Connectée
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <CircleAlert size={14} /> {x.session ? 'Connexion demandée' : 'Pas encore reliée'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">{x.session ? `Vérifié le ${dateFr(x.session.verifie)}, sur le formulaire de dépôt.` : 'Jamais vérifiée sur ce poste.'}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setOuverte(x.id)} className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold">
                      <LogIn size={14} /> {connecte ? 'Ouvrir' : 'Se connecter'}
                    </button>
                    <button type="button" onClick={() => verifier(x.id)} disabled={verif === x.id} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--trait)] px-3 py-1.5 text-xs text-gray-200 disabled:opacity-50">
                      {verif === x.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Vérifier
                    </button>
                  </div>

                  {connecte ? (
                    <div className="mt-1 border-t border-[var(--trait)] pt-3">
                      <p className="flex items-center gap-1.5 text-xs font-bold">
                        <ShieldCheck size={14} className="text-[var(--marque-rose)]" /> Mode automatique
                      </p>
                      {x.id !== 'FACEBOOK' ? (
                        <p className="mt-1 text-[11px] text-amber-200/90">
                          Sur {x.nom}, l'application ne sait pas encore choisir la catégorie : le mode automatique y prépare l'annonce, mais ne la publie pas tant que vous n'avez pas choisi la catégorie.
                        </p>
                      ) : null}
                      {x.accord ? (
                        <>
                          <p className="mt-1 text-[11px] text-emerald-300">Activé le {dateFr(x.accord)}. {x.plafond} annonces par jour au plus, {x.espacementMin} min entre deux.</p>
                          {x.arret ? (
                            <p className="mt-1 text-[11px] text-amber-200">
                              Arrêté : {x.arret.raison}.{' '}
                              <button type="button" onClick={() => p.reprendre(x.id)} className="underline">
                                J'ai réglé la vérification, reprendre
                              </button>
                            </p>
                          ) : null}
                          <button type="button" onClick={() => p.retirerAccord(x.id)} className="mt-2 text-[11px] text-gray-400 underline hover:text-white">
                            Couper le mode automatique
                          </button>
                        </>
                      ) : (
                        <>
                          <label className="mt-1 flex items-start gap-2 text-[11px] leading-relaxed text-gray-300">
                            <input type="checkbox" checked={Boolean(accepte[x.id])} onChange={(e) => setAccepte((a) => ({ ...a, [x.id]: e.target.checked }))} className="mt-0.5" />
                            <span>{etat.texteAccord}</span>
                          </label>
                          <button type="button" disabled={!accepte[x.id]} onClick={() => p.accorder(x.id)} className="mt-2 rounded-lg border border-[var(--marque-rose)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                            Activer le mode automatique
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>

          {enCours ? (
            <section className="mt-4">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="flex-1 text-sm font-bold">Connexion à {enCours.nom}</h2>
                <button type="button" onClick={() => setOuverte(null)} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                  <X size={14} /> Fermer
                </button>
              </div>
              <p className="mb-2 text-[11px] text-gray-400">
                Connectez-vous avec votre compte {enCours.nom}. Dès que le formulaire de dépôt d'annonce s'affiche, la plateforme est reliée et ce bloc se referme.
              </p>
              <NavigateurIntegre key={enCours.id} profil={enCours.id} depart={enCours.verification ?? CREER[enCours.id]} forcer hauteur={600} />
            </section>
          ) : null}

          <section className="case-ds mt-6 p-4 text-xs leading-relaxed text-gray-300">
            <p className="font-bold text-white">Publier vos produits sur ces plateformes</p>
            <p className="mt-1">
              <Link to="/dashboard" className="underline">Mes annonces</Link>, puis « Publier », puis choisissez la plateforme, maintenant active. L'annonce part dans la file de l'application, qui la dépose dans votre session : vous publiez vous-même, ou le mode automatique le fait, dans ses plafonds.
            </p>
            <p className="mt-2 text-gray-400">
              L'<Link to="/extension" className="underline">extension Chrome</Link> fait aussi la publication assistée dans votre Chrome, sans mode automatique. Les annonces en attente et le journal :{' '}
              <button type="button" onClick={() => p.panneau('publication')} className="underline">
                ouvrir le panneau de publication
              </button>
              .
            </p>
          </section>
        </>
      )}
    </Layout>
  )
}
