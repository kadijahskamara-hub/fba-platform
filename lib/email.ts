import 'server-only'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_ADDRESS   = process.env.EMAIL_FROM ?? 'info@fullbloom.uk.com'

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

/**
 * Send a transactional email via Resend.
 * Returns true on success, false on failure (non-throwing).
 */
export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error('[email] RESEND_API_KEY is not set — email not sent')
    return false
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('[email] Resend error:', res.status, body)
      return false
    }

    return true
  } catch (err) {
    console.error('[email] Network error sending email:', err)
    return false
  }
}

// ─── Shared layout helpers ────────────────────────────────────────────────────

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#F7F3EE;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EE;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0"
               style="background:#FDFAF7;border:1px solid #DDD5C8;max-width:540px;width:100%;">
          <tr>
            <td style="padding:36px 40px 28px;border-bottom:1px solid #DDD5C8;">
              <div style="font-family:Georgia,serif;font-size:22px;font-weight:300;color:#1A2B18;letter-spacing:0.08em;">
                Full Bloom Artelier
              </div>
            </td>
          </tr>
          ${content}
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid #DDD5C8;">
              <p style="font-size:11px;color:#9E9589;margin:0;letter-spacing:0.05em;">
                &copy; Full Bloom Artelier &bull; London &bull;
                <a href="https://fullbloom.uk.com" style="color:#7A8C77;text-decoration:none;">fullbloom.uk.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── OTP email ────────────────────────────────────────────────────────────────

export function sendStaffOtpEmail(to: string, name: string, code: string) {
  const body = `
    <tr>
      <td style="padding:40px 40px 32px;">
        <p style="font-size:15px;color:#1A2B18;margin:0 0 20px;line-height:1.6;">Hi ${name},</p>
        <p style="font-size:15px;color:#1A2B18;margin:0 0 32px;line-height:1.6;">
          Your verification code for the studio admin panel is:
        </p>
        <div style="background:#E4EAE3;border:1px solid #CDD5CB;padding:24px;text-align:center;margin-bottom:32px;">
          <span style="font-family:monospace;font-size:42px;font-weight:700;letter-spacing:0.3em;color:#1A2B18;">
            ${code}
          </span>
        </div>
        <p style="font-size:13px;color:#9E9589;margin:0 0 12px;line-height:1.6;">
          This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
        </p>
        <p style="font-size:13px;color:#9E9589;margin:0;line-height:1.6;">
          If you didn&rsquo;t request this code, someone may be attempting to access your account.
          Please change your password immediately.
        </p>
      </td>
    </tr>`

  return sendEmail({
    to,
    subject: 'Your Full Bloom Artelier login code',
    html: emailWrapper(body),
  })
}

// ─── Password reset email ─────────────────────────────────────────────────────

export function sendPasswordResetEmail(to: string, name: string, resetUrl: string) {
  const displayName = name || 'there'
  const body = `
    <tr>
      <td style="padding:40px 40px 32px;">
        <p style="font-size:15px;color:#1A2B18;margin:0 0 20px;line-height:1.6;">Hi ${displayName},</p>
        <p style="font-size:15px;color:#1A2B18;margin:0 0 28px;line-height:1.6;">
          We received a request to reset the password for your Full Bloom Artelier account.
          Click the button below to choose a new password.
        </p>
        <div style="text-align:center;margin-bottom:32px;">
          <a href="${resetUrl}"
             style="display:inline-block;background:#1A2B18;color:#F7F3EE;padding:14px 32px;
                    font-size:13px;letter-spacing:0.12em;text-transform:uppercase;
                    text-decoration:none;font-family:'DM Sans',Arial,sans-serif;">
            Reset Password
          </a>
        </div>
        <p style="font-size:13px;color:#9E9589;margin:0 0 12px;line-height:1.6;">
          This link expires in <strong>1 hour</strong>. If you did not request a password reset,
          you can safely ignore this email — your password will not change.
        </p>
        <p style="font-size:12px;color:#9E9589;margin:0;line-height:1.6;word-break:break-all;">
          Or copy this link into your browser:<br/>
          <a href="${resetUrl}" style="color:#7A8C77;">${resetUrl}</a>
        </p>
      </td>
    </tr>`

  return sendEmail({
    to,
    subject: 'Reset your Full Bloom Artelier password',
    html: emailWrapper(body),
  })
}
