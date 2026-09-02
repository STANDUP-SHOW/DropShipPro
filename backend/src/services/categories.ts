import { MODELE_RAPIDE, modele } from './aiModels.js'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../lib/prisma.js'
import { accorderAuGenre, genreDe, lireTitre, sourceSansValeur, type Genre } from './categoryLexicon.js'
import graine from './categorySeed.json' with { type: 'json' }

/**
 * Le référentiel de catégories, et la façon dont il apprend.
 *
 * Ce qu'il remplace : un tableau TypeScript de 29 entrées dont 28 de mode
 * homme, plus cinq règles de mots-clés qui envoyaient tout le reste vers
 * « Divers ». Une souris gamer n'avait littéralement aucune place où aller.
 *
 * Trois idées, dans l'ordre où elles comptent.
 *
 * **Un pivot, pas des paires.** Faire correspondre chaque fournisseur à chaque
 * place de marché demanderait n × n tables. Chaque catégorie porte donc un
 * chemin dans la taxonomie de Google, et les plateformes s'en dérivent — c'est
 * ce que Google Shopping et Meta acceptent déjà tels quels.
 *
 * **La mémoire avant le modèle.** Un texte source déjà rencontré ne repart
 * jamais au modèle : il est dans la table des alias. C'est ce qui rend
 * l'apprentissage gratuit à l'usage — mille produits d'une même boutique
 * coûtent un appel, pas mille.
 *
 * **L'intransigeance.** Une catégorie manquante ne devient pas « Divers ». Elle
 * est apprise, ou l'annonce reste en brouillon avec la raison écrite. Une
 * annonce mal rangée se vend mal sur toutes les plateformes à la fois, et
 * personne ne s'en aperçoit avant des semaines.
 */

interface GraineCategorie {
  id: string
  parentId: string | null
  sector: string
  label: string
  path: string
  google: string
  icone?: string | null
  targets?: Record<string, string | null>
  note?: string | null
}

interface Graine {
  categories: GraineCategorie[]
  alias: Array<{ key: string; categoryId: string; source: string }>
}

const GRAINE = graine as Graine

/**
 * Normalise un texte pour servir de clé.
 *
 * Accents retirés, ponctuation réduite à des tirets : « Souris & claviers » et
 * « souris et claviers » ne doivent pas occuper deux entrées de la mémoire.
 */
