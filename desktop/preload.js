'use strict'
/** Le pont entre l'écran et le processus principal : quelques canaux nommés, rien d'autre. */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  etat: () => ipcRenderer.invoke('etat'),
  poserCle: (cle, apiBase) => ipcRenderer.invoke('cle:poser', { cle, apiBase }),
  retirerCle: () => ipcRenderer.invoke('cle:retirer'),
  ouvrirLien: (id) => ipcRenderer.invoke('lien:ouvrir', id),
  lienTermine: (id) => ipcRenderer.invoke('lien:termine', id),
  ouvrirSession: (id) => ipcRenderer.invoke('session:ouvrir', id),
  accorder: (id) => ipcRenderer.invoke('auto:accorder', id),
  retirerAccord: (id) => ipcRenderer.invoke('auto:retirer', id),
  reprendre: (id) => ipcRenderer.invoke('auto:reprendre', id),
  preparerAnnonce: (id) => ipcRenderer.invoke('annonce:preparer', id),
  annonceTerminee: (id, reussi) => ipcRenderer.invoke('annonce:terminee', { id, reussi }),
  regerReseaux: (actif) => ipcRenderer.invoke('circuit:reseaux', actif),
  plafondImports: (n) => ipcRenderer.invoke('circuit:plafond', n),
  margeMin: (n) => ipcRenderer.invoke('circuit:marge', n),
  choisirRayons: (liste) => ipcRenderer.invoke('circuit:rayons', liste),
  regerCircuit: (actif) => ipcRenderer.invoke('circuit:regler', actif),
  surEtat: (cb) => ipcRenderer.on('etat', (_e, e) => cb(e)),
})
