import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

/** กล่องบนแผนที่ย่อ (พิกัดเดียวกับเนื้อผัง) */
export interface MinimapItem {
    x: number
    y: number
    w: number
    h: number
    fill: string
}

interface View {
    k: number
    x: number
    y: number
}

const MIN_K = 0.15
const MAX_K = 3
const MINIMAP_MAX_W = 180
const MINIMAP_MAX_H = 150
/** ลากเกินระยะนี้ (px) ถือว่าเป็นการเลื่อนผัง ไม่ใช่การกด */
const DRAG_THRESHOLD = 4

const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k))

interface ZoomViewportProps {
    contentWidth: number
    contentHeight: number
    /** เปลี่ยนค่าเมื่อเปลี่ยนเนื้อผัง เพื่อจัดให้พอดีจอใหม่ */
    resetKey: string
    minimap: MinimapItem[]
    /** มุมซ้ายบน เช่น breadcrumb ของผัง */
    toolbarLeft?: React.ReactNode
    /** มุมซ้ายล่าง เช่น คำอธิบายสี */
    legend?: React.ReactNode
    /** แผงลอยด้านขวา (ไม่ซูมตามผัง) */
    panel?: React.ReactNode
    children: React.ReactNode
}

/**
 * กรอบดูผังที่ซูม/เลื่อน/เต็มจอได้
 * - ลากเพื่อเลื่อน · Ctrl/⌘ + ล้อเมาส์ หรือบีบนิ้ว (trackpad/จอสัมผัส) เพื่อซูม · ล้อเมาส์เปล่าเลื่อนขึ้นลง
 * - ปุ่มลัดเมื่อโฟกัสอยู่ในผัง: + / − ซูม, 0 พอดีจอ, 1 ขนาดจริง, F เต็มจอ
 */
