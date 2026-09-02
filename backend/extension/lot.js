/**
 * La liste d'import groupé, dans le panneau latéral.
 *
 * **Pourquoi elle existe.** L'import en lot par adresse ne marchera jamais sur
 * AliExpress, Temu ou Shein : ces fiches n'ont ni prix ni variantes tant que le
 * navigateur ne les a pas construites. Sondé le 02/09/2026 — la page répond 200
 * avec le titre et treize photos, et aucun prix nulle part. Un serveur n'y verra
 * jamais rien de plus.
 *
 * La seule voie est donc celle-ci : le vendeur navigue de fiche en fiche, le
 * panneau reste ouvert à côté, et chaque « Ajouter » **relève la page pendant
 * qu'elle est affichée**. L'import n'envoie ensuite que des fiches déjà lues —
 * il ne dépend plus d'aucune page.
 *
 * **Ce qui est assumé, et écrit à l'écran.** Le lot applique la marge
 * automatique et prend les photos dans l'ordre du classement, sans demander.
 * Sur vingt-cinq produits, ouvrir vingt-cinq sélecteurs de photos n'est pas un
 * lot. Le vendeur reprend prix et photos annonce par annonce ensuite — c'est le
 * marché, il doit le connaître avant de cliquer, pas après.
 */

/** Vingt-cinq, comme l'import en lot par adresse : au-delà, plus personne ne relit. */
const MAX_LOT = 25

/** La clé de rangement. Le panneau se ferme, la liste reste. */
const CLE = 'listeImport'

function echapperTexte(texte) {
  const d = document.createElement('div')
  d.textContent = texte ?? ''
  return d.innerHTML
}

async function lireListe() {
  const { [CLE]: liste = [] } = await chrome.storage.local.get(CLE)
  return Array.isArray(liste) ? liste : []
}

async function ecrireListe(liste) {
  await chrome.storage.local.set({ [CLE]: liste })
}

/**
 * Rend la liste, ses vignettes dépliables et le bouton d'import.
 *
 * `hote` est l'élément où écrire ; `surRetour` ramène au panneau normal.
 */
