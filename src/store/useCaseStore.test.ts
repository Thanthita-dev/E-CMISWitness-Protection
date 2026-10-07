import { describe, it, expect, beforeEach } from 'vitest'
import { useCaseStore } from './useCaseStore'
import { MAIN_CASE_OPTIONS } from '../lib/constants'
import { PROTECTION_TOTAL_CAP_DAYS } from '../lib/constants'
import { summarizeEpisode } from '../lib/episode'
import { isFormFullySigned, pendingKb13Report } from '../lib/formSignature'

const CASE_NO = 'WP-TEST-000001'
const MAIN_ID = MAIN_CASE_OPTIONS[0].id

const seed = () => {
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
        risk: 'สูง',
        assignedOfficer: 'นางสาวอรุณี ใจมั่น',
      },
    ],
    activeCaseNo: CASE_NO,
  })
}

const current = () => useCaseStore.getState().getCase(CASE_NO)!

beforeEach(seed)

describe('WIT0215 — เชื่อมโยงเลขสำนวนหลักไม่ได้ ห้ามปัดตก', () => {
  it('บันทึกเหตุผลแล้วคำร้องยังเดินต่อ ไม่ถูกปิด', () => {
    useCaseStore.getState().proceedWithoutMainCase(CASE_NO, 'ค้นในกิจกรรม 4/5 แล้วไม่พบ')

    const c = current()
    expect(c.mainCaseNotFound).toBe(true)
    expect(c.closedAt).toBeUndefined()
    expect(c.rejectedAt).toBeUndefined()
    expect(c.stage).not.toBe('rejected_no_case')
  })

  it('ไม่มี action ปัดตกคำร้องจากเหตุไม่พบเลขสำนวนหลักอีกต่อไป', () => {
    expect((useCaseStore.getState() as unknown as Record<string, unknown>).rejectNoMainCase).toBeUndefined()
  })
})

describe('เชื่อมโยงคดีหลัก — บันทึกผู้กระทำตามที่ส่งมา', () => {
  it('linkMainCase บันทึก actor ที่ส่งมาในประวัติ และใช้เจ้าหน้าที่เป็นค่าเริ่มต้น (ไม่ใช่ธุรการ)', () => {
    const store = useCaseStore.getState()
    store.linkMainCase(CASE_NO, MAIN_ID, 'คดีเดิม', 'นายทดสอบ เจ้าของสำนวน')
    const log = current().assignmentHistory?.filter((h) => h.action.includes('เชื่อมโยงเลขคดีหลัก')) ?? []
    expect(log.at(-1)?.actor).toBe('นายทดสอบ เจ้าของสำนวน')

    useCaseStore.getState().linkMainCase(CASE_NO, MAIN_ID, 'คดีเดิม')
    const log2 = current().assignmentHistory?.filter((h) => h.action.includes('เชื่อมโยงเลขคดีหลัก')) ?? []
    expect(log2.at(-1)?.actor).toBe('นางสาวอรุณี ใจมั่น')
  })
})

