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
const FROM = process.env.MAIL_FROM || 'DropShip Pro <onboarding@resend.dev>'

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
   * Le nom affiché en tête. Par défaut le nôtre, mais un vendeur qui répond à
   * son acheteur écrit sous son enseigne : l'acheteur ne nous connaît pas, et
   * recevoir « DropShip Pro » à la place de la boutique inquiète plus qu'il
   * ne rassure.
   */
  brand?: string
}

function render({ heading, body, actionLabel, actionUrl, footer, brand }: Mail) {
  const action =
    actionUrl && actionLabel
      ? `<p style="margin:30px 0 0">
            <a href="${actionUrl}" style="display:inline-block;background:linear-gradient(90deg,#a855f7,#ec4899);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 30px;border-radius:10px">${actionLabel}</a>
          </p>
          <p style="margin:22px 0 0;font-size:12px;color:#64748b;word-break:break-all">
            Si le bouton ne fonctionne pas, copiez ce lien&nbsp;: ${actionUrl}
          </p>`
      : ''

  return `<!doctype html>
<html lang="fr"><body style="margin:0;background:#0f172a;padding:32px 16px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#1e1b4b;border-radius:16px;padding:36px" cellpadding="0" cellspacing="0">
        <tr><td>
          <p style="margin:0 0 26px;font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:#c084fc">${brand ?? 'DropShip Pro'}</p>
          <h1 style="margin:0;font-size:22px;line-height:1.3;color:#fff;font-weight:600">${heading}</h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.7;color:#cbd5e1">${body}</p>
          ${action}
          <p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#94a3b8">${footer}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/** Plain-text alternative: a message without one lands in spam far more often. */
function plainText(mail: Mail): string {
  // Built from char codes so no escape sequence has to survive tooling.
  const saut = String.fromCharCode(10, 10)
  const lignes = [mail.heading, mail.body]
  if (mail.actionLabel && mail.actionUrl) lignes.push(mail.actionLabel + ' : ' + mail.actionUrl)
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
