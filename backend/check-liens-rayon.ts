/**
 * Banc : les liens produit des rayons importés du Drive — « lien vérifié ou rien » (16/11/2026).
 *
 * L'agent des rapports soutenait que le site « cassait » ses liens directs à cause du format
 * `[**Nom**](url)` : faux, les deux écritures se lisent. Le site remplaçait EXPRÈS chaque fiche
 * non vérifiée par une recherche « wholesale-… » fabriquée par nous (#202). Désormais : le lien de
 * l'agent n'est montré que s'il a recopié le titre de la page ouverte et que ce titre porte le nom ;
 * sinon, aucun lien (et `lienNonVerifie`), jamais une adresse inventée.
 *
 *   npx tsx check-liens-rayon.ts
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import Database from 'better-sqlite3'
import { ReportQuery } from './src/services/reportsDb.js'
import { lienVerifieOuRien } from './src/services/lienVerifie.js'

const require = createRequire(import.meta.url)
const lib = require('./rapports-etude.cjs')

let echecs = 0
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) echecs++
}

const peigne = 'Peigne démêlant ergonomique cheveux bouclés'
ok(lienVerifieOuRien('https://fr.aliexpress.com/item/1005010339715196.html', peigne) === '', 'fiche sans titre de page → aucun lien (pas de recherche fabriquée)')
ok(
  lienVerifieOuRien('https://fr.aliexpress.com/item/1005010339715196.html', peigne, 'Peigne démêlant ergonomique pour cheveux bouclés et épais') ===
    'https://fr.aliexpress.com/item/1005010339715196.html',
  'titre de page qui porte le nom → lien gardé tel quel',
)
ok(lienVerifieOuRien('https://www.amazon.fr/dp/B00MR0PPKG', peigne, 'Matelas gonflable camping') === '', 'titre d’un autre produit → aucun lien')
ok(lienVerifieOuRien('https://fr.aliexpress.com/w/wholesale-peigne.html', peigne) === '', 'une recherche non vérifiée n’est pas un lien produit')

const texte = `---
type: rayon
date: 2026-11-16
categorie: beaute
theme: cheveux
titre: Sur le rayon Soin des cheveux
sources: 12
---

## Analyse
Texte d'analyse.

## 20 produits proposés

| # | Produit | Fournisseur | Lien | Titre de la page | Prix d'achat | Prix de vente | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | [**${peigne}**](https://fr.aliexpress.com/item/1005010339715196.html) | AliExpress | voir | Peigne démêlant ergonomique pour cheveux bouclés | 3 € | 14,90 € | acheter |
| 2 | **[Médiator guitare celluloïd lot de 12](https://fr.aliexpress.com/item/1005013275337501.html)** | AliExpress | voir | Housse de protection pour siège auto | 1 € | 6,90 € | acheter |
| 3 | [**Capodastre guitare acier**](https://www.amazon.fr/dp/B0BQDSNJS4) | Amazon | voir |  | 4 € | 12,90 € | acheter |
`

const origine = 'drive:d/2026-11-16/beaute/cheveux.rayon.md'
const e = lib.etudeMarkdown({ texteRayon: texte, texteMarketing: null, origineRayon: origine, origineMarketing: null, source: 'google-drive', indices: lib.indicesDuChemin(origine) })
ok(e.ok && e.produits === 3, `3 produits lus${e.ok ? '' : ' : ' + e.raison}`)
ok(e.ok && e.urlsDistinctes === 3, 'les deux écritures « [**Nom**](url) » et « **[Nom](url)** » donnent leur lien direct')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-liens-rayon-'))
const base = path.join(tmp, 'rapports.db')
fs.copyFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'rapports.db'), base)
try {
  const db = new Database(base)
  lib.ecrireEtude(db, e)
  const ps = JSON.parse(db.prepare('SELECT data FROM reports WHERE id = ?').get(e.idRayon).data).products
  db.close()
  ok(ps[0].supplierUrl === 'https://fr.aliexpress.com/item/1005010339715196.html' && /Peigne/.test(ps[0].urlPageTitle || ''), 'le titre de la page est gardé avec le lien : ' + JSON.stringify(ps[0].urlPageTitle))
  ok(!ps[2].urlPageTitle, 'cellule de titre vide → aucun titre')

  const q = new ReportQuery(base, null)
  const g = (q.getGagnants({ jour: '2026-11-16', categories: ['beaute'], limite: 50 }) as any).produits.filter((p: any) => /Peigne|Médiator|Capodastre/.test(p.titre))
  q.close()
  const par = (m: RegExp) => g.find((p: any) => m.test(p.titre))
  ok(g.length === 3, `3 produits servis (${g.length})`)
  ok(par(/Peigne/)?.url === 'https://fr.aliexpress.com/item/1005010339715196.html' && !par(/Peigne/)?.lienNonVerifie, 'n° 1 : titre conforme → lien direct servi')
  ok(par(/Médiator/)?.url === '' && par(/Médiator/)?.lienNonVerifie === true, 'n° 2 : titre d’un autre produit → aucun lien, marqué non vérifié')
  ok(par(/Capodastre/)?.url === '' && par(/Capodastre/)?.lienNonVerifie === true, 'n° 3 : pas de titre → aucun lien, marqué non vérifié')
  ok(!g.some((p: any) => /wholesale|\/s\?k=/.test(p.url)), 'aucune recherche fabriquée par le site')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est conforme.')
process.exit(echecs ? 1 : 0)
