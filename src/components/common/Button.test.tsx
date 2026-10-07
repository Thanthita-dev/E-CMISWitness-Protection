import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('applies the selected variant and preserves custom classes', () => {
    render(
      <Button variant="danger" className="w-full">
        Delete case
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Delete case' })
    expect(button).toHaveClass('bg-rose-600', 'w-full')
  })

  it('forwards native button props', () => {
    render(
      <Button type="submit" disabled aria-label="Save changes">
        Save
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Save changes' })
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toBeDisabled()
  })

  it('does not add visual styles when preserving a legacy button class', () => {
    render(
      <Button className="text-slate-400">
        Close
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Close' })
    expect(button).toHaveClass('text-slate-400')
    expect(button).not.toHaveClass('bg-blue')
    expect(button).not.toHaveClass('shadow-sm')
    expect(button).not.toHaveClass('px-4')
    expect(button).not.toHaveClass('py-2')
  })
})
