import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { LegacySourceBadge, LegacySourcePanel } from './LegacySourceBadge'

afterEach(cleanup)

describe('LegacySourceBadge', () => {
  it('แสดงป้าย "มาจากระบบเดิม" พร้อม tooltip ระบบ/รอบ/เลขสำนวนต้นทาง', () => {
    render(<LegacySourceBadge legacySource={{ system: 'ECMIS-OLD', runId: 'R1', sourceCaseNo: 'X-9' }} />)
    expect(screen.getByText('มาจากระบบเดิม')).toBeTruthy()
    const title = screen.getByTestId('legacy-source-badge').getAttribute('title')
    expect(title).toContain('ECMIS-OLD')
    expect(title).toContain('R1')
    expect(title).toContain('X-9')
  })

  it('ไม่แสดงอะไรถ้าไม่ใช่เรื่องจากระบบเดิม', () => {
    const { container } = render(<LegacySourceBadge legacySource={undefined} />)
    expect(container.innerHTML).toBe('')
  })

  it('panel แสดงเฉพาะช่องที่มีค่า และรายการไฟล์', () => {
    render(
      <LegacySourcePanel
        legacySource={{
          system: 'ECMIS-OLD',
          sourceCaseNo: 'X-9',
          migratedFiles: [{ fileId: 'F1', docCategory: 'c', docLabel: 'คำร้อง', fileName: 'a.pdf' }],
        }}
      />,
    )
    expect(screen.getByText('เลขสำนวนต้นทาง:')).toBeTruthy()
    expect(screen.queryByText('รอบถ่ายโอน:')).toBeNull()
    expect(screen.getByText(/a\.pdf/)).toBeTruthy()
  })
})
