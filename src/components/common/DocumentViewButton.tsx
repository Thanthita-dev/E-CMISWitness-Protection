import { Button, type ButtonProps } from './Button'

/** Shared action for viewing an existing document in a dossier. */
export function DocumentViewButton(props: Omit<ButtonProps, 'children' | 'variant' | 'size'>) {
  return <Button type="button" variant="secondary" size="md" {...props}>
    <i className="fa-solid fa-eye text-xs" aria-hidden="true" />
    ดูเอกสาร
  </Button>
}