export function cle(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

/**
 * Installe le référentiel livré, sans écraser ce qui a été appris.
 *
 * Les catégories du socle sont mises à jour — un libellé corrigé doit se
 * propager — mais celles apprises en production ne sont jamais touchées, et
 * aucun alias existant n'est réécrit : un alias déjà posé porte le choix d'un
 * vendeur ou une décision du modèle déjà payée.
 */
export async function semerCategories(): Promise<{ categories: number; alias: number }> {
  // Les parents d'abord : une sous-catégorie référence son rayon.
  const ordonnees = [
    ...GRAINE.categories.filter((c) => !c.parentId),
    ...GRAINE.categories.filter((c) => c.parentId),
  ]

  /*
   * En lots, et c'est indispensable.
   *
   * Deux cent quarante-huit upserts suivis de cinq cents insertions font près de
   * huit cents allers-retours vers une base distante : plus de deux minutes,
   * pour un semis censé être instantané au démarrage. Les lignes déjà présentes
   * sont donc lues d'abord, et seules les manquantes sont écrites — en une
   * requête chacune.
   */
  const existantes = new Set(
    (await prisma.category.findMany({ select: { id: true } })).map((c) => c.id),
  )

  const aCreer = ordonnees
    .filter((c) => !existantes.has(c.id))
    .map((c) => ({
      id: c.id,
      origin: 'core',
      parentId: c.parentId,
      sector: c.sector,
      label: c.label,
      path: c.path,
      google: c.google,
      targets: { ...(c.targets ?? {}), ...(c.icone ? { icone: c.icone } : {}) },
    }))

  // Les rayons avant leurs sous-catégories : la clé étrangère l'exige.
  const racines = aCreer.filter((c) => !c.parentId)
  const feuilles = aCreer.filter((c) => c.parentId)
  if (racines.length) await prisma.category.createMany({ data: racines, skipDuplicates: true })
  if (feuilles.length) await prisma.category.createMany({ data: feuilles, skipDuplicates: true })

  // Les catégories déjà là sont remises à jour une par une, mais elles ne le
  // sont qu'au déploiement d'un socle corrigé — pas à chaque démarrage.
  for (const c of ordonnees.filter((c) => existantes.has(c.id))) {
    await prisma.category.update({
      where: { id: c.id },
      // `origin` n'est pas touché : une catégorie apprise puis reprise dans le
      // socle garde la trace de son origine.
      data: {
        parentId: c.parentId,
        sector: c.sector,
        label: c.label,
        path: c.path,
        google: c.google,
        targets: { ...(c.targets ?? {}), ...(c.icone ? { icone: c.icone } : {}) },
      },
    })
  }

  const { count: alias } = await prisma.categoryAlias.createMany({
    data: GRAINE.alias.map((a) => ({ key: a.key, categoryId: a.categoryId, source: a.source })),
    skipDuplicates: true,
  })

  return { categories: ordonnees.length, alias }
}

export interface DemandeCategorie {
  /** Le choix explicite du vendeur : il l'emporte sur tout le reste. */
  categoryId?: string | null
  /** La catégorie annoncée par le site ou l'API du fournisseur. */
  sourceCategory?: string | null
  /** L'identifiant de catégorie chez le fournisseur, quand il en donne un. */
  supplierCategoryId?: string | null
  /** La clé du fournisseur : `aliexpress`, `cjdropshipping`… */
  supplierId?: string | null
  title: string
  /** Caractéristiques et description, quand le titre ne suffit pas. */
  pageText?: string | null
}

export interface Resolution {
  categoryId: string | null
  path: string | null
  /** Comment on est arrivé là : utile pour mesurer ce que l'apprentissage rend. */
  par: 'choix' | 'titre' | 'alias' | 'libelle' | 'ia' | 'aucune'
  /** Le genre lu dans le titre, à ranger dans les caractéristiques du produit. */
  genre?: Genre | null
  /** Renseigné quand rien n'a été trouvé, pour l'écrire sur l'annonce. */
  raison?: string
}

/** Les clés à essayer, de la plus sûre à la plus vague. */
function clesCandidates(d: DemandeCategorie): string[] {
  const sortie: string[] = []
  if (d.supplierId && d.supplierCategoryId) {
    // La plus fiable de toutes : un identifiant de catégorie chez un
    // fournisseur donné ne veut jamais dire deux choses.
    sortie.push(`${d.supplierId}:${d.supplierCategoryId}`)
  }
  /*
   * Une catégorie source sans valeur ne devient jamais une clé.
   *
   * `« la catégorie Maison »` est du texte de gabarit ramassé sur AliExpress.
   * Gravée comme alias, elle a rangé seize produits sans rapport — souris,
   * mini-PC, perceuses, aspirateur — dans « Figurines et jouets d'action », et
   * elle comptait trente-et-un usages avant qu'on la voie. Le mal n'était pas
   * la décision initiale mais la clé : elle rassemblait des produits qui n'ont
   * rien en commun.
   */
  if (d.sourceCategory && !sourceSansValeur(d.sourceCategory)) {
    const brut = d.sourceCategory.trim()
    sortie.push(cle(brut))
    // Un chemin « Électronique > Périphériques > Souris » : la feuille est plus
    // précise que la racine, on essaie de droite à gauche.
    const morceaux = brut.split(/[>›|/]/).map((m) => m.trim()).filter(Boolean)
    for (const m of morceaux.reverse()) {
      if (!sourceSansValeur(m)) sortie.push(cle(m))
    }
  }
  return [...new Set(sortie.filter(Boolean))]
}

/**
 * La catégorie que le titre désigne, résolue contre le référentiel réel.
 *
 * Le lexique rend un chemin lisible ; un chemin qui n'existe plus en base est
 * ignoré plutôt que rangé de travers.
 */
async function parLeTitre(titre: string): Promise<{ id: string; path: string; genre: Genre | null } | null> {
  const lecture = lireTitre(titre)
  if (!lecture) return null

  const genre = genreDe(titre)
  const chemin = accorderAuGenre(lecture.chemin, genre)

  const trouvee =
    (await prisma.category.findFirst({ where: { path: chemin } })) ??
    // Le chemin accordé au genre peut ne pas exister : on retombe sur celui que
    // le lexique désignait, qui lui a été écrit contre le référentiel.
    (chemin !== lecture.chemin ? await prisma.category.findFirst({ where: { path: lecture.chemin } }) : null)

  return trouvee ? { id: trouvee.id, path: trouvee.path, genre } : null
}

/**
 * Range un produit, et apprend quand il le faut.
 *
 * L'ordre n'est pas cosmétique : chaque étape coûte plus que la précédente. Le
 * choix du vendeur est gratuit, la mémoire est une requête, le rapprochement de
 * libellés en est une autre, et le modèle est le seul à coûter de l'argent.
 */
export async function resoudreCategorie(d: DemandeCategorie): Promise<Resolution> {
  // --- 1. Le choix du vendeur -----------------------------------------------
  if (d.categoryId) {
    const choisie = await prisma.category.findUnique({ where: { id: d.categoryId } })
    if (choisie) {
      await prisma.category.update({ where: { id: choisie.id }, data: { uses: { increment: 1 } } })
      return { categoryId: choisie.id, path: choisie.path, par: 'choix' }
    }
  }

  /*
   * --- 2. Le titre, et la mémoire, confrontés ------------------------------
   *
   * C'est le changement du 31/08/2026, et il vient d'un constat : toute la
   * décision reposait sur la catégorie annoncée par la source, et le titre
   * n'était lu qu'en dernier recours, par le modèle. Or le titre est le signal
   * le plus fiable — c'est celui que lisent Vinted, Leboncoin et eBay pour
   * proposer une catégorie dès la frappe.
   *
   * Les deux sont donc lus, puis confrontés :
   *
   * - **Ils s'accordent**, ou l'un des deux manque : rien à arbitrer.
   * - **Ils se contredisent** : le titre gagne, et l'alias est effacé. C'est ce
   *   qui manquait le plus — `apprendreCategorie` n'écrase jamais, ce qui
   *   protégeait le choix d'un vendeur mais protégeait aussi une erreur, à
   *   jamais. Un alias posé par le modèle ou par une source douteuse doit
   *   pouvoir être corrigé ; celui que le vendeur a posé lui-même, non.
   */
  const candidates = clesCandidates(d)
  const [titre, memoire] = await Promise.all([
    parLeTitre(d.title),
    candidates.length
      ? prisma.categoryAlias.findFirst({ where: { key: { in: candidates } }, include: { category: true } })
      : null,
  ])

  if (memoire && (!titre || titre.id === memoire.categoryId)) {
    await Promise.all([
      prisma.categoryAlias.update({ where: { id: memoire.id }, data: { uses: { increment: 1 } } }),
      prisma.category.update({ where: { id: memoire.categoryId }, data: { uses: { increment: 1 } } }),
    ])
    return {
      categoryId: memoire.categoryId,
      path: memoire.category.path,
      par: 'alias',
      genre: titre?.genre ?? genreDe(d.title),
    }
  }

  if (titre) {
    // L'alias fautif est retiré, sauf s'il porte le geste d'un vendeur.
    if (memoire && memoire.source !== 'manuel' && memoire.source !== 'seed') {
      await prisma.categoryAlias.delete({ where: { id: memoire.id } }).catch(() => {})
    }
    if (!memoire || memoire.source !== 'manuel') {
      for (const c of candidates) await apprendreCategorie(c, titre.id, 'titre')
    }
    await prisma.category.update({ where: { id: titre.id }, data: { uses: { increment: 1 } } })
    return { categoryId: titre.id, path: titre.path, par: 'titre', genre: titre.genre }
  }

  if (memoire) {
    await Promise.all([
      prisma.categoryAlias.update({ where: { id: memoire.id }, data: { uses: { increment: 1 } } }),
      prisma.category.update({ where: { id: memoire.categoryId }, data: { uses: { increment: 1 } } }),
    ])
    return { categoryId: memoire.categoryId, path: memoire.category.path, par: 'alias', genre: genreDe(d.title) }
  }

  // --- 3. Le rapprochement de libellés --------------------------------------
  // Gratuit, et il attrape les cas où le fournisseur écrit presque le nom de la
  // catégorie. Insensible à la casse et aux accents grâce à la clé.
  if (d.sourceCategory) {
    const parLabel = await prisma.category.findFirst({
      where: { label: { equals: d.sourceCategory.trim(), mode: 'insensitive' } },
    })
    if (parLabel) {
      await apprendreCategorie(candidates[0] ?? cle(d.sourceCategory), parLabel.id, d.supplierId ?? 'libelle')
      await prisma.category.update({ where: { id: parLabel.id }, data: { uses: { increment: 1 } } })
      return { categoryId: parLabel.id, path: parLabel.path, par: 'libelle' }
    }
  }

  // --- 4. Le modèle, et l'apprentissage -------------------------------------
  const place = await placerParIA(d)
  if (place) {
    for (const c of candidates.length ? candidates : [cle(d.title)]) {
      await apprendreCategorie(c, place.id, d.supplierId ?? 'ia')
    }
    await prisma.category.update({ where: { id: place.id }, data: { uses: { increment: 1 } } })
    return { categoryId: place.id, path: place.path, par: 'ia' }
  }

  return {
    categoryId: null,
    path: null,
    par: 'aucune',
    raison:
      "La catégorie de ce produit n'a pas pu être déterminée. Choisissez-la à la main : elle décide de la façon dont l'annonce est rangée sur chaque plateforme.",
  }
}

/**
 * Grave une correspondance, sans jamais écraser celle qui existe.
 *
 * Un alias déjà posé porte soit le choix d un vendeur, soit une décision du
 * modèle déjà payée : le réécrire perdrait l un ou rachèterait l autre.
 */
export async function apprendreCategorie(key: string, categoryId: string, source: string): Promise<void> {
  if (!key) return
  await prisma.categoryAlias.createMany({
    data: [{ key, categoryId, source }],
    skipDuplicates: true,
  })
}

/**
 * Demande au modèle de placer le produit dans le référentiel.
 *
 * Il ne choisit pas librement : on lui donne la liste des identifiants
 * existants et il doit en rendre un. Laisser un modèle inventer un chemin
 * produirait des catégories jumelles — « Souris », « Souris PC », « Souris
 * d'ordinateur » — et un référentiel qui grossit sans devenir plus précis.
 *
 * La création d'une catégorie neuve reste possible, mais elle est explicite :
 * le modèle doit dire à quel rayon la rattacher, et elle naît sous ce rayon,
 * marquée `learned` pour qu'on puisse la relire.
 */
async function placerParIA(d: DemandeCategorie): Promise<{ id: string; path: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const toutes = await prisma.category.findMany({
    select: { id: true, path: true, parentId: true },
    orderBy: { path: 'asc' },
  })
  if (!toutes.length) return null

  const feuilles = toutes.filter((c) => c.parentId)
  const rayons = toutes.filter((c) => !c.parentId)

  const consigne = [
    "Tu ranges un produit dans le référentiel de catégories d'une application de dropshipping.",
    '',
    'Réponds UNIQUEMENT par un objet JSON, sans texte autour :',
    '{"id":"<identifiant exact d\'une catégorie de la liste>"}',
    "ou, si aucune ne convient vraiment :",
    '{"nouvelle":{"parent":"<identifiant d\'un rayon>","label":"<nom court en français>"}}',
    '',
    "Ne propose une nouvelle catégorie que si le produit ne rentre dans aucune existante.",
    "Un accessoire se range avec sa famille d'accessoires, pas avec l'appareil.",
    '',
    'RAYONS :',
    rayons.map((r) => `${r.id} = ${r.path}`).join('\n'),
    '',
    'CATÉGORIES :',
    feuilles.map((c) => `${c.id} = ${c.path}`).join('\n'),
  ].join('\n')

  const question = [
    `Titre : ${d.title}`,
    d.sourceCategory ? `Catégorie annoncée par le fournisseur : ${d.sourceCategory}` : '',
    d.pageText ? `Détails : ${d.pageText.slice(0, 1200)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const client = new Anthropic({ apiKey })
    const reponse = await client.messages.create({
      // Haiku suffit : c'est un choix dans une liste fermée, pas un
      // raisonnement. Et le référentiel, long, est mis en cache — il est
      // identique d'un produit à l'autre.
      model: modele('AI_MODEL_CATEGORY', MODELE_RAPIDE),
      max_tokens: 200,
      system: [{ type: 'text' as const, text: consigne, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user', content: question }],
    })

    const texte = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const brut = texte.match(/\{[\s\S]*\}/)
    if (!brut) return null
    const choix = JSON.parse(brut[0]) as {
      id?: string
      nouvelle?: { parent?: string; label?: string }
    }

    if (choix.id) {
      const existe = toutes.find((c) => c.id === choix.id)
      if (existe) return { id: existe.id, path: existe.path }
    }

    if (choix.nouvelle?.parent && choix.nouvelle.label) {
      const parent = rayons.find((r) => r.id === choix.nouvelle!.parent)
      if (!parent) return null

      const complet = await prisma.category.findUnique({ where: { id: parent.id } })
      if (!complet) return null

      const label = choix.nouvelle.label.trim().slice(0, 60)
      const id = `${parent.id}-${cle(label)}`.slice(0, 80)

      const creee = await prisma.category.upsert({
        where: { id },
        create: {
          id,
          parentId: parent.id,
          sector: complet.sector,
          label,
          path: `${complet.path} > ${label}`,
          google: complet.google,
          origin: 'learned',
        },
        update: {},
      })
      return { id: creee.id, path: creee.path }
    }
  } catch (err) {
    console.error('placement de catégorie indisponible', err)
  }

  return null
}

/**
 * L'arbre du référentiel, pour l'écran qui le parcourt.
 *
 * Les rayons portent leur icône et le nombre de sous-catégories : c'est ce
 * qu'affichent les gros blocs, et ça évite un second appel pour compter.
 */
export async function arbreCategories(): Promise<
  Array<{
    id: string
    label: string
    sector: string
    icone: string | null
    uses: number
    enfants: Array<{ id: string; label: string; path: string; uses: number; origin: string }>
  }>
> {
  const toutes = await prisma.category.findMany({ orderBy: [{ label: 'asc' }] })

  const rayons = toutes.filter((c) => !c.parentId)
  return rayons.map((r) => {
    const targets = (r.targets ?? {}) as Record<string, string | null>
    return {
      id: r.id,
      label: r.label,
      sector: r.sector,
      icone: typeof targets.icone === 'string' ? targets.icone : null,
      uses: r.uses,
      enfants: toutes
        .filter((c) => c.parentId === r.id)
        .map((c) => ({ id: c.id, label: c.label, path: c.path, uses: c.uses, origin: c.origin })),
    }
  })
}

/**
 * Range le genre dans les caractéristiques, sans écraser ce qui s'y trouve.
 *
 * Le genre n'est pas une catégorie chez nous, et c'est un choix : la taxonomie
 * produit de Google — notre pivot vers Shopify, Google et Meta — sépare les
 * vêtements et les chaussures par genre, mais pas les bijoux, les montres ni les
 * parfums. Y ajouter un niveau casserait le pivot, et la catégorie ne
 * correspondrait plus à rien chez la destination.
 *
 * Vinted et Leboncoin, eux, demandent le genre. Il vit donc dans les
 * caractéristiques, où chaque destination va le chercher si elle en a besoin —
 * et où le vendeur peut le corriger.
 */
export function avecGenre(attributs: unknown, genre: Genre | null | undefined): Record<string, string> | undefined {
  const base =
    attributs && typeof attributs === 'object' && !Array.isArray(attributs)
      ? (attributs as Record<string, string>)
      : {}
  if (!genre) return Object.keys(base).length ? base : undefined
  // Ce que le modèle ou le vendeur a déjà écrit l'emporte : il a vu le produit.
  if (base.Genre) return base
  return { ...base, Genre: genre }
}
