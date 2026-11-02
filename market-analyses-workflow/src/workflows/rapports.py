"""Workflow KANTIX — Rapports rayon quotidiens MARKET-ANALYSES (version étoffée).

Pipeline par rayon (niveau « MARKETSPY AI » du 12/10/2026) :
  1. Recherche marché (tendances, nouveautés, saison, saturation, social).
  2. Sourcing par plateforme (AliExpress, Alibaba, CJ, Temu/DHGate, grossistes UE)
     avec extraction des pages fournisseurs (prix réels).
  3. Recherche marketplaces (Amazon, Cdiscount, Leboncoin, Vinted, autres).
  4. Extraction LLM : jusqu'à 20 produits candidats en JSON sourcé.
  5. Calcul déterministe (port du moteur common.py) : coût rendu France,
     marge brute, marge nette, ROI, prix max d'achat, scores, tableaux.
  6. Rédaction LLM : rapport complet, tableaux chiffrés pré-calculés injectés
     (aucun chiffre recalculé ou inventé par le modèle).

Sortie Drive : MARKET-ANALYSES/rapports/AAAA-MM-JJ/{categorie_id}/{theme_id}.rayon.md
Rotation du thème : themes[(jour_de_l_annee - 1) % 7] (Europe/Paris).
Dossiers réutilisés si existants ; fichier jamais écrasé (LISEZMOI).
"""

import asyncio
import json
import os
import re
from datetime import date as date_cls, datetime
from typing import Any
from zoneinfo import ZoneInfo

import pydantic
import mistralai.workflows as workflows
from mistralai.workflows import Depends
from mistralai.workflows.plugins.mistralai.connectors import (
    ToolCallClient,
    connector,
    uses_connectors,
)
from mistralai import Mistral

# ---------------------------------------------------------------- constantes

drive_connector = connector("google_drive_mcp")
tavily_connector = connector("tavily_6b7d")

RAPPORTS_FOLDER_ID = "1WqOueBTHriAtgsvczb6eooQyfdgrrL_V"
CATEGORIES_FILE_ID = "1ylb7S7zo2VjbnnpRd1Dtxx-ofk5Q5Oh5"
PROMPT_MAITRE_FILE_ID = "1DMTjyOo_i5Hr0WgYzbEp4V45ga8h8AjZ"

DEFAULT_MODEL = "mistral-large-latest"
PARIS = ZoneInfo("Europe/Paris")

# Moteur de calcul — hypothèses identiques pour tous les rayons (LISEZMOI)
FX = 0.86          # 1 USD = 0,86 EUR (à revérifier le jour de l'achat)
DUTY = 3.0         # droit forfaitaire UE 3 EUR / colis <= 150 EUR hors UE
TARGET_NET = 0.20  # marge nette cible = 20 % du prix TTC

PLATEFORMES_SOURCING = [
    ("AliExpress", ["aliexpress.com"]),
    ("Alibaba", ["alibaba.com"]),
    ("CJ Dropshipping", ["cjdropshipping.com"]),
    ("Temu", ["temu.com"]),
    ("DHGate", ["dhgate.com"]),
    ("Grossistes UE", ["cdiscount.com/pro", "madein-france.fr"]),
]


class RapportsInput(pydantic.BaseModel):
    date: str | None = None
    categorie_ids: list[str] | None = None
    model: str | None = None
    batch_size: int = 6


# ---------------------------------------------------------------- utilitaires


def _payload(resp: Any) -> Any:
    if resp is None:
        return {}
    if isinstance(resp, str):
        try:
            return json.loads(resp)
        except Exception:
            return resp
    if isinstance(resp, dict):
        content = resp.get("content")
        if isinstance(content, list):
            texts = [
                b.get("text", "")
                for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            ]
            joined = "\n".join(t for t in texts if t)
            if joined:
                try:
                    return json.loads(joined)
                except Exception:
                    return joined
        return resp
    return resp


