'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Prediction, User, Sport, League } from '@/lib/types'
import { Edit2, Check, X } from 'lucide-react'

interface PredictionRowProps {
  prediction: Prediction & { user?: User; sport?: Sport; league?: League }
  onUpdateStatus?: (result: 'OK' | 'NOK') => Promise<void>
  onUpdateOdds?: (newOdds: number) => Promise<void>
  isUpdating?: boolean
}

export function PredictionRow({ 
  prediction, 
  onUpdateStatus, 
  onUpdateOdds,
  isUpdating 
}: PredictionRowProps) {
  const [isEditingOdds, setIsEditingOdds] = useState(false)
  const [editedOdds, setEditedOdds] = useState(prediction.odds.toString())

  const handleOddsSubmit = async () => {
    const val = parseFloat(editedOdds)
    if (isNaN(val) || val < 0) return
    await onUpdateOdds?.(val)
    setIsEditingOdds(false)
  }

  const getResultBadge = (result: Prediction['result']) => {
    switch (result) {
      case 'OK':
        return (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-600">
            OK
          </span>
        )
      case 'NOK':
        return (
          <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-black text-rose-600">
            NOK
          </span>
        )
      case 'Pending':
        return (
          <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-black text-amber-600">
            ČAKÁ
          </span>
        )
    }
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-sm transition-all">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-black text-muted-foreground text-sm">
          {prediction.user?.name?.[0] || '?'}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-card-foreground text-sm truncate">{prediction.user?.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isEditingOdds ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editedOdds}
                  onChange={(e) => setEditedOdds(e.target.value)}
                  className="w-16 rounded border border-border bg-background px-2 py-1 text-xs font-bold text-card-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleOddsSubmit}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-500/10"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setIsEditingOdds(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-600 transition-colors hover:bg-rose-500/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-black text-primary tracking-wider">@{prediction.odds.toFixed(2)}</span>
                {prediction.result === 'Pending' && onUpdateOdds && (
                  <button 
                    onClick={() => setIsEditingOdds(true)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">•</span>
            <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
              {prediction.sport?.name}
            </span>
          </div>
          {typeof prediction.estimated_win_probability === 'number' && (
            <p className="mt-1 text-[10px] font-semibold text-cyan-700">
              Šanca: {(prediction.estimated_win_probability * 100).toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-2">
        {getResultBadge(prediction.result)}
        {prediction.result === 'Pending' && onUpdateStatus && (
          <div className="flex gap-1 border-l border-border pl-2">
            <button
              onClick={() => onUpdateStatus('OK')}
              disabled={isUpdating}
              className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[10px] font-black uppercase text-white shadow-sm active:scale-95 disabled:opacity-50"
            >
              OK
            </button>
            <button
              onClick={() => onUpdateStatus('NOK')}
              disabled={isUpdating}
              className="rounded-lg bg-rose-500 px-2.5 py-1.5 text-[10px] font-black uppercase text-white shadow-sm active:scale-95 disabled:opacity-50"
            >
              NOK
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
