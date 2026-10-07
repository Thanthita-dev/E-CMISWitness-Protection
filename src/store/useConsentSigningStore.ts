import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { generateToken } from '../lib/utils'
import {
  CONSENT_CHANNEL_LABELS,
  ConsentChannel,
  ConsentDocumentSnapshot,
  ConsentEvent,
  ConsentEventType,
  ConsentRecipient,
  ConsentRequest,
  consentFingerprint,
  effectiveStatus,
  formatConsentDateTime,
  recipientAddress,
} from '../lib/consentSigning'

/**
 * คำขอให้ผู้ขอคุ้มครองลงลายมือชื่อยินยอมใน คบ.1 ผ่านลิงก์ (Prototype — ไม่มีระบบหลังบ้าน ข้อมูลอยู่ใน localStorage)
 * แยกจาก useSignatureLinkStore เดิม เพราะต้องมีอายุลิงก์ การยกเลิก รุ่นเอกสาร และประวัติเหตุการณ์
 */
export interface SendConsentInput {
  caseNo: string
  snapshot: ConsentDocumentSnapshot
  recipient: ConsentRecipient
  channel: ConsentChannel
  expiresInHours: number
  createdBy: string
}

interface ConsentSigningState {
  requests: Record<string, ConsentRequest>
  events: ConsentEvent[]

  /** ส่งลิงก์ใหม่ — ถ้ายังมีลิงก์ที่รอลงชื่อของแฟ้มเดียวกัน ระบบยกเลิกลิงก์เดิมให้ (ลิงก์เดิมใช้ต่อไม่ได้) */
  sendRequest: (input: SendConsentInput) => string
  cancelRequest: (token: string, by: string, reason: string) => void
  /** บันทึกเหตุการณ์หมดอายุของลิงก์ที่เลยกำหนดแล้ว (เรียกซ้ำได้ ไม่บันทึกซ้ำ) */
  markExpired: (token: string) => void
  /** เครื่องมือสาธิต: ทำให้ลิงก์หมดอายุทันที */
  expireNowForDemo: (token: string, by: string) => void
  markOpened: (token: string) => void
  /** ผู้ขอคุ้มครองยืนยันลงชื่อ — สำเร็จเฉพาะลิงก์ที่ยังรอลงชื่อและมีลายมือชื่อ */
  completeSigning: (token: string, signatureImage: string, signerName?: string) => boolean
  eventsFor: (caseNo: string) => ConsentEvent[]
}

const nowIso = () => new Date().toISOString()

const newEvent = (
  req: Pick<ConsentRequest, 'caseNo' | 'token' | 'version'>,
  type: ConsentEventType,
  actor: string,
  detail?: string
): ConsentEvent => ({
  id: generateToken(),
  caseNo: req.caseNo,
  token: req.token,
  version: req.version,
  type,
  at: nowIso(),
  actor,
  detail,
})

/** ฉบับที่ของเอกสาร: เนื้อหาเดิม = ฉบับเดิม · เนื้อหาเปลี่ยน = ฉบับถัดไป */
const nextVersion = (requests: Record<string, ConsentRequest>, caseNo: string, fingerprint: string): number => {
  const mine = Object.values(requests).filter((r) => r.caseNo === caseNo)
  const same = mine.find((r) => r.fingerprint === fingerprint)
  if (same) return same.version
  return mine.reduce((max, r) => Math.max(max, r.version), 0) + 1
}

