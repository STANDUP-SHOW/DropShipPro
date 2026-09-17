import { Fragment, type ReactNode } from 'react'

/**
 * Un rendu Markdown minimal, à la main, pour les rapports des agents.
 *
 * Pas de bibliothèque : le sous-ensemble dont un rapport a besoin tient en
 * cent lignes — paragraphes, listes, tableaux, blocs de code (les prompts
 * publicitaires, copiables tels quels), gras, liens. Un lien s'ouvre dans un
 * nouvel onglet et ne porte jamais de script : tout est du texte React, jamais
 * du HTML injecté, donc un rapport ne peut rien exécuter dans la page.
 *
 * Les titres H2 ne sont PAS rendus ici : c'est la page qui découpe le rapport
 * en blocs sur les H2 et les met en cases. `Markdown` reçoit le corps d'un bloc.
 */
function enLigne(texte: string, cle: string): ReactNode[] {
  const noeuds: ReactNode[] = []
  // gras **x**, code `x`, lien [x](url) ou adresse nue
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)]+)/g
  let i = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(texte))) {
    if (m.index > i) noeuds.push(texte.slice(i, m.index))
    const t = m[0]
    const k = `${cle}-${n++}`
    if (t.startsWith('**')) noeuds.push(<b key={k}>{t.slice(2, -2)}</b>)
    else if (t.startsWith('`')) noeuds.push(<code key={k} className="rounded bg-white/10 px-1 text-[0.92em]">{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) {
      const label = t.slice(1, t.indexOf(']('))
      noeuds.push(<a key={k} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-purple-300 underline">{label}</a>)
    } else noeuds.push(<a key={k} href={t} target="_blank" rel="noopener noreferrer" className="text-purple-300 underline break-all">{t}</a>)
    i = m.index + t.length
  }
  if (i < texte.length) noeuds.push(texte.slice(i))
  return noeuds
}

export function Markdown({ texte }: { texte: string }) {
  const lignes = texte.replace(/\r\n/g, '\n').split('\n')
  const sortie: ReactNode[] = []
  let i = 0
  let k = 0

  while (i < lignes.length) {
    const l = lignes[i]

    if (!l.trim()) {
      i++
      continue
    }

    // Bloc de code : la première ligne « # … » est le format visé, gardée en étiquette.
    if (l.startsWith('```')) {
      const corps: string[] = []
      i++
      while (i < lignes.length && !lignes[i].startsWith('```')) corps.push(lignes[i++])
      i++
      const etiquette = corps[0]?.startsWith('#') ? corps.shift()!.replace(/^#\s*/, '') : null
      sortie.push(
        <div key={k++} className="my-3 overflow-hidden rounded-xl border border-purple-400/25 bg-black/30">
          {etiquette ? <div className="border-b border-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-purple-200">{etiquette}</div> : null}
          <pre className="whitespace-pre-wrap px-3 py-2.5 font-mono text-[13px] leading-relaxed text-gray-100">{corps.join('\n')}</pre>
        </div>,
      )
      continue
    }

    // Tableau : lignes qui commencent par |
    if (l.trim().startsWith('|')) {
      const rangs: string[] = []
      while (i < lignes.length && lignes[i].trim().startsWith('|')) rangs.push(lignes[i++].trim())
      const cellules = (r: string) => r.split('|').slice(1, -1).map((c) => c.trim())
      const entetes = cellules(rangs[0])
      const corps = rangs.slice(2).map(cellules)
      sortie.push(
        <div key={k++} className="my-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-gray-400">
              <tr>{entetes.map((e, j) => <th key={j} className="px-2.5 py-2 font-semibold">{e}</th>)}</tr>
            </thead>
            <tbody>
              {corps.map((r, ri) => (
                <tr key={ri} className="border-t border-white/5 align-top">
                  {r.map((c, ci) => <td key={ci} className="px-2.5 py-1.5">{enLigne(c, `t${k}-${ri}-${ci}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Titre H3/H4 à l'intérieur d'un bloc
    const h = /^(#{3,4})\s+(.*)$/.exec(l)
    if (h) {
      sortie.push(<h4 key={k++} className="mt-4 mb-1 text-sm font-bold text-purple-200">{enLigne(h[2], `h${k}`)}</h4>)
      i++
      continue
    }

    // Liste
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const items: string[] = []
      const ordonnee = /^\s*\d+\./.test(l)
      while (i < lignes.length && /^\s*([-*]|\d+\.)\s+/.test(lignes[i])) items.push(lignes[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''))
      const Tag = ordonnee ? 'ol' : 'ul'
      sortie.push(
        <Tag key={k++} className={`my-2 space-y-1 pl-5 text-sm text-gray-200 ${ordonnee ? 'list-decimal' : 'list-disc'}`}>
          {items.map((it, j) => <li key={j}>{enLigne(it, `l${k}-${j}`)}</li>)}
        </Tag>,
      )
      continue
    }

    // Citation
    if (l.startsWith('>')) {
      const q: string[] = []
      while (i < lignes.length && lignes[i].startsWith('>')) q.push(lignes[i++].replace(/^>\s?/, ''))
      sortie.push(<blockquote key={k++} className="my-2 border-l-2 border-purple-400/50 pl-3 text-sm italic text-gray-300">{enLigne(q.join(' '), `q${k}`)}</blockquote>)
      continue
    }

    // Paragraphe : jusqu'à la prochaine ligne vide ou structure
    const p: string[] = []
    while (i < lignes.length && lignes[i].trim() && !/^(```|\||#{1,6}\s|>|\s*([-*]|\d+\.)\s)/.test(lignes[i])) p.push(lignes[i++])
    if (p.length) sortie.push(<p key={k++} className="my-2 text-sm leading-relaxed text-gray-200">{enLigne(p.join(' '), `p${k}`)}</p>)
    else i++
  }

  return <Fragment>{sortie}</Fragment>
}

/** Découpe un rapport sur ses titres H2 : un bloc par section, avec une ancre. */
export function blocsDe(body: string): Array<{ id: string; titre: string; corps: string }> {
  const lignes = body.replace(/\r\n/g, '\n').split('\n')
  const blocs: Array<{ id: string; titre: string; corps: string[] }> = []
  let courant: { id: string; titre: string; corps: string[] } | null = null
  for (const l of lignes) {
    const h = /^##\s+(.*)$/.exec(l)
    if (h) {
      courant = { id: h[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), titre: h[1].trim(), corps: [] }
      blocs.push(courant)
    } else if (courant) courant.corps.push(l)
    else if (l.trim()) {
      courant = { id: 'intro', titre: '', corps: [l] }
      blocs.push(courant)
    }
  }
  return blocs.map((b) => ({ id: b.id, titre: b.titre, corps: b.corps.join('\n').trim() }))
}