def _parse_categories(raw: str) -> list[dict]:
    idx = raw.find('"categories"')
    if idx == -1:
        raise ValueError("Clé 'categories' introuvable dans le fichier de référence.")
    start = raw.find("[", idx)
    if start == -1:
        raise ValueError("Tableau 'categories' introuvable.")
    end_marker = raw.find('"sortie_fichiers"', start)
    end = start + raw[start:end_marker].rfind("]") if end_marker != -1 else raw.rfind("]")
    if end <= start:
        raise ValueError("Fin du tableau 'categories' introuvable.")
    categories = json.loads(raw[start : end + 1])
    if not isinstance(categories, list) or not categories:
        raise ValueError("Tableau 'categories' vide ou invalide.")
    for cat in categories:
        if not cat.get("id") or not cat.get("themes"):
            raise ValueError(f"Catégorie malformée : {cat.get('id')!r}")
    return categories


def _remplacer_variables(prompt: str, date_str: str, cat: dict, theme: dict) -> str:
    paires = [
        ("[DATE DU JOUR]", date_str), ("\\[DATE DU JOUR\\]", date_str),
        ("[NOM DE LA CATÉGORIE]", cat.get("label", cat["id"])),
        ("\\[NOM DE LA CATÉGORIE\\]", cat.get("label", cat["id"])),
        ("[SLUG CATÉGORIE]", cat["id"]), ("\\[SLUG CATÉGORIE\\]", cat["id"]),
        ("[NOM DU THÈME]", theme.get("label", theme["id"])),
        ("\\[NOM DU THÈME\\]", theme.get("label", theme["id"])),
        ("[SLUG THÈME]", theme["id"]), ("\\[SLUG THÈME\\]", theme["id"]),
    ]
    for a, b in paires:
        prompt = prompt.replace(a, b)
    return prompt


def _json_depuis_llm(texte: str) -> Any:
    texte = texte.strip()
    if texte.startswith("```"):
        texte = re.sub(r"^```[a-zA-Z]*\n?", "", texte)
        texte = re.sub(r"\n?```$", "", texte)
    debut = texte.find("[")
    if texte.lstrip().startswith("{"):
        debut = texte.find("{")
    fin = max(texte.rfind("]"), texte.rfind("}"))
    return json.loads(texte[debut : fin + 1])


def _extraire_urls(digest: str, limite: int = 4, domaine: str | None = None) -> list[str]:
    urls = []
    for m in re.finditer(r"https?://[^\s\)\]]+", digest):
        u = m.group(0).rstrip(".,;")
        if domaine and domaine not in u:
            continue
        if u not in urls:
            urls.append(u)
    return urls[:limite]


# ---------------------------------------------------------------- moteur (port de common.py)


def eur(x) -> str:
    if x is None:
        return "Non vérifié"
    return f"{x:,.2f} €".replace(",", " ").replace(".", ",")


def pct(x) -> str:
    if x is None:
        return "Non vérifié"
    return f"{round(x * 100)} %"


def _table(headers: list[str], rows: list[list]) -> str:
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(c).replace("\n", " ") for c in r) + " |")
    return "\n".join(out)


def _verdict(score: int) -> str:
    if score >= 85:
        return "opportunité très forte"
    if score >= 70:
        return "opportunité intéressante"
    if score >= 55:
        return "test possible"
    if score >= 40:
        return "watchlist"
    return "éviter"


def _landed_from_usd(p: dict) -> float | None:
    usd = p.get("usd")
    if usd is None:
        return p.get("landed")
    qty = p.get("qty") or 1
    ship = p.get("ship") or 0.0
    base = usd * qty * FX + ship + DUTY
    return round(base * 1.2, 2)


def _compute(p: dict) -> dict:
    P = p["sell"]
    mode = p.get("vat", "ht")
    comm = P * p.get("comm", 0)
    pay = P * p.get("pay", 0)
    ads = p.get("ads", 0)
    sav = P * p.get("sav", 0.05)
    extra = p.get("extra", 0)
    fees = comm + pay
    L = _landed_from_usd(p)
    if mode == "marge":  # occasion, TVA sur marge
        k = 1 - 1 / 6
        maxbuy = (P * (1 - 1 / 6 - TARGET_NET) - fees - ads - sav - extra) / k
        if L is None:
            gross = net = roi = None
        else:
            tvam = max(P - L, 0) / 6
            gross = P - L - tvam
            net = gross - fees - ads - sav - extra
            roi = net / L if L else None
    else:  # vendeur assujetti, revenu HT
        rev = P / 1.2
        maxbuy = rev - fees - ads - sav - extra - TARGET_NET * P
        if L is None:
            gross = net = roi = None
        else:
            gross = rev - L
            net = rev - L - fees - ads - sav - extra
            roi = net / L if L else None
    p.update(
        landed=L,
        fees=round(fees, 2),
        sav_cost=round(sav, 2),
        gross=None if gross is None else round(gross, 2),
        net=None if net is None else round(net, 2),
        roi=roi,
        maxbuy=round(maxbuy, 2),
        score=sum(p.get("scores", [0] * 7)),
    )
    p["verdict_opportunite"] = _verdict(p["score"])
    return p


