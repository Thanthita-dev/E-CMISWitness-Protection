import React, { useContext, useEffect, useRef } from 'react'
import { create } from 'zustand'

export const PAPER_SIGN_BUTTON_CLASS = 'inline-flex min-h-[26px] items-center gap-1 whitespace-nowrap rounded-full border border-[#5b84c4] bg-[#f3f7fe]/95 px-2.5 py-0.5 font-sans text-[12px] font-semibold leading-tight text-[#1f4f8f] shadow-[0_1px_2px_rgba(15,35,70,0.12)] transition hover:bg-[#e3edfb] disabled:cursor-not-allowed disabled:opacity-60'

/**
 * ปุ่ม "ลงนาม" บนเส้นลงชื่อของกระดาษ (แบบเดียวกับหน้าเอกสารงานหมายจับ)
 * ส่วนที่ดูแลการลงนามของแต่ละแบบ (เช่น Kb3SignatureActions) ลงทะเบียนช่องที่ผู้ใช้ปัจจุบันลงนามได้ไว้ที่นี่
 * กระดาษอ่านทะเบียนนี้แล้ววางปุ่มบนเส้นลงชื่อของช่องเดียวกัน — กดแล้วเปิดหน้าต่างลงนามเดิมของแบบนั้น
 */
export interface PaperSignHandler {
  onSign: () => void
  /** ปุ่มบนกระดาษ — ไม่ระบุ = "ลงนาม" */
  label?: string
  disabled?: boolean
  /** เหตุผลที่ยังลงนามไม่ได้ (แสดงเป็นป้ายรอแทนปุ่ม) */
  waitingLabel?: string
}

interface PaperSignState {
  slots: Record<string, PaperSignHandler>
  setSlot: (key: string, handler?: PaperSignHandler) => void
}

export const usePaperSignStore = create<PaperSignState>((set) => ({
  slots: {},
  setSlot: (key, handler) =>
    set((state) => {
      const slots = { ...state.slots }
      if (handler) slots[key] = handler
      else delete slots[key]
      return { slots }
    }),
}))

/** ลงทะเบียนปุ่มลงนามบนกระดาษของช่อง key — handler = null คือช่องนี้ลงนามไม่ได้ในขณะนี้ */
export function usePaperSignSlot(key: string | undefined, handler: PaperSignHandler | null) {
  const latest = useRef(handler)
  latest.current = handler
  const setSlot = usePaperSignStore((s) => s.setSlot)
  const active = Boolean(handler)
  const { label, disabled, waitingLabel } = handler || {}
  useEffect(() => {
    if (!key || !active) return
    setSlot(key, { onSign: () => latest.current?.onSign(), label, disabled, waitingLabel })
    return () => setSlot(key, undefined)
  }, [key, active, label, disabled, waitingLabel, setSlot])
}

/** ลงทะเบียนปุ่มบนกระดาษหลายช่องจากรายการ (เช่น KB3_SIGN_SLOTS) — หนึ่งคอมโพเนนต์ต่อหนึ่งช่อง */
export const PaperSignRegistration: React.FC<{ signKey: string; handler: PaperSignHandler | null }> = ({ signKey, handler }) => {
  usePaperSignSlot(signKey, handler)
  return null
}

/**
 * ลงนามช่องที่ยังไม่มีขั้นลงนามเฉพาะของแบบ — ใช้หน้าต่างลงนามกลาง แล้วเก็บลายมือชื่อในร่างของแบบนั้น
 * กระดาษส่งให้เฉพาะเมื่อกรอกบนเอกสารได้ (แก้ไขได้ตามสิทธิ์และสถานะ)
 */
export interface PaperSignFallback {
  /** role/defaultName มาจากเส้นลงชื่อบนกระดาษ (เช่น "ผู้ยื่นคำร้อง", ชื่อพยาน) */
  onSign: (key: string, slot: { role?: string; defaultName?: string }) => void
}

/**
 * ช่องที่ยังไม่มีขั้นลงนามเฉพาะ และไม่ผูกลำดับชั้นการอนุมัติ — ลงนามจากกระดาษด้วยหน้าต่างลงนามกลางได้
 * ช่องอื่น (เช่น ผอ. ของ คบ.4, เลขาธิการของ คบ.16) ลงนามได้เฉพาะเมื่อขั้นลงนามของแบบเปิดให้ (usePaperSignSlot)
 */
export const PAPER_SIGN_FALLBACK_KEYS = ['kb6-officer', 'kb7-applicant', 'kb7-officer', 'kb8-witness', 'kb11-attest1', 'kb11-attest2', 'kb12-attest-sender', 'kb12-attest-receiver', 'kb14-witness']

/** เปิดปุ่มบนกระดาษเฉพาะกระดาษบนจอ (ชุดพิมพ์ไม่มีปุ่ม) */
export const PaperSignUiContext = React.createContext<{ fallback?: PaperSignFallback } | null>(null)

/** ปุ่มลงนาม/ป้ายรอ ซ้อนบนเส้นลงชื่อ — ไม่ดันแบบเอกสาร และไม่พิมพ์ */
export const PaperSignTrigger: React.FC<{ signKey?: string; signed?: boolean; role?: string; defaultName?: string }> = ({ signKey, signed, role, defaultName }) => {
  const ui = useContext(PaperSignUiContext)
  const handler = usePaperSignStore((s) => (signKey ? s.slots[signKey] : undefined))
  if (!ui || !signKey) return null
  const fallback = !handler && ui.fallback && PAPER_SIGN_FALLBACK_KEYS.includes(signKey) ? ui.fallback : undefined
  if (!handler && !fallback) return null
  // ลงนามแล้ว: คลิกลายมือชื่อบนกระดาษเพื่อลงนามใหม่ (เฉพาะช่องที่ขั้นลงนามของแบบยังเปิดให้)
  if (signed) {
    if (!handler || handler.disabled || handler.waitingLabel) return null
    return (
      <button type="button" data-testid={`paper-resign-${signKey}`} title="ลงนามใหม่" aria-label="ลงนามใหม่" onClick={handler.onSign}
        className="absolute inset-0 z-[2] cursor-pointer rounded border border-transparent hover:border-[#5b84c4] hover:bg-[#f3f7fe]/40 print:hidden" />
    )
  }
  if (handler?.waitingLabel && !signed) {
    return (
      <span className="paper-sign-slot print:hidden">
        <span className="rounded-full bg-[#eef2f7]/95 px-2 py-0.5 text-[11px] font-medium leading-snug text-[#526075]">{handler.waitingLabel}</span>
      </span>
    )
  }
  const onClick = () => (handler ? handler.onSign() : fallback?.onSign(signKey, { role, defaultName }))
  return (
    <span className="paper-sign-slot print:hidden">
      <button
        type="button"
        data-testid={`paper-sign-${signKey}`}
        disabled={handler?.disabled}
        onClick={onClick}
        className={PAPER_SIGN_BUTTON_CLASS}
      >
        <i className="fa-solid fa-pen text-[10px]" aria-hidden="true" />
        {handler?.label || 'ลงนาม'}
      </button>
    </span>
  )
}
