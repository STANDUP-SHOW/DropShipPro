'use strict'
/**
 * When an analysis runs: once (by hand), every day at HH:MM, or every week on
 * a given day at HH:MM — in the PC's local time.
 *
 * A slot is due when it is past, later than the moment the schedule was set,
 * not run yet, and less than RATTRAPAGE_H old: a PC that was off at midnight
 * still runs the analysis when it starts in the morning, not the next evening.
 */
const RATTRAPAGE_H = 6
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function normaliserRecurrence(brut) {
  const r = brut || {}
  const type = ['quotidien', 'hebdo'].includes(r.type) ? r.type : 'aucune'
  if (type === 'aucune') return { type }
  const heure = String(r.heure || '00:00').trim()
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) throw new Error('Heure invalide (HH:MM, ex. 00:00).')
  if (type === 'quotidien') return { type, heure }
  const jour = Number(r.jour)
  if (!Number.isInteger(jour) || jour < 0 || jour > 6) throw new Error('Choisissez le jour de la semaine.')
  return { type, heure, jour }
}

function aLHeure(d, heure) {
  const [h, m] = heure.split(':').map(Number)
  const x = new Date(d)
  x.setHours(h, m, 0, 0)
  return x
}

/** The latest slot at or before `maintenant`, or null for « aucune ». */
function dernierCreneau(r, maintenant) {
  if (!r || r.type === 'aucune') return null
  let x = aLHeure(maintenant, r.heure)
  if (r.type === 'quotidien') {
    if (x > maintenant) x.setDate(x.getDate() - 1)
    return x
  }
  const ecart = (x.getDay() - r.jour + 7) % 7
  x.setDate(x.getDate() - ecart)
  if (x > maintenant) x.setDate(x.getDate() - 7)
  return x
}

/** The next slot strictly after `maintenant`. */
function prochainCreneau(r, maintenant) {
  if (!r || r.type === 'aucune') return null
  const d = dernierCreneau(r, maintenant)
  const x = new Date(d)
  x.setDate(x.getDate() + (r.type === 'quotidien' ? 1 : 7))
  return x
}

/** @returns {Date|null} the slot to run now, if any. */
function creneauDu(analyse, maintenant) {
  const c = dernierCreneau(analyse.recurrence, maintenant)
  if (!c) return null
  if (maintenant - c > RATTRAPAGE_H * 3600e3) return null
  if (analyse.planifieeLe && c <= new Date(analyse.planifieeLe)) return null
  const fait = analyse.derniere && analyse.derniere.creneau
  if (fait && new Date(fait) >= c) return null
  return c
}

function libelle(r) {
  if (!r || r.type === 'aucune') return 'À la demande'
  if (r.type === 'quotidien') return `Tous les jours à ${r.heure}`
  return `Chaque ${JOURS[r.jour]} à ${r.heure}`
}

module.exports = { normaliserRecurrence, dernierCreneau, prochainCreneau, creneauDu, libelle, JOURS, RATTRAPAGE_H }
