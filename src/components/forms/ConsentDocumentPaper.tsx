import React, { useLayoutEffect, useRef, useState } from 'react'
import { FORMS_CATALOG } from '../../lib/constants'
import { ConsentDocumentSnapshot } from '../../lib/consentSigning'
import { CaseItem } from '../../types/case'
import { getFormPages } from './paper/formPages'
import { PaperContext, SignatureRecord } from './paper/PaperPrimitives'

const A4_WIDTH = 794

/**
 * กระดาษ คบ.1 ของ "ฉบับที่ส่งให้ลงชื่อ" — เรนเดอร์จาก snapshot เท่านั้น ไม่อ่านแฟ้มคำร้อง
 * ใช้ทั้งหน้าลงชื่อของผู้ขอคุ้มครอง (ต้องไม่เห็นข้อมูลอื่นของสำนวน) และหน้าดูฉบับที่ลงชื่อของเจ้าหน้าที่
 * ข้อความบนกระดาษคือข้อความเดิมของแบบฟอร์ม (formPages) ไม่มีการเขียนข้อความกฎหมายเพิ่ม
 */
export const ConsentDocumentPaper: React.FC<{
  snapshot: ConsentDocumentSnapshot
  applicantSign?: SignatureRecord
  /** หน้าเดียวที่จะแสดง (1-based) — ไม่ระบุ = แสดงทุกหน้าต่อกัน */
  page?: number
  /** false = แสดงขนาดจริง (เลื่อนซ้าย-ขวาได้) สำหรับอ่านบนจอเล็ก */
  fit?: boolean
}> = ({ snapshot, applicantSign, page, fit = true }) => {
  const formMeta = FORMS_CATALOG.find((f) => f.n === 1) || FORMS_CATALOG[0]
  const pages = getFormPages(1)
  const draft = snapshot.draft || {}
  /** เฉพาะค่าที่หัวกระดาษ คบ.1 ใช้เติมช่องว่าง — ไม่ใช่แฟ้มคำร้องจริง */
  const caseStub = {
    person: snapshot.fallback.person,
    mainCaseNo: snapshot.fallback.mainCaseNo,
    assignedOfficer: snapshot.fallback.assignedOfficer,
  } as unknown as CaseItem
  const signatures: Record<string, SignatureRecord> = {}
  if (applicantSign) signatures['kb1-applicant'] = applicantSign
  if (snapshot.officerSign) signatures['kb1-officer'] = snapshot.officerSign

  const val = (key: string, fallback = '') => {
    const v = draft[key]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v)
    return fallback
  }
  const ctx: PaperContext = { formMeta, draft, caseItem: caseStub, relatedPersons: snapshot.relatedPersons || [], signatures, val }

  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const inner = stage.clientWidth
      setScale(inner > 0 ? Math.min(1, inner / A4_WIDTH) : 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const shown = page ? [page] : pages.map((_, i) => i + 1)
  const zoom = fit ? scale : 1

  return (
    <div ref={stageRef} className={`w-full space-y-3 ${fit ? '' : 'overflow-x-auto'}`}>
      {shown.map((n) => (
        <div
          key={n}
          data-testid={`consent-paper-page-${n}`}
          className="paper-a4 relative rounded-sm bg-white px-14 pt-8 pb-16 text-[#111827] leading-relaxed shadow-md text-[14px] font-sarabun select-text"
          style={{ width: A4_WIDTH, zoom }}
        >
          <div className="text-center font-black text-rose-600 text-xl leading-none mb-3">ลับ</div>
          <div>{(pages[n - 1] || pages[0])(ctx)}</div>
          <div className="absolute bottom-4 left-0 right-0 text-center font-black text-rose-600 text-xl">ลับ</div>
        </div>
      ))}
    </div>
  )
}

export const KB1_PAGE_COUNT = getFormPages(1).length
