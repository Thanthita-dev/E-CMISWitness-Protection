import React from 'react'
import { formatThaiDate } from '../../lib/utils'

/**
 * แสดงวันที่ที่เลือกจาก <input type="date"> เป็น วว/ดด/ปปปป พ.ศ. ใต้ช่อง
 * (ตัวเลือกวันที่ของเบราว์เซอร์แสดงเป็น ค.ศ. — ค่าที่เก็บเป็น ISO yyyy-mm-dd)
 */
export const ThaiDateHint: React.FC<{ value?: string; testId?: string; className?: string }> = ({
  value,
  testId,
  className = '',
}) =>
  value ? (
    <span data-testid={testId} className={`block text-xs text-slate-500 mt-0.5 ${className}`}>
      พ.ศ. <strong className="font-semibold text-slate-700">{formatThaiDate(value)}</strong>
    </span>
  ) : null
