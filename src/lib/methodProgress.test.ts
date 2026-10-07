import { describe, it, expect } from 'vitest'
import { getMethodProgress, method1Gate, wizardSectionCount } from './methodProgress'
import { CaseItem, ProtectionMethodTrack } from '../types/case'

/** แฟ้มเปล่าเท่าที่ตัวคำนวณความคืบหน้าใช้จริง — ฟิลด์อื่นของ CaseItem ไม่มีผลต่อการนับขั้น */
const makeCase = (patch: Partial<CaseItem> = {}) => ({ no: 'WP-2568-001', ...patch }) as CaseItem

const track = (patch: Partial<ProtectionMethodTrack>): ProtectionMethodTrack =>
  ({ method: 1, status: 'pending', ...patch }) as ProtectionMethodTrack

describe('ความคืบหน้ารายวิธี — นับสะสมและหยุดที่ขั้นแรกที่ยังไม่เสร็จ', () => {
  it('วิธีที่ 1 ยังไม่มีข้อมูลใด ๆ ได้ 0 จาก 5 ขั้น', () => {
    const p = getMethodProgress(makeCase(), track({ method: 1 }))

    expect(p.total).toBe(5)
    expect(p.doneCount).toBe(0)
  })

  it('วิธีที่ 1 มีร่าง คบ.8 แต่ยังไม่ลงนาม จึงหยุดที่ 1 ขั้น', () => {
    const p = getMethodProgress(makeCase(), track({ method: 1 }), { kb8Drafted: true })

    expect(p.doneCount).toBe(1)
    expect(p.steps[1].code).toBe('WIT0818')
    expect(p.steps[1].done).toBe(false)
  })

  it('วิธีที่ 1 ลงนาม คบ.8 แล้ว (อิงสถานะเดียวกับรายการแบบฟอร์มในแฟ้ม) ผ่านขั้น WIT0818', () => {
    const p = getMethodProgress(makeCase({ kb8SignedAt: '2026-09-01T00:00:00.000Z' }), track({ method: 1 }), {
      kb8Drafted: true,
    })

    expect(p.steps[1].done).toBe(true)
  })

  it('ขั้นหลังที่กรอกข้ามไปแล้วไม่ทำให้ตัวเลขกระโดดข้ามขั้นที่ยังค้าง', () => {
    /** เริ่มปฏิบัติจริงแล้ว (ขั้นสุดท้าย) แต่ยังไม่ลงนาม คบ.8 — ต้องยังนับได้เท่าเดิม */
    const p = getMethodProgress(
      makeCase(),
      track({ method: 1, status: 'active', startedAt: '2026-09-01T00:00:00.000Z' }),
      { kb8Drafted: true }
    )

    expect(p.doneCount).toBe(1)
    expect(p.steps[4].done).toBe(true)
  })

  it('กดเริ่มปฏิบัติจริงแล้ว (wizardStep = จำนวน section) วิธีที่ 1 เดินถึง WIT0821 ครบ 5 จาก 5', () => {
    /** ปุ่มเริ่มปฏิบัติจริงดัน wizardStep ไปสุด เพราะ section สุดท้ายกด "ถัดไป" ต่อไม่ได้ */
    const p = getMethodProgress(
      makeCase({ kb8SignedAt: '2026-09-01T00:00:00.000Z' }),
      track({
        method: 1,
        status: 'active',
        startedAt: '2026-09-09T00:00:00.000Z',
        wizardStep: wizardSectionCount(1),
      }),
      { kb8Drafted: true }
    )

    expect(p.doneCount).toBe(5)
    expect(p.steps[4].code).toBe('WIT0821')
  })

  it('วิธีที่ 2 เดินครบทุกขั้นได้ 6 จาก 6', () => {
    const p = getMethodProgress(
      makeCase(),
      track({
        method: 2,
        status: 'active',
        site: {
          budgetNote: 'คุ้มครองพยานและบุตร 90 วัน',
          proposedSite: 'บ้านพักรับรอง ป.ป.ท.',
          custodian: 'นายสมชาย',
          suitable: true,
          movePlan: 'ย้ายเวลา 22.00 น.',
          backupRoute: 'เส้นทางเลี่ยงถนนสายรอง',
          handoverBy: 'ร.ต.อ.หญิง ก',
          handoverTo: 'พ.ต.ท. ข',
        },
      })
    )

    expect(p.doneCount).toBe(6)
    expect(p.blockedIndex).toBeUndefined()
  })

  it('วิธีที่ 4 ถูกหน่วยงานปฏิเสธ — ค้างหมุดไว้ที่ขั้นถัดไปที่เดินต่อไม่ได้', () => {
    const p = getMethodProgress(
      makeCase({
        kb11Signed: true,
        officialLetters: [{ id: 'L1', direction: 'outgoing', context: 'method4', subject: 'ประสาน', agency: 'DSI' }],
      }),
      track({
        method: 4,
        status: 'blocked',
        blockedReason: 'หน่วยงานปฏิเสธ',
        coordination: { responseStatus: 'declined', declinedReason: 'อัตรากำลังไม่พอ' },
      })
    )

    expect(p.doneCount).toBe(3)
    expect(p.blockedIndex).toBe(3)
    expect(p.steps[3].code).toBe('WIT0847')
  })
})

