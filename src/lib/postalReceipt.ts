import type { CaseItem } from '../types/case'

export const canPostTerminationNotice = (c: CaseItem): boolean =>
  c.sarabanDispatch?.flow === 'termination' && c.sarabanDispatch.direction === 'down' &&
  c.sarabanDispatch.checkpoint === 'destination_incoming' && Boolean(c.kb17?.signedAt)

/** Recover the receipt already confirmed by the clerk in older saved cases. */
export function restorePostalReceipt(c: CaseItem): CaseItem {
  const postal = c.protectionHandoff?.postal
  if (!postal?.deliveredAt || c.deliveredAt) return c
  return {
    ...c,
    dispatchedAt: c.dispatchedAt || postal.sentAt,
    deliveredAt: postal.deliveredAt,
    deliveryRecipient: c.deliveryRecipient || postal.recipient,
    deliveryAckType: c.deliveryAckType || 'ธุรการยืนยันผลรับไปรษณีย์',
    deliveryAckDocument: c.deliveryAckDocument || 'บันทึกยืนยันพยานได้รับหนังสือในทะเบียนสารบรรณ',
    resultPendingAck: false,
  }
}
