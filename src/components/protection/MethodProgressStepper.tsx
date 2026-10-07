import React from 'react'
import { MethodProgress } from '../../lib/methodProgress'

interface MethodProgressStepperProps {
  progress: MethodProgress
  /** เหตุที่วิธีนี้เดินต่อไม่ได้ — แสดงใต้หมุดที่ค้างเมื่อสถานะเป็น blocked */
  blockedReason?: string
  /** หัวข้อแถบความคืบหน้า — แท็บ 10 ใช้แถบเดียวกันแต่เป็นความคืบหน้าของรอบรายงาน ไม่ใช่ของวิธี */
  title?: string
  /**
   * ทำให้หมุดกดได้ — ใช้ตอนแถบนี้เป็นตัวควบคุมหน้าของ wizard (เช่นแท็บ 10)
   * กดได้เฉพาะขั้นที่ทำแล้วหรือขั้นปัจจุบัน (idx <= doneCount) เพื่อย้อนกลับเท่านั้น ไปข้างหน้าไม่ได้
   */
  onStepClick?: (index: number) => void
}

/**
 * หมุดความคืบหน้าของวิธีคุ้มครองหนึ่งวิธี — เขียว = ทำแล้ว, ทอง = ขั้นที่กำลังทำ, แดง = ค้างเพราะถูกระงับ
 * ขั้นทั้งหมดอ่านจาก getMethodProgress ซึ่งอนุมานจากข้อมูลที่กรอกไว้ในแฟ้ม
 */
export const MethodProgressStepper: React.FC<MethodProgressStepperProps> = ({
  progress,
  blockedReason,
  title = 'ความคืบหน้าของวิธีนี้',
  onStepClick,
}) => {
  const { steps, doneCount, total, blockedIndex } = progress

  return (
    <div className="rounded-xl border border-line bg-soft p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[0.8rem] font-bold text-navy-deep">
          {title}
          <span className="ml-2 font-semibold text-muted">
            {doneCount}/{total} ขั้น
          </span>
        </span>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all ${blockedIndex !== undefined ? 'bg-rose-500' : 'bg-emerald-500'}`}
            style={{ width: `${(doneCount / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        {/* กว้างอย่างน้อยขั้นละ ~110px — แท็บ 10 มีถึง 13 ขั้น ถ้าตรึงไว้ที่ 640px ป้ายจะซ้อนกันจนอ่านไม่ออก */}
        <ol
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))`, minWidth: Math.max(640, total * 110) }}
        >
          {steps.map((s, idx) => {
            const isBlocked = idx === blockedIndex
            const isCurrent = !isBlocked && idx === doneCount
            /** ใช้ doneCount (สะสมจากต้น) แทน s.done ตรงๆ — บาง step ท้ายๆ อนุมาน done จากสถานะรวมของวิธี
             * (เช่น track.status === 'active') ซึ่งอาจเป็นจริงก่อนที่ step ก่อนหน้าจะถูกปลดล็อก ทำให้ปุ่มถูกติ๊กข้ามขั้นได้
             * ถ้าไม่ clamp ตรงนี้จะเห็นขั้นท้ายเป็นสีเขียวทั้งที่ขั้นก่อนหน้ายังเป็นขั้นปัจจุบันอยู่ */
            const isDone = idx < doneCount
            const isClickable = Boolean(onStepClick) && !isBlocked && idx <= doneCount

            return (
              <li key={s.code} aria-current={isCurrent ? "step" : undefined} className="relative flex flex-col items-center text-center">
                {idx < total - 1 && (
                  <div
                    className={`absolute top-3 left-1/2 z-0 h-0.5 w-full ${isDone ? 'bg-emerald-500' : 'bg-slate-200'}`}
                  />
                )}

                <div
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onClick={isClickable ? () => onStepClick?.(idx) : undefined}
                  onKeyDown={
                    isClickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') onStepClick?.(idx)
                        }
                      : undefined
                  }
                  className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[0.74rem] font-bold ${
                    isClickable ? 'cursor-pointer hover:ring-4 hover:ring-blue/20' : ''
                  } ${
                    isBlocked
                      ? 'border-2 border-rose-400 bg-rose-100 text-rose-700 ring-4 ring-rose-200/50'
                      : isDone
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'border-2 border-gold bg-gold-soft text-gold-dark ring-4 ring-gold/20'
                      : 'border border-slate-300 bg-white text-slate-400'
                  }`}
                >
                  {isBlocked ? (
                    <i className="fa-solid fa-hand text-[9px]" />
                  ) : isDone ? (
                    <i className="fa-solid fa-check text-[9px]" />
                  ) : (
                    idx + 1
                  )}
                </div>

                <div className="mt-1.5 space-y-0.5">
                  <strong
                    className={`block text-[0.8rem] leading-tight ${
                      isBlocked
                        ? 'font-bold text-rose-700'
                        : isCurrent
                        ? 'font-bold text-navy-deep'
                        : isDone
                        ? 'text-slate-700'
                        : 'text-muted'
                    }`}
                  >
                    {s.label}
                  </strong>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {blockedIndex !== undefined && (
        <p className="rounded-xl border border-rose-200 bg-rose-50/80 p-2.5 text-[0.8rem] leading-relaxed text-rose-900">
          <i className="fa-solid fa-triangle-exclamation mr-1.5" />
          ค้างที่ขั้น {blockedIndex + 1} · {steps[blockedIndex]?.label}
          {blockedReason ? ` — ${blockedReason}` : ''}
        </p>
      )}
    </div>
  )
}
