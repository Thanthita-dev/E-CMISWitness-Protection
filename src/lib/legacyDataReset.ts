/**
 * ล้างข้อมูลเก่าใน localStorage ของกิจกรรมที่ 6 เมื่อเปลี่ยนรุ่นข้อมูล
 * เบราว์เซอร์ที่ยังไม่มีเครื่องหมายรุ่นปัจจุบัน (ผู้ใช้ก่อนมีหน้าเข้าสู่ระบบ) จะถูกล้างข้อมูลทั้งหมด
 * และต้องเข้าสู่ระบบใหม่ — ระบบเริ่มแบบว่างเปล่า (ไม่มีเรื่องตั้งต้น)
 *
 * ต้องรันก่อน store ใด ๆ ถูกสร้าง (import เป็นบรรทัดแรกของ main.tsx)
 * เครื่องหมายรุ่นไม่ขึ้นต้นด้วย ecmis- เพื่อไม่ให้หน้าโหลดสถานะสาธิต (/mock-state) ล้างทิ้ง
 */
export const WP_DATA_VERSION_KEY = 'wp-data-version'
export const WP_DATA_VERSION = '3'

/** key ที่ store ของกิจกรรมที่ 6 persist ไว้ — ไม่แตะ key ของกิจกรรมอื่นหรือค่าขนาดตัวอักษรที่ใช้ร่วมกัน */
export const WP_PERSIST_KEYS = [
  'ecmis-auth-storage',
  'ecmis-case-storage-v2',
  'ecmis-form-draft-storage-v2',
  'ecmis-notifications-storage',
  'ecmis-audit-storage',
  'ecmis-consent-signing-storage-v1',
  'ecmis-signature-link-storage-v1',
]

/** แจ้งหน้าเข้าสู่ระบบว่าเพิ่งล้างข้อมูลเก่า (แสดงครั้งเดียวในแท็บนี้) */
export const WP_DATA_RESET_NOTICE_KEY = 'wp-data-reset-notice'

/** คืน true เมื่อมีการล้างข้อมูลเก่า */
export function resetLegacyWitnessProtectionData(storage: Storage, session?: Storage): boolean {
  if (storage.getItem(WP_DATA_VERSION_KEY) === WP_DATA_VERSION) return false
  const hadData = WP_PERSIST_KEYS.some((key) => storage.getItem(key) !== null)
  WP_PERSIST_KEYS.forEach((key) => storage.removeItem(key))
  storage.setItem(WP_DATA_VERSION_KEY, WP_DATA_VERSION)
  if (hadData && session) session.setItem(WP_DATA_RESET_NOTICE_KEY, '1')
  return hadData
}

try {
  if (typeof window !== 'undefined') resetLegacyWitnessProtectionData(window.localStorage, window.sessionStorage)
} catch {
  /* เข้าถึง storage ไม่ได้ (เช่น private mode) ก็ข้าม */
}
