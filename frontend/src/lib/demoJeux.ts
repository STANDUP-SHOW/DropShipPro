/**
 * Les jeux de données du mode DÉMO — voir lib/demo.ts.
 *
 * Un seul fichier pour toute l'application : les pages piochent ici quand le
 * mode est levé depuis le tableau de bord. Les identifiants commencent tous
 * par `demo-` : c'est la garde qu'utilisent les pages pour qu'aucun geste
 * (répondre, expédier, écarter…) ne parte jamais vers l'API sur une ligne de
 * démonstration. Les dates sont relatives au jour du regard, pour que la
 * démonstration ne vieillisse pas.
 */

const jour = 86400000
const il_y_a = (jours: number, heures = 0) => new Date(Date.now() - jours * jour - heures * 3600000).toISOString()

/* ------------------------------------------------------------------ */
/* Commandes — servies à Ventes, Livraisons, Commandes fournisseurs,
   SAV fournisseurs : quatre pages, un seul jeu, tous les états.       */
/* ------------------------------------------------------------------ */

export const DEMO_COMMANDES = [
  {
    id: 'demo-c1',
    status: 'NEW',
    platform: 'EBAY',
    buyerName: 'Camille Rousseau',
    buyerEmail: 'camille.r@example.com',
    amount: 49.9,
    currency: 'EUR',
    createdAt: il_y_a(0, 2),
    trackingNumber: null,
    buyerAddress: { street: '14 rue des Lilas', zip: '69003', city: 'Lyon', country: 'France' },
    product: { id: 'demo-p1', title: 'Montre connectée AMOLED', aiTitle: 'Montre connectée AMOLED 1,43" — suivi cardiaque', sourceUrl: 'https://www.example.com/fournisseur/montre' },
  },
  {
    id: 'demo-c2',
    status: 'NEW',
    platform: 'KAUFLAND',
    buyerName: 'Julien Petit',
    buyerEmail: null,
    amount: 27.5,
    currency: 'EUR',
    createdAt: il_y_a(0, 6),
    trackingNumber: null,
    buyerAddress: { street: 'Hauptstraße 12', zip: '10115', city: 'Berlin', country: 'Allemagne' },
    product: { id: 'demo-p2', title: 'Écouteurs sans fil', aiTitle: 'Écouteurs Bluetooth réduction de bruit — 30 h', sourceUrl: 'https://www.example.com/fournisseur/ecouteurs' },
  },
  {
    id: 'demo-c3',
    status: 'ORDERED_FROM_SUPPLIER',
    platform: 'OWN_SITE',
    buyerName: 'Nadia Benali',
    buyerEmail: 'nadia.b@example.com',
    amount: 89.0,
    currency: 'EUR',
    createdAt: il_y_a(1, 3),
    trackingNumber: null,
    buyerAddress: { street: '3 impasse du Port', zip: '34000', city: 'Montpellier', country: 'France' },
    product: { id: 'demo-p3', title: 'Aspirateur robot', aiTitle: 'Aspirateur robot laser 3000 Pa — silencieux', sourceUrl: 'https://www.example.com/fournisseur/aspirateur' },
  },
  {
    id: 'demo-c4',
    status: 'SHIPPED',
    platform: 'EBAY',
    buyerName: 'Thomas Leroy',
    buyerEmail: 'thomas.l@example.com',
    amount: 34.9,
    currency: 'EUR',
    createdAt: il_y_a(2, 5),
    trackingNumber: '6A12345678901',
    buyerAddress: { street: '27 avenue Jean Jaurès', zip: '31000', city: 'Toulouse', country: 'France' },
    product: { id: 'demo-p4', title: 'Lampe de bureau LED', aiTitle: 'Lampe de bureau LED — 5 intensités, port USB', sourceUrl: 'https://www.example.com/fournisseur/lampe' },
  },
  {
    id: 'demo-c5',
    status: 'SHIPPED',
    platform: 'SHOPIFY',
    buyerName: 'Émilie Garnier',
    buyerEmail: 'emilie.g@example.com',
    amount: 59.0,
    currency: 'EUR',
    createdAt: il_y_a(3, 1),
    trackingNumber: 'LP123456789FR',
    buyerAddress: { street: '8 rue de la Paix', zip: '75002', city: 'Paris', country: 'France' },
    product: { id: 'demo-p5', title: 'Sac à dos urbain', aiTitle: 'Sac à dos urbain antivol — port USB, 25 L', sourceUrl: 'https://www.example.com/fournisseur/sac' },
  },
  {
    id: 'demo-c6',
    status: 'DELIVERED',
    platform: 'KAUFLAND',
    buyerName: 'Lucas Meyer',
    buyerEmail: null,
    amount: 22.9,
    currency: 'EUR',
    createdAt: il_y_a(6, 4),
    trackingNumber: '6A98765432109',
    buyerAddress: { street: 'Gartenweg 4', zip: '50667', city: 'Cologne', country: 'Allemagne' },
    product: { id: 'demo-p6', title: 'Chargeur sans fil', aiTitle: 'Chargeur sans fil 15 W — charge rapide', sourceUrl: 'https://www.example.com/fournisseur/chargeur' },
  },
  {
    id: 'demo-c7',
    status: 'DELIVERED',
    platform: 'OWN_SITE',
    buyerName: 'Sophie Marchand',
    buyerEmail: 'sophie.m@example.com',
    amount: 119.0,
    currency: 'EUR',
    createdAt: il_y_a(9, 2),
    trackingNumber: 'LP987654321FR',
    buyerAddress: { street: '5 chemin des Vignes', zip: '33000', city: 'Bordeaux', country: 'France' },
    product: { id: 'demo-p7', title: 'Friteuse sans huile', aiTitle: 'Friteuse sans huile 5,5 L — 8 programmes', sourceUrl: 'https://www.example.com/fournisseur/friteuse' },
  },
  {
    id: 'demo-c8',
    status: 'REFUNDED',
    platform: 'EBAY',
    buyerName: 'Antoine Dubois',
    buyerEmail: 'antoine.d@example.com',
    amount: 18.5,
    currency: 'EUR',
    createdAt: il_y_a(12, 0),
    trackingNumber: null,
    buyerAddress: { street: '19 rue Nationale', zip: '59000', city: 'Lille', country: 'France' },
    product: { id: 'demo-p8', title: 'Coque de téléphone', aiTitle: 'Coque antichoc transparente — bords renforcés', sourceUrl: 'https://www.example.com/fournisseur/coque' },
  },
  {
    // La commande en difficulté : c'est elle que le SAV fournisseurs montre.
    id: 'demo-c9',
    status: 'ORDERED_FROM_SUPPLIER',
    platform: 'OWN_SITE',
    buyerName: 'Hugo Fontaine',
    buyerEmail: 'hugo.f@example.com',
    amount: 42.0,
    currency: 'EUR',
    createdAt: il_y_a(4, 7),
    trackingNumber: null,
    supplierOrderError: 'Variante « Noir / 42 » en rupture chez le fournisseur — proposer la variante « Noir / 43 » ou rembourser.',
    buyerAddress: { street: '2 place du Marché', zip: '44000', city: 'Nantes', country: 'France' },
    product: { id: 'demo-p9', title: 'Baskets running', aiTitle: 'Baskets running légères — semelle amortie', sourceUrl: 'https://www.example.com/fournisseur/baskets' },
  },
]

