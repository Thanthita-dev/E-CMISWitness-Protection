import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { MainCaseLinkCard } from './MainCaseLinkCard'
import type { CaseItem } from '../../types/case'

vi.mock('../../lib/swal', () => ({
  showToast: vi.fn(),
  showConfirmAlert: vi.fn(),
  MySwal: { fire: vi.fn(), close: vi.fn() },
}))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))

const base: CaseItem = {
  no: 'MIG-1',
  form: 'คำร้อง',
  person: '',
  status: 'x',
  stage: 'terminated',
  owner: 'o',
  next: 'n',
  risk: 'ยังไม่ประเมิน',
  linkedMainCaseId: '9125/2567',
  mainCaseNo: '9125/2567',
  mainCaseTitle: 'ทุจริต',
}

afterEach(cleanup)

describe('MainCaseLinkCard — เรื่องจากระบบเดิม', () => {
  it('ไม่แสดงคะแนนตรงกัน/เหตุผลความเกี่ยวพันที่ไม่มีในข้อมูลเดิม', () => {
    render(<MainCaseLinkCard caseItem={{ ...base, legacySource: { system: 'old' } }} />)
    expect(screen.getByText('9125/2567')).toBeTruthy()
    expect(screen.queryByText(/ตรงกัน/)).toBeNull()
    expect(screen.queryByText(/เหตุผลความเกี่ยวพัน/)).toBeNull()
  })

  it('เรื่องปกติยังแสดงค่าเริ่มต้นเหมือนเดิม', () => {
    render(<MainCaseLinkCard caseItem={base} />)
    expect(screen.getByText(/ตรงกัน 100%/)).toBeTruthy()
    expect(screen.getByText(/เหตุผลความเกี่ยวพัน/)).toBeTruthy()
  })
})
