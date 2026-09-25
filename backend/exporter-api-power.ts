/**
 * API Power, pour le site.
 *
 * Le registre vit dans services/apiPower.ts, sous backend/ que Vercel ne voit
 * pas : ce script en écrit une copie JSON, `frontend/src/data/api-power.json`,
 * lue par la page React /api-power et par la page pré-rendue pour les robots
 * (build-geo.cjs). Même mécanique que fournisseurs.json et canaux.json ; le
 * banc check-geo.ts vérifie que la copie est à jour.
 *
 *   npx tsx exporter-api-power.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { API_POWER, LIBELLE_ECRAN, LIBELLE_ETAT, LIBELLE_USAGE, UNIVERS, resumeApiPower } from './src/services/apiPower.js'

const SORTIE = path.resolve('../frontend/src/data/api-power.json')

fs.writeFileSync(
  SORTIE,
  JSON.stringify(
    {
      _commentaire: 'ENGENDRÉ par backend/exporter-api-power.ts depuis services/apiPower.ts, ne pas éditer : la page /api-power (React et pré-rendue) le lit.',
      libelles: { etat: LIBELLE_ETAT, usage: LIBELLE_USAGE, ecran: LIBELLE_ECRAN },
      univers: UNIVERS,
      resume: resumeApiPower(),
      apis: API_POWER,
    },
    null,
    2,
  ) + '\n',
)
const r = resumeApiPower()
console.log(`${r.apis} API (${r.retenues} retenues), ${r.opportunites} opportunités écrites dans ${path.relative(process.cwd(), SORTIE)}`)