async function montrerLot(hote, surRetour) {
  let liste = await lireListe()
  let occupe = false

  function dessiner(message) {
    hote.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <button id="lot-retour" class="ghost" style="padding:4px 8px">‹ Retour</button>
        <b style="font-size:13px">Liste d'import groupé</b>
        <span class="muted" style="margin-left:auto">${liste.length} / ${MAX_LOT}</span>
      </div>

      <button class="primary" id="lot-ajouter" ${liste.length >= MAX_LOT ? 'disabled' : ''}>
        + Ajouter le produit de cet onglet
      </button>
      <p class="muted" style="margin-top:4px">
        Ouvrez une fiche produit dans un onglet, revenez ici, ajoutez. Le panneau
        reste ouvert pendant que vous naviguez.
      </p>

      ${message ? `<p class="${message.erreur ? 'error' : 'muted'}" style="margin-top:8px">${echapperTexte(message.texte)}</p>` : ''}

      <div id="lot-liste" style="margin-top:12px"></div>

      ${
        liste.length
          ? `<div style="position:sticky;bottom:0;background:linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,.96) 30%);padding-top:12px;margin-top:12px">
               <div style="border:1px solid rgba(240,168,30,.45);background:rgba(240,168,30,.08);border-radius:9px;padding:9px;font-size:11px;line-height:1.45;color:#fde68a">
                 <b>Avant d'importer.</b> Ces ${liste.length} produit(s) iront
                 directement dans votre liste d'annonces, avec la
                 <b>marge automatique</b> appliquée en l'état : contrôlez vos prix
                 de revente après l'import. Les photos sont prises dans l'ordre
                 trouvé sur la page, sans sélection — reprenez-les annonce par
                 annonce.
               </div>
               <button class="primary" id="lot-importer" style="margin-top:8px">
                 Importer les ${liste.length} produit(s)
               </button>
               <p class="link" id="lot-vider" style="margin-top:6px;text-align:center">Vider la liste</p>
             </div>`
          : '<p class="muted" style="margin-top:12px">La liste est vide.</p>'
      }
    `

    const contenant = hote.querySelector('#lot-liste')
    liste.forEach((entree, index) => {
      const bloc = document.createElement('div')
      bloc.className = 'product'
      bloc.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px">
          <button class="ghost lot-plier" data-index="${index}" style="padding:2px 6px">▸</button>
          <span class="product-title" style="flex:1;min-width:0">${echapperTexte(entree.titre)}</span>
          <span class="price">${entree.prix ? `${entree.prix} ${echapperTexte(entree.devise || '')}` : '—'}</span>
          <button class="ghost lot-retirer" data-index="${index}" style="padding:2px 6px">✕</button>
        </div>
        <div class="lot-detail" data-index="${index}" style="display:none;margin-top:7px">
          ${
            entree.images?.length
              ? `<div style="display:flex;gap:4px;overflow-x:auto">${entree.images
                  .slice(0, 8)
                  .map(
                    (u) =>
                      `<img src="${echapperTexte(u)}" style="width:52px;height:52px;object-fit:cover;border-radius:5px;flex-shrink:0" />`,
                  )
                  .join('')}</div>`
              : '<p class="muted">Aucune photo relevée.</p>'
          }
          <p class="muted" style="margin-top:5px;word-break:break-all">${echapperTexte(entree.url)}</p>
          <p class="muted">${entree.images?.length ?? 0} photo(s) · ${entree.nbOptions ?? 0} option(s)</p>
        </div>`
      contenant.appendChild(bloc)
    })

    brancher()
  }

  function brancher() {
    hote.querySelector('#lot-retour').addEventListener('click', surRetour)

    hote.querySelectorAll('.lot-plier').forEach((b) =>
      b.addEventListener('click', () => {
        const detail = hote.querySelector(`.lot-detail[data-index="${b.dataset.index}"]`)
        const ouvert = detail.style.display !== 'none'
        detail.style.display = ouvert ? 'none' : 'block'
        b.textContent = ouvert ? '▸' : '▾'
      }),
    )

    hote.querySelectorAll('.lot-retirer').forEach((b) =>
      b.addEventListener('click', async () => {
        liste = liste.filter((_, i) => i !== Number(b.dataset.index))
        await ecrireListe(liste)
        dessiner()
      }),
    )

    hote.querySelector('#lot-ajouter').addEventListener('click', ajouter)
    hote.querySelector('#lot-importer')?.addEventListener('click', importer)
    hote.querySelector('#lot-vider')?.addEventListener('click', async () => {
      liste = []
      await ecrireListe(liste)
      dessiner()
    })
  }

  /** Relève la fiche de l'onglet actif et l'ajoute. */
  async function ajouter() {
    if (occupe) return
    occupe = true
    const bouton = hote.querySelector('#lot-ajouter')
    bouton.disabled = true
    bouton.textContent = 'Lecture de la fiche…'

    try {
      const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!onglet?.id || !onglet.url?.startsWith('http')) {
        return dessiner({ erreur: true, texte: "Cet onglet n'est pas une page marchande." })
      }

      /*
       * Le doublon est refusé avant la lecture, pas après.
       *
       * Relever la page prend quelques secondes : découvrir ensuite que le
       * produit y était déjà donnerait l'impression d'un ajout qui a échoué.
       */
      const propre = onglet.url.split('#')[0]
      if (liste.some((e) => e.url.split('#')[0] === propre)) {
        return dessiner({ texte: 'Ce produit est déjà dans la liste.' })
      }

      const reponse = await chrome.runtime.sendMessage({
        type: 'dsp-relever-onglet',
        tabId: onglet.id,
      })
      if (!reponse?.ok) {
        return dessiner({ erreur: true, texte: reponse?.error || 'Fiche non reconnue sur cette page.' })
      }

      const p = reponse.payload
      liste = [
        ...liste,
        {
          url: p.sourceUrl,
          titre: p.title,
          prix: p.price,
          devise: p.currency,
          images: p.images ?? [],
          nbOptions: Object.keys(p.variants ?? {}).length,
          // La charge complète voyage avec l'entrée : c'est elle qui sera
          // envoyée à l'import, la page ne sera plus relue.
          payload: p,
        },
      ]
      await ecrireListe(liste)
      dessiner({ texte: `« ${p.title.slice(0, 40)} » ajouté.` })
    } catch (e) {
      dessiner({ erreur: true, texte: e?.message || 'Ajout impossible' })
    } finally {
      occupe = false
    }
  }

  /**
   * Envoie les fiches relevées, une par une.
   *
   * **Une requête par produit**, comme l'import en lot par adresse : un import
   * prend trente à soixante secondes, et vingt-cinq dans une seule requête
   * dépassent tous les délais de proxy — la connexion tombe pendant que le
   * serveur continue. C'est la panne corrigée le 02/09/2026 côté site, et il
   * n'y a aucune raison de la refaire ici.
   */
  async function importer() {
    if (occupe) return
    occupe = true
    const bouton = hote.querySelector('#lot-importer')
    bouton.disabled = true

    const echecs = []
    let faits = 0

    for (const [i, entree] of liste.entries()) {
      bouton.textContent = `Import ${i + 1} sur ${liste.length}…`
      try {
        await apiFetch('/api/products/capture', { method: 'POST', body: entree.payload })
        faits++
      } catch (e) {
        echecs.push({ ...entree, raison: e?.message || 'Échec' })
      }
    }

    // Seuls les échecs restent : le vendeur relance sans retrier à la main ce
    // qui est déjà passé.
    liste = echecs.map(({ raison, ...reste }) => reste)
    await ecrireListe(liste)
    occupe = false

    dessiner({
      erreur: echecs.length > 0,
      texte: echecs.length
        ? `${faits} importé(s), ${echecs.length} en échec : ${echecs[0].raison}`
        : `${faits} produit(s) importé(s). Contrôlez vos prix de revente dans « Mes annonces ».`,
    })
  }

  dessiner()
}
