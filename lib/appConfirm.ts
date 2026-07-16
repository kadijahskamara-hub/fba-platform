'use client'

// In-app replacement for window.confirm (QA item 12). Native confirm()
// dialogs are unstyled, inconsistent with the FBA design language, and
// block the main thread (which can hang automated or slow-rendering
// sessions). This renders a styled, accessible overlay and resolves a
// Promise<boolean> — a drop-in for `confirm(x)` as `await appConfirm(x)`.
//
// Implementation is deliberately framework-free DOM so it can be called
// imperatively from any event handler without a provider/context.

export interface AppConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
}

export function appConfirm(message: string, opts: AppConfirmOptions = {}): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false)
  return new Promise<boolean>(resolve => {
    const previouslyFocused = document.activeElement as HTMLElement | null

    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'presentation')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:1000;background:rgba(24,32,26,0.45);' +
      'display:flex;align-items:center;justify-content:center;padding:16px'

    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'alertdialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-label', opts.title ?? 'Please confirm')
    dialog.style.cssText =
      'background:var(--cream, #F7F3EE);color:var(--forest, #2C3A2F);max-width:440px;width:100%;' +
      'padding:24px;border-radius:4px;box-shadow:0 12px 40px rgba(0,0,0,0.25);' +
      'font-family:inherit'

    const heading = document.createElement('h2')
    heading.textContent = opts.title ?? 'Please confirm'
    heading.style.cssText = 'margin:0 0 10px;font-size:17px;font-weight:500'

    const body = document.createElement('p')
    body.textContent = message
    body.style.cssText = 'margin:0 0 20px;font-size:13.5px;line-height:1.6;white-space:pre-line;color:var(--stone, #5C5245)'

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end'

    const btn = (label: string, primary: boolean) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = label
      b.style.cssText =
        'padding:8px 18px;font-size:12.5px;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;' +
        (primary
          ? 'background:var(--forest, #2C3A2F);color:var(--cream, #F7F3EE);border:1px solid var(--forest, #2C3A2F)'
          : 'background:transparent;color:var(--forest, #2C3A2F);border:1px solid var(--stone, #5C5245)')
      return b
    }
    const cancelBtn = btn(opts.cancelLabel ?? 'Cancel', false)
    const okBtn = btn(opts.confirmLabel ?? 'Confirm', true)

    const close = (result: boolean) => {
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      previouslyFocused?.focus?.()
      resolve(result)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(false) }
      if (e.key === 'Tab') {
        // Minimal focus trap between the two buttons.
        e.preventDefault()
        ;(document.activeElement === okBtn ? cancelBtn : okBtn).focus()
      }
    }

    cancelBtn.addEventListener('click', () => close(false))
    okBtn.addEventListener('click', () => close(true))
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(false) })
    document.addEventListener('keydown', onKey, true)

    row.append(cancelBtn, okBtn)
    dialog.append(heading, body, row)
    overlay.append(dialog)
    document.body.append(overlay)
    okBtn.focus()
  })
}
