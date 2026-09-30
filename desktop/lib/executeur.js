'use strict'
/**
 * L'exécuteur de publication : une annonce, une plateforme, du début à la fin.
 *
 * Il ne connaît ni Electron ni le DOM : il pilote un `pilote` (voir
 * pilote-electron.js) qui sait ouvrir le formulaire, le remplir, lire la page
 * pour y chercher un blocage et cliquer « Publier ». C'est ce qui le rend
 * testable ici, contre un faux pilote, sans une seule vraie place de marché.
 *
 * Deux modes, décidés par l'accord du vendeur (lib/plafonds.js) :
 * - **validation** (par défaut) : le formulaire est rempli, la fenêtre reste
 *   ouverte, le vendeur relit et publie LUI-MÊME. Rien n'est compté ni envoyé
 *   au serveur : la publication reste PENDING jusqu'à ce qu'il dise « Terminé ».
 * - **automatique** (accord explicite) : après remplissage COMPLET, l'exécuteur
 *   clique « Publier », journalise, et dit au serveur PUBLISHED. Garde-fous à
 *   chaque pas : accord, plafond du jour, espacement, blocage.
 *
 * Règles qui ne se négocient pas :
 * - le premier blocage (captcha, vérification, compte restreint) ARRÊTE la
 *   plateforme, alerte, et ne réessaie pas ;
 * - un champ indispensable manquant ne déclenche JAMAIS un « Publier » : la
 *   main revient au vendeur, avec la liste de ce qui manque ;
 * - aucun hasard, aucune imitation d'un geste humain : le pilote agit comme un
 *   navigateur ordinaire, à intervalle fixe.
 */
const plafonds = require('./plafonds')
const { manquants } = require('./adaptateurs')

/**
 * @returns {Promise<{statut: 'attente'|'arret'|'a_valider'|'preparee'|'publiee'|'echec', raison?: string, attenteMs?: number, manque?: string[], url?: string}>}
 */
async function traiter({ api, pilote, plateforme, annonce, config, etat, dossier, maintenant = new Date(), journal = plafonds.lireJournal(dossier) }) {
  const auto = Boolean(config.accords?.[plateforme])
  const trace = (entree) => plafonds.journaliser(dossier, { plateforme, publication: annonce.id, ...entree }, maintenant)

  if (auto) {
    const d = plafonds.decision({ plateforme, config, journal, etat, maintenant })
    if (!d.ok) {
      return { statut: d.attenteMs === null ? 'arret' : 'attente', raison: d.raison, attenteMs: d.attenteMs ?? undefined }
    }
  } else if (etat.arrets?.[plateforme]) {
    // Même en validation : une plateforme arrêtée pour un blocage n'est pas rouverte par nous.
    return { statut: 'arret', raison: `Plateforme arrêtée (${etat.arrets[plateforme].raison}). Reprenez-la vous-même.` }
  }

  const bloquer = async (quand) => {
    const b = plafonds.detecterBlocage(await pilote.lirePage())
    if (!b.bloque) return null
    const raison = `blocage vu ${quand} (« ${b.indice} »)`
    plafonds.ecrireEtat(dossier, plafonds.arreter(etat, plateforme, raison, maintenant))
    trace({ type: 'alerte', raison: b.indice })
    return { statut: 'arret', raison }
  }

  try {
    await pilote.ouvrir(plateforme)
    let stop = await bloquer('à l’ouverture')
    if (stop) return stop

    const { rempli = [] } = await pilote.remplir(annonce)
    stop = await bloquer('après le remplissage')
    if (stop) return stop

    const manque = manquants(plateforme, rempli)
    if (manque.length) {
      trace({ type: 'a-valider', manque })
      return { statut: 'a_valider', manque, raison: `À compléter par vous : ${manque.join(', ')}.` }
    }

    if (!auto) {
      trace({ type: 'preparee' })
      return { statut: 'preparee', raison: 'Formulaire rempli : relisez, puis publiez vous-même.' }
    }

    const { url = null } = await pilote.publier()
    stop = await bloquer('après « Publier »')
    if (stop) return stop
    // Le compteur du jour ne compte que ce qui est parti : écrit APRÈS le clic réussi.
    trace({ type: 'publication', produit: annonce.productId, url })
    await api.resultat(annonce.id, 'PUBLISHED', url)
    return { statut: 'publiee', url: url || undefined }
  } catch (err) {
    trace({ type: 'echec', raison: err.message })
    if (auto) await api.resultat(annonce.id, 'FAILED', `Échec de l'application desktop : ${err.message}`.slice(0, 400)).catch(() => undefined)
    return { statut: 'echec', raison: err.message }
  }
}

module.exports = { traiter }
