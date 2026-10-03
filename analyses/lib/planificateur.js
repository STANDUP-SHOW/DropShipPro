'use strict'
/**
 * The scheduler. It starts the night only when Max switched it on himself
 * (`nuitActivee`), once per day, inside a window after the chosen hour (a PC
 * that boots late still runs the night, but not at 3 p.m.). Between nights it
 * revisits each source on a fixed cadence to keep its session alive and to
 * notice a lost one.
 */
const FENETRE_NUIT_H = 6
const CADENCE_SESSIONS_MS = 30 * 60e3

function minutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

function planifier({ maintenant, config, nuitEnCours, dejaFaiteAujourdhui, lancerNuit, garderSessions, journal, intervalleMs = 60e3 }) {
  let dernierJourLance = null
  let derniereGarde = 0
  let occupe = false

  async function tick() {
    if (occupe) return 'occupe'
    const d = maintenant()
    const cfg = config()
    const jour = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    const m = d.getHours() * 60 + d.getMinutes()
    const debut = minutes(cfg.heureNuit || '01:00')
    const dansLaFenetre = m >= debut && m < debut + FENETRE_NUIT_H * 60
    occupe = true
    try {
      if (cfg.nuitActivee && !nuitEnCours() && dansLaFenetre && dernierJourLance !== jour && !dejaFaiteAujourdhui()) {
        dernierJourLance = jour
        journal.info('Planificateur : lancement de la nuit')
        await lancerNuit()
        return 'nuit'
      }
      if (!nuitEnCours() && d.getTime() - derniereGarde >= CADENCE_SESSIONS_MS && (cfg.sources || []).some((s) => s.actif)) {
        derniereGarde = d.getTime()
        await garderSessions()
        return 'sessions'
      }
      return 'rien'
    } catch (err) {
      journal.erreur('Planificateur : échec', { raison: String((err && err.message) || err) })
      return 'erreur'
    } finally {
      occupe = false
    }
  }

  const minuteur = setInterval(() => { tick() }, intervalleMs)
  if (minuteur.unref) minuteur.unref()
  return { tick, arreter: () => clearInterval(minuteur) }
}

module.exports = { planifier, FENETRE_NUIT_H, CADENCE_SESSIONS_MS }
