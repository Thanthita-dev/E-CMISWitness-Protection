import React from 'react'

/** แท็บที่ขอเปิดตรงจาก ?tab= ของหน้าแบบฟอร์ม — ปัจจุบันมีเฉพาะ ทะเบียนสารบรรณ */
export type FormInitialTab = 'saraban' | undefined

export const FormInitialTabContext = React.createContext<FormInitialTab>(undefined)
