import { Menu, Search, Bell } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
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
}

interface AppLayoutProps {
  title: string
  nav: NavItem[]
  logo?: React.ReactNode
  children: React.ReactNode
}

function Topbar({ title }: { title: string }) {
  const { setMobileOpen } = useSidebar()
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>
      <h1 className="truncate font-serif text-lg font-semibold">{title}</h1>
      <div className="relative ml-auto hidden w-64 md:block">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Cari..." className="pl-8" />
      </div>
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
          <button className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-sm font-medium text-accent">
            PA
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Profil</DropdownMenuItem>
          <DropdownMenuItem>Pengaturan</DropdownMenuItem>
          <DropdownMenuItem>Keluar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
              <SidebarItem key={item.href} href={item.href} active={item.active} icon={item.icon}>
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