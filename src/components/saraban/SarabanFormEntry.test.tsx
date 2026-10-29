import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { SarabanFormEntry } from './SarabanFormEntry'
import { SarabanStampStack } from './SarabanStamp'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'

vi.mock('../../lib/swal', () => ({ showToast: vi.fn() }))

const baseCase = { no: 'T-1', stage: 'director_outgoing_registry', sarabanRound: 1, sarabanRecords: [] as any[] }

describe('SarabanFormEntry', () => {
  let recordSaraban: ReturnType<typeof vi.fn>
  beforeEach(() => {
    cleanup()
    recordSaraban = vi.fn(() => true)
    useCaseStore.setState({ cases: [baseCase as any], recordSaraban } as any)
    useAuthStore.setState({ currentRole: 'receiver' } as any)
  })

  it('records the number when the clerk submits', () => {
    render(<SarabanFormEntry caseNo="T-1" checkpoint="director_outgoing" recipient="สำนักงานเลขาธิการ" />)
    fireEvent.change(screen.getByLabelText('เลขทะเบียนส่ง'), { target: { value: '552' } })
    fireEvent.click(screen.getByText('บันทึกเลขทะเบียน'))
    expect(recordSaraban).toHaveBeenCalledWith('T-1', 'director_outgoing', 'สำนักงานเลขาธิการ', expect.objectContaining({ number: '552' }))
  })

  it('shows pending text for non-clerk roles', () => {
    useAuthStore.setState({ currentRole: 'officer' } as any)
    render(<SarabanFormEntry caseNo="T-1" checkpoint="director_outgoing" recipient="สำนักงานเลขาธิการ" />)
    expect(screen.getByText('รอธุรการลงทะเบียน')).toBeTruthy()
  })

  it('renders a stamp on every form covered by the recipient number', () => {
    useCaseStore.setState({ cases: [{ ...baseCase, sarabanRecords: [{ id: 'r1', checkpoint: 'secretary_incoming', direction: 'incoming', formNo: 1, forms: [1, 3, 6], recipient: 'รองเลขาธิการ ป.ป.ท.', number: '552', date: '2026-03-09', time: '13:36', unitName: 'สำนักงานเลขาธิการ', clerkUserId: 'u', clerkName: 'ก', round: 1 }] } as any] } as any)
    render(<SarabanStampStack caseNo="T-1" formNo={1} />)
    expect(screen.getByTestId('saraban-stamp-stack').textContent).toContain('552')
    cleanup()
    render(<SarabanStampStack caseNo="T-1" formNo={6} />)
    expect(screen.getByTestId('saraban-stamp-secretary_incoming-6').textContent).toContain('552')
  })
})
