import React from 'react'

export type StepState = 'done' | 'current' | 'pending'

export interface StepperStep {
  key: string
  label: string
  sublabel?: string
  state: StepState
}

const STATE_TEXT: Record<StepState, string> = { done: 'เสร็จสิ้น', current: 'ปัจจุบัน', pending: 'รอดำเนินการ' }

/** ขั้นตอนแบบวงกลมมีเลข (node แบบ A4): ทำแล้ว = น้ำเงินทึบ, ปัจจุบัน = ทอง + ข้อความ "ปัจจุบัน", รอ = ขอบเปล่า; ≤720px เป็นแนวตั้ง */
export const NumberedStepper: React.FC<{ steps: StepperStep[]; ariaLabel?: string }> = ({ steps, ariaLabel = 'ลำดับขั้นตอน' }) => {
  const listRef = React.useRef<HTMLOListElement>(null)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const currentKey = steps.find((st) => st.state === 'current')?.key

  /** เลื่อนเฉพาะในกล่อง stepper ให้ขั้นปัจจุบันอยู่กลาง (ไม่เลื่อนทั้งหน้า) และแสดงเงาขอบเมื่อยังมีส่วนที่ซ่อน */
  React.useEffect(() => {
    const list = listRef.current
    if (!list) return
    const cur = currentKey ? (list.querySelector('[aria-current="step"]') as HTMLElement | null) : null
    if (cur && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = cur.offsetLeft - list.clientWidth / 2 + cur.offsetWidth / 2
    }
    const update = () => {
      const more = list.scrollWidth - list.clientWidth - list.scrollLeft > 4
      wrapRef.current?.style.setProperty('--ws-fade', more ? '1' : '0')
    }
    update()
    list.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      list.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [currentKey, steps.length])

  return (
  <div className="ws-stepper-wrap" ref={wrapRef}>
  <ol ref={listRef} className={`ws-stepper${steps.length > 8 ? ' dense' : ''}`} aria-label={ariaLabel}>
    {steps.map((step, i) => (
      <li key={step.key} className={`ws-step ${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
        <span className="ws-step-dot" aria-hidden="true">
          {step.state === 'done' ? <i className="fa-solid fa-check" /> : i + 1}
        </span>
        <span className="ws-step-text flex min-w-0 flex-col items-center gap-[0.15rem]">
          <strong className="ws-step-label">{step.label}</strong>
          {step.sublabel && <small className="ws-step-sub">{step.sublabel}</small>}
          <span className="ws-step-state">{step.state === 'current' ? 'ปัจจุบัน' : <span className="sr-only">{STATE_TEXT[step.state]}</span>}</span>
        </span>
      </li>
    ))}
  </ol>
  </div>
  )
}
