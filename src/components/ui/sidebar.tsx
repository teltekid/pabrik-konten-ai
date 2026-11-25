import * as React from 'react'
import { cn } from '../../lib/utils'

interface SidebarContextValue {
  collapsed: boolean
  toggle: () => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const ctx = React.useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider')
  return ctx
}

function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  return (
    <SidebarContext.Provider
      value={{ collapsed, toggle: () => setCollapsed((v) => !v), mobileOpen, setMobileOpen }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

function Sidebar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar()
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-surface transition-[width,transform] duration-200 md:static md:translate-x-0',
          collapsed ? 'md:w-[72px]' : 'md:w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          className,
        )}
        {...props}
      />
    </>
  )
}

function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex h-16 items-center gap-2 px-4', className)} {...props} />
}

function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 space-y-1 overflow-y-auto px-2 py-3', className)} {...props} />
}

function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-t border-border p-2', className)} {...props} />
}

interface SidebarItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  active?: boolean
  icon?: React.ReactNode
}

function SidebarItem({ active, icon, className, children, ...props }: SidebarItemProps) {
  const { collapsed } = useSidebar()
  return (
    <a
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-accent/10 text-accent'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        collapsed && 'md:justify-center md:px-0',
        className,
      )}
      title={collapsed ? (props.title as string) : undefined}
      {...props}
    >
      {icon}
      {!collapsed && <span className="truncate">{children}</span>}
    </a>
  )
}

export {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarItem,
  useSidebar,
}