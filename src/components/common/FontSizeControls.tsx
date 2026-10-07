import React from 'react'

/** คีย์และขั้นเดียวกับ ก4 (activity4-workspace.js) เพื่อให้ค่าที่ตั้งใช้ร่วมกันทั้ง Hub */
export const FONT_SIZE_STORAGE_KEY = 'ecmis-a4-font-size-v2'
const DEFAULT_STEP = 1

function readStep(): number {
  try {
    const raw = localStorage.getItem(FONT_SIZE_STORAGE_KEY)
    return raw === null ? DEFAULT_STEP : Math.max(-1, Math.min(3, Number(raw) || 0))
  } catch {
    return DEFAULT_STEP
  }
}

function applyStep(step: number): number {
  const normalized = Math.max(-1, Math.min(3, step))
  document.documentElement.style.fontSize = `${16 + normalized}px`
  try {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(normalized))
  } catch {
    /* localStorage ใช้ไม่ได้ — ปรับเฉพาะหน้านี้ */
  }
  return normalized
}

/** ปุ่ม A−/A/A+ ปรับขนาดตัวอักษรทั้งหน้า (16+step px, ค่าเริ่มต้น 17px = 106%) */
export const FontSizeControls: React.FC = () => {
  const [step, setStep] = React.useState(() => readStep())
  React.useEffect(() => {
    applyStep(step)
  }, [step])
  return (
    <div className="ws-font-controls shrink-0" role="group" aria-label="ปรับขนาดตัวอักษร">
      <span className="max-[1535px]:hidden">ขนาดตัวอักษร</span>
      <button type="button" aria-label="ลดขนาดตัวอักษร" onClick={() => setStep((s) => Math.max(-1, s - 1))}>
        A−
      </button>
      <button
        type="button"
        aria-label="ใช้ขนาดตัวอักษรปกติ"
        className={step === DEFAULT_STEP ? 'active' : ''}
        onClick={() => setStep(DEFAULT_STEP)}
      >
        A
      </button>
      <button type="button" aria-label="เพิ่มขนาดตัวอักษร" onClick={() => setStep((s) => Math.min(3, s + 1))}>
        A+
      </button>
      <output aria-live="polite" className="max-[1535px]:hidden">
        {Math.round(((16 + step) / 16) * 100)}%
      </output>
    </div>
  )
}