describe('WIT1130 / WIT1139 — การยุติต้องรอ คบ.16 ลงนามและถึงวันที่มีผล', () => {
  beforeEach(() => {
    useCaseStore.getState().requestTermination(CASE_NO, 'ภัยคุกคามหมดไป')
  })

  it('เห็นชอบให้ยุติแล้วยังไม่ terminated — ไปขั้นออกคำสั่งเท่านั้น', () => {
    useCaseStore.getState().decideTermination(CASE_NO, true, 'เห็นชอบ')

    const c = current()
    expect(c.stage).toBe('termination_order')
    expect(c.closedAt).toBeUndefined()
  })

  it('ลงนาม คบ.16 ที่มีผลย้อนไปแล้ว จึงเปลี่ยนเป็น terminated และล็อกฉบับลงนาม', () => {
    const past = new Date()
    past.setDate(past.getDate() - 1)
    const effective = past.toISOString().slice(0, 10)

    useCaseStore.getState().decideTermination(CASE_NO, true, 'เห็นชอบ')
    useCaseStore.getState().issueKb16(CASE_NO, {
      orderNo: '088/2569',
      reason: 'ภัยคุกคามหมดไป',
      issuedAt: effective,
      effectiveAt: effective,
    })
    expect(current().stage).toBe('termination_order')

    useCaseStore.getState().signKb16(CASE_NO)

    const c = current()
    expect(c.stage).toBe('terminated')
    expect(c.kb16?.locked).toBe(true)
    expect(c.closedAt).toBeUndefined() // คำสั่งมีผลแล้ว แต่ยังต้องแจ้ง คบ.17 และรอปิดแฟ้ม
  })

  it('คำสั่งที่ยังไม่ถึงวันที่มีผล ลงนามแล้วก็ยังไม่ยุติ', () => {
    const future = new Date()
    future.setDate(future.getDate() + 7)
    const effective = future.toISOString().slice(0, 10)

    useCaseStore.getState().decideTermination(CASE_NO, true, 'เห็นชอบ')
    useCaseStore.getState().issueKb16(CASE_NO, {
      orderNo: '089/2569',
      reason: 'ครบกำหนด',
      issuedAt: new Date().toISOString().slice(0, 10),
      effectiveAt: effective,
    })
    useCaseStore.getState().signKb16(CASE_NO)

    const c = current()
    expect(c.kb16?.signedAt).toBeTruthy()
    expect(c.stage).toBe('termination_order')
    expect(c.closedAt).toBeUndefined()
  })
})

describe('WIT1116 / WIT1150 — เพดานรวมกัน คบ.14', () => {
  const startedDaysAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    useCaseStore.getState().updateCase(CASE_NO, {
      actualStartedAt: d.toISOString(),
      episode: {
        id: 'EP-TEST',
        openedAt: d.toISOString(),
        phases: [{ id: 'PH-TEST', kind: 'MAIN', startedAt: d.toISOString() }],
      },
    })
  }

  it('ครบเพดานแล้วไม่สร้างคำขอ และเปลี่ยนไปเส้นทางข้อ 14', () => {
    startedDaysAgo(PROTECTION_TOTAL_CAP_DAYS)

    useCaseStore.getState().requestExtension(CASE_NO, 30, 'ยังมีภัย')

    const c = current()
    expect(c.extensionRequests || []).toHaveLength(0)
    expect(c.stage).toBe('article14')
  })

  it('ขอเกินวันคงเหลือแล้วถูกตัดให้เหลือเท่าที่ขยายได้', () => {
    startedDaysAgo(PROTECTION_TOTAL_CAP_DAYS - 10)

    useCaseStore.getState().requestExtension(CASE_NO, 60, 'ยังมีภัย')

    const requests = current().extensionRequests || []
    expect(requests).toHaveLength(1)
    expect(requests[0].durationDays).toBeLessThanOrEqual(10)
  })
})

describe('WIT0809-0812 — พยานไม่ยินยอมตาม คบ.11 ห้ามเริ่มวิธีนั้น', () => {
  it('บันทึกไม่ยินยอมแล้ววิธีที่ยังไม่เริ่มถูก block', () => {
    useCaseStore.getState().setApprovedMethods(CASE_NO, [1, 2])

    useCaseStore.getState().recordConsent(CASE_NO, {
      ref: 'kb11',
      consented: false,
      by: 'นางสาวทดสอบ ระบบดี',
      reason: 'ไม่ประสงค์ย้ายที่พัก',
      proposedAction: 'change_method',
    })

    const tracks = current().methodTracks || []
    expect(tracks).toHaveLength(2)
    expect(tracks.every((t) => t.status === 'blocked')).toBe(true)
  })

  it('วิธีที่ ACTIVE อยู่แล้วไม่ถูกย้อนกลับเป็น blocked', () => {
    useCaseStore.getState().setApprovedMethods(CASE_NO, [1, 2])
    useCaseStore.getState().setMethodStatus(CASE_NO, 1, 'active')

    useCaseStore.getState().recordConsent(CASE_NO, {
      ref: 'kb11',
      consented: false,
      by: 'นางสาวทดสอบ ระบบดี',
      reason: 'ขอทบทวน',
    })

    const tracks = current().methodTracks || []
    expect(tracks.find((t) => t.method === 1)?.status).toBe('active')
    expect(tracks.find((t) => t.method === 2)?.status).toBe('blocked')
  })
})

