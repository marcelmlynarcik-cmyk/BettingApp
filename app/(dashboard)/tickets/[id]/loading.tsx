export default function Loading() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-pulse">
      <div className="h-4 w-32 bg-slate-800 rounded"></div>
      
      <div className="space-y-2">
        <div className="h-10 w-64 bg-slate-800 rounded"></div>
        <div className="h-4 w-48 bg-slate-800 rounded"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-xl border border-slate-800 bg-[#111827] h-64 shadow-md"></div>
          <div className="rounded-xl border border-slate-800 bg-[#111827] h-20 shadow-md"></div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#111827] h-96 shadow-md"></div>
      </div>
    </div>
  )
}