def _t1(products: list[dict]) -> str:
    return _table(
        ["Rang", "Produit", "Variante", "Source achat", "Coût rendu FR", "Prix vente cible",
         "Marge nette estimée", "ROI", "Prix max d'achat (coût rendu)", "Score", "Décision"],
        [[p["rank"], p["name"], p.get("variant", ""), p.get("source", ""),
          eur(p.get("landed")), eur(p["sell"]), eur(p.get("net")), pct(p.get("roi")),
          eur(p["maxbuy"]), f'{p["score"]}/100', p.get("decision", "")] for p in products],
    )


def _battle(products: list[dict]) -> str:
    return _table(
        ["Produit", "Prix vente TTC", "Revenu HT / base", "Coût rendu", "Commission + paiement",
         "Pub / unité", "Réserve SAV", "Autres frais", "Marge brute", "Marge nette", "ROI",
         "Prix max d'achat", "Seuil d'abandon"],
        [[p["name"], eur(p["sell"]),
          eur(p["sell"] / 1.2) if p.get("vat", "ht") == "ht" else "TVA sur marge",
          eur(p.get("landed")), eur(p.get("fees")), eur(p.get("ads", 0)),
          eur(p.get("sav_cost")), eur(p.get("extra", 0)), eur(p.get("gross")),
          eur(p.get("net")), pct(p.get("roi")), eur(p["maxbuy"]), p.get("stop", "")] for p in products],
    )


def _t5(products: list[dict]) -> str:
    rows = []
    for p in products:
        if p.get("test_qty"):
            unit = p["maxbuy"] if p.get("landed") is None else min(p["landed"], p["maxbuy"])
            rows.append([f'{p["name"]} — {p.get("variant", "")}', p["test_qty"], eur(unit * p["test_qty"]),
                         p.get("channel", ""), p.get("angle", ""), p.get("goal", ""), p.get("stop", "")])
    return _table(["Produit", "Quantité test", "Budget achat", "Plateforme vente", "Angle marketing",
                   "Objectif", "Seuil abandon"], rows)


def _fiches(products: list[dict]) -> str:
    out = []
    for p in products:
        out.append(f"""### {p['rank']}. {p['name']} — {p.get('variant', '')}

- Catégorie / sous-catégorie : {p.get('cat', '')}
- Usage principal : {p.get('usage', '')} · Cible client : {p.get('target', '')}
- Problème résolu : {p.get('problem', '')}
- Prix fournisseur observé : {p.get('buy_txt', 'Non vérifié')} — [{p.get('supplier', p.get('source', 'fournisseur'))}]({p.get('supplier_url', '')})
- Coût rendu France estimé : {eur(p.get('landed'))}
- Prix de vente bas / cible / haut : {eur(p.get('low'))} / {eur(p['sell'])} / {eur(p.get('high'))}
- Marge brute : {eur(p.get('gross'))} · marge nette estimée : {eur(p.get('net'))} · ROI : {pct(p.get('roi'))}
- Prix d'achat maximum acceptable (coût rendu) : {eur(p['maxbuy'])}
- Concurrence : {p.get('competition', '')} · potentiel pub : {p.get('ads_pot', '')} · SEO : {p.get('seo', '')} · marketplace : {p.get('mkpot', '')}
- Risque produit : {p.get('risk', '')}
- Quantité de test : {p.get('test_qty') or 'aucune à ce stade'} · décision : {p.get('decision', '')} · score : {p['score']}/100 ({p['verdict_opportunite']})
- Justification : {p.get('why', '')}
""")
    return "\n".join(out)


def _calculer_produits(brut: Any) -> list[dict]:
    if isinstance(brut, str):
        brut = _json_depuis_llm(brut)
    if not isinstance(brut, list) or not brut:
        raise ValueError("La liste de produits extraite est vide ou invalide.")
    produits = []
    for i, p in enumerate(brut[:20], start=1):
        if not isinstance(p, dict) or "name" not in p or "sell" not in p:
            continue
        p.setdefault("rank", i)
        produits.append(_compute(p))
    if not produits:
        raise ValueError("Aucun produit exploitable après calcul.")
    return produits


