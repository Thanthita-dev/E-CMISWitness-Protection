import type { CaseItem } from '../types/case'

/** Seed the actual witness and approved methods without creating agreement signatures. */
export const buildKb11Seed = (
  item: Pick<CaseItem, 'person' | 'orderedMethods' | 'approvedMethods'>
): Record<string, unknown> => {
  const parts = item.person.trim().split(/\s+/).filter(Boolean)
  const methods = item.orderedMethods ?? item.approvedMethods ?? []
  return {
    'ชื่อพยาน': parts[0] || '',
    'นามสกุลพยาน': parts.slice(1).join(' '),
    'ผู้ได้รับการคุ้มครอง': item.person,
    'คำรับรองพยาน': item.person,
    'รูปแบบที่เลือก': methods.map((method) => `3.${method}`),
  }
}