/** Le détail qu'ouvre la page Livraisons, bâti depuis la même ligne. */
export function demoDetailCommande(id: string) {
  const o = DEMO_COMMANDES.find((c) => c.id === id)
  if (!o) return null
  return {
    ...o,
    carrier: o.trackingNumber ? (o.trackingNumber.startsWith('LP') ? 'laposte' : 'colissimo') : null,
    supplierOrderUrl: null,
    externalOrderId: null,
    conversationId: null,
    tracking: o.trackingNumber
      ? {
          number: o.trackingNumber,
          carrier: 'laposte',
          carrierLabel: 'La Poste',
          url: 'https://www.laposte.fr/outils/suivre-vos-envois',
          generic: false,
        }
      : null,
    events: o.trackingNumber
      ? [
          { date: il_y_a(1, 6), status: 'Pris en charge par le transporteur', location: 'Plateforme de tri' },
          { date: il_y_a(0, 20), status: 'En cours d\'acheminement', location: 'Centre régional' },
          ...(o.status === 'DELIVERED' ? [{ date: il_y_a(0, 4), status: 'Livré', location: o.buyerAddress.city }] : []),
        ]
      : null,
  }
}

/* ------------------------------------------------------------------ */
/* Messagerie market places                                            */
/* ------------------------------------------------------------------ */

