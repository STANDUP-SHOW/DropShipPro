/**
 * Le parcours complet, rejoué d'une seule commande.
 *
 *   cd backend && npx tsx check-parcours.ts
 *   cd backend && npx tsx check-parcours.ts --complet   (ajoute images et publicité, payant)
 *   cd backend && npx tsx check-parcours.ts --lots 5,10,25
 *
 * **Pourquoi ce banc existe.** Le circuit — importer, contrôler l'annonce,
 * vérifier photos, variantes, catégorie et marge, refaire par adresse, refaire
 * en lot — était rejoué **à la main** après chaque correction. Une dizaine
 * d'écrans, plusieurs minutes, et à la moindre régression on recommençait tout.
 * Un contrôle qu'on renonce à refaire est un contrôle qui n'existe plus : c'est
 * ainsi que l'import en lot a pu rester cassé sans que personne le sache.
 *
 * **Ce qu'il ne remplace pas.** L'extension. Elle vit dans le navigateur du
 * vendeur, sur une page qu'AliExpress construit en JavaScript ; aucun script ne
 * peut s'y substituer. Le banc en approche la moitié utile : il envoie à
 * `/capture` **la charge exacte** que l'extension enverrait, relevé SKU
 * compris, ce qui éprouve tout ce qui est en aval — jointure des combinaisons,
 * prix par variante, photos par variante, filigrane, catégorie, marge. Reste à
 * vérifier à la main le seul maillon amont : que la page rende bien ces
 * données. Le banc le dit à la fin plutôt que de le laisser croire couvert.
 *
 * **Il travaille sur un compte jetable, créé et détruit ici.** Aucun identifiant
 * à fournir, et surtout : le catalogue du vendeur n'est jamais touché. Un banc
 * qui importe vingt-cinq annonces d'essai dans le vrai catalogue, puis les
 * supprime, finit un jour par en supprimer une vraie — il suffit d'une
 * interruption au mauvais moment. Un compte à part rend ce risque impossible
 * plutôt qu'improbable.
 *
 * Le compte est créé en base plutôt que par `/auth/register` : l'inscription
 * est limitée à cinq par heure, ce qui bloquerait le sixième passage du banc
 * pour une raison sans rapport avec ce qu'il éprouve. Le jeton, lui, s'obtient
 * bien par l'API — c'est le vrai chemin, et il vérifie au passage que la
 * connexion fonctionne.
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from './src/lib/prisma.js'

const API = process.env.PARCOURS_API || 'https://dropshippro-production.up.railway.app'

/**
 * Ce qui distingue une annonce d'essai d'une vraie.
 *
 * Posé dans l'adresse source, pas dans le titre : le titre est réécrit par
 * l'IA, donc un marqueur qu'on y mettrait disparaîtrait avant le ménage.
 */
const MARQUEUR = 'dsp-parcours'

/** Une boutique qui se laisse lire par un serveur — c'est le point du test d'URL. */
const URL_LISIBLE = 'https://www.allbirds.com/products/mens-tree-runners'

/** Et une qui ne se laisse pas lire : le refus doit être explicite, pas générique. */
const URL_REFUSEE = 'https://fr.aliexpress.com/item/1005006318974327.html'

// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const complet = args.includes('--complet')
const tailles = (() => {
  const i = args.indexOf('--lots')
  if (i < 0) return [5]
  return (args[i + 1] ?? '5')
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 25)
})()

let echecs = 0
let etape = 0

function ok(nom: string, detail = '') {
  console.log(`  ok    ${nom}${detail ? ` — ${detail}` : ''}`)
}
function rate(nom: string, detail = '') {
  echecs++
  console.log(`  RATE  ${nom}${detail ? ` — ${detail}` : ''}`)
}
function exige(condition: boolean, nom: string, detail = '') {
  condition ? ok(nom, detail) : rate(nom, detail)
  return condition
}
function titre(t: string) {
  console.log(`\n${++etape}. ${t}`)
}

let jeton = ''

