/**
 * Transactional email.
 *
 * Uses Resend when RESEND_API_KEY is set. Without it, the message is written to
 * the server log instead of being dropped: password reset and address
 * confirmation stay testable on a fresh install, and a missing key never blocks
 * a user from signing up.
 */
const FROM = process.env.MAIL_FROM || 'DropShip Pro <onboarding@resend.dev>'

interface Mail {
  to: string
  subject: string
  heading: string
  body: string
  actionLabel: string
  actionUrl: string
  footer: string
}

function render({ heading, body, actionLabel, actionUrl, footer }: Mail) {
  return `<!doctype html>
<html lang="fr"><body style="margin:0;background:#0f172a;padding:32px 16px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#1e1b4b;border-radius:16px;padding:36px" cellpadding="0" cellspacing="0">
        <tr><td>
          <p style="margin:0 0 26px;font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:#c084fc">DropShip Pro</p>
          <h1 style="margin:0;font-size:22px;line-height:1.3;color:#fff;font-weight:600">${heading}</h1>
          <p style="margin:16px 0 0;font-size:15px;line-height:1.7;color:#cbd5e1">${body}</p>
          <p style="margin:30px 0 0">
            <a href="${actionUrl}" style="display:inline-block;background:linear-gradient(90deg,#a855f7,#ec4899);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 30px;border-radius:10px">${actionLabel}</a>
          </p>
          <p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#94a3b8">${footer}</p>
          <p style="margin:22px 0 0;font-size:12px;color:#64748b;word-break:break-all">
            Si le bouton ne fonctionne pas, copiez ce lien&nbsp;: ${actionUrl}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export async function sendMail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY

  if (!key) {
    console.warn(
      `\n[email non configuré] RESEND_API_KEY absente — message destiné à ${mail.to} :\n` +
        `  ${mail.subject}\n  ${mail.actionUrl}\n`,
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
