import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { FileManager } from './FileManager'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem } from '../../types/case'

/** แฟ้มทดสอบของไฟล์นี้เอง — สโตร์เริ่มต้นว่างเปล่า จึงต้อง seed ก่อนทุกเคส */
const TEST_CASE: CaseItem = {
  no: 'WP-TEST-0001',
  form: 'คบ.1',
  person: 'นางสาวทดสอบ ระบบดี',
  status: 'รอตรวจข้อมูลจากผู้ยื่น',
  stage: 'staff_review',
  owner: 'นางสาวอรุณี ใจมั่น',
  next: 'ตรวจข้อมูลและลายมือชื่อก่อนรับเข้าแฟ้ม',
  risk: 'สูง',
}

beforeEach(() => {
  useCaseStore.setState({ cases: [TEST_CASE], activeCaseNo: TEST_CASE.no })
})

/** setup.ts ของโปรเจกต์ไม่ได้เปิด auto-cleanup จึงต้องล้าง DOM เองระหว่างเคส */
afterEach(cleanup)

describe('FileManager', () => {
  it('scope=form เริ่มที่โฟลเดอร์ของ คบ. ฉบับนั้น และเห็นชุดเอกสารเป็นโฟลเดอร์ย่อย', () => {
    render(<FileManager scope="form" formId={1} />)
    expect(screen.getByText('หลักฐานยืนยันตัวตน')).toBeInTheDocument()
    expect(screen.getByText('หลักฐานการถูกข่มขู่คุกคาม')).toBeInTheDocument()
  })

  it('เดินเข้าโฟลเดอร์แล้วเห็นไฟล์ข้างใน', () => {
    render(<FileManager scope="form" formId={1} />)
    fireEvent.click(screen.getByText('หลักฐานยืนยันตัวตน'))
    expect(screen.getByText('บัตรประชาชน_กมลชนก.pdf')).toBeInTheDocument()
  })

  it('ค้นหาไฟล์ข้ามโฟลเดอร์ได้จากราก', () => {
    render(<FileManager scope="form" formId={1} />)
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาไฟล์ใน/), { target: { value: 'ภาพแชท' } })
    expect(screen.getByText('ภาพแชทข่มขู่.jpg')).toBeInTheDocument()
    expect(screen.queryByText('บัตรประชาชน_กมลชนก.pdf')).not.toBeInTheDocument()
  })

  it('scope=dossier เห็นโฟลเดอร์ครบทุกแบบ คบ. ของสำนวน แม้แบบนั้นยังไม่มีไฟล์แนบ', () => {
    useCaseStore.setState({ cases: [{ ...TEST_CASE, urgency: 'normal' }] })
    render(<FileManager scope="dossier" />)
    expect(screen.getByText('คบ.1')).toBeInTheDocument()
    expect(screen.getByText('คบ.3')).toBeInTheDocument()
    expect(screen.getByText('คบ.6')).toBeInTheDocument()
  })

  it('scope=dossier ยังไม่ประเมินความเร่งด่วน — ยังไม่มีโฟลเดอร์ คบ.6 (TC-005)', () => {
    render(<FileManager scope="dossier" />)
    expect(screen.getByText('คบ.1')).toBeInTheDocument()
    expect(screen.queryByText('คบ.6')).not.toBeInTheDocument()
  })

  it('อัปโหลดในแฟ้มที่รากมีให้เลือกปลายทาง แต่ในแบบ คบ. ไม่มี', () => {
    const dossier = render(<FileManager scope="dossier" />)
    // เรียงลำดับ + ปลายทาง
    expect(dossier.container.querySelectorAll('select')).toHaveLength(2)
    cleanup()

    const form = render(<FileManager scope="form" formId={1} />)
    // เหลือเฉพาะเรียงลำดับ
    expect(form.container.querySelectorAll('select')).toHaveLength(1)
  })
})
