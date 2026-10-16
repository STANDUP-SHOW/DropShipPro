import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, ExternalLink, Loader2, Lock } from 'lucide-react'
import { COUT_EXTENSION, COUT_IMPORT, importerProduits, type ProduitAffiche } from '../ListeProduitsRapport'
import { Fenetre, Filtres } from './Creative'
import { dateLongue, liste, lireVerdict, type FamilleVerdict } from './Veille'
import { api } from '../../lib/api'

/**
 * Les produits gagnants des rapports, en cartes (maquette du 16/10/2026, vue 09).
 *
 * En tête, le bandeau citron dit le contrat des agents — 24 rayons × 20
 * produits, chaque jour, soit 480 — puis ce que le jour montré contient
 * vraiment. Les cartes se filtrent par rayon, par jour et par verdict ; on les
 * coche, et la barre de sélection importe par le même chemin que la liste des
 * rapports (`importerProduits`) : direct quand la fiche se lit, extension sinon.
 *
 * L'affiche d'une carte est la photo du produit quand le rapport en donne une,
 * sinon un sigle typographique, dit comme tel : jamais une fausse photo.
 */
type Gagnant = ProduitAffiche & { rapportId: string; day: string; categorie: string; categorieNom: string; theme: string; themeNom: string }

/** Le contrat des agents : 24 rayons, 20 produits par rayon et par jour. */
const RAYONS = 24
const PAR_RAYON = 20
const PREMIERES = 12

const FILTRES: ReadonlyArray<{ id: FamilleVerdict | 'tous'; label: string }> = [
  { id: 'tous', label: 'Tous' },
  { id: 'acheter', label: 'Acheter' },
  { id: 'surveiller', label: 'À surveiller' },
  { id: 'non', label: 'Ne pas acheter' },
]

const euros = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')} €`)
const cle = (p: Gagnant) => `${p.rapportId}:${p.rang}`

/**
 * Le sigle de l'affiche : un acronyme du titre s'il y en a un (OBD, LED, XXL),
 * sinon le premier mot s'il est court (BROSSE), sinon les initiales des trois
 * premiers mots qui portent.
 */
function sigle(titre: string): string {
  const mots = titre
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((m) => m.length > 1 && !/^\d+$/.test(m) && !/^(de|du|des|la|le|les|et|en|pour|avec|sans|un|une|au|aux|the|for|and|with)$/i.test(m))
  const acronyme = mots.find((m) => m.length >= 2 && m.length <= 5 && /^\p{Lu}+$/u.test(m))
  if (acronyme) return acronyme
  if (!mots.length) return '?'
  if (mots[0].length <= 6) return mots[0].toUpperCase()
  return mots
    .slice(0, 3)
    .map((m) => m[0])
    .join('')
    .toUpperCase()
}

