import type { CaseItem, SarabanCheckpoint } from '../../types/case'
import { SECRETARY_OFFICE_NAME, sarabanUnitName } from '../../lib/saraban'
import { GOT_UNIT_NAME } from '../../lib/protectionHandoff'

/** ผู้ส่ง → ผู้ลงทะเบียน → ผู้รับถัดไป ของแต่ละจุดลงทะเบียน */
export const sarabanRouteFor = (c: CaseItem, cp: SarabanCheckpoint): string[] => {
  const d = c.sarabanDispatch
  if (d) {
    const unitClerk = `ธุรการ${sarabanUnitName(c, 'director_outgoing')}`
    const secClerk = `ธุรการ${SECRETARY_OFFICE_NAME}`
    switch (cp) {
      case 'director_outgoing': return [d.openedBy, unitClerk, secClerk]
      case 'secretary_incoming': return [unitClerk, secClerk, d.recipientName]
      case 'secretary_outgoing': return [d.openedBy, secClerk, unitClerk]
      default: return [secClerk, unitClerk, d.recipientName]
    }
  }
  const got = c.protectionHandoff?.destination === 'got'
  const clerk = `ธุรการ${sarabanUnitName(c, cp)}`
  switch (cp) {
    case 'director_outgoing': return ['ผอ.สำนัก/กอง', 'ธุรการสำนัก/กอง', `ธุรการ${SECRETARY_OFFICE_NAME}`]
    case 'secretary_incoming': return ['ธุรการสำนัก/กอง', `ธุรการ${SECRETARY_OFFICE_NAME}`, 'รองเลขาธิการ ป.ป.ท.']
    case 'secretary_outgoing': return ['เลขาธิการ ป.ป.ท.', `ธุรการ${SECRETARY_OFFICE_NAME}`, got ? `ธุรการคดี ${GOT_UNIT_NAME}` : 'ธุรการสำนัก/กอง เจ้าของสำนวนเดิม']
    default: return [`ธุรการ${SECRETARY_OFFICE_NAME}`, clerk, got ? `ผอ. ${GOT_UNIT_NAME}` : 'เจ้าของสำนวนเดิม']
  }
}

export const sarabanSubmitLabelFor = (c: CaseItem, cp: SarabanCheckpoint): string => {
  const d = c.sarabanDispatch
  if (d) {
    if (cp === 'director_outgoing') return `ส่งธุรการ${SECRETARY_OFFICE_NAME}`
    if (cp === 'secretary_outgoing') return `ส่งธุรการ${sarabanUnitName(c, 'director_outgoing')}`
    return `รับเข้าทะเบียนและส่ง${d.recipientName}`
  }
  const got = c.protectionHandoff?.destination === 'got'
  switch (cp) {
    case 'director_outgoing': return 'ส่งธุรการสำนักงานเลขาธิการ'
    case 'secretary_incoming': return 'ส่งรองเลขาธิการ ป.ป.ท. กลั่นกรอง'
    case 'secretary_outgoing': return got ? 'ส่งธุรการคดี กอท.' : 'ส่งธุรการสำนัก/กอง เจ้าของสำนวนเดิม'
    default: return got ? 'ส่งเสนอ ผอ. กอท.' : 'รับเข้าทะเบียนและส่งเจ้าของสำนวนเดิม'
  }
}
