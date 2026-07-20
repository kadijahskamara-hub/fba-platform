'use client'

// ============================================================
// Media Library — image editor (Sprint 23, Wix rework 24.1,
// draggable crop frame 24.2).
//
// The crop window is a real frame: drag its 8 handles to resize
// (free-form in Free mode; ratio-locked on presets), drag inside
// it to reposition the image, zoom, rotate. Server-side sharp.
// Save modes: Save copy (new file) / Replace original (in place).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { appConfirm } from '@/lib/appConfirm'
import {
  ASPECT_PRESETS, orientedRatio, rotatedDims, minCoverScale, clampOffset,
  computeExtract, MAX_OUTPUT_PX,
  resizeCropFrame, fitCropFrame, CROP_MIN_SIZE,
  type CropFrame, type CropHandle,
} from '@/lib/mediaShared'

type Props = {
  bucket: string
  path: string
  url: string
  onClose: () => void
  onSaved: () => void
}

const CANVAS_W = 640
const CANVAS_H = 440

const HANDLES: Array<{ id: CropHandle; cursor: string }> = [
  { id: 'nw', cursor: 'nwse-resize' }, { id: 'n', cursor: 'ns-resize' }, { id: 'ne', cursor: 'nesw-resize' },
  { id: 'e', cursor: 'ew-resize' }, { id: 'se', cursor: 'nwse-resize' }, { id: 's', cursor: 'ns-resize' },
  { id: 'sw', cursor: 'nesw-resize' }, { id: 'w', cursor: 'ew-resize' },
]

