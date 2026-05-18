import net from 'node:net'
import tls from 'node:tls'

type SendMailInput = {
  to: string[]
  subject: string
  html: string
  text: string
}

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function normalizeAddressList(addresses: string[]) {
  return addresses.map((address) => address.trim()).filter(Boolean)
}

function createMimeMessage({ to, subject, html, text }: SendMailInput) {
  const fromEmail = requiredEnv('SMTP_FROM_EMAIL')
  const fromName = process.env.SMTP_FROM_NAME || 'BettingApp'
  const boundary = `bettingapp-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return [
    `From: ${encodeHeader(fromName)} <${fromEmail}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

class SmtpConnection {
  private socket: net.Socket | tls.TLSSocket
  private buffer = ''

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket
    this.socket.setEncoding('utf8')
    this.socket.on('data', (chunk) => {
      this.buffer += chunk
    })
  }

  static connect(host: string, port: number, secure: boolean) {
    return new Promise<SmtpConnection>((resolve, reject) => {
      const socket = secure ? tls.connect(port, host) : net.connect(port, host)
      const onError = (error: Error) => reject(error)
      const onReady = () => {
        socket.off('error', onError)
        resolve(new SmtpConnection(socket))
      }

      socket.setTimeout(30000, () => {
        socket.destroy(new Error('SMTP connection timed out'))
      })
      socket.once('error', onError)
      socket.once(secure ? 'secureConnect' : 'connect', onReady)
    })
  }

  close() {
    this.socket.end()
  }

  async upgradeToTls(host: string) {
    this.socket = tls.connect({
      socket: this.socket,
      servername: host,
    })
    this.socket.setEncoding('utf8')
    this.socket.on('data', (chunk) => {
      this.buffer += chunk
    })
    await new Promise<void>((resolve, reject) => {
      this.socket.once('secureConnect', resolve)
      this.socket.once('error', reject)
    })
  }

  async readResponse() {
    const startedAt = Date.now()
    while (!this.hasCompleteResponse()) {
      if (Date.now() - startedAt > 30000) {
        throw new Error('SMTP response timed out')
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    const response = this.buffer
    this.buffer = ''
    const lines = response.trimEnd().split(/\r?\n/)
    const lastLine = lines[lines.length - 1] || ''
    const code = Number.parseInt(lastLine.slice(0, 3), 10)

    if (!Number.isFinite(code)) {
      throw new Error(`Invalid SMTP response: ${response}`)
    }

    return { code, response }
  }

  async command(command: string, expected: number[]) {
    this.socket.write(`${command}\r\n`)
    const result = await this.readResponse()
    if (!expected.includes(result.code)) {
      throw new Error(`SMTP command failed (${command}): ${result.response}`)
    }
    return result
  }

  private hasCompleteResponse() {
    const lines = this.buffer.split(/\r?\n/).filter(Boolean)
    if (lines.length === 0) return false
    const lastLine = lines[lines.length - 1]
    return /^\d{3} /.test(lastLine)
  }
}

export async function sendSmtpMail(input: SendMailInput) {
  const host = requiredEnv('SMTP_HOST')
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10)
  const user = requiredEnv('SMTP_USER')
  const pass = requiredEnv('SMTP_PASS')
  const fromEmail = requiredEnv('SMTP_FROM_EMAIL')
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  const recipients = normalizeAddressList(input.to)

  if (recipients.length === 0) {
    throw new Error('No email recipients configured')
  }

  const connection = await SmtpConnection.connect(host, port, secure)

  try {
    await connection.readResponse()
    await connection.command(`EHLO ${process.env.SMTP_EHLO_DOMAIN || 'bettingapp.local'}`, [250])

    if (!secure) {
      await connection.command('STARTTLS', [220])
      await connection.upgradeToTls(host)
      await connection.command(`EHLO ${process.env.SMTP_EHLO_DOMAIN || 'bettingapp.local'}`, [250])
    }

    await connection.command('AUTH LOGIN', [334])
    await connection.command(Buffer.from(user).toString('base64'), [334])
    await connection.command(Buffer.from(pass).toString('base64'), [235])
    await connection.command(`MAIL FROM:<${fromEmail}>`, [250])

    for (const recipient of recipients) {
      await connection.command(`RCPT TO:<${recipient}>`, [250, 251])
    }

    await connection.command('DATA', [354])
    const message = createMimeMessage({ ...input, to: recipients }).replace(/^\./gm, '..')
    await connection.command(`${message}\r\n.`, [250])
    await connection.command('QUIT', [221])
  } finally {
    connection.close()
  }
}
