import { Button } from './Button'
import React, { useRef, useState } from 'react'
import { resizeImageToDataUrl } from '../../lib/imageResize'

interface SignaturePadProps {
  onChange: (dataUrl: string | undefined) => void
  /** false = วาดด้วยนิ้ว/เมาส์เท่านั้น (หน้าลงชื่อของผู้ขอคุ้มครอง) */
  allowUpload?: boolean
}

/** ขนาดกรอบลายมือชื่อ ใช้ทั้งกับผืนวาดและกับรูปที่อัปโหลด เพื่อให้ผลลัพธ์มีขนาดใกล้เคียงกัน */
const PAD_WIDTH = 440
const PAD_HEIGHT = 130

/** Canvas-based electronic signature capture, shared by the in-app modal and the public signing link page. */
export const SignaturePad: React.FC<SignaturePadProps> = ({ onChange, allowUpload = true }) => {
  const [hasDrawn, setHasDrawn] = useState(false)
  /** เมื่อมีรูปที่อัปโหลด จะแทนที่ผืนวาดทั้งหมด — เลือกได้อย่างใดอย่างหนึ่ง */
  const [uploaded, setUploaded] = useState<string | undefined>(undefined)
  const [uploadError, setUploadError] = useState<string | undefined>(undefined)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const isDrawing = useRef(false)

  const getPoint = (canvas: HTMLCanvasElement, e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    isDrawing.current = true
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getPoint(canvas, e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setHasDrawn(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getPoint(canvas, e)
    ctx.lineTo(x, y)
    ctx.strokeStyle = '#1e3a8a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  const stopDrawing = () => {
    if (!isDrawing.current) return
    isDrawing.current = false
    const canvas = canvasRef.current
    onChange(canvas ? canvas.toDataURL('image/png') : undefined)
  }

  /** ล้างทั้งรูปที่อัปโหลดและรอยวาด แล้วกลับสู่โหมดวาด */
  const clearSignature = () => {
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
    if (fileRef.current) fileRef.current.value = ''
    setHasDrawn(false)
    setUploaded(undefined)
    setUploadError(undefined)
    onChange(undefined)
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await resizeImageToDataUrl(file, PAD_WIDTH, PAD_HEIGHT)
      setUploaded(dataUrl)
      setUploadError(undefined)
      setHasDrawn(false)
      onChange(dataUrl)
    } catch {
      setUploadError('อ่านไฟล์รูปไม่สำเร็จ กรุณาเลือกไฟล์รูปภาพอื่น')
      setUploaded(undefined)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-bold text-slate-700">
          {uploaded ? 'ลายมือชื่อที่อัปโหลด' : 'วาดลายมือชื่ออิเล็กทรอนิกส์'}
        </label>
        <div className="flex items-center gap-3">
          {allowUpload && (
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 text-xs font-semibold text-blue hover:underline"
          >
            <i className="fa-solid fa-upload" />
            อัปโหลดรูป
          </Button>
          )}
          <Button
            type="button"
            onClick={clearSignature}
            className="text-xs font-semibold text-rose-600 hover:underline"
          >
            ล้างลายมือชื่อ
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFile}
        className="hidden"
      />

      <div className="relative rounded-lg border border-dashed border-slate-300 bg-slate-50 overflow-hidden">
        {uploaded ? (
          <img
            src={uploaded}
            alt="ลายมือชื่อที่อัปโหลด"
            className="mx-auto h-[130px] w-auto max-w-full object-contain"
          />
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={PAD_WIDTH}
              height={PAD_HEIGHT}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-[130px] cursor-crosshair touch-none"
            />
            {!hasDrawn && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-slate-400 gap-1.5">
                <i className="fa-solid fa-pen" />
                ลากเมาส์หรือใช้นิ้วสัมผัสเพื่อลงลายมือชื่อที่นี่
              </div>
            )}
          </>
        )}
      </div>

      {uploadError && <p className="mt-1 text-xs font-semibold text-rose-600">{uploadError}</p>}
    </div>
  )
}
