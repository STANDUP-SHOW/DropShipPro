import type { CategoryEntry } from './categoryCatalog.js'

/**
 * Les catégories des rayons autres que la mode.
 *
 * Le catalogue d'origine ne couvrait que la mode homme : un vendeur de high-tech
 * ouvrait la liste et n'y trouvait que des chemises et des baskets. Chaque rayon
 * confié à un chef de rayon a donc désormais ses catégories, et un secteur les
 * relie — c'est lui qui permet de n'afficher au vendeur que ce qu'il vend.
 *
 * Trois chemins par entrée, parce que les destinations ne parlent pas la même
 * langue : la taxonomie Google (qui sert aussi Instagram et la boutique
 * Facebook, tous deux nourris par le même flux), un chemin français générique
 * accepté par Cdiscount et les opérateurs Mirakl, et le chemin TikTok Shop.
 */

/** Raccourci : la plupart des entrées partagent la même racine Google. */
const G = {
  electronics: 'Electronics',
  appliances: 'Home & Garden > Household Appliances',
  home: 'Home & Garden',
  hardware: 'Hardware',
  lawn: 'Home & Garden > Lawn & Garden',
  health: 'Health & Beauty',
  sporting: 'Sporting Goods',
  baby: 'Baby & Toddler',
  animals: 'Animals & Pet Supplies',
  vehicles: 'Vehicles & Parts',
  toys: 'Toys & Games',
  apparel: 'Apparel & Accessories',
}

/**
 * Fabrique une entrée sans répéter huit champs à chaque ligne.
 *
 * Les places de marché françaises et les grandes marketplaces reçoivent le même
 * chemin français quand rien de plus précis n'est connu : mieux vaut une
 * catégorie générique juste qu'une catégorie précise inventée, que l'opérateur
 * rejettera.
 */
function entry(
  sector: string,
  id: string,
  group: string,
  label: string,
  google: string,
  fr: string,
  tiktok: string,
): CategoryEntry {
  return { sector, id, group, label, google, frFashion: fr, tiktok, targets: {} }
}