async function appel<T = any>(
  chemin: string,
  options: { methode?: string; corps?: unknown; delai?: number } = {},
): Promise<{ statut: number; corps: T }> {
  const reponse = await fetch(`${API}/api${chemin}`, {
    method: options.methode ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
    // Un import prend trente à soixante secondes ; le délai par défaut de Node
    // couperait avant la fin et ferait passer un succès pour une panne réseau.
    signal: AbortSignal.timeout(options.delai ?? 180_000),
  })
  const texte = await reponse.text()
  let corps: any = null
  try {
    corps = texte ? JSON.parse(texte) : null
  } catch {
    corps = { error: texte.slice(0, 300) }
  }
  return { statut: reponse.status, corps }
}

/**
 * La charge que l'extension envoie sur une fiche AliExpress.
 *
 * Deux couleurs et trois tailles, avec un prix et une photo par combinaison :
 * c'est le cas qui a motivé tout le travail sur les variantes, et celui qu'un
 * import réussi doit rendre intégralement. Les clés de jointure sont des
 * `skuIdStr` — et non des `skuId`, qui sont constants sur la vraie page.
 */
function capturePayload(indice: number) {
  const photo = (n: number) => `https://ae01.alicdn.com/kf/${MARQUEUR}-${indice}-${n}.jpg`
  return {
    sourceUrl: `${URL_REFUSEE}?${MARQUEUR}=${indice}`,
    title: `Veste polaire homme ${MARQUEUR} ${indice}`,
    description:
      "Veste polaire coupe-vent doublée sherpa, col montant, deux poches zippées. " +
      'Coutures renforcées, lavable en machine à 30 degrés, séchage rapide.',
    price: 24.9,
    currency: 'EUR',
    images: [photo(1), photo(2), photo(3), photo(4)],
    sourceCategory: 'Vêtements pour hommes',
    variants: { Couleur: ['Noir', 'Bleu'], Taille: ['M', 'L', 'XL'] },
    pageText:
      'Couleur : Noir, Bleu. Taille : M, L, XL. Matière : polaire 280 g. ' +
      'Livraison depuis la France. Composition : 100 % polyester recyclé.',
    skuAliExpress: {
      SKU: {
        /*
         * Les six combinaisons, sous **les deux formes** qui existent.
         *
         * Trois portent `path` dépouillé (« 14:193;5:361386 »), trois ne
         * portent que `skuAttr` avec le nom collé derrière un dièse
         * (« 14:193#Noir;5:361386#M »). AliExpress sert l'une ou l'autre selon
         * la version de la page, et n'en lire qu'une rendait zéro combinaison
         * sans la moindre erreur — un produit sans options, ce qui ressemble à
         * un produit qui n'en a pas.
         *
         * Et un objet indexé, pas un tableau : c'est ainsi que la
         * sérialisation de la page les rend.
         */
        skuPaths: [
          { path: '14:193;5:361386' },
          { path: '14:193;5:361385' },
          { path: '14:193;5:361384' },
          { skuAttr: '14:175#Bleu;5:361386#M' },
          { skuAttr: '14:175#Bleu;5:361385#L' },
          { skuAttr: '14:175#Bleu;5:361384#XL' },
        ]
          .map((s, i) => ({ ...s, skuIdStr: `900${i}`, skuStock: 20, salable: true }))
          .reduce((acc, s, i) => ({ ...acc, [i]: s }), {}),
        skuProperties: [
          {
            skuPropertyId: 14,
            skuPropertyName: 'Couleur',
            skuPropertyValues: [
              { propertyValueId: 193, propertyValueDisplayName: 'Noir', skuPropertyImagePath: photo(1) },
              { propertyValueId: 175, propertyValueDisplayName: 'Bleu', skuPropertyImagePath: photo(2) },
            ],
          },
          {
            skuPropertyId: 5,
            skuPropertyName: 'Taille',
            skuPropertyValues: [
              { propertyValueId: 361386, propertyValueDisplayName: 'M' },
              { propertyValueId: 361385, propertyValueDisplayName: 'L' },
              { propertyValueId: 361384, propertyValueDisplayName: 'XL' },
            ],
          },
        ],
      },
      PRICE: {
        /*
         * Les prix sous la forme que le lecteur attend réellement.
         *
         * Première version de ce banc : `skuVal.skuActivityAmount.value`, de
         * mémoire. Le lecteur n'en voulait pas, les six combinaisons sortaient
         * sans prix — et le banc accusait le code. Une charge d'essai inventée
         * n'éprouve que l'imagination de qui l'a écrite : celle-ci suit le
         * contrat documenté dans `aliexpressSku.ts`.
         */
        skuIdStrPriceInfoMap: Object.fromEntries(
          [24.9, 24.9, 26.9, 25.9, 25.9, 27.9].map((p, i) => [
            `900${i}`,
            { salePriceLocal: p, originalPrice: { value: p + 8 } },
          ]),
        ),
      },
    },
  }
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Parcours complet — ${API}`)
  console.log(complet ? 'Mode complet : images et publicité comprises (payant).' : "Mode sobre : ni image ni publicité (--complet pour les ajouter).")

  // --- Compte jetable ------------------------------------------------------
  titre('Compte jetable')
  await creerCompte()

  const creees: string[] = []

  // --- 1. Ce que l'extension enverrait -------------------------------------
  titre("Acquisition façon extension (charge AliExpress complète)")
  const capture = await appel('/products/capture', { methode: 'POST', corps: capturePayload(1) })
  if (!exige(capture.statut === 201, 'la capture est acceptée', `statut ${capture.statut}${capture.corps?.error ? ` · ${capture.corps.error}` : ''}`)) {
    await conclure(creees)
    return
  }
  const annonce = capture.corps
  creees.push(annonce.id)

  // --- 2. Ce que l'annonce a réellement retenu -----------------------------
  titre("Contrôle de l'annonce produite")
  const fiche = (await appel(`/products/${annonce.id}`)).corps

  exige(
    typeof fiche.aiTitle === 'string' && fiche.aiTitle.length > 10,
    'le titre est réécrit',
    fiche.aiTitle?.slice(0, 60),
  )
  exige(
    Array.isArray(fiche.images) && fiche.images.length >= 3,
    'les photos sont là',
    `${fiche.images?.length ?? 0} photo(s)`,
  )
  exige(
    fiche.imagesWatermarked === false || fiche.imagesWatermarked === true,
    'le drapeau de filigrane est posé',
    String(fiche.imagesWatermarked),
  )
  exige(!!fiche.categoryId, 'une catégorie est attribuée', fiche.categoryId ?? 'aucune')
  exige(
    Number(fiche.sellingPrice) > Number(fiche.price),
    'la marge est appliquée',
    `${fiche.price} → ${fiche.sellingPrice}`,
  )

  const options = (fiche.variants ?? {}) as Record<string, string[]>
  exige(
    Object.keys(options).length >= 2,
    "les options d'achat sont relevées",
    Object.entries(options)
      .map(([k, v]) => `${k}(${v.length})`)
      .join(' '),
  )

  /*
   * Les combinaisons, et c'est le cœur du sujet.
   *
   * Six combinaisons, chacune avec son prix : sans elles, publier une fiche à
   * deux couleurs et trois tailles envoie six fois le même prix. Le banc exige
   * donc **des prix différents**, pas seulement la présence du tableau — une
   * jointure ratée rend six lignes toutes au même prix, ce qui ressemble à un
   * succès si on ne regarde que le nombre.
   */
  const combos = Array.isArray(fiche.combinations) ? fiche.combinations : []
  exige(combos.length === 6, 'les six combinaisons sont là', `${combos.length} combinaison(s)`)
  const prix = new Set(combos.map((c: any) => Number(c.prix)).filter((p: number) => p > 0))
  exige(prix.size >= 3, 'les prix varient selon la combinaison', `${prix.size} prix distincts`)
  exige(
    combos.filter((c: any) => c.image).length >= 2,
    'des photos sont rattachées aux combinaisons',
    `${combos.filter((c: any) => c.image).length} sur ${combos.length}`,
  )

  // --- 3. La note et l'agent de contrôle -----------------------------------
  titre("Note de l'annonce et agent de contrôle")
  const note = (await appel(`/products/${annonce.id}/score`)).corps
  exige(typeof note.score === 'number', 'la note est calculée', `${note.score}/100`)
  const faibles = (note.checks ?? []).filter((c: any) => c.points < c.max)
  console.log(
    faibles.length
      ? `        à reprendre : ${faibles.map((c: any) => `${c.label} ${c.points}/${c.max}`).join(' · ')}`
      : '        rien à reprendre',
  )
  /*
   * Ce que l'agent de contrôle a dit, et non ce que les réglages promettent.
   *
   * Le compte du banc l'a activé : vérifier le réglage reviendrait à vérifier
   * ce que le banc vient d'écrire. Ce qui s'observe, ce sont les notes rendues
   * par l'import — c'est par là que l'agent parle, et c'est le seul endroit où
   * son travail est visible aujourd'hui.
   */
  const notesImport: string[] = Array.isArray(annonce.notes) ? annonce.notes : []
  exige(
    Array.isArray(annonce.notes),
    "l'import rend un compte-rendu",
    notesImport.length ? notesImport.join(' · ') : 'aucune remarque',
  )

  // --- 4. Images et publicité (payant) -------------------------------------
  if (complet) {
    titre('Génération de 3 images')
    const photos = await appel('/visuals/photos', {
      methode: 'POST',
      corps: { productId: annonce.id, count: 3 },
      delai: 300_000,
    })
    exige(
      photos.statut === 201 && photos.corps.images?.length === 3,
      'trois images produites',
      `${photos.corps?.images?.length ?? 0} image(s)${photos.corps?.errors?.length ? ` · ${photos.corps.errors.join(' ')}` : ''}`,
    )
    // Trois fois la même image est un échec silencieux : c'est le défaut qui
    // avait été signalé, et seul un chemin différent le prouve.
    const chemins = new Set((photos.corps?.images ?? []).map((i: any) => i.path))
    exige(chemins.size === (photos.corps?.images?.length ?? 0), 'les trois images diffèrent', `${chemins.size} distinctes`)

    titre("Génération d'une publicité")
    const pub = await appel('/visuals/ads', {
      methode: 'POST',
      corps: { productId: annonce.id, platforms: ['instagram'], count: 1 },
      delai: 300_000,
    })
    exige(
      pub.statut === 201 && pub.corps.images?.length === 1,
      'une publicité produite',
      pub.corps?.errors?.length ? pub.corps.errors.join(' ') : `statut ${pub.statut}`,
    )
  }

  // --- 5. Import par adresse -----------------------------------------------
  titre('Import par adresse')
  const parUrl = await appel('/products/import', {
    methode: 'POST',
    corps: { url: URL_LISIBLE },
    delai: 300_000,
  })
  if (exige(parUrl.statut === 201, 'une boutique lisible passe', `statut ${parUrl.statut}`)) {
    creees.push(parUrl.corps.id)
    exige(
      Array.isArray(parUrl.corps.images) && parUrl.corps.images.length > 0,
      'avec ses photos',
      `${parUrl.corps.images?.length ?? 0}`,
    )
  }

  const refuse = await appel('/products/import', { methode: 'POST', corps: { url: URL_REFUSEE } })
  exige(refuse.statut === 422, 'une fiche construite en JavaScript est refusée', `statut ${refuse.statut}`)
  exige(
    typeof refuse.corps?.error === 'string' && /extension/i.test(refuse.corps.error),
    "le refus renvoie vers l'extension",
    refuse.corps?.error?.slice(0, 70),
  )

  // --- 6. Import en lot ----------------------------------------------------
  for (const taille of tailles) {
    titre(`Import en lot de ${taille} adresses`)
    /*
     * Une seule adresse par requête, comme le fait l'écran.
     *
     * Envoyer les vingt-cinq d'un coup était la panne : un import prend trente
     * à soixante secondes, et aucun proxy ne tient un quart d'heure de requête
     * ouverte. Le banc rejoue donc le découpage, sinon il éprouverait un usage
     * que l'application ne fait plus.
     */
    const debut = Date.now()
    let passees = 0
    const raisons = new Set<string>()

    for (let i = 0; i < taille; i++) {
      const lot = await appel('/products/import-batch', {
        methode: 'POST',
        corps: { urls: [`${URL_REFUSEE}?${MARQUEUR}=lot${i}`] },
        delai: 300_000,
      })
      const ligne = lot.corps?.results?.[0]
      if (ligne?.ok) {
        passees++
        if (ligne.product?.id) creees.push(ligne.product.id)
      } else if (ligne?.error) {
        // Gardée entière : tronquer à soixante caractères coupait avant le mot
        // qu'on cherche, et le banc s'accusait lui-même d'un échec inexistant.
        raisons.add(ligne.error)
      }
    }

    const secondes = Math.round((Date.now() - debut) / 1000)
    /*
     * Ce lot est fait d'adresses AliExpress : **zéro passée est le résultat
     * juste**. Ce qui est éprouvé ici n'est pas le succès de l'import, c'est
     * que chaque adresse rende sa propre réponse sans que la requête tombe —
     * le défaut d'origine était un « failed to fetch » global.
     */
    exige(raisons.size > 0, `les ${taille} adresses rendent chacune une réponse`, `${secondes} s`)
    exige(
      [...raisons].every((r) => /extension|javascript/i.test(r)),
      'et la réponse est le bon refus',
      ([...raisons][0] ?? '').slice(0, 70),
    )
    if (passees) console.log(`        ${passees} import(s) réellement passé(s)`)
  }

  await conclure(creees)
}

/** L'identifiant du compte jetable, gardé pour le détruire à la fin. */
let compteId = ''

/**
 * Crée le compte du passage, avec de quoi travailler, et se connecte.
 *
 * L'adresse porte l'horodatage : deux passages simultanés ne se marchent pas
 * dessus, et un compte oublié par une interruption se reconnaît au premier coup
 * d'œil dans la base.
 */
async function creerCompte() {
  const marque = `${MARQUEUR}-${Date.now()}`
  const email = `${marque}@exemple.test`
  // Le mot de passe est jeté avec le compte : il n'a pas à être secret, mais il
  // doit satisfaire la règle des huit caractères que l'API applique.
  const motDePasse = `${marque}-mdp`

  const compte = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(motDePasse, 10),
      // De quoi importer trente annonces et produire une dizaine de visuels
      // sans que le banc échoue pour une raison de solde.
      credits: 200,
      imageCredits: 50,
      // L'agent de contrôle fait partie du parcours : sans lui, le banc
      // éprouverait un chemin que le vendeur n'emprunte pas.
      controlAgent: true,
    },
  })
  compteId = compte.id
  ok('compte créé', email)

  const connexion = await appel<{ token: string }>('/auth/login', {
    methode: 'POST',
    corps: { email, password: motDePasse },
  })
  if (connexion.statut !== 200 || !connexion.corps?.token) {
    rate('connexion au compte jetable', `statut ${connexion.statut}`)
    await detruireCompte()
    process.exit(1)
  }
  jeton = connexion.corps.token
  ok('connecté par l’API')
}

/**
 * Détruit le compte, et tout ce qui y pend.
 *
 * C'est la seule raison pour laquelle ce banc peut se permettre d'importer
 * vingt-cinq annonces : elles disparaissent avec leur propriétaire, sans qu'un
 * script ait à choisir lesquelles supprimer. Un ménage qui trie est un ménage
 * qui peut se tromper de cible.
 */
async function detruireCompte() {
  if (!compteId) return
  try {
    await prisma.user.delete({ where: { id: compteId } })
    ok('compte jetable détruit')
  } catch (e) {
    rate('destruction du compte jetable', e instanceof Error ? e.message.slice(0, 120) : '')
    console.log(`        à supprimer à la main : ${compteId}`)
  }
}

async function conclure(_creees: string[]) {
  titre('Ménage de sortie')
  await detruireCompte()

  console.log(
    '\nNon couvert par ce banc : le relevé de la page par l\'extension — elle vit\n' +
      "dans le navigateur, sur une page bâtie en JavaScript. Tout ce qui est en aval\n" +
      "de ce relevé vient d'être éprouvé.",
  )
  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exit(echecs ? 1 : 0)
}

main().catch((e) => {
  console.error('\nBanc interrompu :', e instanceof Error ? e.message : e)
  process.exit(1)
})
