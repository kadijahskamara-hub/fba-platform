// Lightweight markdown renderer for journal post content.
// Handles: headings, bold, italic, links, inline code, blockquotes,
// unordered lists, horizontal rules, and paragraphs.
// No external dependencies.

import type { ReactNode, CSSProperties } from 'react'

// ── Inline parser — returns React nodes from a markdown string ────────────────

function parseInline(text: string): ReactNode[] {
  // Tokenise: **bold**, *italic*, `code`, [text](url), then plain text
  const parts: ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/)
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Italic: *text* (not preceded by another *)
    const italicMatch = remaining.match(/^\*([^*]+?)\*/)
    if (italicMatch) {
      parts.push(<em key={key++}>{italicMatch[1]}</em>)
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    // Inline code: `code`
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      parts.push(
        <code key={key++} style={{
          fontFamily: 'monospace',
          fontSize: '0.9em',
          background: 'rgba(26,43,24,0.07)',
          padding: '2px 5px',
          borderRadius: 3,
        }}>
          {codeMatch[1]}
        </code>
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Link: [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      parts.push(
        <a
          key={key++}
          href={linkMatch[2]}
          target={linkMatch[2].startsWith('http') ? '_blank' : undefined}
          rel={linkMatch[2].startsWith('http') ? 'noopener noreferrer' : undefined}
          style={{ color: 'var(--caramel)', textDecoration: 'underline' }}
        >
          {linkMatch[1]}
        </a>
      )
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    // Plain text up to the next special character
    const plainMatch = remaining.match(/^[\s\S]+?(?=\*\*|\*|`|\[|$)/)
    if (plainMatch) {
      parts.push(plainMatch[0])
      remaining = remaining.slice(plainMatch[0].length)
    } else {
      // Safety valve
      parts.push(remaining)
      break
    }
  }

  return parts
}

// ── Block parser — splits content into block-level elements ──────────────────

const PROSE_STYLES: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.9,
  color: 'var(--forest)',
}

export function MarkdownBody({ content }: { content: string }) {
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let key = 0
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank line — skip
    if (line.trim() === '') {
      i++
      continue
    }

    // Horizontal rule: --- or ***
    if (/^[-*]{3,}\s*$/.test(line.trim())) {
      blocks.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid var(--light-line)', margin: '32px 0' }} />)
      i++
      continue
    }

    // Headings
    const h2Match = line.match(/^## (.+)/)
    if (h2Match) {
      blocks.push(
        <h2 key={key++} style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 26,
          fontWeight: 300,
          color: 'var(--forest)',
          letterSpacing: '-0.01em',
          marginTop: 44,
          marginBottom: 16,
          lineHeight: 1.25,
        }}>
          {parseInline(h2Match[1])}
        </h2>
      )
      i++
      continue
    }

    const h3Match = line.match(/^### (.+)/)
    if (h3Match) {
      blocks.push(
        <h3 key={key++} style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 20,
          fontWeight: 400,
          color: 'var(--forest)',
          marginTop: 32,
          marginBottom: 12,
          lineHeight: 1.3,
        }}>
          {parseInline(h3Match[1])}
        </h3>
      )
      i++
      continue
    }

    const h4Match = line.match(/^#### (.+)/)
    if (h4Match) {
      blocks.push(
        <h4 key={key++} style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--forest)',
          marginTop: 24,
          marginBottom: 8,
          letterSpacing: '0.02em',
        }}>
          {parseInline(h4Match[1])}
        </h4>
      )
      i++
      continue
    }

    // Blockquote: > text
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2))
        i++
      }
      blocks.push(
        <blockquote key={key++} style={{
          borderLeft: '3px solid var(--caramel)',
          paddingLeft: 20,
          margin: '28px 0',
          fontFamily: 'var(--font-serif)',
          fontSize: 17,
          fontWeight: 300,
          color: 'var(--stone)',
          fontStyle: 'italic',
          lineHeight: 1.75,
        }}>
          {quoteLines.map((l, qi) => (
            <span key={qi}>
              {parseInline(l)}
              {qi < quoteLines.length - 1 && <br />}
            </span>
          ))}
        </blockquote>
      )
      continue
    }

    // Unordered list: - item or * item
    if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2))
        i++
      }
      blocks.push(
        <ul key={key++} style={{
          paddingLeft: 24,
          margin: '16px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {items.map((item, li) => (
            <li key={li} style={{ ...PROSE_STYLES, margin: 0 }}>
              {parseInline(item)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Ordered list: 1. item
    if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''))
        i++
      }
      blocks.push(
        <ol key={key++} style={{
          paddingLeft: 24,
          margin: '16px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {items.map((item, li) => (
            <li key={li} style={{ ...PROSE_STYLES, margin: 0 }}>
              {parseInline(item)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Paragraph — collect consecutive non-blank, non-block lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,4} /.test(lines[i]) &&
      !/^[-*]{3,}\s*$/.test(lines[i].trim()) &&
      !lines[i].startsWith('> ') &&
      !/^[-*] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }

    if (paraLines.length > 0) {
      blocks.push(
        <p key={key++} style={{ ...PROSE_STYLES, margin: '0 0 20px' }}>
          {paraLines.map((pl, pi) => (
            <span key={pi}>
              {parseInline(pl)}
              {pi < paraLines.length - 1 && <br />}
            </span>
          ))}
        </p>
      )
    }
  }

  return <div>{blocks}</div>
}
