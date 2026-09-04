import Anthropic from '@anthropic-ai/sdk'
import type { Department } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { findDepartment } from './departments.js'
import { systemeCachable } from './chatBudget.js'
import { MODELE_REDACTION, modele } from './aiModels.js'

/**
 * Le mode automatique des chefs de rayon — la structure du 05/09/2026.
 *
 * Toutes les douze heures, un rayon en poste dont l'interrupteur IA
 * AUTO-MODE est levé produit deux choses :
 *
 * 1. **Une analyse de marché** : les produits phares côté fournisseurs, ce
 *    qui se vend et se cherche côté places de marché, tendance et saison —
 *    avec la recherche web pour appuyer chaque affirmation. Elle est
 *    consignée en `Report` (section MARKET, rattachée au rayon) : la
 *    rubrique « Mes analyses » du rayon et la page Analyses de marché lisent
 *    la même ligne — une écriture, deux vitrines.
 *
 * 2. **Dix produits gagnants**, déduits de l'analyse : lien, prix le plus
 *    bas constaté, prix de vente possible, plateformes conseillées. Ils
 *    partent en `Opportunity` marqués `gagnant12h`, que la page Produits
 *    gagnants présente façon Mes annonces. La marge n'est jamais stockée :
 *    elle se déduit des deux prix, un chiffre dérivé ne se désynchronise pas.
 *
 * C'est inclus dans le salaire du chef. Les bornes vivent ici, pas dans une
 * consigne : quatre recherches web par analyse, deux par liste, plafonds de
 * tokens serrés. Coût d'un passage : ~6 recherches (0,06 $) plus ~4 000 tokens
 * de sortie Sonnet (~0,08 $), soit ~0,13 € — donc **~8 € par mois et par
 * rayon** à deux passages par jour si l'interrupteur reste levé en continu.
 * C'est le poste de coût dominant du salaire : à retarifer avant toute
 * baisse de prix ou hausse de fréquence.
 *
 * La garde des onze heures fait qu'un redémarrage de Railway ne double
 * jamais un passage — même mécanique que l'enquête fournisseurs.
 */

const MARQUE_ANALYSE = 'analyse-12h'
const MARQUE_GAGNANTS = 'gagnant12h'

export interface AnalyseProduite {
  titre: string
  corps: string
  gagnants: Array<{
    titre: string
    lien: string
    prixBas: number
    prixVente: number
    plateformes: string[]
  }>
}

/*
 * L'outil de livraison et sa consigne, partagés entre l'appel normal et le
 * secours : deux copies divergeraient.
 */
const OUTIL_LISTE = {
  name: 'livrer_liste',
  description: 'Livre la liste finale des dix produits gagnants.',
  input_schema: {
    type: 'object' as const,
    properties: {
      produits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            titre: { type: 'string' },
            lien: { type: 'string' },
            prixBas: { type: 'number' },
            prixVente: { type: 'number' },
            plateformes: { type: 'array', items: { type: 'string' } },
          },
          required: ['titre', 'lien', 'prixBas', 'prixVente', 'plateformes'],
        },
      },
    },
    required: ['produits'],
  },
}

const CONSIGNE_LISTE =
  "Tu transformes une analyse de marché en liste de dix produits gagnants pour un dropshippeur français. " +
  'Chaque lien doit venir de tes recherches web (page produit ou recherche fournisseur réelle), jamais composé de mémoire. ' +
  "prixBas est le prix d'achat le plus bas constaté, prixVente un prix de revente réaliste en France, tous deux en euros. " +
  'plateformes liste deux ou trois places de vente conseillées parmi : eBay, Kaufland, La Redoute, Leclerc, Carrefour, Vinted, Leboncoin, Google Shopping, Instagram, votre site.'

