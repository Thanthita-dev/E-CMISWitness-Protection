import React from 'react'

interface CurrentStepCardProps {
  /** ชื่อขั้นตอนปัจจุบัน และผู้รับผิดชอบ */
  current: React.ReactNode
  responsible?: React.ReactNode
  /** ขั้นตอนถัดไป และคำอธิบายใต้ชื่อ */
  next?: React.ReactNode
  nextNote?: React.ReactNode
  /** ตำแหน่งขั้นตอน (ใช้ทำ pill "ขั้นตอน x / y") */
  index?: number
  total?: number
  /** แถวคำอธิบายใต้ stepper: [ซ้าย, ขวา] */
  caption?: [React.ReactNode, React.ReactNode?]
  /** ใส่ <NumberedStepper /> */
  children?: React.ReactNode
}

/** การ์ดขั้นตอนปัจจุบัน (.ws-stagebar): สรุปขั้นปัจจุบัน/ถัดไป + pill ลำดับ → stepper → caption */
export const CurrentStepCard: React.FC<CurrentStepCardProps> = ({ current, responsible, next, nextNote, index, total, caption, children }) => (
  <section className="ws-card ws-stagebar" aria-label="ขั้นตอนของเรื่อง">
    <div className="ws-stage-summary">
      <div>
        <span>ขั้นตอนปัจจุบัน</span>
        {/* ใส่ลำดับขั้นนำหน้าชื่อ เพื่อไม่ให้ข้อความซ้ำกับชื่อหมุดใน stepper */}
        <p className="ws-stage-name">
          {index !== undefined ? `${index}. ` : null}
          {current}
        </p>
        {responsible && <p className="ws-stage-note">{responsible}</p>}
      </div>
      <div>
        <span>ขั้นตอนถัดไป</span>
        <p className="ws-stage-name">
          {next && index !== undefined && total !== undefined && index < total ? `${index + 1}. ` : null}
          {next ?? '—'}
        </p>
        {nextNote && <p className="ws-stage-note">{nextNote}</p>}
      </div>
      {index !== undefined && total !== undefined && (
        <b className="ws-stage-pill">
          ขั้นตอน {index} / {total}
        </b>
      )}
    </div>
    {children}
    {caption && (
      <div className="ws-stage-caption">
        <span>{caption[0]}</span>
        {caption[1] && <span>{caption[1]}</span>}
      </div>
    )}
  </section>
)
