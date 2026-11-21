/**
 * Ce qui n'est PAS un fournisseur (21/11/2026, constaté en ligne : claude.ai,
 * github.com, deepseek.com, openclaw.ai, me.developers.google.com… listés
 * comme fournisseurs dans Mes annonces et comptés dans les jauges).
 *
 * L'extension importe depuis n'importe quelle page : une page d'outil, de
 * code ou d'inscription finit avec un `sourceSite`. On ne peut pas dresser la
 * liste des boutiques (elle est ouverte) ; on écarte les sites qui n'en sont
 * clairement pas. Copie à l'identique : frontend/src/lib/sourcesFournisseurs.ts.
 */
const NON_FOURNISSEURS = [
  'claude.ai', 'anthropic.com', 'chatgpt.com', 'openai.com', 'deepseek.com', 'openclaw.ai', 'perplexity.ai', 'mistral.ai',
  'gemini.google.com', 'developers.google.com', 'cloud.google.com', 'accounts.google.com', 'docs.google.com', 'drive.google.com', 'mail.google.com', 'aistudio.google.com',
  'github.com', 'githubusercontent.com', 'gitlab.com', 'stackoverflow.com', 'notion.so', 'vercel.app', 'vercel.com', 'railway.app', 'railway.com', 'stripe.com',
  'drop-shipper.fr', 'drop-shop.cloud', 'localhost', '127.0.0.1', 'gouv.fr', 'occitanie-invest.com', 'linkedin.com', 'youtube.com',
]
const PREFIXES = ['inscription.', 'login.', 'auth.', 'accounts.', 'console.', 'dashboard.', 'admin.']

export function estFournisseur(site: string | null | undefined): site is string {
  if (!site) return false
  const h = String(site).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '').replace(/^www\./, '')
  if (!h || !h.includes('.')) return false
  if (PREFIXES.some((p) => h.startsWith(p))) return false
  return !NON_FOURNISSEURS.some((d) => h === d || h.endsWith('.' + d))
}
