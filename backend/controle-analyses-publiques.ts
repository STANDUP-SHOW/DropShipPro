/**
 * Contrôle de structure de chaque page publique /analyses/ rendue depuis rapports.db : ce qu'un retrait au rendu
 * peut casser (annonce sans ses éléments, phrase coupée, connecteur en tête de bloc, parenthèse orpheline,
 * « Strate 1 » sans 2). Lecture seule. Sort 1 et nomme chaque page fautive.
 *   cd backend && npx tsx controle-analyses-publiques.ts
 */
import express from 'express'
const { analysesPubliquesRouter, lignesPubliques } = await import('./src/routes/analysesPubliques.js')
const { cheminRapport } = await import('./src/services/analysesPubliques.js')
const app = express(); app.use('/analyses', analysesPubliquesRouter)
const srv = app.listen(0); const port = (srv.address() as any).port
const txt = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
let n = 0
for (const l of lignesPubliques()) {
  const h = await (await fetch(`http://127.0.0.1:${port}${cheminRapport(l)}`)).text()
  const corps = (/<article[^>]*>([\s\S]*)<\/article>/i.exec(h)?.[1] ?? /<body[^>]*>([\s\S]*)<\/body>/i.exec(h)?.[1] ?? h).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
  const blocs = [...corps.matchAll(/<(p|li|h2|h3|ul|ol|table|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => ({ tag: m[1].toLowerCase(), html: m[2], t: txt(m[2]) }))
  const pb: string[] = []
  blocs.forEach((b, i) => {
    if ((b.tag === 'p' || b.tag === 'li') && /^[a-zà-ÿ]/.test(b.t) && !/^(i[A-Z]|e[A-Z]|x\d|vs\b)/.test(b.t)) pb.push(`minuscule: ${b.t.slice(0, 90)}`)
    if (b.tag === 'p' || b.tag === 'li') {
      const nums = [...b.t.matchAll(/\((\d)\)/g)].map((m) => +m[1])
      if (nums.length && nums.some((x, k) => x !== k + 1)) pb.push(`numérotation: ${b.t.slice(0, 90)}`)
      if (nums.length === 1) pb.push(`un seul point: ${b.t.slice(0, 90)}`)
      if (/\s[.,;:]\s*$|:\s*$/.test(b.t) && b.tag === 'p') {
        const suiv = blocs[i + 1]
        if (/:\s*$/.test(b.t) && (!suiv || !/^(ul|ol|table)$/.test(suiv.tag))) pb.push(`deux-points sans suite: ${b.t.slice(-90)}`)
      }
      const ann = /(?<![\p{L}])(deux|trois|quatre|cinq)\s+(étages|paliers|niveaux|familles|axes|points|leviers|risques|tendances|piliers|pièges|segments|blocs|strates)/iu.exec(b.t)
      if (ann) {
        const attendu = { deux: 2, trois: 3, quatre: 4, cinq: 5 }[ann[1].toLowerCase()]!
        const suiv = blocs[i + 1]
        const items = suiv && /^(ul|ol)$/.test(suiv.tag) ? (suiv.html.match(/<li/g) || []).length : -1
        const apres = b.t.slice(ann.index + ann[0].length)
        const ordinaux = (apres.match(/premi|deuxi|troisi|quatri|\(\d\)/gi) || []).length
          + (apres.match(new RegExp(`(?<![\\p{L}])une?\\s+${ann[2].toLowerCase().replace(/[sx]$/, '')}(?![\\p{L}])`, 'giu')) || []).length
        if (!(items === attendu || ordinaux >= attendu || (items === -1 && apres.split(/[.;]/).length > attendu))) pb.push(`annonce ${ann[0]} sans ses éléments: ${b.t.slice(0, 90)}`)
      }
    }
    if (/^(p|li|td)$/.test(b.tag) && /(?<![\p{L}])(sur|la|le|les|de|du|des|à|au|en|et|un|une|pour|avec|attention)\s*[.]?$|\(\s*\)/iu.test(b.t)) pb.push(`coupé: ${b.t.slice(-90)}`)
    if (/^(p|li)$/.test(b.tag) && /:\s+\p{Ll}[^.:]{0,25}:\s/u.test(b.t)) pb.push(`deux libellés: ${b.t.slice(0, 90)}`)
    if (/^(p|li)$/.test(b.tag) && /^[^.]{0,60}(?<![\p{L}])(donc|aussi)(?![\p{L}])/iu.test(b.t) && /^(Éviter|Il |Elle |Ils |Elles |Aucune |Aucun )/.test(b.t)) pb.push(`renvoi orphelin: ${b.t.slice(0, 90)}`)
    if ((b.tag === 'ul' || b.tag === 'ol') && (b.html.match(/<li/g) || []).length === 1 && /:\s*$/.test(blocs[i - 1]?.t ?? '')) pb.push(`liste à un point après: ${blocs[i - 1].t.slice(-80)}`)
    if (/^\d+\.\s/.test(b.t) && b.tag === 'li') pb.push(`numéro dans la puce: ${b.t.slice(0, 60)}`)
    if (/^(p|li|td)$/.test(b.tag) && /^(mais|ensuite|plus\s+largement|donc)(?![\p{L}])/iu.test(b.t)) pb.push(`connecteur en tête: ${b.t.slice(0, 80)}`)
    if (/^(p|li|td)$/.test(b.tag)) {
      let ouvertes = 0
      for (const [k, c] of [...b.t].entries()) {
        if (c === '(') ouvertes++
        else if (c === ')' && ouvertes) ouvertes--
        else if (c === ')' && !/(?:^|[\s(:;,])(?:\d{1,2}|[a-zA-Z])$/.test(b.t.slice(0, k))) { pb.push(`parenthèse sans ouvrante: ${b.t.slice(Math.max(0, k - 60), k + 20)}`); break }
      }
    }
  })
  const numeros = (nom: string) => [...corps.matchAll(new RegExp(`<strong>\\s*${nom}\\s+(\\d+)`, 'gi'))].map((m) => +m[1])
  for (const nom of ['Strate', 'Étape', 'Palier']) {
    const ns = numeros(nom)
    if (ns.includes(1) && !ns.includes(2)) pb.push(`${nom} 1 sans ${nom} 2`)
  }
  if (!blocs.some((b) => /^(p|li|td)$/.test(b.tag) && /\p{L}{3}/u.test(b.t))) pb.push('page vide')
  if (pb.length) { n++; console.log('##', l.id); for (const x of pb) console.log('  ' + x) }
}
console.log(n ? `\n${n} page(s) en défaut.` : '\nToutes les pages publiques tiennent debout.')
srv.close()
process.exit(n ? 1 : 0)
