'use strict'
/**
 * Ecriture d'un rapport MarketSpy dans la base des rapports du Poste d'analyses
 * (`rapports-poste.db`, sur le disque durable du serveur).
 *
 * Il n'y a qu'UN code de lecture/ecriture des etudes : `rapports-etude.cjs`,
 * celui de l'import local (`importer-aimarket.cjs`) et de l'import Google Drive.
 * Ce module n'ajoute que le schema (la base du Poste est creee vide, a l'identique
 * de rapports.db) et un format de retour pratique pour la route d'envoi.
 */
const { etudeAiMarket, ecrireEtude, slug } = require('./rapports-etude.cjs');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        categorie TEXT NOT NULL,
        theme TEXT NOT NULL,
        titre TEXT NOT NULL,
        agent TEXT NOT NULL,
        sources INTEGER,
        data JSON NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS marketing_reports (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        social_places JSON,
        ads_current JSON,
        trends_daily JSON,
        trending_ads JSON,
        image_prompts JSON,
        video_prompts JSON,
        FOREIGN KEY (report_id) REFERENCES reports(id)
      );

CREATE TABLE IF NOT EXISTS rayon_reports (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        analysis TEXT,
        products JSON,
        FOREIGN KEY (report_id) REFERENCES reports(id)
      );

CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        rayon_report_id TEXT NOT NULL,
        title TEXT NOT NULL,
        supplier TEXT,
        supplier_url TEXT,
        buy_price TEXT,
        sell_price TEXT,
        margin TEXT,
        import_method TEXT,
        reason TEXT,
        recommended_url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, product_key TEXT, brand TEXT, buy_price_eur REAL, sell_price_eur REAL, margin_eur REAL, margin_pct REAL, roi_pct REAL, report_date TEXT, categorie TEXT, theme TEXT, rank INTEGER, is_product INTEGER, verdict TEXT, url_type TEXT, image_url TEXT, moq TEXT, eu_stock INTEGER, score_global INTEGER, score_demand INTEGER, score_trend INTEGER, score_margin INTEGER, score_supplier INTEGER, score_competition INTEGER, score_ads INTEGER, score_risk INTEGER,
        FOREIGN KEY (rayon_report_id) REFERENCES rayon_reports(id)
      );

CREATE TABLE IF NOT EXISTS import_log (
        id TEXT PRIMARY KEY,
        import_date TEXT,
        file_path TEXT,
        status TEXT,
        message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date);

CREATE INDEX IF NOT EXISTS idx_reports_categorie ON reports(categorie);

CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);

CREATE INDEX IF NOT EXISTS idx_products_cle ON products(product_key, report_date);

CREATE INDEX IF NOT EXISTS idx_products_date ON products(report_date);

CREATE INDEX IF NOT EXISTS idx_products_cat ON products(categorie, theme, report_date);

CREATE INDEX IF NOT EXISTS idx_products_marge ON products(margin_eur);
`;

function creerSchema(db) {
  db.exec(SCHEMA);
}

/**
 * Ce que le rapport dit de lui-meme. Leve avec la raison quand le bloc study
 * est incomplet. `produits` est la liste des produits du rapport.
 */
function lireEtude(d) {
  const etude = etudeAiMarket(d, 'poste-analyses');
  if (!etude.ok) throw new Error(etude.raison);
  return {
    date: etude.date,
    categorie: etude.categorie,
    theme: etude.theme,
    produits: Array.isArray(d.products) ? d.products : [],
    nbSources: etude.sources,
    idRayon: etude.idRayon,
    idMkt: etude.idMarketing,
    titre: etude.titre,
  };
}

/** Ecrit le rapport rayon ET le rapport marketing, en une transaction. */
function ecrireRapport(db, d, nom) {
  const etude = etudeAiMarket(d, nom);
  if (!etude.ok) throw new Error(etude.raison);
  ecrireEtude(db, etude);
  return { date: etude.date, categorie: etude.categorie, theme: etude.theme, idRayon: etude.idRayon, idMkt: etude.idMarketing, produits: etude.produits, sources: etude.sources };
}

module.exports = { slug, creerSchema, lireEtude, ecrireRapport, SCHEMA };
