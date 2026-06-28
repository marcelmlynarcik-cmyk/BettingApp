import type { createAdminClient } from '@/lib/supabase/admin'

type SupabaseAdminClient = ReturnType<typeof createAdminClient>

export type PredictionAuditResult = 'OK' | 'NOK' | 'Pending' | null

type PredictionAuditInput = {
  ticketId: string
  predictionId: string
  previousResult: PredictionAuditResult
  nextResult: PredictionAuditResult
  authUserId?: string | null
  actorName?: string | null
  actorEmail?: string | null
  action: 'single_result_update' | 'mark_all_ok' | 'ticket_edit'
}

export async function insertPredictionAuditLog(
  supabase: SupabaseAdminClient,
  input: PredictionAuditInput,
) {
  if (input.previousResult === input.nextResult) return

  const { error } = await supabase.from('prediction_audit_logs').insert({
    ticket_id: input.ticketId,
    prediction_id: input.predictionId,
    auth_user_id: input.authUserId || null,
    actor_name: input.actorName || null,
    actor_email: input.actorEmail || null,
    previous_result: input.previousResult,
    next_result: input.nextResult,
    action: input.action,
  })

  if (error) {
    console.error('Prediction audit log insert failed:', error)
  }
}