export const ZoomViewport: React.FC<ZoomViewportProps> = ({
    contentWidth,
    contentHeight,
    resetKey,
    minimap,
    toolbarLeft,
    legend,
    panel,
    children,
}) => {
    const frameRef = useRef<HTMLDivElement>(null)
    const viewportRef = useRef<HTMLDivElement>(null)
    const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 })
    const viewRef = useRef(view)
    viewRef.current = view
    const [size, setSize] = useState({ w: 0, h: 0 })
    const [fullscreen, setFullscreen] = useState(false)
    const [showMinimap, setShowMinimap] = useState(true)
    const [panning, setPanning] = useState(false)

    const fit = useCallback(() => {
        const el = viewportRef.current
        if (!el) return
        const w = el.clientWidth
        const h = el.clientHeight
        const k = clampK(Math.min(w / contentWidth, h / contentHeight) * 0.94)
        setView({ k, x: (w - contentWidth * k) / 2, y: Math.max(12, (h - contentHeight * k) / 2) })
    }, [contentWidth, contentHeight])

    const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
        const el = viewportRef.current
        if (!el) return
        const px = cx ?? el.clientWidth / 2
        const py = cy ?? el.clientHeight / 2
        setView((v) => {
            const k = clampK(v.k * factor)
            return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k }
        })
    }, [])

    const actualSize = () => {
        const el = viewportRef.current
        if (!el) return
        zoomAt(1 / viewRef.current.k)
    }

    // จัดพอดีจอเมื่อเปลี่ยนผัง
    useLayoutEffect(fit, [resetKey, fit])

    // ติดตามขนาดกรอบ (ใช้กับแผนที่ย่อ) และจัดพอดีจอใหม่เมื่อเข้า/ออกเต็มจอ
    useEffect(() => {
        const el = viewportRef.current
        if (!el) return
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
        ro.observe(el)
        return () => ro.disconnect()
    }, [])
    useEffect(() => {
        const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current)
        document.addEventListener('fullscreenchange', onChange)
        return () => document.removeEventListener('fullscreenchange', onChange)
    }, [])
    useLayoutEffect(fit, [fullscreen, fit])

    // wheel ต้องเป็น non-passive จึงจะกัน browser ซูมทั้งหน้าได้
    useEffect(() => {
        const el = viewportRef.current
        if (!el) return
        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            const rect = el.getBoundingClientRect()
            if (e.ctrlKey || e.metaKey) {
                zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top)
            } else {
                setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
            }
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [zoomAt])

    // ลากเลื่อน + บีบนิ้วสองนิ้ว
    const pointers = useRef(new Map<number, { x: number; y: number }>())
    const drag = useRef<{ startX: number; startY: number; view: View; moved: boolean; pinchDist?: number } | null>(null)
    const suppressClick = useRef(false)

    const onPointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const pts = [...pointers.current.values()]
        drag.current = {
            startX: e.clientX,
            startY: e.clientY,
            view: viewRef.current,
            moved: false,
            pinchDist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : undefined,
        }
    }

    const onPointerMove = (e: React.PointerEvent) => {
        if (!pointers.current.has(e.pointerId) || !drag.current) return
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const d = drag.current
        const pts = [...pointers.current.values()]
        if (pts.length === 2 && d.pinchDist) {
            const rect = viewportRef.current!.getBoundingClientRect()
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
            const cx = (pts[0].x + pts[1].x) / 2 - rect.left
            const cy = (pts[0].y + pts[1].y) / 2 - rect.top
            const k = clampK(d.view.k * (dist / d.pinchDist))
            setView({ k, x: cx - ((cx - d.view.x) * k) / d.view.k, y: cy - ((cy - d.view.y) * k) / d.view.k })
            d.moved = true
            return
        }
        const dx = e.clientX - d.startX
        const dy = e.clientY - d.startY
        if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        if (!d.moved) {
            d.moved = true
            setPanning(true)
            // จับ pointer เฉพาะเมื่อเริ่มลากจริง ไม่เช่นนั้น click บนกล่องจะไม่ถึงปุ่ม
            viewportRef.current?.setPointerCapture(e.pointerId)
        }
        setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy })
    }

    const onPointerUp = (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId)
        if (drag.current?.moved) suppressClick.current = true
        if (pointers.current.size === 0) {
            drag.current = null
            setPanning(false)
        }
    }

    const onClickCapture = (e: React.MouseEvent) => {
        if (!suppressClick.current) return
        suppressClick.current = false
        e.stopPropagation()
        e.preventDefault()
    }

    const toggleFullscreen = () => {
        const el = frameRef.current
        if (!el) return
        if (document.fullscreenElement) void document.exitFullscreen()
        else if (el.requestFullscreen) void el.requestFullscreen()
        // browser ที่ไม่มี Fullscreen API ใช้ CSS ขยายเต็มหน้าต่างแทน
        else setFullscreen((f) => !f)
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        if (e.key === '+' || e.key === '=') zoomAt(1.2)
        else if (e.key === '-' || e.key === '_') zoomAt(1 / 1.2)
        else if (e.key === '0') fit()
        else if (e.key === '1') actualSize()
        else if (e.key === 'f' || e.key === 'F') toggleFullscreen()
        else return
        e.preventDefault()
    }

    // แผนที่ย่อ: สเกลให้ทั้งผังพอดีกรอบเล็ก แล้ววาดกรอบส่วนที่มองเห็นอยู่
    const m = Math.min(MINIMAP_MAX_W / contentWidth, MINIMAP_MAX_H / contentHeight)
    const mw = contentWidth * m
    const mh = contentHeight * m
    const visible = {
        x: (-view.x / view.k) * m,
        y: (-view.y / view.k) * m,
        w: (size.w / view.k) * m,
        h: (size.h / view.k) * m,
    }
    const minimapDrag = useRef(false)
    const centerOnMinimap = (e: React.PointerEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const cx = (e.clientX - rect.left) / m
        const cy = (e.clientY - rect.top) / m
        setView((v) => ({ ...v, x: size.w / 2 - cx * v.k, y: size.h / 2 - cy * v.k }))
    }

    return (
        <div
            ref={frameRef}
            className={cn(
                'relative overflow-hidden border border-line bg-soft',
                fullscreen ? 'fixed inset-0 z-[100] h-screen w-screen rounded-none' : 'rounded-xl shadow-card'
            )}
            style={fullscreen ? undefined : { height: 'max(560px, calc(100vh - 220px))' }}
        >
            <div
                ref={viewportRef}
                tabIndex={0}
                role="application"
                aria-label="ผังขั้นตอน — ลากเพื่อเลื่อน Ctrl + ล้อเมาส์เพื่อซูม"
                onKeyDown={onKeyDown}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClickCapture={onClickCapture}
                className={cn('absolute inset-0 touch-none select-none outline-none', panning ? 'cursor-grabbing' : 'cursor-grab')}
                style={{
                    backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                    backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
                    backgroundPosition: `${view.x}px ${view.y}px`,
                }}
            >
                <div
                    className="absolute left-0 top-0 origin-top-left"
                    style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: contentWidth, height: contentHeight }}
                >
                    {children}
                </div>
            </div>

            {toolbarLeft && <div className="pointer-events-none absolute left-3 top-3 z-40 max-w-[60%] [&>*]:pointer-events-auto">{toolbarLeft}</div>}

            <div className="absolute right-3 top-3 z-40 flex items-center gap-1 rounded-xl border border-line bg-white/95 p-1 shadow-card">
                <ToolButton label="ซูมออก (−)" icon="fa-minus" onClick={() => zoomAt(1 / 1.2)} />
                <button
                    type="button"
                    onClick={actualSize}
                    title="ขนาดจริง (1)"
                    className="min-h-[38px] w-14 rounded-lg px-1 py-1 text-center font-mono text-[0.8rem] text-ink hover:bg-soft"
                >
                    {Math.round(view.k * 100)}%
                </button>
                <ToolButton label="ซูมเข้า (+)" icon="fa-plus" onClick={() => zoomAt(1.2)} />
                <span className="mx-0.5 h-5 w-px bg-line" />
                <ToolButton label="พอดีจอ (0)" icon="fa-expand" onClick={fit} />
                <ToolButton
                    label="แผนที่ย่อ"
                    icon="fa-map"
                    active={showMinimap}
                    onClick={() => setShowMinimap((s) => !s)}
                />
                <ToolButton
                    label={fullscreen ? 'ออกจากเต็มจอ (F / Esc)' : 'เต็มจอ (F)'}
                    icon={fullscreen ? 'fa-compress' : 'fa-up-right-and-down-left-from-center'}
                    onClick={toggleFullscreen}
                />
            </div>

            {panel && (
                <div className="absolute bottom-3 right-3 top-16 z-40 flex w-[22rem] max-w-[calc(100%-1.5rem)] flex-col">{panel}</div>
            )}

            {legend && (
                <div className="absolute bottom-3 left-3 z-40 max-w-[calc(100%-1.5rem)] rounded-xl border border-line bg-white/95 px-3 py-2 shadow-card">
                    {legend}
                </div>
            )}

            {showMinimap && !panel && (
                <div className="absolute bottom-3 right-3 z-40 rounded-xl border border-line bg-white/95 p-1.5 shadow-card">
                    <svg
                        width={mw}
                        height={mh}
                        className="block cursor-pointer touch-none"
                        aria-label="แผนที่ย่อ — กดหรือลากเพื่อย้ายมุมมอง"
                        onPointerDown={(e) => {
                            minimapDrag.current = true
                            e.currentTarget.setPointerCapture(e.pointerId)
                            centerOnMinimap(e)
                        }}
                        onPointerMove={(e) => minimapDrag.current && centerOnMinimap(e)}
                        onPointerUp={() => (minimapDrag.current = false)}
                    >
                        <rect width={mw} height={mh} fill="#f8fafc" />
                        {minimap.map((it, i) => (
                            <rect key={i} x={it.x * m} y={it.y * m} width={Math.max(1.5, it.w * m)} height={Math.max(1.5, it.h * m)} fill={it.fill} rx={1} />
                        ))}
                        <rect
                            x={visible.x}
                            y={visible.y}
                            width={visible.w}
                            height={visible.h}
                            fill="rgba(22,85,143,0.08)"
                            stroke="#16558f"
                            strokeWidth={1.5}
                        />
                    </svg>
                </div>
            )}
        </div>
    )
}

const ToolButton: React.FC<{ label: string; icon: string; onClick: () => void; active?: boolean }> = ({ label, icon, onClick, active }) => (
    <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        aria-pressed={active}
        className={cn(
            'flex h-[38px] w-[38px] items-center justify-center rounded-lg text-[0.88rem] hover:bg-soft',
            active ? 'bg-blue-soft text-blue' : 'text-ink'
        )}
    >
        <i className={cn('fa-solid', icon)} />
    </button>
)
