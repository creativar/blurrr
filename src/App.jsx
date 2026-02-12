import { useRef, useState, useEffect } from 'react'

let nextId = 1

// --- Geometry helpers ---
function rotPt(px, py, cx, cy, a) {
  const cos = Math.cos(a), sin = Math.sin(a), dx = px - cx, dy = py - cy
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
}

// --- Shape helpers ---
function clipShape(ctx, shape, x, y, w, h) {
  ctx.beginPath()
  if (shape === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2) || 1, Math.abs(h / 2) || 1, 0, 0, Math.PI * 2)
  else if (shape === 'rounded') ctx.roundRect(x, y, w, h, Math.min(Math.abs(w), Math.abs(h)) * 0.25)
  else ctx.rect(x, y, w, h)
}

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function drawChunky(ctx, x, y, w, h, blockSize, seed) {
  const rng = mulberry32(seed)
  for (let r = 0; r < Math.ceil(h / blockSize); r++) {
    for (let c = 0; c < Math.ceil(w / blockSize); c++) {
      const v = rng()
      if (v < 0.33) ctx.fillStyle = '#000'
      else if (v < 0.66) ctx.fillStyle = '#fff'
      else continue
      ctx.fillRect(x + c * blockSize, y + r * blockSize, Math.min(blockSize, w - c * blockSize), Math.min(blockSize, h - r * blockSize))
    }
  }
}

// Detect ctx.filter support (Safari < 17.2 doesn't have it)
const supportsFilter = (() => {
  try {
    const c = document.createElement('canvas').getContext('2d')
    c.filter = 'blur(1px)'
    return c.filter === 'blur(1px)'
  } catch { return false }
})()

// Fallback blur via repeated downscale/upscale (works everywhere)
function blurRegion(ctx, canvas, sx, sy, sw, sh, amount) {
  if (sw < 1 || sh < 1) return
  sx = Math.max(0, Math.round(sx)); sy = Math.max(0, Math.round(sy))
  sw = Math.min(Math.round(sw), canvas.width - sx); sh = Math.min(Math.round(sh), canvas.height - sy)
  if (sw < 1 || sh < 1) return
  const steps = Math.max(2, Math.ceil(amount / 4))
  const scale = Math.max(1, Math.round(amount / 2))
  const tw = Math.max(1, Math.ceil(sw / scale)), th = Math.max(1, Math.ceil(sh / scale))
  const tmp = document.createElement('canvas')
  tmp.width = tw; tmp.height = th
  const tc = tmp.getContext('2d')
  tc.drawImage(canvas, sx, sy, sw, sh, 0, 0, tw, th)
  // Multiple passes of down/up for smoother blur
  for (let i = 1; i < steps; i++) {
    const s = Math.max(1, Math.ceil(tw / 2)), t = Math.max(1, Math.ceil(th / 2))
    const tmp2 = document.createElement('canvas')
    tmp2.width = s; tmp2.height = t
    tmp2.getContext('2d').drawImage(tmp, 0, 0, s, t)
    tc.clearRect(0, 0, tw, th)
    tc.drawImage(tmp2, 0, 0, tw, th)
  }
  ctx.drawImage(tmp, 0, 0, tw, th, sx, sy, sw, sh)
}

function applyEffect(ctx, canvas, r) {
  if (r.w < 2 || r.h < 2) return
  const angle = r.rotation || 0
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate(angle)
  clipShape(ctx, r.shape, -r.w / 2, -r.h / 2, r.w, r.h)
  ctx.clip()
  if (r.mode === 'redact') { ctx.fillStyle = '#000'; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h) }
  else if (r.mode === 'erase') { ctx.fillStyle = '#fff'; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h) }
  else if (supportsFilter) {
    ctx.rotate(-angle); ctx.translate(-cx, -cy)
    ctx.filter = `blur(${r.blurAmount}px)`
    const m = r.blurAmount * 3
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const corners = [[-r.w / 2, -r.h / 2], [r.w / 2, -r.h / 2], [r.w / 2, r.h / 2], [-r.w / 2, r.h / 2]]
    const xs = corners.map(([lx, ly]) => cx + lx * cos - ly * sin)
    const ys = corners.map(([lx, ly]) => cy + lx * sin + ly * cos)
    const minX = Math.min(...xs) - m, minY = Math.min(...ys) - m
    const maxX = Math.max(...xs) + m, maxY = Math.max(...ys) + m
    ctx.drawImage(canvas, minX, minY, maxX - minX, maxY - minY, minX, minY, maxX - minX, maxY - minY)
  } else {
    // Fallback: downscale blur for browsers without ctx.filter
    ctx.rotate(-angle); ctx.translate(-cx, -cy)
    const m = r.blurAmount * 2
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const corners = [[-r.w / 2, -r.h / 2], [r.w / 2, -r.h / 2], [r.w / 2, r.h / 2], [-r.w / 2, r.h / 2]]
    const xs = corners.map(([lx, ly]) => cx + lx * cos - ly * sin)
    const ys = corners.map(([lx, ly]) => cy + lx * sin + ly * cos)
    const minX = Math.min(...xs) - m, minY = Math.min(...ys) - m
    const maxX = Math.max(...xs) + m, maxY = Math.max(...ys) + m
    blurRegion(ctx, canvas, minX, minY, maxX - minX, maxY - minY, r.blurAmount)
  }
  ctx.restore()
  if (r.mode === 'blur' && r.chunky) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle)
    clipShape(ctx, r.shape, -r.w / 2, -r.h / 2, r.w, r.h); ctx.clip()
    drawChunky(ctx, -r.w / 2, -r.h / 2, r.w, r.h, r.chunkSize, r.seed); ctx.restore()
  }
}

