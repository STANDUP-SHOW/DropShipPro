'use strict'
const { contextBridge, ipcRenderer } = require('electron')

const appeler = (canal) => (arg) => ipcRenderer.invoke(canal, arg)
const CANAUX = ['etat', 'reglages', 'secret', 'credits', 'rayon-test', 'envoyer-au-site', 'nuit-lancer', 'nuit-arreter', 'nuit-auto', 'rayons-nuit',
  'source-ajouter', 'source-supprimer', 'source-verifier', 'nav-afficher', 'nav-placer', 'nav-masquer', 'nav-action',
  'depot-ouvrir', 'rapport-ouvrir', 'banc-quitter']

contextBridge.exposeInMainWorld('poste', {
  ...Object.fromEntries(CANAUX.map((c) => [c.replace(/-([a-z])/g, (_m, l) => l.toUpperCase()), appeler(c)])),
  sur: (canal, fn) => {
    if (!['etat', 'progression', 'nav'].includes(canal)) return
    ipcRenderer.on(canal, (_e, donnees) => fn(donnees))
  },
})
