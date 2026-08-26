import zlib from 'zlib'

/**
 * Lire un classeur Excel, sans dépendance.
 *
 * Un `.xlsx` est un zip d'XML. Une bibliothèque complète pèse plusieurs mégas et
 * sait faire cent choses — formules, styles, graphiques — dont aucune ne sert
 * ici : on veut des lignes de texte. Soixante lignes suffisent, et elles ne
 * périment pas.
 *
 * **Le piège, et il est réel :** AliExpress écrit son export en flux. Dans ce
 * mode, les tailles ne figurent pas dans l'en-tête local de chaque entrée mais
 * dans un descripteur placé *après* les données. Un lecteur qui se fie à
 * l'en-tête local lit donc zéro octet, rend un classeur vide, et ne lève aucune
 * erreur — le fichier a l'air d'être sans produits. D'où la lecture par le
 * répertoire central, qui porte toujours les vraies tailles.
 */

export interface Classeur {
  /** Les noms de colonnes, tels qu'écrits sur la première ligne. */
  entetes: string[]
  /** Une ligne par produit, indexée par nom de colonne. */
  lignes: Array<Record<string, string>>
}

/** Le message d'un fichier qu'on n'a pas su ouvrir, dit au vendeur. */
export class XlsxIllisible extends Error {}

function entrees(buf: Buffer): Record<string, Buffer> {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) {
    throw new XlsxIllisible("Ce fichier n'est pas un classeur Excel lisible.")
  }

  let p = buf.readUInt32LE(eocd + 16)
  const nombre = buf.readUInt16LE(eocd + 10)
  const sortie: Record<string, Buffer> = {}

  for (let n = 0; n < nombre; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break

    const methode = buf.readUInt16LE(p + 10)
    const tailleComp = buf.readUInt32LE(p + 20)
    const longNom = buf.readUInt16LE(p + 28)
    const longExtra = buf.readUInt16LE(p + 30)
    const longComm = buf.readUInt16LE(p + 32)
    const offset = buf.readUInt32LE(p + 42)
    const nom = buf.subarray(p + 46, p + 46 + longNom).toString('utf8')

    const debut = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28)
    const donnees = buf.subarray(debut, debut + tailleComp)
    try {
      sortie[nom] = methode === 8 ? zlib.inflateRawSync(donnees) : donnees
    } catch {
      // Une entrée illisible n'empêche pas de lire les autres : les styles et
      // les métadonnées ne servent à rien ici.
    }

    p += 46 + longNom + longExtra + longComm
  }

  return sortie
}

const decoder = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

/**
 * Rend la première feuille sous forme de lignes nommées.
 *
 * Les cellules texte renvoient à une table de chaînes partagées, sauf quand le
 * producteur choisit de les écrire en ligne — les deux formes existent, et
 * AliExpress n'utilise pas la même que Google Sheets. Les deux sont lues.
 */
export function lireClasseur(fichier: Buffer, maxLignes = 2000): Classeur {
  const fichiers = entrees(fichier)
  const texte = (nom: string) => (fichiers[nom] ? fichiers[nom].toString('utf8') : '')

  const chaines: string[] = []
  for (const m of texte('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    chaines.push(
      decoder(
        [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map((t) => t[1])
          .join(''),
      ),
    )
  }

  const nomFeuille = Object.keys(fichiers).find((n) => /worksheets\/sheet\d+\.xml$/.test(n))
  if (!nomFeuille) throw new XlsxIllisible('Ce classeur ne contient aucune feuille.')

  const brutes: Array<Record<string, string>> = []
  for (const l of texte(nomFeuille).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cellules: Record<string, string> = {}
    for (const c of l[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const enLigne = c[3].match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/)
      if (enLigne) {
        cellules[c[1]] = decoder(enLigne[1])
        continue
      }
      const v = c[3].match(/<v>([\s\S]*?)<\/v>/)
      if (!v) continue
      cellules[c[1]] = /t="s"/.test(c[2]) ? (chaines[Number(v[1])] ?? '') : v[1]
    }
    brutes.push(cellules)
    if (brutes.length > maxLignes + 1) break
  }

  if (!brutes.length) throw new XlsxIllisible('Ce classeur est vide.')

  const premiere = brutes[0]
  const colonnes = Object.keys(premiere)
  const entetes = colonnes.map((c) => premiere[c].trim())

  const lignes = brutes.slice(1).map((ligne) => {
    const nommee: Record<string, string> = {}
    colonnes.forEach((col, i) => {
      nommee[entetes[i]] = (ligne[col] ?? '').trim()
    })
    return nommee
  })

  return { entetes, lignes: lignes.filter((l) => Object.values(l).some(Boolean)) }
}

/**
 * Repère la colonne qui porte les adresses produit.
 *
 * Par le nom d'abord — AliExpress Business écrit `productUrl` — puis par le
 * contenu, parce qu'un export traduit ou une colonne renommée à la main sont
 * plus fréquents qu'on ne croit. Chercher une adresse dans les valeurs marche
 * quel que soit l'intitulé.
 */
export function colonneAdresses(classeur: Classeur): string | null {
  const parNom = classeur.entetes.find((e) => /url|lien|adresse|link/i.test(e))
  if (parNom) return parNom

  for (const entete of classeur.entetes) {
    const echantillon = classeur.lignes.slice(0, 5).map((l) => l[entete] ?? '')
    if (echantillon.some((v) => /^https?:\/\//i.test(v))) return entete
  }
  return null
}
