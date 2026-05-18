import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildMonthlyReportData,
  monthlyReportRecipients,
  renderMonthlyReportHtml,
  sendMonthlyReport,
} from '@/lib/monthly-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true

  const url = new URL(request.url)
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${secret}` || url.searchParams.get('secret') === secret
}

function monthFromRequest(request: Request) {
  const url = new URL(request.url)
  const month = url.searchParams.get('month')
  return month && /^\d{4}-\d{2}$/.test(month) ? month : undefined
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const month = monthFromRequest(request)
    const dryRun = url.searchParams.get('send') !== '1'

    if (dryRun) {
      const data = await buildMonthlyReportData(month)
      const html = await renderMonthlyReportHtml(data)

      if (url.searchParams.get('format') === 'json') {
        return NextResponse.json({
          ok: true,
          dryRun: true,
          month: data.monthKey,
          recipients: monthlyReportRecipients(),
          breakfastLoser: data.breakfastLoser,
          html,
        })
      }

      return new NextResponse(html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      })
    }

    const data = await buildMonthlyReportData(month)
    const eventKey = `monthly-report:${data.monthKey}`
    const supabase = createAdminClient()

    const { data: existingEvent } = await supabase
      .from('push_notification_events')
      .select('key, sent_at')
      .eq('key', eventKey)
      .maybeSingle()

    if (existingEvent && url.searchParams.get('force') !== '1') {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'Report was already sent',
        month: data.monthKey,
        eventKey,
      })
    }

    const result = await sendMonthlyReport(data.monthKey)

    await supabase.from('push_notification_events').upsert({
      key: eventKey,
      type: 'monthly-report',
      payload: {
        month: result.data.monthKey,
        recipients: result.recipients,
        breakfastLoser: result.data.breakfastLoser?.name || null,
      },
      sent_at: new Date().toISOString(),
    })

    return NextResponse.json({
      ok: true,
      sent: true,
      month: result.data.monthKey,
      recipients: result.recipients,
      breakfastLoser: result.data.breakfastLoser,
    })
  } catch (error) {
    console.error('Monthly report failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Monthly report failed' },
      { status: 500 },
    )
  }
}
