'use strict'
/**
 * L'exécuteur de publication : une annonce, une plateforme, du début à la fin.
 *
 * Il ne connaît ni Electron ni le DOM : il pilote un `pilote` (voir
 * pilote-electron.js) qui sait ouvrir le formulaire, le remplir, lire la page
 * pour y chercher un blocage et cliquer « Publier ». C'est ce qui le rend
 * testable sans une seule vraie place de marché.
 *
 * Deux modes, décidés par l'accord du vendeur (lib/plafonds.js) :
 * - **validation** (pas d'accord) : le formulaire est rempli, la fenêtre reste
 *   ouverte, le vendeur relit et publie LUI-MÊME ;
 * - **automatique** (accord donné une fois) : après remplissage COMPLET, l'agent
 *   clique « Publier » et le dit au serveur. Plus aucune validation ensuite.
 *
 * Un agent insiste :
 * - un échec ordinaire (bouton absent, délai dépassé, champ introuvable) est
 *   RETENTÉ (3 essais, pause fixe), puis l'annonce est déclarée en échec avec la
 *   raison et l'agent passe à la suivante ;
 * - un mur anti-robot (captcha, vérification, compte restreint) met la
 *   plateforme en PAUSE de sécurité (6 h, doublée à chaque récidive, 48 h au
 *   plus) puis la RETENTE seul ; il n'est jamais forcé ni contourné, et les
 *   autres plateformes continuent ;
 * - un champ indispensable manquant ne déclenche pas de « Publier » : l'annonce
 *   revient en `a_valider` avec ce qui manque ;
 * - une annonce cliquée n'est JAMAIS rejouée : pas de doublon sur la plateforme.
 */
const plafonds = require('./plafonds')
const { manquants } = require('./adaptateurs')

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms))

/**
 * Une tentative. `etat.clique` passe à vrai dès que « Publier » a réussi : toute
 * erreur après ce point ne doit plus provoquer de nouvel essai.
 */
async function tenter({ api, pilote, plateforme, annonce, config, etat, dossier, maintenant, journal }, suivi) {
  const auto = Boolean(config.accords?.[plateforme])
  const trace = (entree) => plafonds.journaliser(dossier, { plateforme, publication: annonce.id, ...entree }, maintenant)

  if (auto) {
    const d = plafonds.decision({ plateforme, config, journal, etat, maintenant })
    if (!d.ok) return { statut: 'attente', raison: d.raison, attenteMs: d.attenteMs ?? undefined }
  } else {
    const reste = plafonds.pauseRestante(etat, plateforme, maintenant)
    if (reste !== 0) return { statut: 'attente', raison: `Pause de sécurité sur ${plateforme} (${etat.arrets[plateforme].raison}).`, attenteMs: reste ?? undefined }
  }

  const bloquer = async (quand) => {
    const b = plafonds.detecterBlocage(await pilote.lirePage())
    if (!b.bloque) return null
    const raison = `blocage vu ${quand} (« ${b.indice} »)`
    plafonds.ecrireEtat(dossier, plafonds.arreter(plafonds.lireEtat(dossier), plateforme, raison, maintenant))
    trace({ type: 'alerte', raison: b.indice })
    return { statut: 'pause', raison: `${raison} — pause de sécurité, nouvelle tentative automatique plus tard.` }
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
    suivi.clique = true // à partir d'ici, plus jamais de second clic sur cette annonce
    trace({ type: 'publication', produit: annonce.productId, url })

    try {
      const apres = await bloquer('après « Publier »')
      if (apres) {
        // Le clic a eu lieu mais un mur est apparu : impossible de savoir si l'annonce est partie. Ni rejouée
        // (doublon), ni déclarée publiée : le serveur la marque FAILED avec la consigne de vérifier.
        await api.resultat(annonce.id, 'FAILED', 'Résultat incertain : un blocage est apparu juste après « Publier ». Vérifiez sur la plateforme avant de relancer.').catch(() => undefined)
        return { ...apres, url: url || undefined, raison: `Résultat incertain, ${apres.raison}` }
      }
    } catch {
      /* la page a déjà changé : ce n'est pas un échec de publication */
    }
    try {
      await api.resultat(annonce.id, 'PUBLISHED', url)
    } catch (err) {
      return { statut: 'publiee', url: url || undefined, raison: `Publiée, mais le serveur n'a pas pu être informé : ${err.message}` }
    }
    // Une publication réussie prouve que la plateforme nous laisse passer : la pause repart de zéro.
    plafonds.ecrireEtat(dossier, plafonds.reprendre(plafonds.lireEtat(dossier), plateforme))
    return { statut: 'publiee', url: url || undefined }
  } catch (err) {
    trace({ type: 'echec', raison: err.message })
    return { statut: 'echec', raison: err.message }
  }
}

/**
 * @returns {Promise<{statut: 'attente'|'pause'|'a_valider'|'preparee'|'publiee'|'echec', raison?: string, attenteMs?: number, manque?: string[], url?: string, essais?: number}>}
 */
async function traiter(opts) {
  const { essais = 3, pauseEssaiMs = 30_000, dormir = pause, etat: etatEntree, dossier, maintenant = new Date() } = opts
  const suivi = { clique: false }
  let dernier = null
  for (let i = 1; i <= essais; i++) {
    // L'état est relu à chaque essai : une pause posée pendant le précédent doit être vue.
    dernier = await tenter({ ...opts, maintenant, etat: i === 1 ? etatEntree : plafonds.lireEtat(dossier), journal: opts.journal ?? plafonds.lireJournal(dossier) }, suivi)
    if (dernier.statut !== 'echec' || suivi.clique) return { ...dernier, essais: i }
    if (i < essais) await dormir(pauseEssaiMs)
  }
  // Après les essais : le serveur le sait, et l'agent passe à l'annonce suivante.
  if (opts.config.accords?.[opts.plateforme]) {
    await opts.api.resultat(opts.annonce.id, 'FAILED', `Échec de l'application desktop après ${essais} essais : ${dernier.raison}`.slice(0, 400)).catch(() => undefined)
  }
  return { ...dernier, essais }
}

module.exports = { traiter }