export default function MediaEditorModal({ bucket, path, url, onClose, onSaved }: Props) {
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)
  const [preset, setPreset] = useState('free')
  const [landscape, setLandscape] = useState(true)
  const [rotBase, setRotBase] = useState(0)     // 90° steps
  const [rotFine, setRotFine] = useState(0)     // -45..45
  const [zoom, setZoom] = useState(1)           // multiplier on cover scale
  const [frame, setFrame] = useState<CropFrame>({ x: 0, y: 0, w: CANVAS_W, h: CANVAS_H })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [outW, setOutW] = useState<string>('')
  const [outH, setOutH] = useState<string>('')
  const [outDirty, setOutDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  const handleRef = useRef<{
    handle: CropHandle; startX: number; startY: number; frame0: CropFrame; offset0: { x: number; y: number }
  } | null>(null)

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

  // Aspect that drives frame REFITS. In Free mode the frame is
  // shaped by hand (or by typed W/H); presets lock the ratio.
  const aspect = useMemo(() => {
    const p = ASPECT_PRESETS.find(a => a.key === preset)
    if (!p || p.ratio === null) {
      const w = parseInt(outW), h = parseInt(outH)
      if (outDirty && w > 0 && h > 0) return w / h
      return rot.w / Math.max(1, rot.h)
    }
    const r = p.ratio === -1 ? (imgDims ? imgDims.w / imgDims.h : 1) : p.ratio
    return orientedRatio(r, landscape)
    // In free non-dirty mode the memo re-runs when outW/outH sync from
    // the crop, but returns the same rot-ratio value — so the frame
    // refit effect (keyed on the aspect VALUE) does not fire.
  }, [preset, landscape, imgDims, rot.w, rot.h, outDirty, outW, outH])

  const cover = minCoverScale(rot.w, rot.h, frame.w, frame.h)
  const scale = cover * zoom

  // Refit the frame + recentre the image when the target shape changes.
  useEffect(() => {
    const f = fitCropFrame(aspect, CANVAS_W, CANVAS_H)
    setFrame(f)
    const c = minCoverScale(rot.w, rot.h, f.w, f.h) * zoom
    setOffset({ x: (f.w - rot.w * c) / 2, y: (f.h - rot.h * c) / 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, imgDims, rotate])

  const clampedOffset = {
    x: clampOffset(offset.x, rot.w * scale, frame.w),
    y: clampOffset(offset.y, rot.h * scale, frame.h),
  }

  const extract = imgDims ? computeExtract({
    scale, offsetX: clampedOffset.x, offsetY: clampedOffset.y,
    viewW: frame.w, viewH: frame.h, imgW: rot.w, imgH: rot.h,
  }) : null

  // Default output size mirrors the crop until the user types their own.
  useEffect(() => {
    if (!extract || outDirty) return
    setOutW(String(extract.width))
    setOutH(String(extract.height))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extract?.width, extract?.height, outDirty])
  useEffect(() => { setOutDirty(false) }, [preset, landscape, rotBase])

  // ---------- image pan ----------
  const onPanDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    panRef.current = { startX: e.clientX, startY: e.clientY, ox: clampedOffset.x, oy: clampedOffset.y }
  }
  const onPanMove = (e: React.PointerEvent) => {
    const d = panRef.current
    if (!d) return
    setOffset({ x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) })
  }
  const onPanUp = () => { panRef.current = null }

  // ---------- frame-handle drag ----------
  const onHandleDown = (handle: CropHandle) => (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    handleRef.current = { handle, startX: e.clientX, startY: e.clientY, frame0: frame, offset0: clampedOffset }
  }
  const onHandleMove = (e: React.PointerEvent) => {
    const d = handleRef.current
    if (!d) return
    e.stopPropagation()
    const next = resizeCropFrame(d.frame0, d.handle, e.clientX - d.startX, e.clientY - d.startY, {
      aspect: preset === 'free' ? null : aspect,
      minSize: CROP_MIN_SIZE, boundsW: CANVAS_W, boundsH: CANVAS_H,
    })
    setFrame(next)
    // Keep the image stationary on the canvas while the frame moves.
    setOffset({ x: d.offset0.x + (d.frame0.x - next.x), y: d.offset0.y + (d.frame0.y - next.y) })
  }
  const onHandleUp = () => { handleRef.current = null }

  const save = useCallback(async (overwrite: boolean) => {
    if (!extract) return
    const w = parseInt(outW), h = parseInt(outH)
    if (!(w > 0) || !(h > 0) || w > MAX_OUTPUT_PX || h > MAX_OUTPUT_PX) {
      setError(`Output size must be 1–${MAX_OUTPUT_PX}px.`); return
    }
    if (overwrite && !await appConfirm(
      'Replace the original image? The edited version takes its place everywhere it is used — the un-edited original is not kept.'
    )) return
    setBusy(true); setError(null)
    const res = await fetch('/api/admin/media/edit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket, path, rotate, crop: extract, outputWidth: w, outputHeight: h, overwrite }),
    }).then(r => r.json()).catch(() => ({ success: false, error: 'Network error' }))
    setBusy(false)
    if (!res.success) { setError(res.error ?? 'Save failed.'); return }
    onSaved()
  }, [bucket, path, rotate, extract, outW, outH, onSaved])

  // ---------- styles (FBA fundamentals) ----------
  const sectionLabel: React.CSSProperties = {
    fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'var(--stone)', margin: '18px 0 8px',
  }
  const numInp: React.CSSProperties = {
    width: '100%', border: '1px solid var(--light-line)', borderRadius: 4,
    padding: '8px 10px', fontSize: 14, background: 'var(--warm-white)', color: 'var(--forest)',
  }
  const orientBtn = (active: boolean): React.CSSProperties => ({
    border: active ? '2px solid var(--caramel)' : '1px solid var(--light-line)',
    borderRadius: 6, background: active ? 'var(--cream)' : 'var(--warm-white)',
    width: 42, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  })

  const presetTile = (p: { key: string; label: string; ratio: number | null }) => {
    const active = preset === p.key
    let r = p.ratio === null ? 1 : p.ratio === -1 ? (imgDims ? imgDims.w / imgDims.h : 1) : orientedRatio(p.ratio, landscape)
    if (!(r > 0)) r = 1
    const boxW = r >= 1 ? 26 : Math.max(12, Math.round(26 * r))
    const boxH = r >= 1 ? Math.max(12, Math.round(26 / r)) : 26
    return (
      <button
        key={p.key}
        onClick={() => setPreset(p.key)}
        style={{
          position: 'relative', border: active ? '2px solid var(--caramel)' : '1px solid var(--light-line)',
          borderRadius: 8, background: active ? 'var(--cream)' : 'var(--warm-white)',
          padding: '10px 0 6px', cursor: 'pointer', width: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        }}
      >
        {active && (
          <span style={{
            position: 'absolute', top: -7, right: -7, width: 18, height: 18, borderRadius: '50%',
            background: 'var(--caramel)', color: '#fff', fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✓</span>
        )}
        <span style={{
          width: boxW, height: boxH, borderRadius: 3,
          background: p.key === 'free' || p.key === 'original' ? 'transparent' : active ? 'var(--caramel)' : 'var(--light-line)',
          border: p.key === 'free' ? `1.5px dashed ${active ? 'var(--caramel)' : 'var(--stone)'}` : p.key === 'original' ? `1.5px solid ${active ? 'var(--caramel)' : 'var(--stone)'}` : 'none',
        }} />
        <span style={{ fontSize: 11, color: active ? 'var(--caramel)' : 'var(--stone)', fontWeight: active ? 600 : 400 }}>{p.label}</span>
      </button>
    )
  }

  // Handle geometry: corners are squares, edges are pills.
  const handlePos = (id: CropHandle): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute', background: 'var(--caramel)', borderRadius: 2, zIndex: 4,
      touchAction: 'none',
    }
    const corner = { width: 14, height: 14 }
    const hEdge = { width: 24, height: 8 }
    const vEdge = { width: 8, height: 24 }
    switch (id) {
      case 'nw': return { ...base, ...corner, top: -7, left: -7 }
      case 'ne': return { ...base, ...corner, top: -7, right: -7 }
      case 'sw': return { ...base, ...corner, bottom: -7, left: -7 }
      case 'se': return { ...base, ...corner, bottom: -7, right: -7 }
      case 'n':  return { ...base, ...hEdge, top: -4, left: '50%', marginLeft: -12 }
      case 's':  return { ...base, ...hEdge, bottom: -4, left: '50%', marginLeft: -12 }
      case 'w':  return { ...base, ...vEdge, left: -4, top: '50%', marginTop: -12 }
      case 'e':  return { ...base, ...vEdge, right: -4, top: '50%', marginTop: -12 }
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 1060, width: '96vw', maxHeight: '94vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', borderBottom: '1px solid var(--light-line)', background: 'var(--warm-white)' }}>
          <h2 className="h3" style={{ marginRight: 'auto' }}>Edit image</h2>
          <span style={{ fontSize: 12, color: 'var(--stone)' }}>Save a copy, or replace the original to save space.</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-secondary btn-sm" onClick={() => save(true)} disabled={busy || !extract}>
            {busy ? 'Saving…' : 'Replace original'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => save(false)} disabled={busy || !extract}>
            {busy ? 'Saving…' : 'Save copy'}
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY: 'auto' }}>
          {error && <div style={{ background: '#fdecea', color: '#a03030', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 14 }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '264px 1fr', gap: 24 }}>
            {/* Controls */}
            <div style={{ paddingRight: 4 }}>
              <div style={{ ...sectionLabel, marginTop: 0 }}>Crop</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {ASPECT_PRESETS.map(presetTile)}
              </div>
              <p style={{ fontSize: 11, color: 'var(--stone)', marginTop: 8 }}>
                Drag the frame handles to adjust the crop{preset === 'free' ? ' freely' : ' (ratio stays locked)'}.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--forest)' }}>Orientation</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={orientBtn(!landscape)} title="Portrait" onClick={() => setLandscape(false)}>
                    <span style={{ width: 10, height: 16, border: '1.5px solid var(--forest)', borderRadius: 3, display: 'block' }} />
                  </button>
                  <button style={orientBtn(landscape)} title="Landscape" onClick={() => setLandscape(true)}>
                    <span style={{ width: 16, height: 10, border: '1.5px solid var(--forest)', borderRadius: 3, display: 'block' }} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                <div>
                  <div className="form-label">Width (px)</div>
                  <input style={numInp} type="number" min={1} max={MAX_OUTPUT_PX} value={outW}
                    onChange={e => { setOutDirty(true); setOutW(e.target.value.replace(/\D/g, '')) }} />
                </div>
                <div>
                  <div className="form-label">Height (px)</div>
                  <input style={numInp} type="number" min={1} max={MAX_OUTPUT_PX} value={outH}
                    onChange={e => { setOutDirty(true); setOutH(e.target.value.replace(/\D/g, '')) }} />
                </div>
              </div>

              <div style={sectionLabel}>Zoom</div>
              <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} style={{ width: '100%' }} />

              <div style={sectionLabel}>Rotate</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setRotBase(b => b - 90)}>⟲ 90°</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setRotBase(b => b + 90)}>⟳ 90°</button>
                <span style={{ fontSize: 13, color: 'var(--forest)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{rotate}°</span>
              </div>
              <input type="range" min={-45} max={45} step={1} value={rotFine} onChange={e => setRotFine(Number(e.target.value))} style={{ width: '100%' }} />
              {rotFine !== 0 && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setRotFine(0)}>Reset angle</button>
              )}

              {extract && (
                <p style={{ fontSize: 12, color: 'var(--stone)', marginTop: 16, lineHeight: 1.5 }}>
                  Crop: {extract.width} × {extract.height}px
                  {(parseInt(outW) > extract.width || parseInt(outH) > extract.height) && (
                    <><br />Output larger than crop — the image will be upscaled.</>
                  )}
                </p>
              )}
            </div>

            {/* Canvas */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--cream)', borderRadius: 8, border: '1px solid var(--light-line)',
              minHeight: CANVAS_H + 64, padding: 32,
            }}>
              {!imgDims ? (
                <span style={{ color: 'var(--stone)', fontSize: 14 }}>Loading image…</span>
              ) : (
                <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H }}>
                  {/* Crop frame */}
                  <div style={{ position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
                    <div
                      style={{
                        position: 'absolute', inset: 0, overflow: 'hidden',
                        cursor: 'grab', outline: '2px solid var(--caramel)', touchAction: 'none',
                        background: '#fff',
                      }}
                      onPointerDown={onPanDown}
                      onPointerMove={onPanMove}
                      onPointerUp={onPanUp}
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

                    {/* Draggable handles */}
                    {HANDLES.map(({ id, cursor }) => (
                      <span
                        key={id}
                        style={{ ...handlePos(id), cursor }}
                        onPointerDown={onHandleDown(id)}
                        onPointerMove={onHandleMove}
                        onPointerUp={onHandleUp}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
