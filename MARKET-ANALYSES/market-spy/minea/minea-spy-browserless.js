// MINEA-SPY — script Browserless (/function, Puppeteer)
// Entrée  : context = { cookies: [...], keywords: ["chargeur", ...], maxCompetitors: 10, pause: [2000, 5000] }
// Sortie  : { ok, loggedIn, top10: {ads, products, shops}, search: [...], competitors: [...], warnings: [] }
// Sélecteurs vérifiés sur app.minea.com/fr (page d'accueil, 03-10-2026). Modules 2/3 (connecté) : à valider au 1er run.

export default async function ({ page, context }) {
  const BASE = "https://app.minea.com/fr";
  const [pMin, pMax] = context.pause || [2000, 5000];
  const warnings = [];
  const wait = () => new Promise(r => setTimeout(r, pMin + Math.random() * (pMax - pMin)));

  // ---------- MODULE 0 : initialisation ----------
  if (Array.isArray(context.cookies) && context.cookies.length) await page.setCookie(...context.cookies);
  await page.setViewport({ width: 1366, height: 900 });
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
  await wait();

  const blocked = await page.evaluate(() => /captcha|verify you are human|cloudflare/i.test(document.body.innerText));
  if (blocked) return { data: { ok: false, error: "CAPTCHA_OR_BOT_CHECK", warnings }, type: "application/json" };

  const loggedIn = await page.evaluate(() => !document.querySelector('a[href*="/login"]'));
  if (!loggedIn) warnings.push("Non connecté : seul le top 10 public est accessible.");

  // fermer bannières (refus cookies non essentiels, popups)
  await page.evaluate(() => {
    const txt = /refuser|tout refuser|reject|fermer|close|plus tard/i;
    document.querySelectorAll("button").forEach(b => { if (txt.test(b.innerText || b.getAttribute("aria-label") || "")) b.click(); });
  });

  // ---------- helpers d'extraction (vérifiés en compte gratuit le 04-10-2026) ----------
  // Annonces : ancrage sur le bouton "Analyse de l'annonce", remontée jusqu'au bloc qui contient 1 seul "annonces actives".
  // Produits : plus petit bloc contenant 1 seul "annonces totales" + "Publié le".
  const extractCards = () => page.evaluate(() => {
    const clean = c => c.innerText.split(/\n+/).map(s => s.trim()).filter(s => s && !/^(Previous|Next) slide$/.test(s));
    const urlOf = c => [...c.querySelectorAll("a")].map(a => a.href).find(h => !/minea\.com/.test(h))
      || (c.innerText.match(/https?:\/\/\S+/) || [])[0] || null;
    const ads = [...document.querySelectorAll("button")].filter(b => b.innerText.trim() === "Analyse de l'annonce").map(b => {
      let c = b; for (let i = 0; i < 12 && c.parentElement; i++) { c = c.parentElement; if ((c.innerText.match(/annonces actives/g) || []).length === 1) break; }
      return { kind: "ad", parts: clean(c), url: urlOf(c) };
    });
    const all = [...document.querySelectorAll("div,article,li,section")].filter(e => {
      const t = e.innerText || ""; return (t.match(/annonces totales/g) || []).length === 1 && /Publié le/.test(t);
    });
    const prods = all.filter(e => !all.some(o => o !== e && e.contains(o))).map(c => ({ kind: "product", parts: clean(c), url: urlOf(c) }));
    let generic = [];
    if (!ads.length && !prods.length) {                       // ex. onglet "Boutiques" de l'accueil (structure non vérifiée)
      const blocks = [...document.querySelectorAll("main div, main li")].filter(e => urlOf(e) && e.innerText.length < 600);
      generic = blocks.filter(e => !blocks.some(o => o !== e && o.contains(e) === false && e.contains(o)))
        .map(c => ({ kind: "generic", parts: clean(c), url: urlOf(c) }));
    }
    const seen = new Set();
    return [...ads, ...prods, ...generic].filter(x => { const k = x.kind + x.parts.join("|"); if (seen.has(k)) return false; seen.add(k); return true; });
  });

  const clickTab = async (label) => page.evaluate((label) => {
    const t = [...document.querySelectorAll('[role="tab"]')].find(x => x.innerText.trim() === label);
    if (t) { t.click(); return true; } return false;
  }, label);

  const slideAll = async () => {          // "Next slide" jusqu'à stabilité du nombre de cartes
    let prev = -1;
    for (let i = 0; i < 15; i++) {
      const n = (await extractCards()).length;
      if (n === prev) break; prev = n;
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll("button")].filter(b => /next slide/i.test(b.innerText + (b.getAttribute("aria-label") || "")));
        btns[btns.length - 1]?.click();
      });
      await new Promise(r => setTimeout(r, 800));
    }
    return extractCards();
  };

  // ---------- MODULE 1 : Top 10 du jour ----------
  const top10 = {};
  for (const [key, label] of [["ads", "Annonces Meta"], ["products", "Produits"], ["shops", "Boutiques"]]) {
    if (!(await clickTab(label))) { warnings.push(`Onglet introuvable : ${label}`); continue; }
    await wait();
    top10[key] = await slideAll();
  }

  // détail "Analyse de l'annonce" (modale) — onglet Annonces
  await clickTab("Annonces Meta"); await wait();
  const nAnalyse = await page.evaluate(() =>
    [...document.querySelectorAll("button")].filter(b => b.innerText.trim() === "Analyse de l'annonce").length);
  for (let i = 0; i < nAnalyse && i < (top10.ads || []).length; i++) {
    await page.evaluate((i) => {
      [...document.querySelectorAll("button")].filter(b => b.innerText.trim() === "Analyse de l'annonce")[i]?.click();
    }, i);
    await wait();
    const detail = await page.evaluate(() => {
      const m = document.querySelector('[role="dialog"]') || null;
      return m ? m.innerText.slice(0, 4000) : (location.pathname !== "/fr" ? document.body.innerText.slice(0, 4000) : null);
    });
    if (top10.ads[i]) top10.ads[i].analyse_raw = detail;
    await page.keyboard.press("Escape");
    if (!page.url().endsWith("/fr")) { await page.goto(BASE, { waitUntil: "networkidle2" }); await clickTab("Annonces Meta"); }
    await wait();
  }

  // ---------- MODULE 2 & 3 : recherche par mots-clés (compte requis) ----------
  const search = [];
  // URLs vérifiées : /fr/ads/meta-library?sort_by=-publication_date&query=KW&q_search_targets=adCopy|pageName|shopDomain
  //                  /fr/products?query=KW
  // Mode gratuit constaté : ~4 annonces / 6 produits par recherche, puis plus AUCUN résultat après 1-2 recherches (quota muet).
  // => context.plan = "free" : 1 seul mot-clé par run, stop au premier résultat vide.
  const SEARCH_URL = {
    meta_ads: kw => `https://app.minea.com/fr/ads/meta-library?sort_by=-publication_date&query=${encodeURIComponent(kw)}&q_search_targets=adCopy`,
    products: kw => `https://app.minea.com/fr/products?query=${encodeURIComponent(kw)}`,
  };
  // Plans Minea (page tarifs officielle, 04-10-2026) — quotas de recherche non publiés : contrôle au runtime (0 résultat = stop)
  //   free     : ~4 annonces / 6 produits par recherche, 1-2 recherches puis quota muet
  //   starter  : 49 €/mois — Meta ads, produits, boutiques ; 10 analyses IA, 50 Magic Search / mois ; filtres Perf./Infos boutique = NON
  //   premium  : 99 €/mois — + filtres Premium (CA estimé/jour, visites, croissance), MCP officiel, 50 analyses IA, 100 Magic Search
  //   business : 199 €/mois — + analyses IA / Magic Search / notifications illimitées, MCP
  const PLAN_PROFILES = {
    free:     { keywords: 1, scrolls: 0, analyses: 4,  competitors: 6,  premiumFilters: false },
    starter:  { keywords: 2, scrolls: 3, analyses: 10, competitors: 10, premiumFilters: false },
    premium:  { keywords: 5, scrolls: 6, analyses: 20, competitors: 15, premiumFilters: true },
    business: { keywords: 8, scrolls: 10, analyses: 40, competitors: 25, premiumFilters: true },
  };
  const planName = PLAN_PROFILES[context.plan] ? context.plan : "free";
  const PROFILE = PLAN_PROFILES[planName];
  const free = planName === "free";
  context.maxCompetitors = context.maxCompetitors || PROFILE.competitors;
  const kws = (context.keywords || []).slice(0, PROFILE.keywords);
  let quota = false;
  if (loggedIn) {
    for (const section of ["meta_ads", "products"]) {
      for (const kw of kws) {
        if (quota) break;
        await page.goto(SEARCH_URL[section](kw), { waitUntil: "networkidle2", timeout: 60000 });
        await new Promise(r => setTimeout(r, 5000));           // chargement asynchrone des cartes
        let cards = await extractCards();
        if (!cards.length) {                                    // repli : recherche via la modale (UI)
          await page.goto(SEARCH_URL[section]("").split("?")[0], { waitUntil: "networkidle2" });
          await page.evaluate(() => document.querySelector('input[type="text"]')?.click());
          await new Promise(r => setTimeout(r, 1000));
          const modal = await page.$('input[placeholder^="Recherche par mots-clés"]');
          if (modal) {
            await modal.type(kw, { delay: 80 });
            await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.innerText.trim() === "Rechercher")?.click());
            await new Promise(r => setTimeout(r, 6000));
            cards = await extractCards();
          }
        }
        if (!cards.length) { quota = true; warnings.push(`QUOTA_OU_VIDE : 0 résultat pour "${kw}" (${section}) — quota gratuit probablement atteint.`); break; }
        for (let s = 0; s < PROFILE.scrolls; s++) {            // pagination par scroll selon le plan
          await page.evaluate(() => document.querySelectorAll("main, main *").forEach(e => { if (e.scrollHeight > e.clientHeight + 50) e.scrollTop = e.scrollHeight; }));
          await new Promise(r => setTimeout(r, 1500));
          cards = await extractCards();
        }
        search.push({ section, keyword: kw, cards });
        await wait();
      }
    }
  }

  // ---------- MODULE 4 : pages produit concurrentes (Shopify .js / JSON-LD) ----------
  const urls = [...new Set([...(top10.ads || []), ...search.flatMap(s => s.cards)].map(c => c.url).filter(Boolean))]
    .slice(0, context.maxCompetitors || 10);
  const competitors = [];
  for (const u of urls) {
    const clean = u.split("?")[0];
    const res = { url: u };
    try {
      const r = await page.goto(clean + ".js", { waitUntil: "domcontentloaded", timeout: 30000 });
      if (r && r.ok()) {
        const j = JSON.parse(await page.evaluate(() => document.body.innerText));
        res.platform = "shopify";
        res.title = j.title; res.vendor = j.vendor; res.type = j.type;
        res.price = j.price / 100; res.compare_at = j.compare_at_price ? j.compare_at_price / 100 : null;
        res.variants = (j.variants || []).length; res.available = j.available;
      } else throw new Error("not shopify");
    } catch {
      try {
        await page.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 });
        Object.assign(res, await page.evaluate(() => {
          const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
            .map(s => { try { return JSON.parse(s.textContent); } catch { return null; } }).flat()
            .find(x => x && (x["@type"] === "Product" || x["@graph"]));
          const p = ld && (ld["@type"] === "Product" ? ld : (ld["@graph"] || []).find(g => g["@type"] === "Product"));
          const off = p && (Array.isArray(p.offers) ? p.offers[0] : p.offers);
          return {
            platform: "other",
            title: p?.name || document.title,
            price: off?.price ? Number(off.price) : null,
            currency: off?.priceCurrency || null,
            rating: p?.aggregateRating?.ratingValue || null,
            reviews: p?.aggregateRating?.reviewCount || null,
            h1: document.querySelector("h1")?.innerText || null,
          };
        }));
      } catch (e) { res.error = String(e).slice(0, 200); }
    }
    competitors.push(res);
    await wait();
  }

  return { data: { ok: true, plan: planName, loggedIn, top10, search, competitors, warnings, scrapedAt: new Date().toISOString() }, type: "application/json" };
}
