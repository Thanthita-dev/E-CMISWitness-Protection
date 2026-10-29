import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getAdditionalForm, type AdditionalFormValues } from '../lib/additionalForms'

interface LegacyDraft {
  texts: string[]
  updatedAt: string
}

interface LegacyState {
  drafts: Record<string, LegacyDraft>
}

/**
 * ร่างรูปแบบเดิม (แก้ทีละย่อหน้า) ที่บันทึกไว้ก่อนมีช่องข้อมูล
 * คงไว้อ่านอย่างเดียวที่ key เดิม เพื่อไม่ทับร่างของผู้ใช้
 */
export const useLegacyAdditionalFormStore = create<LegacyState>()(persist(() => ({
  drafts: {},
}), {
  name: 'ecmis-a6-additional-form-drafts',
  version: 1,
  storage: createJSONStorage(() => localStorage),
}))

export interface AdditionalFormDraft extends AdditionalFormValues {
  updatedAt: string
}

interface AdditionalFormState {
  drafts: Record<string, AdditionalFormDraft>
  saveDraft: (templateId: string, draft: AdditionalFormValues) => void
}

/** ร่างแบบฟอร์มและหนังสือประกอบ แยกตามแบบ และแยกจากแบบ คบ. */
export const useAdditionalFormStore = create<AdditionalFormState>()(persist((set) => ({
  drafts: {},
  saveDraft: (templateId, draft) => {
    if (!getAdditionalForm(templateId)) return
    set((state) => ({
      drafts: {
        ...state.drafts,
        [templateId]: { values: { ...draft.values }, paragraphs: { ...draft.paragraphs }, updatedAt: new Date().toISOString() },
      },
    }))
  },
}), {
  name: 'ecmis-a6-additional-form-fields',
  version: 1,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ drafts: state.drafts }),
}))
