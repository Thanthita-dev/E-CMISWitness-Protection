import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { FormPaperViewer } from './FormPaperViewer'
import { FORMS_CATALOG } from '../../lib/constants'
import { useFormDraftStore } from '../../store/useFormDraftStore'

describe('FormPaperViewer', () => {
  FORMS_CATALOG.forEach((f) => {
    it(`renders every page of ${f.code}`, () => {
      const total = f.pages || 1
      for (let p = 1; p <= total; p++) {
        useFormDraftStore.setState({ manualPage: p })
        const { container, unmount } = render(<FormPaperViewer formId={f.n} />)
        expect(container.textContent).toContain('ลับ')
        expect(container.textContent).toContain(f.t)
        unmount()
      }
    })
  })
})