export function CartesGagnants() {
  const [produits, setProduits] = useState<Gagnant[]>([])
  const [jours, setJours] = useState<string[]>([])
  const [jour, setJour] = useState('')
  const [categorie, setCategorie] = useState('')
  const [famille, setFamille] = useState<FamilleVerdict | 'tous'>('tous')
  const [tout, setTout] = useState(false)
  const [coches, setCoches] = useState<Set<string>>(new Set())
  const [examine, setExamine] = useState<Gagnant | null>(null)
  const [chargement, setChargement] = useState(true)
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [porte, setPorte] = useState<{ seuil: number; drops: number } | null>(null)

  useEffect(() => {
    setChargement(true)
    setErreur(null)
    api
      .gagnantsRapports({ jour: jour || undefined, limite: 1000 })
      .then((d) => {
        setProduits(liste<Gagnant>(d?.produits))
        if (!jour) setJours(liste<string>(d?.jours))
      })
      .catch((e: Error & { status?: number; body?: { seuil?: number; drops?: number } }) => {
        setProduits([])
        if (e.status === 402) setPorte({ seuil: e.body?.seuil ?? 500, drops: e.body?.drops ?? 0 })
        else setErreur(e.message)
      })
      .finally(() => setChargement(false))
  }, [jour])

  // Sans jour choisi, le plus récent : la liste « tous les jours » mélangerait les éditions.
  const jourMontre = jour || jours[0] || ''
  const duJour = useMemo(() => produits.filter((p) => !jourMontre || p.day === jourMontre), [produits, jourMontre])
  const rayons = useMemo(() => {
    const vus = new Map<string, string>()
    for (const p of duJour) vus.set(p.categorie, p.categorieNom)
    return [...vus.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  }, [duJour])
  const duRayon = duJour.filter((p) => !categorie || p.categorie === categorie)
  const affiches = duRayon.filter((p) => famille === 'tous' || lireVerdict(p.verdict)?.famille === famille)
  const visibles = tout ? affiches : affiches.slice(0, PREMIERES)
  const directs = duJour.filter((p) => p.import !== 'extension').length
  const selection = duRayon.filter((p) => coches.has(cle(p)))
  const cout = (lot: Gagnant[]) => lot.reduce((t, p) => t + (p.import === 'extension' ? COUT_EXTENSION : COUT_IMPORT), 0)
  const nombreDe = (f: FamilleVerdict) => duRayon.filter((p) => lireVerdict(p.verdict)?.famille === f).length

  function basculer(p: Gagnant) {
    setCoches((c) => {
      const s = new Set(c)
      if (s.has(cle(p))) s.delete(cle(p))
      else s.add(cle(p))
      return s
    })
  }

  async function importer(lot: Gagnant[]) {
    if (!lot.length) return
    setEnCours(true)
    setMessage(null)
    try {
      setMessage(await importerProduits(lot, 'gagnants'))
      setCoches(new Set())
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "L'import n'a pas abouti.")
    } finally {
      setEnCours(false)
    }
  }

  if (porte) {
    return (
      <div className="v-carte mt-8 max-w-2xl">
        <p className="flex items-center gap-2 font-bold">
          <Lock size={16} /> Réservé aux comptes à {porte.seuil} drops et plus
        </p>
        <p className="mt-2 text-sm text-[var(--c-texte-2)]">
          Les produits gagnants sont offerts, mais il vous faut {porte.seuil} drops en banque : vous en avez {porte.drops}.
        </p>
        <Link to="/credits" className="c-bouton mt-4 w-fit">Recharger mes drops</Link>
      </div>
    )
  }

  return (
    <>
      {/* ---------- Le bandeau citron ---------- */}
      <section className="v-citron mt-8">
        <span className="v-etoile-citron" aria-hidden>✳</span>
        <div className="relative">
          <p className="c-etiquette">Chaque jour, tous les rayons</p>
          <p className="v-geant mt-3">
            {RAYONS * PAR_RAYON}
            <small>produits</small>
          </p>
          <p className="mt-3 max-w-md text-sm font-medium leading-relaxed">
            {`${RAYONS} rayons × ${PAR_RAYON} produits : chaque matin, les agents relèvent les vingt produits gagnants de chaque rayon, avec le prix d'achat, le prix de vente constaté, la marge et le chemin d'import.`}
          </p>
        </div>
        <dl>
          <div>
            <dt>{duJour.length}</dt>
            <dd>{jourMontre ? `produits relevés le ${dateLongue(jourMontre)}, ${rayons.length} rayon${rayons.length > 1 ? 's' : ''}` : 'produits relevés'}</dd>
          </div>
          <div>
            <dt>{directs}</dt>
            <dd>imports directs</dd>
          </div>
          <div>
            <dt>{duJour.length - directs}</dt>
            <dd>via l'extension</dd>
          </div>
        </dl>
      </section>

      {/* ---------- Les filtres ---------- */}
      <div className="v-titre-section mt-10">
        <div>
          <h2 className="c-h2">{categorie ? rayons.find(([id]) => id === categorie)?.[1] ?? 'Rayon' : 'Tous les rayons'}</h2>
          <p>{`${duRayon.length} référence${duRayon.length > 1 ? 's' : ''}${jourMontre ? ` du rapport du ${dateLongue(jourMontre)}` : ''}.`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {jours.length > 1 ? (
            <select className="c-champ !w-auto" value={jourMontre} onChange={(e) => { setJour(e.target.value); setTout(false); setCoches(new Set()) }} aria-label="Jour">
              {jours.map((j) => (
                <option key={j} value={j}>{dateLongue(j)}</option>
              ))}
            </select>
          ) : null}
          {rayons.length > 1 ? (
            <select className="c-champ !w-auto" value={categorie} onChange={(e) => { setCategorie(e.target.value); setTout(false) }} aria-label="Rayon">
              <option value="">Tous les rayons</option>
              {rayons.map(([id, nom]) => (
                <option key={id} value={id}>{nom}</option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
      <div className="mt-3">
        <Filtres
          options={FILTRES.map((f) => ({ id: f.id, label: f.id === 'tous' ? f.label : `${f.label} (${nombreDe(f.id)})` }))}
          valeur={famille}
          onChange={(v) => { setFamille(v); setTout(false) }}
        />
      </div>

      {erreur ? <p className="mt-4 text-sm text-red-400">{erreur}</p> : null}
      {chargement ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-[var(--c-texte-2)]"><Loader2 size={14} className="animate-spin" /> Chargement…</p>
      ) : affiches.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--c-texte-2)]">
          {duRayon.length ? 'Aucune référence avec ce verdict.' : 'Aucun produit gagnant déposé pour l\'instant. Les agents en déposent vingt par rayon et par jour, le matin.'}
        </p>
      ) : (
        <>
          <div className="v-grille mt-5">
            {visibles.map((p, i) => {
              const v = lireVerdict(p.verdict)
              const coche = coches.has(cle(p))
              return (
                <article key={cle(p)} className="v-produit" data-coche={coche ? '1' : '0'}>
                  <div className="v-affiche-produit" data-teinte={i % 3}>
                    {p.image ? (
                      <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <>
                        <span className="v-sur">{p.categorieNom} / {String(p.rang).padStart(2, '0')}</span>
                        <strong aria-hidden>{sigle(p.titre)}</strong>
                        <span className="v-mention">Illustration typographique</span>
                      </>
                    )}
                    <button type="button" role="checkbox" aria-checked={coche} aria-label={`Retenir ${p.titre}`} className="v-case" onClick={() => basculer(p)}>
                      {coche ? <Check size={13} strokeWidth={3} /> : null}
                    </button>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    {v ? (
                      <span className="v-verdict" data-ton={v.famille === 'non' ? 'non' : v.famille === 'acheter' ? 'oui' : undefined}>{v.libelle}</span>
                    ) : null}
                    <h3 className="line-clamp-2 text-base font-semibold leading-snug" title={p.titre}>{p.titre}</h3>
                    <p className="truncate text-xs text-[var(--c-texte-2)]">{p.fournisseur && p.fournisseur !== '—' ? p.fournisseur : p.categorieNom}</p>
                    <div className="v-trois mt-auto">
                      <p><small>Achat</small><b>{euros(p.prixAchat)}</b></p>
                      <p><small>Vente indiquée</small><b>{euros(p.prixVente)}</b></p>
                      <p><small>Marge affichée</small><b>{p.margePct == null ? '—' : `${Math.round(p.margePct)} %`}</b></p>
                    </div>
                    <button type="button" className="c-bouton-sec mt-2 justify-center !text-xs" onClick={() => setExamine(p)}>
                      Examiner la référence <ArrowUpRight size={12} />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
          {affiches.length > PREMIERES ? (
            <button type="button" className="c-bouton-sec mt-4" onClick={() => setTout((t) => !t)}>
              {tout ? 'Montrer moins de références' : `Montrer les ${affiches.length - PREMIERES} autres références`}
            </button>
          ) : null}
        </>
      )}

      {/* ---------- La barre de sélection ---------- */}
      <div className="v-selection mt-6">
        <span>{`${selection.length} référence${selection.length > 1 ? 's' : ''} retenue${selection.length > 1 ? 's' : ''}`}</span>
        <button type="button" className="c-bouton" disabled={!selection.length || enCours} onClick={() => importer(selection)}>
          {enCours ? <Loader2 size={14} className="animate-spin" /> : null}
          <span>{selection.length ? `Importer la sélection · ${cout(selection)} drops` : 'Importer la sélection'}</span>
          <ArrowUpRight size={15} />
        </button>
      </div>
      {message ? <p className="mt-3 text-sm text-[var(--c-lime)]">{message}</p> : null}

      <p className="v-note mt-6">
        {`Prix et marges repris du rapport, à reconfirmer avant import. La marge affichée n'est pas un bénéfice net. Import direct : ${COUT_IMPORT} drops ; par l'extension, quand la fiche ne se lit que dans un navigateur : ${COUT_EXTENSION} drops.`}
      </p>

      {examine ? (
        <Fenetre titre={examine.titre} onClose={() => setExamine(null)}>
          {lireVerdict(examine.verdict) ? <span className="v-verdict mt-2">{lireVerdict(examine.verdict)!.libelle}</span> : null}
          <p className="mt-3 text-xs text-[var(--c-texte-2)]">
            {[`Rapport ${examine.categorieNom}`, examine.themeNom, dateLongue(examine.day), examine.fournisseur && examine.fournisseur !== '—' ? examine.fournisseur : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="v-trois mt-4">
            <p><small>Achat</small><b>{euros(examine.prixAchat)}</b></p>
            <p><small>Vente indiquée</small><b>{euros(examine.prixVente)}</b></p>
            <p><small>Marge affichée</small><b>{examine.margePct == null ? '—' : `${Math.round(examine.margePct)} %`}</b></p>
          </div>
          {examine.pourquoi && examine.pourquoi !== '—' ? <p className="mt-4 text-sm leading-relaxed">{examine.pourquoi}</p> : null}
          <p className="mt-3 text-xs text-[var(--c-texte-2)]">
            {[examine.ventes ? `Ventes constatées : ${examine.ventes}` : null, examine.score != null ? `Score de l'agent : ${examine.score}/100` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="mt-3 text-xs text-[var(--c-texte-2)]">
            {examine.import === 'extension'
              ? `Import par l'extension : ${COUT_EXTENSION} drops (la fiche ne se lit que dans un navigateur).`
              : `Import direct : ${COUT_IMPORT} drops.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={examine.url} target="_blank" rel="noopener noreferrer" className="c-bouton-sec !text-xs">
              <ExternalLink size={12} /> Consulter la référence source
            </a>
            <button type="button" className="c-bouton !text-xs" disabled={enCours} onClick={() => importer([examine])}>
              {`Importer · ${examine.import === 'extension' ? COUT_EXTENSION : COUT_IMPORT} drops`}
            </button>
          </div>
          {message ? <p className="mt-3 text-xs text-[var(--c-lime)]">{message}</p> : null}
        </Fenetre>
      ) : null}
    </>
  )
}
