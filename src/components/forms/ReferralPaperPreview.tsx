import React from 'react'
import { additionalFormDocument, getAdditionalForm, type AdditionalFormValues } from '../../lib/additionalForms'
import type { ReferralDocumentId } from '../../lib/referralDocumentIdentity'

/** Read-only paper shared by the dossier, historical copies and the registry workspace. */
export function ReferralPaperPreview({ id, draft }: { id: ReferralDocumentId; draft: AdditionalFormValues }) {
  const template = getAdditionalForm(id)!
  const ref = React.useRef<HTMLIFrameElement>(null)
  const container = React.useRef<HTMLDivElement>(null)
  const [height, setHeight] = React.useState(1123)
  const [scale, setScale] = React.useState(1)
  const html = React.useMemo(() => additionalFormDocument(template, draft), [template, draft])
  React.useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source === ref.current?.contentWindow && event.data?.type === 'a6-layout' && event.data.height) setHeight(event.data.height)
    }
    window.addEventListener('message', onMessage)
    const observer = new ResizeObserver(() => { if (container.current) setScale(Math.min(1, container.current.clientWidth / 794)) })
    if (container.current) observer.observe(container.current)
    return () => { window.removeEventListener('message', onMessage); observer.disconnect() }
  }, [])
  return <div ref={container} className="w-full overflow-hidden"><div style={{ height: height * scale, width: 794 * scale, margin: 'auto' }}><iframe ref={ref} title={template.title} srcDoc={html} style={{ border: 0, width: 794, height, transform: `scale(${scale})`, transformOrigin: '0 0' }} /></div></div>
}