export const useConsentSigningStore = create<ConsentSigningState>()(
  persist(
    (set, get) => ({
      requests: {},
      events: [],

      sendRequest: (input) => {
        const token = generateToken()
        const state = get()
        const fingerprint = consentFingerprint(input.snapshot.draft, input.snapshot.relatedPersons)
        const version = nextVersion(state.requests, input.caseNo, fingerprint)
        const createdAt = nowIso()
        const request: ConsentRequest = {
          token,
          caseNo: input.caseNo,
          version,
          fingerprint,
          snapshot: input.snapshot,
          recipient: input.recipient,
          channel: input.channel,
          createdAt,
          createdBy: input.createdBy,
          expiresAt: new Date(Date.now() + input.expiresInHours * 3600_000).toISOString(),
          status: 'pending',
        }

        const requests = { ...state.requests }
        const events: ConsentEvent[] = []
        const active = Object.values(requests).filter((r) => r.caseNo === input.caseNo && effectiveStatus(r) === 'pending')
        active.forEach((old) => {
          requests[old.token] = {
            ...old,
            status: 'cancelled',
            cancelledAt: createdAt,
            cancelledBy: input.createdBy,
            cancelReason: 'ออกลิงก์ใหม่แทน',
            replacedBy: token,
          }
          events.push(newEvent(old, 'cancelled', input.createdBy, 'ยกเลิกอัตโนมัติเมื่อออกลิงก์ใหม่ — ลิงก์เดิมใช้ต่อไม่ได้'))
        })
        requests[token] = request
        events.push(
          newEvent(
            request,
            active.length > 0 ? 'reissued' : 'sent',
            input.createdBy,
            `${CONSENT_CHANNEL_LABELS[input.channel]} · ${recipientAddress(request)} · ถึง ${input.recipient.name} · หมดอายุ ${formatConsentDateTime(request.expiresAt)}`
          )
        )
        set({ requests, events: [...state.events, ...events] })
        return token
      },

      cancelRequest: (token, by, reason) => {
        const req = get().requests[token]
        if (!req || effectiveStatus(req) !== 'pending') return
        set((state) => ({
          requests: {
            ...state.requests,
            [token]: { ...req, status: 'cancelled', cancelledAt: nowIso(), cancelledBy: by, cancelReason: reason },
          },
          events: [...state.events, newEvent(req, 'cancelled', by, reason)],
        }))
      },

      markExpired: (token) => {
        const req = get().requests[token]
        if (!req || req.status !== 'pending' || effectiveStatus(req) !== 'expired') return
        set((state) => ({
          requests: { ...state.requests, [token]: { ...req, status: 'expired', expiredAt: req.expiresAt } },
          events: [
            ...state.events,
            { ...newEvent(req, 'expired', 'ระบบ', `ครบกำหนด ${formatConsentDateTime(req.expiresAt)} โดยยังไม่ได้ลงชื่อ`), at: req.expiresAt },
          ],
        }))
      },

      expireNowForDemo: (token, by) => {
        const req = get().requests[token]
        if (!req || effectiveStatus(req) !== 'pending') return
        const at = nowIso()
        set((state) => ({
          requests: { ...state.requests, [token]: { ...req, status: 'expired', expiresAt: at, expiredAt: at } },
          events: [...state.events, newEvent(req, 'expired', by, 'จำลองให้ลิงก์หมดอายุ (เครื่องมือสาธิต)')],
        }))
      },

      markOpened: (token) => {
        const req = get().requests[token]
        if (!req || effectiveStatus(req) !== 'pending') return
        /** บันทึกการเปิดครั้งแรกของแต่ละลิงก์เท่านั้น */
        if (get().events.some((e) => e.token === token && e.type === 'opened')) return
        set((state) => ({ events: [...state.events, newEvent(req, 'opened', req.recipient.name)] }))
      },

      completeSigning: (token, signatureImage, signerName) => {
        const req = get().requests[token]
        if (!req || effectiveStatus(req) !== 'pending' || !signatureImage) return false
        const signedAt = nowIso()
        set((state) => ({
          requests: {
            ...state.requests,
            [token]: { ...req, status: 'signed', signedAt, signerName: signerName || req.recipient.name, signatureImage },
          },
          events: [...state.events, newEvent(req, 'signed', signerName || req.recipient.name, `ลงชื่อในเอกสารฉบับที่ ${req.version} (รหัส ${req.fingerprint})`)],
        }))
        return true
      },

      eventsFor: (caseNo) =>
        get()
          .events.filter((e) => e.caseNo === caseNo)
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    }),
    { name: 'ecmis-consent-signing-storage-v1' }
  )
)
