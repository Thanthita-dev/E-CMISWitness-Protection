import { beforeEach, describe, expect, it } from 'vitest'
import { applicantSignatureFor, consentFingerprint, effectiveStatus, maskEmail, maskPhone } from './consentSigning'
import { useConsentSigningStore } from '../store/useConsentSigningStore'

const snapshot = (phone = '0812345678') => ({
  draft: { 'ชื่อ': 'สมชาย', 'นามสกุล': 'ใจดี', 'เบอร์โทรศัพท์': phone, 'ตำแหน่งเจ้าพนักงาน': 'นักสืบสวนสอบสวน' },
  relatedPersons: [],
  fallback: { person: 'สมชาย ใจดี' },
})

const send = (phone?: string, hours = 72) =>
  useConsentSigningStore.getState().sendRequest({
    caseNo: 'WP-TEST-1',
    snapshot: snapshot(phone),
    recipient: { name: 'นายสมชาย ใจดี' },
    channel: 'manual',
    expiresInHours: hours,
    createdBy: 'เจ้าหน้าที่ทดสอบ',
  })

describe('ลงชื่อยินยอม คบ.1 ผ่านลิงก์', () => {
  beforeEach(() => useConsentSigningStore.setState({ requests: {}, events: [] }))

  it('fingerprint ไม่ขึ้นกับลำดับ key และไม่นับตำแหน่งเจ้าพนักงาน แต่เปลี่ยนเมื่อเนื้อหาเปลี่ยน', () => {
    const a = consentFingerprint({ 'ชื่อ': 'ก', 'นามสกุล': 'ข' }, [])
    const b = consentFingerprint({ 'นามสกุล': 'ข', 'ชื่อ': 'ก', 'ตำแหน่งเจ้าพนักงาน': 'x', 'ว่าง': '' }, [])
    expect(a).toBe(b)
    expect(consentFingerprint({ 'ชื่อ': 'ก', 'นามสกุล': 'ค' }, [])).not.toBe(a)
  })

  it('ออกลิงก์ใหม่แล้วลิงก์เดิมถูกยกเลิกและลงชื่อไม่ได้', () => {
    const first = send()
    const second = send()
    const { requests, completeSigning } = useConsentSigningStore.getState()
    expect(requests[first].status).toBe('cancelled')
    expect(requests[first].replacedBy).toBe(second)
    expect(completeSigning(first, 'data:image/png;base64,x')).toBe(false)
  })

  it('ต้องมีลายมือชื่อก่อนจึงลงชื่อสำเร็จ (ไม่มีขั้นยืนยันตัวตน)', () => {
    const token = send()
    expect(useConsentSigningStore.getState().completeSigning(token, '')).toBe(false)
    expect(useConsentSigningStore.getState().completeSigning(token, 'data:image/png;base64,x')).toBe(true)
    expect(useConsentSigningStore.getState().requests[token].status).toBe('signed')
  })

  it('ลิงก์เลยกำหนดถือว่าหมดอายุ และลงชื่อไม่ได้', () => {
    const token = send(undefined, -1)
    const req = useConsentSigningStore.getState().requests[token]
    expect(effectiveStatus(req)).toBe('expired')
    expect(useConsentSigningStore.getState().completeSigning(token, 'data:image/png;base64,x')).toBe(false)
    useConsentSigningStore.getState().markExpired(token)
    expect(useConsentSigningStore.getState().events.filter((e) => e.type === 'expired')).toHaveLength(1)
  })

  it('แก้เนื้อหาหลังลงชื่อ: ลายมือชื่อเดิมไม่ใช้กับฉบับใหม่ และลิงก์ถัดไปเป็นฉบับที่ 2', () => {
    const token = send()
    useConsentSigningStore.getState().completeSigning(token, 'data:image/png;base64,x')
    const { requests } = useConsentSigningStore.getState()
    const original = consentFingerprint(snapshot().draft, [])
    const edited = consentFingerprint(snapshot('0899999999').draft, [])
    expect(applicantSignatureFor(requests, 'WP-TEST-1', original)?.signed).toBe(true)
    expect(applicantSignatureFor(requests, 'WP-TEST-1', edited)).toBeUndefined()

    const next = send('0899999999')
    expect(useConsentSigningStore.getState().requests[next].version).toBe(2)
    /** ฉบับเดิมยังเก็บไว้ */
    expect(useConsentSigningStore.getState().requests[token].status).toBe('signed')
  })

  it('ปกปิดช่องทางติดต่อบางส่วน', () => {
    expect(maskPhone('081-234-5678')).toBe('081-xxx-5678')
    expect(maskEmail('somchai@example.com')).toBe('so***@example.com')
  })
})

describe('QR Code ของลิงก์ลงชื่อ', () => {
  it('สร้างเมทริกซ์จัตุรัสขนาดตามรุ่น และมี finder pattern ครบ 3 มุม', async () => {
    const { encodeQr } = await import('./qrCode')
    const m = encodeQr('https://pacc-a6.teerut-s.workers.dev/sign/consent/6d791b3acc7f4e2a9b1c0d2e3f405162')
    expect((m.length - 17) % 4).toBe(0)
    m.forEach((row) => expect(row).toHaveLength(m.length))
    const finderAt = (x: number, y: number) => [0, 6].every((d) => m[y][x + d] && m[y + d][x]) && m[y + 3][x + 3] && !m[y + 1][x + 1]
    expect(finderAt(0, 0)).toBe(true)
    expect(finderAt(m.length - 7, 0)).toBe(true)
    expect(finderAt(0, m.length - 7)).toBe(true)
  })
})