export const SECTOR_CATEGORIES: CategoryEntry[] = [
  // ---------- High-tech et informatique ----------
  entry('high-tech', 'ht-smartphone', 'Téléphonie', 'Smartphone', `${G.electronics} > Communications > Telephony > Mobile Phones`, 'Téléphonie > Smartphones', 'Phones & Electronics > Mobile Phones'),
  entry('high-tech', 'ht-tablet', 'Informatique', 'Tablette', `${G.electronics} > Computers > Tablet Computers`, 'Informatique > Tablettes', 'Computers & Office Equipment > Tablets'),
  entry('high-tech', 'ht-laptop', 'Informatique', 'Ordinateur portable', `${G.electronics} > Computers > Laptops`, 'Informatique > Ordinateurs portables', 'Computers & Office Equipment > Laptops'),
  entry('high-tech', 'ht-pc-accessory', 'Informatique', 'Accessoire informatique', `${G.electronics} > Computers > Computer Accessories`, 'Informatique > Accessoires', 'Computers & Office Equipment > Computer Accessories'),
  entry('high-tech', 'ht-headphones', 'Audio', 'Casque audio', `${G.electronics} > Audio > Audio Components > Headphones`, 'Audio > Casques', 'Phones & Electronics > Headphones'),
  entry('high-tech', 'ht-speaker', 'Audio', 'Enceinte', `${G.electronics} > Audio > Audio Components > Speakers`, 'Audio > Enceintes', 'Phones & Electronics > Speakers'),
  entry('high-tech', 'ht-tv', 'Image', 'Téléviseur', `${G.electronics} > Video > Televisions`, 'TV > Téléviseurs', 'Home Appliances > TV'),
  entry('high-tech', 'ht-projector', 'Image', 'Vidéoprojecteur', `${G.electronics} > Video > Projectors`, 'TV > Vidéoprojecteurs', 'Home Appliances > Projectors'),
  entry('high-tech', 'ht-charger', 'Accessoires', 'Chargeur et câble', `${G.electronics} > Electronics Accessories > Power > Chargers`, 'Téléphonie > Accessoires', 'Phones & Electronics > Chargers'),
  entry('high-tech', 'ht-storage', 'Informatique', 'Stockage et mémoire', `${G.electronics} > Computers > Computer Accessories > Storage Devices`, 'Informatique > Stockage', 'Computers & Office Equipment > Storage'),

  // ---------- Objets connectés et domotique ----------
  entry('objets-connectes', 'oc-smartwatch', 'Objets connectés', 'Montre connectée', `${G.electronics} > Electronics Accessories > Wearable Technology > Smartwatches`, 'Objets connectés > Montres', 'Phones & Electronics > Smart Watches'),
  entry('objets-connectes', 'oc-tracker', 'Objets connectés', 'Bracelet ou bague connectée', `${G.electronics} > Electronics Accessories > Wearable Technology`, 'Objets connectés > Bracelets', 'Phones & Electronics > Wearables'),
  entry('objets-connectes', 'oc-camera', 'Sécurité', 'Caméra de surveillance', `${G.electronics} > Video > Surveillance`, 'Sécurité > Caméras', 'Home Appliances > Security'),
  entry('objets-connectes', 'oc-lighting', 'Éclairage', 'Éclairage connecté et LED', `${G.home} > Lighting`, 'Luminaires > Éclairage connecté', 'Home Supplies > Lighting'),
  entry('objets-connectes', 'oc-smarthome', 'Domotique', 'Prise et module domotique', `${G.hardware} > Smart Home Automation`, 'Domotique > Modules', 'Home Supplies > Smart Home'),
  entry('objets-connectes', 'oc-doorbell', 'Sécurité', 'Sonnette et serrure connectée', `${G.hardware} > Smart Home Automation`, 'Sécurité > Serrures connectées', 'Home Supplies > Smart Home'),

  // ---------- Électroménager et cuisine ----------
  entry('electromenager', 'em-vacuum', 'Entretien', 'Aspirateur', `${G.appliances} > Vacuums`, 'Électroménager > Aspirateurs', 'Home Appliances > Vacuum Cleaners'),
  entry('electromenager', 'em-coffee', 'Cuisine', 'Machine à café', `${G.appliances} > Kitchen Appliances > Coffee Makers`, 'Électroménager > Petit déjeuner', 'Home Appliances > Coffee Machines'),
  entry('electromenager', 'em-fryer', 'Cuisine', 'Friteuse et four', `${G.appliances} > Kitchen Appliances > Deep Fryers`, 'Électroménager > Cuisson', 'Home Appliances > Kitchen Appliances'),
  entry('electromenager', 'em-robot', 'Cuisine', 'Robot de cuisine', `${G.appliances} > Kitchen Appliances > Food Mixers & Blenders`, 'Électroménager > Préparation culinaire', 'Home Appliances > Kitchen Appliances'),
  entry('electromenager', 'em-fridge', 'Gros électroménager', 'Réfrigérateur et congélateur', `${G.appliances} > Kitchen Appliances > Refrigerators`, 'Gros électroménager > Froid', 'Home Appliances > Refrigerators'),
  entry('electromenager', 'em-washer', 'Gros électroménager', 'Lave-linge et lave-vaisselle', `${G.appliances} > Laundry Appliances > Washing Machines`, 'Gros électroménager > Lavage', 'Home Appliances > Washing Machines'),
  entry('electromenager', 'em-cookware', 'Cuisine', 'Ustensile et batterie de cuisine', `${G.home} > Kitchen & Dining > Cookware & Bakeware`, 'Cuisine > Ustensiles', 'Kitchenware > Cookware'),

  // ---------- Mode et accessoires femme ----------
  entry('mode-femme', 'mf-dress', 'Prêt-à-porter', 'Robe', `${G.apparel} > Clothing > Dresses`, 'Mode > Femme > Robes', 'Womenswear & Underwear > Dresses'),
  entry('mode-femme', 'mf-top', 'Prêt-à-porter', 'Haut et blouse', `${G.apparel} > Clothing > Shirts & Tops`, 'Mode > Femme > Hauts', 'Womenswear & Underwear > Tops'),
  entry('mode-femme', 'mf-bottom', 'Prêt-à-porter', 'Pantalon et jupe', `${G.apparel} > Clothing > Pants`, 'Mode > Femme > Bas', 'Womenswear & Underwear > Bottoms'),
  entry('mode-femme', 'mf-outer', 'Prêt-à-porter', 'Veste et manteau', `${G.apparel} > Clothing > Outerwear`, 'Mode > Femme > Manteaux', 'Womenswear & Underwear > Outerwear'),
  entry('mode-femme', 'mf-shoes', 'Chaussures', 'Chaussures femme', `${G.apparel} > Shoes`, 'Chaussures > Femme', 'Shoes > Women Shoes'),
  entry('mode-femme', 'mf-bag', 'Accessoires', 'Sac à main', `${G.apparel} > Handbags, Wallets & Cases > Handbags`, 'Mode > Femme > Sacs', 'Fashion Accessories > Bags'),
  entry('mode-femme', 'mf-lingerie', 'Lingerie', 'Lingerie', `${G.apparel} > Clothing > Underwear & Socks`, 'Mode > Femme > Lingerie', 'Womenswear & Underwear > Lingerie'),

  // ---------- Bricolage et outillage ----------
  entry('bricolage', 'br-power-tool', 'Outillage', 'Outil électroportatif', `${G.hardware} > Tools > Power Tools`, 'Bricolage > Outillage électroportatif', 'Tools & Hardware > Power Tools'),
  entry('bricolage', 'br-hand-tool', 'Outillage', 'Outil à main', `${G.hardware} > Tools > Hand Tools`, 'Bricolage > Outillage à main', 'Tools & Hardware > Hand Tools'),
  entry('bricolage', 'br-measure', 'Mesure', 'Instrument de mesure', `${G.hardware} > Tools > Measuring Tools & Sensors`, 'Bricolage > Mesure', 'Tools & Hardware > Measuring Tools'),
  entry('bricolage', 'br-hardware', 'Quincaillerie', 'Quincaillerie et fixation', `${G.hardware} > Hardware Accessories`, 'Bricolage > Quincaillerie', 'Tools & Hardware > Hardware'),
  entry('bricolage', 'br-storage', 'Atelier', 'Rangement d’atelier', `${G.hardware} > Tool Accessories > Tool Storage & Organization`, 'Bricolage > Rangement', 'Tools & Hardware > Tool Storage'),
  entry('bricolage', 'br-safety', 'Protection', 'Équipement de protection', `${G.hardware} > Tool Accessories > Safety Equipment`, 'Bricolage > Protection', 'Tools & Hardware > Safety'),

  // ---------- Jardinage et extérieur ----------
  entry('jardinage', 'ja-tool', 'Outils de jardin', 'Outil de jardin', `${G.lawn} > Gardening > Gardening Tools`, 'Jardin > Outillage', 'Home Supplies > Garden Tools'),
  entry('jardinage', 'ja-mower', 'Motoculture', 'Tondeuse et débroussailleuse', `${G.lawn} > Outdoor Power Equipment > Lawn Mowers`, 'Jardin > Motoculture', 'Home Supplies > Garden Machines'),
  entry('jardinage', 'ja-watering', 'Arrosage', 'Arrosage', `${G.lawn} > Watering & Irrigation`, 'Jardin > Arrosage', 'Home Supplies > Watering'),
  entry('jardinage', 'ja-furniture', 'Extérieur', 'Mobilier de jardin', `${G.home} > Yard, Garden & Outdoor Living > Outdoor Furniture`, 'Jardin > Mobilier', 'Furniture > Outdoor Furniture'),
  entry('jardinage', 'ja-bbq', 'Extérieur', 'Barbecue et plancha', `${G.home} > Yard, Garden & Outdoor Living > Outdoor Cooking`, 'Jardin > Barbecue', 'Home Supplies > BBQ'),
  entry('jardinage', 'ja-pool', 'Extérieur', 'Piscine et spa', `${G.home} > Pool & Spa`, 'Jardin > Piscine', 'Home Supplies > Pool'),

  // ---------- Maison et décoration ----------
  entry('maison-deco', 'mo-decor', 'Décoration', 'Décoration', `${G.home} > Decor`, 'Maison > Décoration', 'Home Supplies > Home Decor'),
  entry('maison-deco', 'mo-linen', 'Linge', 'Linge de maison', `${G.home} > Linens & Bedding`, 'Maison > Linge de maison', 'Household Appliances > Bedding'),
  entry('maison-deco', 'mo-lighting', 'Luminaires', 'Luminaire', `${G.home} > Lighting`, 'Maison > Luminaires', 'Home Supplies > Lighting'),
  entry('maison-deco', 'mo-storage', 'Rangement', 'Rangement', `${G.home} > Household Supplies > Storage & Organization`, 'Maison > Rangement', 'Home Supplies > Storage'),
  entry('maison-deco', 'mo-furniture', 'Mobilier', 'Petit mobilier', `${G.home} > Furniture`, 'Maison > Mobilier', 'Furniture > Furniture'),

  // ---------- Beauté et soins ----------
  entry('beaute', 'be-skincare', 'Soin', 'Soin du visage et du corps', `${G.health} > Personal Care > Cosmetics > Skin Care`, 'Beauté > Soin', 'Beauty & Personal Care > Skincare'),
  entry('beaute', 'be-makeup', 'Maquillage', 'Maquillage', `${G.health} > Personal Care > Cosmetics > Makeup`, 'Beauté > Maquillage', 'Beauty & Personal Care > Makeup'),
  entry('beaute', 'be-hair', 'Coiffure', 'Coiffure et appareil chauffant', `${G.health} > Personal Care > Hair Care`, 'Beauté > Coiffure', 'Beauty & Personal Care > Hair Care'),
  entry('beaute', 'be-epilation', 'Épilation', 'Épilation et rasage', `${G.health} > Personal Care > Shaving & Grooming`, 'Beauté > Épilation', 'Beauty & Personal Care > Hair Removal'),
  entry('beaute', 'be-nails', 'Ongles', 'Manucure et ongles', `${G.health} > Personal Care > Cosmetics > Nail Care`, 'Beauté > Ongles', 'Beauty & Personal Care > Nail Care'),
  entry('beaute', 'be-fragrance', 'Parfum', 'Parfum', `${G.health} > Personal Care > Cosmetics > Perfume & Cologne`, 'Beauté > Parfums', 'Beauty & Personal Care > Fragrance'),

  // ---------- Sport et fitness ----------
  entry('sport', 'sp-fitness', 'Musculation', 'Matériel de musculation', `${G.sporting} > Exercise & Fitness > Strength Training`, 'Sport > Musculation', 'Sports & Outdoor > Fitness Equipment'),
  entry('sport', 'sp-cardio', 'Cardio', 'Appareil de cardio', `${G.sporting} > Exercise & Fitness > Cardio`, 'Sport > Cardio', 'Sports & Outdoor > Fitness Equipment'),
  entry('sport', 'sp-yoga', 'Yoga', 'Yoga et souplesse', `${G.sporting} > Exercise & Fitness > Yoga & Pilates`, 'Sport > Yoga', 'Sports & Outdoor > Yoga'),
  entry('sport', 'sp-cycling', 'Vélo', 'Vélo et accessoires', `${G.sporting} > Cycling`, 'Sport > Cycles', 'Sports & Outdoor > Cycling'),
  entry('sport', 'sp-outdoor', 'Plein air', 'Randonnée et camping', `${G.sporting} > Outdoor Recreation > Camping & Hiking`, 'Sport > Camping', 'Sports & Outdoor > Camping'),
  entry('sport', 'sp-water', 'Nautisme', 'Sports nautiques', `${G.sporting} > Outdoor Recreation > Boating & Water Sports`, 'Sport > Nautisme', 'Sports & Outdoor > Water Sports'),

  // ---------- Bébé et puériculture ----------
  entry('bebe', 'bb-toy', 'Éveil', 'Jouet d’éveil', `${G.baby} > Baby Toys & Activity Equipment`, 'Puériculture > Éveil', 'Kids Fashion > Baby Toys'),
  entry('bebe', 'bb-feeding', 'Repas', 'Repas et biberons', `${G.baby} > Nursing & Feeding`, 'Puériculture > Repas', 'Kids Fashion > Feeding'),
  entry('bebe', 'bb-stroller', 'Promenade', 'Poussette et siège auto', `${G.baby} > Baby Transport`, 'Puériculture > Promenade', 'Kids Fashion > Strollers'),
  entry('bebe', 'bb-safety', 'Sécurité', 'Sécurité et surveillance', `${G.baby} > Baby Safety`, 'Puériculture > Sécurité', 'Kids Fashion > Baby Safety'),
  entry('bebe', 'bb-bath', 'Toilette', 'Bain et change', `${G.baby} > Baby Bathing`, 'Puériculture > Toilette', 'Kids Fashion > Baby Care'),

  // ---------- Animalerie ----------
  entry('animalerie', 'an-dog', 'Chien', 'Accessoire chien', `${G.animals} > Pet Supplies > Dog Supplies`, 'Animalerie > Chien', 'Pet Supplies > Dog Supplies'),
  entry('animalerie', 'an-cat', 'Chat', 'Accessoire chat', `${G.animals} > Pet Supplies > Cat Supplies`, 'Animalerie > Chat', 'Pet Supplies > Cat Supplies'),
  entry('animalerie', 'an-feeder', 'Alimentation', 'Distributeur et gamelle', `${G.animals} > Pet Supplies > Pet Bowls, Feeders & Waterers`, 'Animalerie > Alimentation', 'Pet Supplies > Feeders'),
  entry('animalerie', 'an-tracker', 'Objets connectés', 'Traceur GPS animal', `${G.animals} > Pet Supplies > Pet Tracking`, 'Animalerie > Objets connectés', 'Pet Supplies > Pet Tech'),
  entry('animalerie', 'an-bedding', 'Couchage', 'Couchage et transport', `${G.animals} > Pet Supplies > Pet Beds`, 'Animalerie > Couchage', 'Pet Supplies > Pet Beds'),

  // ---------- Auto et moto ----------
  entry('auto-moto', 'am-diagnostic', 'Diagnostic', 'Valise et outil de diagnostic', `${G.vehicles} > Vehicle Parts & Accessories > Vehicle Maintenance`, 'Auto > Diagnostic', 'Automotive & Motorcycle > Diagnostic Tools'),
  entry('auto-moto', 'am-compressor', 'Entretien', 'Compresseur et démarreur', `${G.vehicles} > Vehicle Parts & Accessories > Vehicle Maintenance`, 'Auto > Entretien', 'Automotive & Motorcycle > Car Care'),
  entry('auto-moto', 'am-interior', 'Habitacle', 'Accessoire habitacle', `${G.vehicles} > Vehicle Parts & Accessories > Motor Vehicle Interior`, 'Auto > Habitacle', 'Automotive & Motorcycle > Interior Accessories'),
  entry('auto-moto', 'am-lighting', 'Éclairage', 'Éclairage véhicule', `${G.vehicles} > Vehicle Parts & Accessories > Motor Vehicle Lighting`, 'Auto > Éclairage', 'Automotive & Motorcycle > Lighting'),
  entry('auto-moto', 'am-moto', 'Moto', 'Équipement moto', `${G.vehicles} > Vehicle Parts & Accessories > Motorcycle Parts`, 'Moto > Équipement', 'Automotive & Motorcycle > Motorcycle'),

  // ---------- Jeux, consoles et accessoires ----------
  entry('jeux-consoles', 'jc-controller', 'Manettes', 'Manette de jeu', `${G.electronics} > Video Game Console Accessories`, 'Jeux vidéo > Manettes', 'Toys & Hobbies > Gaming Accessories'),
  entry('jeux-consoles', 'jc-headset', 'Audio', 'Casque gaming', `${G.electronics} > Audio > Audio Components > Headphones`, 'Jeux vidéo > Casques', 'Toys & Hobbies > Gaming Accessories'),
  entry('jeux-consoles', 'jc-chair', 'Mobilier', 'Siège gaming', `${G.home} > Furniture > Chairs`, 'Jeux vidéo > Sièges', 'Furniture > Gaming Chairs'),
  entry('jeux-consoles', 'jc-console-acc', 'Accessoires', 'Accessoire console', `${G.electronics} > Video Game Console Accessories`, 'Jeux vidéo > Accessoires', 'Toys & Hobbies > Gaming Accessories'),
  entry('jeux-consoles', 'jc-boardgame', 'Jeux', 'Jeu de société et jouet', `${G.toys} > Toys`, 'Jeux & Jouets', 'Toys & Hobbies > Toys'),

  // ---------- Bijoux et montres ----------
  entry('bijoux-montres', 'bm-watch', 'Montres', 'Montre', `${G.apparel} > Jewelry > Watches`, 'Bijoux > Montres', 'Fashion Accessories > Watches'),
  entry('bijoux-montres', 'bm-necklace', 'Bijoux', 'Collier', `${G.apparel} > Jewelry > Necklaces`, 'Bijoux > Colliers', 'Jewelry Accessories > Necklaces'),
  entry('bijoux-montres', 'bm-bracelet', 'Bijoux', 'Bracelet', `${G.apparel} > Jewelry > Bracelets`, 'Bijoux > Bracelets', 'Jewelry Accessories > Bracelets'),
  entry('bijoux-montres', 'bm-ring', 'Bijoux', 'Bague', `${G.apparel} > Jewelry > Rings`, 'Bijoux > Bagues', 'Jewelry Accessories > Rings'),
  entry('bijoux-montres', 'bm-box', 'Rangement', 'Boîte à bijoux', `${G.home} > Decor > Decorative Trays`, 'Bijoux > Rangement', 'Jewelry Accessories > Jewelry Storage'),
]

