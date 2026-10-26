'use strict'
/* KANTIX ANALYSER screens (0.5.0): projects, analyses with the brief, browser tabs, API keys, connectors.
   Loaded after app.js and uses its helpers (h, appel, etat, rendre, aller, pastille, flash). Data goes in with textContent only. */

const kx = {
  projet: null, // id being edited, 'nouveau', or null
  analyse: null, // id being edited, 'nouvelle', or null
  brouillon: null, // analysis form being edited
  brief: null, // { brief, prompt }
  pieces: [], // paths waiting to be sent with the next brief message
  briefEnCours: false,
  ajoutOnglet: false,
  cleTest: {}, // id -> { modeles, nonListable, erreur }
  driveTrouves: null,
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const STATUTS = { ok: ['validé', 'bon'], 'a-revoir': ['à revoir', 'alerte'], erreur: ['échec', 'mauvais'] }
const pastilleStatut = (s) => (s ? pastille((STATUTS[s] || [s])[0], (STATUTS[s] || [])[1] || '') : pastille('jamais lancée', ''))
const nomCle = (id) => { const c = etat.kantix.cles.find((x) => x.id === id); return c ? c.nom : null }
const nomFournisseur = (id) => { const f = etat.kantix.fournisseurs.find((x) => x.id === id); return f ? f.nom : id }

async function appelEtat(nom, arg, message) {
  const r = await appel(nom, arg)
  if (r && r.annule) return r
  const e = r && (r.etat || (r.kantix ? r : null))
  if (e) etat = e
  if (r && message) messageFlash = message
  rendre()
  return r
}

// ---------------------------------------------------------------- folder picker (local or Google Drive for desktop)
function champDossier(valeur, surChange, { titre, vide } = {}) {
  const d = valeur || { type: 'local', chemin: '' }
  const chemin = h('input', { value: d.chemin || '', placeholder: vide || 'C:\\…', oninput: (ev) => surChange({ ...d, chemin: ev.target.value }) })
  const type = h('select', { onchange: (ev) => { surChange({ ...d, type: ev.target.value }); rendre() } },
    h('option', { value: 'local', selected: d.type !== 'drive' }, 'Dossier local'),
    h('option', { value: 'drive', selected: d.type === 'drive' }, 'Google Drive (Drive pour ordinateur)'))
  return h('div', {},
    h('label', {}, titre || 'Dossier'),
    h('div', { class: 'ligne' },
      h('div', { style: 'width:240px' }, type),
      h('div', { style: 'flex:1;min-width:220px' }, chemin),
      h('button', { class: 'btn', onclick: async () => { const x = await appel('dossierChoisir', { titre: titre || 'Choisir le dossier', depart: d.chemin || undefined }); if (x) { surChange({ ...d, chemin: x }); rendre() } } }, 'Choisir…'),
      d.type === 'drive' && h('button', { class: 'btn', onclick: async () => { kx.driveTrouves = (await appel('driveDetecter')) || []; rendre() } }, 'Trouver mon Drive'),
    ),
    d.type === 'drive' && kx.driveTrouves && (kx.driveTrouves.length
      ? h('div', { class: 'ligne petit' }, 'Drive trouvé : ', kx.driveTrouves.map((c) => h('button', { class: 'btn', onclick: () => { surChange({ ...d, chemin: `${c}\\KANTIX` }); kx.driveTrouves = null; rendre() } }, c)))
      : h('p', { class: 'petit erreur' }, 'Google Drive pour ordinateur n’est pas trouvé sur ce PC. Installez-le (gratuit, google.com/drive/download), connectez-vous, puis réessayez ; ou choisissez le dossier à la main.')),
    d.type === 'drive' && h('p', { class: 'petit doux' }, 'Le Drive apparaît comme un dossier sur ce PC : KANTIX y écrit, Drive synchronise seul. Aucune autorisation Google à donner à KANTIX.'),
  )
}

// ---------------------------------------------------------------- Projets
function vueProjets() {
  const k = etat.kantix
  if (kx.projet) return vueProjetEdition()
  return h('div', {},
    h('div', { class: 'ligne entete' }, h('h1', {}, 'Projets'), h('button', { class: 'btn principal', onclick: () => { kx.projet = 'nouveau'; kx.brouillonProjet = { nom: '', url: '', cleId: '', dossier: { type: 'local', chemin: '' }, flux: { adresse: '' } }; rendre() } }, '+ Créer un projet')),
    h('p', { class: 'doux' }, 'Un projet = un site qui reçoit des analyses : sa clé IA, son dossier, son flux.'),
    messageFlash && h('p', { class: 'petit' }, messageFlash),
    k.projets.length === 0 ? h('div', { class: 'carte' }, 'Aucun projet. Créez le premier (DropShipper, iAgents, Jobber+…).') : null,
    h('div', { class: 'grille' }, k.projets.map((p) => {
      const n = k.analyses.filter((a) => a.projetId === p.id).length
      return h('div', { class: 'carte cliquable', onclick: () => { kx.projet = p.id; kx.brouillonProjet = JSON.parse(JSON.stringify(p)); rendre() } },
        h('h2', {}, p.nom, ' ', p.connecteur ? pastille('connecteur DropShipper', '') : null),
        h('div', { class: 'petit doux' }, p.url || 'pas d’adresse de site'),
        h('div', { class: 'petit' }, 'Clé IA : ', p.cleId ? nomCle(p.cleId) || '?' : pastille('aucune', 'mauvais')),
        h('div', { class: 'petit' }, 'Flux : ', p.flux.adresse ? (p.secretFlux ? (p.fluxVerifieLe ? pastille('testé ' + fmtDate(p.fluxVerifieLe), 'bon') : pastille('jamais testé', 'alerte')) : pastille('secret à générer', 'alerte')) : pastille('dossier seulement', '')),
        h('div', { class: 'petit doux' }, `${n} analyse${n > 1 ? 's' : ''} · ${p.dossierEffectif}`),
      )
    })),
  )
}

function vueProjetEdition() {
  const k = etat.kantix
  const b = kx.brouillonProjet
  const existant = k.projets.find((p) => p.id === kx.projet)
  const set = (champ) => (ev) => { b[champ] = ev.target.value }
  const suggestion = b.url ? `${b.url.replace(/\/$/, '')}/api/kantix/flux` : ''
  return h('div', {},
    h('div', { class: 'ligne entete' }, h('button', { class: 'btn', onclick: () => { kx.projet = null; messageFlash = ''; rendre() } }, '← Projets'), h('h1', {}, existant ? existant.nom : 'Nouveau projet')),
    h('div', { class: 'carte' },
      h('label', {}, 'Nom du site'), h('input', { value: b.nom, oninput: set('nom'), placeholder: 'Ex. iAgents' }),
      h('label', {}, 'Adresse du site'), h('input', { value: b.url, oninput: set('url'), placeholder: 'https://…' }),
      h('label', {}, 'Clé API utilisée pour ce projet (moteur de ses analyses)'),
      h('select', { onchange: set('cleId') }, h('option', { value: '' }, k.cles.length ? '— choisir —' : 'aucune clé enregistrée'), k.cles.map((c) => h('option', { value: c.id, selected: c.id === b.cleId }, `${c.nom} · ${nomFournisseur(c.fournisseur)}${c.modele ? ' · ' + c.modele : ''}`))),
      k.cles.length === 0 && h('p', { class: 'petit' }, 'Aucune clé : ', h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); aller('cles') } }, 'ajoutez-en une dans « Clés API »'), '.'),
      champDossier(b.dossier, (d) => { b.dossier = d }, { titre: 'Dossier partagé du projet (rapports .md et .json)', vide: existant ? existant.dossierEffectif : 'vide = dans le dossier de données de KANTIX' }),
    ),
    h('div', { class: 'carte' },
      h('h2', {}, 'Flux vers le site'),
      h('p', { class: 'petit doux' }, 'À chaque rapport validé, KANTIX l’envoie au site (POST signé avec le secret du projet). Le site doit savoir le recevoir : la fiche technique dit tout au développeur. Sans adresse, les rapports vont seulement dans le dossier.'),
      h('label', {}, 'Adresse de réception sur le site'),
      h('div', { class: 'ligne' },
        h('div', { style: 'flex:1;min-width:260px' }, h('input', { value: b.flux.adresse, oninput: (ev) => { b.flux.adresse = ev.target.value }, placeholder: suggestion || 'https://monsite/api/kantix/flux' })),
        suggestion && !b.flux.adresse && h('button', { class: 'btn', onclick: () => { b.flux.adresse = suggestion; rendre() } }, 'Proposer l’adresse'),
      ),
      existant && h('div', { class: 'ligne', style: 'margin-top:10px' },
        pastille(existant.secretFlux ? 'secret généré' : 'pas de secret', existant.secretFlux ? 'bon' : 'alerte'),
        h('button', { class: 'btn', onclick: () => appelEtat('projetSecretGenerer', existant.id, 'Secret généré : copiez-le pour le site.') }, existant.secretFlux ? 'Remplacer le secret' : 'Générer le secret'),
        existant.secretFlux && h('button', { class: 'btn', onclick: async () => { if (await appel('projetSecretCopier', existant.id)) flash('Secret copié dans le presse-papiers (il n’est affiché nulle part).') } }, 'Copier le secret'),
        existant.secretFlux && existant.flux.adresse && h('button', { class: 'btn', onclick: async () => { flash('Envoi du test…'); const r = await appelEtat('projetFluxTester', existant.id); if (r && r.statut) flash(`Le site a répondu ${r.statut} : flux opérationnel.`) } }, 'Tester le flux'),
        h('button', { class: 'btn', onclick: async () => { const f = await appel('projetFiche', existant.id); if (f) flash(`Fiche écrite : ${f}`) } }, 'Fiche pour le développeur du site'),
      ),
      !existant && h('p', { class: 'petit doux' }, 'Le secret se génère une fois le projet enregistré.'),
    ),
    messageFlash && h('p', { class: 'petit' }, messageFlash),
    h('div', { class: 'ligne' },
      h('button', { class: 'btn principal', onclick: async () => {
        const r = await appel('projetEnregistrer', { ...b, id: existant ? existant.id : undefined })
        if (r) { etat = r; const p = r.kantix.projets.find((x) => x.nom === b.nom.trim()); kx.projet = p ? p.id : null; kx.brouillonProjet = p ? JSON.parse(JSON.stringify(p)) : null; flash('Projet enregistré.') }
      } }, 'Enregistrer le projet'),
      existant && !existant.connecteur && h('button', { class: 'btn danger', onclick: async () => { const r = await appel('projetSupprimer', existant.id); if (r) { etat = r; if (!r.kantix.projets.some((p) => p.id === existant.id)) kx.projet = null; rendre() } } }, 'Supprimer'),
      existant && h('button', { class: 'btn', onclick: () => appel('dossierOuvrir', existant.dossierEffectif) }, 'Ouvrir le dossier'),
    ),
  )
}

