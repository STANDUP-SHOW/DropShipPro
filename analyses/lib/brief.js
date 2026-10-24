'use strict'
/**
 * The brief: a conversation with Claude that turns what the team says, writes
 * and uploads (documents, images) into the prompt of an analysis. Claude gives
 * the finished prompt between <prompt> and </prompt>; the team reads it, edits
 * it if needed and saves the analysis. Nothing runs from a brief by itself.
 *
 * Stored per brief in <userData>/briefs/<id>/: conversation.json and the
 * uploaded files as they were given (sent again with each turn).
 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const TYPES = {
  '.png': ['image', 'image/png'], '.jpg': ['image', 'image/jpeg'], '.jpeg': ['image', 'image/jpeg'], '.gif': ['image', 'image/gif'], '.webp': ['image', 'image/webp'],
  '.pdf': ['pdf', 'application/pdf'],
  '.txt': ['texte', 'text/plain'], '.md': ['texte', 'text/markdown'], '.csv': ['texte', 'text/csv'], '.json': ['texte', 'application/json'], '.html': ['texte', 'text/html'], '.htm': ['texte', 'text/html'], '.xml': ['texte', 'application/xml'],
}
const TAILLE_MAX = 10 * 1024 * 1024
const TOTAL_MAX = 24 * 1024 * 1024

const MODELE_BRIEF = 'claude-sonnet-5-5'

function systeme({ projet, analysesDuProjet = [], onglets = [], fournisseurMoteur }) {
  return [
    'Tu es Claude, dans l’atelier de brief de KANTIX ANALYSER : l’outil interne où max et son équipe produisent des analyses de marché détaillées pour leurs sites. Tu tutoies, en français.',
    'Ton travail : aider à écrire le PROMPT d’une analyse qui sera exécutée plus tard, seule et à intervalle régulier, par un modèle d’IA. Tu n’exécutes pas l’analyse toi-même.',
    `Projet : ${projet ? `${projet.nom}${projet.url ? ` (${projet.url})` : ''}` : 'non choisi'}.`,
    analysesDuProjet.length ? `Analyses existantes de ce projet (à ne pas dupliquer) : ${analysesDuProjet.join(' ; ')}.` : 'Aucune analyse existante pour ce projet.',
    onglets.length ? `Onglets connectés disponibles dans le navigateur de KANTIX (leur texte peut être lu par l’analyse) : ${onglets.join(' ; ')}.` : 'Aucun onglet connecté pour l’instant.',
    `Moteur prévu pour l’exécution : ${fournisseurMoteur || 'non choisi'}. S’il n’a pas de recherche web, l’analyse ne dispose que du texte des onglets connectés : dis-le si le besoin exige le web.`,
    'Méthode : comprends le but, le public du site, les décisions que le rapport doit éclairer. Pose au plus trois questions courtes à la fois, seulement si la réponse change le prompt. Lis les documents et images joints : ce sont des exemples, des chartes ou des données du projet.',
    'Quand tu as assez d’éléments, ou dès qu’on te le demande, rends le prompt complet entre les balises <prompt> et </prompt>, seul bloc de ce type dans ta réponse. Il contient : objectif ; périmètre (marché, pays, langue, période) ; sources à consulter et comment (recherche web, onglets connectés nommés) ; méthode pas à pas ; plan exact du rapport (sections) ; données structurées attendues dans l’annexe JSON (clés et types) ; règles de qualité.',
    'Règles de qualité à toujours mettre dans le prompt : ne jamais inventer une URL, un prix, un chiffre ou un avis ; une donnée non trouvée s’écrit « Non vérifié » ; chaque chiffre est suivi de l’URL de la page où il a été lu ; dater les données.',
    'Après la balise de fin, une phrase au plus pour dire ce que l’équipe peut encore préciser.',
  ].join('\n')
}

const dossierBrief = (racine, id) => path.join(racine, 'briefs', id)

function nouveau(racine) {
  const id = `brief-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`
  fs.mkdirSync(dossierBrief(racine, id), { recursive: true })
  const b = { id, creeLe: new Date().toISOString(), messages: [] }
  enregistrer(racine, b)
  return b
}

function charger(racine, id) {
  if (!/^brief-[a-z0-9-]+$/.test(String(id || ''))) throw new Error('Brief inconnu.')
  try { return JSON.parse(fs.readFileSync(path.join(dossierBrief(racine, id), 'conversation.json'), 'utf8')) } catch { throw new Error('Brief introuvable.') }
}

function enregistrer(racine, b) {
  fs.mkdirSync(dossierBrief(racine, b.id), { recursive: true })
  fs.writeFileSync(path.join(dossierBrief(racine, b.id), 'conversation.json'), JSON.stringify(b, null, 2))
}

/** Copies an uploaded file into the brief; refuses unknown types and oversize files. */
function ajouterPiece(racine, b, cheminSource) {
  const ext = path.extname(cheminSource).toLowerCase()
  const t = TYPES[ext]
  if (!t) throw new Error(`Type de fichier non pris en charge : ${ext || 'sans extension'} (images, PDF, texte, CSV, JSON, HTML).`)
  const taille = fs.statSync(cheminSource).size
  if (taille > TAILLE_MAX) throw new Error(`${path.basename(cheminSource)} dépasse 10 Mo.`)
  const total = taillePieces(racine, b) + taille
  if (total > TOTAL_MAX) throw new Error('Les documents joints dépassent 24 Mo au total pour ce brief.')
  const nomFichier = `${Date.now().toString(36)}-${path.basename(cheminSource).replace(/[^\w.\- ]+/g, '_')}`
  fs.copyFileSync(cheminSource, path.join(dossierBrief(racine, b.id), nomFichier))
  return { nom: path.basename(cheminSource), fichier: nomFichier, genre: t[0], mime: t[1], taille }
}

function taillePieces(racine, b) {
  return b.messages.flatMap((m) => m.pieces || []).reduce((s, p) => s + (p.taille || 0), 0)
}

/** The conversation in the neutral shape of lib/fournisseurs-ia.js (files read again from disk). */
function messagesPourIA(racine, b) {
  return b.messages.map((m) => {
    const parties = []
    for (const p of m.pieces || []) {
      const brut = fs.readFileSync(path.join(dossierBrief(racine, b.id), p.fichier))
      if (p.genre === 'image') parties.push({ type: 'image', mime: p.mime, base64: brut.toString('base64') })
      else if (p.genre === 'pdf') parties.push({ type: 'pdf', base64: brut.toString('base64'), nom: p.nom })
      else parties.push({ type: 'texte', texte: `Document joint « ${p.nom} » :\n\n${brut.toString('utf8')}` })
    }
    if (m.texte) parties.push({ type: 'texte', texte: m.texte })
    if (!parties.length) parties.push({ type: 'texte', texte: '(message vide)' })
    return { role: m.role, parties }
  })
}

/** The last prompt Claude gave in the conversation, or null. */
function dernierPrompt(b) {
  for (let i = b.messages.length - 1; i >= 0; i--) {
    const m = b.messages[i]
    if (m.role !== 'assistant') continue
    const x = /<prompt>([\s\S]*?)<\/prompt>/i.exec(m.texte || '')
    if (x && x[1].trim()) return x[1].trim()
  }
  return null
}

module.exports = { systeme, nouveau, charger, enregistrer, ajouterPiece, messagesPourIA, dernierPrompt, MODELE_BRIEF, TYPES }
