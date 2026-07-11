'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { SessionUser, StaffPermission } from '@/lib/types'

interface AdminSidebarProps {
  session: SessionUser
  /** null = admin (full access). Array = staff with these specific permissions. */
  userPermissions: StaffPermission[] | null
}

interface NavItem {
  href: string
  label: string
  icon: () => JSX.Element
  /** Permission required to see this item. undefined = always visible (e.g. Dashboard). */
  permission?: StaffPermission
  /** If true, only admins see this item regardless of permissions */
  adminOnly?: boolean
}

interface NavGroup {
  section: string
  /** Permission that gates the entire section (if no item in section is accessible, section header is hidden) */
  sectionPermission?: StaffPermission
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    section: 'Overview',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: GridIcon, permission: 'dashboard' },
    ],
  },
  {
    section: 'Accounts',
    items: [
      { href: '/admin/trade-applications', label: 'Trade Applications', icon: UsersIcon,  permission: 'trade_applications' },
      { href: '/admin/contacts',           label: 'Contacts',           icon: MailIcon,   permission: 'contacts' },
    ],
  },
  {
    section: 'Catalogue',
    items: [
      { href: '/admin/products',     label: 'Products',           icon: TagIcon,        permission: 'products' },
      { href: '/admin/artisans',     label: 'Artisans',           icon: StarIcon,       permission: 'artisans' },
      { href: '/admin/collection',   label: 'FBA Collection',     icon: CollectionIcon, permission: 'products' },
      { href: '/admin/home',         label: 'FBA Home',           icon: HomeIcon,       permission: 'products' },
      { href: '/admin/integrations', label: 'Brand Integrations', icon: PlugIcon,       permission: 'products' },
      { href: '/admin/imports',      label: 'Import History',     icon: PlugIcon,       permission: 'products' },
    ],
  },
  {
    section: 'Orders & Quotes',
    items: [
      { href: '/admin/quotes',            label: 'Quote Pipeline',   icon: DocumentIcon,  permission: 'quote_pipeline' },
      { href: '/admin/retail-orders',     label: 'Retail Orders',    icon: BagIcon,       permission: 'retail_orders' },
      { href: '/admin/commercial-orders', label: 'Commercial Orders', icon: BuildingIcon, permission: 'commercial_orders' },
      { href: '/admin/purchase-orders',   label: 'Purchase Orders',  icon: BuildingIcon,  permission: 'commercial_orders' },
    ],
  },
  {
    section: 'Content',
    items: [
      { href: '/admin/journals', label: 'Journals', icon: PenIcon, permission: 'journals' },
    ],
  },
  {
    section: 'Settings',
    sectionPermission: 'settings',
    items: [
      { href: '/admin/settings',       label: 'Studio Settings',    icon: SettingsIcon, permission: 'settings' },
      { href: '/admin/settings/staff', label: 'Staff & Permissions', icon: ShieldIcon,  adminOnly: true },
    ],
  },
]

export function AdminSidebar({ session, userPermissions }: AdminSidebarProps) {
  const pathname  = usePathname()
  const isAdmin   = session.role === 'admin'

  /** Returns true if this nav item should be visible to the current user */
  function canSee(item: NavItem): boolean {
    if (item.adminOnly) return isAdmin
    if (isAdmin) return true                            // admins see everything
    if (userPermissions === null) return true           // safety fallback (treat as admin)
    if (!item.permission) return true                   // no permission requirement
    return userPermissions.includes(item.permission)
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-logo">
        <Link href="/" style={{ textDecoration: 'none', color: 'var(--cream)' }}>FBA</Link>
        <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(196,168,130,0.5)', marginTop: 4 }}>
          Admin
        </div>
      </div>

      {NAV_GROUPS.map(group => {
        const visibleItems = group.items.filter(canSee)
        if (visibleItems.length === 0) return null

        return (
          <div key={group.section}>
            <div className="admin-sidebar-section">{group.section}</div>
            {visibleItems.map(item => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-nav-link${isActive ? ' active' : ''}`}
                >
                  <Icon />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )
      })}

      {/* Bottom: user info + logout */}
      <div style={{ marginTop: 'auto', padding: '24px 28px', borderTop: '1px solid rgba(196,168,130,0.12)' }}>
        <div style={{ fontSize: 12, color: 'rgba(247,243,238,0.5)', marginBottom: 12 }}>
          {session.firstName} {session.lastName}
          <br />
          <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {session.role}
          </span>
        </div>
        <button
          onClick={handleLogout}
          style={{ fontSize: 12, color: 'rgba(247,243,238,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', background: 'none', border: 'none' }}
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}

// ── Icons ─────────────────────────────────────────────────────
function GridIcon()       { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }
function UsersIcon()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> }
function MailIcon()       { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> }
function TagIcon()        { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> }
function StarIcon()       { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg> }
function CollectionIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> }
function HomeIcon()       { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 9.5V21H15v-6H9v6H4V9.5"/><path d="M1 10L12 2l11 8"/></svg> }
function PlugIcon()       { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/></svg> }
function DocumentIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg> }
function BagIcon()        { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> }
function BuildingIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> }
function PenIcon()        { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> }
function SettingsIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
function ShieldIcon()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
