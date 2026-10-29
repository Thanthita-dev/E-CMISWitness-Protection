import React, { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceTextarea, appendTranscript } from './VoiceTextarea'

vi.mock('../../lib/swal', () => ({ showToast: vi.fn() }))

type ResultHandler = (event: { resultIndex: number; results: unknown }) => void

class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = false
  interimResults = false
  onresult: ResultHandler | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn()
  constructor() {
    FakeRecognition.last = this
  }
  speak(transcript: string, isFinal = true) {
    const result = Object.assign([{ transcript }], { isFinal })
    this.onresult?.({ resultIndex: 0, results: [result] })
  }
}

const Controlled: React.FC<{ initial?: string; disabled?: boolean }> = ({ initial = '', disabled }) => {
  const [value, setValue] = useState(initial)
  return (
    <>
      <label htmlFor="reason">เหตุผล</label>
      <VoiceTextarea id="reason" value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} />
    </>
  )
}

afterEach(() => {
  cleanup()
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  FakeRecognition.last = null
})

describe('appendTranscript', () => {
  it('appends spoken text after existing text with a single space', () => {
    expect(appendTranscript('เดิม  ', ' ใหม่ ')).toBe('เดิม ใหม่')
    expect(appendTranscript('', 'ใหม่')).toBe('ใหม่')
    expect(appendTranscript('เดิม', '   ')).toBe('เดิม')
  })
})

describe('VoiceTextarea', () => {
  it('shows a mic button that cannot record when the browser has no speech recognition', () => {
    render(<Controlled />)
    const button = screen.getByTestId('voice-input-button')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button.getAttribute('title')).toContain('Chrome')
  })

  it('hides the mic button on a disabled field', () => {
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition
    render(<Controlled disabled />)
    expect(screen.queryByTestId('voice-input-button')).toBeNull()
  })

  it('records Thai speech, appends final text to the field, and stops on second click', () => {
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition
    render(<Controlled initial="ข้อความเดิม" />)
    const button = screen.getByRole('button', { name: 'พูดเพื่อแปลงเป็นข้อความ' })

    fireEvent.click(button)
    const recognition = FakeRecognition.last!
    expect(recognition.lang).toBe('th-TH')
    expect(recognition.start).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('กำลังฟัง')

    act(() => recognition.speak('ขอขยายเวลา', false))
    expect(screen.getByRole('status')).toHaveTextContent('ขอขยายเวลา')
    expect(screen.getByLabelText('เหตุผล')).toHaveValue('ข้อความเดิม')

    act(() => recognition.speak('ขอขยายเวลาคุ้มครอง'))
    expect(screen.getByLabelText('เหตุผล')).toHaveValue('ข้อความเดิม ขอขยายเวลาคุ้มครอง')

    fireEvent.click(screen.getByRole('button', { name: 'หยุดฟังเสียง' }))
    expect(recognition.stop).toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
