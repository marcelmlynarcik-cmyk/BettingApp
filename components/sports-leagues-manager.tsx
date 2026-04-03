'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { League, Sport } from '@/lib/types'
import { notifyError, notifySuccess } from '@/lib/notifications'
import { Pencil, Settings2, Trash2, X } from 'lucide-react'

interface SportsLeaguesManagerProps {
  sports: Sport[]
  leagues: League[]
}

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'sk', { sensitivity: 'base' }))
}

export function SportsLeaguesManager({ sports: initialSports, leagues: initialLeagues }: SportsLeaguesManagerProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [sports, setSports] = useState(initialSports)
  const [leagues, setLeagues] = useState(initialLeagues)
  const [newSportName, setNewSportName] = useState('')
  const [newLeagueName, setNewLeagueName] = useState('')
  const [newLeagueSportId, setNewLeagueSportId] = useState(initialSports[0]?.id || '')
  const [editingSport, setEditingSport] = useState<{ id: string; name: string } | null>(null)
  const [editingLeague, setEditingLeague] = useState<{ id: string; name: string; sport_id: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const sortedSports = useMemo(() => sortByName(sports), [sports])
  const sortedLeagues = useMemo(() => sortByName(leagues), [leagues])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const refreshData = () => {
    router.refresh()
  }

  const handleCreateSport = async () => {
    const name = newSportName.trim()
    if (!name) return

    setIsSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('sports')
      .insert({ name })
      .select('*')
      .single()

    setIsSaving(false)
    if (error || !data) {
      notifyError('Šport sa nepodarilo pridať')
      return
    }

    setSports((prev) => [...prev, data as Sport])
    setNewLeagueSportId((prev) => prev || data.id)
    setNewSportName('')
    notifySuccess('Šport pridaný', name)
    refreshData()
  }

  const handleUpdateSport = async () => {
    if (!editingSport) return
    const name = editingSport.name.trim()
    if (!name) return

    setIsSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('sports')
      .update({ name })
      .eq('id', editingSport.id)

    setIsSaving(false)
    if (error) {
      notifyError('Šport sa nepodarilo upraviť')
      return
    }

    setSports((prev) => prev.map((sport) => (sport.id === editingSport.id ? { ...sport, name } : sport)))
    setEditingSport(null)
    notifySuccess('Šport upravený', name)
    refreshData()
  }

  const handleDeleteSport = async (sport: Sport) => {
    const hasLeagues = leagues.some((league) => league.sport_id === sport.id)
    if (hasLeagues) {
      notifyError('Najprv zmaž ligy patriace k tomuto športu')
      return
    }

    setIsSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('sports').delete().eq('id', sport.id)
    setIsSaving(false)

    if (error) {
      notifyError('Šport sa nepodarilo zmazať')
      return
    }

    setSports((prev) => prev.filter((item) => item.id !== sport.id))
    notifySuccess('Šport zmazaný', sport.name)
    refreshData()
  }

  const handleCreateLeague = async () => {
    const name = newLeagueName.trim()
    if (!name || !newLeagueSportId) return

    setIsSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('leagues')
      .insert({ name, sport_id: newLeagueSportId })
      .select('*')
      .single()

    setIsSaving(false)
    if (error || !data) {
      notifyError('Liga sa nepodarilo pridať')
      return
    }

    setLeagues((prev) => [...prev, data as League])
    setNewLeagueName('')
    notifySuccess('Liga pridaná', name)
    refreshData()
  }

  const handleUpdateLeague = async () => {
    if (!editingLeague) return
    const name = editingLeague.name.trim()
    if (!name || !editingLeague.sport_id) return

    setIsSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('leagues')
      .update({ name, sport_id: editingLeague.sport_id })
      .eq('id', editingLeague.id)
    setIsSaving(false)

    if (error) {
      notifyError('Liga sa nepodarilo upraviť')
      return
    }

    setLeagues((prev) =>
      prev.map((league) =>
        league.id === editingLeague.id ? { ...league, name, sport_id: editingLeague.sport_id } : league,
      ),
    )
    setEditingLeague(null)
    notifySuccess('Liga upravená', name)
    refreshData()
  }

  const handleDeleteLeague = async (league: League) => {
    setIsSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('leagues').delete().eq('id', league.id)
    setIsSaving(false)

    if (error) {
      notifyError('Liga sa nepodarilo zmazať')
      return
    }

    setLeagues((prev) => prev.filter((item) => item.id !== league.id))
    notifySuccess('Liga zmazaná', league.name)
    refreshData()
  }

  const getSportName = (sportId: string) => sports.find((sport) => sport.id === sportId)?.name || 'Bez športu'

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex w-full items-center justify-between gap-2 rounded-2xl border border-border/70 bg-amber-50/80 px-4 py-3 text-sm font-semibold text-card-foreground shadow-sm transition-all hover:bg-amber-50"
      >
        <span className="inline-flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Športy a ligy
        </span>
        <span className="text-xs font-semibold text-muted-foreground">Otvoriť</span>
      </button>

      {isMounted && isOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm md:items-center md:p-6">
          <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-border/70 bg-gradient-to-br from-amber-50/95 via-card to-orange-50/90 p-4 text-card-foreground shadow-2xl md:max-w-5xl md:rounded-3xl md:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-card-foreground md:text-xl">Správa športov a líg</h2>
                <p className="text-sm font-medium text-muted-foreground">Pridávanie, úprava a mazanie bez odchodu zo stránky</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-border/70 bg-white/80 p-2 text-muted-foreground transition-colors hover:bg-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm">
                <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Športy</h3>
                <div className="mb-3 flex gap-2">
                  <input
                    value={newSportName}
                    onChange={(e) => setNewSportName(e.target.value)}
                    placeholder="Nový šport"
                    className="w-full rounded-xl border border-border/70 bg-white px-3 py-2 text-sm font-semibold text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                  />
                  <button
                    onClick={handleCreateSport}
                    disabled={isSaving}
                    className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-60"
                  >
                    Pridať
                  </button>
                </div>

                <div className="space-y-2">
                  {sortedSports.map((sport) => (
                    <div key={sport.id} className="rounded-xl border border-border/70 bg-amber-50/55 px-3 py-2.5">
                      {editingSport?.id === sport.id ? (
                        <div className="flex gap-2">
                          <input
                            value={editingSport.name}
                            onChange={(e) => setEditingSport({ ...editingSport, name: e.target.value })}
                            className="w-full rounded-lg border border-border/70 bg-white px-2 py-1 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                          />
                          <button
                            onClick={handleUpdateSport}
                            disabled={isSaving}
                            className="rounded-lg bg-emerald-500 px-2 py-1 text-[10px] font-black uppercase text-white disabled:opacity-60"
                          >
                            Uložiť
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-card-foreground">{sport.name}</p>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingSport({ id: sport.id, name: sport.name })}
                              className="rounded-lg border border-border/70 bg-white/80 p-1.5 text-muted-foreground hover:bg-white"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteSport(sport)}
                              className="rounded-lg border border-rose-400/20 p-1.5 text-rose-300 hover:bg-rose-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm">
                <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Ligy</h3>
                <div className="mb-3 grid grid-cols-1 gap-2">
                  <input
                    value={newLeagueName}
                    onChange={(e) => setNewLeagueName(e.target.value)}
                    placeholder="Nová liga"
                    className="w-full rounded-xl border border-border/70 bg-white px-3 py-2 text-sm font-semibold text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                  />
                  <select
                    value={newLeagueSportId}
                    onChange={(e) => setNewLeagueSportId(e.target.value)}
                    className="w-full rounded-xl border border-border/70 bg-white px-3 py-2 text-sm font-semibold text-card-foreground focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                  >
                    <option value="">Vybrať šport</option>
                    {sortedSports.map((sport) => (
                      <option key={sport.id} value={sport.id}>
                        {sport.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleCreateLeague}
                    disabled={isSaving}
                    className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black uppercase tracking-wide text-white disabled:opacity-60"
                  >
                    Pridať
                  </button>
                </div>

                <div className="space-y-2">
                  {sortedLeagues.map((league) => (
                    <div key={league.id} className="rounded-xl border border-border/70 bg-orange-50/55 px-3 py-2.5">
                      {editingLeague?.id === league.id ? (
                        <div className="grid gap-2">
                          <input
                            value={editingLeague.name}
                            onChange={(e) => setEditingLeague({ ...editingLeague, name: e.target.value })}
                            className="w-full rounded-lg border border-border/70 bg-white px-2 py-1 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                          />
                          <select
                            value={editingLeague.sport_id}
                            onChange={(e) => setEditingLeague({ ...editingLeague, sport_id: e.target.value })}
                            className="w-full rounded-lg border border-border/70 bg-white px-2 py-1 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                          >
                            {sortedSports.map((sport) => (
                              <option key={sport.id} value={sport.id}>
                                {sport.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={handleUpdateLeague}
                            disabled={isSaving}
                            className="rounded-lg bg-emerald-500 px-2 py-1 text-[10px] font-black uppercase text-white disabled:opacity-60"
                          >
                            Uložiť
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-card-foreground">{league.name}</p>
                            <p className="text-[11px] text-muted-foreground">{getSportName(league.sport_id)}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingLeague({ id: league.id, name: league.name, sport_id: league.sport_id })}
                              className="rounded-lg border border-border/70 bg-white/80 p-1.5 text-muted-foreground hover:bg-white"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteLeague(league)}
                              className="rounded-lg border border-rose-400/20 p-1.5 text-rose-300 hover:bg-rose-500/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
