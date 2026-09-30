'use strict'
/**
 * Le mode automatique de publication — ses garde-fous, sans aucun navigateur.
 *
 * Décision de Max (29/09/2026, CLAUDE.md) : permis sur l'accord EXPLICITE du
 * vendeur, avec plafonds et espacement par plateforme, arrêt et alerte au
 * premier captcha ou blocage, et un journal de chaque publication.
 *
 * Ce module ne fait qu'une chose : dire OUI ou NON, et pourquoi. Il ne touche
 * ni à la page ni au clavier. **Jamais d'évasion anti-robot** : pas de faux
 * profil matériel, pas de navigateur « stealth », pas de résolution de captcha,
 * pas de hasard qui maquille un robot en humain. Les intervalles sont fixes,
 * et la première alerte de la plateforme arrête tout jusqu'à ce que le vendeur
 * reprenne lui-même.
 */
const fs = require('node:fs')
const path = require('node:path')

/** `dur` : le plafond que le vendeur ne peut pas dépasser, même en le demandant. */
const PLATEFORMES = {
  VINTED: { nom: 'Vinted', accueil: 'https://www.vinted.fr/', partition: 'persist:vinted', plafondJour: 10, dur: 15, espacementMin: 20 },
  LEBONCOIN: { nom: 'Leboncoin', accueil: 'https://www.leboncoin.fr/', partition: 'persist:leboncoin', plafondJour: 5, dur: 8, espacementMin: 30 },
  FACEBOOK: { nom: 'Facebook Marketplace', accueil: 'https://www.facebook.com/marketplace/', partition: 'persist:facebook', plafondJour: 8, dur: 10, espacementMin: 30 },
}

/** Le texte que le vendeur lit avant de cocher l'accord — la trace de ce qu'il a accepté. */
const TEXTE_ACCORD =
  "L'agent publie seul mes annonces sur cette plateforme, depuis ma session, avec des plafonds, et s'arrête au premier blocage. Les plateformes peuvent restreindre un compte qui automatise ses publications."