describe('WIT0813 — เปิดหลายวิธีพร้อมกันได้', () => {
  it('เลือกได้อิสระข้ามกลุ่ม 1-3 และ 4', () => {
    useCaseStore.getState().setApprovedMethods(CASE_NO, [2, 4])

    expect(current().approvedMethods).toEqual([2, 4])
    expect((current().methodTracks || []).map((t) => t.method)).toEqual([2, 4])
  })
})

describe('WIT0821 — ลงนาม คบ.8 แล้วเปลี่ยน Phase TEMPORARY → MAIN ต่อเนื่อง', () => {
  const startTemporary = (daysAgo: number) => {
    const at = new Date(Date.now() - daysAgo * 86400000).toISOString()
    useCaseStore.getState().updateCase(CASE_NO, { kb5Approved: true, activity7State: 'approved' })
    useCaseStore.getState().setApprovedMethods(CASE_NO, [1])
    useCaseStore.getState().setMethodStatus(CASE_NO, 1, 'active', { at, orderRef: 'คบ.5' })
  }

  it('เริ่มด้วยคำสั่งชั่วคราวได้ Phase TEMPORARY', () => {
    startTemporary(10)

    const phases = current().episode?.phases || []
    expect(phases).toHaveLength(1)
    expect(phases[0].kind).toBe('TEMPORARY')
  })

  it('ลงนาม คบ.8 แล้วต่อ Phase MAIN ใน Episode เดิม ไม่รีเซ็ตวันสะสม', () => {
    startTemporary(10)
    const before = summarizeEpisode(current().episode).cumulative

    useCaseStore.getState().signOutgoingNotice(CASE_NO, 8, 'เลขาธิการทดสอบ')

    const episode = current().episode!
    expect(episode.phases.map((p) => p.kind)).toEqual(['TEMPORARY', 'MAIN'])
    expect(episode.phases[0].endedAt).toBeTruthy()
    /** ยอดสะสมต้องเดินต่อ ไม่ถูกรีเซ็ตกลับไปเริ่มนับใหม่ที่ Phase ใหม่ */
    expect(summarizeEpisode(episode).cumulative).toBeGreaterThanOrEqual(before)
    expect(summarizeEpisode(episode).cumulative).toBeGreaterThan(1)
  })

  it('เริ่มด้วยคำร้องหลักอยู่แล้ว (MAIN) ลงนาม คบ.8 ไม่เพิ่ม Phase ซ้ำ', () => {
    useCaseStore.getState().updateCase(CASE_NO, { kb11Signed: true, activity7State: 'approved' })
    useCaseStore.getState().setApprovedMethods(CASE_NO, [1])
    useCaseStore.getState().setMethodStatus(CASE_NO, 1, 'active', { orderRef: 'คบ.8' })
    expect(current().episode?.phases.map((p) => p.kind)).toEqual(['MAIN'])

    useCaseStore.getState().signOutgoingNotice(CASE_NO, 8, 'เลขาธิการทดสอบ')

    expect(current().episode?.phases.map((p) => p.kind)).toEqual(['MAIN'])
  })

  it('ยังไม่เริ่มปฏิบัติ (ไม่มี Episode) ลงนาม คบ.8 ไม่สร้าง Episode ขึ้นเอง', () => {
    useCaseStore.getState().updateCase(CASE_NO, { activity7State: 'approved' })

    useCaseStore.getState().signOutgoingNotice(CASE_NO, 8, 'เลขาธิการทดสอบ')

    expect(current().episode).toBeUndefined()
  })
})

