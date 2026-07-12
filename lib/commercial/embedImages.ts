// ============================================================
// Server-side image embedding for print documents.
//
// Product thumbnails in commercial documents were referenced by URL
// (`<img src="https://…">`). In browser print-to-PDF those can render as
// a broken icon — the source may be WebP/AVIF the print path won't draw,
// an expired/hotlink-protected URL, or simply not loaded when print()
// fires. This fetches each image once, transcodes it to a small JPEG via
// sharp, and inlines it as a data URI so it ALWAYS renders, regardless of
// source format or timing. On any failure the image_url is set to null so
// the template renders no image rather than a broken one.
//
// Operates in-memory only — it mutates the passed line objects (a copy of
// the snapshot held by the route); it never writes back to a frozen
// issued snapshot.
// ============================================================

interface LineWithImage { image_url?: string | null }

async function toDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!res.ok) return null
    const input = Buffer.from(await res.arrayBuffer())
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp')
    const out = await sharp(input)
      .rotate()
      .resize(240, 240, { fit: 'cover', position: 'centre' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 78 })
      .toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch {
    return null
  }
}

/** Replace each line's remote image_url with an inline JPEG data URI. */
export async function embedLineImages(lines: LineWithImage[] | undefined | null): Promise<void> {
  if (!lines?.length) return
  const cache = new Map<string, Promise<string | null>>()
  await Promise.all(lines.map(async line => {
    const url = line.image_url
    if (!url || !/^https?:\/\//i.test(url)) return
    if (!cache.has(url)) cache.set(url, toDataUri(url))
    line.image_url = await cache.get(url)!
  }))
}
