import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { CaseLockScope } from './CaseLockScope'
import { useAuthStore } from '../../store/useAuthStore'

afterEach(cleanup)

describe('การเปิดข้อมูลรายสำนวน', () => {
  it('ผู้รับผิดชอบเปิดได้ แต่เปลี่ยนเป็นเจ้าหน้าที่คนอื่นแล้วไม่แสดงเนื้อหาแฟ้ม', () => {
    useAuthStore.setState({ currentRole: 'officer', currentOfficerUserId: 'OFF-001', currentOrgUnitId: 'central-wp' })
    render(<CaseLockScope caseItem={{ stage: 'staff_review', assignedOfficerUserId: 'OFF-001' }}>
      <p>ข้อมูลเฉพาะแฟ้มของเจ้าหน้าที่คนที่หนึ่ง</p>
    </CaseLockScope>)
    expect(screen.getByText('ข้อมูลเฉพาะแฟ้มของเจ้าหน้าที่คนที่หนึ่ง')).toBeInTheDocument()
    act(() => useAuthStore.getState().setOfficerUserId('OFF-002'))
    expect(screen.queryByText('ข้อมูลเฉพาะแฟ้มของเจ้าหน้าที่คนที่หนึ่ง')).not.toBeInTheDocument()
    expect(screen.getByText('ไม่มีสิทธิ์เปิดข้อมูลของแฟ้มนี้ในบทบาทปัจจุบัน')).toBeInTheDocument()
  })
})