function strokeShape(ctx, shape, x, y, w, h) {
  ctx.beginPath()
  if (shape === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2) || 1, Math.abs(h / 2) || 1, 0, 0, Math.PI * 2)
  else if (shape === 'rounded') ctx.roundRect(x, y, w, h, Math.min(Math.abs(w), Math.abs(h)) * 0.25)
  else ctx.rect(x, y, w, h)
  ctx.stroke()
}

function strokePreview(ctx, shape, x, y, w, h) {
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.setLineDash([8, 5])
  strokeShape(ctx, shape, x, y, w, h)
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.lineDashOffset = 6
  strokeShape(ctx, shape, x, y, w, h)
  ctx.setLineDash([]); ctx.lineDashOffset = 0
}

// --- Handle helpers ---
function getHandles(r) {
  const angle = r.rotation || 0
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  const local = {
    tl: [r.x, r.y], tc: [r.x + r.w / 2, r.y], tr: [r.x + r.w, r.y],
    ml: [r.x, r.y + r.h / 2], mr: [r.x + r.w, r.y + r.h / 2],
    bl: [r.x, r.y + r.h], bc: [r.x + r.w / 2, r.y + r.h], br: [r.x + r.w, r.y + r.h],
  }
  const result = {}
  for (const [k, [lx, ly]] of Object.entries(local)) result[k] = rotPt(lx, ly, cx, cy, angle)
  return result
}

function getResizeInfo(handle, r) {
  const w = r.w, h = r.h, angle = r.rotation || 0
  const cx = r.x + w / 2, cy = r.y + h / 2
  const map = {
    tl: { fl: [r.x + w, r.y + h], rx: true, ry: true, ox: -w / 2, oy: -h / 2 },
    tc: { fl: [r.x + w / 2, r.y + h], rx: false, ry: true, ox: 0, oy: -h / 2 },
    tr: { fl: [r.x, r.y + h], rx: true, ry: true, ox: w / 2, oy: -h / 2 },
    ml: { fl: [r.x + w, r.y + h / 2], rx: true, ry: false, ox: -w / 2, oy: 0 },
    mr: { fl: [r.x, r.y + h / 2], rx: true, ry: false, ox: w / 2, oy: 0 },
    bl: { fl: [r.x + w, r.y], rx: true, ry: true, ox: -w / 2, oy: h / 2 },
    bc: { fl: [r.x + w / 2, r.y], rx: false, ry: true, ox: 0, oy: h / 2 },
    br: { fl: [r.x, r.y], rx: true, ry: true, ox: w / 2, oy: h / 2 },
  }
  const i = map[handle]
  const fs = rotPt(i.fl[0], i.fl[1], cx, cy, angle)
  return { fsx: fs.x, fsy: fs.y, rx: i.rx, ry: i.ry, ox: i.ox, oy: i.oy, angle }
}

