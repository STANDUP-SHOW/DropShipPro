'use strict'
/**
 * Le pont du site drop-shipper.fr vers l'application (DESKTOP POWER, 24/10/2026).
 *
 * Exposé SEULEMENT quand la page est le site lui-même : une page tierce ouverte par
 * erreur dans la vue du site n'en voit rien. Le processus principal revérifie
 * l'origine à chaque appel. Aucun accès à Node, des canaux nommés seulement.
 */
const { contextBridge, ipcRenderer } = require('electron')

const lire = (nom) => {
  const a = process.argv.find((x) => x.startsWith(`--${nom}=`))
  return a ? a.slice(nom.length + 3) : ''
}
const site = lire('dropshipper-site')
const version = lire('dropshipper-version')

let estLeSite = false
try {
  estLeSite = Boolean(site) && window.location.origin === new URL(site).origin
} catch {
  estLeSite = false
}

if (estLeSite) {
  const appel = (canal, ...args) => ipcRenderer.invoke(canal, ...args)
  contextBridge.exposeInMainWorld('dropshipperDesktop', {
    version,
    etat: () => appel('power:etat'),
    partager: (url) => appel('power:partager', url),
    importer: (lien) => appel('power:importer', lien),
    capture: (actif) => appel('power:capture', actif),
    panneau: (section) => appel('power:panneau', section),
    accorder: (id) => appel('auto:accorder', id),
    retirerAccord: (id) => appel('auto:retirer', id),
    reprendre: (id) => appel('auto:reprendre', id),
    verifierSession: (id) => appel('power:verifier-session', id),
    navigateur: {
      ouvrir: (options) => appel('nav:ouvrir', options),
      placer: (zone) => appel('nav:placer', zone),
      masquer: () => appel('nav:masquer'),
      aller: (adresse) => appel('nav:aller', adresse),
      retour: () => appel('nav:retour'),
      avancer: () => appel('nav:avancer'),
      recharger: () => appel('nav:recharger'),
      lire: () => appel('nav:lire'),
    },
    surNavigateur: (cb) => {
      const f = (_e, e) => cb(e)
      ipcRenderer.on('nav:etat', f)
      return () => ipcRenderer.removeListener('nav:etat', f)
    },
    surEtat: (cb) => {
      const f = (_e, e) => cb(e)
      ipcRenderer.on('power:etat', f)
      return () => ipcRenderer.removeListener('power:etat', f)
    },
  })

  // Comme l'ancienne barre : un lien glissé sur la fenêtre rejoint la liste à importer, au lieu
  // d'ouvrir la fiche à la place du site. Seulement un lien (pas de fichier), et seulement si la
  // page ne l'a pas déjà pris (zone de dépôt d'image, par exemple).
  const lienGlisse = (e) => {
    const dt = e.dataTransfer
    if (!dt || (dt.files && dt.files.length)) return ''
    const texte = dt.getData('text/uri-list') || dt.getData('text/plain') || ''
    const url = texte.split(/\s+/).find((l) => /^https?:\/\//i.test(l)) || ''
    return url
  }
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('text/uri-list')) e.preventDefault()
  })
  window.addEventListener('drop', (e) => {
    if (e.defaultPrevented) return
    const url = lienGlisse(e)
    if (!url) return
    e.preventDefault()
    appel('power:partager', url)
  })
}
