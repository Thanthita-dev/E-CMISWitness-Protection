import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import type { CaseItem } from '../types/case'
import { MOCK_STATES } from '../lib/mockState'
import { useAuthStore } from '../store/useAuthStore'
import { useCaseStore } from '../store/useCaseStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { Route as FormRoute } from './form/$formId'
import { Route as RegistryRoute } from './registry'

let mockFormId = '1'
let mockCaseNo: string | undefined
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => vi.fn(),
  useParams: () => ({ formId: mockFormId }),
  useSearch: () => ({ caseNo: mockCaseNo }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock('../lib/swal', () => ({ showToast: vi.fn(), showSuccessAlert: vi.fn(), showConfirmAlert: vi.fn() }))

const state = MOCK_STATES.find((s) => s.name === 'ระบบเดิม - สำนวน 9125/2567')!
const legacy = (JSON.parse(state.localStorageData['ecmis-case-storage-v2']).state.cases as CaseItem[])[0]
const auth = JSON.parse(state.localStorageData['ecmis-auth-storage']).state

const DEMO_TEXT = ['กมลชนก', '1100400123456', '081-234-5678']

beforeEach(() => {
  useAuthStore.setState({ currentRole: auth.currentRole, currentOfficerUserId: auth.currentOfficerUserId })
  useCaseStore.setState({ cases: [legacy] })
  mockCaseNo = legacy.no
})
afterEach(cleanup)

describe('เรื่องจากระบบเดิม ไม่ดึงร่างตัวอย่างมาแสดงในแบบ คบ.', () => {
  it.each(['1', '2', '3', '6', '12'])('/form/%s แสดงเฉพาะไฟล์ที่ย้ายมา ไม่มีข้อมูลตัวอย่าง', (formId) => {
    mockFormId = formId
    const Page = (FormRoute as unknown as { component: React.FC }).component
    const { container } = render(<Page />)
    expect(screen.getByTestId('legacy-form-notice')).toBeTruthy()
    for (const f of legacy.legacySource!.migratedFiles!) {
      expect(container.textContent).toContain(f.fileName)
      expect(container.textContent).toContain(f.fileId)
    }
    for (const t of DEMO_TEXT) expect(container.textContent).not.toContain(t)
    expect(container.querySelector('fieldset')).toBeNull()
    expect(Object.keys(useFormDraftStore.getState().draftCaseNo).some((k) => useFormDraftStore.getState().draftCaseNo[Number(k)] === legacy.no)).toBe(false)
  })
})

describe('ทะเบียน — แถวจากระบบเดิม', () => {
  it('ไม่เติมค่าสำรอง "กรณีปกติ"/"เจ้าหน้าที่บันทึกรับเรื่อง"', () => {
    const Page = (RegistryRoute as unknown as { component: React.FC }).component
    const { container } = render(<Page />)
    const row = container.querySelector('tbody tr')!.textContent!
    expect(row).toContain('ไม่มีข้อมูลในระบบเดิม')
    expect(row).not.toContain('กรณีปกติ')
    expect(row).not.toContain('เจ้าหน้าที่บันทึกรับเรื่อง')
  })

  it('เรื่องปกติแสดงเหมือนเดิม', () => {
    useCaseStore.setState({ cases: [{ ...legacy, legacySource: undefined, person: 'ทดสอบ ปกติ', source: undefined }] })
    const Page = (RegistryRoute as unknown as { component: React.FC }).component
    const { container } = render(<Page />)
    const row = container.querySelector('tbody tr')!.textContent!
    expect(row).toContain('ทดสอบ ปกติ')
    expect(row).toContain('กรณีปกติ')
    expect(row).toContain('เจ้าหน้าที่บันทึกรับเรื่อง')
  })
})
