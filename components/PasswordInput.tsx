'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// ── Password input with visibility toggle ────────────────────
// Drop-in replacement for <input type="password"> across auth
// forms. Renders the standard .form-input with an eye icon that
// toggles between masked and plain text.

type Props = React.InputHTMLAttributes<HTMLInputElement>

export function PasswordInput({ style, className, ...rest }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        className={className ?? 'form-input'}
        style={{ ...style, paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--stone)', display: 'flex', alignItems: 'center', padding: 4,
        }}
      >
        {visible ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
      </button>
    </div>
  )
}