describe('วิธีที่ 1 — ประตูลงนาม คบ.8 ก่อนเดินขั้น WIT0819-0821', () => {
  it('ยังไม่ลงนาม คบ.8 และไม่มีคำสั่งชั่วคราว คบ.5 — ประตูปิดพร้อมเหตุผล', () => {
    const gate = method1Gate(makeCase())

    expect(gate.unlocked).toBe(false)
    expect(gate.reason).toContain('คบ.8')
  })

  it('เลขาธิการฯ ลงนาม คบ.8 แล้ว — ประตูเปิด', () => {
    expect(method1Gate(makeCase({ kb8SignedAt: '2026-09-01T00:00:00.000Z' })).unlocked).toBe(true)
  })

  it('มีคำสั่งชั่วคราว คบ.5 อนุมัติ — ประตูเปิดตามเส้นทาง TEMPORARY_ACTIVE', () => {
    expect(method1Gate(makeCase({ kb5Approved: true })).unlocked).toBe(true)
  })

  it('กดถัดไปค้างไว้ก่อนแต่ยังไม่ลงนาม คบ.8 — แถบไม่ยอมข้าม WIT0818', () => {
    /** เคสตามภาพที่รายงาน: wizardStep ถูกดันไปสุดแล้วแต่ คบ.8 ยังไม่ได้เสนอเลขาธิการฯ ด้วยซ้ำ */
    const p = getMethodProgress(
      makeCase(),
      track({ method: 1, wizardStep: wizardSectionCount(1) }),
      { kb8Drafted: true }
    )

    expect(p.doneCount).toBe(1)
    expect(p.steps[2].done).toBe(false)
    expect(p.steps[3].done).toBe(false)
  })

  it('ลงนาม คบ.8 ครบแล้ว การกดถัดไปจึงเดินขั้น WIT0819 ต่อได้ตามเดิม', () => {
    const p = getMethodProgress(
      makeCase({ kb8SignedAt: '2026-09-01T00:00:00.000Z' }),
      track({ method: 1, wizardStep: 1 }),
      { kb8Drafted: true }
    )

    expect(p.doneCount).toBe(3)
    expect(p.steps[2].code).toBe('WIT0819')
    expect(p.steps[2].done).toBe(true)
  })
})

describe('วิธีที่ 1 — WIT0817 ยอมรับหลักฐานที่หนักกว่าคลังร่างแบบฟอร์ม', () => {
  it('เสนอเลขาธิการฯ แล้วแม้คลังร่างว่าง ก็ถือว่าจัดทำร่างเสร็จ', () => {
    const p = getMethodProgress(makeCase({ kb8SubmittedAt: '2026-09-01T00:00:00.000Z' }), track({ method: 1 }))

    expect(p.steps[0].done).toBe(true)
    expect(p.doneCount).toBe(1)
  })

  it('เลขาธิการฯ ลงนามแล้วแต่คลังร่างว่าง — แถบต้องเดินถึง WIT0818 ไม่ค้างที่ 0', () => {
    /** เคสที่รายงาน: คบ.8 ถูกแนบเข้าแฟ้มอัตโนมัติตอนแยกแนวทาง จึงไม่เคยผ่านคลังร่างเลย */
    const p = getMethodProgress(makeCase({ kb8SignedAt: '2026-09-02T00:00:00.000Z' }), track({ method: 1 }))

    expect(p.steps[0].done).toBe(true)
    expect(p.steps[1].done).toBe(true)
    expect(p.doneCount).toBe(2)
  })

  it('ยังไม่ร่าง ไม่เสนอ ไม่ลงนาม — ยังเป็น 0 ขั้นเหมือนเดิม', () => {
    expect(getMethodProgress(makeCase(), track({ method: 1 })).doneCount).toBe(0)
  })
})
