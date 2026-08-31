import type { Platform } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { findCategory, categoryFor } from './categoryCatalog.js'

/**
 * La catégorie de destination, plateforme par plateforme.
 *
 * **Ce qui était cassé, et que le vendeur a vu tout de suite** : ranger une
 * annonce dans le référentiel ne changeait rien aux autres plateformes, qui
 * restaient toutes sur « Divers ». La cause était mécanique — cette fonction ne
 * cherchait l'identifiant que dans l'ancien catalogue TypeScript de 29 entrées.
 * Un identifiant du référentiel en base n'y figure jamais : la recherche
 * échouait, le rapprochement se rabattait sur la catégorie annoncée par la
 * source — souvent du texte de gabarit — et le défaut final s'appliquait.
 *
 * Le référentiel porte pourtant exactement ce qu'il faut, et depuis le début :
 * un chemin dans la taxonomie produit de Google, et une table de
 * correspondances par plateforme. C'est le pivot : n correspondances au lieu de
 * n × n.
 *
 * L'ordre va du plus sûr au plus approximatif, et **aucune étape n'invente**.
 */

/**
 * Les destinations qui acceptent la taxonomie de Google telle quelle.
 *
 * Ce ne sont pas des approximations : Google Shopping la définit, et le
 * catalogue Meta — dont dépendent la boutique Instagram et celle de Facebook —
 * la lit dans le champ `google_product_category` du flux.
 */
const TAXONOMIE_GOOGLE: Platform[] = ['GOOGLE_SHOPPING', 'INSTAGRAM', 'FACEBOOK', 'WISH']

/**
 * Les destinations où le libellé lisible est la bonne réponse.
 *
 * Le « type de produit » de Shopify est du texte libre montré au marchand et à
 * ses clients : le chemin français du référentiel y est exactement ce qu'il
 * faut. La vraie catégorie de taxonomie Shopify, elle, part par un autre chemin
 * (voir `shopifyCatalog.ts`) — ce sont deux champs différents.
 */
const LIBELLE_LISIBLE: Platform[] = ['OWN_SITE', 'SHOPIFY']

/** Les correspondances établies à la main sur une catégorie du référentiel. */
function correspondance(targets: unknown, platform: Platform): string | null {
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) return null
  const valeur = (targets as Record<string, unknown>)[platform]
  return typeof valeur === 'string' && valeur.trim() ? valeur.trim() : null
}

/*
 * Le tableau de mots-clés, conservé pour un seul cas : une annonce sans aucune
 * catégorie. Il ne sert plus qu'à ça, et c'est déjà mieux que rien — mais il ne
 * décide plus rien dès que le référentiel a une réponse.
 */
const RULES: Array<{ keywords: string[]; targets: Partial<Record<Platform, string>> }> = [
  {
    keywords: ['vetement', 'vêtement', 'mode', 'shirt', 'robe', 'pantalon', 'chaussure', 'clothing', 'apparel'],
    targets: {
      LEBONCOIN: 'Vêtements',
      VINTED: 'Vêtements',
      EBAY: 'Clothing, Shoes & Accessories',
      AMAZON: 'Vêtements et accessoires',
    },
  },
  {
    keywords: ['electronique', 'électronique', 'phone', 'telephone', 'ordinateur', 'laptop', 'electronics', 'gadget'],
    targets: {
      LEBONCOIN: 'Informatique',
      VINTED: 'Électronique',
      EBAY: 'Consumer Electronics',
      AMAZON: 'Informatique',
    },
  },
  {
    keywords: ['maison', 'deco', 'décoration', 'furniture', 'meuble', 'home', 'kitchen', 'cuisine'],
    targets: {
      LEBONCOIN: 'Maison & Jardin',
      VINTED: 'Maison',
      EBAY: 'Home & Garden',
      AMAZON: 'Maison et cuisine',
    },
  },
  {
    keywords: ['jouet', 'toy', 'enfant', 'kids', 'bebe', 'bébé'],
    targets: {
      LEBONCOIN: 'Enfants',
      VINTED: 'Enfants',
      EBAY: 'Toys & Hobbies',
      AMAZON: 'Jeux et Jouets',
    },
  },
  {
    keywords: ['bijou', 'jewelry', 'montre', 'watch', 'accessoire'],
    targets: {
      LEBONCOIN: 'Accessoires & Bijoux',
      VINTED: 'Accessoires',
      EBAY: 'Jewelry & Watches',
      AMAZON: 'Bijoux',
    },
  },
]

