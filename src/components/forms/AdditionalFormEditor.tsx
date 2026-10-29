import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../common/Button'
import { DocumentActionBar, DocumentPageHead, DocumentWorkspace, type DocumentViewMode } from './DocumentWorkspace'
import { EditorShell } from './fields/FormKit'
import {
  additionalFormBody,
  additionalFormDocument,
  additionalParagraphText,
  legacyAdditionalFormHtml,
  type AdditionalField,
  type AdditionalFormTemplate,
  type AdditionalFormValues,
} from '../../lib/additionalForms'
import { useAdditionalFormStore, useLegacyAdditionalFormStore } from '../../store/useAdditionalFormStore'

interface Props {
  template: AdditionalFormTemplate
  onBack: () => void
  signatureAction?: { fieldId: string; label: string; onSign: () => void }
  document?: { draft: AdditionalFormValues; readOnly: boolean; label: string; onSave: (draft: AdditionalFormValues) => void }
}

type PreviewWindow = Window & {
  a6Update?: (html: string) => Promise<void>
  a6Focus?: (id: string) => number | null
  a6Ready?: Promise<void>
  a6SetEditable?: (on: boolean) => void
}

const EMPTY: AdditionalFormValues = { values: {}, paragraphs: {} }
/** หมวดที่ชื่อช่องบอกตำแหน่งชัดแล้ว ไม่ต้องแสดงข้อความรอบช่อง */
const PLAIN_GROUPS = new Set(['หัวหนังสือ', 'ผู้ลงนาม', 'ส่วนท้ายหนังสือ'])
const PX = 96 / 72

