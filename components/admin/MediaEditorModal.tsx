'use client'

// ============================================================
// Media Library — Wix-Photo-Studio-style editor (Sprint 23).
//
// Crop with aspect presets, drag to reposition, zoom, rotate
// (90° steps + fine slider), output W/H. Processing happens
// server-side with sharp; the result is ALWAYS a new copy —
// originals are never overwritten.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ASPECT_PRESETS, orientedRatio, rotatedDims, minCoverScale, clampOffset,
  computeExtract, MAX_OUTPUT_PX,
} from '@/lib/mediaShared'

type Props = {
  bucket: string
  path: string
  url: string
  onClose: () => void
  onSaved: () => void
}

const VIEW_MAX_W = 560
const VIEW_MAX_H = 420

export default function MediaEditorModal({ bucket, path, url, onClose, onSaved }: Props) {
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)
  const [preset, setPreset] = useState('free')
  const [landscape, setLandscape] = useState(true)
  const [rotBase, setRotBase] = useState(0)     // 90° steps
  const [rotFine, setRotFine] = useState(0)     // -45..45
  const [zoom, setZoom] = useState(1)           // multiplier on cover scale
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [outW, setOutW] = useState<string>('')
  const [outH, setOutH] = useState<string>('')
  const [outDirty, setOutDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  // Load source dimensions.
  useEffect(() => {
    const img = new Image()
    img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => setError('Could not load the image.')
    img.src = url
  }, [url])

  const rotate = ((rotBase + rotFine) % 360 + 360) % 360 > 180
    ? ((rotBase + rotFine) % 360 + 360) % 360 - 360
    : ((rotBase + rotFine) % 360 + 360) % 360
  const rot = imgDims ? rotatedDims(imgDims.w, imgDims.h, rotate) : { w: 1, h: 1 }

  // Crop aspect from preset (+ orientation), source ratio for "original".
  const aspect = useMemo(() => {
    const p = ASPECT_PRESETS.find(a => a.key === preset)
    if (!p || p.ratio === null) {
      const w = parseInt(outW), h = parseInt(outH)
      if (w > 0 && h > 0) return w / h
      return rot.w / Math.max(1, rot.h)
    }
    const r = p.ratio === -1 ? (imgDims ? imgDims.w / imgDims.h : 1) : p.ratio
    return orientedRatio(r, landscape)
  }, [preset, landscape, imgDims, rot.w, rot.h, outW, outH])

  // Screen viewport (the crop window) fitted into the canvas area.
  const view = useMemo(() => {
    let w = VIEW_MAX_W, h = VIEW_MAX_W / aspect
    if (h > VIEW_MAX_H) { h = VIEW_MAX_H; w = VIEW_MAX_H * aspect }
    return { w: Math.round(w), h: Math.round(h) }
  }, [aspect])

  const cover = minCoverScale(rot.w, rot.h, view.w, view.h)
  const scale = cover * zoom

  // Recentre whenever geometry changes.
  useEffect(() => {
    setOffset({ x: (view.w - rot.w * scale) / 2, y: (view.h - rot.h * scale) / 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.w, view.h, rot.w, rot.h, rotate, preset, landscape, imgDims])

  const clampedOffset = {
    x: clampOffset(offset.x, rot.w * scale, view.w),
    y: clampOffset(offset.y, rot.h * scale, view.h),
  }

  const extract = imgDims ? computeExtract({
    scale, offsetX: clampedOffset.x, offsetY: clampedOffset.y,
    viewW: view.w, viewH: view.h, imgW: rot.w, imgH: rot.h,
  }) : null

  // Default output size mirrors the crop until the user types their own.
  useEffect(() => {
    if (!extract || outDirty) return
    setOutW(String(extract.width))
    setOutH(String(extract.height))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extract?.width, extract?.height, outDirty])

  // A new preset / rotation resets the manual-output override.
  useEffect(() => { setOutDirty(false) }, [preset, landscape, rotBase])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: clampedOffset.x, oy: clampedOffset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    setOffset({ x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) })
  }
  const onPointerUp = () => { dragRef.current = null }

  const save = useCallback(async () => {
    if (!extract) return
    const w = parseInt(outW), h = parseInt(outH)
    if (!(w > 0) || !(h > 0) || w > MAX_OUTPUT_PX || h > MAX_OUTPUT_PX) {
      setError(`Output size must be 1–${MAX_OUTPUT_PX}px.`); return
    }
    setBusy(true); setError(null)
    const res = await fetch('/api/admin/media/edit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, path, rotate, crop: extract, outputWidth: w, outputHeight: h }),
    }).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
    setBusy(false)
    if (!res.success) { setError(res.error ?? 'Save failed.'); return }
    onSaved()
  }, [bucket, path, rotate, extract, outW, outH, onSaved])

  const inp: React.CSSProperties = { width: '100%', border: '1px solid var(--light-line)', borderRadius: 4, padding: '7px 9px', fontSize: 13, background: 'var(--warm-white)' }
  const presetBtn = (active: boolean): React.CSSProperties => ({
    border: active ? '2px solid var(--caramel)' : '1px solid var(--light-line)',
    borderRadius: 6, padding: '10px 0', fontSize: 12, cursor: 'pointer',
    background: active ? 'var(--cream)' : 'var(--warm-white)', width: '100%',
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 980, width: '96vw', maxHeight: '94vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="h3">Edit image</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--stone)' }}>Saves as a new copy — the original is kept.</span>
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !extract}>{busy ? 'Saving…' : 'Save copy'}</button>
          </div>
        </div>

        {error && <div style={{ background: '#fdecea', color: '#a03030', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 20 }}>
          {/* Controls */}
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Crop</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
              {ASPECT_PRESETS.map(p => (
                <button key={p.key} style={presetBtn(preset === p.key)} onClick={() => setPreset(p.key)}>{p.label}</button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 13 }}>Orientation</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button style={presetBtn(!landscape)} title="Portrait" onClick={() => setLandscape(false)}>▯</button>
                <button style={presetBtn(landscape)} title="Landscape" onClick={() => setLandscape(true)}>▭</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div><div className="form-label">Width (px)</div><input style={inp} inputMode="numeric" value={outW} onChange={e => { setOutDirty(true); setOutW(e.target.value.replace(/\D/g, '')) }} /></div>
              <div><div className="form-label">Height (px)</div><input style={inp} inputMode="numeric" value={outH} onChange={e => { setOutDirty(true); setOutH(e.target.value.replace(/\D/g, '')) }} /></div>
            </div>

            <div className="label" style={{ marginBottom: 8 }}>Zoom</div>
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} style={{ width: '100%', marginBottom: 14 }} />

            <div className="label" style={{ marginBottom: 8 }}>Rotate</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setRotBase(b => b - 90)}>⟲ 90°</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setRotBase(b => b + 90)}>⟳ 90°</button>
              <span style={{ fontSize: 12, color: 'var(--stone)', marginLeft: 'auto' }}>{rotate}°</span>
            </div>
            <input type="range" min={-45} max={45} step={1} value={rotFine} onChange={e => setRotFine(Number(e.target.value))} style={{ width: '100%' }} />
            {rotFine !== 0 && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => setRotFine(0)}>Reset angle</button>
            )}

            {extract && (
              <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 14 }}>
                Crop: {extract.width} × {extract.height}px
                {(parseInt(outW) > extract.width || parseInt(outH) > extract.height) && ' — output larger than crop (will upscale)'}
              </p>
            )}
          </div>

          {/* Canvas */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)', borderRadius: 6, minHeight: VIEW_MAX_H + 40, padding: 20 }}>
            {!imgDims ? (
              <span style={{ color: 'var(--stone)', fontSize: 14 }}>Loading image…</span>
            ) : (
              <div
                style={{
                  width: view.w, height: view.h, overflow: 'hidden', position: 'relative',
                  cursor: 'grab', boxShadow: '0 0 0 2px var(--caramel)', touchAction: 'none',
                  background: '#fff',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {/* Rotated-image bounding box, scaled + panned */}
                <div style={{
                  position: 'absolute', left: clampedOffset.x, top: clampedOffset.y,
                  width: rot.w * scale, height: rot.h * scale, pointerEvents: 'none',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url} alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      width: imgDims.w * scale, height: imgDims.h * scale,
                      left: (rot.w - imgDims.w) * scale / 2,
                      top: (rot.h - imgDims.h) * scale / 2,
                      transform: `rotate(${rotate}deg)`,
                      maxWidth: 'none',
                    }}
                  />
                </div>
                {/* Rule-of-thirds grid */}
                {[1, 2].map(i => (
                  <div key={`v${i}`} style={{ position: 'absolute', left: `${(i * 100) / 3}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }} />
                ))}
                {[1, 2].map(i => (
                  <div key={`h${i}`} style={{ position: 'absolute', top: `${(i * 100) / 3}%`, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.55)', pointerEvents: 'none' }} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
