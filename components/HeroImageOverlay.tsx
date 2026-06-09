/**
 * HeroImageOverlay
 *
 * Drop this inside any `position: relative; overflow: hidden` hero section.
 * It renders the background image + dark green tint as absolute layers behind
 * the hero's existing content.  When no image URL is provided it renders
 * nothing so the hero's own background-color shows through unchanged.
 *
 * Usage:
 *   <section style={{ position: 'relative', overflow: 'hidden', background: 'var(--forest)' }}>
 *     <HeroImageOverlay url={heroImage.url} />
 *     … your existing hero content …
 *   </section>
 */

interface Props {
  url:        string
  /** opacity of the tint overlay — defaults to 0.78 */
  tintOpacity?: number
}

export function HeroImageOverlay({ url, tintOpacity = 0.78 }: Props) {
  if (!url) return null

  return (
    <>
      {/* Background image */}
      <div
        aria-hidden
        style={{
          position:           'absolute',
          inset:              0,
          backgroundImage:    `url(${url})`,
          backgroundSize:     'cover',
          backgroundPosition: 'center',
          zIndex:             0,
        }}
      />

      {/* Dark green tint */}
      <div
        aria-hidden
        style={{
          position:        'absolute',
          inset:           0,
          backgroundColor: `rgba(20,38,22,${tintOpacity})`,
          zIndex:          1,
        }}
      />
    </>
  )
}