// ---------------------------------------------------------------- Analyses
function nouvelleAnalyse() {
  const p = etat.kantix.projets[0]
  return { nom: '', projetId: p ? p.id : '', prompt: '', quand: 'aucune', heure: '00:00', jour: 1, dossier: null, rechercheWeb: true, onglets: [], briefId: null }
}

function versBrouillon(a) {
  return { id: a.id, nom: a.nom, projetId: a.projetId, prompt: a.prompt, quand: a.recurrence.type, heure: a.recurrence.heure || '00:00', jour: a.recurrence.jour === undefined ? 1 : a.recurrence.jour, dossier: a.dossier, rechercheWeb: a.rechercheWeb, onglets: [...a.onglets], briefId: a.briefId }
}

async function ouvrirAnalyse(id) {
  kx.analyse = id
  const a = id === 'nouvelle' ? null : etat.kantix.analyses.find((x) => x.id === id)
  kx.brouillon = a ? versBrouillon(a) : nouvelleAnalyse()
  kx.brief = null
  kx.pieces = []
  messageFlash = ''
  if (kx.brouillon.briefId) kx.brief = await appel('briefCharger', kx.brouillon.briefId)
  rendre()
}

function vueAnalyses() {
  if (kx.analyse) return vueAnalyseEdition()
  const k = etat.kantix
  const ds = k.connecteurs.dropshipper && k.connecteurs.dropshipper.actif
  return h('div', {},
    h('div', { class: 'ligne entete' }, h('h1', {}, 'Analyses'), h('button', { class: 'btn principal', disabled: !k.projets.length, onclick: () => ouvrirAnalyse('nouvelle') }, '+ Créer une analyse')),
    !k.projets.length && h('p', {}, 'Créez d’abord un projet : chaque analyse alimente le flux d’un projet.'),
    k.enCours && h('div', { class: 'carte' }, h('strong', {}, 'En cours : '), k.enCours.nom, h('span', { class: 'petit doux' }, ` depuis ${fmtDate(k.enCours.debut)}`)),
    messageFlash && h('p', { class: 'petit' }, messageFlash),
    h('div', { class: 'grille' },
      ds && h('div', { class: 'carte' },
        h('h2', {}, 'DropShipper MarketSpy ', pastille('connecteur', '')),
        h('div', { class: 'petit doux' }, '24 rayons × 7 thèmes, rapports rayon et marketing envoyés au site.'),
        h('p', {}, h('button', { class: 'btn', onclick: () => aller('accueil') }, 'Ouvrir le tableau de bord DropShipper')),
      ),
      k.analyses.map((a) => {
        const p = k.projets.find((x) => x.id === a.projetId)
        return h('div', { class: 'carte' },
          h('h2', {}, a.nom),
          h('div', { class: 'petit doux' }, `${p ? p.nom : 'projet supprimé'} · ${a.quand}${a.prochaine ? ' · prochaine : ' + fmtDate(a.prochaine) : ''}`),
          h('div', { class: 'petit' }, 'Dernière : ', a.derniere ? pastilleStatut(a.derniere.statut) : pastilleStatut(null), a.derniere ? ` ${fmtDate(a.derniere.le)}` : '', a.enFile ? ' · en file' : ''),
          h('div', { class: 'ligne', style: 'margin-top:8px' },
            h('button', { class: 'btn', disabled: Boolean(a.enFile || (k.enCours && k.enCours.analyseId === a.id)), onclick: () => appelEtat('analyseLancer', a.id, 'Analyse lancée : suivez-la ici et dans le journal.') }, 'Lancer maintenant'),
            h('button', { class: 'btn', onclick: () => ouvrirAnalyse(a.id) }, 'Modifier'),
            a.derniere && a.derniere.fichier && h('button', { class: 'btn', onclick: () => appel('fichierOuvrir', a.derniere.fichier) }, 'Ouvrir le rapport'),
          ),
        )
      }),
    ),
    vueHistorique(),
  )
}

