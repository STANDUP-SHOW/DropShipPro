import { useEffect, useState } from 'react'
import { api } from './api'

/**
 * Ce qui est arrivé et que personne n'a encore ouvert, section par section.
 *
 * **Le serveur ne sait pas ce que ce vendeur a lu, et il n'a pas à le savoir.**
 * Il rend le nombre de choses déposées PAR JOUR pour chacune des cinq sections
 * — une seule requête, la même réponse pour tout le monde, donc une réponse qui
 * se met en cache. Le navigateur, lui, garde la dernière journée ouverte pour
 * chaque section et additionne ce qui est plus récent. Aucune table, aucun état
 * de lecture côté serveur, et rien à migrer le jour où une section s'ajoute.
 *
 * L'autre voie — un paramètre « depuis » par section — voulait dire cinq
 * requêtes, toutes différentes d'un vendeur à l'autre.
 */
export type SectionNouveautes =
  | 'fresh-news'
  | 'analyses'
  | 'gagnants'
  | 'reseaux-analyses'
  | 'reseaux-prompts'

/** Une journée de dépôt et ce qu'elle a apporté. */
export type JourneeNouveautes = { jour: string; nombre: number }

export type NouveautesParSection = Record<SectionNouveautes, JourneeNouveautes[]>

export const SECTIONS_NOUVEAUTES: SectionNouveautes[] = [
  'fresh-news',
  'analyses',
  'gagnants',
  'reseaux-analyses',
  'reseaux-prompts',
]

/**
 * Quelle entrée du menu ouvre quelle section.
 *
 * Les clés sont les adresses EXACTES du menu latéral (`Layout.tsx`), paramètre
 * compris : `/reseaux?vue=analyses` et `/reseaux?vue=prompts` sont deux vues de
 * la même page et comptent deux choses différentes. `/reseaux` nu (les comptes
 * réseaux) ne reçoit rien des agents : pas de pastille.
 */
export const SECTION_PAR_ADRESSE: Record<string, SectionNouveautes> = {
  '/fresh-news': 'fresh-news',
  '/analyse-marche': 'analyses',
  '/produits-gagnants': 'gagnants',
  '/reseaux?vue=analyses': 'reseaux-analyses',
  '/reseaux?vue=prompts': 'reseaux-prompts',
}

/** Ce que le survol raconte, section par section. */
const LIBELLES: Record<SectionNouveautes, string> = {
  'fresh-news': 'rapports du jour',
  analyses: 'analyses de marché',
  gagnants: 'produits gagnants',
  'reseaux-analyses': 'analyses réseaux',
  'reseaux-prompts': 'prompts IA',
}

export function titreNouveautes(section: SectionNouveautes, nombre: number) {
  return `${nombre} ${LIBELLES[section]} non ${section === 'gagnants' || section === 'reseaux-prompts' ? 'ouverts' : 'ouvertes'}`
}

const CLE_VU = (section: SectionNouveautes) => `dsp-vu-${section}`

/**
 * La dernière journée ouverte pour une section, ou `null` si on n'a jamais
 * regardé — auquel cas TOUT est neuf, et c'est voulu : un compte qui découvre
 * l'application doit voir qu'il y a quelque chose à lire.
 *
 * Lecture et écriture sous `try` : en navigation privée, ou avec les données de
 * site bloquées, le simple accès à `localStorage` lève.
 */
function lireVu(section: SectionNouveautes): string | null {
  try {
    return localStorage.getItem(CLE_VU(section))
  } catch {
    return null
  }
}

function ecrireVu(section: SectionNouveautes, jour: string) {
  try {
    localStorage.setItem(CLE_VU(section), jour)
  } catch {
    // Pas de mémoire : la pastille se rallumera au prochain chargement. C'est
    // désagréable, ce n'est pas une panne.
  }
}