describe('WIT1005-1007 — ลงนามรายงานผล คบ.13 รายรอบ', () => {
  const period = '09/2569'
  const addReport = () =>
    useCaseStore.getState().addMonthlyReport(CASE_NO, period, 'ปฏิบัติตามแผน ไม่มีเหตุผิดปกติ', 0, 'นางสาวอรุณี ใจมั่น')

  it('จัดทำรายงานแล้วแนบแบบ คบ.13 เข้าแฟ้มให้ลงนาม', () => {
    addReport()

    expect(current().extraForms || []).toContain(13)
    expect(pendingKb13Report(current())?.period).toBe(period)
    expect(isFormFullySigned(13, current())).toBe(false)
  })

  it('เจ้าหน้าที่ลงนามแล้วยังไม่ครบ ต้องรอพยานรับรอง', () => {
    addReport()
    const report = current().monthlyReports![0]

    useCaseStore.getState().signMonthlyReport(CASE_NO, report.id, 'officer', 'ร.ต.อ. ผู้ปฏิบัติ')

    const after = current().monthlyReports![0]
    expect(after.officerSignedAt).toBeTruthy()
    expect(after.witnessSignedAt).toBeUndefined()
    expect(isFormFullySigned(13, current())).toBe(false)
  })

  it('ลงนามครบทั้งสองช่องแล้วรอบนั้นสมบูรณ์ ไม่มีรอบค้าง', () => {
    addReport()
    const report = current().monthlyReports![0]

    useCaseStore.getState().signMonthlyReport(CASE_NO, report.id, 'officer', 'ร.ต.อ. ผู้ปฏิบัติ')
    useCaseStore.getState().signMonthlyReport(CASE_NO, report.id, 'witness')

    const after = current().monthlyReports![0]
    expect(after.witnessSignedBy).toBe(current().person)
    expect(pendingKb13Report(current())).toBeUndefined()
    expect(isFormFullySigned(13, current())).toBe(true)
  })

  it('ยังไม่มีรายงานสักรอบ ถือว่ายังลงนามไม่ครบ', () => {
    expect(isFormFullySigned(13, current())).toBe(false)
  })
})

describe('11B — คบ.14 ขยายระยะเวลา (WIT1114-WIT1123)', () => {
  const startedDaysAgo = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    useCaseStore.getState().updateCase(CASE_NO, {
      actualStartedAt: d.toISOString(),
      episode: {
        id: 'EP-TEST',
        openedAt: d.toISOString(),
        phases: [{ id: 'PH-TEST', kind: 'MAIN', startedAt: d.toISOString() }],
      },
    })
  }

  it('WIT1114 — จัดทำ คบ.14 แล้วยังไม่ถึงผู้มีอำนาจ ต้องผ่านผู้ตรวจก่อน', () => {
    startedDaysAgo(30)

    useCaseStore.getState().draftKb14(CASE_NO, {
      reason: 'ภัยยังคงอยู่',
      durationDays: 30,
      periodFrom: '2569-01-01',
      attachments: ['คบ.13 รอบล่าสุด'],
    })

    const requests = current().extensionRequests || []
    expect(requests).toHaveLength(1)
    expect(requests[0].status).toBe('submitted')
    expect(requests[0].version).toBe(1)
  })

  it('WIT1119 — ส่งกลับแก้แล้วจัดทำใหม่เป็นเวอร์ชันใหม่ ไม่ทับฉบับเดิม', () => {
    startedDaysAgo(30)
    useCaseStore.getState().draftKb14(CASE_NO, { reason: 'ฉบับแรก', durationDays: 30 })
    const first = (current().extensionRequests || [])[0]

    useCaseStore.getState().reviewKb14(CASE_NO, first.id, false, 'หลักฐานไม่ครบ')
    expect((current().extensionRequests || [])[0].status).toBe('returned')

    useCaseStore.getState().draftKb14(CASE_NO, { reason: 'ฉบับแก้ไข', durationDays: 30 })

    const requests = current().extensionRequests || []
    expect(requests).toHaveLength(1)
    expect(requests[0].version).toBe(2)
    expect(requests[0].reason).toBe('ฉบับแก้ไข')
    expect(requests[0].previousVersions?.[0].reason).toBe('ฉบับแรก')
  })

  it('WIT1150 — ครบเพดานแล้วจัดทำ คบ.14 ไม่ได้', () => {
    startedDaysAgo(PROTECTION_TOTAL_CAP_DAYS)

    useCaseStore.getState().draftKb14(CASE_NO, { reason: 'ยังมีภัย', durationDays: 30 })

    expect(current().extensionRequests || []).toHaveLength(0)
  })

  it('WIT1120-WIT1122 — ผู้ตรวจเห็นชอบแล้วเสนอตามลำดับชั้น อนุมัติแล้วล็อกฉบับ', () => {
    startedDaysAgo(30)
    useCaseStore.getState().draftKb14(CASE_NO, { reason: 'ภัยยังคงอยู่', durationDays: 30 })
    const req = (current().extensionRequests || [])[0]

    useCaseStore.getState().reviewKb14(CASE_NO, req.id, true, 'เอกสารครบถ้วน')
    expect((current().extensionRequests || [])[0].status).toBe('pending')

    useCaseStore.getState().decideExtension(CASE_NO, req.id, true, 'อนุมัติ')
    const approved = (current().extensionRequests || [])[0]
    expect(approved.status).toBe('approved')
    expect(approved.locked).toBe(true)
  })
})

