'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, ShoppingBag, Menu, X } from 'lucide-react'
import type { SessionUser } from '@/lib/types'
import type { LaunchFlags } from '@/lib/flags'

interface NavProps {
  session: SessionUser | null
  flags: LaunchFlags
}

export function Nav({ session, flags }: NavProps) {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartCount, setCartCount] = useState(0)

  const isDark = pathname === '/' && !scrolled

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const raw = localStorage.getItem('fba_cart')
    if (raw) {
      try {
        const cart = JSON.parse(raw)
        setCartCount(Array.isArray(cart) ? cart.length : 0)
      } catch { /* empty */ }
    }
  }, [])

  // Filter nav links by feature flags
  const allNavLinks = [
    { href: '/products',   label: 'The Edit',   show: true },
    { href: '/collection', label: 'Collection', show: flags.show_collection },
    { href: '/home',       label: 'FBA Home',   show: flags.show_home },
    { href: '/artisans',   label: 'Artisans',   show: flags.show_artisans },
    { href: '/journal',    label: 'Journal',    show: flags.show_journal },
    { href: '/about',      label: 'About',      show: true },
  ]
  const navLinks = allNavLinks.filter(l => l.show)

  return (
    <>
      <nav className={`site-nav${isDark ? ' dark' : ''}`}>
        <Link href="/" className="nav-logo">
          <span className="nav-logo-mark">FBA</span>
          <span className="nav-logo-text">Full Bloom<br/>Artelier</span>
        </Link>

        <div className="nav-links">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link${pathname.startsWith(href) ? ' active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="nav-actions">
          {session ? (
            <Link
              href={session.role === 'admin' || session.role === 'staff' ? '/admin/dashboard' : '/account'}
              className="nav-icon-btn"
              aria-label="My account"
              title={`${session.firstName} ${session.lastName}`}
            >
              <User size={20} strokeWidth={1.5} />
            </Link>
          ) : (
            <Link href="/login" className="nav-icon-btn" aria-label="Log in">
              <User size={20} strokeWidth={1.5} />
            </Link>
          )}

          <Link href="/cart" className="nav-icon-btn" aria-label="Shopping bag">
            <ShoppingBag size={20} strokeWidth={1.5} />
            {cartCount > 0 && (
              <span className="nav-badge">{cartCount > 9 ? '9+' : cartCount}</span>
            )}
          </Link>

          {flags.show_trade_cta && (!session || session.role === 'retail_customer') && (
            <Link href="/trade/apply" className="nav-cta">
              Trade Access
            </Link>
          )}

          <button
            className="hamburger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            {menuOpen
              ? <X size={22} strokeWidth={1.5} />
              : <Menu size={22} strokeWidth={1.5} />
            }
          </button>
        </div>
      </nav>

      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navLinks={navLinks}
        session={session}
        pathname={pathname}
        showTradeCta={flags.show_trade_cta}
      />
    </>
  )
}

// Mobile menu

function MobileMenu({
  open, onClose, navLinks, session, pathname, showTradeCta,
}: {
  open: boolean
  onClose: () => void
  navLinks: { href: string; label: string }[]
  session: SessionUser | null
  pathname: string
  showTradeCta: boolean
}) {
  return (
    <div className={`mobile-overlay${open ? ' open' : ''}`} id="mobileOverlay">
      {navLinks.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`mobile-nav-link${pathname.startsWith(href) ? ' active' : ''}`}
          onClick={onClose}
        >
          {label}
        </Link>
      ))}
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {session ? (
          <Link href="/account" className="btn btn-secondary btn-full" onClick={onClose}>
            My Account
          </Link>
        ) : (
          <>
            <Link href="/login" className="btn btn-secondary btn-full" onClick={onClose}>
              Log In
            </Link>
            <Link href="/register" className="btn btn-primary btn-full" onClick={onClose}>
              Create Account
            </Link>
          </>
        )}
        {showTradeCta && (
          <Link href="/trade/apply" className="btn btn-sand btn-full" onClick={onClose}>
            Apply for Trade Access
          </Link>
        )}
      </div>
    </div>
  )
}