/** Le générateur réel : Sonnet avec la recherche web. Injectable au banc. */
export async function genererAnalyse(dep: Department, label: string): Promise<AnalyseProduite> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Le service d'intelligence artificielle ne répond pas.")
  const client = new Anthropic({ apiKey })

  const consigne = [
    `Tu es ${dep.agentName}, chef du rayon « ${label} » d'une application de dropshipping française.`,
    "Tu rédiges l'analyse de marché des douze dernières heures de ton rayon, en français, en Markdown simple.",
    'Deux volets obligatoires :',
    '1. **Fournisseurs** — les produits phares du rayon en ce moment chez les fournisseurs (AliExpress, Temu, BigBuy, CJ…) : quoi, à quel prix d\'achat constaté.',
    '2. **Places de marché** — ce qui se vend et se cherche en France dans ce rayon : tendances, saisonnalité, fourchettes de prix constatées.',
    'Utilise la recherche web pour appuyer tes affirmations et cite tes sources. Rien d\'inventé : un chiffre sans source se dit « à vérifier ».',
    'Termine par une courte synthèse actionnable pour un vendeur.',
  ].join('\n')

  const analyse = await client.messages.create({
    model: modele('MODELE_REDACTION', MODELE_REDACTION),
    max_tokens: 2500,
    system: systemeCachable(consigne),
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4, user_location: { type: 'approximate', country: 'FR' } }],
    messages: [{ role: 'user', content: `Rédige l'analyse de marché du rayon ${label} de ce jour.` }],
  })
  const corps = analyse.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
  if (!corps) throw new Error("L'analyse est revenue vide.")

  /*
   * Constaté en production le 04/09/2026 : la recherche web peut répondre
   * « limite dépassée » sur toutes les tentatives — le modèle rédige alors une
   * analyse entière marquée « à vérifier », sans une seule source, et elle
   * était consignée telle quelle. Une analyse sans source ne vaut rien et le
   * vendeur la paie dans le salaire : mieux vaut échouer franchement — rien
   * n'est consigné, la garde des onze heures ne bloque pas, le prochain
   * réveil refait le passage.
   */
  const abouties = analyse.content.filter(
    (b): b is Anthropic.WebSearchToolResultBlock => b.type === 'web_search_tool_result' && Array.isArray(b.content),
  ).length
  if (abouties === 0) {
    throw new Error("La recherche web n'a pas répondu : l'analyse repassera au prochain tour plutôt que de paraître sans source.")
  }

  /*
   * La liste des dix, en JSON forcé par un outil : un tableau exigé par
   * schéma ne revient pas en prose. Les liens doivent sortir des résultats
   * de recherche — un lien composé de tête est un lien mort.
   */
  const liste = await client.messages.create({
    model: modele('MODELE_REDACTION', MODELE_REDACTION),
    max_tokens: 2000,
    system: systemeCachable(CONSIGNE_LISTE),
    tools: [
      { type: 'web_search_20260209', name: 'web_search', max_uses: 2, user_location: { type: 'approximate', country: 'FR' } },
      OUTIL_LISTE,
    ],
    tool_choice: { type: 'auto' },
    messages: [
      { role: 'user', content: `Voici l'analyse du rayon ${label} :\n\n${corps.slice(0, 6000)}\n\nLivre les dix produits gagnants avec l'outil livrer_liste.` },
    ],
  })

  let bloc = liste.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'livrer_liste')

  /*
   * Deuxième leçon du même passage : avec la recherche web en auto, le modèle
   * peut finir en prose sans jamais appeler l'outil — et la liste sortait
   * vide en silence. Le secours rejoue la livraison SANS recherche, outil
   * imposé : un schéma exigé ne revient pas en texte. Ses liens ne peuvent
   * venir que du texte déjà sourcé, jamais de mémoire.
   */
  if (!bloc) {
    const prose = liste.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
    const secours = await client.messages.create({
      model: modele('MODELE_REDACTION', MODELE_REDACTION),
      max_tokens: 1600,
      system: systemeCachable(
        CONSIGNE_LISTE +
          " Ne livre que des liens présents dans le texte fourni ; s'il n'y a aucun lien réel, livre un tableau produits vide.",
      ),
      tools: [OUTIL_LISTE],
      tool_choice: { type: 'tool', name: 'livrer_liste' },
      messages: [
        {
          role: 'user',
          content: `Analyse du rayon ${label} :\n\n${corps.slice(0, 5000)}\n\nNotes de recherche :\n\n${prose.slice(0, 3000)}\n\nLivre la liste avec l'outil livrer_liste.`,
        },
      ],
    })
    bloc = secours.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'livrer_liste')
  }
  const gagnants = ((bloc?.input as { produits?: AnalyseProduite['gagnants'] })?.produits ?? [])
    .filter((p) => p.titre && p.lien && p.prixBas > 0 && p.prixVente > p.prixBas)
    .slice(0, 10)

  return { titre: `Analyse ${label}`, corps, gagnants }
}

