/**
 * La file d'import, dans le panneau latéral.
 *
 * **D'où viennent les lignes.** Le site les y dépose : depuis un rapport
 * d'analyse, un catalogue fournisseur ou une liste de produits gagnants, le
 * vendeur clique « Envoyer à l'extension » (`POST /api/market-reports/file`).
 * Ce sont surtout des fiches que notre serveur ne sait pas lire — AliExpress,
 * Temu, Shein, construites en JavaScript.
 *
 * **Ce que fait « Importer ».** Pour chaque ligne : l'extension ouvre la fiche
 * dans un onglet, la relève comme le bouton de la page le ferait, ferme
 * l'onglet, puis envoie la fiche à la même route d'import que tout le reste
 * (`/api/products/capture`). Il n'y a pas de second circuit : la ligne porte
 * son `fileId`, et c'est l'import lui-même qui la marque importée.
 *
 * Le tarif est celui de l'import : une ligne seule part à l'unité (réécriture
 * immédiate), « Tout importer » part en lot (réécriture différée, moins cher).
 * Les deux prix viennent du serveur, jamais d'ici.
 */

const ETATS_FILE = {
  EN_ATTENTE: { libelle: 'En attente', couleur: '#B8C0D0' },
  RELEVE: { libelle: 'En cours', couleur: '#f28a4b' },
  IMPORTE: { libelle: 'Importé', couleur: '#4ade80' },
  ECHEC: { libelle: 'Refusé', couleur: '#fca5a5' },
}

/** Une ligne qu'on peut (re)lancer : tout sauf ce qui est déjà importé. */
function aImporter(ligne) {
  return ligne.status !== 'IMPORTE'
}

function echapperFile(texte) {
  const d = document.createElement('div')
  d.textContent = texte ?? ''
  return d.innerHTML
}

