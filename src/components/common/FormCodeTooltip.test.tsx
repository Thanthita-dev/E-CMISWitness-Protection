import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FormCodeTooltip } from './FormCodeTooltip'

describe('FormCodeTooltip', () => {
  afterEach(cleanup)

  it('shows the full form name and description on hover', () => {
    render(
      <FormCodeTooltip formNo={6}>
        <span>คบ.6</span>
      </FormCodeTooltip>,
    )

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.mouseEnter(screen.getByTestId('form-code-tooltip'))

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('บันทึกข้อความการคุ้มครองพยานในเบื้องต้น')
    expect(tooltip).toHaveTextContent('ประเมินความเสี่ยงและเสนอมาตรการ')

    fireEvent.mouseLeave(screen.getByTestId('form-code-tooltip'))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('opens from the info button for keyboard and touch, and closes on Escape', () => {
    render(<FormCodeTooltip formNo={13} />)

    const button = screen.getByRole('button', { name: 'คำอธิบายแบบ คบ.13' })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders children unchanged for an unknown form number', () => {
    render(
      <FormCodeTooltip formNo={99}>
        <span>คบ.99</span>
      </FormCodeTooltip>,
    )

    expect(screen.getByText('คบ.99')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
