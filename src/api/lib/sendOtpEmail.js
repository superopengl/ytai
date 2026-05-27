import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

// Lazy-built SES client. Module-level so we don't recreate it on every send
// — the SDK reuses HTTPS connections internally.
let sesClient = null;
function getSesClient() {
  if (sesClient) return sesClient;
  const region = process.env.YTAI_AWS_REGION || 'ap-southeast-2';
  sesClient = new SESClient({ region });
  return sesClient;
}

// Best-effort delivery of a sign-in OTP. We log the code at info level so an
// operator can recover it from server logs even if SES isn't configured —
// the row is already stored, so failure to send is non-fatal.
//
// Requires `YTAI_SES_FROM_EMAIL` (a verified SES identity). Standard AWS
// credential resolution applies (env vars, shared config, or IAM role).
export default async function sendOtpEmail({ to, code, expiresAt, recipientName, log }) {
  log?.info({ to, code, expiresAt: expiresAt.toISOString() }, 'OTP issued');

  const fromAddr = process.env.YTAI_SES_FROM_EMAIL;
  if (!fromAddr) {
    log?.warn({ to }, 'YTAI_SES_FROM_EMAIL not set; skipping SES send (code still in DB)');
    return { delivered: false, reason: 'SES_NOT_CONFIGURED' };
  }
  // Inbox clients show the display name when the Source header is RFC 5322
  // "Name <addr>" — without it Gmail just shows the local part ("yoututorai").
  // If the operator already set a display-name form in the env var, pass it
  // through untouched.
  const from = fromAddr.includes('<') ? fromAddr : `YouTutorAI <${fromAddr}>`;

  const ttl = formatMinutes(expiresAt);
  const greeting = recipientName ? `Hi ${escape(recipientName)},` : 'Hi there,';
  const subject = 'Your YouTutorAI sign-in code';
  const textBody = [
    greeting,
    '',
    `Your YouTutorAI sign-in code is: ${code}`,
    '',
    `This code is valid for ${ttl}. If you didn't ask to sign in, you can ignore this email.`,
    '',
    '— YouTutorAI'
  ].join('\n');
  const htmlBody = renderHtml({ code, ttl, greeting, subject });

  try {
    const result = await getSesClient().send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: htmlBody, Charset: 'UTF-8' },
            Text: { Data: textBody, Charset: 'UTF-8' }
          }
        }
      })
    );
    log?.info({ to, messageId: result.MessageId }, 'OTP email sent via SES');
    return { delivered: true, messageId: result.MessageId };
  } catch (err) {
    log?.error({ err, to }, 'SES SendEmail failed');
    return { delivered: false, reason: err.name || 'SES_ERROR' };
  }
}

function escape(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function formatMinutes(expiresAt) {
  const remaining = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000));
  if (remaining <= 1) return '1 minute';
  return `${remaining} minutes`;
}

function renderHtml({ code, ttl, greeting, subject }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F0F4F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#475569;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F0F4F8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;background:#FFFFFF;border-radius:20px;box-shadow:0 12px 32px rgba(15,23,42,0.08);overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(135deg,#7C9EB2 0%,#B8A9C9 100%);padding:32px 24px;text-align:center;color:#ffffff;">
                <div style="font-size:24px;font-weight:800;letter-spacing:0.5px;">YouTutorAI</div>
                <div style="margin-top:6px;font-size:14px;opacity:0.85;">A calmer way to do homework</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px;">
                <p style="margin:0 0 12px;color:#1F2937;font-size:18px;font-weight:600;">${greeting}</p>
                <p style="margin:0 0 24px;line-height:1.6;font-size:15px;">
                  Use the code below to finish signing in to YouTutorAI.
                </p>
                <div style="background:#F0F4F8;border:2px dashed #7C9EB2;border-radius:14px;padding:20px 16px;text-align:center;">
                  <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#94A3B8;margin-bottom:6px;">Your code</div>
                  <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:#1F2937;">${escape(code)}</div>
                  <div style="font-size:12px;color:#94A3B8;margin-top:10px;">Valid for ${ttl}</div>
                </div>
                <p style="margin:28px 0 0;line-height:1.6;font-size:13px;color:#94A3B8;">
                  Didn&rsquo;t ask to sign in? You can safely ignore this email &mdash; no one can use this code without your inbox.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
