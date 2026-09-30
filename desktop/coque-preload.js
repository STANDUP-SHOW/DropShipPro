'use strict'
/** Le pont de la barre de gauche : navigation, partage d'un lien, capture du presse-papiers. */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('coque', {
  etat: () => ipcRenderer.invoke('coque:etat'),
  naviguer: (ou) => ipcRenderer.invoke('coque:naviguer', ou),
  partager: (url) => ipcRenderer.invoke('coque:partager', url),
  capture: (actif) => ipcRenderer.invoke('coque:capture', actif),
  surEtat: (cb) => ipcRenderer.on('coque', (_e, e) => cb(e)),
})