function vueHistorique() {
  const l = etat.kantix.historique
  if (!l.length) return null
  const flux = (f) => !f ? '—' : f.statut === 'envoye' ? pastille('reçu par le site', 'bon') : f.statut === 'echec' ? pastille('refusé', 'mauvais') : f.statut === 'retenu' ? pastille('retenu', 'alerte') : pastille('dossier seulement', '')
  return h('div', { class: 'carte' },
    h('h2', {}, 'Rapports effectués et échecs'),
    h('table', {}, h('thead', {}, h('tr', {}, ['Quand', 'Analyse', 'Statut', 'Flux', 'Moteur', 'Jetons', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, l.map((x) => h('tr', {},
        h('td', {}, fmtDate(x.debut), h('div', { class: 'petit doux' }, x.origine || '')),
        h('td', {}, x.analyse),
        h('td', {}, pastilleStatut(x.statut), ...(x.problemes || []).slice(0, 3).map((p) => h('div', { class: 'petit doux' }, p))),
        h('td', {}, flux(x.flux), x.flux && x.flux.message ? h('div', { class: 'petit doux' }, x.flux.message) : null),
        h('td', { class: 'petit' }, x.moteur || '—'),
        h('td', { class: 'petit' }, x.usage ? `${x.usage.entree || 0} lus · ${x.usage.sortie || 0} écrits${x.usage.recherches ? ` · ${x.usage.recherches} rech.` : ''}` : '—'),
        h('td', {}, x.fichier && h('button', { class: 'btn', onclick: () => appel('fichierOuvrir', x.fichier) }, 'Ouvrir'),
          x.json && x.flux && x.flux.statut !== 'envoye' && x.flux.statut !== 'sans-adresse' && h('button', { class: 'btn', onclick: () => appelEtat('rapportEnvoyer', x.id, 'Rapport envoyé au site.') }, 'Envoyer au site')),
      ))),
    ),
  )
}

async function envoyerAuBrief(texte) {
  const b = kx.brouillon
  if (kx.briefEnCours) return
  if (!kx.brief) {
    const nouveau = await appel('briefNouveau')
    if (!nouveau) return
    kx.brief = { brief: nouveau, prompt: null }
    b.briefId = nouveau.id
  }
  kx.briefEnCours = true
  const fichiers = kx.pieces
  // shown right away, before Claude answers
  kx.brief.brief.messages.push({ role: 'user', texte, pieces: fichiers.map((f) => ({ nom: f.split(/[\\/]/).pop() })) })
  kx.pieces = []
  rendre()
  const r = await appel('briefEnvoyer', { id: kx.brief.brief.id, texte, fichiers, projetId: b.projetId })
  kx.briefEnCours = false
  if (r) kx.brief = r
  else kx.brief = await appel('briefCharger', b.briefId)
  rendre()
  const fil = document.getElementById('fil-brief')
  if (fil) fil.scrollTop = fil.scrollHeight
}

function vueBrief() {
  const msgs = (kx.brief && kx.brief.brief.messages) || []
  const zone = h('textarea', { id: 'brief-texte', rows: '4', placeholder: 'Décris l’analyse voulue : le but, le marché, ce que le site doit en tirer… Joins des exemples, des captures, des documents.' })
  const envoyer = () => { const t = zone.value.trim(); if (!t && !kx.pieces.length) return; zone.value = ''; envoyerAuBrief(t) }
  zone.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) envoyer() })
  const fil = h('div', { id: 'fil-brief', class: 'fil' },
    msgs.length === 0 ? h('p', { class: 'doux petit' }, 'Claude connaît le projet choisi, ses analyses et tes onglets connectés. Il pose ses questions puis rédige le prompt ; tu le relis et tu enregistres.') : null,
    msgs.map((m) => h('div', { class: `bulle ${m.role === 'user' ? 'moi' : 'claude'}` },
      h('div', { class: 'petit doux' }, m.role === 'user' ? 'Toi' : 'Claude'),
      (m.pieces || []).length ? h('div', { class: 'petit' }, '📎 ', m.pieces.map((p) => p.nom).join(', ')) : null,
      h('div', { class: 'texte-bulle' }, m.texte || ''),
    )),
    kx.briefEnCours && h('div', { class: 'bulle claude' }, h('div', { class: 'doux' }, 'Claude écrit…')),
  )
  const depot = h('div', { class: 'depot-fichiers' }, kx.pieces.length ? `À joindre : ${kx.pieces.map((f) => f.split(/[\\/]/).pop()).join(', ')}` : 'Glisse ici des documents ou des images (PDF, PNG, JPG, TXT, CSV, MD…)')
  depot.addEventListener('dragover', (ev) => { ev.preventDefault(); depot.classList.add('survol') })
  depot.addEventListener('dragleave', () => depot.classList.remove('survol'))
  depot.addEventListener('drop', (ev) => {
    ev.preventDefault()
    const chemins = [...ev.dataTransfer.files].map((f) => window.poste.cheminFichier(f)).filter(Boolean)
    kx.pieces = [...new Set([...kx.pieces, ...chemins])]
    rendre()
  })
  return h('div', { class: 'carte brief' },
    h('h2', {}, 'Brief avec Claude'),
    fil,
    depot,
    zone,
    h('div', { class: 'ligne', style: 'margin-top:8px' },
      h('button', { class: 'btn principal', disabled: kx.briefEnCours, onclick: envoyer }, 'Envoyer'),
      h('button', { class: 'btn', disabled: kx.briefEnCours, onclick: async () => { const x = await appel('briefJoindre'); if (x && x.length) { kx.pieces = [...new Set([...kx.pieces, ...x])]; rendre() } } }, 'Joindre des fichiers…'),
      kx.pieces.length > 0 && h('button', { class: 'btn', onclick: () => { kx.pieces = []; rendre() } }, 'Retirer les pièces'),
      h('button', { class: 'btn', disabled: kx.briefEnCours || !msgs.length, onclick: () => envoyerAuBrief('Rédige maintenant le prompt complet de l’analyse.') }, 'Rédiger le prompt maintenant'),
    ),
    kx.brief && kx.brief.prompt && h('div', { class: 'ligne', style: 'margin-top:8px' },
      pastille('prompt proposé par Claude', 'bon'),
      h('button', { class: 'btn principal', onclick: () => { kx.brouillon.prompt = kx.brief.prompt; flash('Prompt repris : relis-le à droite, puis enregistre.') } }, 'Utiliser ce prompt'),
    ),
  )
}