export type Generateur = typeof genererAnalyse

/**
 * Un passage complet pour un rayon : l'analyse écrite une fois, lue partout.
 */
export async function passageAutoMode(dep: Department, generer: Generateur = genererAnalyse): Promise<{ rapportId: string; gagnants: number }> {
  const label = findDepartment(dep.key)?.label ?? dep.key
  const produit = await generer(dep, label)
  const jour = new Date().toISOString().slice(0, 10)

  const rapport = await prisma.report.create({
    data: {
      userId: dep.userId,
      departmentId: dep.id,
      section: 'MARKET',
      day: jour,
      title: `${produit.titre} — ${jour}`,
      body: produit.corps,
      // Ce que les listes affichent sans ouvrir : date, rayon, rédacteur.
      summary: { auto: MARQUE_ANALYSE, rayon: label, redacteur: dep.agentName },
    },
  })

  /*
   * The validity gate lives HERE, not in the generator: a winner without a
   * link, or whose selling price does not beat its buying price, is never
   * written — whatever produced it.
   */
  const valides = produit.gagnants
    .filter((g) => g.titre && g.lien && g.prixBas > 0 && g.prixVente > g.prixBas)
    .slice(0, 10)

  const { count } = await prisma.opportunity.createMany({
    data: valides.map((g) => ({
      userId: dep.userId,
      departmentId: dep.id,
      source: 'analyse',
      sourceUrl: g.lien,
      title: g.titre,
      sourcePrice: g.prixBas,
      marketPrice: g.prixVente,
      currency: 'EUR',
      isNew: true,
      notes: `Plateformes conseillées : ${g.plateformes.join(', ')}.`,
      raw: { [MARQUE_GAGNANTS]: true, plateformes: g.plateformes, redacteur: dep.agentName },
    })),
    skipDuplicates: true,
  })

  return { rapportId: rapport.id, gagnants: count }
}

/** Vrai si le rayon a déjà eu son passage dans les onze dernières heures. */
async function dejaServi(depId: string): Promise<boolean> {
  const recent = await prisma.report.findFirst({
    where: {
      departmentId: depId,
      section: 'MARKET',
      summary: { path: ['auto'], equals: MARQUE_ANALYSE },
      createdAt: { gt: new Date(Date.now() - 11 * 3600 * 1000) },
    },
    select: { id: true },
  })
  return Boolean(recent)
}

/**
 * La tournée : chaque rayon en poste, interrupteur levé, au plus une fois par
 * demi-journée. Les passages sont espacés : six recherches web par rayon en
 * rafale, c'est comme ça que la limite « serveur dépassée » du 04/09/2026 a
 * été atteinte — et un passage sans recherche échoue exprès.
 */
export async function tourneeAutoMode(generer: Generateur = genererAnalyse, pauseMs = 20_000): Promise<void> {
  const rayons = await prisma.department.findMany({
    where: { autoMode: true, paidUntil: { gt: new Date() }, NOT: { plan: 'essai' } },
  })

  let dejaUnPassage = false
  for (const dep of rayons) {
    try {
      if (await dejaServi(dep.id)) continue
      if (dejaUnPassage && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
      dejaUnPassage = true
      const fait = await passageAutoMode(dep, generer)
      console.log(`auto-mode : ${dep.agentName} — rapport ${fait.rapportId}, ${fait.gagnants} gagnant(s)`)
    } catch (err) {
      // Un rayon en échec ne prive pas les autres ; l'échec se relit ici.
      console.error(`auto-mode en échec pour ${dep.agentName} (${dep.id})`, err instanceof Error ? err.message : err)
    }
  }
}
