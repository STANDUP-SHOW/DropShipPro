import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SUPPLIERS } from './src/services/suppliers.js'

/**
 * Éprouve que ce qu'on RACONTE de l'application correspond à ce qu'elle FAIT.
 *
 * `frontend/scripts/build-llms.cjs` écrit `/llms.txt` et `/llms-full.txt` : la
 * description que les assistants conversationnels lisent pour répondre à
 * « que fait DropShipper IA ? ». Il **recopie** la liste des fournisseurs, parce
 * que Vercel ne déploie pas `backend/` et qu'il ne peut donc pas l'importer.
 *
 * **Une copie sans contrôle diverge, et personne ne le voit.** Constaté le
 * 16/09/2026 : JoyBuy, Shein et Wish avaient rejoint `suppliers.ts` (37
 * fournisseurs) pendant que la copie restait à 34. Le site se construisait, le
 * fichier se publiait, et la seule conséquence visible était qu'une IA
 * interrogée sur la plateforme citait trois fournisseurs de moins que la
 * réalité — un manque à vendre invisible, sur le canal d'acquisition dont le
 * principe est justement d'être lu par des machines.
 *
 * C'est le même piège que la grille tarifaire, déjà écrit dans `CLAUDE.md`, et
 * le commentaire qui demandait de s'en souvenir n'a pas suffi. Un banc, si.
 *
 * Volontairement une comparaison de LISTES et pas de comptes : deux listes de
 * même longueur peuvent ne pas contenir les mêmes noms, et un fournisseur
 * renommé passerait inaperçu.
 */
const CHEMIN = resolve(import.meta.dirname, '../frontend/scripts/build-llms.cjs')

/*
 * Depuis le 24/09/2026, build-llms.cjs ne recopie plus la liste à la main : il
 * lit `frontend/src/data/fournisseurs.json`, engendré par
 * `exporter-fournisseurs.ts`. C'est donc cette copie que le banc compare — et
 * il vérifie que build-llms la lit bien, sinon la comparaison ne prouverait rien.
 */
const JSON_FOURNISSEURS = resolve(import.meta.dirname, '../frontend/src/data/fournisseurs.json')

function listeRecopiee(): string[] {
  const source = readFileSync(CHEMIN, 'utf8')
  if (!/require\('\.\.\/src\/data\/fournisseurs\.json'\)/.test(source)) throw new Error(`build-llms.cjs ne lit plus fournisseurs.json (${CHEMIN})`)
  const { fournisseurs } = JSON.parse(readFileSync(JSON_FOURNISSEURS, 'utf8')) as { fournisseurs: Array<{ label: string }> }
  return fournisseurs.map((f) => f.label)
}

const attendus = SUPPLIERS.map((s) => s.label)
const recopies = listeRecopiee()

const manquants = attendus.filter((n) => !recopies.includes(n))
const enTrop = recopies.filter((n) => !attendus.includes(n))

let echecs = 0
if (manquants.length) {
  echecs++
  console.log(
    `ECHEC ${manquants.length} fournisseur(s) du registre absent(s) de llms.txt : ${manquants.join(', ')}\n` +
      `  Relancer : cd backend && npx tsx exporter-fournisseurs.ts (il recopie suppliers.ts dans frontend/src/data/fournisseurs.json).`,
  )
}
if (enTrop.length) {
  echecs++
  console.log(
    `ECHEC ${enTrop.length} nom(s) annoncé(s) dans llms.txt sans exister au registre : ${enTrop.join(', ')}\n` +
      `  Annoncer un fournisseur qu'on ne sait pas importer est pire qu'en oublier un.`,
  )
}

console.log(
  echecs === 0
    ? `Description publique : les ${attendus.length} fournisseurs du registre sont bien ceux annoncés.`
    : `${echecs} échec(s).`,
)
process.exitCode = echecs === 0 ? 0 : 1
