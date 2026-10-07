import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './Button'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { FORMS_CATALOG } from '../../lib/constants'
import { nowDisplay, getCaseFormNumbers } from '../../lib/utils'
import { showConfirmAlert, showToast } from '../../lib/swal'
import { ATTACHMENT_ACCEPT, filterValidAttachments } from '../../lib/fileValidation'
import { AttachmentSet } from '../../types/case'
import { isPrivacyBlocked, privacyBlockedMessage } from '../../lib/privacyGuard'
import { useAuthStore } from '../../store/useAuthStore'
import { useAuditStore } from '../../store/useAuditStore'
import { isCaseClosed } from '../../lib/permissions'

/**
 * FileManager — ตัวจัดการไฟล์ของสำนวนแบบ Google Drive
 *
 * โครงโฟลเดอร์ (แฟ้มสำนวน)
 *   แฟ้ม <เลขสำนวน>
 *     ├── 📁 คบ.1 ─── 📁 ชุดเอกสาร ─── 📄 ไฟล์
 *     ├── 📁 คบ.3 ─── ...
 *     └── 📄 ไฟล์แฟ้มที่ไม่ผูกกับ คบ. (case.documents)
 *
 * scope='form'   เปิดจากแท็บในแบบ คบ. — จำกัดอยู่ในโฟลเดอร์ คบ. นั้นฉบับเดียว
 * scope='dossier' เปิดจากหน้าแฟ้ม — เห็นทั้งแฟ้ม
 *
 * อัปโหลดลงโฟลเดอร์ที่เปิดอยู่เสมอ (ไม่มีตัวเลือกปลายทาง) — ต้องการอัปโหลดที่ไหนให้เปิดโฟลเดอร์นั้นก่อน
 */

interface FileManagerProps {
  scope: 'dossier' | 'form'
  /** แบบ คบ. ที่เป็นรากของมุมมอง — จำเป็นเมื่อ scope='form' */
  formId?: number
  /** เลขสำนวนสำหรับไฟล์แฟ้ม (case.documents) — ไม่ระบุจะใช้สำนวนที่เปิดอยู่ */
  caseNo?: string
  canEdit?: boolean
}

type SortKey = 'name' | 'date' | 'size'
type ViewMode = 'list' | 'grid'

interface FolderNode {
  id: string
  kind: 'form' | 'set'
  name: string
  subtitle?: string
  formId: number
  setId?: number
  fileCount: number
}

type FileOrigin = { kind: 'set'; setId: number; index: number } | { kind: 'case'; docId: string }

interface FileNode {
  key: string
  name: string
  size: number
  type: string
  uploadedAt: string
  uploadedBy: string
  previewUrl?: string | null
  /** เส้นทางที่ไฟล์อยู่ ใช้แสดงตอนค้นหาข้ามโฟลเดอร์ */
  location: string
  origin: FileOrigin
}

/** ชุดเอกสารที่ไม่ระบุ formId เป็นข้อมูลเดิมของ คบ.1 */
const setFormId = (set: AttachmentSet) => set.formId ?? 1

const formCode = (n: number) => FORMS_CATALOG.find((f) => f.n === n)?.code || `คบ.${n}`
const formTitle = (n: number) => FORMS_CATALOG.find((f) => f.n === n)?.t || ''

/** เดาชนิดไฟล์จากนามสกุล สำหรับเอกสารเดิมในแฟ้มที่ไม่ได้เก็บ mime type ไว้ */
const guessType = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return `image/${ext}`
  if (['mp3', 'wav', 'm4a'].includes(ext)) return `audio/${ext}`
  if (['mp4', 'mov', 'avi'].includes(ext)) return `video/${ext}`
  if (['doc', 'docx'].includes(ext)) return 'application/msword'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'application/vnd.ms-excel'
  return 'application/pdf'
}

const fileIcon = (type: string) => {
  if (type.startsWith('image/')) return { icon: 'fa-file-image', tone: 'text-emerald-600', bg: 'bg-emerald-50' }
  if (type.startsWith('audio/')) return { icon: 'fa-file-audio', tone: 'text-violet-600', bg: 'bg-violet-50' }
  if (type.startsWith('video/')) return { icon: 'fa-file-video', tone: 'text-amber-600', bg: 'bg-amber-50' }
  if (type.includes('word')) return { icon: 'fa-file-word', tone: 'text-blue-600', bg: 'bg-blue-50' }
  if (type.includes('excel') || type.includes('sheet')) return { icon: 'fa-file-excel', tone: 'text-green-700', bg: 'bg-green-50' }
  return { icon: 'fa-file-pdf', tone: 'text-rose-600', bg: 'bg-rose-50' }
}

