export interface FormMeta {
  n: number
  code: string
  t: string
  d: string
  pages?: number
  roles?: string[]
  /** แบบที่จัดทำเฉพาะในเส้นทางงานของตัวเอง (เช่น ส่งต่อข้อ 14) — ไม่แสดงในตัวเลือก "แนบแบบฟอร์ม" ของแฟ้ม */
  flowOnly?: true
}

export interface FormDraftState {
  currentFormId: number
  section: number
  manualPage: number | null
  drafts: Record<number, Record<string, any>>
  relatedPersons: Array<{
    id: number
    title: string
    firstName: string
    lastName: string
    citizenId: string
    relation: string
    risk: string
  }>
  attachmentSets: Array<{
    id: number
    category: string
    description: string
    formId?: number
    files: Array<{
      name: string
      size: number
      type: string
      lastModified?: number
      previewUrl?: string | null
      uploadedAt: string
      uploadedBy: string
    }>
  }>
}
