export interface FormMeta {
  n: number
  code: string
  t: string
  d: string
  pages?: number
  roles?: string[]
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
