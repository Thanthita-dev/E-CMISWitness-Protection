import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { DirectorAssignmentCard } from './DirectorAssignmentCard'
import { useAuthStore } from '../../store/useAuthStore'
import { CaseItem } from '../../types/case'

vi.mock('../../lib/swal', () => ({
  showToast: vi.fn(),
  MySwal: { fire: vi.fn(), close: vi.fn() },
}))

const caseItem: CaseItem = {
  no: 'WP-TEST-0002',
  form: 'คบ.1',
  person: 'นางสาวทดสอบ ระบบดี',
  status: 'รอ ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน',
  stage: 'director_assign',
  owner: 'ผอ.สำนัก/กอง',
  next: 'มอบหมายเจ้าของสำนวน',
  risk: 'สูง',
}

const optionValues = () =>
  Array.from(screen.getByLabelText(/เลือกเจ้าหน้าที่เจ้าของสำนวน/).querySelectorAll('option')).map((o) => o.getAttribute('value'))

afterEach(cleanup)

describe('DirectorAssignmentCard — รายชื่อเจ้าหน้าที่ตามสังกัด ผอ.', () => {
  it('ผอ. สำนักงาน ป.ป.ท. เขต 1 เห็นเฉพาะเจ้าหน้าที่เขต 1 ไม่เห็นส่วนกลาง', () => {
    useAuthStore.setState({ currentRole: 'director', currentOrgUnitId: 'pacc-reg-1' })
    render(<DirectorAssignmentCard caseItem={{ ...caseItem, orgUnitId: 'pacc-reg-1' }} />)
    expect(optionValues()).toEqual(['OFF-REG1'])
  })

  it('ผอ. ส่วนกลางเห็นเฉพาะเจ้าหน้าที่ส่วนกลาง', () => {
    useAuthStore.setState({ currentRole: 'director', currentOrgUnitId: 'central-gmc' })
    render(<DirectorAssignmentCard caseItem={{ ...caseItem, orgUnitId: 'central-wp' }} />)
    expect(optionValues()).toEqual(['OFF-001', 'OFF-002'])
  })
})
