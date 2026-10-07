import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import { SignaturePad } from './SignaturePad'
import { resizeImageToDataUrl } from '../../lib/imageResize'

vi.mock('../../lib/imageResize', () => ({
  resizeImageToDataUrl: vi.fn(),
}))

const resizeMock = vi.mocked(resizeImageToDataUrl)

const UPLOADED = 'data:image/png;base64,UPLOADEDSIGNATURE'

const pickFile = (name = 'signature.png', type = 'image/png') => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['x'], name, { type })
  fireEvent.change(input, { target: { files: [file] } })
  return file
}

const preview = () => screen.queryByAltText('ลายมือชื่อที่อัปโหลด')
const canvas = () => document.querySelector('canvas')

beforeEach(() => {
  resizeMock.mockReset()
  resizeMock.mockResolvedValue(UPLOADED)
})

afterEach(cleanup)

describe('SignaturePad — วาดลายมือชื่อ', () => {
  it('แสดงพื้นที่วาดเป็นค่าตั้งต้น', () => {
    render(<SignaturePad onChange={vi.fn()} />)

    expect(canvas()).toBeTruthy()
    expect(preview()).toBeNull()
  })

  it('มีปุ่มอัปโหลดรูปลายมือชื่อ', () => {
    render(<SignaturePad onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /อัปโหลดรูป/ })).toBeTruthy()
  })
})

describe('SignaturePad — อัปโหลดรูปลายมือชื่อ', () => {
  it('ย่อรูปให้พอดีกรอบเดียวกับพื้นที่วาด', async () => {
    render(<SignaturePad onChange={vi.fn()} />)

    const file = pickFile()

    await waitFor(() => expect(resizeMock).toHaveBeenCalledWith(file, 440, 130))
  })

  it('ส่งรูปที่ย่อแล้วออกไปทาง onChange', async () => {
    const onChange = vi.fn()
    render(<SignaturePad onChange={onChange} />)

    pickFile()

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(UPLOADED))
  })

  it('แทนที่พื้นที่วาดด้วยรูปที่อัปโหลด', async () => {
    render(<SignaturePad onChange={vi.fn()} />)

    pickFile()

    await waitFor(() => expect(preview()).toBeTruthy())
    expect(preview()).toHaveAttribute('src', UPLOADED)
    expect(canvas()).toBeNull()
  })

  it('ล้างลายมือชื่อแล้วกลับมาวาดได้อีกครั้ง', async () => {
    const onChange = vi.fn()
    render(<SignaturePad onChange={onChange} />)

    pickFile()
    await waitFor(() => expect(preview()).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /ล้างลายมือชื่อ/ }))

    expect(preview()).toBeNull()
    expect(canvas()).toBeTruthy()
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it('แจ้งเตือนในหน้าเมื่ออ่านไฟล์ไม่สำเร็จ', async () => {
    resizeMock.mockRejectedValue(new Error('bad image'))
    const onChange = vi.fn()
    render(<SignaturePad onChange={onChange} />)

    pickFile('broken.png')

    await waitFor(() => expect(screen.getByText(/อ่านไฟล์รูปไม่สำเร็จ/)).toBeTruthy())
    expect(preview()).toBeNull()
    expect(canvas()).toBeTruthy()
  })

  it('ล้างข้อความแจ้งเตือนเมื่ออัปโหลดใหม่สำเร็จ', async () => {
    resizeMock.mockRejectedValueOnce(new Error('bad image'))
    render(<SignaturePad onChange={vi.fn()} />)

    pickFile('broken.png')
    await waitFor(() => expect(screen.getByText(/อ่านไฟล์รูปไม่สำเร็จ/)).toBeTruthy())

    pickFile('good.png')

    await waitFor(() => expect(preview()).toBeTruthy())
    expect(screen.queryByText(/อ่านไฟล์รูปไม่สำเร็จ/)).toBeNull()
  })
})