function vueAnalyseEdition() {
  const k = etat.kantix
  const b = kx.brouillon
  const existante = k.analyses.find((a) => a.id === kx.analyse)
  const projet = k.projets.find((p) => p.id === b.projetId)
  const cle = projet && k.cles.find((c) => c.id === projet.cleId)
  const set = (champ, nombre) => (ev) => { b[champ] = nombre ? Number(ev.target.value) : ev.target.value }
  const quand = h('select', { onchange: (ev) => { b.quand = ev.target.value; rendre() } },
    [['maintenant', 'Une fois, maintenant'], ['aucune', 'À la demande (bouton « Lancer »)'], ['quotidien', 'Tous les jours à…'], ['hebdo', 'Une fois par semaine, le… à…']].map(([v, t]) => h('option', { value: v, selected: b.quand === v }, t)))
  const enregistrer = async () => {
    const lancer = b.quand === 'maintenant'
    const recurrence = lancer || b.quand === 'aucune' ? { type: 'aucune' } : { type: b.quand, heure: b.heure, jour: b.jour }
    const r = await appel('analyseEnregistrer', { id: existante ? existante.id : undefined, nom: b.nom, projetId: b.projetId, prompt: b.prompt, recurrence, dossier: b.dossier && b.dossier.chemin ? b.dossier : null, rechercheWeb: b.rechercheWeb, onglets: b.onglets, briefId: b.briefId })
    if (!r) return
    etat = r.etat
    if (r.annule) { flash('Rien n’est planifié.'); return }
    kx.analyse = r.id
    kx.brouillon = versBrouillon(etat.kantix.analyses.find((a) => a.id === r.id))
    if (lancer) { await appelEtat('analyseLancer', r.id, 'Analyse enregistrée et lancée.'); return }
    flash('Analyse enregistrée.')
  }
  return h('div', {},
    h('div', { class: 'ligne entete' }, h('button', { class: 'btn', onclick: () => { kx.analyse = null; messageFlash = ''; rendre() } }, '← Analyses'), h('h1', {}, existante ? existante.nom : 'Nouvelle analyse')),
    h('div', { class: 'deux-colonnes' },
      vueBrief(),
      h('div', {},
        h('div', { class: 'carte' },
          h('label', {}, 'Nom de l’analyse'), h('input', { value: b.nom, oninput: set('nom'), placeholder: 'Ex. iAgents — veille concurrents' }),
          h('label', {}, 'Projet relié (son flux et sa clé IA)'),
          h('select', { onchange: (ev) => { b.projetId = ev.target.value; rendre() } }, k.projets.map((p) => h('option', { value: p.id, selected: p.id === b.projetId }, p.nom))),
          h('p', { class: 'petit doux' }, 'Moteur : ', cle ? `${cle.nom} (${nomFournisseur(cle.fournisseur)}${cle.modele ? ', ' + cle.modele : ''})` : h('span', { class: 'erreur' }, 'ce projet n’a pas de clé IA')),
          h('label', {}, 'Prompt de l’analyse'),
          h('textarea', { rows: '14', value: b.prompt, oninput: set('prompt'), placeholder: 'Écris-le ou fais-le rédiger par Claude à gauche.' }),
          h('label', {}, 'Récurrence'), quand,
          (b.quand === 'quotidien' || b.quand === 'hebdo') && h('div', { class: 'ligne' },
            b.quand === 'hebdo' && h('div', { style: 'width:180px' }, h('select', { onchange: set('jour', true) }, k.jours.map((j, i) => h('option', { value: String(i), selected: i === b.jour }, j)))),
            h('div', { style: 'width:120px' }, h('input', { type: 'time', value: b.heure, oninput: set('heure') })),
          ),
          champDossier(b.dossier, (d) => { b.dossier = d }, { titre: 'Dossier où les rapports sont déversés (vide = celui du projet)', vide: projet ? projet.dossierEffectif : '' }),
          h('label', {}, h('span', {}, h('input', { type: 'checkbox', checked: b.rechercheWeb, onchange: (ev) => { b.rechercheWeb = ev.target.checked } }), ' Recherche web du fournisseur', cle && !cle.recherche ? ' (absente chez ce fournisseur : seuls les onglets seront lus)' : '')),
          h('label', {}, 'Onglets connectés à lire avant l’analyse'),
          etat.sources.length === 0 ? h('p', { class: 'petit doux' }, 'Aucun onglet : ouvrez-en dans « Navigateur ».') : h('div', { class: 'ligne' }, etat.sources.map((s) => h('label', { class: 'case' }, h('span', {},
            h('input', { type: 'checkbox', checked: b.onglets.includes(s.id), onchange: (ev) => { b.onglets = ev.target.checked ? [...b.onglets, s.id] : b.onglets.filter((x) => x !== s.id) } }), ` ${s.nom}`)))),
        ),
        messageFlash && h('p', { class: 'petit' }, messageFlash),
        h('div', { class: 'ligne' },
          h('button', { class: 'btn principal', onclick: enregistrer }, b.quand === 'maintenant' ? 'Enregistrer et lancer' : 'Enregistrer l’analyse'),
          existante && h('button', { class: 'btn', onclick: () => appelEtat('analyseLancer', existante.id, 'Analyse lancée.') }, 'Lancer maintenant'),
          existante && h('button', { class: 'btn danger', onclick: async () => { const r = await appel('analyseSupprimer', existante.id); if (r) { etat = r; if (!r.kantix.analyses.some((a) => a.id === existante.id)) kx.analyse = null; rendre() } } }, 'Supprimer'),
        ),
      ),
    ),
  )
}

