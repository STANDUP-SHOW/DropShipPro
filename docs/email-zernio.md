# E-mail à envoyer à Zernio

**À :** l'adresse commerciale / API de Zernio (voir `docs.zernio.com`, section contact,
ou le lien « Enterprise » du tableau de bord).

**Pourquoi cet e-mail existe :** deux réponses manquent pour décider, et aucune ne se
trouve dans la documentation publique. Tant qu'elles manquent, la passerelle écrite dans
`services/socialGateway.ts` reste théorique. Les questions sont posées dans l'ordre où
elles bloquent : la première décide de tout, les autres ne servent que si la première est
positive.

L'e-mail est court volontairement. Cinq questions numérotées obtiennent une réponse ;
deux pages d'explications obtiennent un accusé de réception.

---

## Version anglaise (recommandée)

> **Subject:** White-label / platform use of the Zernio API — 5 questions before we build
>
> Hello,
>
> We run **DropShipper IA** (drop-shipper.fr), a French SaaS for dropshippers: product
> import, AI-written listings, and publishing to marketplaces. We are adding a social &
> ads module and would rather build on Zernio than rebuild seven ad-platform integrations
> ourselves.
>
> Our intended architecture follows your own "Build a Platform" guide: **one Zernio profile
> per end customer**, headless OAuth so our merchants never see a Zernio screen, per-profile
> scoped API keys, and a single webhook endpoint routed by `profileId` / `accountId`. Our
> UI, our branding, our billing to the merchant.
>
> Five questions before we commit engineering time:
>
> 1. **Is that white-label, multi-tenant use permitted under your terms?** We would be
>    reselling access to our own customers under our brand. If it requires a specific
>    plan, partner agreement or contract, please tell us which.
>
> 2. **Connected-account pricing:** your page mentions $6 / $3 / $1 per account on
>    degressive tiers based on the monthly total. **What are the exact thresholds?** We
>    need this to price our own offer — at 1 000 merchants × 3 accounts the difference
>    between $6 and $1 is roughly €4 600 per month.
>
> 3. **Availability commitment.** Is there an SLA on the Enterprise plan, and what is it?
>    A Zernio outage would stop every campaign of every one of our customers at once.
>
> 4. **GDPR.** We are established in France and our customers are EU businesses. Do you
>    provide a **Data Processing Agreement**, and where are the OAuth tokens and social
>    data stored (EU or elsewhere)?
>
> 5. **Free tier limits for evaluation.** We have a free account and would like to run an
>    end-to-end test — create a profile, connect one Facebook page and one Meta Ads
>    account, publish a post, create a campaign — before signing anything. Is that within
>    the free tier?
>
> Happy to jump on a call if that is faster.
>
> Thank you,
>
> [Votre nom]
> DropShipper IA — drop-shipper.fr

---

## Version française (si le contact est francophone)

> **Objet :** Usage en marque blanche de l'API Zernio — 5 questions avant de développer
>
> Bonjour,
>
> Nous éditons **DropShipper IA** (drop-shipper.fr), un SaaS français pour dropshippers :
> import de produits, rédaction des annonces par IA, publication sur les places de marché.
> Nous ajoutons un module réseaux sociaux et publicité, et préférons nous appuyer sur
> Zernio plutôt que de reconstruire nous-mêmes sept intégrations publicitaires.
>
> L'architecture visée suit votre propre guide « Build a Platform » : **un profil Zernio
> par client final**, OAuth en mode headless pour qu'aucun écran Zernio n'apparaisse à nos
> marchands, clés d'API limitées par profil, et un seul point de réception de webhooks
> routé par `profileId` / `accountId`. Notre interface, notre marque, notre facturation.
>
> Cinq questions avant d'engager du développement :
>
> 1. **Cet usage en marque blanche multi-clients est-il autorisé par vos conditions ?**
>    Nous revendrions l'accès à nos propres clients sous notre marque. Si cela relève d'une
>    offre ou d'un contrat particulier, merci de nous dire lequel.
>
> 2. **Tarif des comptes connectés :** votre page annonce 6 $ / 3 $ / 1 $ par compte selon
>    des paliers dégressifs sur le total mensuel. **Quels sont les seuils exacts ?** Nous en
>    avons besoin pour fixer notre propre tarif : à 1 000 marchands × 3 comptes, l'écart
>    entre 6 $ et 1 $ représente environ 4 600 € par mois.
>
> 3. **Engagement de disponibilité.** Existe-t-il un SLA sur l'offre Entreprise, et lequel ?
>    Une panne Zernio arrêterait d'un coup toutes les campagnes de tous nos clients.
>
> 4. **RGPD.** Nous sommes établis en France et nos clients sont des entreprises de l'Union
>    européenne. Fournissez-vous un **contrat de sous-traitance (DPA)**, et où sont stockés
>    les jetons OAuth et les données sociales (UE ou hors UE) ?
>
> 5. **Limites de l'offre gratuite pour une évaluation.** Nous avons un compte gratuit et
>    souhaitons faire un essai de bout en bout — créer un profil, connecter une page
>    Facebook et un compte Meta Ads, publier un post, créer une campagne — avant de signer
>    quoi que ce soit. Est-ce compris dans l'offre gratuite ?
>
> Un appel est possible si c'est plus rapide.
>
> Bien cordialement,
>
> [Votre nom]
> DropShipper IA — drop-shipper.fr

---

## Comment lire la réponse

- **Question 1 négative ou évasive** → on ne bâtit pas de produit commercial dessus. La
  couche d'abstraction reste utile : elle accueillera des adaptateurs natifs, plateforme
  par plateforme, en commençant par Meta qui couvre Facebook et Instagram.
- **Question 2 sans seuils** → relancer. Sans eux, impossible de fixer un prix : c'est le
  seul chiffre qui décide si le module se vend 10 € ou 25 € par mois.
- **Question 4 sans DPA** → bloquant en l'état pour des clients européens, indépendamment
  de tout le reste.
