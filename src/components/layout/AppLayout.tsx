import { Menu, Bell } from 'lucide-react'
import { Button } from '../ui/button'
import { authClient } from '../../lib/auth'
import { useWorkspace } from '../../features/workspace/context'
import { WorkspaceControls } from '../../features/workspace/WorkspaceControls'
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarItem, useSidebar } from '../ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu'
import { cn } from '../../lib/utils'

export interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  active?: boolean
  onClick?: () => void
}

interface AppLayoutProps {
  title: string
  nav: NavItem[]
  logo?: React.ReactNode
  children: React.ReactNode
}

function Topbar({ title }: { title: string }) {
  const { setMobileOpen } = useSidebar()
  const { workspaces, selectedWorkspaceId, setSelectedWorkspaceId } = useWorkspace()
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>
      <h1 className="truncate font-serif text-lg font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-2">
        <select
          value={selectedWorkspaceId}
          onChange={(e) => setSelectedWorkspaceId(e.target.value)}
          className="h-9 w-40 rounded-md border border-input bg-surface px-2 text-sm shadow-soft md:w-56"
          title="Workspace aktif"
        >
          {workspaces.length === 0 && <option value="">Belum ada workspace</option>}
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>{ws.name}</option>
          ))}
        </select>
        <WorkspaceControls />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Tidak ada notifikasi</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-sm font-medium text-accent transition-[background-color,transform] duration-150 hover:bg-accent/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              PA
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Profil</DropdownMenuItem>
            <DropdownMenuItem>Pengaturan</DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                await authClient.signOut()
                window.location.reload()
              }}
            >
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

export function AppLayout({ title, nav, logo, children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar>
          <SidebarHeader>
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent">
              {logo || 'PA'}
            </div>
            <span className="truncate font-serif text-base font-semibold">Pabrik Konten AI</span>
          </SidebarHeader>
          <SidebarContent>
            {nav.map((item) => (
              <SidebarItem
                key={item.href}
                href={item.href}
                active={item.active}
                icon={item.icon}
                onClick={item.onClick ? (e: React.MouseEvent) => {
                  e.preventDefault()
                  item.onClick?.()
                } : undefined}
              >
                {item.label}
              </SidebarItem>
            ))}
          </SidebarContent>
        </Sidebar>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar title={title} />
          <main className={cn('flex-1 p-4 md:p-6')}>{children}</main>
        </div>
      </div>
    </SidebarProvider>
  )
}