const DEFAULT_TARGETS: Partial<Record<Platform, string>> = {
  LEBONCOIN: 'Autres',
  VINTED: 'Autres',
  EBAY: 'Everything Else',
  AMAZON: 'Divers',
  FACEBOOK: 'Divers',
  CDISCOUNT: 'Divers',
  GOOGLE_SHOPPING: 'Apparel & Accessories',
  TIKTOK_SHOP: 'Others',
}

/** Le rapprochement par mots-clés, quand il ne reste plus que ça. */
function parMotsCles(sourceCategory: string | null, platform: Platform): string {
  const normalized = (sourceCategory || '').toLowerCase()
  const rule = RULES.find((r) => r.keywords.some((k) => normalized.includes(k)))
  return rule?.targets[platform] || DEFAULT_TARGETS[platform] || 'Divers'
}

export interface DemandeMapping {
  sourceCategory: string | null
  /** L'identifiant du référentiel, ou d'un ancien catalogue pour l'existant. */
  categoryId: string | null
}

/**
 * Rend la catégorie de destination pour une plateforme.
 *
 * Asynchrone parce que la vérité est en base : c'est le prix à payer pour que
 * ranger une annonce ait un effet ailleurs que sur l'écran où on l'a rangée.
 */
export async function mapCategory(demande: DemandeMapping, platform: Platform): Promise<string> {
  const { sourceCategory, categoryId } = demande

  if (categoryId) {
    const categorie = await prisma.category.findUnique({ where: { id: categoryId } })

    if (categorie) {
      // 1. La correspondance posée à la main : la plus sûre, elle a été relue.
      const manuelle = correspondance(categorie.targets, platform)
      if (manuelle) return manuelle

      // 2. Le pivot Google, là où il est la valeur attendue et non une
      //    approximation.
      if (TAXONOMIE_GOOGLE.includes(platform) && categorie.google) return categorie.google

      // 3. Le chemin lisible, là où c'est du texte libre.
      if (LIBELLE_LISIBLE.includes(platform)) return categorie.path

      /*
       * 4. Le chemin du référentiel, faute de correspondance exacte.
       *
       * Ce n'est pas la valeur qu'attend Leboncoin ni Amazon — leur taxonomie
       * réelle demande un travail de correspondance qui reste à faire, rayon
       * par rayon. Mais « High-tech > Périphériques > Souris » dit la vérité et
       * se corrige d'un coup d'œil, là où « Divers » ne dit rien et se recopie
       * tel quel dans le formulaire.
       */
      return categorie.path
    }

    // L'identifiant vient de l'ancien catalogue : les annonces importées avant
    // le référentiel en portent encore, et elles doivent continuer de marcher.
    const ancienne = findCategory(categoryId)
    if (ancienne) return categoryFor(ancienne, platform)
  }

  return parMotsCles(sourceCategory, platform)
}

/**
 * La même chose pour plusieurs plateformes, en une seule lecture.
 *
 * L'écran de l'annonce affiche la catégorie de chaque destination : appeler
 * `mapCategory` vingt fois ferait vingt allers-retours vers la base pour lire
 * vingt fois la même ligne.
 */
export async function mapCategories(
  demande: DemandeMapping,
  platforms: Platform[],
): Promise<Record<string, string>> {
  const categorie = demande.categoryId
    ? await prisma.category.findUnique({ where: { id: demande.categoryId } })
    : null

  const sortie: Record<string, string> = {}
  for (const platform of platforms) {
    if (categorie) {
      const manuelle = correspondance(categorie.targets, platform)
      sortie[platform] = manuelle
        ? manuelle
        : TAXONOMIE_GOOGLE.includes(platform) && categorie.google
          ? categorie.google
          : categorie.path
      continue
    }
    const ancienne = findCategory(demande.categoryId)
    sortie[platform] = ancienne
      ? categoryFor(ancienne, platform)
      : parMotsCles(demande.sourceCategory, platform)
  }
  return sortie
}