# ---------------------------------------------------------------- LLM


def _client_mistral() -> Mistral:
    return Mistral(api_key=os.environ["MISTRAL_API_KEY"])


async def _chat(model: str, messages: list[dict], temperature: float = 0.3) -> str:
    client = _client_mistral()
    chat = client.chat
    if hasattr(chat, "create_async"):
        reponse = await chat.create_async(model=model, messages=messages, temperature=temperature)
    else:
        reponse = chat.create(model=model, messages=messages, temperature=temperature)
    contenu = reponse.choices[0].message.content
    if not contenu or not contenu.strip():
        raise RuntimeError("Le modèle n'a renvoyé aucun contenu.")
    return contenu.strip()


# ---------------------------------------------------------------- activités


@workflows.activity(name="lire-references")
async def lire_references(drive: ToolCallClient = Depends(drive_connector)) -> dict:
    resp_cat = _payload(await drive.call_tool("read_file_content", {"file_id": CATEGORIES_FILE_ID}))
    resp_prompt = _payload(await drive.call_tool("read_file_content", {"file_id": PROMPT_MAITRE_FILE_ID}))
    raw_cat = resp_cat.get("file_content") if isinstance(resp_cat, dict) else None
    raw_prompt = resp_prompt.get("file_content") if isinstance(resp_prompt, dict) else None
    if not raw_cat:
        raise RuntimeError("Impossible de lire categories-et-dossier-sortie.txt sur Drive.")
    if not raw_prompt:
        raise RuntimeError("Impossible de lire PROMPT-MAITRE.md sur Drive.")
    return {"categories": _parse_categories(raw_cat), "prompt_maitre": raw_prompt}


@workflows.activity(name="recherche-web")
async def recherche_web(
    requetes: list[dict],
    tavily: ToolCallClient = Depends(tavily_connector),
) -> str:
    morceaux: list[str] = []
    for r in requetes:
        args: dict = {"query": r["query"], "max_results": r.get("max_results", 8),
                      "search_depth": "basic", "topic": "general"}
        if r.get("include_domains"):
            args["include_domains"] = r["include_domains"]
        try:
            resp = _payload(await tavily.call_tool("tavily_search", args))
        except Exception as exc:
            morceaux.append(f"## Recherche « {r['query']} »\nÉCHEC : {exc}")
            continue
        results = resp.get("results") if isinstance(resp, dict) else (resp if isinstance(resp, list) else None)
        lignes = []
        if isinstance(results, list):
            for x in results:
                if not isinstance(x, dict):
                    continue
                lignes.append(
                    f"- {x.get('title') or ''} — {x.get('url') or ''}\n  {x.get('content') or x.get('description') or ''}"
                )
        morceaux.append(f"## Recherche « {r['query']} »\n" + ("\n".join(lignes) if lignes else "Aucun résultat."))
        await asyncio.sleep(2)
    return "\n\n".join(morceaux)


@workflows.activity(name="extraire-pages")
async def extraire_pages(
    urls: list[str],
    theme_label: str,
    tavily: ToolCallClient = Depends(tavily_connector),
) -> str:
    if not urls:
        return "(aucune page fournisseur à extraire)"
    try:
        resp = _payload(
            await tavily.call_tool(
                "tavily_extract",
                {"urls": urls, "format": "markdown", "query": f"prix produit {theme_label}", "extract_depth": "basic"},
            )
        )
    except Exception as exc:
        return f"ÉCHEC extraction : {exc}"
    if isinstance(resp, dict):
        results = resp.get("results") or []
        morceaux = []
        for x in results:
            if isinstance(x, dict):
                morceaux.append(
                    f"## Page {x.get('url', '')}\n" + str(x.get("raw_content") or x.get("content") or "")[:6000]
                )
        return "\n\n".join(morceaux) if morceaux else str(resp)[:6000]
    return str(resp)[:6000]


