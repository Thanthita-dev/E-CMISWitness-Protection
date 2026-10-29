import React from 'react'
import { Badge } from './Badge'
import type { CaseItem } from '../../types/case'

type LegacySource = NonNullable<CaseItem['legacySource']>

const legacyTitle = (src: LegacySource): string =>
  [
    `ระบบต้นทาง: ${src.system}`,
    src.runId && `รอบถ่ายโอน: ${src.runId}`,
    src.sourceCaseNo && `เลขสำนวนต้นทาง: ${src.sourceCaseNo}`,
  ]
    .filter(Boolean)
    .join(' | ')

/** ป้ายบอกว่าเรื่องนี้ย้ายมาจากระบบเดิม (ดูอย่างเดียว) — ใช้ในทะเบียนและหัวแฟ้ม */
export const LegacySourceBadge: React.FC<{ legacySource?: LegacySource | null; className?: string }> = ({
  legacySource,
  className = '',
}) => {
  if (!legacySource) return null
  return (
    <span title={legacyTitle(legacySource)} data-testid="legacy-source-badge" className="inline-flex">
      <Badge variant="neutral" icon="fa-clock-rotate-left" className={`border-slate-300 ${className}`}>
        มาจากระบบเดิม
      </Badge>
    </span>
  )
}

/** กล่องสรุปข้อมูลต้นทางของเรื่องที่ย้ายมาจากระบบเดิม — แสดงเฉพาะช่องที่มีค่า */
export const LegacySourcePanel: React.FC<{ legacySource: LegacySource }> = ({ legacySource: src }) => {
  const rows: Array<[string, string | undefined]> = [
    ['ระบบต้นทาง', src.system],
    ['รอบถ่ายโอน', src.runId],
    ['เลขสำนวนต้นทาง', src.sourceCaseNo],
    ['หน่วยงาน', src.sourceUnit],
  ]
  const files = src.migratedFiles || []
  return (
    <section className="ws-callout" role="note" data-testid="legacy-source-panel">
      <h3 className="text-[0.95rem] font-semibold text-ink">
        <i className="fa-solid fa-clock-rotate-left mr-2" aria-hidden="true" />
        ข้อมูลจากระบบเดิม
      </h3>
      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[0.88rem] sm:grid-cols-2">
        {rows
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <div key={label} className="min-w-0">
              <dt className="inline text-muted">{label}: </dt>
              <dd className="inline break-words font-semibold text-ink">{v}</dd>
            </div>
          ))}
      </dl>
      {files.length > 0 && (
        <div className="mt-2 text-[0.88rem]">
          <p className="font-semibold text-ink">ไฟล์ที่ย้ายมา ({files.length} ไฟล์)</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {files.map((f) => (
              <li key={f.fileId} className="break-words">
                {f.docLabel && <span className="font-semibold">{f.docLabel}</span>}
                {f.docLabel && ' · '}
                {f.fileName} <span className="text-muted">({f.fileId})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/**
 * หน้าแบบฟอร์ม คบ. ของเรื่องจากระบบเดิม — ระบบเดิมถ่ายโอนมาเฉพาะไฟล์ PDF ไม่มีข้อมูลรายช่องของแบบ
 * จึงไม่แสดงตัวกรอก/ตัวอย่างกระดาษ (ที่จะดึงร่างตัวอย่างของระบบมาแสดง) แต่แจ้งไฟล์ที่ย้ายมาแทน
 */
export const LegacyFormsNotice: React.FC<{ legacySource: LegacySource }> = ({ legacySource: src }) => {
  const files = src.migratedFiles || []
  return (
    <section className="ws-card space-y-3 p-5" role="note" data-testid="legacy-form-notice">
      <p className="text-[0.95rem] font-semibold text-ink">
        <i className="fa-solid fa-clock-rotate-left mr-2" aria-hidden="true" />
        เรื่องนี้ย้ายมาจากระบบเดิม
      </p>
      <p className="text-[0.88rem] text-ink">
        ระบบเดิมถ่ายโอนมาเฉพาะไฟล์ PDF ของเอกสาร ไม่มีข้อมูลรายช่องของแบบฟอร์ม จึงไม่แสดงแบบกรอกและตัวอย่างกระดาษ
      </p>
      {files.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-[0.88rem]">
          {files.map((f) => (
            <li key={f.fileId} className="break-words">
              {f.docLabel && <span className="font-semibold">{f.docLabel}</span>}
              {f.docLabel && ' · '}
              {f.fileName} · <span className="text-muted">{f.fileId}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
