import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Transactional email.
 *
 * Two ways out, tried in order: an SMTP mailbox (the OVH account, for instance)
 * when SMTP_HOST is set, then Resend when its key is. Without either, the message
 * is written to the log rather than dropped, so a fresh install stays testable
 * and a missing key never blocks a signup.
 *
 * Password reset is the reason this matters: it is the one flow where a silent
 * failure locks a user out of their own account for good.
 */
const FROM = process.env.MAIL_FROM || 'DropShipper IA <onboarding@resend.dev>'

interface Mail {
  to: string
  subject: string
  heading: string
  body: string
  /**
   * Le bouton d'action, quand il y en a un.
   *
   * Une réponse d'un vendeur à son client n'en a pas : elle se lit comme un
   * message, pas comme une notification d'application.
   */
  actionLabel?: string
  actionUrl?: string
  footer: string
  /**
   * Le nom affiché en tête. Par défaut le nôtre (DropShipper IA, avec logo et
   * couleurs de la charte), mais un vendeur qui répond à son acheteur écrit sous
   * son enseigne : l'acheteur ne nous connaît pas, et recevoir « DropShipper IA »
   * à la place de la boutique inquiète plus qu'il ne rassure.
   */
  brand?: string
  /** Un encadré d'accroche mis en avant sous le corps (email d'inscription). HTML. */
  highlight?: string
  /** Ajoute l'invitation à la newsletter DropShipper avant le pied. */
  newsletter?: boolean
}

function render({ heading, body, actionLabel, actionUrl, footer, brand, highlight, newsletter }: Mail) {
  // Notre marque quand aucune enseigne vendeur n'est passée : logo + wordmark
  // rose de la charte. Sinon, l'enseigne du vendeur en simple libellé.
  const entete = brand
    ? `<span style="font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:#c4b5fd">${brand}</span>`
    : `<img src="https://www.drop-shipper.fr/favicon-128.png" width="34" height="34" alt="" style="vertical-align:middle;border-radius:9px" />` +
      `<span style="vertical-align:middle;margin-left:10px;font-size:19px;font-weight:800;color:#f472b6">DropShipper IA</span>`

  // Le fond du bouton porte une couleur PLEINE avant le dégradé : Outlook ignore
  // le linear-gradient et retomberait sur du transparent sinon.
  const action =
    actionUrl && actionLabel
      ? `<tr><td style="padding-top:30px">
            <a href="${actionUrl}" style="display:inline-block;background-color:#c026d3;background-image:linear-gradient(90deg,#a855f7,#ec4899);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px">${actionLabel}</a>
          </td></tr>
          <tr><td style="padding-top:18px;font-size:12px;color:#7c7699;word-break:break-all">
            Si le bouton ne fonctionne pas, copiez ce lien&nbsp;: ${actionUrl}
          </td></tr>`
      : ''

  const encadre = highlight
    ? `<tr><td style="padding-top:24px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:1px solid rgba(236,72,153,0.35);background-color:rgba(192,38,211,0.10);border-radius:14px;padding:18px 20px;font-size:15px;line-height:1.65;color:#f5d0fe">${highlight}</td></tr></table>
        </td></tr>`
    : ''

  const news = newsletter
    ? `<tr><td style="padding-top:26px">
          <p style="margin:0 0 14px;padding-top:22px;border-top:1px solid rgba(255,255,255,0.08);font-size:14px;line-height:1.6;color:#c9c4e0">
            <b style="color:#f472b6">Restez informé des nouveautés</b> — les niches qui montent, les nouvelles fonctions et nos conseils pour vendre plus.
          </p>
          <a href="${appUrl()}/newsletter" style="display:inline-block;background-color:#c026d3;background-image:linear-gradient(90deg,#a855f7,#ec4899);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 24px;border-radius:10px">S'abonner à la newsletter</a>
        </td></tr>`
    : ''

  return `<!doctype html>
<html lang="fr"><body style="margin:0;background-color:#08070f;padding:32px 16px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background-color:#14102a;border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:36px" cellpadding="0" cellspacing="0">
        <tr><td style="padding-bottom:24px">${entete}</td></tr>
        <tr><td><h1 style="margin:0;font-size:23px;line-height:1.3;color:#ffffff;font-weight:700">${heading}</h1></td></tr>
        <tr><td style="padding-top:14px;font-size:15px;line-height:1.7;color:#cbc6e4">${body}</td></tr>
        ${encadre}
        ${action}
        ${news}
        <tr><td style="padding-top:26px;font-size:13px;line-height:1.6;color:#8b85a8">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/** Plain-text alternative: a message without one lands in spam far more often. */
function plainText(mail: Mail): string {
  // Built from char codes so no escape sequence has to survive tooling.
  const saut = String.fromCharCode(10, 10)
  // Le corps peut porter du HTML (paragraphes, gras) : on le retire pour la
  // version texte, sinon le lecteur voit les balises brutes.
  const sansHtml = (s: string) =>
    s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim()
  const lignes = [mail.heading, sansHtml(mail.body)]
  if (mail.highlight) lignes.push(sansHtml(mail.highlight))
  if (mail.actionLabel && mail.actionUrl) lignes.push(mail.actionLabel + ' : ' + mail.actionUrl)
  if (mail.newsletter)
    lignes.push('Restez informé des nouveautés — abonnez-vous à la newsletter DropShipper : ' + appUrl() + '/newsletter')
  lignes.push(mail.footer)
  return lignes.join(saut)
}

let smtp: Transporter | null | undefined

/** Built once: opening a connection per email gets an account throttled. */
function getSmtp(): Transporter | null {
  if (smtp !== undefined) return smtp

  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASSWORD?.trim()
  if (!host || !user || !pass) {
    smtp = null
    return smtp
  }

  const port = Number(process.env.SMTP_PORT) || 465
  smtp = nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; 587 upgrades through STARTTLS.
    secure: port === 465,
    auth: { user, pass },
  })
  return smtp
}

/** True when a real message can leave the server. Read by the self-check. */
export function mailIsConfigured(): boolean {
  return Boolean(getSmtp() || process.env.RESEND_API_KEY?.trim())
}

export async function sendMail(mail: Mail): Promise<void> {
  const transport = getSmtp()

  if (transport) {
    await transport.sendMail({
      from: FROM,
      to: mail.to,
      subject: mail.subject,
      html: render(mail),
      // A message with no plain-text alternative lands in spam far more often.
      text: plainText(mail),
    })
    return
  }

  const key = process.env.RESEND_API_KEY

  if (!key) {
    console.warn(
      "[email non configure] ni SMTP_HOST ni RESEND_API_KEY — message destine a " +
        mail.to + " : " + mail.subject + " " + mail.actionUrl,
    )
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: mail.to, subject: mail.subject, html: render(mail) }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // Surfaced to the caller so a failed reset email isn't reported as success.
    throw new Error(`Envoi de l'email impossible (${res.status}) ${detail.slice(0, 200)}`)
  }
}

/** First entry of FRONTEND_URL — the canonical domain used to build email links. */
export function appUrl(): string {
  return (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '')
}