describe('11C/11D — เหตุยุติ ด่านอนุมัติ และอุทธรณ์ (WIT1127/WIT1137/WIT1147)', () => {
  it('WIT1127 — หนังสือขอยุติจากภายนอกเข้ากับแฟ้มเดิม ไม่เปิดแฟ้มใหม่', () => {
    useCaseStore.getState().recordTerminationTrigger(CASE_NO, {
      source: 'external_letter',
      ref: 'ยธ 0001/2569',
      documentName: 'หนังสือขอยุติ.pdf',
      receivedAt: '2569-09-01',
    })

    const c = current()
    expect(useCaseStore.getState().cases).toHaveLength(1)
    expect(c.terminationTrigger?.source).toBe('external_letter')
    expect((c.documents || []).some((d) => d.name === 'หนังสือขอยุติ.pdf')).toBe(true)
    expect((c.officialLetters || []).some((l) => l.context === 'termination')).toBe(true)
  })

  it('TC-144 — เพิ่มเหตุยุติเสริมพร้อมเหตุหลัก โดยไม่สร้างเรื่องยุติซ้ำซ้อน และกันซ้ำแขนงเดิม', () => {
    useCaseStore.getState().recordTerminationTrigger(CASE_NO, {
      source: 'witness_kb7',
      ref: 'KB7-010/2569',
      documentName: 'kb7.pdf',
      detail: 'พยานขอยุติเอง',
    })

    useCaseStore.getState().addTerminationAdditionalReason(CASE_NO, {
      source: 'due_or_officer',
      ref: 'คำสั่งครบกำหนดวันเดียวกัน',
    })

    let c = current()
    expect(Array.isArray(c.terminationTrigger)).toBe(false)
    expect(c.terminationTrigger?.source).toBe('witness_kb7')
    expect(c.terminationTrigger?.additionalReasons).toHaveLength(1)
    expect(c.terminationTrigger?.additionalReasons?.[0].source).toBe('due_or_officer')

    // กันซ้ำ — เพิ่มแขนงเดียวกับเหตุหลักหรือเหตุเสริมที่มีอยู่แล้ว ต้องไม่ถูกเพิ่มซ้ำ
    useCaseStore.getState().addTerminationAdditionalReason(CASE_NO, { source: 'witness_kb7', ref: 'ซ้ำเหตุหลัก' })
    useCaseStore.getState().addTerminationAdditionalReason(CASE_NO, { source: 'due_or_officer', ref: 'ซ้ำเหตุเสริม' })

    c = current()
    expect(c.terminationTrigger?.additionalReasons).toHaveLength(1)
  })

  it('WIT1137 — ไม่อนุมัติให้ยุติ ต้องคุ้มครองต่อและไม่มีคำสั่ง คบ.16', () => {
    useCaseStore.getState().draftKb15(CASE_NO, {
      trigger: 'due_or_officer',
      summary: 'ครบกำหนดและภัยดับลง',
    })
    useCaseStore.getState().reviewKb15(CASE_NO, true, 'ครบถ้วน')

    useCaseStore.getState().decideTerminationApproval(CASE_NO, false, 'ยังมีภัยอยู่')

    const c = current()
    expect(c.terminationApproval?.approved).toBe(false)
    expect(c.stage).toBe('protection')
    expect(c.kb16).toBeUndefined()
  })

  it('WIT1147 — รับอุทธรณ์คำสั่งยุติแล้วผูกกับ คบ.17 เดิม ไม่ปิดงาน', () => {
    useCaseStore.getState().updateCase(CASE_NO, {
      kb16: { orderNo: 'คำสั่งที่ 1/2569', reason: 'ครบกำหนด', signedAt: '01/09/2569', locked: true },
    })
    useCaseStore.getState().dispatchKb17(CASE_NO, {
      documentName: 'คบ17.pdf',
      registryNo: 'ปปท 0001/2569',
      registryDate: '2569-09-01',
    })
    useCaseStore.getState().recordKb17Delivery(CASE_NO, new Date().toISOString(), 'ใบตอบรับ')

    useCaseStore.getState().openKb17Appeal(CASE_NO, 'ยังไม่พ้นเหตุอันตราย', {
      channel: 'letter',
      registryNo: 'ปปท 0002/2569',
      firstReceivedAt: '2569-09-10',
      evidenceDocumentName: 'คำร้องอุทธรณ์คำสั่งยุติ.pdf',
    })

    const c = current()
    expect(c.appealAgainst).toBe('kb17')
    expect(c.stage).toBe('appeal')
    expect(c.closedAt).toBeUndefined()
    expect(c.appealFolder?.stage).toBe('received')
    expect(c.appealFolder?.intake?.channel).toBe('letter')
    // ผังห้ามเปลี่ยนเจ้าของเรื่องอัตโนมัติเมื่อรับคำอุทธรณ์
    expect(c.owner).not.toBe('นางสาววราภรณ์ นิติธรรม')
  })

  it('TC-151 — closeProtectionCase ต้อง no-op เมื่อยังไม่พ้นกรอบอุทธรณ์ 30 วัน', () => {
    useCaseStore.getState().updateCase(CASE_NO, {
      kb16: { orderNo: 'คำสั่งที่ 1/2569', reason: 'ครบกำหนด', signedAt: '01/09/2569', locked: true },
      kb17: {
        documentName: 'คบ17.pdf',
        signedAt: '01/09/2569',
        registryNo: 'ปปท 0001/2569',
        dispatchedAt: '02/09/2569',
        deliveredAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        appealDueAt: new Date(Date.now() + 25 * 86400000).toISOString(),
      },
    })

    useCaseStore.getState().closeProtectionCase(CASE_NO, 'ไม่มีอุทธรณ์')

    const c = current()
    expect(c.stage).not.toBe('terminated')
    expect(c.closedAt).toBeFalsy()
  })

  it('TC-153 — closeProtectionCase ต้อง no-op เมื่อยังไม่มีวันรับจริง/วันที่ถือว่าได้รับตามระเบียบเลย', () => {
    useCaseStore.getState().updateCase(CASE_NO, {
      kb16: { orderNo: 'คำสั่งที่ 1/2569', reason: 'ครบกำหนด', signedAt: '01/09/2569', locked: true },
      kb17: {
        documentName: 'คบ17.pdf',
        signedAt: '01/09/2569',
        registryNo: 'ปปท 0001/2569',
        dispatchedAt: '02/09/2569',
      },
    })

    useCaseStore.getState().closeProtectionCase(CASE_NO, 'ไม่มีอุทธรณ์')

    const c = current()
    expect(c.stage).not.toBe('terminated')
    expect(c.closedAt).toBeFalsy()
  })

  it('TC-151 — closeProtectionCase ปิดงานได้เมื่อพ้นกรอบอุทธรณ์ 30 วันแล้วและไม่มีงานค้าง', () => {
    useCaseStore.getState().updateCase(CASE_NO, {
      kb16: { orderNo: 'คำสั่งที่ 1/2569', reason: 'ครบกำหนด', signedAt: '01/09/2569', locked: true, effectiveAt: '01/09/2569' },
      kb17: {
        documentName: 'คบ17.pdf',
        signedAt: '01/09/2569',
        registryNo: 'ปปท 0001/2569',
        dispatchedAt: '02/09/2569',
        deliveredAt: new Date(Date.now() - 31 * 86400000).toISOString(),
        appealDueAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
    })

    useCaseStore.getState().closeProtectionCase(CASE_NO, 'พ้นกำหนดอุทธรณ์')

    const c = current()
    expect(c.stage).toBe('terminated')
    expect(c.closedAt).toBeTruthy()
    expect(c.kb16?.locked).toBe(true)
  })
})