const CURSORS = { tl: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', br: 'nwse-resize', tc: 'ns-resize', bc: 'ns-resize', ml: 'ew-resize', mr: 'ew-resize' }

function getRotHandlePos(region, hs) {
  const angle = region.rotation || 0
  const cx = region.x + region.w / 2, cy = region.y + region.h / 2
  return rotPt(region.x + region.w / 2, region.y - hs * 5, cx, cy, angle)
}

function getDeletePos(region, hs) {
  const angle = region.rotation || 0
  const cx = region.x + region.w / 2, cy = region.y + region.h / 2
  return rotPt(region.x + region.w, region.y - hs * 3.2, cx, cy, angle)
}

function drawHandlesUI(ctx, region, hs) {
  const angle = region.rotation || 0
  const cx = region.x + region.w / 2, cy = region.y + region.h / 2
  // Rotated outline
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle)
  strokePreview(ctx, region.shape, -region.w / 2, -region.h / 2, region.w, region.h)
  ctx.restore()
  // Resize handles
  const handles = getHandles(region)
  for (const p of Object.values(handles)) {
    ctx.beginPath(); ctx.arc(p.x, p.y, hs, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'; ctx.fill()
    ctx.strokeStyle = '#5fb4e4'; ctx.lineWidth = hs * 0.4; ctx.stroke()
  }
  // Rotation handle
  const tc = handles.tc
  const rh = getRotHandlePos(region, hs)
  ctx.beginPath(); ctx.moveTo(tc.x, tc.y); ctx.lineTo(rh.x, rh.y)
  ctx.strokeStyle = '#5fb4e4'; ctx.lineWidth = hs * 0.3; ctx.setLineDash([]); ctx.stroke()
  ctx.beginPath(); ctx.arc(rh.x, rh.y, hs, 0, Math.PI * 2)
  ctx.fillStyle = '#5fb4e4'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = hs * 0.3; ctx.stroke()
  // Delete button
  const del = getDeletePos(region, hs)
  const dr = hs * 1.6
  ctx.beginPath(); ctx.arc(del.x, del.y, dr, 0, Math.PI * 2); ctx.fillStyle = '#ef4444'; ctx.fill()
  const cr = dr * 0.4
  ctx.strokeStyle = '#fff'; ctx.lineWidth = hs * 0.35
  ctx.beginPath(); ctx.moveTo(del.x - cr, del.y - cr); ctx.lineTo(del.x + cr, del.y + cr)
  ctx.moveTo(del.x + cr, del.y - cr); ctx.lineTo(del.x - cr, del.y + cr); ctx.stroke()
}

// =============================================================
export default function App() {
  const canvasRef = useRef(null), wrapRef = useRef(null), fileRef = useRef(null), imgRef = useRef(null)
  const regionsRef = useRef([])
  const selectedIdRef = useRef(null)
  const dragRef = useRef({ type: 'none' })
  const historyRef = useRef([[]])
  const indexRef = useRef(0)
  const imageStackRef = useRef([]) // stores {img, regions, history, index} before destructive ops

  const [loaded, setLoaded] = useState(false)
  const [blurAmount, setBlurAmount] = useState(20)
  const [fileName, setFileName] = useState('blurred.png')
  const [fileDragging, setFileDragging] = useState(false)
  const [mode, setMode] = useState('blur')
  const [chunky, setChunky] = useState(false)
  const [chunkSize, setChunkSize] = useState(16)
  const [shape, setShape] = useState('rect')
  const [showAbout, setShowAbout] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedId, _setSelectedId] = useState(null)
  const [cropping, _setCropping] = useState(false)
  const croppingRef = useRef(false)
  const setCropping = (v) => { croppingRef.current = v; _setCropping(v) }
  const cropRef = useRef(null)
  const [, forceUpdate] = useState(0)
  const [hasFaceDetector, setHasFaceDetector] = useState(typeof window.FaceDetector === 'function')
  const [detecting, setDetecting] = useState(null) // 'faces' | 'text' | null
  const [detectMsg, setDetectMsg] = useState(null)
  const showOriginalRef = useRef(false)

  const setSelectedId = (id) => { selectedIdRef.current = id; _setSelectedId(id) }
  const getScale = () => { const c = canvasRef.current; if (!c) return 1; const r = c.getBoundingClientRect(); return c.width / (r.width || 1) }
  const getCoords = (e) => { const c = canvasRef.current, r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) } }

  // --- Render ---
  const render = (opts = {}) => {
    const canvas = canvasRef.current, img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    const { showUI = true, previewRegion, showOriginal = false } = opts
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    if (!showOriginal) {
      for (const r of regionsRef.current) applyEffect(ctx, canvas, r)
      if (previewRegion) {
        applyEffect(ctx, canvas, previewRegion)
        if (showUI) strokePreview(ctx, previewRegion.shape, previewRegion.x, previewRegion.y, previewRegion.w, previewRegion.h)
      }
    }
    if (showUI && selectedIdRef.current && !showOriginal) {
      const sel = regionsRef.current.find(r => r.id === selectedIdRef.current)
      if (sel) drawHandlesUI(ctx, sel, 6 * getScale())
    }
    // Crop overlay
    const crop = cropRef.current
    if (showUI && crop && !showOriginal) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, 0, canvas.width, crop.y)
      ctx.fillRect(0, crop.y, crop.x, crop.h)
      ctx.fillRect(crop.x + crop.w, crop.y, canvas.width - crop.x - crop.w, crop.h)
      ctx.fillRect(0, crop.y + crop.h, canvas.width, canvas.height - crop.y - crop.h)
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * getScale(); ctx.setLineDash([])
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h)
    }
    // "Original" badge
    if (showOriginal && showUI) {
      const s = getScale()
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(8 * s, 8 * s, 80 * s, 28 * s)
      ctx.fillStyle = '#fff'; ctx.font = `${14 * s}px Inter, sans-serif`; ctx.fillText('Original', 16 * s, 27 * s)
    }
  }

  // --- History ---
  const commitRegions = (regs) => {
    historyRef.current = historyRef.current.slice(0, indexRef.current + 1)
    historyRef.current.push(structuredClone(regs))
    if (historyRef.current.length > 50) historyRef.current.shift()
    else indexRef.current++
    regionsRef.current = regs
    forceUpdate(n => n + 1)
  }
  const saveImageState = () => {
    imageStackRef.current.push({
      img: imgRef.current,
      regions: structuredClone(regionsRef.current),
      history: structuredClone(historyRef.current),
      index: indexRef.current,
    })
    if (imageStackRef.current.length > 20) imageStackRef.current.shift()
  }
  const canUndo = () => indexRef.current > 0 || imageStackRef.current.length > 0
  const canRedo = () => indexRef.current < historyRef.current.length - 1
  const undo = () => {
    if (indexRef.current > 0) {
      indexRef.current--; regionsRef.current = structuredClone(historyRef.current[indexRef.current]); setSelectedId(null); forceUpdate(n => n + 1)
    } else if (imageStackRef.current.length > 0) {
      const prev = imageStackRef.current.pop()
      imgRef.current = prev.img
      const canvas = canvasRef.current
      canvas.width = prev.img.width; canvas.height = prev.img.height
      regionsRef.current = prev.regions
      historyRef.current = prev.history
      indexRef.current = prev.index
      setSelectedId(null); setCropping(false); cropRef.current = null
      forceUpdate(n => n + 1); setTimeout(fitCanvas, 0)
    }
  }
  const redo = () => { if (!canRedo()) return; indexRef.current++; regionsRef.current = structuredClone(historyRef.current[indexRef.current]); setSelectedId(null); forceUpdate(n => n + 1) }

  // Check FaceDetector support
  useEffect(() => {
    if (typeof window.FaceDetector === 'function') {
      try { new window.FaceDetector(); setHasFaceDetector(true) } catch { /* not supported */ }
    }
  }, [])

  // Render after every React update
  useEffect(() => { if (loaded) render() })

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') { e.preventDefault(); redo() }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'v') { handleClipboardPaste() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdRef.current && document.activeElement === document.body) {
        e.preventDefault()
        commitRegions(regionsRef.current.filter(r => r.id !== selectedIdRef.current))
        setSelectedId(null)
      } else if (e.key === 'Escape') {
        if (croppingRef.current) { cropRef.current = null; setCropping(false); forceUpdate(n => n + 1) }
        setSelectedId(null)
      } else if (e.key === 'Alt') {
        e.preventDefault()
        if (imgRef.current && regionsRef.current.length > 0) {
          showOriginalRef.current = true; render({ showOriginal: true })
        }
      }
    }
    const handleKeyUp = (e) => {
      if (e.key === 'Alt' && showOriginalRef.current) {
        showOriginalRef.current = false; render()
      }
    }
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (blob) loadFile(new File([blob], 'pasted.png', { type: blob.type }))
          return
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('paste', handlePaste)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('paste', handlePaste)
    }
  }, [])

  const handleClipboardPaste = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imgType = item.types.find(t => t.startsWith('image/'))
        if (imgType) {
          const blob = await item.getType(imgType)
          loadFile(new File([blob], 'pasted.png', { type: imgType }))
          return
        }
      }
    } catch { /* clipboard API may not be available, fallback paste event handles it */ }
  }

  // Resize
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current, img = imgRef.current, wrap = wrapRef.current
      if (!canvas || !img || !wrap) return
      const scale = Math.min(wrap.clientWidth / img.width, wrap.clientHeight / img.height, 1)
      canvas.style.width = (img.width * scale) + 'px'
      canvas.style.height = (img.height * scale) + 'px'
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const fitCanvas = () => {
    const canvas = canvasRef.current, img = imgRef.current, wrap = wrapRef.current
    if (!canvas || !img || !wrap) return
    const scale = Math.min(wrap.clientWidth / img.width, wrap.clientHeight / img.height, 1)
    canvas.style.width = (img.width * scale) + 'px'
    canvas.style.height = (img.height * scale) + 'px'
  }

  const loadFile = (file) => {
    setFileName(file.name.replace(/\.[^.]+$/, '') + '_blurred.png')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        imgRef.current = img
        const canvas = canvasRef.current
        canvas.width = img.width; canvas.height = img.height
        regionsRef.current = []; historyRef.current = [[]]; indexRef.current = 0; nextId = 1
        setSelectedId(null); setLoaded(true); setDetectMsg(null)
        forceUpdate(n => n + 1); setTimeout(fitCanvas, 0)
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  // --- Mouse: draw, move, resize ---
  const onMouseDown = (e) => {
    if (!imgRef.current) return
    const pos = getCoords(e), scale = getScale(), hs = 6 * scale, thr = hs * 1.5

    // Crop mode drag
    if (croppingRef.current) {
      dragRef.current = { type: 'cropping', sx: pos.x, sy: pos.y }
      cropRef.current = null
      attachDrag(); return
    }

    // Check selected region's delete button, rotation handle, and resize handles
    const selReg = selectedIdRef.current ? regionsRef.current.find(r => r.id === selectedIdRef.current) : null
    if (selReg) {
      const del = getDeletePos(selReg, hs)
      if (Math.hypot(pos.x - del.x, pos.y - del.y) < hs * 2.4) {
        commitRegions(regionsRef.current.filter(r => r.id !== selReg.id))
        setSelectedId(null); return
      }
      const rh = getRotHandlePos(selReg, hs)
      if (Math.hypot(pos.x - rh.x, pos.y - rh.y) < thr) {
        const rcx = selReg.x + selReg.w / 2, rcy = selReg.y + selReg.h / 2
        dragRef.current = { type: 'rotating', regionId: selReg.id, startAngle: Math.atan2(pos.y - rcy, pos.x - rcx), origRotation: selReg.rotation || 0 }
        attachDrag(); return
      }
      const handles = getHandles(selReg)
      for (const [key, hp] of Object.entries(handles)) {
        if (Math.abs(pos.x - hp.x) < thr && Math.abs(pos.y - hp.y) < thr) {
          dragRef.current = { type: 'resizing', regionId: selReg.id, ...getResizeInfo(key, selReg) }
          attachDrag(); return
        }
      }
    }
    // Check if clicking inside any region (using local-space hit test)
    for (let i = regionsRef.current.length - 1; i >= 0; i--) {
      const r = regionsRef.current[i]
      const rcx = r.x + r.w / 2, rcy = r.y + r.h / 2
      const lp = rotPt(pos.x, pos.y, rcx, rcy, -(r.rotation || 0))
      if (lp.x >= r.x && lp.x <= r.x + r.w && lp.y >= r.y && lp.y <= r.y + r.h) {
        setSelectedId(r.id)
        dragRef.current = { type: 'moving', regionId: r.id, ox: pos.x - r.x, oy: pos.y - r.y }
        attachDrag(); return
      }
    }
    // Start drawing new region
    setSelectedId(null)
    dragRef.current = { type: 'drawing', sx: pos.x, sy: pos.y, seed: Math.floor(Math.random() * 2 ** 32), mode, shape, blurAmount, chunky, chunkSize }
    attachDrag()
  }

  const attachDrag = () => {
    const onMove = (e) => {
      const pos = getCoords(e), drag = dragRef.current
      if (drag.type === 'cropping') {
        cropRef.current = { x: Math.min(drag.sx, pos.x), y: Math.min(drag.sy, pos.y), w: Math.abs(pos.x - drag.sx), h: Math.abs(pos.y - drag.sy) }
        render()
      } else if (drag.type === 'drawing') {
        render({ previewRegion: { id: '_p', x: Math.min(drag.sx, pos.x), y: Math.min(drag.sy, pos.y), w: Math.abs(pos.x - drag.sx), h: Math.abs(pos.y - drag.sy), mode: drag.mode, shape: drag.shape, blurAmount: drag.blurAmount, chunky: drag.chunky, chunkSize: drag.chunkSize, seed: drag.seed } })
      } else if (drag.type === 'rotating') {
        const reg = regionsRef.current.find(r => r.id === drag.regionId)
        if (reg) {
          const rcx = reg.x + reg.w / 2, rcy = reg.y + reg.h / 2
          const curAngle = Math.atan2(pos.y - rcy, pos.x - rcx)
          reg.rotation = drag.origRotation + (curAngle - drag.startAngle)
          render()
        }
      } else if (drag.type === 'moving') {
        const reg = regionsRef.current.find(r => r.id === drag.regionId)
        if (reg) { reg.x = pos.x - drag.ox; reg.y = pos.y - drag.oy; render() }
      } else if (drag.type === 'resizing') {
        const reg = regionsRef.current.find(r => r.id === drag.regionId)
        if (reg) {
          const cos = Math.cos(drag.angle), sin = Math.sin(drag.angle)
          const vx = pos.x - drag.fsx, vy = pos.y - drag.fsy
          const projX = vx * cos + vy * sin, projY = -vx * sin + vy * cos
          const newW = drag.rx ? Math.max(4, Math.abs(projX)) : reg.w
          const newH = drag.ry ? Math.max(4, Math.abs(projY)) : reg.h
          const offX = drag.rx ? projX / 2 : drag.ox, offY = drag.ry ? projY / 2 : drag.oy
          const ncx = drag.fsx + offX * cos - offY * sin
          const ncy = drag.fsy + offX * sin + offY * cos
          reg.x = ncx - newW / 2; reg.y = ncy - newH / 2; reg.w = newW; reg.h = newH
          render()
        }
      }
    }
    const onUp = (e) => {
      const drag = dragRef.current
      if (drag.type === 'cropping') {
        const pos = getCoords(e)
        const crop = { x: Math.min(drag.sx, pos.x), y: Math.min(drag.sy, pos.y), w: Math.abs(pos.x - drag.sx), h: Math.abs(pos.y - drag.sy) }
        if (crop.w >= 4 && crop.h >= 4) { cropRef.current = crop; forceUpdate(n => n + 1) }
        else { cropRef.current = null }
      } else if (drag.type === 'drawing') {
        const pos = getCoords(e)
        const x = Math.min(drag.sx, pos.x), y = Math.min(drag.sy, pos.y), w = Math.abs(pos.x - drag.sx), h = Math.abs(pos.y - drag.sy)
        if (w >= 4 && h >= 4) {
          const nr = { id: String(nextId++), x, y, w, h, mode: drag.mode, shape: drag.shape, blurAmount: drag.blurAmount, chunky: drag.chunky, chunkSize: drag.chunkSize, seed: drag.seed, rotation: 0 }
          commitRegions([...regionsRef.current, nr]); setSelectedId(nr.id)
        }
      } else if (drag.type === 'moving' || drag.type === 'resizing' || drag.type === 'rotating') {
        commitRegions([...regionsRef.current])
      }
      dragRef.current = { type: 'none' }
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
    const onTouchMove = (e) => { e.preventDefault(); onMove(e.touches[0]) }
    const onTouchEnd = (e) => { e.preventDefault(); onUp(e.changedTouches[0]) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
  }

  // Hover cursor
  const onCanvasMouseMove = (e) => {
    if (dragRef.current.type !== 'none' || !canvasRef.current || !imgRef.current) return
    const canvas = canvasRef.current, pos = getCoords(e), scale = getScale(), hs = 6 * scale, thr = hs * 1.5
    const selReg = selectedIdRef.current ? regionsRef.current.find(r => r.id === selectedIdRef.current) : null
    if (selReg) {
      const del = getDeletePos(selReg, hs)
      if (Math.hypot(pos.x - del.x, pos.y - del.y) < hs * 2.4) { canvas.style.cursor = 'pointer'; return }
      const rh = getRotHandlePos(selReg, hs)
      if (Math.hypot(pos.x - rh.x, pos.y - rh.y) < thr) { canvas.style.cursor = 'grab'; return }
      const handles = getHandles(selReg)
      for (const [key, hp] of Object.entries(handles)) {
        if (Math.abs(pos.x - hp.x) < thr && Math.abs(pos.y - hp.y) < thr) { canvas.style.cursor = CURSORS[key]; return }
      }
    }
    for (let i = regionsRef.current.length - 1; i >= 0; i--) {
      const r = regionsRef.current[i]
      const rcx = r.x + r.w / 2, rcy = r.y + r.h / 2
      const lp = rotPt(pos.x, pos.y, rcx, rcy, -(r.rotation || 0))
      if (lp.x >= r.x && lp.x <= r.x + r.w && lp.y >= r.y && lp.y <= r.y + r.h) { canvas.style.cursor = 'move'; return }
    }
    canvas.style.cursor = 'crosshair'
  }

  const save = () => {
    const prev = selectedIdRef.current; selectedIdRef.current = null
    render({ showUI: false })
    const a = document.createElement('a'); a.download = fileName; a.href = canvasRef.current.toDataURL('image/png'); a.click()
    selectedIdRef.current = prev; render()
  }

  const clear = () => { regionsRef.current = []; historyRef.current = [[]]; indexRef.current = 0; imageStackRef.current = []; setSelectedId(null); setDetectMsg(null); forceUpdate(n => n + 1) }
  const removeImage = () => { setLoaded(false); imgRef.current = null; regionsRef.current = []; historyRef.current = [[]]; indexRef.current = 0; imageStackRef.current = []; setSelectedId(null); setCropping(false); cropRef.current = null; setDetectMsg(null); forceUpdate(n => n + 1) }

  const transformImage = (fn) => {
    const img = imgRef.current; if (!img) return
    saveImageState()
    const offscreen = document.createElement('canvas')
    const octx = offscreen.getContext('2d')
    fn(offscreen, octx, img)
    const newImg = new Image()
    newImg.onload = () => {
      imgRef.current = newImg
      const canvas = canvasRef.current
      canvas.width = newImg.width; canvas.height = newImg.height
      regionsRef.current = []; historyRef.current = [[]]; indexRef.current = 0; setSelectedId(null)
      forceUpdate(n => n + 1); setTimeout(fitCanvas, 0)
    }
    newImg.src = offscreen.toDataURL()
  }

  const flipH = () => transformImage((c, ctx, img) => {
    c.width = img.width; c.height = img.height
    ctx.translate(img.width, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0)
  })
  const flipV = () => transformImage((c, ctx, img) => {
    c.width = img.width; c.height = img.height
    ctx.translate(0, img.height); ctx.scale(1, -1); ctx.drawImage(img, 0, 0)
  })
  const rotateCW = () => transformImage((c, ctx, img) => {
    c.width = img.height; c.height = img.width
    ctx.translate(img.height, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(img, 0, 0)
  })
  const rotateCCW = () => transformImage((c, ctx, img) => {
    c.width = img.height; c.height = img.width
    ctx.translate(0, img.width); ctx.rotate(-Math.PI / 2); ctx.drawImage(img, 0, 0)
  })

  const applyCrop = () => {
    const crop = cropRef.current; if (!crop || crop.w < 4 || crop.h < 4) return
    saveImageState()
    // First render clean (with effects baked in)
    selectedIdRef.current = null; cropRef.current = null; render({ showUI: false })
    const canvas = canvasRef.current, ctx = canvas.getContext('2d')
    const data = ctx.getImageData(Math.round(crop.x), Math.round(crop.y), Math.round(crop.w), Math.round(crop.h))
    const offscreen = document.createElement('canvas')
    offscreen.width = Math.round(crop.w); offscreen.height = Math.round(crop.h)
    offscreen.getContext('2d').putImageData(data, 0, 0)
    const newImg = new Image()
    newImg.onload = () => {
      imgRef.current = newImg; canvas.width = newImg.width; canvas.height = newImg.height
      regionsRef.current = []; historyRef.current = [[]]; indexRef.current = 0; setSelectedId(null)
      setCropping(false); cropRef.current = null
      forceUpdate(n => n + 1); setTimeout(fitCanvas, 0)
    }
    newImg.src = offscreen.toDataURL()
  }
  const cancelCrop = () => { cropRef.current = null; setCropping(false); forceUpdate(n => n + 1) }

  const detectFaces = async () => {
    if (!imgRef.current || detecting) return
    if (!hasFaceDetector) {
      setDetectMsg('Enable chrome://flags/#enable-experimental-web-platform-features and restart Chrome')
      return
    }
    setDetecting('faces'); setDetectMsg(null)
    try {
      const detector = new window.FaceDetector({ maxDetectedFaces: 20, fastMode: false })
      const img = imgRef.current
      const allBoxes = []
      // Detect at multiple scales to catch faces the OS misses
      const scales = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 1.1, 1.2, 1.3, 1.5, 1.7, 2, 2.5, 3]
      for (const scale of scales) {
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
        if (w < 10 || h < 10 || w > 8000 || h > 8000) continue
        const work = document.createElement('canvas')
        work.width = w; work.height = h
        const wctx = work.getContext('2d')
        wctx.drawImage(img, 0, 0, w, h)
        // Mask already-found faces so detector finds new ones
        for (const b of allBoxes) {
          wctx.fillStyle = '#888'
          wctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale)
        }
        for (let pass = 0; pass < 5; pass++) {
          const bitmap = await createImageBitmap(work)
          const results = await detector.detect(bitmap)
          bitmap.close()
          if (results.length === 0) break
          for (const r of results) {
            const box = { x: r.boundingBox.x / scale, y: r.boundingBox.y / scale, w: r.boundingBox.width / scale, h: r.boundingBox.height / scale }
            // Skip if overlaps an existing detection
            const dominated = allBoxes.some(b => {
              const ox = Math.max(0, Math.min(b.x + b.w, box.x + box.w) - Math.max(b.x, box.x))
              const oy = Math.max(0, Math.min(b.y + b.h, box.y + box.h) - Math.max(b.y, box.y))
              return (ox * oy) > Math.min(b.w * b.h, box.w * box.h) * 0.3
            })
            if (!dominated) allBoxes.push(box)
            wctx.fillStyle = '#888'
            wctx.fillRect(r.boundingBox.x, r.boundingBox.y, r.boundingBox.width, r.boundingBox.height)
          }
        }
      }
      if (allBoxes.length === 0) { setDetectMsg('No faces found'); setDetecting(null); return }
      const newRegions = allBoxes.map(b => ({
        id: String(nextId++),
        x: b.x - b.w * 0.1, y: b.y - b.h * 0.1,
        w: b.w * 1.2, h: b.h * 1.2,
        mode, shape, blurAmount, chunky, chunkSize, seed: Math.floor(Math.random() * 2 ** 32), rotation: 0,
      }))
      commitRegions([...regionsRef.current, ...newRegions])
      setDetectMsg(`${allBoxes.length} face${allBoxes.length > 1 ? 's' : ''} found`)
    } catch (err) {
      setDetectMsg('Face detection failed')
    }
    setDetecting(null)
  }

  const detectText = async () => {
    if (!imgRef.current || detecting) return
    setDetecting('text'); setDetectMsg(null)
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      // Pass data URL for maximum compatibility
      const offscreen = document.createElement('canvas')
      offscreen.width = imgRef.current.width; offscreen.height = imgRef.current.height
      offscreen.getContext('2d').drawImage(imgRef.current, 0, 0)
      const dataUrl = offscreen.toDataURL('image/png')
      const result = await worker.recognize(dataUrl, {}, { blocks: true })
      await worker.terminate()
      const words = []
      for (const block of result.data.blocks || [])
        for (const para of block.paragraphs || [])
          for (const line of para.lines || [])
            for (const word of line.words || [])
              words.push(word)
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/
      const matches = words.filter(w => emailRegex.test(w.text))
      if (matches.length === 0) { setDetectMsg('No emails found'); setDetecting(null); return }
      const newRegions = matches.map(w => {
        const b = w.bbox
        const pad = 4
        return {
          id: String(nextId++),
          x: b.x0 - pad, y: b.y0 - pad,
          w: b.x1 - b.x0 + pad * 2, h: b.y1 - b.y0 + pad * 2,
          mode, shape, blurAmount, chunky, chunkSize, seed: Math.floor(Math.random() * 2 ** 32), rotation: 0,
        }
      })
      commitRegions([...regionsRef.current, ...newRegions])
      setDetectMsg(`${matches.length} email${matches.length > 1 ? 's' : ''} found`)
    } catch (err) {
      console.error('Tesseract OCR error:', err)
      setDetectMsg('Text detection failed')
    }
    setDetecting(null)
  }

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-row">
          <span className="logo" onClick={() => setShowAbout(true)}>blurrr</span>
          <div className="sep" />
          <div className="toolbar-dropdown">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="blur">Blur</option>
              <option value="redact">Redact</option>
              <option value="erase">Erase</option>
            </select>
          </div>
          <div className="toolbar-dropdown">
            <select value={shape} onChange={(e) => setShape(e.target.value)}>
              <option value="rect">Rectangle</option>
              <option value="rounded">Rounded</option>
              <option value="ellipse">Ellipse</option>
            </select>
          </div>
          <button className="menu-toggle" onClick={() => setMenuOpen(v => !v)} title="More options">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <div className="spacer" />
          <button className="primary" onClick={() => fileRef.current.click()}>Add</button>
          <button className="primary" onClick={save} disabled={!loaded || cropping}>Save</button>
        </div>
        {menuOpen && (
          <div className="toolbar-overflow">
            {mode === 'blur' && (
              <>
                <label>Strength: <input type="range" min="5" max="60" value={blurAmount} onChange={(e) => setBlurAmount(Number(e.target.value))} /> <span>{blurAmount}px</span></label>
                <label className="checkbox-label"><input type="checkbox" checked={chunky} onChange={(e) => setChunky(e.target.checked)} /> Chunky</label>
                {chunky && <label>Size: <input type="range" min="4" max="48" value={chunkSize} onChange={(e) => setChunkSize(Number(e.target.value))} /> <span>{chunkSize}px</span></label>}
                <div className="sep" />
              </>
            )}
            <div className="undo-redo">
              <button onClick={undo} disabled={!loaded || !canUndo()} title="Undo (Ctrl+Z)">Undo</button>
              <button onClick={redo} disabled={!loaded || !canRedo()} title="Redo (Ctrl+Shift+Z)">Redo</button>
            </div>
            <div className="sep" />
            <div className="undo-redo">
              <button onClick={rotateCCW} disabled={!loaded} title="Rotate Left">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              </button>
              <button onClick={rotateCW} disabled={!loaded} title="Rotate Right">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
              </button>
              <button onClick={flipH} disabled={!loaded} title="Flip Horizontal">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20"/><path d="M16 5h5l-5 14"/><path d="M8 5H3l5 14"/></svg>
              </button>
              <button onClick={flipV} disabled={!loaded} title="Flip Vertical">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h20"/><path d="M5 8V3l14 5"/><path d="M5 16v5l14-5"/></svg>
              </button>
            </div>
            <div className="sep" />
            <button onClick={() => { setCropping(true); setSelectedId(null); cropRef.current = null }} disabled={!loaded || cropping} title="Crop">Crop</button>
            {cropping && (
              <>
                <button className="primary" onClick={() => { applyCrop(); setMenuOpen(false) }} disabled={!cropRef.current}>Apply Crop</button>
                <button onClick={() => { cancelCrop(); setMenuOpen(false) }}>Cancel</button>
              </>
            )}
            <div className="sep" />
            <button onClick={detectFaces} disabled={!loaded || !!detecting} title="Auto-detect faces" className={detecting === 'faces' ? 'detecting' : ''}>
              {detecting === 'faces' && <span className="spinner" />}
              {detecting === 'faces' ? 'Detecting...' : 'Detect Faces'}
            </button>
            <button onClick={detectText} disabled={!loaded || !!detecting} title="Auto-detect email addresses (OCR)" className={detecting === 'text' ? 'detecting' : ''}>
              {detecting === 'text' && <span className="spinner" />}
              {detecting === 'text' ? 'Scanning...' : 'Detect Emails'}
            </button>
            <button
              disabled={!loaded || regionsRef.current.length === 0}
              title="Show original (hold Alt)"
              onMouseDown={() => { showOriginalRef.current = true; render({ showOriginal: true }) }}
              onMouseUp={() => { showOriginalRef.current = false; render() }}
              onMouseLeave={() => { if (showOriginalRef.current) { showOriginalRef.current = false; render() } }}
            >Before/After</button>
            {detectMsg && <span className="detect-msg">{detectMsg}</span>}
            <div className="sep" />
            <button onClick={clear} disabled={!loaded} title="Reset all changes">Clear</button>
            <button onClick={removeImage} disabled={!loaded} title="Remove image">Delete</button>
          </div>
        )}
      </div>

      <div className="canvas-wrap" ref={wrapRef} onDrop={(e) => { e.preventDefault(); setFileDragging(false); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) loadFile(f) }} onDragOver={(e) => { e.preventDefault(); setFileDragging(true) }} onDragLeave={() => setFileDragging(false)}>
        {!loaded && (
          <div className={`drop-zone${fileDragging ? ' dragging' : ''}`}>
            <div className="drop-target" onClick={() => fileRef.current.click()}>
              <div className="icon">&#128444;&#65039;</div>
              <div className="label">Drop an image file here</div>
              <div className="sub">or click to browse</div>
            </div>
            <div className="privacy-note"><span className="lock">&#128274;</span> Your images never leave your device. All processing happens locally. EXIF metadata is stripped on save. <a href="https://github.com/creativar/blurrr" target="_blank" rel="noopener noreferrer">View source</a></div>
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: loaded ? 'block' : 'none', touchAction: 'none' }}
          onMouseDown={onMouseDown} onMouseMove={onCanvasMouseMove}
          onTouchStart={(e) => { e.preventDefault(); onMouseDown(e.touches[0]) }}
          onTouchMove={(e) => { e.preventDefault() }}
        />
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onClick={(e) => { e.target.value = '' }} onChange={(e) => { if (e.target.files[0]) loadFile(e.target.files[0]) }} />

      {showAbout && (
        <div className="modal-overlay" onClick={() => setShowAbout(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="logo">blurrr</span>
              <button className="modal-close" onClick={() => setShowAbout(false)}>&times;</button>
            </div>
            <p className="modal-tagline">A fast, private image redaction tool.</p>
            <p>Blur or redact sensitive areas in your images with a simple drag. Choose from multiple shapes and adjust blur strength to get the result you need.</p>
            <div className="modal-section">
              <h3>Privacy</h3>
              <p>blurrr does not send your images to a server. All image processing happens locally in your browser. Your files never leave your device.</p>
              <p>Saved images have all EXIF metadata (location, camera info, timestamps) automatically stripped.</p>
            </div>
            <div className="modal-section">
              <h3>How does it work?</h3>
              <ol>
                <li>You select an area on your image</li>
                <li>The selected region is isolated</li>
                <li>A Gaussian blur averages each pixel with its neighbours, smearing out detail</li>
                <li>The area is replaced with the blurred result</li>
              </ol>
              <p>In <strong>Redact</strong> mode, the selected area is replaced with solid black for complete removal. Use <strong>Erase</strong> to paint areas white.</p>
            </div>
            <div className="modal-section">
              <h3>How to use</h3>
              <ol>
                <li>Open, drop, or paste (<strong>Ctrl+V</strong>) an image</li>
                <li>Pick a mode: <strong>Blur</strong>, <strong>Redact</strong>, or <strong>Erase</strong></li>
                <li>Pick a shape and drag to create regions</li>
                <li>Use <strong>Detect Faces</strong> or <strong>Detect Emails</strong> to auto-find sensitive areas</li>
                <li>Click a region to select it — drag to move, use handles to resize, or click the red button to delete</li>
                <li>Hold <strong>Alt</strong> to preview the original image</li>
                <li>Save the result (EXIF metadata is automatically removed)</li>
              </ol>
            </div>
            <div className="modal-section">
              <h3>Source code</h3>
              <p>blurrr is open source. <a href="https://github.com/creativar/blurrr" target="_blank" rel="noopener noreferrer">View the source on GitHub</a> to verify how your images are handled.</p>
            </div>
            <div className="modal-footer">
              <button className="primary" onClick={() => setShowAbout(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