const saveFile = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const FieldInput = memo(function FieldInput({ field, value, active, onChange, onFocus }: {
  field: AdditionalField
  value: string
  active: boolean
  onChange: (id: string, value: string) => void
  onFocus: (id: string) => void
}) {
  const id = `a6-field-${field.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const common = {
    id,
    'data-field': field.id,
    className: `ws-input w-full min-w-0${active ? ' ring-2 ring-[#caa631]' : ''}`,
    value,
    onFocus: () => onFocus(field.id),
    onChange: (event: { target: { value: string } }) => onChange(field.id, event.target.value),
  }
  return <div className="space-y-1">
    <label className="ws-label flex flex-wrap items-baseline gap-x-2" htmlFor={id}>
      <span>{field.label}</span>
      {field.uses > 1 && <span className="text-[0.72rem] font-normal text-muted">ใช้ {field.uses} จุดในเอกสาร</span>}
    </label>
    {field.multiline ? <textarea {...common} rows={4} placeholder="พิมพ์ความเห็น (ไม่กรอกจะคงบรรทัดว่างไว้เขียนด้วยมือ)" /> : <input {...common} type="text" />}
    {field.context && !field.multiline && !PLAIN_GROUPS.has(field.group) && <p className="text-[0.75rem] leading-snug text-muted [overflow-wrap:anywhere]">{field.context}</p>}
  </div>
})

export function AdditionalFormEditor({ template, onBack, document: scopedDocument, signatureAction }: Props) {
  const readOnly = scopedDocument?.readOnly ?? false
  const globalSaved = useAdditionalFormStore((state) => state.drafts[template.id])
  const saveGlobalDraft = useAdditionalFormStore((state) => state.saveDraft)
  const saved = scopedDocument?.draft ?? globalSaved
  const saveDraft = (id: string, value: AdditionalFormValues) => {
    if (readOnly) return
    if (scopedDocument) scopedDocument.onSave(value)
    else saveGlobalDraft(id, value)
  }
  const legacy = useLegacyAdditionalFormStore((state) => scopedDocument ? undefined : state.drafts[template.id])
  const [draft, setDraft] = useState<AdditionalFormValues>(() => saved ? { values: { ...saved.values }, paragraphs: { ...saved.paragraphs } } : EMPTY)
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [paragraphKey, setParagraphKey] = useState<string | null>(null)
  const [paragraphText, setParagraphText] = useState('')
  const [scale, setScale] = useState(1)
  const [frameHeight, setFrameHeight] = useState(1123)
  const [pages, setPages] = useState<number | null>(null)
  /** เปิดมาที่ "กรอกบนเอกสาร" — พิมพ์ในช่องบนกระดาษ (ร่างชุดเดียวกับกรอกผ่านแบบฟอร์ม) */
  const [mode, setMode] = useState<DocumentViewMode>('document')
  const expanded = mode === 'document'
  /** ระหว่างพิมพ์บนกระดาษไม่จัดหน้าใหม่ (เคอร์เซอร์จะหลุด) จัดหน้าเมื่อออกจากช่อง */
  const typingOnPaper = useRef(false)
  const [layoutTick, setLayoutTick] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const pageWidthPx = template.layout.page.w * PX
  // เอกสารตั้งต้นสร้างครั้งเดียว ค่าที่กรอกหลังจากนั้นส่งเข้าไปจัดหน้าใหม่โดยไม่โหลดใหม่
  const initialDoc = useMemo(() => additionalFormDocument(template, draftRef.current, { interactive: !readOnly, signableField: signatureAction?.fieldId }), [template])

  const groups = useMemo(() => {
    const map = new Map<string, AdditionalField[]>()
    for (const field of template.fields) {
      if (!map.has(field.group)) map.set(field.group, [])
      map.get(field.group)!.push(field)
    }
    return Array.from(map.entries())
  }, [template])

  const filteredGroups = useMemo(() => {
    const q = query.trim()
    if (!q) return groups
    return groups
      .map(([name, fields]) => [name, fields.filter((field) => `${field.label} ${field.context} ${draft.values[field.id] ?? field.sample}`.includes(q))] as [string, AdditionalField[]])
      .filter(([, fields]) => fields.length)
  }, [groups, query, draft.values])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const resize = () => {
      const available = stage.clientWidth - (window.innerWidth >= 768 ? 48 : 24)
      if (available > 0) setScale(Math.min(1, available / pageWidthPx))
    }
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize)
    observer?.observe(stage)
    window.addEventListener('resize', resize)
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize) }
  }, [mode, pageWidthPx])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  const focusField = useCallback((id: string, fromPaper: boolean) => {
    setActive(id)
    const field = template.fields.find((item) => item.id === id)
    if (field) setOpenGroups((current) => ({ ...current, [field.group]: true }))
    const win = frameRef.current?.contentWindow as PreviewWindow | null
    const top = win?.a6Focus?.(id)
    if (!fromPaper && typeof top === 'number' && stageRef.current) {
      const container = stageRef.current.closest('section')
      container?.scrollTo?.({ top: Math.max(0, top * scale - 120), behavior: 'smooth' })
    }
    if (fromPaper) {
      setQuery('')
      setTimeout(() => {
        const input = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(id)}"]`)
        input?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
        input?.focus({ preventScroll: true })
      }, 0)
    }
  }, [template.fields, scale])

  // ข้อความจากกระดาษในตัวอย่าง: คลิกช่องเพื่อไปที่ช่องกรอก คลิกย่อหน้าเพื่อแก้ทั้งย่อหน้า
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return
      const data = event.data as { type?: string; id?: string; key?: string; height?: number; pages?: number }
      if (readOnly && data.type !== 'a6-layout') return
      if (data.type === 'a6-input' && data.id) {
        typingOnPaper.current = true
        const id = data.id
        const value = (event.data as { value?: string }).value ?? ''
        setDraft((current) => ({ ...current, values: { ...current.values, [id]: value } }))
        setDirty(true)
        setMessage('')
      } else if (data.type === 'a6-commit') {
        typingOnPaper.current = false
        setLayoutTick((n) => n + 1)
      } else if (data.type === 'a6-layout') {
        if (data.height) setFrameHeight(data.height)
        if (data.pages) setPages(data.pages)
      } else if (data.type === 'a6-field' && data.id) {
        setParagraphKey(null)
        focusField(data.id, true)
      } else if (data.type === 'a6-paragraph' && data.key) {
        setParagraphKey(data.key)
        setParagraphText(additionalParagraphText(template, data.key, draftRef.current) ?? '')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [focusField, template, readOnly])

  // ส่งค่าที่กรอกไปจัดหน้าบนกระดาษทันที
  useEffect(() => {
    if (typingOnPaper.current) return
    const timer = setTimeout(() => {
      const win = frameRef.current?.contentWindow as PreviewWindow | null
      win?.a6Update?.(additionalFormBody(template, draft, { interactive: !readOnly, signableField: signatureAction?.fieldId }))?.then(() => { if (active) win.a6Focus?.(active) })
    }, 120)
    return () => clearTimeout(timer)
  }, [draft, template, layoutTick]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (frameRef.current?.contentWindow as PreviewWindow | null)?.a6SetEditable?.(expanded && !readOnly)
  }, [expanded, readOnly])

  const changeField = useCallback((id: string, value: string) => {
    setDraft((current) => ({ ...current, values: { ...current.values, [id]: value } }))
    setDirty(true)
    setMessage('')
  }, [])
  const onFieldFocus = useCallback((id: string) => focusField(id, false), [focusField])

  function save() {
    try {
      saveDraft(template.id, draft)
      setDirty(false)
      setMessage(scopedDocument ? 'บันทึกร่างในแฟ้มแล้ว' : 'บันทึกร่างในเบราว์เซอร์นี้แล้ว')
    } catch {
      setMessage('บันทึกร่างไม่ได้ กรุณาลองบันทึกอีกครั้ง')
    }
  }

  function print() {
    const frame = document.createElement('iframe')
    frame.title = 'พิมพ์หนังสือประกอบ'
    frame.setAttribute('aria-hidden', 'true')
    // ต้องมีขนาดจริงเพื่อให้จัดหน้าได้ แต่ไม่แสดงบนจอ
    Object.assign(frame.style, { position: 'fixed', left: '-20000px', top: '0', width: `${Math.ceil(pageWidthPx)}px`, height: '200px', border: '0' })
    frame.onload = () => {
      const printWindow = frame.contentWindow as PreviewWindow | null
      if (!printWindow) { frame.remove(); return }
      const ready = printWindow.a6Ready ?? Promise.resolve()
      ready.then(() => {
        printWindow.addEventListener('afterprint', () => frame.remove(), { once: true })
        printWindow.focus()
        printWindow.print()
      })
    }
    frame.srcdoc = additionalFormDocument(template, draft)
    document.body.appendChild(frame)
  }

  function back() {
    // เก็บร่างก่อนกลับรายการ เพื่อไม่ให้ข้อมูลที่เพิ่งกรอกหาย
    if (dirty) {
      try { saveDraft(template.id, draft) } catch {
        setMessage('บันทึกร่างไม่ได้ กรุณาลองบันทึกอีกครั้งก่อนกลับรายการ')
        return
      }
    }
    onBack()
  }

  function applyParagraph() {
    if (!paragraphKey) return
    setDraft((current) => ({ ...current, paragraphs: { ...current.paragraphs, [paragraphKey]: paragraphText } }))
    setDirty(true)
    setMessage('')
  }

  function restoreParagraph() {
    if (!paragraphKey) return
    setDraft((current) => {
      const paragraphs = { ...current.paragraphs }
      delete paragraphs[paragraphKey]
      setParagraphText(additionalParagraphText(template, paragraphKey, { ...current, paragraphs }) ?? '')
      return { ...current, paragraphs }
    })
    setDirty(true)
  }

  const filled = Object.keys(draft.values).length
  const edited = Object.keys(draft.paragraphs).length
  const { page } = template.layout
  const paperLabel = `${Math.round(page.w / 72 * 25.4)}×${Math.round(page.h / 72 * 25.4)} มม. (A4) แนว${page.orient === 'landscape' ? 'นอน' : 'ตั้ง'}`

  const statusEl = <p className="text-[0.88rem] text-muted" role="status" aria-live="polite">{message || (dirty ? 'มีการแก้ไขที่ยังไม่ได้บันทึก' : saved ? 'เปิดร่างที่บันทึกไว้ในเบราว์เซอร์นี้' : 'ช่องที่ยังไม่กรอกแสดงข้อความตามต้นฉบับ')}</p>
  const legacyEl = legacy && <div className="rounded-lg border border-line bg-[#f7edcb] px-4 py-3 text-[0.85rem] text-ink">
    <p>มีร่างที่บันทึกแบบแก้ทีละย่อหน้าไว้ก่อนหน้า ร่างเดิมยังเก็บอยู่ ไม่ถูกแทนที่</p>
    <Button variant="ghost" size="md" onClick={() => saveFile(new Blob([legacyAdditionalFormHtml(template, legacy.texts)], { type: 'text/html;charset=utf-8' }), `${template.title} (ร่างเดิม).html`)}>ดาวน์โหลดร่างเดิม</Button>
  </div>
  const paragraphEl = paragraphKey && <div className="space-y-2 rounded-lg border border-line bg-[#f4f5f6] p-4">
    <label className="ws-label" htmlFor="additional-paragraph">แก้ข้อความทั้งย่อหน้า</label>
    <p className="text-[0.75rem] text-muted">ใช้เมื่อต้องเปลี่ยนข้อความนอกช่องกรอก ย่อหน้าที่แก้แล้วจะใช้ข้อความนี้แทนช่องข้อมูลในย่อหน้านั้น</p>
    <textarea id="additional-paragraph" className="ws-input w-full leading-relaxed" rows={6} value={paragraphText} onChange={(event) => setParagraphText(event.target.value)} />
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" size="md" onClick={applyParagraph}>ใช้ข้อความนี้</Button>
      {draft.paragraphs[paragraphKey] !== undefined && <Button variant="secondary" size="md" onClick={restoreParagraph}>คืนข้อความต้นฉบับ</Button>}
      <Button variant="ghost" size="md" onClick={() => setParagraphKey(null)}>ปิด</Button>
    </div>
  </div>
  const saveButtons = <>
    {signatureAction && <Button variant="primary" size="md" onClick={signatureAction.onSign}><i className="fa-solid fa-signature" aria-hidden="true" />{signatureAction.label}</Button>}
    {!readOnly && <Button variant="primary" size="md" onClick={save}><i className="fa-solid fa-floppy-disk" aria-hidden="true" />บันทึกร่าง</Button>}
  </>
  const sourceTools = <div className="space-y-3 border-t border-line pt-3">
    <a className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy hover:bg-slate-50" href={template.sourceUrl} download={template.sourceName}><i className="fa-solid fa-file-word" aria-hidden="true" />ดาวน์โหลด Word ต้นฉบับ</a>
    {confirmReset ? <div className="space-y-3">
      <p className="text-sm text-muted">ล้างข้อมูลที่กรอกและย่อหน้าที่แก้ของร่างนี้ กลับไปใช้ข้อความตามต้นฉบับ?</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="md" onClick={() => {
          setDraft(EMPTY); setParagraphKey(null)
          setDirty(true); setMessage(''); setConfirmReset(false)
        }}>คืนข้อความต้นฉบับ</Button>
        <Button variant="ghost" size="md" onClick={() => setConfirmReset(false)}>ยกเลิก</Button>
      </div>
    </div> : <Button variant="ghost" size="md" onClick={() => setConfirmReset(true)}>เริ่มร่างใหม่จากต้นฉบับ</Button>}
  </div>

  const editor = <fieldset disabled={readOnly}><EditorShell code="หนังสือประกอบ" title="กรอกข้อมูลเอกสาร" hint="กรอกตามช่อง หรือคลิกข้อความบนกระดาษเพื่อไปยังช่องที่ตรงกัน" footer={saveButtons}>
    {statusEl}
    {legacyEl}
    {paragraphEl}

    <div className="space-y-1">
      <label className="ws-label" htmlFor="additional-search">ค้นหาช่อง</label>
      <input id="additional-search" className="ws-input w-full" type="search" value={query} placeholder="เช่น วันที่ ชื่อพยาน สภ." onChange={(event) => setQuery(event.target.value)} />
      <p className="text-[0.75rem] text-muted">{template.fields.length} ช่อง · กรอกแล้ว {filled}{edited ? ` · แก้ทั้งย่อหน้า ${edited}` : ''}</p>
    </div>

    <div className="space-y-2">
      {filteredGroups.map(([name, fields], index) => {
        const open = query.trim() ? true : openGroups[name] ?? index < 2
        const groupFilled = fields.filter((field) => draft.values[field.id] !== undefined).length
        return <details key={name} open={open} className="rounded-lg border border-line bg-white" onToggle={(event) => {
          const next = (event.currentTarget as HTMLDetailsElement).open
          if (next !== open) setOpenGroups((current) => ({ ...current, [name]: next }))
        }}>
          <summary className="flex min-h-[44px] cursor-pointer items-center justify-between gap-2 px-4 py-2 text-[0.92rem] font-bold text-navy">
            <span className="min-w-0 [overflow-wrap:anywhere]">{name}</span>
            <span className="shrink-0 text-[0.75rem] font-semibold text-muted">{groupFilled}/{fields.length}</span>
          </summary>
          {open && <div className="space-y-3 border-t border-line px-4 py-3">
            {fields.map((field) => <FieldInput key={field.id} field={field} active={active === field.id}
              value={draft.values[field.id] ?? field.sample} onChange={changeField} onFocus={onFieldFocus} />)}
          </div>}
        </details>
      })}
      {!filteredGroups.length && <p className="text-sm text-muted">ไม่พบช่องที่ตรงกับคำค้น</p>}
    </div>

    {sourceTools}
  </EditorShell></fieldset>

  /** โหมดกรอกบนเอกสาร (กระดาษเต็มหน้า): คลิกย่อหน้าบนกระดาษเพื่อแก้ทั้งย่อหน้าในหน้าต่างนี้ */
  const paragraphDialog = mode === 'document' && paragraphEl && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,0.52)] p-4">
      <div role="dialog" aria-modal="true" aria-label="แก้ข้อความทั้งย่อหน้า" className="w-full max-w-[42rem] rounded-xl bg-white p-5 shadow-[0_20px_50px_rgba(8,43,80,0.25)]">{paragraphEl}</div>
    </div>
  )

  return <div className="space-y-3">
    <DocumentPageHead
      title={template.title}
      meta={<>{scopedDocument?.label || template.category} · {paperLabel}</>}
      status={<span className={saved || dirty ? 'ws-status success' : 'ws-status'}>{readOnly ? 'ดูเอกสาร' : dirty ? 'กำลังแก้ไขร่าง' : saved ? 'ร่างเอกสาร' : 'ยังไม่ได้กรอก'}</span>}
      actions={<>
        {mode === 'document' && <a className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy hover:bg-slate-50" href={template.sourceUrl} download={template.sourceName}><i className="fa-solid fa-file-word" aria-hidden="true" />Word ต้นฉบับ</a>}
        <Button variant="secondary" size="md" onClick={print}><i className="fa-solid fa-print" aria-hidden="true" />พิมพ์ / บันทึก PDF</Button>
      </>}
    />
    <DocumentWorkspace mode={mode} onModeChange={setMode} editor={editor} status={mode === 'document' ? (message || (dirty ? 'มีการแก้ไขที่ยังไม่ได้บันทึก' : undefined)) : undefined}>
      <div ref={stageRef} className="relative w-full overflow-hidden rounded-[10px] bg-[#e9edf1] px-3 py-4" aria-label="ตัวอย่างร่างเอกสาร">
        <div className="mx-auto" style={{ width: pageWidthPx * scale, height: frameHeight * scale }}>
          <iframe ref={frameRef} title={`ตัวอย่าง ${template.title}`} srcDoc={initialDoc}
            onLoad={() => {
              (frameRef.current?.contentWindow as PreviewWindow | null)?.a6SetEditable?.(expanded && !readOnly)
              const paper = frameRef.current?.contentDocument
              if (paper && signatureAction) paper.addEventListener('click', event => {
                const target = event.target as HTMLElement
                if (target.closest?.('[data-sign-field]')?.getAttribute('data-sign-field') === signatureAction.fieldId) signatureAction.onSign()
              })
            }}
            style={{ width: pageWidthPx, height: frameHeight, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', display: 'block' }} />
        </div>
      </div>
    </DocumentWorkspace>
    <DocumentActionBar
      back={<Button variant="secondary" size="md" onClick={back}><i className="fa-solid fa-arrow-left" aria-hidden="true" />{scopedDocument && scopedDocument.label !== 'ตัวอย่างต้นฉบับ' ? 'กลับแฟ้มคำร้อง' : 'กลับรายการแบบฟอร์ม'}</Button>}
      info={pages ? `ทั้งหมด ${pages} หน้า` : 'กำลังจัดหน้า'}
    >{mode === 'document' && saveButtons}</DocumentActionBar>
    {paragraphDialog}
    {mode === 'document' && legacyEl && <div className="ws-card p-4">{legacyEl}</div>}
  </div>
}
