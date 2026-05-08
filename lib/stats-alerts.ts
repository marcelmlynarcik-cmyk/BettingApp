'use client'

import type { SupabaseClient } from '@supabase/supabase-js'

export async function evaluateAndTriggerStatsAlerts(
  supabase: SupabaseClient,
  contextUrl = '/statistics',
) {
  void supabase
  void contextUrl

  try {
    await fetch('/api/notifications/sync', { method: 'POST' })
  } catch {
    // Server-side notification sync is also expected to run from cron/webhooks.
  }
}
