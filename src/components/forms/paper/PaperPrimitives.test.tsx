import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { FormHead, PaperContext } from './PaperPrimitives'

const ctx: PaperContext = {
  formMeta: { code: 'คบ.1', n: 1, t: 'แบบทดสอบ', d: '' },
  draft: {},
  relatedPersons: [],
  signatures: {},
  val: () => '',
}

describe('FormHead', () => {
  afterEach(cleanup)

  it('centers the seal independently from the document details', () => {
    render(<FormHead ctx={ctx} />)

    expect(screen.getByAltText('ตราสำนักงาน ป.ป.ท.')).toHaveClass('left-1/2', '-translate-x-1/2')
  })

  it('reserves vertical space for the centered seal before the title', () => {
    render(<FormHead ctx={ctx} />)

    expect(screen.getByAltText('ตราสำนักงาน ป.ป.ท.').parentElement).toHaveClass('min-h-[6.5rem]')
  })
})
