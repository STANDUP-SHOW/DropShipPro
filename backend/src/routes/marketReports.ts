import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { CATEGORIES, categorieDe, themeDuJour, type ProduitRapport } from '../services/marketReports.js'

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
