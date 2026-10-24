import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Loader2, Megaphone, Sparkles } from 'lucide-react'
import { Layout } from '../../components/Layout'
import { BesoinDesktop, EntetePower, NavigateurIntegre } from '../../components/desktop/DesktopPower'
import { MesAnalysesAds } from '../../components/desktop/MesAnalysesAds'
import { dpApi, pont, type EtatNavigateur } from '../../lib/desktopPower'

/** Les pages d'accueil des deux bibliothèques ; rendues aussi par le serveur (services/adsAnalyser.ts). */
const BIBLIOTHEQUES = {
  facebook: { nom: 'Facebook Ad Library', accueil: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=FR&media_type=all' },
  tiktok: { nom: 'TikTok Ads Library', accueil: 'https://library.tiktok.com/ads?region=FR' },
} as const

type Plateforme = keyof typeof BIBLIOTHEQUES

/**
 * AdsAnalyser (DESKTOP POWER, 24/10/2026) : la bibliothèque publicitaire de
 * Facebook ou de TikTok dans le navigateur de l'application, l'agent au-dessus.
 * Le vendeur cherche lui-même ; arrivé sur le bon produit, il lance l'analyse
 * au tarif affiché (lu sur le serveur, DROPS.adsAnalyse) : la page qu'il voit
 * est lue et le rapport marketing s'affiche ici et dans Analyses réseaux.
 */
export default function AdsAnalyser() {
  const p = pont()
  const [plateforme, setPlateforme] = useState<Plateforme | null>(null)
  const [tarif, setTarif] = useState<number | null>(null)
  const [produit, setProduit] = useState('')
  const [etat, setEtat] = useState<EtatNavigateur | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recharger, setRecharger] = useState(0)
  const [nouvelle, setNouvelle] = useState<string | null>(null)

  useEffect(() => {
    dpApi
      .analysesAds()
      .then((r) => setTarif(r.tarif))
      .catch(() => undefined)
  }, [])

  const analyser = async () => {
    if (!p || !plateforme) return
    setErreur(null)
    setEnCours(true)
    try {
      const lu = await p.navigateur.lire()
      if (!lu.ok || !lu.page) throw new Error(lu.erreur || 'Page illisible.')
      const r = await dpApi.analyserAds({ plateforme, produit: produit.trim() || undefined, page: lu.page })
      setNouvelle(r.analyse.id)
      setRecharger((n) => n + 1)
    } catch (e) {
      setErreur((e as Error).message)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Layout>
      <EntetePower
        icone={Megaphone}
        titre="ADSANALYSER"
        chapo="Les bibliothèques publicitaires de Facebook et de TikTok, ouvertes dans l'application, avec l'agent marketing au-dessus. Cherchez vous-même le produit ; une fois la page dessus, lancez l'analyse : un rapport marketing complet, avec ce que la page montre des moyens investis, de la portée, de la boutique et des ventes."
      />

      {!p ? (
        <BesoinDesktop ce="AdsAnalyser ouvre Facebook Ad Library et TikTok Ads Library dans l'application, puis l'IA analyse la page que vous regardez." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {(Object.keys(BIBLIOTHEQUES) as Plateforme[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setPlateforme(id)}
                className={`rounded-lg border px-4 py-2 text-sm font-bold transition ${plateforme === id ? 'border-[var(--marque-rose)] bg-[var(--marque-rose)]/15 text-white' : 'border-[var(--trait)] text-gray-300 hover:text-white'}`}
              >
                {id === 'facebook' ? 'Facebook Ads Library' : 'TikTok Ads Library'}
              </button>
            ))}
          </div>

          {plateforme ? (
            <>
              <section className="case-ds mb-3 flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <Bot size={26} className="shrink-0 text-[var(--marque-rose)]" />
                <div className="flex-1">
                  <h2 className="text-sm font-bold">L'agent analyste</h2>
                  <p className="text-[11px] leading-relaxed text-gray-400">
                    Faites votre recherche dans la bibliothèque ci-dessous, ouvrez la publicité ou l'annonceur à étudier, puis lancez l'analyse. Ce que la page ne montre pas (en Europe, Meta ne publie pas les dépenses des publicités commerciales) est écrit « non visible », jamais deviné.
                  </p>
                  <input
                    value={produit}
                    onChange={(e) => setProduit(e.target.value)}
                    placeholder="Le produit visé (facultatif) : mini pc, lampe solaire…"
                    className="mt-2 w-full rounded-lg border border-[var(--trait)] bg-[var(--nuit)] px-3 py-1.5 text-xs text-white outline-none focus:border-[var(--marque-rose)] md:max-w-md"
                  />
                </div>
                <button type="button" onClick={analyser} disabled={enCours || !etat?.url} className="btn-gradient inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">
                  {enCours ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {enCours ? 'Analyse en cours…' : `Lancer l'analyse IA${tarif != null ? ` · ${tarif} drops` : ''}`}
                </button>
              </section>
              {erreur ? <p className="mb-3 text-xs text-red-300">{erreur}</p> : null}
              <NavigateurIntegre profil="ads" depart={BIBLIOTHEQUES[plateforme].accueil} forcer hauteur={640} surEtat={setEtat} />
            </>
          ) : (
            <p className="text-xs text-gray-400">Choisissez une bibliothèque : elle s'ouvre juste en dessous.</p>
          )}
        </>
      )}

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold">Mes analyses</h2>
          <Link to="/reseaux?vue=analyses&source=perso" className="text-[11px] text-gray-400 underline hover:text-white">
            Aussi dans Analyses réseaux
          </Link>
        </div>
        <MesAnalysesAds recharger={recharger} ouvrirId={nouvelle} />
      </section>
    </Layout>
  )
}
