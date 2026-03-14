import { Sidebar } from '@/components/sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      {/* Mobile: top header + bottom nav spacing */}
      {/* Desktop: left sidebar spacing */}
      <main className="min-h-screen pb-[64px] pt-14 md:ml-64 md:pb-0 md:pt-0">
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  )
}