export const DEMO_CONVERSATIONS = [
  {
    id: 'demo-m1',
    platform: 'EBAY',
    customerName: 'Camille Rousseau',
    customerEmail: 'camille.r@example.com',
    subject: 'Délai de livraison',
    status: 'OPEN' as const,
    unread: true,
    agentName: null,
    lastMessageAt: il_y_a(0, 1),
    preview: 'Bonjour, ma commande passée dimanche est-elle expédiée ? Je pars vendredi…',
    channel: 'email' as const,
  },
  {
    id: 'demo-m2',
    platform: 'KAUFLAND',
    customerName: 'Lukas Weber',
    customerEmail: null,
    subject: 'Frage zur Größe',
    status: 'OPEN' as const,
    unread: true,
    agentName: null,
    lastMessageAt: il_y_a(0, 5),
    preview: 'Fällt die Jacke normal aus oder eher klein ?',
    channel: 'manuel' as const,
  },
  {
    id: 'demo-m3',
    platform: 'OWN_SITE',
    customerName: 'Sophie Marchand',
    customerEmail: 'sophie.m@example.com',
    subject: 'Facture demandée',
    status: 'OPEN' as const,
    unread: false,
    agentName: 'Camille',
    lastMessageAt: il_y_a(1, 2),
    preview: 'Pouvez-vous me faire parvenir la facture de ma friteuse ? Merci !',
    channel: 'email' as const,
  },
  {
    id: 'demo-m4',
    platform: 'EBAY',
    customerName: 'Thomas Leroy',
    customerEmail: 'thomas.l@example.com',
    subject: 'Numéro de suivi',
    status: 'WAITING' as const,
    unread: false,
    agentName: 'Camille',
    lastMessageAt: il_y_a(2, 6),
    preview: 'Merci pour le numéro de suivi, je surveille ça.',
    channel: 'email' as const,
  },
  {
    id: 'demo-m5',
    platform: 'LEBONCOIN',
    customerName: 'Julie Renard',
    customerEmail: null,
    subject: null,
    status: 'CLOSED' as const,
    unread: false,
    agentName: null,
    lastMessageAt: il_y_a(8, 3),
    preview: 'Parfait, bien reçu. Merci pour tout !',
    channel: 'manuel' as const,
  },
]

/** Le fil ouvert d'une conversation de démonstration. */
export function demoFilConversation(id: string) {
  const c = DEMO_CONVERSATIONS.find((x) => x.id === id)
  if (!c) return null
  return {
    id: c.id,
    platform: c.platform,
    customerName: c.customerName,
    customerEmail: c.customerEmail,
    subject: c.subject,
    status: c.status,
    agentName: c.agentName,
    channel: c.channel,
    notice:
      c.channel === 'email'
        ? 'Votre réponse partira par e-mail, directement au client.'
        : 'Cette plateforme n\'accepte pas les réponses par e-mail : copiez votre réponse et collez-la dans sa messagerie.',
    messages: [
      {
        id: `${c.id}-1`,
        direction: 'IN',
        body: c.preview,
        author: c.customerName,
        sentVia: null,
        drafted: false,
        createdAt: c.lastMessageAt,
      },
      ...(c.status !== 'OPEN'
        ? [
            {
              id: `${c.id}-2`,
              direction: 'OUT',
              body: 'Bonjour, merci pour votre message — votre colis est en route, voici le suivi : LP123456789FR. Belle journée !',
              author: 'Camille',
              sentVia: 'email',
              drafted: true,
              createdAt: il_y_a(1, 1),
            },
          ]
        : []),
    ],
  }
}

/* ------------------------------------------------------------------ */
/* SAV clients                                                         */
/* ------------------------------------------------------------------ */

