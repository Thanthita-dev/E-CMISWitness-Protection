import React, { useMemo } from 'react'
import { encodeQr } from '../../lib/qrCode'

/** แสดง QR Code เป็น SVG (มีขอบว่าง 4 ช่องตามมาตรฐาน) */
export const QrCodeImage: React.FC<{ value: string; size?: number; label?: string; className?: string }> = ({
  value,
  size = 176,
  label = 'QR Code',
  className = '',
}) => {
  const { path, dim } = useMemo(() => {
    const modules = encodeQr(value)
    const quiet = 4
    let d = ''
    modules.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x + quiet},${y + quiet}h1v1h-1z`
      })
    )
    return { path: d, dim: modules.length + quiet * 2 }
  }, [value])

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={`bg-white ${className}`}
    >
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}
