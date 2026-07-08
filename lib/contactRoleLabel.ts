// Client-safe pure label for a contact's matched account role (Phase 4.1).
// Kept free of server-only imports so it can be used in client components.
export function accountRoleLabel(role: string | null | undefined, isOwner = false): string | null {
  if (!role) return null
  switch (role) {
    case 'admin':           return isOwner ? 'Ultra Admin' : 'Admin'
    case 'staff':           return 'Staff'
    case 'trade_user':      return 'Trade'
    case 'trade_applicant': return 'Trade (pending)'
    case 'retail_customer': return 'Retail'
    default:                return role
  }
}