// ---------------------------------------------------------------- Navigateur
const etatOnglet = (s) => {
  const e = s.session && s.session.etat
  if (!e) return ['', 'non vérifié']
  if (e === 'connecte') return ['bon', 'connecté']
  if (e === 'deconnecte') return ['mauvais', 'déconnecté']
  if (e === 'bloque') return ['mauvais', 'bloqué']
  return ['alerte', e]
}

function vueNavigateur() {
  const sources = etat.sources
  if (!kx.ajoutOnglet && !sources.some((s) => s.id === sourceChoisie)) sourceChoisie = sources.length ? sources[0].id : null
  if (!sources.length) kx.ajoutOnglet = true
  const choisie = kx.ajoutOnglet ? null : sources.find((s) => s.id === sourceChoisie)
  const ouverts = new Set(etat.kantix.onglets.filter((o) => o.ouvert).map((o) => o.id))
  const barre = h('div', { class: 'onglets-nav' },
    sources.map((s) => {
      const [cls] = etatOnglet(s)
      return h('button', { class: `onglet-nav ${s.id === sourceChoisie && !kx.ajoutOnglet ? 'actif' : ''}`, title: etatOnglet(s)[1], onclick: () => { kx.ajoutOnglet = false; sourceChoisie = s.id; rendre() } }, h('span', { class: `point ${cls}` }), s.nom)
    }),
    h('button', { class: `onglet-nav ${kx.ajoutOnglet ? 'actif' : ''}`, onclick: () => { kx.ajoutOnglet = true; rendre() } }, '+ Nouvel onglet'),
  )
  const perdus = sources.filter((s) => s.session && (s.session.etat === 'deconnecte' || s.session.etat === 'bloque'))
  const alerte = perdus.length ? h('div', { class: 'bandeau-alerte' }, `Session perdue : ${perdus.map((s) => s.nom).join(', ')}. Ouvrez l’onglet et reconnectez-vous vous-même.`) : null
  if (!choisie) {
    queueMicrotask(() => placerNavigateur(null, null))
    return h('div', {}, h('h1', {}, 'Navigateur'), barre, alerte,
      h('div', { class: 'carte', style: 'max-width:640px' },
        h('h2', {}, 'Nouvel onglet'),
        h('p', { class: 'petit doux' }, 'Un onglet par site à analyser qui demande d’être identifié. Tu t’y connectes toi-même, une fois : KANTIX garde la session sur ce PC, l’onglet reste ouvert et tu es prévenu s’il est déconnecté. Aucun mot de passe n’est lu ni enregistré.'),
        h('label', {}, 'Nom'), h('input', { id: 'f-nom', placeholder: 'Ex. Ads Library Facebook' }),
        h('label', {}, 'Adresse de connexion'), h('input', { id: 'f-url', placeholder: 'https://…' }),
        h('label', {}, 'Pages à lire pour les analyses (une par ligne, facultatif : sinon la page affichée)'), h('textarea', { id: 'f-pages', rows: '3' }),
        h('label', {}, 'Texte qui prouve la déconnexion (facultatif)'), h('input', { id: 'f-deco', placeholder: 'Ex. Se connecter' }),
        messageFlash && h('p', { class: 'petit' }, messageFlash),
        h('p', {}, h('button', { class: 'btn principal', onclick: async () => {
          const nom = document.getElementById('f-nom').value
          const r = await appel('sourceAjouter', { nom, urlConnexion: document.getElementById('f-url').value, pages: document.getElementById('f-pages').value, texteDeconnecte: document.getElementById('f-deco').value })
          if (r) { etat = r; const s = r.sources[r.sources.length - 1]; kx.ajoutOnglet = false; sourceChoisie = s ? s.id : null; messageFlash = ''; rendre() }
        } }, 'Ouvrir l’onglet')),
      ))
  }
  const zone = h('div', { id: 'zone-nav' })
  const champ = h('input', { id: 'url-nav', placeholder: 'https://…' })
  champ.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') appel('navAction', { action: 'aller', url: champ.value }) })
  const [cls, lib] = etatOnglet(choisie)
  queueMicrotask(() => placerNavigateur(zone, choisie))
  return h('div', {},
    h('h1', {}, 'Navigateur'),
    barre,
    alerte,
    h('div', { class: 'ligne barre-outils' },
      h('button', { class: 'btn', onclick: () => appel('navAction', { action: 'retour' }) }, '←'),
      h('button', { class: 'btn', onclick: () => appel('navAction', { action: 'avance' }) }, '→'),
      h('button', { class: 'btn', onclick: () => appel('navAction', { action: 'recharger' }) }, '↻'),
      h('div', { style: 'flex:1;min-width:200px' }, champ),
      pastille(lib, cls),
      h('button', { class: 'btn', onclick: async () => { flash('Vérification…'); const r = await appel('sourceVerifier', choisie.id); if (r) flash(`Session : ${r.etat} — ${r.raison}`) } }, 'Vérifier'),
      h('label', { class: 'case' }, h('span', {}, h('input', { type: 'checkbox', checked: choisie.garderOuvert !== false, onchange: (ev) => appelEtat('sourceGarder', { id: choisie.id, garder: ev.target.checked }) }), ' Garder ouvert', ouverts.has(choisie.id) ? '' : ' (fermé)')),
      h('button', { class: 'btn danger', onclick: async () => { if (confirm(`Fermer et supprimer l’onglet « ${choisie.nom} » ? Sa session sera oubliée de la liste.`)) { const r = await appel('sourceSupprimer', choisie.id); if (r) { sourceChoisie = null; etat = r; rendre() } } } }, 'Supprimer'),
    ),
    messageFlash && h('p', { class: 'petit' }, messageFlash),
    zone,
  )
}

