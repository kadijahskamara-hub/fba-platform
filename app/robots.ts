import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow:    '/',
        disallow: [
          '/admin/',
          '/account/',
          '/api/',
          '/coming-soon',
          '/trade/dashboard/',
          '/(auth)/',
        ],
      },
    ],
    sitemap: 'https://fullbloom.uk.com/sitemap.xml',
  }
}
