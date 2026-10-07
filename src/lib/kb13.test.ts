import { describe, it, expect, beforeEach } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { compareKb13Methods, getKb13Progress, kb13DueStatus, lastLockedKb13Round, needsReview, openKb13Round } from './kb13'
import { PROTECTION_TOTAL_CAP_DAYS } from './constants'
import { addDays } from './utils'

const CASE_NO = 'WP-TEST-KB13'

const seed = (startedDaysAgo = 40) => {
  useCaseStore.setState({
    cases: [
      {
        no: CASE_NO,
        form: 'คบ.1',
        person: 'นางสาวทดสอบ ระบบดี',
        status: 'กำลังคุ้มครอง',
        stage: 'protection',
        owner: 'ร.ต.อ. อนุชา กล้าหาญ',
        next: '-',
        risk: 'ปานกลาง',
        assignedOfficer: 'นางสาวอรุณี ใจมั่น',
        actualStartedAt: addDays(new Date(), -startedDaysAgo),
        kb11Signed: true,
      },
    ],
    activeCaseNo: CASE_NO,
  })
}

const current = () => useCaseStore.getState().getCase(CASE_NO)!
const round = () => openKb13Round(current())!

/** เดินรอบรายงานจนถึงขั้นก่อนล็อก — ใช้ซ้ำในหลายเคส */
const runRoundUntilStatus = () => {
  const store = useCaseStore.getState()
  store.openKb13Round(CASE_NO, { period: '09/2569', periodFrom: '2026-08-01', periodTo: '2026-08-31' })
  store.submitKb13Round(CASE_NO, round().id, {
    orderRef: 'คบ.8',
    orderDays: 60,
    operators: 'ชุดคุ้มครอง ก',
    summary: 'ปฏิบัติตามแผน ไม่มีเหตุผิดปกติ',
    methods: [1],
  })
  store.signMonthlyReport(CASE_NO, round().id, 'officer', 'ร.ต.อ. ผู้ปฏิบัติ')
  store.signMonthlyReport(CASE_NO, round().id, 'witness')
  store.receiveKb13Round(CASE_NO, round().id, 'ร.ต.อ. หัวหน้าชุด')
  store.recordKb13Status(CASE_NO, round().id, {
    riskLevel: 'สูง',
    issues: 'พบรถต้องสงสัยหน้าที่พัก',
    nextProposal: 'คงวิธีที่ 1 และเพิ่มความถี่การตรวจตรา',
  })
}

beforeEach(() => seed())

describe('WIT1004-WIT1010 — รอบรายงาน คบ.13 เดินตามลำดับในผัง', () => {
  it('เปิดรอบซ้ำไม่ได้ถ้ารอบก่อนหน้ายังไม่ถูกล็อก', () => {
    const store = useCaseStore.getState()
    store.openKb13Round(CASE_NO, { period: '09/2569' })
    store.openKb13Round(CASE_NO, { period: '10/2569' })

    expect(current().monthlyReports).toHaveLength(1)
  })

  it('จัดทำ คบ.13 แล้วจึงแนบแบบเข้าแฟ้มเพื่อลงนาม (ไม่ใช่ตอนเปิดรอบ)', () => {
    const store = useCaseStore.getState()
    store.openKb13Round(CASE_NO, { period: '09/2569', evidenceRefs: ['บันทึกเวรประจำวัน'] })
    expect(current().extraForms || []).not.toContain(13)

    store.submitKb13Round(CASE_NO, round().id, {
      orderRef: 'คบ.8',
      operators: 'ชุดคุ้มครอง ก',
      summary: 'ปฏิบัติตามแผน',
    })
    expect(current().extraForms || []).toContain(13)
    expect(round().evidenceRefs).toEqual(['บันทึกเวรประจำวัน'])
  })

  it('ยังลงนามไม่ครบสองช่อง ตรวจรับ (WIT1008) ไม่ได้', () => {
    const store = useCaseStore.getState()
    store.openKb13Round(CASE_NO, { period: '09/2569' })
    store.submitKb13Round(CASE_NO, round().id, { orderRef: 'คบ.8', operators: 'ก', summary: 'ปกติ' })
    store.signMonthlyReport(CASE_NO, round().id, 'officer', 'ร.ต.อ. ผู้ปฏิบัติ')

    store.receiveKb13Round(CASE_NO, round().id)
    expect(round().reviewedAt).toBeUndefined()
  })

  it('ยังไม่บันทึกสถานะ (WIT1009) ล็อกรอบไม่ได้', () => {
    const store = useCaseStore.getState()
    store.openKb13Round(CASE_NO, { period: '09/2569' })
    store.submitKb13Round(CASE_NO, round().id, { orderRef: 'คบ.8', operators: 'ก', summary: 'ปกติ' })
    store.signMonthlyReport(CASE_NO, round().id, 'officer')
    store.signMonthlyReport(CASE_NO, round().id, 'witness')
    store.receiveKb13Round(CASE_NO, round().id)

    const id = round().id
    store.lockKb13Round(CASE_NO, id)
    expect(round().lockedAt).toBeUndefined()
  })

  it('ครบทุกขั้นแล้วล็อกได้ และระดับความเสี่ยงของสำนวนอัปเดตตามผลประเมิน', () => {
    runRoundUntilStatus()
    const id = round().id
    useCaseStore.getState().lockKb13Round(CASE_NO, id)

    expect(current().risk).toBe('สูง')
    expect(openKb13Round(current())).toBeUndefined()
    expect(lastLockedKb13Round(current())?.id).toBe(id)
  })

  it('ล็อกแล้วแก้เนื้อรายงานย้อนหลังไม่ได้', () => {
    runRoundUntilStatus()
    const id = round().id
    useCaseStore.getState().lockKb13Round(CASE_NO, id)

    useCaseStore.getState().submitKb13Round(CASE_NO, id, { summary: 'แก้ย้อนหลัง' })
    expect(lastLockedKb13Round(current())?.summary).toBe('ปฏิบัติตามแผน ไม่มีเหตุผิดปกติ')
  })
})

