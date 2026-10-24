'use strict'
const { contextBridge, ipcRenderer, webUtils } = require('electron')

const appeler = (canal) => (arg) => ipcRenderer.invoke(canal, arg)
const CANAUX = ['etat', 'reglages', 'secret', 'credits', 'rayon-test', 'envoyer-au-site', 'nuit-lancer', 'nuit-arreter', 'nuit-auto', 'rayons-nuit', 'admin-creer', 'admin-copier', 'admin-tester', 'admin-utilisateurs', 'admin-newsletter', 'admin-drive-lister', 'admin-drive-importer', 'admin-affiliation', 'admin-affiliation-verser', 'admin-reseaux', 'admin-reseaux-enregistrer', 'admin-mots-cles-essai', 'copier',
  'source-ajouter', 'source-supprimer', 'source-verifier', 'source-garder', 'nav-afficher', 'nav-placer', 'nav-masquer', 'nav-action',
  'depot-ouvrir', 'rapport-ouvrir', 'banc-quitter',
  // KANTIX ANALYSER (0.5.0)
  'cle-enregistrer', 'cle-supprimer', 'cle-tester', 'cle-brief',
  'projet-enregistrer', 'projet-supprimer', 'projet-secret-generer', 'projet-secret-copier', 'projet-flux-tester', 'projet-fiche',
  'dossier-choisir', 'drive-detecter', 'dossier-ouvrir', 'fichier-ouvrir',
  'analyse-enregistrer', 'analyse-supprimer', 'analyse-lancer', 'rapport-envoyer',
  'brief-nouveau', 'brief-charger', 'brief-joindre', 'brief-envoyer',
  'connecteur-activer', 'connecteur-cle']

contextBridge.exposeInMainWorld('poste', {
  ...Object.fromEntries(CANAUX.map((c) => [c.replace(/-([a-z])/g, (_m, l) => l.toUpperCase()), appeler(c)])),
  // path of a file dropped on the brief (the page itself never sees the disk)
  cheminFichier: (fichier) => { try { return webUtils.getPathForFile(fichier) } catch { return '' } },
  sur: (canal, fn) => {
    if (!['etat', 'progression', 'nav'].includes(canal)) return
    ipcRenderer.on(canal, (_e, donnees) => fn(donnees))
  },
})
