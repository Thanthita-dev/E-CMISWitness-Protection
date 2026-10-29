import React, { useContext } from 'react'
import { createPortal } from 'react-dom'

/**
 * รูปแบบที่แบบกรอกถูกแสดง
 * - full: แบบกรอกเต็ม (โหมด "กรอกผ่านแบบฟอร์ม")
 * - aside: โหมด "กรอกบนเอกสาร" (กระดาษเต็มหน้า) — แบบกรอกถูกซ่อนแต่ยังทำงาน (ลงทะเบียนปุ่มลงนามบนกระดาษ)
 *   ปุ่มท้ายแบบ (บันทึก/ลงนาม) ยกไปแถบดำเนินการล่างของหน้า ผ่าน DocActions
 */
export type EditorView = 'full' | 'aside'

export const EditorViewContext = React.createContext<EditorView>('full')

export const useEditorView = () => useContext(EditorViewContext)

/** จุดวางเนื้อหาที่ยกไปแสดงในแผงข้างกระดาษ (EditorShell กำหนดให้) */
export const AsideSlotContext = React.createContext<HTMLElement | null>(null)

/** จุดวางปุ่มท้ายแบบในแถบดำเนินการล่างของหน้า (หน้าแบบฟอร์มกำหนดให้) */
export const ActionBarSlotContext = React.createContext<HTMLElement | null>(null)

/** ปุ่มท้ายแบบ (บันทึก/ลงนาม) — แบบกรอกเต็ม = ที่เดิม · กรอกบนเอกสาร = แถบดำเนินการล่างของหน้า */
export const DocActions: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const view = useEditorView()
  const slot = useContext(ActionBarSlotContext)
  if (view === 'full') return <>{children}</>
  return slot ? createPortal(children, slot) : null
}

/**
 * ส่วนของแบบกรอกที่ต้องใช้ได้ในโหมดกรอกบนเอกสารด้วย เช่น ปุ่มลงนาม
 * แบบกรอกเต็ม = แสดงตรงที่อยู่เดิม · แผงข้างกระดาษ = ยกไปแสดงในแผงข้างกระดาษ
 */
export const DocAside: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const view = useEditorView()
  const slot = useContext(AsideSlotContext)
  if (view === 'full') return <>{children}</>
  // แท็บอื่นของแผงเปิดอยู่: คงไว้ (ซ่อน) เพื่อให้ปุ่มลงนามบนกระดาษยังผูกกับขั้นลงนามของแบบ
  return slot ? createPortal(children, slot) : <div hidden>{children}</div>
}
