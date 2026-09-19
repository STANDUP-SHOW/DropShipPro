import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import {
  CATEGORIES,
  categorieDe,
  categoriesDuRayon,
  lirePrompts,
  themeDuJour,
  type CategorieAgent,
  type ProduitRapport,
} from '../services/marketReports.js'

/**
 * « Fresh news » : les rapports du jour des 48 agents, lus par les vendeurs.
 *
 * **Gratuit, réservé aux comptes qui ont au moins 500 drops en banque.** Ce
 * n'est pas un abonnement, c'est un solde : la porte se vérifie à chaque
 * lecture, et un vendeur qui descend sous le seuil garde ce qu'il a importé
 * mais ne lit plus les nouveaux rapports jusqu'à sa prochaine recharge. Le
 * seuil vit ici, en un seul endroit, et l'écran reçoit un 402 explicite avec
 * le solde et le manque — pas un 403 muet.
 *
 * **Une seule catégorie à la fois, complète.** L'écran demande une catégorie et
 * un jour, et reçoit les deux rapports (rayon + marketing) du thème du jour ;
 * les blocs sont les sections H2 du Markdown, l'écran les met en cases.
 *
 * **La file d'import** vit aussi ici : le vendeur y dépose un produit ou toute
 * la liste, l'extension viendra la chercher (`/api/extension/file`, à venir).
 */
export const marketReportsRouter = Router()
marketReportsRouter.use(requireAuth)

export const SEUIL_DROPS = 500

async function porteOuverte(req: AuthedRequest): Promise<{ ok: true; drops: number } | { ok: false; drops: number }> {
  const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { credits: true } })
  const drops = u?.credits ?? 0
  return drops >= SEUIL_DROPS ? { ok: true, drops } : { ok: false, drops }
}

/** Le refus de la porte, en un seul endroit : l'écran affiche le manque, pas un 403 muet. */
function refusPorte(drops: number) {
  return {
    error: `Les rapports du jour sont offerts aux comptes qui ont au moins ${SEUIL_DROPS} drops en banque. Il vous en manque ${SEUIL_DROPS - drops}.`,
    seuil: SEUIL_DROPS,
    drops,
  }
}

function jourIso(decalage = 0): string {
  return new Date(Date.now() + decalage * 86_400_000).toISOString().slice(0, 10)
}

/** Les 24 catégories et leur thème du jour — pour le sélecteur. */
marketReportsRouter.get('/categories', async (_req: AuthedRequest, res) => {
  res.json(
    CATEGORIES.map((c) => ({
      id: c.id,
      nom: c.nom,
      themes: c.themes,
      themeDuJour: themeDuJour(c).id,
    })),
  )
})

/**
 * Les rapports d'une catégorie pour un jour (défaut : aujourd'hui, sinon le
 * dernier jour disponible en arrière). Rend aussi les jours d'archive connus
 * pour cette catégorie, pour le sélecteur « aujourd'hui / hier / archives ».
 */
