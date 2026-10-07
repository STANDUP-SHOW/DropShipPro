import { cases, masquerEmail, nouveauCodeAcces, ventiler, TAUX_COMMISSION, codeValide, hacherCode } from './src/services/affiliation.js'

/**
 * Éprouve l'affiliation sans base : les cases du tableau de bord (30 jours,
 * 12 semaines, 12 mois, 5 ans), la ventilation des clics, inscriptions et
 * commissions, le masquage des adresses des filleuls, et le code d'accès.
 *
 * Ce que le banc garde : un euro de commission compté dans une seule case, au
 * bon endroit, et un affilié qui ne voit jamais l'adresse complète d'un filleul.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const maintenant = new Date('2026-10-07T15:00:00Z') // un mercredi

// Les cases
const jours = cases('jour', maintenant)
exige(jours.length === 30, `30 cases par jour (${jours.length})`)
exige(jours[29].cle === '2026-10-07', `dernière case = aujourd'hui (${jours[29].cle})`)
const semaines = cases('semaine', maintenant)
exige(semaines.length === 12, '12 semaines')
exige(semaines[11].cle === '2026-10-05', `la semaine commence le lundi (${semaines[11].cle})`)
const mois = cases('mois', maintenant)
exige(mois.length === 12 && mois[11].cle === '2026-10' && mois[0].cle === '2025-11', `12 mois glissants (${mois[0].cle} → ${mois[11].cle})`)
const annees = cases('annee', maintenant)
exige(annees.map((c) => c.cle).join() === '2022,2023,2024,2025,2026', '5 années')
for (const [nom, cs] of [['jour', jours], ['semaine', semaines], ['mois', mois], ['annee', annees]] as const) {
  for (let i = 1; i < cs.length; i++) exige(cs[i].debut.getTime() === cs[i - 1].fin.getTime(), `${nom} : cases jointives (${cs[i].cle})`)
}

// La ventilation
const ev = {
  clics: [new Date('2026-10-07T08:00:00Z'), new Date('2026-10-06T23:59:59Z'), new Date('2026-08-01T00:00:00Z')],
  inscriptions: [new Date('2026-10-07T09:00:00Z')],
  commissions: [
    { createdAt: new Date('2026-10-07T10:00:00Z'), montantCentimes: 2000, commissionCentimes: 200 },
    { createdAt: new Date('2026-09-15T10:00:00Z'), montantCentimes: 4500, commissionCentimes: 450 },
  ],
}
const parJour = ventiler('jour', ev, maintenant)
exige(parJour[29].clics === 1 && parJour[28].clics === 1, 'un clic par jour, au bon jour')
exige(parJour.reduce((a, s) => a + s.clics, 0) === 2, 'le clic d’août est hors des 30 jours')
exige(parJour[29].gainsCentimes === 200 && parJour[29].depensesCentimes === 2000, 'commission du jour')
const parMois = ventiler('mois', ev, maintenant)
exige(parMois[11].gainsCentimes === 200 && parMois[10].gainsCentimes === 450, 'commissions rangées par mois')
exige(parMois.reduce((a, s) => a + s.clics, 0) === 3, 'les trois clics dans les 12 mois')
const parAn = ventiler('annee', ev, maintenant)
exige(parAn[4].gainsCentimes === 650, 'gains de l’année')

// Le taux, et l'arrondi d'une recharge à prix réduit (45 € → 4,50 €)
exige(TAUX_COMMISSION === 0.1, 'taux de 10 %')
exige(Math.round(4500 * TAUX_COMMISSION) === 450, '10 % de 45 €')

// Les adresses des filleuls
exige(masquerEmail('jean.dupont@gmail.com') === 'je•••@gmail.com', `masque (${masquerEmail('jean.dupont@gmail.com')})`)
exige(!masquerEmail('jean.dupont@gmail.com').includes('dupont'), 'le nom ne fuit pas')

// Le code d'accès
const code = nouveauCodeAcces()
exige(/^[A-HJ-NP-Z2-9]{10}$/.test(code), `code lisible de 10 caractères (${code})`)
exige(new Set(Array.from({ length: 200 }, nouveauCodeAcces)).size === 200, 'codes tous différents')
const hash = await hacherCode(code)
exige(await codeValide(code.toLowerCase(), hash), 'code accepté en minuscules')
exige(await codeValide(` ${code} `, hash), 'espaces autour tolérés')
exige(!(await codeValide('AAAAAAAAAA', hash)), 'mauvais code refusé')
exige(!(await codeValide(code, null)), 'aucun code émis : refusé')

if (echecs) {
  console.log(`check-affiliation : ${echecs} échec(s)`)
  process.exit(1)
}
console.log('check-affiliation : OK')
