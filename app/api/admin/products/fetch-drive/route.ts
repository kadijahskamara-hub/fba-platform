import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

type DriveSource =
  | { type: 'sheets'; fileId: string }   // native Google Sheet → use export API
  | { type: 'file';   fileId: string }   // regular Drive file  → use usercontent download

// Extract Drive file ID and detect whether it's a Google Sheet
function parseDriveUrl(input: string): DriveSource | null {
  const s = input.trim()

  // https://docs.google.com/spreadsheets/d/FILE_ID/edit
  const sheetsMatch = s.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (sheetsMatch) return { type: 'sheets', fileId: sheetsMatch[1] }

  // https://drive.google.com/file/d/FILE_ID/view?...
  const fileMatch = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (fileMatch) return { type: 'file', fileId: fileMatch[1] }

  // https://drive.google.com/open?id=FILE_ID
  // https://drive.google.com/uc?id=FILE_ID
  const idMatch = s.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (idMatch) return { type: 'file', fileId: idMatch[1] }

  // Raw file ID (25+ alphanumeric/dash/underscore chars)
  if (/^[a-zA-Z0-9_-]{25,}$/.test(s)) return { type: 'file', fileId: s }

  return null
}

function buildDownloadUrl(source: DriveSource): string {
  if (source.type === 'sheets') {
    // Export native Google Sheet as xlsx — no virus-scan confirmation needed
    return `https://docs.google.com/spreadsheets/d/${source.fileId}/export?format=xlsx`
  }
  // Regular Drive file (already an xlsx)
  return `https://drive.usercontent.google.com/download?id=${source.fileId}&export=download&confirm=t`
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let driveUrl: string
  try {
    const body = await req.json()
    driveUrl = body.driveUrl ?? ''
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (!driveUrl) {
    return NextResponse.json({ error: 'No Google Drive URL provided' }, { status: 400 })
  }

  const source = parseDriveUrl(driveUrl)
  if (!source) {
    return NextResponse.json(
      { error: 'Could not extract a file ID from that URL. Paste the full Google Drive or Google Sheets share link.' },
      { status: 400 }
    )
  }

  const downloadUrl = buildDownloadUrl(source)

  let resp: Response
  try {
    resp = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'FBA-Platform/1.0' },
      redirect: 'follow',
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Network error fetching file: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    )
  }

  if (!resp.ok) {
    return NextResponse.json(
      { error: `Google Drive returned ${resp.status}. Make sure the file is shared as "Anyone with the link can view".` },
      { status: 400 }
    )
  }

  const contentType = resp.headers.get('content-type') ?? ''
  // Google Sheets export should return spreadsheet content-type, not HTML
  if (contentType.includes('text/html')) {
    return NextResponse.json(
      { error: source.type === 'sheets'
          ? 'Google Sheets returned an HTML page — make sure the sheet is shared as "Anyone with the link can view".'
          : 'The file requires a virus-scan confirmation (file is too large for direct download). For .xlsx files on Drive, try sharing as a Google Sheet instead — use File → Save as Google Sheets, then paste that URL.'
      },
      { status: 400 }
    )
  }

  const buffer = await resp.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')

  return NextResponse.json({ base64, fileId: source.fileId })
}
