/**
 * L'annuaire des canaux, engendré depuis le dossier des logos.
 *
 * NE PAS ÉDITER À LA MAIN sans relancer le générateur, ou l'inverse : le
 * fichier est produit par `node build-channel-directory.cjs`. Les noms mal
 * nettoyés et les classements douteux se corrigent dans les tables du
 * générateur, pas ici.
 *
 * Ce que cet annuaire est, et ce qu'il n'est pas : une liste de marques dont
 * nous avons le logo, rangées par famille. **Aucune n'est intégrée du seul
 * fait d'être listée.** Les destinations où l'on publie vraiment sont dans
 * `platforms.ts`, et elles sont vingt et une — le reste est là pour que le
 * vendeur voie le paysage et nous dise ce qu'il veut.
 *
 * Le dossier compte 742 fichiers, mais 390 sont anonymes
 * (`quality-70---117-.png`) et n'identifient aucune marque ; une trentaine ne
 * sont pas des plateformes. D'où 314 entrées et non 742.
 */

export type TypeCanal = 'marketplace' | 'comparateur' | 'affiliation' | 'regie' | 'outil'

export interface CanalAnnuaire {
  id: string
  label: string
  /** Le fichier dans frontend/public/logos. */
  logo: string
  type: TypeCanal
}

export const CANAUX: CanalAnnuaire[] = [
  {
    "id": "1200px-media_markt_logo-svg",
    "label": "MediaMarkt",
    "logo": "1200px-media_markt_logo-svg.png",
    "type": "marketplace"
  },
  {
    "id": "31m2",
    "label": "31m2",
    "logo": "31m2.png",
    "type": "marketplace"
  },
  {
    "id": "achatmoinscher",
    "label": "Achatmoinscher",
    "logo": "achatmoinscher.png",
    "type": "comparateur"
  },
  {
    "id": "adroll",
    "label": "Adroll",
    "logo": "adroll.png",
    "type": "regie"
  },
  {
    "id": "ads-google-instagram-tiktok",
    "label": "Google, Instagram & TikTok Ads",
    "logo": "ads-google-instagram-tiktok.png",
    "type": "regie"
  },
  {
    "id": "adverline",
    "label": "Adverline",
    "logo": "adverline.png",
    "type": "affiliation"
  },
  {
    "id": "affilae",
    "label": "Affilae",
    "logo": "affilae.png",
    "type": "affiliation"
  },
  {
    "id": "al-futtaim",
    "label": "Al Futtaim",
    "logo": "al-futtaim.png",
    "type": "marketplace"
  },
  {
    "id": "alltricks",
    "label": "Alltricks",
    "logo": "alltricks.png",
    "type": "marketplace"
  },
  {
    "id": "amazon",
    "label": "Amazon",
    "logo": "amazon.png",
    "type": "marketplace"
  },
  {
    "id": "asos",
    "label": "Asos",
    "logo": "asos.png",
    "type": "marketplace"
  },
  {
    "id": "attraqt-navy-logo",
    "label": "Attraqt Navy",
    "logo": "attraqt-navy-logo.png",
    "type": "outil"
  },
  {
    "id": "auchan",
    "label": "Auchan",
    "logo": "auchan.png",
    "type": "marketplace"
  },
  {
    "id": "aujardin",
    "label": "Aujardin",
    "logo": "aujardin.png",
    "type": "marketplace"
  },
  {
    "id": "autodoc",
    "label": "Autodoc",
    "logo": "autodoc.png",
    "type": "marketplace"
  },
  {
    "id": "awin",
    "label": "Awin",
    "logo": "awin.png",
    "type": "affiliation"
  },
  {
    "id": "b-q-logo",
    "label": "B&Q",
    "logo": "b-q-logo.svg",
    "type": "marketplace"
  },
  {
    "id": "backmarket_logo",
    "label": "Backmarket",
    "logo": "backmarket_logo.png",
    "type": "marketplace"
  },
  {
    "id": "bauhaus_logo",
    "label": "Bauhaus",
    "logo": "bauhaus_logo.svg",
    "type": "marketplace"
  },
  {
    "id": "bazaarvoice",
    "label": "Bazaarvoice",
    "logo": "bazaarvoice.png",
    "type": "outil"
  },
  {
    "id": "beautetest",
    "label": "Beautetest",
    "logo": "beautetest.png",
    "type": "comparateur"
  },
  {
    "id": "bed-bath-beyond_logo",
    "label": "Bed Bath & Beyond",
    "logo": "bed-bath-beyond_logo.png",
    "type": "marketplace"
  },
  {
    "id": "best-buy-logo",
    "label": "Best Buy",
    "logo": "best-buy-logo.jpg",
    "type": "marketplace"
  },
  {
    "id": "bestlist",
    "label": "Bestlist",
    "logo": "bestlist.png",
    "type": "comparateur"
  },
  {
    "id": "bhvmarais",
    "label": "BHV Marais",
    "logo": "bhvmarais.png",
    "type": "marketplace"
  },
  {
    "id": "big-bang-logo-2023",
    "label": "Big Bang",
    "logo": "big-bang-logo-2023.png",
    "type": "marketplace"
  },
  {
    "id": "biliger",
    "label": "Biliger",
    "logo": "biliger.png",
    "type": "comparateur"
  },
  {
    "id": "bingproductsads",
    "label": "Bing Product Ads",
    "logo": "bingproductsads.png",
    "type": "regie"
  },
  {
    "id": "black_red_white_logo-svg",
    "label": "Black Red White",
    "logo": "black_red_white_logo-svg.png",
    "type": "marketplace"
  },
  {
    "id": "bloomingdales-logo",
    "label": "Bloomingdales",
    "logo": "bloomingdales-logo.svg",
    "type": "marketplace"
  },
  {
    "id": "bol-logo",
    "label": "Bol.com",
    "logo": "bol-logo.png",
    "type": "marketplace"
  },
  {
    "id": "bonial",
    "label": "Bonial",
    "logo": "bonial.png",
    "type": "comparateur"
  },
  {
    "id": "boulanger",
    "label": "Boulanger",
    "logo": "boulanger.png",
    "type": "marketplace"
  },
  {
    "id": "brandalley",
    "label": "Brandalley",
    "logo": "brandalley.png",
    "type": "marketplace"
  },
  {
    "id": "brico",
    "label": "Brico",
    "logo": "brico.png",
    "type": "marketplace"
  },
  {
    "id": "bricocash_logo",
    "label": "Bricocash",
    "logo": "bricocash_logo.png",
    "type": "marketplace"
  },
  {
    "id": "bricodepot",
    "label": "Bricodepot",
    "logo": "bricodepot.png",
    "type": "marketplace"
  },
  {
    "id": "bricoman-logo2020",
    "label": "Bricoman",
    "logo": "bricoman-logo2020.jpg",
    "type": "marketplace"
  },
  {
    "id": "bricomarche",
    "label": "Bricomarche",
    "logo": "bricomarche.png",
    "type": "marketplace"
  },
  {
    "id": "bricoplanit",
    "label": "Bricoplanit",
    "logo": "bricoplanit.png",
    "type": "marketplace"
  },
  {
    "id": "bricoramalogo",
    "label": "Bricorama",
    "logo": "bricoramalogo.png",
    "type": "marketplace"
  },
  {
    "id": "bulevip",
    "label": "Bulevip",
    "logo": "bulevip.png",
    "type": "marketplace"
  },
  {
    "id": "but",
    "label": "But",
    "logo": "but.png",
    "type": "marketplace"
  },
  {
    "id": "buyon",
    "label": "Buyon",
    "logo": "buyon.png",
    "type": "marketplace"
  },
  {
    "id": "caasttv",
    "label": "Caasttv",
    "logo": "caasttv.png",
    "type": "regie"
  },
  {
    "id": "cadena",
    "label": "Cadena",
    "logo": "cadena.png",
    "type": "marketplace"
  },
  {
    "id": "carrefour",
    "label": "Carrefour",
    "logo": "carrefour.png",
    "type": "marketplace"
  },
  {
    "id": "cartageous",
    "label": "Cartageous",
    "logo": "cartageous.png",
    "type": "outil"
  },
  {
    "id": "castorama",
    "label": "Castorama",
    "logo": "castorama.png",
    "type": "marketplace"
  },
  {
    "id": "catalogate",
    "label": "Catalogate",
    "logo": "catalogate.png",
    "type": "outil"
  },
  {
    "id": "catchys",
    "label": "Catchys",
    "logo": "catchys.png",
    "type": "outil"
  },
  {
    "id": "cdiscount-new-logo",
    "label": "Cdiscount",
    "logo": "cdiscount-new-logo.png",
    "type": "marketplace"
  },
  {
    "id": "ceneo",
    "label": "Ceneo",
    "logo": "ceneo.png",
    "type": "comparateur"
  },
  {
    "id": "cercavino",
    "label": "Cercavino",
    "logo": "cercavino.png",
    "type": "marketplace"
  },
  {
    "id": "cezigue",
    "label": "Cezigue",
    "logo": "cezigue.png",
    "type": "marketplace"
  },
  {
    "id": "cherchons",
    "label": "Cherchons",
    "logo": "cherchons.png",
    "type": "comparateur"
  },
  {
    "id": "cibleclicbyuzerly",
    "label": "Cibleclicbyuzerly",
    "logo": "cibleclicbyuzerly.png",
    "type": "marketplace"
  },
  {
    "id": "cjaffiliategs",
    "label": "CJ Affiliate",
    "logo": "cjaffiliategs.png",
    "type": "affiliation"
  },
  {
    "id": "click2buy",
    "label": "Click2buy",
    "logo": "click2buy.png",
    "type": "outil"
  },
  {
    "id": "clicktofournisseur",
    "label": "Clicktofournisseur",
    "logo": "clicktofournisseur.png",
    "type": "outil"
  },
  {
    "id": "clubic",
    "label": "Clubic",
    "logo": "clubic.png",
    "type": "marketplace"
  },
  {
    "id": "cocote",
    "label": "Cocote",
    "logo": "cocote.png",
    "type": "comparateur"
  },
  {
    "id": "commentseruiner",
    "label": "Commentseruiner",
    "logo": "commentseruiner.png",
    "type": "marketplace"
  },
  {
    "id": "commerceconnector",
    "label": "Commerceconnector",
    "logo": "commerceconnector.png",
    "type": "outil"
  },
  {
    "id": "connexity",
    "label": "Connexity",
    "logo": "connexity.png",
    "type": "comparateur"
  },
  {
    "id": "conrad_logo_blau_rgb",
    "label": "Conrad",
    "logo": "conrad_logo_blau_rgb.png",
    "type": "marketplace"
  },
  {
    "id": "contentsquare",
    "label": "Contentsquare",
    "logo": "contentsquare.png",
    "type": "outil"
  },
  {
    "id": "coompra",
    "label": "Coompra",
    "logo": "coompra.png",
    "type": "comparateur"
  },
  {
    "id": "cotebebe",
    "label": "Cotebebe",
    "logo": "cotebebe.png",
    "type": "marketplace"
  },
  {
    "id": "creavea",
    "label": "Creavea",
    "logo": "creavea.png",
    "type": "marketplace"
  },
  {
    "id": "criteo",
    "label": "Criteo",
    "logo": "criteo.png",
    "type": "regie"
  },
  {
    "id": "cultura_logo",
    "label": "Cultura",
    "logo": "cultura_logo.png",
    "type": "marketplace"
  },
  {
    "id": "darty",
    "label": "Darty",
    "logo": "darty.png",
    "type": "marketplace"
  },
  {
    "id": "dealplaza",
    "label": "Dealplaza",
    "logo": "dealplaza.png",
    "type": "comparateur"
  },
  {
    "id": "debenhams_logo",
    "label": "Debenhams",
    "logo": "debenhams_logo.png",
    "type": "marketplace"
  },
  {
    "id": "decofinder",
    "label": "Decofinder",
    "logo": "decofinder.png",
    "type": "marketplace"
  },
  {
    "id": "destockagehabitat",
    "label": "Destockagehabitat",
    "logo": "destockagehabitat.png",
    "type": "marketplace"
  },
  {
    "id": "dolaba",
    "label": "Dolaba",
    "logo": "dolaba.png",
    "type": "marketplace"
  },
  {
    "id": "doofinder",
    "label": "Doofinder",
    "logo": "doofinder.png",
    "type": "outil"
  },
  {
    "id": "douglas_logo_2018",
    "label": "Douglas",
    "logo": "douglas_logo_2018.png",
    "type": "marketplace"
  },
  {
    "id": "dreamact",
    "label": "Dreamact",
    "logo": "dreamact.png",
    "type": "marketplace"
  },
  {
    "id": "drinksco",
    "label": "Drinksco",
    "logo": "drinksco.png",
    "type": "marketplace"
  },
  {
    "id": "ebay",
    "label": "Ebay",
    "logo": "ebay.png",
    "type": "marketplace"
  },
  {
    "id": "ebuyclub",
    "label": "Ebuyclub",
    "logo": "ebuyclub.png",
    "type": "affiliation"
  },
  {
    "id": "eccevino",
    "label": "Eccevino",
    "logo": "eccevino.png",
    "type": "marketplace"
  },
  {
    "id": "effiliation",
    "label": "Effiliation",
    "logo": "effiliation.png",
    "type": "affiliation"
  },
  {
    "id": "elcorteingles",
    "label": "El Corte Inglés",
    "logo": "elcorteingles.png",
    "type": "marketplace"
  },
  {
    "id": "eleclerc",
    "label": "E.Leclerc",
    "logo": "eleclerc.png",
    "type": "marketplace"
  },
  {
    "id": "electromenagercompare",
    "label": "Electromenagercompare",
    "logo": "electromenagercompare.png",
    "type": "comparateur"
  },
  {
    "id": "eprice",
    "label": "Eprice",
    "logo": "eprice.png",
    "type": "marketplace"
  },
  {
    "id": "equishopping",
    "label": "Equishopping",
    "logo": "equishopping.png",
    "type": "marketplace"
  },
  {
    "id": "eroski-logo",
    "label": "Eroski",
    "logo": "eroski-logo.png",
    "type": "marketplace"
  },
  {
    "id": "esearchvision",
    "label": "Esearchvision",
    "logo": "esearchvision.png",
    "type": "regie"
  },
  {
    "id": "etsy",
    "label": "Etsy",
    "logo": "etsy.png",
    "type": "marketplace"
  },
  {
    "id": "facebookads",
    "label": "Facebook Ads",
    "logo": "facebookads.png",
    "type": "regie"
  },
  {
    "id": "fanatics_company_logo-svg",
    "label": "Fanatics",
    "logo": "fanatics_company_logo-svg.png",
    "type": "marketplace"
  },
  {
    "id": "fashiola",
    "label": "Fashiola",
    "logo": "fashiola.png",
    "type": "comparateur"
  },
  {
    "id": "fashionchick",
    "label": "Fashionchick",
    "logo": "fashionchick.png",
    "type": "comparateur"
  },
  {
    "id": "fitizzy",
    "label": "Fitizzy",
    "logo": "fitizzy.png",
    "type": "outil"
  },
  {
    "id": "fnac",
    "label": "Fnac",
    "logo": "fnac.png",
    "type": "marketplace"
  },
  {
    "id": "fonq-logo-new-svg",
    "label": "fonQ",
    "logo": "fonq-logo-new-svg.png",
    "type": "marketplace"
  },
  {
    "id": "fourmisante",
    "label": "Fourmisante",
    "logo": "fourmisante.png",
    "type": "marketplace"
  },
  {
    "id": "fruugo",
    "label": "Fruugo",
    "logo": "fruugo.png",
    "type": "marketplace"
  },
  {
    "id": "galaxus_logo",
    "label": "Galaxus",
    "logo": "galaxus_logo.png",
    "type": "marketplace"
  },
  {
    "id": "galeria_logo",
    "label": "Galeria",
    "logo": "galeria_logo.png",
    "type": "marketplace"
  },
  {
    "id": "galerieslafayette",
    "label": "Galeries Lafayette",
    "logo": "galerieslafayette.png",
    "type": "marketplace"
  },
  {
    "id": "gammvert",
    "label": "Gammvert",
    "logo": "gammvert.png",
    "type": "marketplace"
  },
  {
    "id": "gearscore",
    "label": "Gearscore",
    "logo": "gearscore.png",
    "type": "outil"
  },
  {
    "id": "getflowbox",
    "label": "Getflowbox",
    "logo": "getflowbox.png",
    "type": "outil"
  },
  {
    "id": "glami",
    "label": "Glami",
    "logo": "glami.png",
    "type": "comparateur"
  },
  {
    "id": "googlelocal",
    "label": "Google Local",
    "logo": "googlelocal.png",
    "type": "regie"
  },
  {
    "id": "googleshoppingads",
    "label": "Google Shopping Ads",
    "logo": "googleshoppingads.png",
    "type": "regie"
  },
  {
    "id": "grainger_logo",
    "label": "Grainger",
    "logo": "grainger_logo.png",
    "type": "marketplace"
  },
  {
    "id": "greenweez",
    "label": "Greenweez",
    "logo": "greenweez.png",
    "type": "marketplace"
  },
  {
    "id": "guenstiger",
    "label": "Guenstiger",
    "logo": "guenstiger.png",
    "type": "comparateur"
  },
  {
    "id": "guitariste",
    "label": "Guitariste",
    "logo": "guitariste.png",
    "type": "marketplace"
  },
  {
    "id": "h-m-logo-svg",
    "label": "H&M",
    "logo": "h-m-logo-svg.png",
    "type": "marketplace"
  },
  {
    "id": "happytal_logo",
    "label": "Happytal",
    "logo": "happytal_logo.png",
    "type": "outil"
  },
  {
    "id": "hbc_logo",
    "label": "Hudson's Bay",
    "logo": "hbc_logo.webp",
    "type": "marketplace"
  },
  {
    "id": "hellopro",
    "label": "Hellopro",
    "logo": "hellopro.png",
    "type": "marketplace"
  },
  {
    "id": "home-depot-logo",
    "label": "The Home Depot",
    "logo": "home-depot-logo.webp",
    "type": "marketplace"
  },
  {
    "id": "home24",
    "label": "Home24",
    "logo": "home24.png",
    "type": "marketplace"
  },
  {
    "id": "homecinecompare",
    "label": "Homecinecompare",
    "logo": "homecinecompare.png",
    "type": "comparateur"
  },
  {
    "id": "hometiger",
    "label": "Hometiger",
    "logo": "hometiger.png",
    "type": "marketplace"
  },
  {
    "id": "hornbach_logo_black-svg",
    "label": "Hornbach",
    "logo": "hornbach_logo_black-svg.png",
    "type": "marketplace"
  },
  {
    "id": "houzz",
    "label": "Houzz",
    "logo": "houzz.png",
    "type": "marketplace"
  },
  {
    "id": "ibs",
    "label": "Ibs",
    "logo": "ibs.png",
    "type": "marketplace"
  },
  {
    "id": "icecat",
    "label": "Icecat",
    "logo": "icecat.png",
    "type": "outil"
  },
  {
    "id": "icomparateur",
    "label": "Icomparateur",
    "logo": "icomparateur.png",
    "type": "comparateur"
  },
  {
    "id": "idealo",
    "label": "Idealo",
    "logo": "idealo.png",
    "type": "comparateur"
  },
  {
    "id": "informaprezzi",
    "label": "Informaprezzi",
    "logo": "informaprezzi.png",
    "type": "comparateur"
  },
  {
    "id": "inno",
    "label": "Inno",
    "logo": "inno.png",
    "type": "marketplace"
  },
  {
    "id": "instagram",
    "label": "Instagram",
    "logo": "instagram.png",
    "type": "regie"
  },
  {
    "id": "jardiland",
    "label": "Jardiland",
    "logo": "jardiland.png",
    "type": "marketplace"
  },
  {
    "id": "jd-sport",
    "label": "JD Sports",
    "logo": "jd-sport.png",
    "type": "marketplace"
  },
  {
    "id": "jeuxvideofr",
    "label": "Jeuxvideofr",
    "logo": "jeuxvideofr.png",
    "type": "marketplace"
  },
  {
    "id": "jeveuxdesbijoux",
    "label": "Jeveuxdesbijoux",
    "logo": "jeveuxdesbijoux.png",
    "type": "marketplace"
  },
  {
    "id": "joom-logo-new",
    "label": "Joom",
    "logo": "joom-logo-new.png",
    "type": "marketplace"
  },
  {
    "id": "kairn",
    "label": "Kairn",
    "logo": "kairn.png",
    "type": "marketplace"
  },
  {
    "id": "kaufland_marketplace",
    "label": "Kaufland",
    "logo": "kaufland_marketplace.png",
    "type": "marketplace"
  },
  {
    "id": "kelbike",
    "label": "Kelbike",
    "logo": "kelbike.png",
    "type": "comparateur"
  },
  {
    "id": "keldelice",
    "label": "Keldelice",
    "logo": "keldelice.png",
    "type": "comparateur"
  },
  {
    "id": "kelkoogroup",
    "label": "Kelkoo",
    "logo": "kelkoogroup.png",
    "type": "comparateur"
  },
  {
    "id": "kiabi_logo",
    "label": "Kiabi",
    "logo": "kiabi_logo.png",
    "type": "marketplace"
  },
  {
    "id": "kohl-s_logo",
    "label": "Kohl's",
    "logo": "kohl-s_logo.png",
    "type": "marketplace"
  },
  {
    "id": "ktaloguebio",
    "label": "Ktaloguebio",
    "logo": "ktaloguebio.png",
    "type": "comparateur"
  },
  {
    "id": "ktaloguesexy",
    "label": "Ktaloguesexy",
    "logo": "ktaloguesexy.png",
    "type": "comparateur"
  },
  {
    "id": "kuantokusta",
    "label": "Kuantokusta",
    "logo": "kuantokusta.png",
    "type": "comparateur"
  },
  {
    "id": "kwanko-logo",
    "label": "Kwanko",
    "logo": "kwanko-logo.png",
    "type": "affiliation"
  },
  {
    "id": "lacitesport",
    "label": "Lacitesport",
    "logo": "lacitesport.png",
    "type": "marketplace"
  },
  {
    "id": "lamtalia",
    "label": "Lamtalia",
    "logo": "lamtalia.png",
    "type": "marketplace"
  },
  {
    "id": "laposte",
    "label": "Laposte",
    "logo": "laposte.png",
    "type": "marketplace"
  },
  {
    "id": "laredoute",
    "label": "La Redoute",
    "logo": "laredoute.png",
    "type": "marketplace"
  },
  {
    "id": "lavorincasa",
    "label": "Lavorincasa",
    "logo": "lavorincasa.png",
    "type": "marketplace"
  },
  {
    "id": "lazada-1",
    "label": "Lazada",
    "logo": "lazada-1.svg",
    "type": "marketplace"
  },
  {
    "id": "lcdcompare",
    "label": "Lcdcompare",
    "logo": "lcdcompare.png",
    "type": "comparateur"
  },
  {
    "id": "ldlc",
    "label": "Ldlc",
    "logo": "ldlc.png",
    "type": "marketplace"
  },
  {
    "id": "lebriconome",
    "label": "Lebriconome",
    "logo": "lebriconome.png",
    "type": "marketplace"
  },
  {
    "id": "ledenicheur",
    "label": "Ledenicheur",
    "logo": "ledenicheur.png",
    "type": "comparateur"
  },
  {
    "id": "leguide",
    "label": "Leguide",
    "logo": "leguide.png",
    "type": "comparateur"
  },
  {
    "id": "lequipement",
    "label": "L'Équipement",
    "logo": "lequipement.png",
    "type": "marketplace"
  },
  {
    "id": "leroymerlin",
    "label": "Leroymerlin",
    "logo": "leroymerlin.png",
    "type": "marketplace"
  },
  {
    "id": "lesbonnesbouilles",
    "label": "Lesbonnesbouilles",
    "logo": "lesbonnesbouilles.png",
    "type": "marketplace"
  },
  {
    "id": "lgmdp",
    "label": "Lgmdp",
    "logo": "lgmdp.jpg",
    "type": "marketplace"
  },
  {
    "id": "liganz",
    "label": "Liganz",
    "logo": "liganz.png",
    "type": "marketplace"
  },
  {
    "id": "limango",
    "label": "Limango",
    "logo": "limango.png",
    "type": "marketplace"
  },
  {
    "id": "lionshome",
    "label": "Lionshome",
    "logo": "lionshome.png",
    "type": "comparateur"
  },
  {
    "id": "livingo",
    "label": "Livingo",
    "logo": "livingo.png",
    "type": "comparateur"
  },
  {
    "id": "logotype_printemps-vert",
    "label": "Printemps",
    "logo": "logotype_printemps-vert.jpg",
    "type": "marketplace"
  },
  {
    "id": "lowes_companies_logo-svg",
    "label": "Lowe's",
    "logo": "lowes_companies_logo-svg.png",
    "type": "marketplace"
  },
  {
    "id": "lusini_logo",
    "label": "Lusini",
    "logo": "lusini_logo.png",
    "type": "marketplace"
  },
  {
    "id": "macy-s_logo_2019",
    "label": "Macy's",
    "logo": "macy-s_logo_2019.png",
    "type": "marketplace"
  },
  {
    "id": "mafringue",
    "label": "Mafringue",
    "logo": "mafringue.png",
    "type": "marketplace"
  },
  {
    "id": "maisonsdumonde",
    "label": "Maisonsdumonde",
    "logo": "maisonsdumonde.png",
    "type": "marketplace"
  },
  {
    "id": "makro-logo",
    "label": "Makro",
    "logo": "makro-logo.png",
    "type": "marketplace"
  },
  {
    "id": "manomano",
    "label": "Manomano",
    "logo": "manomano.png",
    "type": "marketplace"
  },
  {
    "id": "manomanopro",
    "label": "ManoMano Pro",
    "logo": "manomanopro.png",
    "type": "marketplace"
  },
  {
    "id": "manor-logo-blk-rgb-1",
    "label": "Manor",
    "logo": "manor-logo-blk-rgb-1.png",
    "type": "marketplace"
  },
  {
    "id": "mareduc",
    "label": "Mareduc",
    "logo": "mareduc.png",
    "type": "marketplace"
  },
  {
    "id": "materiel-net",
    "label": "Materiel Net",
    "logo": "materiel-net.png",
    "type": "marketplace"
  },
  {
    "id": "maxeda_diy_group",
    "label": "Maxeda DIY",
    "logo": "maxeda_diy_group.png",
    "type": "marketplace"
  },
  {
    "id": "meilleurvendeur",
    "label": "Meilleurvendeur",
    "logo": "meilleurvendeur.png",
    "type": "marketplace"
  },
  {
    "id": "metro",
    "label": "Metro",
    "logo": "metro.png",
    "type": "marketplace"
  },
  {
    "id": "meublesfr",
    "label": "Meublesfr",
    "logo": "meublesfr.png",
    "type": "marketplace"
  },
  {
    "id": "miintomarketplace",
    "label": "Miinto",
    "logo": "miintomarketplace.png",
    "type": "marketplace"
  },
  {
    "id": "misterauto_pro",
    "label": "Mister Auto Pro",
    "logo": "misterauto_pro.png",
    "type": "marketplace"
  },
  {
    "id": "momax",
    "label": "Momax",
    "logo": "momax.png",
    "type": "marketplace"
  },
  {
    "id": "mondialtissus",
    "label": "Mondialtissus",
    "logo": "mondialtissus.png",
    "type": "marketplace"
  },
  {
    "id": "musicompare",
    "label": "Musicompare",
    "logo": "musicompare.png",
    "type": "comparateur"
  },
  {
    "id": "mybestbrands",
    "label": "Mybestbrands",
    "logo": "mybestbrands.png",
    "type": "comparateur"
  },
  {
    "id": "mythings",
    "label": "Mythings",
    "logo": "mythings.png",
    "type": "regie"
  },
  {
    "id": "naturabuy",
    "label": "Naturabuy",
    "logo": "naturabuy.png",
    "type": "marketplace"
  },
  {
    "id": "natureetdecouvertes",
    "label": "Nature & Découvertes",
    "logo": "natureetdecouvertes.png",
    "type": "marketplace"
  },
  {
    "id": "neokasa",
    "label": "Neokasa",
    "logo": "neokasa.png",
    "type": "outil"
  },
  {
    "id": "netreviews",
    "label": "Netreviews",
    "logo": "netreviews.png",
    "type": "outil"
  },
  {
    "id": "nokaut",
    "label": "Nokaut",
    "logo": "nokaut.png",
    "type": "comparateur"
  },
  {
    "id": "nowinstore",
    "label": "Nowinstore",
    "logo": "nowinstore.png",
    "type": "outil"
  },
  {
    "id": "nuukik",
    "label": "Nuukik",
    "logo": "nuukik.png",
    "type": "regie"
  },
  {
    "id": "obi-logo-orange-rgb",
    "label": "OBI",
    "logo": "obi-logo-orange-rgb.png",
    "type": "marketplace"
  },
  {
    "id": "onachetefrancais",
    "label": "On Achète Français",
    "logo": "onachetefrancais.png",
    "type": "marketplace"
  },
  {
    "id": "otiendas",
    "label": "Otiendas",
    "logo": "otiendas.png",
    "type": "comparateur"
  },
  {
    "id": "otto_logo",
    "label": "Otto",
    "logo": "otto_logo.png",
    "type": "marketplace"
  },
  {
    "id": "pagineprezzi",
    "label": "Pagineprezzi",
    "logo": "pagineprezzi.png",
    "type": "comparateur"
  },
  {
    "id": "pccomponentes",
    "label": "Pccomponentes",
    "logo": "pccomponentes.png",
    "type": "marketplace"
  },
  {
    "id": "perfectcorp",
    "label": "Perfectcorp",
    "logo": "perfectcorp.png",
    "type": "outil"
  },
  {
    "id": "phonehouse",
    "label": "Phonehouse",
    "logo": "phonehouse.png",
    "type": "marketplace"
  },
  {
    "id": "pikengo",
    "label": "Pikengo",
    "logo": "pikengo.png",
    "type": "marketplace"
  },
  {
    "id": "pinterest",
    "label": "Pinterest",
    "logo": "pinterest.png",
    "type": "regie"
  },
  {
    "id": "place_des_tendances_logo",
    "label": "Place des Tendances",
    "logo": "place_des_tendances_logo.png",
    "type": "marketplace"
  },
  {
    "id": "plante",
    "label": "Plante",
    "logo": "plante.png",
    "type": "marketplace"
  },
  {
    "id": "plusbaslesprix",
    "label": "Plusbaslesprix",
    "logo": "plusbaslesprix.png",
    "type": "comparateur"
  },
  {
    "id": "pneucompare",
    "label": "Pneucompare",
    "logo": "pneucompare.png",
    "type": "comparateur"
  },
  {
    "id": "polyvore",
    "label": "Polyvore",
    "logo": "polyvore.png",
    "type": "marketplace"
  },
  {
    "id": "popeo",
    "label": "Popeo",
    "logo": "popeo.png",
    "type": "marketplace"
  },
  {
    "id": "pourbebe",
    "label": "Pourbebe",
    "logo": "pourbebe.png",
    "type": "marketplace"
  },
  {
    "id": "pourdebon",
    "label": "Pour de Bon",
    "logo": "pourdebon.png",
    "type": "marketplace"
  },
  {
    "id": "pourlamaison",
    "label": "Pourlamaison",
    "logo": "pourlamaison.png",
    "type": "marketplace"
  },
  {
    "id": "praxis",
    "label": "Praxis",
    "logo": "praxis.png",
    "type": "marketplace"
  },
  {
    "id": "prezzifacili",
    "label": "Prezzifacili",
    "logo": "prezzifacili.png",
    "type": "comparateur"
  },
  {
    "id": "prezzigomme",
    "label": "Prezzigomme",
    "logo": "prezzigomme.png",
    "type": "comparateur"
  },
  {
    "id": "pricegrabber",
    "label": "Pricegrabber",
    "logo": "pricegrabber.png",
    "type": "comparateur"
  },
  {
    "id": "priceobservatory",
    "label": "Priceobservatory",
    "logo": "priceobservatory.png",
    "type": "comparateur"
  },
  {
    "id": "pricerunner",
    "label": "Pricerunner",
    "logo": "pricerunner.png",
    "type": "comparateur"
  },
  {
    "id": "prisvis",
    "label": "Prisvis",
    "logo": "prisvis.png",
    "type": "comparateur"
  },
  {
    "id": "private_sport_shop",
    "label": "Private Sport Shop",
    "logo": "private_sport_shop.png",
    "type": "marketplace"
  },
  {
    "id": "prixing",
    "label": "Prixing",
    "logo": "prixing.png",
    "type": "comparateur"
  },
  {
    "id": "pronto",
    "label": "Pronto",
    "logo": "pronto.png",
    "type": "comparateur"
  },
  {
    "id": "pureshopping",
    "label": "Pureshopping",
    "logo": "pureshopping.png",
    "type": "comparateur"
  },
  {
    "id": "quelpneu",
    "label": "Quelpneu",
    "logo": "quelpneu.png",
    "type": "comparateur"
  },
  {
    "id": "quesabesde",
    "label": "Quesabesde",
    "logo": "quesabesde.png",
    "type": "comparateur"
  },
  {
    "id": "radarprice",
    "label": "Radarprice",
    "logo": "radarprice.png",
    "type": "comparateur"
  },
  {
    "id": "radvertising",
    "label": "Radvertising",
    "logo": "radvertising.png",
    "type": "regie"
  },
  {
    "id": "rakuten",
    "label": "Rakuten",
    "logo": "rakuten.png",
    "type": "marketplace"
  },
  {
    "id": "reductionmarque",
    "label": "Reductionmarque",
    "logo": "reductionmarque.png",
    "type": "affiliation"
  },
  {
    "id": "reebonz",
    "label": "Reebonz",
    "logo": "reebonz.png",
    "type": "marketplace"
  },
  {
    "id": "reelevant",
    "label": "Reelevant",
    "logo": "reelevant.png",
    "type": "regie"
  },
  {
    "id": "reetags",
    "label": "Reetags",
    "logo": "reetags.png",
    "type": "outil"
  },
  {
    "id": "refurbed-new",
    "label": "Refurbed",
    "logo": "refurbed-new.png",
    "type": "outil"
  },
  {
    "id": "retif",
    "label": "Retif",
    "logo": "retif.png",
    "type": "marketplace"
  },
  {
    "id": "rinascente_logo-svg",
    "label": "La Rinascente",
    "logo": "rinascente_logo-svg.png",
    "type": "marketplace"
  },
  {
    "id": "ruemontgallet",
    "label": "Ruemontgallet",
    "logo": "ruemontgallet.png",
    "type": "marketplace"
  },
  {
    "id": "runbabyrun",
    "label": "Runbabyrun",
    "logo": "runbabyrun.png",
    "type": "marketplace"
  },
  {
    "id": "sabdoo",
    "label": "Sabdoo",
    "logo": "sabdoo.png",
    "type": "outil"
  },
  {
    "id": "secretsales",
    "label": "Secretsales",
    "logo": "secretsales.png",
    "type": "marketplace"
  },
  {
    "id": "sevellia",
    "label": "Sevellia",
    "logo": "sevellia.png",
    "type": "marketplace"
  },
  {
    "id": "sextoyer",
    "label": "Sextoyer",
    "logo": "sextoyer.png",
    "type": "marketplace"
  },
  {
    "id": "shareasale",
    "label": "Shareasale",
    "logo": "shareasale.png",
    "type": "affiliation"
  },
  {
    "id": "shein-logo",
    "label": "Shein",
    "logo": "shein-logo.png",
    "type": "marketplace"
  },
  {
    "id": "shop-apotheke",
    "label": "Shop Apotheke",
    "logo": "shop-apotheke.png",
    "type": "marketplace"
  },
  {
    "id": "shopalike",
    "label": "Shopalike",
    "logo": "shopalike.png",
    "type": "comparateur"
  },
  {
    "id": "shopbotinc",
    "label": "ShopBot",
    "logo": "shopbotinc.png",
    "type": "comparateur"
  },
  {
    "id": "shopee",
    "label": "Shopee",
    "logo": "shopee.svg",
    "type": "marketplace"
  },
  {
    "id": "shopmania",
    "label": "Shopmania",
    "logo": "shopmania.png",
    "type": "comparateur"
  },
  {
    "id": "shoppingcom",
    "label": "Shopping.com",
    "logo": "shoppingcom.png",
    "type": "comparateur"
  },
  {
    "id": "shoppydoo",
    "label": "Shoppydoo",
    "logo": "shoppydoo.png",
    "type": "comparateur"
  },
  {
    "id": "shopstyle",
    "label": "Shopstyle",
    "logo": "shopstyle.png",
    "type": "comparateur"
  },
  {
    "id": "shoptoit",
    "label": "Shoptoit",
    "logo": "shoptoit.png",
    "type": "marketplace"
  },
  {
    "id": "shopzilla",
    "label": "Shopzilla",
    "logo": "shopzilla.png",
    "type": "comparateur"
  },
  {
    "id": "showroomprive",
    "label": "Showroomprivé",
    "logo": "showroomprive.png",
    "type": "marketplace"
  },
  {
    "id": "slood-logo",
    "label": "Slood",
    "logo": "slood-logo.png",
    "type": "marketplace"
  },
  {
    "id": "snapchat",
    "label": "Snapchat",
    "logo": "snapchat.png",
    "type": "regie"
  },
  {
    "id": "sociomantic",
    "label": "Sociomantic",
    "logo": "sociomantic.png",
    "type": "regie"
  },
  {
    "id": "socloz",
    "label": "Socloz",
    "logo": "socloz.png",
    "type": "outil"
  },
  {
    "id": "solostocks",
    "label": "Solostocks",
    "logo": "solostocks.png",
    "type": "outil"
  },
  {
    "id": "spareka_logo",
    "label": "Spareka",
    "logo": "spareka_logo.png",
    "type": "outil"
  },
  {
    "id": "spartoo",
    "label": "Spartoo",
    "logo": "spartoo.png",
    "type": "marketplace"
  },
  {
    "id": "sponsorboost",
    "label": "Sponsorboost",
    "logo": "sponsorboost.png",
    "type": "affiliation"
  },
  {
    "id": "spycommerce",
    "label": "Spycommerce",
    "logo": "spycommerce.png",
    "type": "outil"
  },
  {
    "id": "stileo",
    "label": "Stileo",
    "logo": "stileo.png",
    "type": "comparateur"
  },
  {
    "id": "stockly",
    "label": "Stockly",
    "logo": "stockly.png",
    "type": "outil"
  },
  {
    "id": "superdrug_logo-svg",
    "label": "Superdrug",
    "logo": "superdrug_logo-svg.png",
    "type": "marketplace"
  },
  {
    "id": "target-logo",
    "label": "Target",
    "logo": "target-logo.png",
    "type": "marketplace"
  },
  {
    "id": "target2sell",
    "label": "Target2sell",
    "logo": "target2sell.png",
    "type": "regie"
  },
  {
    "id": "temu_logo-svg",
    "label": "Temu",
    "logo": "temu_logo-svg.png",
    "type": "marketplace"
  },
  {
    "id": "tesco_logo",
    "label": "Tesco",
    "logo": "tesco_logo.png",
    "type": "marketplace"
  },
  {
    "id": "testntrust",
    "label": "Testntrust",
    "logo": "testntrust.png",
    "type": "marketplace"
  },
  {
    "id": "thunderstone",
    "label": "Thunderstone",
    "logo": "thunderstone.png",
    "type": "outil"
  },
  {
    "id": "tightr",
    "label": "Tightr",
    "logo": "tightr.png",
    "type": "comparateur"
  },
  {
    "id": "tiktokshop_logo",
    "label": "TikTok Shop",
    "logo": "tiktokshop_logo.png",
    "type": "marketplace"
  },
  {
    "id": "timeone",
    "label": "Timeone",
    "logo": "timeone.png",
    "type": "affiliation"
  },
  {
    "id": "topnegozi",
    "label": "Topnegozi",
    "logo": "topnegozi.png",
    "type": "comparateur"
  },
  {
    "id": "touslesprix",
    "label": "Touslesprix",
    "logo": "touslesprix.png",
    "type": "comparateur"
  },
  {
    "id": "toutvendre",
    "label": "Toutvendre",
    "logo": "toutvendre.png",
    "type": "marketplace"
  },
  {
    "id": "tracdelight",
    "label": "Tracdelight",
    "logo": "tracdelight.png",
    "type": "affiliation"
  },
  {
    "id": "tradedoubler",
    "label": "Tradedoubler",
    "logo": "tradedoubler.png",
    "type": "affiliation"
  },
  {
    "id": "tradetrackercom",
    "label": "TradeTracker",
    "logo": "tradetrackercom.png",
    "type": "affiliation"
  },
  {
    "id": "trouversoncadeau",
    "label": "Trouversoncadeau",
    "logo": "trouversoncadeau.png",
    "type": "marketplace"
  },
  {
    "id": "trovaprezzi",
    "label": "Trovaprezzi",
    "logo": "trovaprezzi.png",
    "type": "comparateur"
  },
  {
    "id": "truffaut",
    "label": "Truffaut",
    "logo": "truffaut.png",
    "type": "marketplace"
  },
  {
    "id": "trygr",
    "label": "Trygr",
    "logo": "trygr.png",
    "type": "comparateur"
  },
  {
    "id": "turbo",
    "label": "Turbo",
    "logo": "turbo.png",
    "type": "marketplace"
  },
  {
    "id": "twenganew",
    "label": "Twenga",
    "logo": "twenganew.png",
    "type": "comparateur"
  },
  {
    "id": "twil",
    "label": "Twil",
    "logo": "twil.png",
    "type": "marketplace"
  },
  {
    "id": "ubaldi",
    "label": "Ubaldi",
    "logo": "ubaldi.png",
    "type": "marketplace"
  },
  {
    "id": "uncadeau",
    "label": "Uncadeau",
    "logo": "uncadeau.png",
    "type": "marketplace"
  },
  {
    "id": "unooc",
    "label": "Unooc",
    "logo": "unooc.png",
    "type": "marketplace"
  },
  {
    "id": "usinenouvelle",
    "label": "L'Usine Nouvelle",
    "logo": "usinenouvelle.png",
    "type": "marketplace"
  },
  {
    "id": "veepeegroup",
    "label": "Veepee",
    "logo": "veepeegroup.png",
    "type": "marketplace"
  },
  {
    "id": "veganplace",
    "label": "Veganplace",
    "logo": "veganplace.png",
    "type": "marketplace"
  },
  {
    "id": "vinogustoes",
    "label": "Vinogustoes",
    "logo": "vinogustoes.png",
    "type": "marketplace"
  },
  {
    "id": "vinsnaturels",
    "label": "Vinsnaturels",
    "logo": "vinsnaturels.png",
    "type": "marketplace"
  },
  {
    "id": "vtwonen-logo-1",
    "label": "vtwonen",
    "logo": "vtwonen-logo-1.webp",
    "type": "marketplace"
  },
  {
    "id": "wayfair",
    "label": "Wayfair",
    "logo": "wayfair.png",
    "type": "marketplace"
  },
  {
    "id": "webepartners",
    "label": "Webepartners",
    "logo": "webepartners.png",
    "type": "affiliation"
  },
  {
    "id": "webgains",
    "label": "Webgains",
    "logo": "webgains.png",
    "type": "affiliation"
  },
  {
    "id": "winedecider",
    "label": "Winedecider",
    "logo": "winedecider.png",
    "type": "comparateur"
  },
  {
    "id": "wmt-marketplace-wordmark-stacked-rgb",
    "label": "Walmart Marketplace",
    "logo": "wmt-marketplace-wordmark-stacked-rgb.png",
    "type": "marketplace"
  },
  {
    "id": "worten",
    "label": "Worten",
    "logo": "worten.png",
    "type": "marketplace"
  },
  {
    "id": "xxxlutz-logo",
    "label": "XXXLutz",
    "logo": "xxxlutz-logo.svg",
    "type": "marketplace"
  },
  {
    "id": "youvente",
    "label": "Youvente",
    "logo": "youvente.png",
    "type": "marketplace"
  },
  {
    "id": "yves-rocher-france",
    "label": "Yves Rocher",
    "logo": "yves-rocher-france.png",
    "type": "marketplace"
  },
  {
    "id": "zalando",
    "label": "Zalando",
    "logo": "zalando.png",
    "type": "marketplace"
  },
  {
    "id": "zentrada",
    "label": "Zentrada",
    "logo": "zentrada.png",
    "type": "marketplace"
  },
  {
    "id": "zooplus-new",
    "label": "Zooplus",
    "logo": "zooplus-new.svg",
    "type": "marketplace"
  }
]

export const TYPES_CANAL: Array<{ id: TypeCanal; label: string; aide: string }> = [
  {
    id: 'marketplace',
    label: 'Places de marché et enseignes',
    aide: "Elles vendent au public et acceptent des vendeurs tiers, chacune avec ses règles d'entrée.",
  },
  {
    id: 'comparateur',
    label: 'Comparateurs de prix',
    aide: "Ils ne vendent pas : ils affichent votre produit et renvoient l'acheteur chez vous, contre un coût au clic.",
  },
  {
    id: 'affiliation',
    label: "Plateformes d'affiliation",
    aide: 'Des éditeurs poussent vos produits et se rémunèrent à la vente.',
  },
  {
    id: 'regie',
    label: 'Régies publicitaires',
    aide: 'Vous payez pour être vu. Le flux produit y sert de matière première.',
  },
  {
    id: 'outil',
    label: 'Outils du commerce en ligne',
    aide: "Avis clients, moteur de recherche, essayage virtuel : ils entourent la vente sans être un canal de diffusion.",
  },
]