/**
 * Reconnaissance par mots-clés, secteur par secteur.
 *
 * Vient compléter les règles mode déjà en place. L'ordre compte : « montre
 * connectée » doit tomber sur l'objet connecté et non sur la montre-bijou, donc
 * les règles les plus spécifiques passent devant.
 */
export const SECTOR_RULES: Array<[RegExp, string]> = [
  // Objets connectés d'abord : ils empruntent le vocabulaire des autres rayons.
  [/montre connect|smartwatch|montre intelligente/, 'oc-smartwatch'],
  [/bague connect|bracelet connect|smart ring|fitness tracker/, 'oc-tracker'],
  [/traceur gps|collier gps|pet tracker/, 'an-tracker'],
  [/camera de surveillance|caméra de surveillance|surveillance|videosurveillance/, 'oc-camera'],
  [/sonnette|serrure connect/, 'oc-doorbell'],
  [/prise connect|domotique|zigbee|tuya/, 'oc-smarthome'],
  [/ampoule|ruban led|bandeau led|led strip/, 'oc-lighting'],

  // High-tech
  [/smartphone|téléphone portable|telephone portable|iphone|galaxy/, 'ht-smartphone'],
  [/tablette|ipad/, 'ht-tablet'],
  [/ordinateur portable|laptop|pc portable|macbook/, 'ht-laptop'],
  [/clavier|souris|webcam|hub usb|dock/, 'ht-pc-accessory'],
  [/casque audio|écouteur|ecouteur|earbud|headphone|casque bluetooth|casque sans fil|réduction de bruit|reduction de bruit|anc\b/, 'ht-headphones'],
  [/enceinte|haut-parleur|speaker|barre de son/, 'ht-speaker'],
  [/télévision|television|téléviseur|smart tv/, 'ht-tv'],
  [/vidéoprojecteur|videoprojecteur|projecteur/, 'ht-projector'],
  [/chargeur|câble|cable usb|powerbank|batterie externe/, 'ht-charger'],
  [/disque dur|ssd|clé usb|carte sd|carte mémoire/, 'ht-storage'],

  // Électroménager
  [/aspirateur|robot laveur/, 'em-vacuum'],
  [/machine à café|cafetière|cafetiere|expresso|percolateur/, 'em-coffee'],
  [/friteuse|air fryer|four |micro-ondes/, 'em-fryer'],
  [/robot de cuisine|blender|mixeur|batteur|hachoir/, 'em-robot'],
  [/réfrigérateur|refrigerateur|congélateur|congelateur|frigo/, 'em-fridge'],
  [/lave-linge|lave linge|lave-vaisselle|sèche-linge/, 'em-washer'],
  [/casserole|poêle|poele|batterie de cuisine|ustensile/, 'em-cookware'],

  // Bricolage
  [/perceuse|visseuse|meuleuse|ponceuse|scie |tronçonneuse|tronconneuse/, 'br-power-tool'],
  [/tournevis|clé à molette|marteau|pince |jeu d.outils/, 'br-hand-tool'],
  [/télémètre|telemetre|niveau laser|mètre |multimètre|multimetre/, 'br-measure'],
  [/vis |boulon|cheville|quincaillerie/, 'br-hardware'],
  [/servante|caisse à outils|boîte à outils|rangement atelier/, 'br-storage'],
  [/casque de chantier|gants de protection|lunettes de protection/, 'br-safety'],

  // Jardinage
  [/sécateur|secateur|taille-haie|élagueur|elagueur|bêche|râteau/, 'ja-tool'],
  [/tondeuse|débroussailleuse|debroussailleuse|motoculteur/, 'ja-mower'],
  [/arrosage|tuyau d.arrosage|arroseur|goutte à goutte/, 'ja-watering'],
  [/salon de jardin|mobilier de jardin|transat|parasol/, 'ja-furniture'],
  [/barbecue|plancha|brasero/, 'ja-bbq'],
  [/piscine|spa gonflable|jacuzzi/, 'ja-pool'],

  // Beauté
  [/parfum|eau de toilette|cologne/, 'be-fragrance'],
  [/crème|creme visage|sérum|serum|soin du visage|hydratant/, 'be-skincare'],
  [/maquillage|rouge à lèvres|mascara|fond de teint|palette/, 'be-makeup'],
  [/sèche-cheveux|lisseur|boucleur|tondeuse cheveux/, 'be-hair'],
  [/épilateur|epilateur|rasoir|ipl|lumière pulsée/, 'be-epilation'],
  [/vernis|manucure|ongle/, 'be-nails'],

  // Sport
  [/haltère|haltere|banc de musculation|barre de traction|kettlebell/, 'sp-fitness'],
  [/tapis de course|vélo d.appartement|rameur|elliptique/, 'sp-cardio'],
  [/tapis de yoga|pilates|élastique de sport/, 'sp-yoga'],
  [/vélo|velo |vtt|trottinette/, 'sp-cycling'],
  [/tente|sac de couchage|randonnée|camping/, 'sp-outdoor'],
  [/paddle|kayak|combinaison de plongée|masque de plongée/, 'sp-water'],

  // Bébé
  [/poussette|siège auto|siege auto|porte-bébé/, 'bb-stroller'],
  [/biberon|chauffe-biberon|stérilisateur|chaise haute/, 'bb-feeding'],
  [/babyphone|barrière de sécurité|moniteur bébé/, 'bb-safety'],
  [/baignoire bébé|table à langer|couche/, 'bb-bath'],
  [/jouet d.éveil|hochet|tapis d.éveil/, 'bb-toy'],

  // Animalerie
  [/laisse|harnais chien|niche|jouet chien/, 'an-dog'],
  [/litière|litiere|arbre à chat|griffoir/, 'an-cat'],
  [/distributeur de croquettes|gamelle|fontaine à eau animal/, 'an-feeder'],
  [/panier chien|coussin chat|caisse de transport/, 'an-bedding'],

  // Auto-moto
  [/obd2|valise diagnostic|scanner auto/, 'am-diagnostic'],
  [/compresseur|démarreur|booster batterie|nettoyeur voiture/, 'am-compressor'],
  [/support téléphone voiture|housse de siège|tapis de sol/, 'am-interior'],
  [/phare|ampoule h7|feu arrière|barre led/, 'am-lighting'],
  [/casque moto|gants moto|top case/, 'am-moto'],

  // Jeux
  [/manette|joystick|gamepad/, 'jc-controller'],
  [/casque gaming|micro-casque/, 'jc-headset'],
  [/siège gaming|fauteuil gamer/, 'jc-chair'],
  [/station de charge manette|coque switch|accessoire console/, 'jc-console-acc'],
  [/jeu de société|puzzle|jouet/, 'jc-boardgame'],

  // Mode femme
  [/\brobe\b/, 'mf-dress'],
  [/blouse|chemisier|top femme|débardeur/, 'mf-top'],
  [/jupe |legging|pantalon femme/, 'mf-bottom'],
  [/manteau femme|trench|doudoune femme/, 'mf-outer'],
  [/escarpin|ballerine|chaussure femme|talon/, 'mf-shoes'],
  [/sac à main|pochette|sac bandoulière/, 'mf-bag'],
  [/soutien-gorge|culotte|body |nuisette|lingerie/, 'mf-lingerie'],

  // Maison
  [/couette|drap|housse de couette|oreiller|linge de lit/, 'mo-linen'],
  [/lampe|suspension|applique|luminaire/, 'mo-lighting'],
  [/étagère|boîte de rangement|panier de rangement|organiseur/, 'mo-storage'],
  [/table |chaise |meuble|commode|buffet/, 'mo-furniture'],
  [/cadre photo|vase |bougie|tapis |miroir/, 'mo-decor'],

  // Génériques, volontairement en dernier : « casque moto » et « casque gaming »
  // doivent partir dans leur rayon, pas dans l'audio, et une montre-bijou n'est
  // pas une montre connectée.
  [/\bmontre\b/, 'bm-watch'],
  [/\bcasque\b/, 'ht-headphones'],
]
