/**
 * Le pied de page des pages statiques (gabarit de build-seo.cjs, donc toutes
 * les pages /fonctions/, /outils/, /vendre-sur-…/, /tarifs/, /faq/…).
 *
 * Même table que l'écran React (src/components/PiedDePagePublic.tsx) :
 * src/data/pied-de-page.json. Une colonne vide n'est pas affichée — la colonne
 * Réseaux attend les comptes de Max, et un lien vers un compte qui n'existe pas
 * serait pire qu'aucun lien.
 */
const { colonnes } = require('../src/data/pied-de-page.json')
const ENTREPRISE = require('../src/data/entreprise.json')
const ICONES = require('../src/data/icones-reseaux.json').reseaux

const esc = (t) =>
  String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const CSS_PIED = `
.pied{display:grid;gap:1.5rem 2rem;grid-template-columns:repeat(auto-fit,minmax(10.5rem,1fr));padding:.5rem 0 1rem}
.pied h2{font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:#b8c0d0;margin:0 0 .6rem}
.pied ul{list-style:none;padding:0;margin:0}
.pied li{margin:.35rem 0}
footer .pied a{margin:0;text-decoration:none}
footer .pied a:hover{color:#f5f7fa;text-decoration:underline}
.pastille{display:inline-block;margin-left:.35rem;font-size:.62rem;font-weight:700;letter-spacing:.04em;padding:.05rem .4rem;border-radius:999px;background:linear-gradient(90deg,#f28a4b,#e85290);color:#fff;vertical-align:middle}
.pied-bas{border-top:1px solid #2a3147;padding-top:1rem;margin-top:.5rem}
.reseaux-pied{display:flex;flex-wrap:wrap;gap:.75rem;list-style:none;padding:0;margin:0 0 1rem}
.reseaux-pied[hidden]{display:none}
footer .reseaux-pied a{display:flex;align-items:center;justify-content:center;width:2.5rem;height:2.5rem;margin:0;border-radius:999px;border:1px solid #2a3147;background:#191e2e;color:#b8c0d0}
footer .reseaux-pied a:hover{border-color:#e85290;color:#f5f7fa}
`

function lien(l) {
  const externe = /^https?:/.test(l.href)
  return `<a href="${esc(l.href)}"${externe ? ' rel="noopener" target="_blank"' : ''}>${esc(l.label)}</a>${
    l.badge ? ` <span class="pastille">${esc(l.badge)}</span>` : ''
  }`
}

/** Le pied complet ; `guides` = la ligne des guides, gardée pour le maillage (audit du 03/10/2026). */
function piedDePage(guides = []) {
  const cols = colonnes
    .filter((c) => c.liens.length)
    .map((c) => `<div><h2>${esc(c.titre)}</h2><ul>${c.liens.map((l) => `<li>${lien(l)}</li>`).join('')}</ul></div>`)
    .join('\n')
  return `<nav class="pied" aria-label="Pied de page">
${cols}
</nav>
${reseaux()}
<div class="pied-bas">
${guides.length ? `<p>Guides : ${guides.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join(' ')}</p>` : ''}
<p><a href="/">DropShipper IA</a> — logiciel français de dropshipping par IA. Sans abonnement, 1 drop = 0,01 €.</p>
${coordonnees()}
</div>`
}

/**
 * DropShipper's social icons (Max, 12/10/2026). The page is written at build
 * time but the links are set later from the Poste, so the row ships hidden and
 * a small script fills it from /api/public/reseaux-sociaux: only the accounts
 * with a link appear, never a dead one. No link at all = the row stays hidden.
 */
function reseaux() {
  const modeles = Object.fromEntries(ICONES.map((r) => [r.id, [r.label, r.d]]))
  return `<ul class="reseaux-pied" id="reseaux-pied" aria-label="DropShipper sur les réseaux" hidden></ul>
<script>(function(){var M=${JSON.stringify(modeles)};fetch('/api/public/reseaux-sociaux').then(function(r){return r.ok?r.json():null}).then(function(j){if(!j||!j.reseaux)return;var ul=document.getElementById('reseaux-pied');var n=0;Object.keys(M).forEach(function(k){var u=j.reseaux[k];if(typeof u!=='string'||u.indexOf('https://')!==0)return;var li=document.createElement('li');var a=document.createElement('a');a.href=u;a.target='_blank';a.rel='noopener';a.title=M[k][0];a.setAttribute('aria-label','DropShipper sur '+M[k][0]);a.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="'+M[k][1]+'"/></svg>';li.appendChild(a);ul.appendChild(li);n++});if(n)ul.hidden=false}).catch(function(){})})()</script>`
}

/**
 * Nom, adresse, téléphone, horaires : identiques à la fiche Google, mot pour mot
 * (src/data/entreprise.json). Google rapproche le site de la fiche par ces trois lignes.
 */
function coordonnees() {
  const { nom, adresse: a, telephone, telephoneInternational, horaires } = ENTREPRISE
  return `<p class="nap">${esc(nom)} · ${esc(a.rue)}, ${esc(a.codePostal)} ${esc(a.ville)} · <a href="tel:${esc(telephoneInternational)}">${esc(telephone)}</a> · ${esc(horaires.libelle)}</p>`
}

module.exports = { piedDePage, CSS_PIED, colonnes, coordonnees }
