import React, { useState } from 'react'

/**
 * TC-161 — รายการฉบับก่อนหน้าของแบบ คบ. หนึ่งฉบับ ใช้ร่วมกันได้ทุกแบบที่มีกลไกเวอร์ชัน
 * (คบ.3 / คบ.6 / คบ.8 / คบ.14 / คบ.15) แสดงเลขฉบับ วันเวลา ผู้ดำเนินการ และสถานะของฉบับนั้น
 */
export interface VersionHistoryEntry {
  version: number
  /** วันเวลาที่ปิดฉบับนี้ (ถูกส่งกลับ/ถูกแทนที่ด้วยฉบับใหม่) */
  at?: string
  /** ผู้ดำเนินการที่ทำให้ฉบับนี้ปิดลง (เช่น ผู้สั่งตีกลับ) */
  by?: string
  status: 'signed' | 'returned' | 'submitted'
  /** เหตุผล/หมายเหตุของฉบับนั้น เช่น เหตุผลที่ถูกตีกลับ */
  note?: string
}

const STATUS_LABEL: Record<VersionHistoryEntry['status'], string> = {
  signed: 'ลงนามแล้ว',
  returned: 'ถูกส่งกลับแก้ไข',
  submitted: 'เสนอแล้ว',
}

/**
 * แถบสรุป "เก็บฉบับเดิมไว้ N ฉบับ — ไม่แก้ทับ" พร้อมประวัติเวอร์ชันแบบเปิด/ปิดได้
 * และกล่องแจ้งล็อกเมื่อฉบับปัจจุบันถูกลงนามแล้ว (ห้ามแก้ทับ ต้องสร้างเวอร์ชันใหม่)
 */
export const VersionHistory: React.FC<{
  code: string
  currentVersion: number
  entries: VersionHistoryEntry[]
  locked?: boolean
  lockedBy?: string
  lockedNote?: string
  testId?: string
}> = ({ code, currentVersion, entries, locked, lockedBy, lockedNote, testId }) => {
  const [open, setOpen] = useState(false)
  const previousCount = entries.length
  const tid = testId || `${code}-version-history`

  if (previousCount === 0 && !locked) return null

  return (
    <div className="space-y-2">
      {locked && (
        <div
          data-testid={`${tid}-locked`}
          className="ws-callout text-[0.85rem] leading-relaxed space-y-1"
        >
          <div>
            <i className="fa-solid fa-lock mr-1.5" />
            <strong>ฉบับลงนามถูกล็อก — แก้ทับไม่ได้</strong>
            {lockedBy ? ` · ลงนามโดย ${lockedBy}` : ''}
          </div>
          {lockedNote && <div className="text-[0.85rem] text-amber-800">{lockedNote}</div>}
          <div className="text-[0.85rem] text-amber-800">
            แก้ไขต่อได้ก็ต่อเมื่อถูกส่งกลับและสร้างเป็นเวอร์ชันใหม่เท่านั้น ฉบับนี้ยังอยู่ครบไม่ถูกแก้ทับ
          </div>
        </div>
      )}

      {previousCount > 0 && (
        <div
          data-testid={tid}
          className="ws-readonly text-[0.85rem] text-slate-600 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <i className="fa-solid fa-clock-rotate-left mr-1.5" />
              เก็บฉบับเดิมไว้ {previousCount} ฉบับ — ไม่แก้ทับ
            </span>
            <button
              type="button"
              data-testid={`${tid}-toggle`}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex min-h-[38px] items-center rounded-lg border border-[#9aabba] bg-white px-3 py-1 text-[0.85rem] font-semibold text-navy transition hover:bg-slate-50"
            >
              {open ? 'ซ่อนประวัติเวอร์ชัน' : 'ดูประวัติเวอร์ชัน'}
            </button>
          </div>

          {open && (
            <ol className="space-y-1.5">
              {entries.map((entry) => (
                <li
                  key={entry.version}
                  data-testid={`${tid}-item-${entry.version}`}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 leading-relaxed"
                >
                  <strong className="text-navy-deep">ฉบับที่ {entry.version}</strong>
                  <span className="text-slate-400"> · </span>
                  <span>{STATUS_LABEL[entry.status]}</span>
                  {entry.at && (
                    <>
                      <span className="text-slate-400"> · </span>
                      <span>{entry.at}</span>
                    </>
                  )}
                  {entry.by && (
                    <>
                      <span className="text-slate-400"> · </span>
                      <span>{entry.by}</span>
                    </>
                  )}
                  {entry.note && <div className="text-slate-500">{entry.note}</div>}
                </li>
              ))}
              <li className="rounded-lg border border-blue-200 bg-blue-50/60 px-2.5 py-2 font-semibold text-blue-900">
                ฉบับปัจจุบัน (เวอร์ชัน {currentVersion})
              </li>
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