@workflows.activity(name="structurer-produits")
async def structurer_produits(
    date_str: str,
    cat_label: str,
    theme_label: str,
    digest_marche: str,
    digest_sourcing: str,
    digest_marketplaces: str,
    model: str,
) -> str:
    systeme = (
        "Tu es un extracteur de données de sourcing e-commerce. À partir des recherches web fournies, "
        "tu produis UNIQUEMENT un tableau JSON d'au maximum 20 produits candidats à revendre en France. "
        "Règles absolues : n'invente AUCUN prix, URL, note ou volume — chaque valeur vient des recherches ; "
        "si une donnée manque, mets null. Prix usd uniquement si la source affiche des dollars ; "
        "buy_eur/landed uniquement si la source donne un prix en euros rendu (ex. achat local occasion, "
        "auquel cas mets aussi vat=marge pour la revente d'occasion). "
        "Pour chaque produit : {name, variant, cat, usage, target, problem, source (plateforme), supplier, "
        "supplier_url, buy_txt (texte du prix observé + note/avis si visibles), usd (float|null), qty (int, défaut 1), "
        "buy_eur (float|null), ship (float, défaut 0), vat (ht|marge), sell (float, prix de vente cible TTC observé "
        "sur les marketplaces), low, high (float), comm (0.15 par défaut), ads (float, budget pub/unité, hypothèse 2-4), "
        "sav (0.05 accessoires / 0.10 électronique), channel, competition, ads_pot, seo, mkpot, risk, test_qty "
        "(int|null), scores: [7 entiers : Demand /20, Trend /15, Margin /20, Supplier /15, Competition /10, Ads /10, "
        "Risk /10], decision (BUY NOW | BUY IF NEGOTIATED | WATCHLIST | BREAKOUT CANDIDATE | DON'T BUY), why, angle, "
        "goal, stop, comp_label, comp_url, rating, orders}. Réponds UNIQUEMENT par le JSON, sans texte autour."
    )
    user = (
        f"Date : {date_str}. Rayon : {cat_label}. Thème : {theme_label}.\n\n"
        f"# Recherches marché\n{digest_marche}\n\n"
        f"# Recherches sourcing (pages fournisseurs)\n{digest_sourcing}\n\n"
        f"# Recherches marketplaces (prix de revente)\n{digest_marketplaces}\n\n"
        "Extrais le tableau JSON des 20 meilleurs produits candidats."
    )
    return await _chat(model, [{"role": "system", "content": systeme}, {"role": "user", "content": user}], 0.2)


@workflows.activity(name="calculer-produits")
async def calculer_produits(json_brut: str) -> dict:
    produits = _calculer_produits(json_brut)
    return {
        "produits": produits,
        "t1": _t1(produits),
        "battle": _battle(produits),
        "t5": _t5(produits),
        "fiches": _fiches(produits),
        "json": json.dumps(produits, ensure_ascii=False, indent=2),
    }


@workflows.activity(name="rediger-rapport")
async def rediger_rapport(
    prompt_maitre: str,
    date_str: str,
    cat: dict,
    theme: dict,
    digest_marche: str,
    digest_sourcing: str,
    digest_marketplaces: str,
    calculs: dict,
    model: str,
) -> str:
    systeme = _remplacer_variables(prompt_maitre, date_str, cat, theme)
    systeme += (
        "\n\nIMPORTANT — Consignes d'assemblage : les tableaux chiffrés te sont fournis "
        "PRÉ-CALCULÉS par le moteur financier ; recopie-les tels quels, ne recalcule et "
        "ne modifie AUCUN chiffre. Les sections narratives (résumé exécutif, verdict, "
        "marché, sourcing, marketplaces, risques, décision finale, sources) s'appuient "
        "uniquement sur les recherches du jour ; toute donnée absente est « Non vérifié ». "
        "N'invente aucun prix, fournisseur, URL, note ou volume."
    )
    user = (
        f"# Recherches marché du {date_str}\n{digest_marche}\n\n"
        f"# Recherches sourcing\n{digest_sourcing}\n\n"
        f"# Recherches marketplaces\n{digest_marketplaces}\n\n"
        "# Tableaux chiffrés pré-calculés (à recopier tels quels)\n\n"
        f"## Tableau 1 — Synthèse TOP 20\n{calculs['t1']}\n\n"
        f"## Tableau financier détaillé (battle sheet)\n{calculs['battle']}\n\n"
        f"## Tableau 5 — Plan de test\n{calculs['t5']}\n\n"
        f"## Fiches produits détaillées\n{calculs['fiches']}\n\n"
        "Produis maintenant le rapport rayon complet au format Markdown avec ces sections dans l'ordre : "
        "en-tête (rayon, thème, date, pays), hypothèses de calcul (change 0,86, droit 3 €, TVA 20 %, "
        "marge nette cible 20 %), 1. Executive Summary, 2. Verdict rapide, 3. Marché actuel "
        "(tendances, nouveautés, innovations, saison, saturation), 4. Analyse sourcing "
        "(AliExpress, Alibaba, CJ, Temu/DHGate, grossistes UE, synthèse), 5. Analyse marketplaces "
        "(Amazon, Cdiscount, Leboncoin, Vinted, Facebook Marketplace, autres, synthèse prix), "
        "6. TOP 20 (Tableau 1 + fiches), 7. Battle sheet (tableau financier + plan de test), "
        "8. Risques et exclusions, 9. Décision finale, 10. Sources. "
        "Le volet marketing n'est PAS dans ce fichier. Réponds UNIQUEMENT par le rapport Markdown."
    )
    return await _chat(model, [{"role": "system", "content": systeme}, {"role": "user", "content": user}], 0.4)