const savLigne = (n: number, raison: string, jours: number, statut: string, nom: string, montant: number, titre: string) => ({
  id: `demo-c${n}`,
  platform: n % 2 ? 'EBAY' : 'OWN_SITE',
  status: statut,
  buyerName: nom,
  amount: montant,
  currency: 'EUR',
  jours,
  raison,
  produit: { id: `demo-p${n}`, titre, image: null },
})

export const DEMO_SAV = {
  sansSuivi: [
    savLigne(3, 'Commandée au fournisseur il y a 2 jours, toujours aucun numéro de suivi.', 2, 'ORDERED_FROM_SUPPLIER', 'Nadia Benali', 89, 'Aspirateur robot laser 3000 Pa'),
    savLigne(9, 'Le fournisseur a signalé une rupture sur la variante commandée.', 4, 'ORDERED_FROM_SUPPLIER', 'Hugo Fontaine', 42, 'Baskets running légères'),
  ],
  tropLong: [
    savLigne(4, 'Expédiée depuis 9 jours — au-delà du délai annoncé à l\'acheteur.', 9, 'SHIPPED', 'Thomas Leroy', 34.9, 'Lampe de bureau LED'),
  ],
  jamaisCommande: [
    savLigne(1, 'Vente encaissée il y a 2 heures, pas encore commandée au fournisseur.', 0, 'NEW', 'Camille Rousseau', 49.9, 'Montre connectée AMOLED'),
  ],
  conversations: [
    { id: 'demo-m1', platform: 'EBAY', customerName: 'Camille Rousseau', subject: 'Délai de livraison', unread: true, lastMessageAt: il_y_a(0, 1) },
    { id: 'demo-m2', platform: 'KAUFLAND', customerName: 'Lukas Weber', subject: 'Frage zur Größe', unread: true, lastMessageAt: il_y_a(0, 5) },
  ],
  aTraiter: 4,
}

/* ------------------------------------------------------------------ */
/* Comptabilité                                                        */
/* ------------------------------------------------------------------ */

const cleMois = (recul: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() - recul)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const DEMO_COMPTA = {
  parMois: [
    { mois: cleMois(2), commandes: 41, rembourses: 2, chiffre: 1874.6, cout: 812.4, marge: 1062.2 },
    { mois: cleMois(1), commandes: 58, rembourses: 3, chiffre: 2642.3, cout: 1105.7, marge: 1536.6 },
    { mois: cleMois(0), commandes: 36, rembourses: 1, chiffre: 1691.8, cout: 702.1, marge: 989.7 },
  ],
  parPlateforme: [
    { platform: 'EBAY', commandes: 52, rembourses: 3, chiffre: 2247.9, cout: 981.3, marge: 1266.6 },
    { platform: 'KAUFLAND', commandes: 34, rembourses: 1, chiffre: 1512.4, cout: 644.2, marge: 868.2 },
    { platform: 'OWN_SITE', commandes: 31, rembourses: 1, chiffre: 1789.5, cout: 701.6, marge: 1087.9 },
    { platform: 'SHOPIFY', commandes: 18, rembourses: 1, chiffre: 658.9, cout: 293.1, marge: 365.8 },
  ],
  remboursements: [
    { id: 'demo-c8', platform: 'EBAY', titre: 'Coque antichoc transparente', montant: 18.5, devise: 'EUR', createdAt: il_y_a(3, 4) },
    { id: 'demo-r2', platform: 'KAUFLAND', titre: 'Écouteurs Bluetooth réduction de bruit', montant: 27.5, devise: 'EUR', createdAt: il_y_a(11, 2) },
  ],
  litiges: [
    { id: 'demo-m1', platform: 'EBAY', customerName: 'Camille Rousseau', subject: 'Délai de livraison', status: 'OPEN', unread: true, lastMessageAt: il_y_a(0, 1) },
    { id: 'demo-m2', platform: 'KAUFLAND', customerName: 'Lukas Weber', subject: 'Frage zur Größe', status: 'OPEN', unread: true, lastMessageAt: il_y_a(0, 5) },
  ],
  avertissement:
    "Ces chiffres viennent des commandes enregistrées. Ils ne comprennent ni la TVA, ni les frais de plateforme, ni le port facturé à l'acheteur.",
}

/* ------------------------------------------------------------------ */
/* Produits gagnants                                                   */
/* ------------------------------------------------------------------ */

