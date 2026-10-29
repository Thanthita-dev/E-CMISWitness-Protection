import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import type { UserRole } from '../types/user'
import { activeSarabanCheckpoint, sarabanClerkAccount, sarabanClerkRole, sarabanRecipientsFor, suggestSarabanInput } from './saraban'

/** ตัวช่วยเทสต์: เดินทะเบียนสารบรรณแทนธุรการ แล้วคืนบทบาทเดิมให้ผู้เรียก */

const caseOf = (no: string) => useCaseStore.getState().cases.find((c) => c.no === no)!

/** สวมบทบาทธุรการของจุดนั้น (รวมหน่วยงานของธุรการ — ธุรการเขตเห็นเฉพาะงานของเขตตน) แล้วคืนค่าเดิม */
const asClerk = <T,>(no: string, fn: () => T): T => {
  const auth = useAuthStore.getState()
  const prev = { role: auth.currentRole, unit: auth.currentOrgUnitId }
  const c = caseOf(no)
  const cp = activeSarabanCheckpoint(c)!
  useAuthStore.getState().setRole(sarabanClerkRole(c, cp) as UserRole)
  useAuthStore.setState({ currentOrgUnitId: sarabanClerkAccount(c, cp)?.orgUnitId ?? null })
  try { return fn() } finally {
    useAuthStore.getState().setRole(prev.role)
    useAuthStore.setState({ currentOrgUnitId: prev.unit })
  }
}

/** ลงเลขครบทุกผู้รับ (เลขต่อผู้รับ ไม่ใช่ต่อ คบ.) ของจุดปัจจุบัน โดยไม่กดส่งต่อ */
export const recordSarabanCheckpoint = (no: string): boolean => {
  const c = caseOf(no)
  const cp = activeSarabanCheckpoint(c)
  if (!cp) return false
  return asClerk(no, () => sarabanRecipientsFor(c, cp).every((name) =>
    useCaseStore.getState().recordSaraban(no, cp, name, suggestSarabanInput(caseOf(no), cp, new Date('2026-10-12T09:30:00'), name))))
}

/** ลงทะเบียนครบและส่งต่อจากจุดปัจจุบัน */
export const passSarabanCheckpoint = (no: string): boolean => {
  if (!recordSarabanCheckpoint(no)) return false
  return asClerk(no, () => useCaseStore.getState().submitSarabanCheckpoint(no))
}

/** ผอ.สำนัก/กอง ส่งชุดเสนอ → ธุรการสำนัก/กอง ออกเลขส่ง → ธุรการ สลธ. ลงเลขรับ → รองเลขาธิการฯ */
export const passDirectorToDeputy = (no: string): boolean => passSarabanCheckpoint(no) && passSarabanCheckpoint(no)

/** หลังเลขาธิการอนุมัติ: ธุรการ สลธ. ออกเลขส่ง → ถึงธุรการปลายทางที่รอลงเลขรับ (ยังไม่ลงเลขรับ) */
export const passSecretaryOutgoing = (no: string): boolean => passSarabanCheckpoint(no)

/** ธุรการปลายทางลงเลขรับครบแล้วส่งต่อ (got = รับเรื่อง · original_owner = ถึงเจ้าของสำนวน) */
export const passDestinationIncoming = (no: string): boolean => passSarabanCheckpoint(no)