@workflows.activity(name="trouver-ou-creer-dossier")
async def trouver_ou_creer_dossier(
    titre: str,
    parent_id: str,
    drive: ToolCallClient = Depends(drive_connector),
) -> str:
    resp = _payload(
        await drive.call_tool(
            "search_files",
            {"query": f"title = '{titre}' and parent_id = '{parent_id}'", "page_size": 50},
        )
    )
    dossiers = [f for f in (resp.get("files") if isinstance(resp, dict) else resp or []) if isinstance(f, dict) and f.get("id")]
    if dossiers:
        dossiers.sort(key=lambda f: f.get("created_time") or "")
        return str(dossiers[0]["id"])
    cree = _payload(
        await drive.call_tool(
            "create_file",
            {
                "title": titre,
                "parent_id": parent_id,
                "mime_type": "application/vnd.google-apps.folder",
                "_confirmationReason": "Création du dossier de sortie du rapport dans Google Drive.",
            },
        )
    )
    if isinstance(cree, dict) and cree.get("id"):
        return str(cree["id"])
    raise RuntimeError(f"Impossible de créer le dossier Drive « {titre} ».")


@workflows.activity(name="deposer-rapport")
async def deposer_rapport(
    markdown: str,
    date_str: str,
    cat_id: str,
    theme_id: str,
    drive: ToolCallClient = Depends(drive_connector),
) -> dict:
    dossier_date = await trouver_ou_creer_dossier(date_str, RAPPORTS_FOLDER_ID, drive=drive)
    dossier_cat = await trouver_ou_creer_dossier(cat_id, dossier_date, drive=drive)
    titre = f"{theme_id}.rayon.md"
    resp = _payload(
        await drive.call_tool(
            "search_files",
            {"query": f"title = '{titre}' and parent_id = '{dossier_cat}'", "page_size": 10},
        )
    )
    existants = [f for f in (resp.get("files") if isinstance(resp, dict) else resp or []) if isinstance(f, dict) and f.get("id")]
    if existants:
        return {"statut": "existe_deja", "titre": titre}
    cree = _payload(
        await drive.call_tool(
            "create_file",
            {
                "title": titre,
                "parent_id": dossier_cat,
                "text_content": markdown,
                "content_mime_type": "text/markdown",
                "disable_conversion_to_google_type": True,
                "_confirmationReason": "Dépôt du rapport rayon du jour dans Google Drive.",
            },
        )
    )
    if isinstance(cree, dict) and cree.get("id"):
        return {"statut": "ecrit", "titre": titre, "id": cree.get("id"), "url": cree.get("view_url")}
    raise RuntimeError(f"Échec du dépôt de {titre} dans Drive.")


@workflows.activity(name="pause")
async def pause(secondes: int) -> None:
    await asyncio.sleep(secondes)


# ---------------------------------------------------------------- workflow


