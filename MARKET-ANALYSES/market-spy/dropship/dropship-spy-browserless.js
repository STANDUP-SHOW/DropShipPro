// DROPSHIP-SPY — script Browserless (/function, Puppeteer)        vérifié sur app.dropship.io le 04-10-2026
//
// PRINCIPE : l'application charge ses données via api.dropship.io en JSON clair (les recherches filtrées partent
// chiffrées → impossible d'appeler l'API directement). Le script visite chaque module avec votre session et
// INTERCEPTE les réponses JSON. Aucune dépendance au design pour les données.
//
// CRÉDITS : 1 crédit = 1 résultat affiché (constaté : 1 page de 50 créateurs = 50 crédits). Les crédits sont MENSUELS.
// Le script calcule chaque jour un budget = (crédits restants − réserve) / jours avant renouvellement / rayons du jour,
// et s'arrête dès qu'il est atteint. Il s'adapte donc tout seul au plan, au jour du mois et au nombre de rayons.

const PLANS = {          // relevé sur /setting/plan le 04-10-2026 (crédits / mois)
  trial:    { product_library: 500,   shop_library: 250,   ad_library: 500,   advertiser_library: 250,   creator_library: 200,
              competitor_per_day: 20,  track_shops: 3,  track_products: 3,   track_advertisers: 3,  drops_week: 20, ai_search: 0 },
  basic:    { product_library: 10000, shop_library: 5000,  ad_library: 10000, advertiser_library: 5000,  creator_library: 3000,
              competitor_per_day: 20,  track_shops: 10, track_products: 25,  track_advertisers: 10, drops_week: 20, ai_search: 100 },
  standard: { product_library: 25000, shop_library: 12500, ad_library: 25000, advertiser_library: 12500, creator_library: 6000,
              competitor_per_day: Infinity, track_shops: 25, track_products: 50, track_advertisers: 25, drops_week: 30, ai_search: 200 },
  premium:  { product_library: 50000, shop_library: 25000, ad_library: 50000, advertiser_library: 25000, creator_library: 10000,
              competitor_per_day: Infinity, track_shops: 50, track_products: 100, track_advertisers: 50, drops_week: 40, ai_search: 400 },
};
const PAGE_SIZE = 50;

