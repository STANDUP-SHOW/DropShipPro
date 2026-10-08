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

const esc = (t) =>
  String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const CSS_PIED = `
.pied{display:grid;gap:1.5rem 2rem;grid-template-columns:repeat(auto-fit,minmax(10.5rem,1fr));padding:.5rem 0 1rem}
.pied h2{font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:#cfc9e8;margin:0 0 .6rem}
.pied ul{list-style:none;padding:0;margin:0}
.pied li{margin:.35rem 0}
footer .pied a{margin:0;text-decoration:none}
footer .pied a:hover{color:#e9e6f5;text-decoration:underline}
.pastille{display:inline-block;margin-left:.35rem;font-size:.62rem;font-weight:700;letter-spacing:.04em;padding:.05rem .4rem;border-radius:999px;background:linear-gradient(90deg,#f28a4b,#e85290);color:#fff;vertical-align:middle}
.pied-bas{border-top:1px solid #ffffff12;padding-top:1rem;margin-top:.5rem}
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
<div class="pied-bas">
${guides.length ? `<p>Guides : ${guides.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join(' ')}</p>` : ''}
<p><a href="/">DropShipper IA</a> — logiciel français de dropshipping par IA. Sans abonnement, 1 drop = 0,01 €.</p>
</div>`
}

module.exports = { piedDePage, CSS_PIED, colonnes }