const MOTIFS_BLOCAGE = [
  /captcha/i,
  /recaptcha|hcaptcha|datadome|perimeterx|cloudflare/i,
  /verify (that )?you('| a)re (a )?human|are you a robot|robot check/i,
  /v[ée]rification de s[ée]curit[ée]|confirmez que vous [êe]tes un humain|activit[ée] inhabituelle|trafic inhabituel/i,
  /access denied|acc[èe]s refus[ée]|temporarily blocked|temporairement bloqu[ée]|compte (suspendu|restreint|d[ée]sactiv[ée])/i,
]

/** Un blocage vu sur la page (adresse, titre, texte visible) : le mot exact est rendu pour l'alerte. */
function detecterBlocage({ url = '', titre = '', texte = '' } = {}) {
  const ensemble = `${url}\n${titre}\n${String(texte).slice(0, 4000)}`
  for (const re of MOTIFS_BLOCAGE) {
    const m = re.exec(ensemble)
    if (m) return { bloque: true, indice: m[0] }
  }
  return { bloque: false, indice: null }
}

const jourLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Le plafond réellement appliqué : celui du vendeur, borné par le plafond dur. */
function plafondEffectif(plateforme, config = {}) {
  const p = PLATEFORMES[plateforme]
  if (!p) return 0
  const voulu = Number(config.plafonds?.[plateforme])
  const choisi = Number.isFinite(voulu) && voulu > 0 ? Math.floor(voulu) : p.plafondJour
  return Math.min(choisi, p.dur)
}

/**
 * Peut-on publier maintenant sur cette plateforme ?
 * `journal` : les entrées `{ plateforme, at, type }` ; seules celles de type
 * `publication` comptent. `etat.arrets[plateforme]` : l'arrêt posé par un blocage.
 */
function decision({ plateforme, config = {}, journal = [], etat = {}, maintenant = new Date() }) {
  const p = PLATEFORMES[plateforme]
  if (!p) return { ok: false, raison: 'plateforme inconnue', attenteMs: null }
  if (!config.accords?.[plateforme]) {
    return { ok: false, raison: `Le mode automatique n'est pas activé pour ${p.nom} : il faut votre accord explicite.`, attenteMs: null }
  }
  const arret = etat.arrets?.[plateforme]
  if (arret) {
    // Pause de sécurité en cours : on attend, sans rien tenter. Passé le délai, une nouvelle tentative
    // (rouvrir la page) est autorisée ; si le mur est encore là, `arreter` double la pause.
    const reste = arret.jusqua ? new Date(arret.jusqua).getTime() - maintenant.getTime() : null
    if (reste === null || reste > 0) {
      return { ok: false, raison: `Pause de sécurité sur ${p.nom} (${arret.raison}).${reste ? '' : ' Reprenez vous-même.'}`, attenteMs: reste }
    }
  }
  const publiees = journal.filter((e) => e.type === 'publication' && e.plateforme === plateforme)
  const aujourdhui = publiees.filter((e) => jourLocal(new Date(e.at)) === jourLocal(maintenant))
  const plafond = plafondEffectif(plateforme, config)
  if (aujourdhui.length >= plafond) {
    const demain = new Date(maintenant)
    demain.setHours(24, 0, 0, 0)
    return { ok: false, raison: `Plafond du jour atteint sur ${p.nom} (${aujourdhui.length}/${plafond}).`, attenteMs: demain.getTime() - maintenant.getTime() }
  }
  const derniere = publiees.map((e) => new Date(e.at).getTime()).sort((a, b) => b - a)[0]
  if (derniere !== undefined) {
    const ecoule = maintenant.getTime() - derniere
    const voulu = p.espacementMin * 60_000
    if (ecoule < voulu) return { ok: false, raison: `Espacement de ${p.espacementMin} min entre deux annonces sur ${p.nom}.`, attenteMs: voulu - ecoule }
  }
  return { ok: true, raison: null, attenteMs: 0 }
}

/** L'accord du vendeur, daté, avec le texte qu'il a accepté. */
function accorder(config, plateforme, maintenant = new Date()) {
  if (!PLATEFORMES[plateforme]) throw new Error('plateforme inconnue')
  return { ...config, accords: { ...config.accords, [plateforme]: { at: maintenant.toISOString(), texte: TEXTE_ACCORD } } }
}

function retirerAccord(config, plateforme) {
  const accords = { ...config.accords }
  delete accords[plateforme]
  return { ...config, accords }
}

/**
 * Le premier blocage met la plateforme en PAUSE, pas à la porte : l'agent la
 * retente tout seul plus tard, une fois, en ne faisant que rouvrir la page. Si le
 * mur est toujours là, la pause double (6 h, 12 h, 24 h, 48 h au plus). Un mur
 * anti-robot n'est jamais forcé — on attend, c'est tout. Les autres plateformes
 * continuent pendant ce temps. Une publication réussie remet le compteur à zéro.
 */
const PAUSE_BASE_MS = 6 * 3600_000
const PAUSE_MAX_MS = 48 * 3600_000

function arreter(etat, plateforme, raison, maintenant = new Date()) {
  const tentatives = (etat.arrets?.[plateforme]?.tentatives ?? 0) + 1
  const pause = Math.min(PAUSE_BASE_MS * 2 ** (tentatives - 1), PAUSE_MAX_MS)
  return {
    ...etat,
    arrets: { ...etat.arrets, [plateforme]: { at: maintenant.toISOString(), raison, tentatives, jusqua: new Date(maintenant.getTime() + pause).toISOString() } },
  }
}

/** Le temps de pause restant : 0 = libre, un nombre = à attendre, null = arrêt sans échéance (état ancien). */
function pauseRestante(etat, plateforme, maintenant = new Date()) {
  const arret = etat.arrets?.[plateforme]
  if (!arret) return 0
  if (!arret.jusqua) return null
  const reste = new Date(arret.jusqua).getTime() - maintenant.getTime()
  return reste > 0 ? reste : 0
}

function reprendre(etat, plateforme) {
  const arrets = { ...etat.arrets }
  delete arrets[plateforme]
  return { ...etat, arrets }
}

// ---------------------------------------------------------------- Persistance

function lireEtat(dossier) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dossier, 'etat.json'), 'utf8'))
  } catch {
    return { arrets: {} }
  }
}

function ecrireEtat(dossier, etat) {
  fs.mkdirSync(dossier, { recursive: true })
  fs.writeFileSync(path.join(dossier, 'etat.json'), JSON.stringify(etat, null, 2))
}

/** Le journal : une ligne JSON par événement, jamais réécrite. */
function journaliser(dossier, entree, maintenant = new Date()) {
  fs.mkdirSync(dossier, { recursive: true })
  fs.appendFileSync(path.join(dossier, 'journal.jsonl'), `${JSON.stringify({ at: maintenant.toISOString(), ...entree })}\n`)
}

function lireJournal(dossier) {
  try {
    return fs
      .readFileSync(path.join(dossier, 'journal.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

module.exports = { PLATEFORMES, TEXTE_ACCORD, pauseRestante, detecterBlocage, plafondEffectif, decision, accorder, retirerAccord, arreter, reprendre, lireEtat, ecrireEtat, journaliser, lireJournal }