// Entrée context = { cookies, plan:"trial|basic|standard|premium", keywords:[], competitorDomains:[],
//                    rayonsToday: 1, renewalDay: 4, creditReserve: 0.05, competitorShare: 1, pause:[ms,ms] }
export default async function ({ page, context }) {
  const APP = "https://app.dropship.io";
  const planName = PLANS[context.plan] ? context.plan : "trial";
  const P = PLANS[planName];
  const rayons = Math.max(1, context.rayonsToday || 1);
  const reservePct = context.creditReserve ?? 0.05;            // 5 % du quota mensuel jamais dépensés
  const [pMin, pMax] = context.pause || [2500, 6000];
  const wait = () => new Promise(r => setTimeout(r, pMin + Math.random() * (pMax - pMin)));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const warnings = [], captures = [], credits = {}, spent = {}, budget = {};
  let current = null;

  // jours restants avant renouvellement (trial : 7 jours fixes)
  const today = new Date();
  const renewal = new Date(today.getFullYear(), today.getMonth(), context.renewalDay || 1);
  if (renewal <= today) renewal.setMonth(renewal.getMonth() + 1);
  const daysLeft = planName === "trial" ? Math.max(1, context.trialDaysLeft || 7) : Math.max(1, Math.ceil((renewal - today) / 86400000));

  const computeBudget = (m) => {
    const left = credits[m]?.left ?? P[m];
    const usable = Math.max(0, left - Math.ceil(P[m] * reservePct));
    budget[m] = Math.floor(usable / daysLeft / rayons);
    return budget[m];
  };
  const pagesAllowed = (m) => Math.floor((budget[m] ?? computeBudget(m)) / PAGE_SIZE);

  if (Array.isArray(context.cookies) && context.cookies.length) await page.setCookie(...context.cookies);
  await page.setViewport({ width: 1440, height: 900 });

  page.on("response", async (res) => {
    try {
      const u = new URL(res.url());
      if (u.hostname !== "api.dropship.io" || !current) return;
      if (!(res.headers()["content-type"] || "").includes("json")) return;
      const body = await res.json();
      if (/filter_presets/.test(u.pathname) && body && "credits_left" in body) {
        credits[current] = { left: body.credits_left, total: body.total_credits, attempts: body.attempts_left }; return;
      }
      if (/choice_filters|auto-ds|user\/stores/.test(u.pathname)) return;
      if (body && (Array.isArray(body.results) || Array.isArray(body))) {
        const n = Array.isArray(body) ? body.length : body.results.length;
        captures.push({ module: current, api: u.pathname, count: body.count ?? null, body });
        spent[current] = (spent[current] || 0) + n;
        if (body.credits_left != null) credits[current] = { ...(credits[current] || {}), left: body.credits_left };
        if (body.attempts_left != null) credits[current] = { ...(credits[current] || {}), attempts: body.attempts_left };
      }
    } catch (_) {}
  });

  const clickText = (label) => page.evaluate((label) => {
    const el = [...document.querySelectorAll("button,[role=tab],[role=button],a,span,div")]
      .find(e => e.children.length <= 3 && e.innerText && e.innerText.trim() === label);
    if (el) { el.click(); return true; } return false;
  }, label);

  const nextPage = () => page.evaluate(() => {                 // bouton "page suivante" (› / > / aria-label next)
    const b = [...document.querySelectorAll("button, li, a")].find(e =>
      /next/i.test(e.getAttribute("aria-label") || e.getAttribute("title") || e.className || "") && !e.disabled && !/disabled/.test(e.className || ""));
    if (b) { b.click(); return true; } return false;
  });

  const search = async (kw) => {
    const input = await page.$('input[placeholder*="earch" i], input[placeholder*="nclude" i], input[type="text"]');
    if (!input) { warnings.push(`${current} : champ de recherche introuvable`); return false; }
    await input.click({ clickCount: 3 }); await input.type(kw, { delay: 70 });
    await page.keyboard.press("Enter"); await sleep(6000); return true;
  };

  // parcourt les pages tant que le budget du module le permet
  const paginate = async (m) => {
    let pages = 1;
    while (pages < pagesAllowed(m) && (spent[m] || 0) + PAGE_SIZE <= budget[m]) {
      if (!(await nextPage())) break;
      await sleep(5000); pages++;
    }
  };

  const canSearch = (m) => {
    if (credits[m]?.attempts != null && credits[m].attempts <= 0) { warnings.push(`${m} : plus de recherches aujourd'hui`); return false; }
    if (m in P && typeof P[m] === "number" && P[m] > 0 && (spent[m] || 0) + PAGE_SIZE > (budget[m] ?? computeBudget(m))) {
      warnings.push(`${m} : budget du jour atteint (${budget[m]} crédits)`); return false; }
    return true;
  };

  const visit = async (m, path, actions) => {
    current = m;
    await page.goto(APP + path, { waitUntil: "networkidle2", timeout: 90000 });
    await sleep(4000);
    const p = new URL(page.url()).pathname;
    if (/login|sign-in|onboarding/.test(p)) { warnings.push(`${m} : redirigé vers ${p} (session expirée / essai terminé)`); current = null; return; }
    if (await page.evaluate(() => /captcha|verify you are human/i.test(document.body.innerText))) throw new Error("CAPTCHA_OR_BOT_CHECK");
    if (m in P) computeBudget(m);
    if (actions) { try { await actions(); } catch (e) { warnings.push(`${m} : ${String(e).slice(0, 120)}`); } }
    await wait(); current = null;
  };

  // intensité selon le plan
  const kwAll = context.keywords || [];
  const kws = { trial: kwAll.slice(0, 1), basic: kwAll.slice(0, 2), standard: kwAll, premium: kwAll }[planName];
  const domLimit = { trial: 3, basic: Math.floor(20 * (context.competitorShare ?? 1) / rayons) || 1, standard: 15, premium: 25 }[planName];
  const doms = (context.competitorDomains || []).slice(0, domLimit);
  const adPresets = { trial: ["Weekly winners"], basic: ["Weekly winners"], standard: ["Weekly winners", "New Winning products"],
                      premium: ["Weekly winners", "New Winning products", "Evergreen Winners"] }[planName];

  try {
    // 1. Suivis + Portfolio : sans crédit
    await visit("sales_tracker", "/products/sales-tracker");
    await visit("advertiser_tracker", "/ads/advertiser-tracker");
    await visit("portfolio", "/portfolio");

    // 2. Ad Library (Facebook EU)
    await visit("ad_library", "/ads/ad-library", async () => {
      for (const pr of adPresets) { if (!canSearch("ad_library")) break; await clickText(pr); await sleep(6000); await paginate("ad_library"); }
      for (const k of kws) { if (!canSearch("ad_library")) break; await search(k); await paginate("ad_library"); }
    });

    // 3. Product Library (TikTok Shop)
    await visit("product_library", "/products/product-library", async () => {
      for (const k of kws) { if (!canSearch("product_library")) break; await search(k); await paginate("product_library"); }
    });

    // 4. Competitor Research (Shopify) — croisement Minea
    await visit("competitor_research", "/competitor-research", async () => {
      for (const q of [...kws.slice(0, 1), ...doms]) { if (!canSearch("competitor_research")) break; await search(q); }
    });

    // 5. Advertiser Library (dès Basic)
    if (planName !== "trial") await visit("advertiser_library", "/ads/advertiser-library", async () => {
      for (const k of kws) { if (!canSearch("advertiser_library")) break; await search(k); await paginate("advertiser_library"); }
    });

    // 6. Shop Library + Creator Library (Standard / Premium)
    if (planName === "standard" || planName === "premium") {
      await visit("shop_library", "/products/shop-library", async () => { if (canSearch("shop_library")) await paginate("shop_library"); });
      await visit("creator_library", "/products/creator-library", async () => {
        if (!canSearch("creator_library")) return;
        await clickText("Fast-growing creators"); await sleep(6000); await paginate("creator_library");
      });
    }

    return { data: { ok: true, plan: planName, limits: P, daysLeft, rayonsToday: rayons, budget, spent, credits, captures, warnings,
                     scrapedAt: new Date().toISOString() }, type: "application/json" };
  } catch (e) {
    return { data: { ok: false, error: String(e).slice(0, 300), plan: planName, budget, spent, credits, captures, warnings }, type: "application/json" };
  }
}
