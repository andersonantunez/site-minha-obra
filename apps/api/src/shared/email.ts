import nodemailer from 'nodemailer'

type InvitationEmail = { to: string; projectName: string; inviterName: string; inviteUrl: string }

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD)
}

export async function sendInvitationEmail(input: InvitationEmail): Promise<boolean> {
  if (!smtpConfigured()) return false
  const secure = process.env.SMTP_SECURE !== 'false'
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  })
  await transport.sendMail({
    from: `MinhaObra <${process.env.SMTP_USER}>`,
    to: input.to,
    subject: `${input.inviterName} convidou você para acompanhar ${input.projectName}`,
    text: `Você foi convidado para participar do projeto ${input.projectName}. Acesse ${input.inviteUrl}`,
    html: `<p>Você foi convidado para participar do projeto <strong>${escapeHtml(input.projectName)}</strong>.</p><p><a href="${input.inviteUrl}">Aceitar convite</a></p>`,
  })
  return true
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!)
}
