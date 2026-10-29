/**
 * ลายมือชื่อที่ผูกกับบัญชีผู้ลงนาม (แบบเดียวกับหน้าลงนามของงานหมายจับ)
 * - บันทึกไว้ใช้ครั้งต่อไปได้ ไม่ต้องเซ็นใหม่ทุกครั้ง
 * - บัญชีที่ยังไม่เคยบันทึกมีลายมือชื่อจำลอง (Demo) ของบัญชีนั้นให้ใช้สาธิต
 * เก็บใน localStorage ของเบราว์เซอร์นี้ — อ่าน/เขียนไม่ได้ให้ทำงานต่อเหมือนไม่มีลายมือชื่อที่บันทึกไว้
 */
const STORAGE_KEY = 'ecmis-a6-saved-signatures'

export interface SavedSignature {
  image: string
  source: 'drawn' | 'demo'
}

const readAll = (): Record<string, SavedSignature> => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, SavedSignature>
  } catch {
    return {}
  }
}

export const savedSignatureFor = (account: string): SavedSignature | undefined => readAll()[account]

export const saveSignatureFor = (account: string, signature?: SavedSignature) => {
  const all = readAll()
  if (signature) all[account] = signature
  else delete all[account]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* เก็บไม่ได้ (เช่น private mode) — ลงนามครั้งนี้ยังใช้ได้ */
  }
}

const hash = (text: string) => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

const demoCache = new Map<string, string>()

/** ลายมือชื่อจำลองประจำบัญชี — สุ่มจากชื่อบัญชี จึงได้รูปเดิมทุกครั้ง */
export function demoSignature(account: string, width = 440, height = 130): string | undefined {
  if (demoCache.has(account)) return demoCache.get(account)
  if (typeof document === 'undefined') return undefined
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  let seed = hash(account) || 7
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32
  const base = height * (0.6 + rnd() * 0.1)
  const h = 55 + rnd() * 20
  ctx.strokeStyle = '#1e3a8a'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2.6
  ctx.beginPath()
  // ตัวขึ้นต้น
  let x = 40
  ctx.moveTo(x, base)
  ctx.bezierCurveTo(x - 18, base - h, x + 45, base - h * 1.25, x + 40, base - h * 0.45)
  ctx.bezierCurveTo(x + 35, base, x + 5, base - 12, x + 32, base - h * 0.35)
  x += 50
  // ตัวหวัดต่อเนื่อง
  const count = 5 + Math.floor(rnd() * 5)
  const step = (width * 0.62 - x) / count
  for (let i = 0; i < count; i++) {
    const peak = base - h * (0.35 + rnd() * 0.55)
    ctx.quadraticCurveTo(x + step * 0.35, peak, x + step * 0.6, base - 4)
    ctx.quadraticCurveTo(x + step * 0.8, base + 6, x + step, base - h * 0.15)
    x += step
  }
  ctx.lineTo(x + 18, base - h * 0.55)
  ctx.stroke()
  // เส้นขีดใต้
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(48, base + 14)
  ctx.bezierCurveTo(width * 0.3, base + 20, width * 0.5, base + 8, x + 10, base + 12)
  ctx.stroke()
  const url = canvas.toDataURL('image/png')
  demoCache.set(account, url)
  return url
}