// ---------------------------------------------------------------- Clés API
function vueCles() {
  const k = etat.kantix
  const f = kx.nouvelleCle || (kx.nouvelleCle = { fournisseur: 'anthropic', nom: '', valeur: '', modele: '', base: '' })
  const fourn = k.fournisseurs.find((x) => x.id === f.fournisseur)
  const usages = (id) => k.projets.filter((p) => p.cleId === id).map((p) => p.nom)
  const anth = k.cles.filter((c) => c.fournisseur === 'anthropic')
  return h('div', {},
    h('h1', {}, 'Clés API'),
    h('p', { class: 'doux' }, 'Le moteur des analyses. Chaque projet choisit sa clé : comparez la qualité des rapports d’un fournisseur à l’autre. Les clés sont chiffrées par Windows sur ce PC, jamais réaffichées, jamais écrites dans un dossier partagé.'),
    messageFlash && h('p', { class: 'petit' }, messageFlash),
    h('div', { class: 'carte' },
      k.cles.length === 0 ? h('p', {}, 'Aucune clé pour l’instant.') : h('table', {},
        h('thead', {}, h('tr', {}, ['Nom', 'Fournisseur', 'Modèle', 'État', 'Projets', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, k.cles.map((c) => {
          const t = kx.cleTest[c.id]
          const modeles = (t && t.modeles) || c.modelesConnus || []
          return h('tr', {},
            h('td', {}, c.nom),
            h('td', {}, nomFournisseur(c.fournisseur), c.recherche ? h('div', { class: 'petit doux' }, 'recherche web') : h('div', { class: 'petit doux' }, 'sans recherche web')),
            h('td', {}, modeles.length
              ? h('select', { onchange: (ev) => appelEtat('cleEnregistrer', { id: c.id, fournisseur: c.fournisseur, nom: c.nom, base: c.base, modele: ev.target.value }, 'Modèle choisi.') },
                h('option', { value: '' }, '— choisir —'), [...new Set([c.modele, ...modeles].filter(Boolean))].map((m) => h('option', { value: m, selected: m === c.modele }, m)))
              : c.modele || h('span', { class: 'doux' }, 'à choisir (Tester)')),
            h('td', {}, !c.posee ? pastille('clé absente', 'mauvais') : c.verifieeLe ? pastille(`connectée ${fmtDate(c.verifieeLe)}`, 'bon') : pastille('non vérifiée', 'alerte'),
              t && t.erreur ? h('div', { class: 'petit erreur' }, t.erreur) : null, t && t.nonListable ? h('div', { class: 'petit doux' }, 'Ce service ne donne pas sa liste de modèles : tapez le modèle à la main ; la clé sera vérifiée par la première analyse.') : null),
            h('td', { class: 'petit' }, usages(c.id).join(', ') || '—'),
            h('td', {},
              h('button', { class: 'btn', onclick: async () => {
                const r = await window.poste.cleTester(c.id)
                kx.cleTest[c.id] = r.ok ? { modeles: r.valeur.modeles, nonListable: r.valeur.nonListable } : { erreur: r.erreur }
                if (r.ok) etat = r.valeur.etat
                rendre()
              } }, 'Tester'),
              h('button', { class: 'btn danger', onclick: () => appelEtat('cleSupprimer', c.id) }, 'Supprimer')),
          )
        })),
      ),
    ),
    h('div', { class: 'carte', style: 'max-width:720px' },
      h('h2', {}, 'Ajouter une clé'),
      h('label', {}, 'Fournisseur'),
      h('select', { onchange: (ev) => { f.fournisseur = ev.target.value; rendre() } }, k.fournisseurs.map((x) => h('option', { value: x.id, selected: x.id === f.fournisseur }, `${x.nom}${x.recherche ? ' · recherche web' : ''}`))),
      fourn && fourn.console && h('p', { class: 'petit doux' }, `Créer une clé : ${fourn.console}`),
      h('label', {}, 'Nom de la clé (pour la reconnaître)'), h('input', { value: f.nom, oninput: (ev) => { f.nom = ev.target.value }, placeholder: `Ex. ${fourn ? fourn.nom : ''} — iAgents` }),
      f.fournisseur === 'compatible' && h('div', {}, h('label', {}, 'Adresse de l’API (compatible OpenAI, se termine souvent par /v1)'), h('input', { value: f.base, oninput: (ev) => { f.base = ev.target.value }, placeholder: 'https://…/v1' })),
      h('label', {}, 'Clé API'), h('input', { type: 'password', autocomplete: 'off', value: f.valeur, oninput: (ev) => { f.valeur = ev.target.value }, placeholder: 'Collez la clé' }),
      h('label', {}, `Modèle (facultatif : « Tester » donne la liste du fournisseur${fourn && fourn.modele ? ` ; vide = ${fourn.modele}` : ''})`), h('input', { value: f.modele, oninput: (ev) => { f.modele = ev.target.value } }),
      h('p', {}, h('button', { class: 'btn principal', onclick: async () => {
        const r = await appel('cleEnregistrer', { ...f })
        if (r) { etat = r; kx.nouvelleCle = null; flash('Clé enregistrée (chiffrée). Cliquez « Tester » pour la vérifier.') }
      } }, 'Enregistrer la clé')),
    ),
    h('div', { class: 'carte', style: 'max-width:720px' },
      h('h2', {}, 'Clé du brief avec Claude'),
      h('p', { class: 'petit doux' }, 'Le brief des analyses se fait avec Claude : la clé Anthropic du projet si c’en est une, sinon celle-ci.'),
      anth.length ? h('select', { onchange: (ev) => appelEtat('cleBrief', { id: ev.target.value }, 'Clé du brief choisie.') }, h('option', { value: '' }, 'la première clé Anthropic'), anth.map((c) => h('option', { value: c.id, selected: c.id === k.cleBriefId }, c.nom))) : h('p', { class: 'erreur petit' }, 'Aucune clé Anthropic : le brief ne peut pas démarrer.'),
    ),
  )
}

// ---------------------------------------------------------------- Connecteurs
function vueConnecteurs() {
  const k = etat.kantix
  const ds = k.connecteurs.dropshipper || {}
  const anth = k.cles.filter((c) => c.fournisseur === 'anthropic')
  return h('div', {},
    h('h1', {}, 'Connecteurs d’analyses'),
    h('p', { class: 'doux' }, 'Un connecteur branche KANTIX sur les analyses propres à un site, avec leur page : rapports effectués, échecs, lancement à la main.'),
    messageFlash && h('p', { class: 'petit' }, messageFlash),
    h('div', { class: 'grille' },
      h('div', { class: 'carte' },
        h('h2', {}, 'DropShipper analyses ', pastille(ds.actif ? 'connecté' : 'non connecté', ds.actif ? 'bon' : '')),
        h('p', { class: 'petit' }, 'MarketSpy : 24 rayons × 7 thèmes par jour, rapports rayon et marketing, envoi au site drop-shipper.fr, administration du site (utilisateurs, Import Drive, affiliation, réseaux sociaux).'),
        ds.actif && h('div', {},
          h('label', {}, 'Clé Anthropic des rayons (recherche web de Claude)'),
          h('select', { onchange: (ev) => appelEtat('connecteurCle', { cleId: ev.target.value }, 'Clé du connecteur enregistrée.') },
            h('option', { value: '' }, etat.secrets.anthropic && !ds.cleId ? 'ancienne clé du Poste' : anth.length ? '— choisir —' : 'aucune clé Anthropic enregistrée'),
            anth.map((c) => h('option', { value: c.id, selected: c.id === ds.cleId }, c.nom))),
          !anth.length && h('p', { class: 'petit' }, 'Ajoutez d’abord une clé Anthropic dans ', h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); aller('cles') } }, '« Clés API »'), ' : la liste se remplit avec vos clés.'),
        ),
        h('div', { class: 'ligne', style: 'margin-top:10px' },
          ds.actif
            ? [h('button', { class: 'btn principal', onclick: () => aller('accueil') }, 'Ouvrir la page DropShipper'), h('button', { class: 'btn danger', onclick: () => { if (confirm('Couper le connecteur DropShipper ? La nuit automatique des rayons s’arrête aussi. Rien n’est effacé.')) appelEtat('connecteurActiver', { id: 'dropshipper', actif: false }) } }, 'Couper')]
            : h('button', { class: 'btn principal', onclick: () => appelEtat('connecteurActiver', { id: 'dropshipper', actif: true }, 'Connecteur DropShipper connecté : ses pages sont dans le menu.') }, 'Connecter'),
        ),
      ),
    ),
  )
}

// ---------------------------------------------------------------- menu
const GROUPES_MENU = [
  { titre: null, onglets: [['projets', 'Projets'], ['analyses', 'Analyses'], ['navigateur', 'Navigateur'], ['cles', 'Clés API'], ['connecteurs', 'Connecteurs'], ['journal', 'Journal']] },
  { titre: 'DropShipper', si: (e) => e.kantix.connecteurs.dropshipper && e.kantix.connecteurs.dropshipper.actif, onglets: [['accueil', 'Tableau de bord'], ['rapports', 'Rapports du jour'], ['administration', 'Administration'], ['drive', 'Import Drive'], ['affiliation', 'Affiliation'], ['reseaux', 'Réseaux sociaux'], ['reglages', 'Réglages']] },
]
const VUES_KANTIX = { projets: vueProjets, analyses: vueAnalyses, navigateur: vueNavigateur, cles: vueCles, connecteurs: vueConnecteurs }