marketReportsRouter.get('/', async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      categorie: z.string().min(1),
      jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      q: z.string().max(80).optional(),
    })
    .safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Catégorie manquante.' })
  const categorie = categorieDe(parsed.data.categorie)
  if (!categorie) return res.status(404).json({ error: 'Catégorie inconnue.' })

  const porte = await porteOuverte(req)
  if (!porte.ok) {
    return res.status(402).json({
      error: `Les rapports du jour sont offerts aux comptes qui ont au moins ${SEUIL_DROPS} drops en banque. Il vous en manque ${SEUIL_DROPS - porte.drops}.`,
      seuil: SEUIL_DROPS,
      drops: porte.drops,
    })
  }

  const jours = await prisma.marketReport.findMany({
    where: { categorie: categorie.id },
    select: { day: true },
    distinct: ['day'],
    orderBy: { day: 'desc' },
    take: 15, // les quinze derniers jours (17/09/2026)
  })
  const disponibles = jours.map((j) => j.day)

  // La recherche dans les archives : titre, accroche ou corps, sur cette catégorie.
  if (parsed.data.q) {
    const trouves = await prisma.marketReport.findMany({
      where: {
        categorie: categorie.id,
        OR: [
          { titre: { contains: parsed.data.q, mode: 'insensitive' } },
          { accroche: { contains: parsed.data.q, mode: 'insensitive' } },
          { body: { contains: parsed.data.q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, day: true, theme: true, type: true, titre: true, accroche: true },
      orderBy: { day: 'desc' },
      take: 30,
    })
    return res.json({ categorie: { id: categorie.id, nom: categorie.nom }, disponibles, resultats: trouves, rapports: [] })
  }

  const jour = parsed.data.jour ?? disponibles[0] ?? jourIso()
  const rapports = await prisma.marketReport.findMany({
    where: { categorie: categorie.id, day: jour },
    orderBy: { type: 'desc' }, // rayon avant marketing
  })

  res.json({
    categorie: { id: categorie.id, nom: categorie.nom },
    jour,
    aujourdhui: jourIso(),
    hier: jourIso(-1),
    disponibles,
    rapports: rapports.map((r) => ({
      id: r.id,
      type: r.type,
      theme: categorie.themes.find((t) => t.id === r.theme) ?? { id: r.theme, nom: r.theme },
      titre: r.titre,
      accroche: r.accroche,
      sources: r.sources,
      body: r.body,
      produits: (r.produits ?? []) as unknown as ProduitRapport[],
    })),
  })
})

/*
 * ---------------------------------------------------------------------------
 * Le classement : les mêmes rapports, vus depuis un rayon ou depuis le menu
 * ---------------------------------------------------------------------------
 *
 * Fresh news montre UN jour d'UNE catégorie, en entier. Ce qui manquait est
 * l'autre lecture : toutes les analyses d'un rayon, listées par date, qu'on
 * déplie. Les deux lisent la même table — une écriture, plusieurs vitrines,
 * comme les analyses des chefs de rayon.
 *
 * Le périmètre se dit de deux façons : `rayon` (la clé d'un chef de rayon, qui
 * porte une ou plusieurs catégories d'agents) ou `categorie` (une catégorie
 * d'agent précise). Sans ni l'un ni l'autre, c'est la vue globale.
 */

/** Les catégories visées par une requête, ou null pour « toutes ». */
function perimetre(query: { rayon?: string; categorie?: string }): { ids: string[] | null; rayonConnu: boolean } {
  if (query.categorie) {
    const c = categorieDe(query.categorie)
    return { ids: c ? [c.id] : [], rayonConnu: true }
  }
  if (query.rayon) {
    const cats = categoriesDuRayon(query.rayon)
    return { ids: cats.map((c) => c.id), rayonConnu: cats.length > 0 }
  }
  return { ids: null, rayonConnu: true }
}

function nomCategorie(id: string): string {
  return categorieDe(id)?.nom ?? id
}

function nomTheme(cat: CategorieAgent | null, theme: string): string {
  return cat?.themes.find((t) => t.id === theme)?.nom ?? theme
}

const listeSchema = z.object({
  type: z.enum(['rayon', 'marketing']).optional(),
  rayon: z.string().max(80).optional(),
  categorie: z.string().max(60).optional(),
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().max(80).optional(),
  limite: z.coerce.number().int().min(1).max(120).optional(),
})

/**
 * La liste des analyses, par date, la plus récente en tête.
 *
 * Rend les en-têtes seulement : titre, accroche, date, thème, combien de
 * produits. Le corps se demande ligne par ligne au dépliage — soixante
 * analyses complètes d'un coup, c'est un mégaoctet de Markdown pour trois
 * lignes lues.
 */
marketReportsRouter.get('/analyses', async (req: AuthedRequest, res) => {
  const parsed = listeSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Filtre invalide.' })

  const porte = await porteOuverte(req)
  if (!porte.ok) return res.status(402).json(refusPorte(porte.drops))

  const { ids, rayonConnu } = perimetre(parsed.data)
  if (ids && ids.length === 0) {
    return res.json({ analyses: [], categories: [], rayonSansCategorie: !rayonConnu })
  }

  const q = parsed.data.q?.trim()
  const analyses = await prisma.marketReport.findMany({
    where: {
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      ...(ids ? { categorie: { in: ids } } : {}),
      ...(parsed.data.jour ? { day: parsed.data.jour } : {}),
      ...(q
        ? {
            OR: [
              { titre: { contains: q, mode: 'insensitive' } },
              { accroche: { contains: q, mode: 'insensitive' } },
              { body: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      day: true,
      categorie: true,
      theme: true,
      type: true,
      titre: true,
      accroche: true,
      sources: true,
      produits: true,
    },
    orderBy: [{ day: 'desc' }, { categorie: 'asc' }],
    take: parsed.data.limite ?? 60,
  })

  res.json({
    rayonSansCategorie: false,
    categories: (ids ?? CATEGORIES.map((c) => c.id)).map((id) => ({ id, nom: nomCategorie(id) })),
    analyses: analyses.map((a) => ({
      id: a.id,
      day: a.day,
      type: a.type,
      categorie: a.categorie,
      categorieNom: nomCategorie(a.categorie),
      theme: a.theme,
      themeNom: nomTheme(categorieDe(a.categorie), a.theme),
      titre: a.titre,
      accroche: a.accroche,
      sources: a.sources,
      produits: ((a.produits ?? []) as unknown as ProduitRapport[]).length,
    })),
  })
})

/** Une analyse, corps compris : ce que le dépliage d'une ligne demande. */
marketReportsRouter.get('/analyses/:id', async (req: AuthedRequest, res) => {
  const porte = await porteOuverte(req)
  if (!porte.ok) return res.status(402).json(refusPorte(porte.drops))

  const a = await prisma.marketReport.findUnique({ where: { id: req.params.id } })
  if (!a) return res.status(404).json({ error: 'Analyse introuvable.' })

  const cat = categorieDe(a.categorie)
  res.json({
    id: a.id,
    day: a.day,
    type: a.type,
    categorie: a.categorie,
    categorieNom: cat?.nom ?? a.categorie,
    theme: a.theme,
    themeNom: nomTheme(cat, a.theme),
    titre: a.titre,
    accroche: a.accroche,
    sources: a.sources,
    body: a.body,
    produits: (a.produits ?? []) as unknown as ProduitRapport[],
  })
})

/**
 * Les produits gagnants des rapports rayon, à plat.
 *
 * **Le tableau d'un rapport est une liste d'annonces à importer**, pas un
 * tableau à lire : la page « Produits gagnants » et le rayon lisent donc les
 * lignes elles-mêmes, pas les rapports. Chaque ligne garde d'où elle vient —
 * le rapport, le jour, la catégorie — parce qu'un produit sans sa date ni son
 * rayon ne se juge pas.
 */
marketReportsRouter.get('/gagnants', async (req: AuthedRequest, res) => {
  const parsed = listeSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Filtre invalide.' })

  const porte = await porteOuverte(req)
  if (!porte.ok) return res.status(402).json(refusPorte(porte.drops))

  const { ids, rayonConnu } = perimetre(parsed.data)
  if (ids && ids.length === 0) return res.json({ produits: [], jours: [], rayonSansCategorie: !rayonConnu })

  // Les rapports des derniers jours seulement : vingt produits par rapport et
  // par jour, la liste entière d'un mois ferait quinze mille lignes.
  const rapports = await prisma.marketReport.findMany({
    where: {
      type: 'rayon',
      ...(ids ? { categorie: { in: ids } } : {}),
      ...(parsed.data.jour ? { day: parsed.data.jour } : {}),
    },
    select: { id: true, day: true, categorie: true, theme: true, titre: true, produits: true },
    orderBy: [{ day: 'desc' }],
    take: parsed.data.limite ?? 24,
  })

  const produits = rapports.flatMap((r) =>
    ((r.produits ?? []) as unknown as ProduitRapport[]).map((p) => ({
      ...p,
      rapportId: r.id,
      day: r.day,
      categorie: r.categorie,
      categorieNom: nomCategorie(r.categorie),
      theme: r.theme,
      themeNom: nomTheme(categorieDe(r.categorie), r.theme),
    })),
  )

  res.json({
    rayonSansCategorie: false,
    jours: [...new Set(rapports.map((r) => r.day))],
    produits,
  })
})

/**
 * Les prompts publicitaires du jour, tirés des rapports marketing.
 *
 * Ils sont dans le corps du rapport, en blocs de code : les relire ici évite
 * que l'écran ne refasse cette lecture de son côté — une deuxième version
 * divergerait de la première au premier changement de contrat.
 */
marketReportsRouter.get('/prompts', async (req: AuthedRequest, res) => {
  const parsed = listeSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: 'Filtre invalide.' })

  const porte = await porteOuverte(req)
  if (!porte.ok) return res.status(402).json(refusPorte(porte.drops))

  const { ids, rayonConnu } = perimetre(parsed.data)
  if (ids && ids.length === 0) return res.json({ prompts: [], jours: [], rayonSansCategorie: !rayonConnu })

  const rapports = await prisma.marketReport.findMany({
    where: {
      type: 'marketing',
      ...(ids ? { categorie: { in: ids } } : {}),
      ...(parsed.data.jour ? { day: parsed.data.jour } : {}),
    },
    select: { id: true, day: true, categorie: true, theme: true, titre: true, body: true },
    orderBy: [{ day: 'desc' }],
    take: parsed.data.limite ?? 24,
  })

  const prompts = rapports.flatMap((r) =>
    lirePrompts(r.body).map((p, i) => ({
      ...p,
      id: `${r.id}-${i}`,
      rapportId: r.id,
      day: r.day,
      categorie: r.categorie,
      categorieNom: nomCategorie(r.categorie),
      theme: r.theme,
      themeNom: nomTheme(categorieDe(r.categorie), r.theme),
      titre: r.titre,
    })),
  )

  res.json({ rayonSansCategorie: false, jours: [...new Set(rapports.map((r) => r.day))], prompts })
})

/*
 * ---------------------------------------------------------------------------
 * La file d'import — ce que l'agent extension viendra exécuter.
 * ---------------------------------------------------------------------------
 */

const ajoutSchema = z.object({
  produits: z
    .array(
      z.object({
        url: z.string().url(),
        titre: z.string().max(200).optional(),
        fournisseur: z.string().max(80).optional(),
        mode: z.enum(['api', 'url', 'extension']).optional(),
        origine: z.string().max(60).optional(),
      }),
    )
    .min(1)
    .max(500),
})

/** Dépose un produit ou une liste dans la file. Une adresse déjà en attente n'est pas doublée. */
marketReportsRouter.post('/file', async (req: AuthedRequest, res) => {
  const parsed = ajoutSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Liste invalide (1 à 500 adresses).' })

  const enAttente = await prisma.importQueue.findMany({
    where: { userId: req.userId!, status: { in: ['EN_ATTENTE', 'RELEVE'] } },
    select: { url: true },
  })
  const deja = new Set(enAttente.map((e) => e.url))
  const neufs = parsed.data.produits.filter((p) => !deja.has(p.url))

  if (neufs.length) {
    await prisma.importQueue.createMany({
      data: neufs.map((p) => ({
        userId: req.userId!,
        url: p.url,
        titre: p.titre ?? null,
        fournisseur: p.fournisseur ?? null,
        mode: p.mode ?? 'extension',
        origine: p.origine ?? null,
      })),
    })
  }
  res.status(201).json({ ajoutes: neufs.length, dejaEnFile: parsed.data.produits.length - neufs.length })
})

/** La file du vendeur, la plus récente en tête. */
marketReportsRouter.get('/file', async (req: AuthedRequest, res) => {
  const lignes = await prisma.importQueue.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  res.json(lignes)
})

marketReportsRouter.delete('/file/:id', async (req: AuthedRequest, res) => {
  const { count } = await prisma.importQueue.deleteMany({
    where: { id: req.params.id, userId: req.userId!, status: 'EN_ATTENTE' },
  })
  if (!count) return res.status(404).json({ error: 'Rien à retirer : la ligne est absente ou déjà relevée.' })
  res.json({ ok: true })
})