/** Ce qui est plus récent que la dernière journée ouverte. */
function nonLus(journees: JourneeNouveautes[] | undefined, vu: string | null) {
  if (!journees?.length) return 0
  // Les dates sont en ISO (AAAA-MM-JJ) : la comparaison de chaînes les classe.
  return journees.reduce((total, j) => (vu && j.jour <= vu ? total : total + j.nombre), 0)
}

/** La journée la plus récente d'une section, celle qu'on marque comme vue. */
function derniereJournee(journees: JourneeNouveautes[] | undefined) {
  if (!journees?.length) return null
  return journees.reduce((max, j) => (j.jour > max ? j.jour : max), journees[0].jour)
}

const VIDE: NouveautesParSection = {
  'fresh-news': [],
  analyses: [],
  gagnants: [],
  'reseaux-analyses': [],
  'reseaux-prompts': [],
}

/*
 * Le relevé est partagé par tout ce qui l'affiche, et il n'est pas redemandé
 * plus d'une fois par minute.
 *
 * Le menu se remonte à chaque changement de page ; sans ce garde-fou, une
 * session de travail normale — trente pages ouvertes en dix minutes — ferait
 * trente appels pour un chiffre qui bouge deux fois par jour. Pas de `setInterval`
 * non plus : une boucle qui tourne pendant que l'onglet dort n'apprend rien à
 * personne.
 */
const DELAI_RAFRAICHI = 60_000
let cache: NouveautesParSection | null = null
let dernierReleve = 0
let enCours: Promise<void> | null = null
const abonnes = new Set<(n: NouveautesParSection) => void>()

function rafraichir(force = false) {
  if (enCours) return enCours
  if (!force && cache && Date.now() - dernierReleve < DELAI_RAFRAICHI) return Promise.resolve()

  enCours = api
    .nouveautesRapports()
    .then((releve) => {
      cache = { ...VIDE, ...releve }
      dernierReleve = Date.now()
      for (const prevenir of abonnes) prevenir(cache)
    })
    .catch(() => {
      // Base des rapports indisponible ou session expirée : pas de pastille,
      // et surtout pas d'erreur à l'écran pour un chiffre décoratif.
    })
    .finally(() => {
      enCours = null
    })

  return enCours
}

/**
 * Les nombres à peindre sur le menu, et l'oubli de ce qu'on vient d'ouvrir.
 *
 * `adresse` est l'adresse courante COMPLÈTE (chemin + paramètres) : ouvrir
 * `/reseaux?vue=prompts` n'éteint que la pastille des prompts, pas celle des
 * analyses réseaux qui vivent sur la même page.
 */
export function useNouveautes(adresse: string) {
  const [releve, setReleve] = useState<NouveautesParSection>(cache ?? VIDE)
  /*
   * Ce que le navigateur a déjà vu, recopié dans l'état : `localStorage` ne
   * prévient personne quand il change, et sans cette copie la pastille de la
   * page qu'on vient d'ouvrir resterait allumée jusqu'au rechargement suivant.
   */
  const [vus, setVus] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(SECTIONS_NOUVEAUTES.map((s) => [s, lireVu(s)])),
  )

  useEffect(() => {
    abonnes.add(setReleve)
    return () => {
      abonnes.delete(setReleve)
    }
  }, [])

  // Au montage, puis à chaque changement de page — le relevé lui-même se borne
  // à un appel par minute.
  useEffect(() => {
    void rafraichir()
  }, [adresse])

  // Ouvrir une section la marque lue. Le relevé est une dépendance : arriver
  // sur la page avant que les chiffres soient là ne doit pas sauter le marquage.
  useEffect(() => {
    const section = SECTION_PAR_ADRESSE[adresse]
    if (!section) return
    const jour = derniereJournee(releve[section])
    if (!jour) return
    setVus((precedents) => {
      if (precedents[section] === jour) return precedents
      ecrireVu(section, jour)
      return { ...precedents, [section]: jour }
    })
  }, [adresse, releve])

  const nombres = Object.fromEntries(
    SECTIONS_NOUVEAUTES.map((section) => [section, nonLus(releve[section], vus[section])]),
  ) as Record<SectionNouveautes, number>

  return nombres
}
