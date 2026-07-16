import { redirect } from 'next/navigation'

// QA item 13: the base commercial-order URL used to 404 because only
// /procurement and /deliveries subpages exist. The procurement screen is
// the order's de-facto overview (header, milestones, billing, lines), so
// the base route forwards there rather than duplicating it.
export default async function CommercialOrderBasePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  redirect(`/admin/commercial-orders/${id}/procurement`)
}