const gagnant = (n: number, titre: string, bas: number, vente: number, plateformes: string[], redacteur: string, recul: number) => ({
  id: `demo-g${n}`,
  source: 'analyse',
  sourceUrl: 'https://www.example.com/produit-gagnant',
  title: titre,
  image: null,
  category: null,
  sourcePrice: bas,
  marketPrice: vente,
  marginPercent: Math.round(((vente - bas) / bas) * 100),
  currency: 'EUR',
  salesCount: null,
  euStock: null,
  deliveryDays: null,
  delivery: null,
  warranty: null,
  isNew: true,
  notes: `Plateformes conseillées : ${plateformes.join(', ')}.`,
  status: 'NEW' as const,
  productId: null,
  needsExtension: false,
  personal: false,
  matchedProducts: [],
  detectedAt: il_y_a(recul, 3),
  raw: { gagnant12h: true, plateformes, redacteur },
})

export const DEMO_GAGNANTS = [
  gagnant(1, 'Montre connectée AMOLED 1,43" — 100 modes sport', 11.2, 39.9, ['eBay', 'Kaufland'], 'Malik', 0),
  gagnant(2, 'Mini projecteur portable WiFi 1080p', 38.5, 109.0, ['eBay', 'votre site'], 'Malik', 0),
  gagnant(3, 'Gourde isotherme 1 L à affichage de température', 6.8, 24.9, ['Kaufland', 'Carrefour'], 'Nora', 0),
  gagnant(4, 'Organiseur de voyage 7 pièces pour valise', 8.4, 27.9, ['Vinted', 'Leboncoin', 'votre site'], 'Nora', 1),
  gagnant(5, 'Lampe de chevet tactile RGB avec chargeur induction', 13.9, 44.9, ['eBay', 'La Redoute'], 'Nora', 1),
  gagnant(6, 'Ceinture de course avec porte-téléphone réfléchissant', 4.2, 17.9, ['Google Shopping', 'Instagram'], 'Malik', 1),
]

/* ------------------------------------------------------------------ */
/* Rapports — Analyses de marché et « Mes analyses » des rayons        */
/* ------------------------------------------------------------------ */

export const DEMO_RAPPORTS = [
  {
    id: 'demo-r1',
    section: 'MARKET',
    day: new Date().toISOString().slice(0, 10),
    title: 'Analyse Électronique — matin',
    summary: { auto: 'analyse-12h', rayon: 'Électronique', redacteur: 'Malik' },
    createdAt: il_y_a(0, 4),
  },
  {
    id: 'demo-r2',
    section: 'MARKET',
    day: new Date().toISOString().slice(0, 10),
    title: 'Analyse Maison et jardin — matin',
    summary: { auto: 'analyse-12h', rayon: 'Maison et jardin', redacteur: 'Nora' },
    createdAt: il_y_a(0, 5),
  },
  {
    id: 'demo-r3',
    section: 'MARKET',
    day: new Date(Date.now() - jour).toISOString().slice(0, 10),
    title: `produits-${new Date(Date.now() - jour).toISOString().slice(0, 10)}-vous`,
    summary: { redacteur: 'vous', produits: 3 },
    createdAt: il_y_a(1, 6),
  },
]

export function demoCorpsRapport(id: string) {
  const r = DEMO_RAPPORTS.find((x) => x.id === id)
  if (!r) return null
  return {
    ...r,
    body: [
      '# ' + r.title,
      '',
      '## Fournisseurs',
      'Les montres connectées à écran AMOLED dominent les meilleures ventes cette semaine, avec des prix d\'achat constatés entre 10 et 14 €. Les mini projecteurs portables progressent fortement.',
      '',
      '## Places de marché',
      'Forte demande sur eBay et Kaufland pour la maison connectée. Fourchette de revente constatée : 35 à 45 € pour les montres, 95 à 120 € pour les projecteurs.',
      '',
      '## Synthèse',
      '- Positionner la montre AMOLED à 39,90 € : marge confortable et demande soutenue.',
      '- Tester le projecteur sur votre site avant les marketplaces : moins de concurrence frontale.',
      '',
      '*Rapport de démonstration — vos chefs de rayon en IA AUTO-MODE rédigeront les vrais.*',
    ].join('\n'),
  }
}
