import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { ArtisanEditForm } from '@/components/ArtisanEditForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit Artisan' }

export default async function EditArtisanPage({ params }: { params: { slug: string } }) {
  const { data: artisan } = await supabaseAdmin
    .from('artisans')
    .select('id, name, slug, location, short_bio, bio, craft_category, profile_image, gallery_images, website, instagram_handle, is_active')
    .eq('slug', params.slug)
    .single()

  if (!artisan) notFound()

  return <ArtisanEditForm artisan={artisan as never} />
}