def _requetes_du_jour(theme_label: str) -> tuple[list[dict], list[dict]]:
    requetes_marche = [
        {"query": f"tendances marché {theme_label} France 2026"},
        {"query": f"nouveautés {theme_label} 2026"},
        {"query": f"{theme_label} saisonnalité ventes fin d'année"},
        {"query": f"{theme_label} TikTok viral tendance"},
        {"query": f"produits gagnants {theme_label} dropshipping France"},
    ]
    requetes_mk = [
        {"query": f"{theme_label} prix", "include_domains": ["amazon.fr"]},
        {"query": f"{theme_label} prix", "include_domains": ["cdiscount.com"]},
        {"query": f"{theme_label} occasion", "include_domains": ["leboncoin.fr"]},
        {"query": f"{theme_label} prix", "include_domains": ["vinted.fr", "backmarket.fr", "fnac.com", "darty.com"]},
    ]
    return requetes_marche, requetes_mk


@workflows.workflow.define(
    name="kantix-rapports-quotidiens",
    workflow_display_name="KANTIX — Rapports rayon quotidiens",
    workflow_description=(
        "Génère chaque jour 24 rapports rayon MARKETSPY-complets (sourcing par plateforme, "
        "moteur de calcul coût rendu/marge/ROI, TOP 20, battle sheet) et les dépose dans Google Drive."
    ),
)
@uses_connectors(drive_connector, tavily_connector)
class RapportsQuotidiensWorkflow:
    @workflows.workflow.entrypoint
    async def run(self, input: RapportsInput) -> dict:
        jour = date_cls.fromisoformat(input.date) if input.date else datetime.now(PARIS).date()
        date_str = jour.isoformat()
        index_theme = (jour.timetuple().tm_yday - 1) % 7

        refs = await lire_references()
        categories = refs["categories"]
        prompt_maitre = refs["prompt_maitre"]

        if input.categorie_ids:
            categories = [c for c in categories if c["id"] in set(input.categorie_ids)]
            manquants = set(input.categorie_ids) - {c["id"] for c in categories}
            if manquants:
                raise ValueError(f"Rayons inconnus : {sorted(manquants)}")

        model = input.model or DEFAULT_MODEL
        taille_lot = max(1, input.batch_size)

        rapports: list[dict] = []
        lots = [categories[i : i + taille_lot] for i in range(0, len(categories), taille_lot)]
        for lot in lots:
            for cat in lot:
                theme = cat["themes"][index_theme % len(cat["themes"])]
                entree = {
                    "categorie": cat["id"],
                    "theme": theme["id"],
                    "theme_label": theme.get("label"),
                }
                try:
                    theme_label = theme.get("label", theme["id"])
                    cat_label = cat.get("label", cat["id"])

                    requetes_marche, requetes_mk = _requetes_du_jour(theme_label)
                    digest_marche = await recherche_web(requetes_marche)
                    digest_mk = await recherche_web(requetes_mk)

                    morceaux_src = []
                    urls_fournisseurs: list[str] = []
                    for plateforme, domaines in PLATEFORMES_SOURCING:
                        d = await recherche_web(
                            [{"query": f"{theme_label} {plateforme} prix", "include_domains": domaines, "max_results": 6},
                             {"query": f"{theme_label} {plateforme}", "max_results": 5}]
                        )
                        morceaux_src.append(f"### {plateforme}\n{d}")
                        urls_fournisseurs += _extraire_urls(d, limite=2)
                    pages = await extraire_pages(urls_fournisseurs[:6], theme_label)
                    digest_sourcing = "\n\n".join(morceaux_src) + "\n\n# Contenu des pages fournisseurs\n" + pages

                    brut = await structurer_produits(
                        date_str, cat_label, theme_label,
                        digest_marche, digest_sourcing, digest_mk, model,
                    )
                    calculs = await calculer_produits(brut)
                    markdown = await rediger_rapport(
                        prompt_maitre, date_str, cat, theme,
                        digest_marche, digest_sourcing, digest_mk, calculs, model,
                    )
                    depot = await deposer_rapport(markdown, date_str, cat["id"], theme["id"])
                    entree.update(depot)
                except Exception as exc:
                    entree.update({"statut": "erreur", "erreur": str(exc)})
                rapports.append(entree)
                await pause(5)
            await pause(10)

        return {
            "date": date_str,
            "index_theme_jour": index_theme,
            "model": model,
            "rapports": rapports,
            "ecrits": sum(1 for r in rapports if r.get("statut") == "ecrit"),
            "existait_deja": sum(1 for r in rapports if r.get("statut") == "existe_deja"),
            "erreurs": sum(1 for r in rapports if r.get("statut") == "erreur"),
        }
