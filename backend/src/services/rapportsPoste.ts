/**
 * Les rapports du Poste d'analyses (analyses/), reçus par le site.
 *
 * **Pourquoi une deuxième base.** Le site lit `rapports.db`, un fichier livré
 * avec le code : le Railway n'en voit que la version commitée, et son disque est
 * éphémère. Un rapport envoyé par le Poste ne peut donc pas y être écrit. Il va
 * dans `rapports-poste.db`, sur le volume monté sur /app/storage (le seul disque
 * qui survit à un déploiement), avec EXACTEMENT le même schéma et le même code
 * d'écriture que l'import local (`aimarket-import.cjs`). `ReportQuery` lit les
 * deux bases ensemble : rayon et marketing se rangent donc d'eux-mêmes dans
 * Fresh news, Analyses, Produits gagnants, Prompts et les pages publiques.
 *
 * Un rapport du Poste remplace celui de rapports.db pour le même jour, la même
 * catégorie et le même thème (même identifiant).
 */
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { categorieDe, RapportInvalide } from './marketReports.js'

const RACINE_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Sur le volume monté sur /app/storage ; RAPPORTS_POSTE_DB le déplace (bancs). */
export const CHEMIN_RAPPORTS_POSTE_DB = process.env.RAPPORTS_POSTE_DB
  ? path.resolve(process.env.RAPPORTS_POSTE_DB)
  : path.join(RACINE_BACKEND, 'storage', 'rapports', 'rapports-poste.db')

interface ModuleImport {
  creerSchema(db: unknown): void
  lireEtude(d: unknown): { date: string; categorie: string; theme: string; produits: unknown[] }
  ecrireRapport(
    db: unknown,
    d: unknown,
    nom: string,
  ): { date: string; categorie: string; theme: string; idRayon: string; idMkt: string; produits: number; sources: number },
}

/** Le même module que `importer-aimarket.cjs` : un seul code d'écriture. */
const importeur = createRequire(import.meta.url)(path.join(RACINE_BACKEND, 'aimarket-import.cjs')) as ModuleImport

/**
 * Crée la base du Poste (schéma compris) si elle n'existe pas encore. Elle doit
 * exister AVANT que `ReportQuery` s'ouvre : il la rattache en lecture seule.
 * Renvoie false (sans lever) quand le disque n'est pas écrivable : le site garde
 * alors rapports.db tel quel.
 */
export function assurerBasePoste(chemin: string = CHEMIN_RAPPORTS_POSTE_DB): boolean {
  try {
    fs.mkdirSync(path.dirname(chemin), { recursive: true })
    const db = new Database(chemin)
    try {
      importeur.creerSchema(db)
    } finally {
      db.close()
    }
    return true
  } catch (err) {
    console.error('[rapports-poste] base indisponible :', err instanceof Error ? err.message : err)
    return false
  }
}

const MAX_PRODUITS = 60

/**
 * Un rapport MarketSpy du Poste est refusé, avec la raison, quand il ne peut pas
 * être rangé : catégorie ou thème inconnus d'agents.json (sinon une faute de
 * frappe créerait une 25ᵉ catégorie que l'écran ne saurait pas ranger), date mal
 * formée, aucun produit.
 */
export function verifierRapportPoste(d: unknown): void {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new RapportInvalide('Envoyez { rapport } : le JSON complet du rapport.')
  let etude
  try {
    etude = importeur.lireEtude(d)
  } catch (err) {
    throw new RapportInvalide(err instanceof Error ? err.message : String(err))
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(etude.date)) throw new RapportInvalide('Date absente ou mal formée (AAAA-MM-JJ).')
  const categorie = categorieDe(etude.categorie)
  if (!categorie) throw new RapportInvalide(`Catégorie inconnue « ${etude.categorie} » (voir agents.json).`)
  if (!categorie.themes.some((t) => t.id === etude.theme)) throw new RapportInvalide(`Thème inconnu « ${etude.theme} » pour ${categorie.nom}.`)
  if (!etude.produits.length) throw new RapportInvalide('Aucun produit dans le rapport.')
  if (etude.produits.length > MAX_PRODUITS) throw new RapportInvalide(`Trop de produits (${etude.produits.length}, au plus ${MAX_PRODUITS}).`)
  for (const [i, p] of etude.produits.entries()) {
    if (!p || typeof p !== 'object') throw new RapportInvalide(`Produit ${i + 1} illisible.`)
  }
}

/** Écrit le rapport (rayon ET marketing d'un coup) et renvoie les identifiants rangés. */
export function enregistrerRapportPoste(d: unknown, chemin: string = CHEMIN_RAPPORTS_POSTE_DB) {
  verifierRapportPoste(d)
  if (!assurerBasePoste(chemin)) throw new Error('La base des rapports du Poste est indisponible sur ce serveur.')
  const db = new Database(chemin)
  try {
    return importeur.ecrireRapport(db, d, 'poste-analyses')
  } finally {
    db.close()
  }
}