const readableSize = (size: number) => {
  if (!size) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/** '04/08/2569 09:20' → ตัวเลขเรียงลำดับได้ (ไม่ต้องแม่นระดับวินาที แค่ให้เรียงถูก) */
const sortableDate = (value: string) => {
  const m = value?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!m) return 0
  const [, d, mo, y, h = '0', mi = '0'] = m
  return Number(y) * 1e8 + Number(mo) * 1e6 + Number(d) * 1e4 + Number(h) * 1e2 + Number(mi)
}

export const FileManager: React.FC<FileManagerProps> = ({ scope, formId, caseNo, canEdit: canEditProp = true }) => {
  const {
    attachmentSets,
    addAttachmentSet,
    addFileToSet,
    ensureSetForForm,
    removeFilesFromSet,
  } = useFormDraftStore()
  const caseItem = useCaseStore((state) => state.getCase(caseNo))
  /** WIT1148 — แฟ้มปิดงานคุ้มครองแล้ว: ดู/ดาวน์โหลดได้ แต่อัปโหลด/ลบ/สร้างโฟลเดอร์ไม่ได้ */
  const canEdit = canEditProp && !(caseNo && isCaseClosed(caseItem))
  /**
   * WIT0833 / WIT0837 — มาตรการปกปิดข้อ 15(3) ต้องบล็อกการดาวน์โหลดของผู้ใช้นอกขอบเขตจริง
   * และทุกการดาวน์โหลด/ความพยายามที่ถูกบล็อกต้องถูกบันทึกลง Access Log ของแฟ้ม
   */
  const currentRole = useAuthStore((state) => state.currentRole)
  const addAuditLog = useAuditStore((state) => state.addLog)
  const downloadBlocked = Boolean(caseItem && isPrivacyBlocked(caseItem, currentRole, 'download'))
  const logDownload = (fileName: string) => {
    if (!caseItem) return
    addAuditLog({
      caseNo: caseItem.no,
      actorName: currentRole,
      actorRole: currentRole,
      action: `ส่งออก/ดาวน์โหลดเอกสาร: ${fileName}`,
      docRef: fileName,
    })
  }
  const logBlockedDownload = (fileName: string) => {
    if (!caseItem) return
    addAuditLog({
      caseNo: caseItem.no,
      actorName: currentRole,
      actorRole: currentRole,
      action: `ถูกบล็อกการดาวน์โหลดตามมาตรการปกปิดข้อมูลพยาน: ${fileName}`,
      docRef: fileName,
    })
  }
  const addCaseDocument = useCaseStore((state) => state.addCaseDocument)
  const removeCaseDocument = useCaseStore((state) => state.removeCaseDocument)

  const rootId = scope === 'form' && typeof formId === 'number' ? `form-${formId}` : null
  const rootLabel = rootId ? formCode(formId as number) : `แฟ้ม ${caseItem?.no || 'สำนวน'}`

  const [path, setPath] = useState<string[]>(rootId ? [rootId] : [])
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ViewMode>('list')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  /** อยู่ในขอบเขต คบ. ฉบับเดียว → ตัดชุดเอกสารของแบบอื่นออกทั้งหมด */
  const scopedSets = useMemo(
    () => (rootId ? attachmentSets.filter((s) => setFormId(s) === formId) : attachmentSets),
    [attachmentSets, rootId, formId]
  )

  const currentId = path[path.length - 1] || null

  /** โฟลเดอร์ทั้งหมดในขอบเขตนี้ ใช้ทั้งการเดินโฟลเดอร์และเป็นปลายทางอัปโหลด/ย้าย */
  const allFolders = useMemo<FolderNode[]>(() => {
    const forms = new Map<number, AttachmentSet[]>()
    scopedSets.forEach((s) => {
      const n = setFormId(s)
      forms.set(n, [...(forms.get(n) || []), s])
    })
    /** ขอบเขตทั้งแฟ้ม — สร้างโฟลเดอร์ให้ครบทุกแบบ คบ. ของสำนวนนี้ แม้ยังไม่มีไฟล์แนบ ให้ตรงกับส่วน "แบบฟอร์ม คบ. ในแฟ้มนี้" */
    if (!rootId && caseItem) {
      getCaseFormNumbers(caseItem).forEach((n) => {
        if (!forms.has(n)) forms.set(n, [])
      })
    }
    const nodes: FolderNode[] = []
    Array.from(forms.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([n, sets]) => {
        nodes.push({
          id: `form-${n}`,
          kind: 'form',
          name: formCode(n),
          subtitle: formTitle(n),
          formId: n,
          fileCount: sets.reduce((sum, s) => sum + s.files.length, 0),
        })
        sets.forEach((s) =>
          nodes.push({
            id: `set-${s.id}`,
            kind: 'set',
            name: s.category,
            subtitle: s.description,
            formId: n,
            setId: s.id,
            fileCount: s.files.length,
          })
        )
      })
    return nodes
  }, [scopedSets, rootId, caseItem])

  const folderById = useMemo(() => new Map(allFolders.map((f) => [f.id, f])), [allFolders])

  /** ไฟล์ทั้งหมดในขอบเขต พร้อม parent id เพื่อกรองตามโฟลเดอร์ปัจจุบันและค้นหาข้ามโฟลเดอร์ */
  const allFiles = useMemo<Array<FileNode & { parentId: string | null }>>(() => {
    const items: Array<FileNode & { parentId: string | null }> = []

    scopedSets.forEach((set) => {
      const n = setFormId(set)
      set.files.forEach((file, index) => {
        items.push({
          key: `set-${set.id}-${index}`,
          name: file.name,
          size: file.size,
          type: file.type || guessType(file.name),
          uploadedAt: file.uploadedAt,
          uploadedBy: file.uploadedBy,
          previewUrl: file.previewUrl,
          location: `${formCode(n)} › ${set.category}`,
          origin: { kind: 'set', setId: set.id, index },
          parentId: `set-${set.id}`,
        })
      })
    })

    /** ไฟล์แฟ้มที่ไม่ผูกกับ คบ. อยู่ที่รากของแฟ้ม — ไม่แสดงในมุมมองที่จำกัดเป็น คบ. ฉบับเดียว */
    if (!rootId) {
      ;(caseItem?.documents || [])
        .filter((doc) => !doc.deleted)
        .forEach((doc) => {
          items.push({
            key: `case-${doc.id}`,
            name: doc.name,
            size: 0,
            type: guessType(doc.name),
            uploadedAt: doc.uploadedAt || '',
            uploadedBy: doc.uploadedBy || '—',
            previewUrl: doc.previewUrl,
            location: rootLabel,
            origin: { kind: 'case', docId: doc.id },
            parentId: null,
          })
        })
    }

    return items
  }, [scopedSets, caseItem?.documents, rootId, rootLabel])

  const searching = query.trim().length > 0

  /** เนื้อหาที่แสดง: ค้นหา = ทุกไฟล์ในขอบเขต, ไม่ค้นหา = เฉพาะลูกของโฟลเดอร์ปัจจุบัน */
  const visibleFolders = useMemo(() => {
    if (searching) return []
    if (!currentId) return allFolders.filter((f) => f.kind === 'form')
    const current = folderById.get(currentId)
    if (!current || current.kind === 'set') return []
    return allFolders.filter((f) => f.kind === 'set' && f.formId === current.formId)
  }, [searching, currentId, allFolders, folderById])

  const visibleFiles = useMemo(() => {
    const base = searching
      ? allFiles.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))
      : allFiles.filter((f) => f.parentId === currentId)

    const dir = sortAsc ? 1 : -1
    return [...base].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'th') * dir
      if (sortKey === 'size') return (a.size - b.size) * dir
      return (sortableDate(a.uploadedAt) - sortableDate(b.uploadedAt)) * dir
    })
  }, [searching, query, allFiles, currentId, sortKey, sortAsc])

  /** ล้างการเลือกทุกครั้งที่เปลี่ยนโฟลเดอร์หรือคำค้น */
  useEffect(() => {
    setSelected([])
  }, [currentId, query])

  const currentFolder = currentId ? folderById.get(currentId) : undefined

  const breadcrumb = useMemo(() => {
    const crumbs = [{ id: null as string | null, label: rootLabel }]
    path.forEach((id, idx) => {
      if (rootId && idx === 0) {
        crumbs[0] = { id, label: rootLabel }
        return
      }
      const node = folderById.get(id)
      if (node) crumbs.push({ id, label: node.name })
    })
    return crumbs
  }, [path, folderById, rootLabel, rootId])

  /** กันการดับเบิลคลิกยิง onClick สองครั้งจนเดินซ้ำโฟลเดอร์เดิม */
  const openFolder = (id: string) =>
    setPath((prev) => (prev[prev.length - 1] === id ? prev : [...prev, id]))
  const goToCrumb = (index: number) => setPath((prev) => prev.slice(0, index + (rootId ? 1 : 0)))
  const goUp = () => setPath((prev) => (prev.length > (rootId ? 1 : 0) ? prev.slice(0, -1) : prev))

  const toggleSelect = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  const allSelected = visibleFiles.length > 0 && selected.length === visibleFiles.length
  const toggleSelectAll = () => setSelected(allSelected ? [] : visibleFiles.map((f) => f.key))

  /** ---------- อัปโหลด ---------- */

  const uploadInto = (rawFiles: File[], destination: string) => {
    if (rawFiles.length === 0) return

    /** คัดไฟล์ที่นามสกุลไม่รองรับ/เกิน 20MB ออกก่อน ครอบทั้งการเลือกไฟล์และการลากวาง */
    const { accepted: files, rejections } = filterValidAttachments(rawFiles)
    rejections.forEach((message) => showToast(message, 'error'))
    if (files.length === 0) return

    if (destination === 'dossier') {
      if (!caseItem) {
        showToast('ยังไม่มีสำนวนที่เปิดอยู่ — อัปโหลดเข้าแฟ้มไม่ได้')
        return
      }
      files.forEach((file) => {
        addCaseDocument(caseItem.no, {
          id: `DOC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          category: 'other',
          name: file.name,
          uploadedBy: 'เจ้าหน้าที่ ป.ป.ท.',
          uploadedAt: nowDisplay(),
          previewUrl: URL.createObjectURL(file),
          note: 'ไฟล์แฟ้ม — ไม่ผูกกับแบบ คบ. ใด',
        })
      })
      showToast(`อัปโหลด ${files.length} ไฟล์เข้าแฟ้มสำนวนแล้ว`)
      return
    }

    /** 'set-<id>' ลงชุดนั้นตรง ๆ, 'form-<n>' ลงชุดเริ่มต้นของแบบนั้น */
    let setId: number
    if (destination.startsWith('set-')) {
      setId = Number(destination.slice(4))
    } else {
      setId = ensureSetForForm(Number(destination.slice(5)))
    }

    files.forEach((file) => {
      addFileToSet(setId, {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        previewUrl: URL.createObjectURL(file),
      })
    })
    const label = folderById.get(destination)?.name || 'โฟลเดอร์'
    showToast(`อัปโหลด ${files.length} ไฟล์เข้า ${label} แล้ว`)
  }

  /** โฟลเดอร์ปลายทางตามตำแหน่งที่ยืนอยู่ */
  const resolveDestination = () => currentId || rootId || 'dossier'

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) uploadInto(Array.from(files), resolveDestination())
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!canEdit) return
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length > 0) uploadInto(files, resolveDestination())
  }

  /** ---------- ลบ ---------- */

  const selectedNodes = useMemo(() => visibleFiles.filter((f) => selected.includes(f.key)), [visibleFiles, selected])

  const handleDeleteSelected = () => {
    showConfirmAlert({
      icon: 'warning',
      title: 'ยืนยันการลบไฟล์',
      text: `ต้องการลบ ${selectedNodes.length} ไฟล์ที่เลือกใช่หรือไม่? การลบไม่สามารถย้อนกลับได้`,
      showCancelButton: true,
      confirmButtonText: 'ลบไฟล์',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      const bySet = new Map<number, number[]>()
      selectedNodes.forEach((node) => {
        if (node.origin.kind === 'set') {
          bySet.set(node.origin.setId, [...(bySet.get(node.origin.setId) || []), node.origin.index])
        } else if (caseItem) {
          removeCaseDocument(caseItem.no, node.origin.docId)
        }
      })
      bySet.forEach((indexes, setId) => removeFilesFromSet(setId, indexes))
      showToast(`ลบ ${selectedNodes.length} ไฟล์แล้ว`)
      setSelected([])
    })
  }

  const handleNewFolder = () => {
    const targetForm = currentFolder?.formId ?? (rootId ? (formId as number) : null)
    if (targetForm === null) {
      showToast('เปิดโฟลเดอร์ของแบบ คบ. ก่อน จึงจะสร้างชุดเอกสารใหม่ได้')
      return
    }
    const id = addAttachmentSet('ชุดเอกสารใหม่', `ไฟล์แนบของแบบ ${formCode(targetForm)}`, targetForm)
    showToast(`สร้างชุดเอกสารใหม่ใน ${formCode(targetForm)} แล้ว`)
    setPath((prev) => (currentFolder?.kind === 'form' ? [...prev, `set-${id}`] : prev))
  }

  const totalFiles = allFiles.length

  return (
    <div className="space-y-3">
      {/* แถบเครื่องมือ */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <Button
          type="button"
          onClick={goUp}
          disabled={path.length <= (rootId ? 1 : 0)}
          title="ขึ้นหนึ่งระดับ"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
        >
          <i className="fa-solid fa-arrow-turn-up text-xs" />
        </Button>

        <div className="relative min-w-[160px] flex-1">
          <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`ค้นหาไฟล์ใน ${rootLabel}`}
            className="ws-input !pl-8"
          />
        </div>

        <select
          value={`${sortKey}-${sortAsc ? 'asc' : 'desc'}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split('-')
            setSortKey(key as SortKey)
            setSortAsc(dir === 'asc')
          }}
          className="ws-input !w-auto"
        >
          <option value="date-desc">ล่าสุดก่อน</option>
          <option value="date-asc">เก่าสุดก่อน</option>
          <option value="name-asc">ชื่อ ก–ฮ</option>
          <option value="name-desc">ชื่อ ฮ–ก</option>
          <option value="size-desc">ขนาดมากก่อน</option>
          <option value="size-asc">ขนาดน้อยก่อน</option>
        </select>

        <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white">
          {(['list', 'grid'] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              title={mode === 'list' ? 'มุมมองตาราง' : 'มุมมองกริด'}
              className={`flex h-8 w-8 items-center justify-center text-xs transition ${
                view === mode ? 'bg-blue text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <i className={`fa-solid ${mode === 'list' ? 'fa-list' : 'fa-table-cells-large'}`} />
            </Button>
          ))}
        </div>

        {canEdit && (
          <>
            <Button
              type="button"
              onClick={handleNewFolder}
              variant="secondary"
              size="md"
            >
              <i className="fa-solid fa-folder-plus text-xs" />
              ชุดเอกสารใหม่
            </Button>

            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              variant="primary"
              size="md"
            >
              <i className="fa-solid fa-cloud-arrow-up text-xs" />
              อัปโหลด
            </Button>
            <input ref={inputRef} type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handlePick} />
          </>
        )}
      </div>

      {/* เส้นทางโฟลเดอร์ */}
      <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
        {breadcrumb.map((crumb, idx) => (
          <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
            {idx > 0 && <i className="fa-solid fa-chevron-right text-[8px] text-slate-300" />}
            <Button
              type="button"
              onClick={() => goToCrumb(idx)}
              className={`rounded px-1.5 py-0.5 transition hover:bg-slate-100 ${
                idx === breadcrumb.length - 1 ? 'font-bold text-navy-deep' : 'text-slate-500'
              }`}
            >
              {idx === 0 && <i className="fa-solid fa-folder-open mr-1 text-[10px] text-blue" />}
              {crumb.label}
            </Button>
          </span>
        ))}
        <span className="ml-auto text-xs text-slate-400">
          {searching ? `พบ ${visibleFiles.length} ไฟล์` : `ทั้งหมด ${totalFiles} ไฟล์ในขอบเขตนี้`}
        </span>
      </div>

      {/* แถบการเลือกหลายไฟล์ */}
      {selected.length > 0 && canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
          <span className="text-xs font-bold text-blue-800">เลือก {selected.length} ไฟล์</span>
          <Button
            type="button"
            onClick={handleDeleteSelected}
            variant="danger"
            size="md"
          >
            <i className="fa-solid fa-trash text-[10px]" />
            ลบ
          </Button>
          <Button
            type="button"
            onClick={() => setSelected([])}
            className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            ยกเลิกการเลือก
          </Button>
        </div>
      )}

      {/* พื้นที่ไฟล์ — ลากไฟล์มาวางเพื่ออัปโหลดได้ */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (canEdit) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`min-h-[180px] rounded-xl border p-3 transition ${
          dragging ? 'border-blue border-dashed bg-blue-50/60' : 'border-slate-200 bg-white'
        }`}
      >
        {dragging && (
          <div className="mb-3 rounded-lg border border-dashed border-blue bg-blue-50 p-3 text-center text-xs font-bold text-blue-700">
            <i className="fa-solid fa-cloud-arrow-up mr-1.5" />
            วางไฟล์เพื่ออัปโหลดเข้า{' '}
            {resolveDestination() === 'dossier' ? rootLabel : folderById.get(resolveDestination())?.name || rootLabel}
          </div>
        )}

        {visibleFolders.length === 0 && visibleFiles.length === 0 ? (
          <div className="flex min-h-[150px] flex-col items-center justify-center gap-2 text-center">
            <i className="fa-regular fa-folder-open text-2xl text-slate-300" />
            <p className="text-xs text-slate-400">
              {searching ? `ไม่พบไฟล์ที่ตรงกับ “${query}”` : 'โฟลเดอร์นี้ยังว่างอยู่'}
            </p>
            {!searching && canEdit && (
              <p className="text-xs text-slate-400">ลากไฟล์มาวางที่นี่ หรือกดปุ่มอัปโหลดด้านบน</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* โฟลเดอร์ */}
            {visibleFolders.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visibleFolders.map((folder) => (
                  <Button
                    key={folder.id}
                    type="button"
                    onClick={() => openFolder(folder.id)}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <i className="fa-solid fa-folder flex-shrink-0 text-lg text-blue" />
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-xs font-bold text-navy-deep">{folder.name}</strong>
                      <small className="block truncate text-xs text-slate-400">{folder.subtitle}</small>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">
                      {folder.fileCount}
                    </span>
                  </Button>
                ))}
              </div>
            )}

            {/* ไฟล์ */}
            {visibleFiles.length > 0 && view === 'list' && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-[#e8edf1] bg-[#f6f8fa] text-[0.76rem] font-bold text-[#506276]">
                      {canEdit && (
                        <th className="w-8 px-2 py-2">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            className="h-[18px] w-[18px] cursor-pointer accent-blue"
                          />
                        </th>
                      )}
                      <th className="px-2 py-2 font-bold">ชื่อไฟล์</th>
                      <th className="w-40 px-2 py-2 font-bold">{searching ? 'ตำแหน่ง' : 'ผู้อัปโหลด'}</th>
                      <th className="w-32 px-2 py-2 font-bold">วันที่</th>
                      <th className="w-20 px-2 py-2 font-bold">ขนาด</th>
                      <th className="w-24 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleFiles.map((file) => {
                      const { icon, tone } = fileIcon(file.type)
                      const isSelected = selected.includes(file.key)
                      return (
                        <tr
                          key={file.key}
                          className={`border-b border-slate-100 text-xs transition ${
                            isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          {canEdit && (
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(file.key)}
                                className="h-[18px] w-[18px] cursor-pointer accent-blue"
                              />
                            </td>
                          )}
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <i className={`fa-solid ${icon} flex-shrink-0 ${tone}`} />
                              <span className="truncate font-medium text-slate-800">{file.name}</span>
                            </div>
                          </td>
                          <td className="truncate px-2 py-2 text-xs text-slate-500">
                            {searching ? file.location : file.uploadedBy}
                          </td>
                          <td className="px-2 py-2 text-xs text-slate-500">{file.uploadedAt || '—'}</td>
                          <td className="px-2 py-2 text-xs text-slate-500">{readableSize(file.size)}</td>
                          <td className="px-2 py-2">
                            <FileActions
                              file={file}
                              canEdit={canEdit}
                              downloadBlocked={downloadBlocked}
                              onBlockedDownload={() => logBlockedDownload(file.name)}
                              onDownload={() => logDownload(file.name)}
                              onDelete={() => deleteOne(file)}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {visibleFiles.length > 0 && view === 'grid' && (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {visibleFiles.map((file) => {
                  const { icon, tone, bg } = fileIcon(file.type)
                  const isSelected = selected.includes(file.key)
                  return (
                    <div
                      key={file.key}
                      className={`relative rounded-xl border p-3 transition ${
                        isSelected ? 'border-blue bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-200'
                      }`}
                    >
                      {canEdit && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(file.key)}
                          className="absolute left-2 top-2 h-[18px] w-[18px] cursor-pointer accent-blue"
                        />
                      )}
                      <div className={`mb-2 flex h-16 items-center justify-center rounded-lg ${bg}`}>
                        <i className={`fa-solid ${icon} text-2xl ${tone}`} />
                      </div>
                      <strong className="block truncate text-xs font-semibold text-slate-800" title={file.name}>
                        {file.name}
                      </strong>
                      <small className="block truncate text-xs text-slate-400">
                        {searching ? file.location : `${readableSize(file.size)} · ${file.uploadedAt || '—'}`}
                      </small>
                      <div className="mt-1.5 flex justify-end">
                        <FileActions
                              file={file}
                              canEdit={canEdit}
                              downloadBlocked={downloadBlocked}
                              onBlockedDownload={() => logBlockedDownload(file.name)}
                              onDownload={() => logDownload(file.name)}
                              onDelete={() => deleteOne(file)}
                            />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  /** ลบไฟล์เดียวจากปุ่มในแถว */
  function deleteOne(file: FileNode) {
    showConfirmAlert({
      icon: 'warning',
      title: 'ยืนยันการลบไฟล์',
      text: `ต้องการลบไฟล์ "${file.name}" ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้`,
      showCancelButton: true,
      confirmButtonText: 'ลบไฟล์',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      if (file.origin.kind === 'set') {
        removeFilesFromSet(file.origin.setId, [file.origin.index])
      } else if (caseItem) {
        removeCaseDocument(caseItem.no, file.origin.docId)
      }
      showToast(`ลบไฟล์ ${file.name} แล้ว`)
      setSelected((prev) => prev.filter((k) => k !== file.key))
    })
  }
}

/** ปุ่มพรีวิว / ดาวน์โหลด / ลบ ของไฟล์แต่ละรายการ */
const FileActions: React.FC<{
  file: FileNode
  canEdit: boolean
  /** WIT0833 — มาตรการปกปิดข้อ 15(3) ปิดกั้นการดาวน์โหลดของบทบาทนี้หรือไม่ */
  downloadBlocked?: boolean
  onBlockedDownload?: () => void
  onDownload?: () => void
  onDelete: () => void
}> = ({ file, canEdit, downloadBlocked, onBlockedDownload, onDownload, onDelete }) => (
  <div className="flex items-center justify-end gap-0.5">
    {file.previewUrl ? (
      <>
        <a
          href={file.previewUrl}
          target="_blank"
          rel="noreferrer"
          title="พรีวิวไฟล์"
          className="p-1.5 text-slate-400 transition hover:text-blue"
        >
          <i className="fa-solid fa-eye text-[11px]" />
        </a>
        {downloadBlocked ? (
          <button
            type="button"
            data-testid="file-download-blocked"
            title={privacyBlockedMessage('download')}
            onClick={() => {
              onBlockedDownload?.()
              showToast(privacyBlockedMessage('download'), 'warning')
            }}
            className="cursor-not-allowed p-1.5 text-amber-500"
          >
            <i className="fa-solid fa-lock text-[11px]" />
          </button>
        ) : (
          <a
            href={file.previewUrl}
            download={file.name}
            title="ดาวน์โหลดไฟล์"
            onClick={() => onDownload?.()}
            className="p-1.5 text-slate-400 transition hover:text-blue"
          >
            <i className="fa-solid fa-download text-[11px]" />
          </a>
        )}
      </>
    ) : (
      <span
        title="ไฟล์ตัวอย่างในระบบจำลอง — ไม่มีข้อมูลให้พรีวิวหรือดาวน์โหลด"
        className="cursor-not-allowed p-1.5 text-slate-300"
      >
        <i className="fa-solid fa-eye-slash text-[11px]" />
      </span>
    )}
    {canEdit && (
      <Button type="button" onClick={onDelete} title="ลบไฟล์" className="p-1.5 text-slate-400 transition hover:text-rose-600">
        <i className="fa-solid fa-trash text-[11px]" />
      </Button>
    )}
  </div>
)