function origineDe(url) {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** Le message du navigateur, traduit en ce que le vendeur peut faire. */
function motifLisible(message) {
  const m = String(message || '')
  if (/Cannot access|permission|Missing host/i.test(m)) {
    return "L'extension n'est pas autorisée sur ce site : relancez et acceptez l'autorisation demandée."
  }
  if (/Receiving end does not exist|Could not establish connection/i.test(m)) {
    return "La page n'a pas répondu à l'extension. Ouvrez-la une fois, puis relancez."
  }
  return m || 'Relevé impossible'
}

/**
 * Rend la file et ses boutons.
 *
 * `hote` est l'élément où écrire ; `surRetour` ramène au panneau normal.
 */
async function montrerFile(hote, surRetour) {
  let lignes = []
  let occupe = false
  let message = null
  /** L'id de la ligne en cours de relevé, pour l'afficher pendant le travail. */
  let enCours = null

  async function charger() {
    try {
      lignes = await apiFetch('/api/market-reports/file')
    } catch (e) {
      message = { erreur: true, texte: e?.message || 'File illisible' }
    }
  }

  function dessiner() {
    const restantes = lignes.filter(aImporter)
    hote.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <button id="file-retour" class="ghost" style="padding:4px 8px">‹ Retour</button>
        <b style="font-size:13px">File d'import</b>
        <span class="muted" style="margin-left:auto">${restantes.length} à importer</span>
      </div>
      <p class="muted" style="margin:0 0 8px">
        Les fiches envoyées depuis le site. « Importer » ouvre chaque fiche dans un
        onglet, la lit puis la referme : laissez la fenêtre faire.
      </p>
      ${message ? `<p class="${message.erreur ? 'error' : 'muted'}" style="margin:6px 0">${echapperFile(message.texte)}</p>` : ''}
      ${
        restantes.length > 1
          ? `<button class="primary wide" id="file-tout" ${occupe ? 'disabled' : ''}>
               Tout importer en lot (${restantes.length})
             </button>
             <p class="muted" style="margin:4px 0 10px">
               En lot, la réécriture est différée et l'annonce coûte moins cher ;
               la marge automatique et l'ordre des photos s'appliquent sans demander.
             </p>`
          : ''
      }
      <div id="file-liste"></div>
      ${lignes.length ? '' : '<p class="muted" style="margin-top:12px">La file est vide. Envoyez des fiches depuis un rapport ou un catalogue du site.</p>'}
    `

    const contenant = hote.querySelector('#file-liste')
    for (const ligne of lignes) {
      const etat = ligne.id === enCours ? ETATS_FILE.RELEVE : (ETATS_FILE[ligne.status] ?? ETATS_FILE.EN_ATTENTE)
      const bloc = document.createElement('div')
      bloc.className = 'card'
      bloc.style.display = 'block'
      bloc.innerHTML = `
        <div class="title">${echapperFile(ligne.titre || ligne.url)}</div>
        <div class="muted" style="word-break:break-all">${echapperFile(ligne.fournisseur ? `${ligne.fournisseur} · ` : '')}${echapperFile(origineDe(ligne.url) ?? ligne.url)}</div>
        <div style="margin-top:4px;font-size:11.5px;font-weight:600;color:${etat.couleur}">${etat.libelle}</div>
        ${ligne.status === 'ECHEC' && ligne.erreur ? `<div class="error" style="margin-top:2px">${echapperFile(ligne.erreur)}</div>` : ''}
        <div class="row">
          ${
            ligne.status === 'IMPORTE' && ligne.productId
              ? `<button class="primary" data-voir="${echapperFile(ligne.productId)}">Voir l'annonce</button>`
              : `<button class="primary" data-importer="${echapperFile(ligne.id)}" ${occupe ? 'disabled' : ''}>${
                  ligne.status === 'ECHEC' || ligne.status === 'RELEVE' ? 'Réessayer' : 'Importer'
                }</button>`
          }
          ${ligne.status === 'RELEVE' || ligne.id === enCours ? '' : `<button data-retirer="${echapperFile(ligne.id)}" ${occupe ? 'disabled' : ''}>Retirer</button>`}
        </div>`
      contenant.appendChild(bloc)
    }

    hote.querySelector('#file-retour').addEventListener('click', surRetour)
    hote.querySelector('#file-tout')?.addEventListener('click', () => lancer(lignes.filter(aImporter), true))
    hote.querySelectorAll('button[data-importer]').forEach((b) =>
      b.addEventListener('click', () => lancer(lignes.filter((l) => l.id === b.dataset.importer), false)),
    )
    hote.querySelectorAll('button[data-voir]').forEach((b) =>
      b.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'dsp-open-product', productId: b.dataset.voir })),
    )
    hote.querySelectorAll('button[data-retirer]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (occupe) return
        try {
          await apiFetch(`/api/market-reports/file/${encodeURIComponent(b.dataset.retirer)}`, { method: 'DELETE' })
          lignes = lignes.filter((l) => l.id !== b.dataset.retirer)
          message = null
        } catch (e) {
          message = { erreur: true, texte: e?.message || 'Retrait impossible' }
        }
        dessiner()
      }),
    )
  }

  /**
   * Importe les lignes données, une par une.
   *
   * L'autorisation des sites est demandée EN PREMIER, avant tout `await` :
   * Chrome n'ouvre la fenêtre d'autorisation que dans le prolongement direct
   * du clic. Un site déjà autorisé ne redemande rien.
   */
  async function lancer(choix, enLot) {
    if (occupe || !choix.length) return
    const origines = [...new Set(choix.map((l) => origineDe(l.url)).filter(Boolean))].map((o) => `${o}/*`)
    const autorisation = chrome.permissions.request({ origins: origines }).catch(() => false)

    occupe = true
    message = null
    dessiner()
    await autorisation

    let faits = 0
    let refus = 0
    for (const [i, ligne] of choix.entries()) {
      enCours = ligne.id
      message = { texte: `Import ${i + 1} sur ${choix.length}…` }
      dessiner()
      const issue = await importerLigne(ligne, enLot)
      if (issue.ok) faits++
      else refus++
    }
    enCours = null
    occupe = false
    await charger()
    message = {
      erreur: refus > 0,
      texte: refus
        ? `${faits} importé(s), ${refus} refusé(s) : le motif est sous chaque ligne.`
        : `${faits} produit(s) importé(s). Contrôlez vos prix de revente dans « Mes annonces ».`,
    }
    dessiner()
  }

  /** Relève une ligne puis l'envoie à l'import ; l'état est écrit côté serveur dans les deux cas. */
  async function importerLigne(ligne, enLot) {
    const id = encodeURIComponent(ligne.id)
    try {
      await apiFetch(`/api/market-reports/file/${id}/releve`, { method: 'POST' })
    } catch (e) {
      // Ligne déjà importée ou retirée ailleurs : rien à faire ici.
      return { ok: false, erreur: e?.message }
    }

    let releve
    try {
      releve = await chrome.runtime.sendMessage({ type: 'dsp-relever-adresse', url: ligne.url })
    } catch (e) {
      releve = { ok: false, error: e?.message }
    }
    if (!releve?.ok) {
      const motif = motifLisible(releve?.error)
      await apiFetch(`/api/market-reports/file/${id}/echec`, { method: 'POST', body: { erreur: motif } }).catch(
        () => undefined,
      )
      return { ok: false, erreur: motif }
    }

    try {
      // Succès comme refus sont notés par la route d'import grâce au `fileId`.
      await apiFetch('/api/products/capture', {
        method: 'POST',
        body: { ...releve.payload, fileId: ligne.id, ...(enLot ? { differer: true } : {}) },
      })
      return { ok: true }
    } catch (e) {
      // Une erreur avant la route (réseau, session) ne l'a pas atteinte : on la note ici.
      await apiFetch(`/api/market-reports/file/${id}/echec`, {
        method: 'POST',
        body: { erreur: (e?.message || "L'import n'a pas abouti.").slice(0, 300) },
      }).catch(() => undefined)
      return { ok: false, erreur: e?.message }
    }
  }

  hote.innerHTML = '<p class="muted">Chargement de la file…</p>'
  await charger()
  dessiner()
}