describe('WIT1003 / WIT1011-WIT1013 — รอบถัดไปและการส่งทบทวน', () => {
  it('กำหนดรอบถัดไปแล้วแจ้งเตือนล่วงหน้าไม่เกิน 7 วัน', () => {
    useCaseStore.getState().setNextReportDue(CASE_NO, addDays(new Date(), 3))
    const status = kb13DueStatus(current())

    expect(status.due).toBe(true)
    expect(status.overdue).toBe(false)
  })

  it('เลยกำหนดรอบแล้วถือว่าต้องทบทวน (WIT1011)', () => {
    useCaseStore.getState().setNextReportDue(CASE_NO, addDays(new Date(), -2))
    expect(kb13DueStatus(current()).overdue).toBe(true)
    expect(needsReview(current())).toBe(true)
  })

  it('ครบเพดานรวมแล้วต้องทบทวน แม้ยังไม่ถึงรอบรายงาน', () => {
    seed(PROTECTION_TOTAL_CAP_DAYS + 5)
    expect(kb13DueStatus(current()).episode.atCap).toBe(true)
    expect(needsReview(current())).toBe(true)
  })

  it('WIT1013 เก็บ payload ที่ต้องส่งไปแท็บ 11A ไว้ในแฟ้ม', () => {
    runRoundUntilStatus()
    useCaseStore.getState().lockKb13Round(CASE_NO, round().id)
    useCaseStore.getState().sendToProtectionReview(CASE_NO, 'ความเสี่ยงสูงขึ้น ต้องทบทวนวิธี')

    const handoff = current().reviewHandoff!
    expect(handoff.period).toBe('09/2569')
    expect(handoff.riskLevel).toBe('สูง')
    expect(handoff.cumulativeDays).toBeGreaterThan(0)
    expect(handoff.cumulativeDays + handoff.remainingDays).toBe(PROTECTION_TOTAL_CAP_DAYS)
  })
})

describe('compareKb13Methods — WIT1008 เทียบวิธีที่รายงานกับวิธีที่ได้รับอนุมัติ', () => {
  it('ตรงกันทุกวิธี ถือว่าไม่มีความไม่สอดคล้อง', () => {
    expect(compareKb13Methods([1], [1])).toEqual({ extra: [], missing: [], matches: true })
  })

  it('ปฏิบัติวิธีที่ไม่ได้รับอนุมัติ ถือว่าไม่สอดคล้อง (extra)', () => {
    const result = compareKb13Methods([1], [1, 2])
    expect(result.matches).toBe(false)
    expect(result.extra).toEqual([2])
    expect(result.missing).toEqual([])
  })

  it('ได้รับอนุมัติแต่ไม่ได้ปฏิบัติ/ไม่ได้รายงาน ถือว่าไม่สอดคล้อง (missing)', () => {
    const result = compareKb13Methods([1, 2], [1])
    expect(result.matches).toBe(false)
    expect(result.extra).toEqual([])
    expect(result.missing).toEqual([2])
  })

  it('ไม่มีข้อมูลทั้งสองฝั่ง ถือว่าตรงกัน (ไม่มีอะไรให้เทียบ)', () => {
    expect(compareKb13Methods(undefined, undefined)).toEqual({ extra: [], missing: [], matches: true })
  })
})

describe('getKb13Progress — ความคืบหน้ารายรอบ', () => {
  it('ยังไม่มีวิธีใดเริ่มปฏิบัติจริง ค้างที่ WIT1001', () => {
    useCaseStore.setState({
      cases: [{ ...current(), actualStartedAt: undefined, episode: undefined }],
    })

    const progress = getKb13Progress(current())
    expect(progress.blockedIndex).toBe(0)
    expect(progress.doneCount).toBe(0)
  })

  it('นับสะสมจากต้น หยุดที่ขั้นแรกที่ยังไม่เสร็จ', () => {
    const store = useCaseStore.getState()
    store.openKb13Round(CASE_NO, { period: '09/2569' })
    store.submitKb13Round(CASE_NO, round().id, {
      orderRef: 'คบ.8',
      operators: 'ก',
      summary: 'ปกติ',
      periodFrom: '2026-08-01',
      periodTo: '2026-08-31',
    })

    /** WIT1001-WIT1005 เสร็จ แต่ยังไม่ลงนาม จึงหยุดที่ WIT1006 */
    const progress = getKb13Progress(current())
    expect(progress.doneCount).toBe(5)
    expect(progress.steps[progress.doneCount].code).toBe('WIT1006')
  })

  it('ปิดรอบและส่งทบทวนแล้ว ครบทุกขั้น', () => {
    runRoundUntilStatus()
    useCaseStore.getState().lockKb13Round(CASE_NO, round().id)
    useCaseStore.getState().sendToProtectionReview(CASE_NO, 'ต้องทบทวน')

    const progress = getKb13Progress(current())
    expect(progress.doneCount).toBe(progress.total)
  })
})
