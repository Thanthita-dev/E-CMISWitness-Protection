import data from './additionalForms.data.json'
import layouts from './additionalForms.layout.json'
import { FIELD_SPECS, type FieldSpec } from './additionalForms.fields'
import { a6LayoutRuntime, type RuntimeConfig } from './additionalFormRuntime'

/* ---------- layout จาก Word (สร้างด้วย scripts/import-additional-forms.py) ---------- */

export interface RunStyle {
  b?: boolean
  i?: boolean
  u?: string
  s?: boolean
  sz?: number
  szl?: number
  sp?: number
  va?: string
  pos?: number
  color?: string
  caps?: boolean
  hl?: string
}

export interface Run extends RunStyle {
  t?: string
  tab?: 1
  br?: 1
  page?: 1
  pagebreak?: 1
  rendered?: 1
  img?: string
  w?: number
  h?: number
}

interface FloatPos { from: string; off: number; align: string | null }

export type FloatBox =
  | { type: 'img'; img: string; w: number; h: number; x: number | FloatPos; y: number | FloatPos; xFrom?: string; yFrom?: string; behind?: boolean }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; dash: string; weight: number; xFrom: string; yFrom: string }
  | { type: 'textbox'; x: number; y: number; w: number; h: number; xFrom: string; yFrom: string; inset: number[]; stroke: boolean; behind?: boolean; blocks: Block[] }

export interface Block {
  k: 'p'
  jc?: string
  l?: number
  r?: number
  fl?: number
  sb?: number
  sa?: number
  line?: { rule: string; v: number }
  tabs?: { pos: number; val: string; leader: string }[]
  keepNext?: boolean
  keepLines?: boolean
  pb?: boolean
  border?: Record<string, { val: string; sz: number; space: number }>
  runs: Run[]
  mark: RunStyle
  floats?: FloatBox[]
  rendered?: boolean
}

export interface PageSetup {
  w: number
  h: number
  orient: string
  top: number
  right: number
  bottom: number
  left: number
  header: number
  footer: number
  numFmt: string
  titlePg: boolean
  topExact?: boolean
  wordPages: number | null
}

export interface FormLayout {
  id: string
  page: PageSetup
  headers: Record<string, Block[]>
  blocks: Block[]
}

/* ---------- ช่องข้อมูล ---------- */

export interface AdditionalField {
  id: string
  label: string
  group: string
  /** ข้อความรอบช่องบนกระดาษ ช่วยให้รู้ว่าเป็นช่องใด */
  context: string
  /** ข้อความตัวอย่างตามต้นฉบับ (จุดแรกที่พบ) */
  sample: string
  multiline: boolean
  /** จำนวนจุดบนกระดาษที่ใช้ค่านี้ */
  uses: number
}

export interface AdditionalFormTemplate {
  id: string
  title: string
  description: string
  category: string
  sourceName: string
  sourceUrl: string
  sourceSha256: string
  receivedDate: string
  /** ข้อความเดิมรายย่อหน้า ใช้เปิดร่างรูปแบบเดิม (ก่อนมีช่องข้อมูล) */
  paragraphs: { text: string; align: 'left' | 'right' | 'center' | 'justify'; bold: boolean }[]
  layout: FormLayout
  fields: AdditionalField[]
}

export interface AdditionalFormValues {
  /** ค่าที่ผู้ใช้กรอกตาม id ของช่อง (ไม่มี key = ใช้ข้อความตัวอย่างตามต้นฉบับ) */
  values: Record<string, string>
  /** ย่อหน้าที่แก้ทั้งย่อหน้า ตาม key ของย่อหน้า */
  paragraphs: Record<string, string>
}

/* ---------- เตรียมช่องข้อมูลบน run ---------- */

interface FieldRun extends Run {
  f?: string
}

interface PreparedBlock extends Omit<Block, 'runs' | 'floats'> {
  key: string
  runs: FieldRun[]
  floats?: (FloatBox | (Extract<FloatBox, { type: 'textbox' }> & { blocks: PreparedBlock[] }))[]
  /** เป็นเลขหน้าที่ผู้จัดทำพิมพ์ไว้ในเนื้อความ เช่น -๒- */
  pageNo?: boolean
  /** ย่อหน้าแรกของชุดบรรทัดเขียนความเห็น */
  opinion?: { id: string; keys: string[]; dotted: boolean }
  /** ย่อหน้าถัดไปของชุดบรรทัดเขียนความเห็น */
  opinionPart?: string
}

interface Prepared {
  blocks: PreparedBlock[]
  headers: Record<string, PreparedBlock[]>
  fields: AdditionalField[]
}

const MONTHS = 'มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม'
const DOTS = '[.…]{2,}'
const PERSON = 'นางสาว|นาย|นาง|ร\\.ต\\.[ทอต]\\.|พ\\.ต\\.[ทอต]\\.|พ\\.ต\\.ต\\.|ด\\.ต\\.|จ\\.ส\\.ต\\.|ส\\.ต\\.[อทต]\\.'
const NUM = '[0-9๐-๙]'

/** รูปแบบช่องว่างสำหรับกรอกที่พบในต้นฉบับ เรียงจากเฉพาะเจาะจงไปทั่วไป */
const BLANK_PATTERNS: { re: RegExp; kind: string }[] = [
  { re: new RegExp(`\\(${DOTS}\\)`, 'g'), kind: 'signer' },
  { re: new RegExp(`(?:${DOTS}\\s*)(?:${MONTHS})\\s*${NUM}{4}`, 'g'), kind: 'date' },
  { re: new RegExp(`(?:ปป|ยธ|ตช)\\s*[0-9๐-๙().พบ]*/${DOTS}`, 'g'), kind: 'docNo' },
  { re: new RegExp(`${DOTS}/${NUM}{4}`, 'g'), kind: 'refNo' },
  { re: new RegExp(`(?:${PERSON})\\s*${DOTS}`, 'g'), kind: 'person' },
  { re: new RegExp(`${DOTS}`, 'g'), kind: 'blank' },
]

const KIND_LABEL: Record<string, string> = {
  signer: 'ชื่อผู้ลงนาม',
  date: 'วันที่',
  docNo: 'เลขที่หนังสือ',
  refNo: 'เลขที่',
  person: 'ชื่อบุคคล',
  blank: 'ข้อมูล',
}

function plainOf(runs: Run[]) {
  return runs.map((run) => (run.t !== undefined ? run.t : run.tab ? '\t' : run.br ? '\n' : '\u0000')).join('')
}

/** ตัด run ให้ช่วง [start,end) ของข้อความเป็น run ที่ผูกกับช่องข้อมูล */
function markRange(runs: FieldRun[], start: number, end: number, id: string): FieldRun[] {
  const out: FieldRun[] = []
  let pos = 0
  for (const run of runs) {
    const len = run.t !== undefined ? run.t.length : 1
    const runStart = pos
    const runEnd = pos + len
    pos = runEnd
    if (runEnd <= start || runStart >= end || run.t === undefined || run.f) {
      out.push(run)
      continue
    }
    const a = Math.max(start, runStart) - runStart
    const b = Math.min(end, runEnd) - runStart
    if (a > 0) out.push({ ...run, t: run.t.slice(0, a) })
    out.push({ ...run, t: run.t.slice(a, b), f: id })
    if (b < len) out.push({ ...run, t: run.t.slice(b) })
  }
  return out
}

function covered(runs: FieldRun[], start: number, end: number) {
  let pos = 0
  for (const run of runs) {
    const len = run.t !== undefined ? run.t.length : 1
    if (run.f && pos < end && pos + len > start) return true
    pos += len
  }
  return false
}

const isPageNumberLine = (text: string) => /^-\s*[0-9๐-๙]+\s*-$/.test(text.trim())

const HEAD_GROUP = 'หัวหนังสือ'
const SIGN_GROUP = 'ผู้ลงนาม'
const OPINION_GROUP = 'ความเห็นผู้บังคับบัญชา'
const RANK = /^(?:พ\.ต\.[อทต]\.|ร\.ต\.[อทต]\.|พ\.ต\.ต\.)$/
const MONTH_LINE = new RegExp(`^(?:[0-9๐-๙]{1,2}\\s+)?(?:${MONTHS})\\s+[0-9๐-๙]{4}$`)
/** บรรทัดเส้นสำหรับเขียนความเห็น: มีแต่จุด/ช่องว่าง/แท็บขีดเส้นใต้ */
const isLineOnly = (block: Block) => {
  const text = plainOf(block.runs)
  if (!/^[\s.…\t\u0000]*$/.test(text)) return false
  return /[.…]{20,}/.test(text) || block.runs.some((run) => run.tab && run.u)
}

function prepare(layout: FormLayout, spec: FieldSpec | undefined): Prepared {
  const fields = new Map<string, AdditionalField>()
  const allBlocks: PreparedBlock[] = []

  const prepBlock = (block: Block, key: string): PreparedBlock => {
    const prepared: PreparedBlock = { ...block, key, runs: block.runs.map((run) => ({ ...run })), floats: undefined }
    if (block.floats) {
      prepared.floats = block.floats.map((float, fi) => float.type === 'textbox'
        ? { ...float, blocks: float.blocks.map((inner, bi) => prepBlock(inner, `${key}.f${fi}.${bi}`)) }
        : float)
    }
    allBlocks.push(prepared)
    return prepared
  }

  const blocks = layout.blocks.map((block, index) => prepBlock(block, String(index)))
  const headers: Record<string, PreparedBlock[]> = {}
  for (const [name, list] of Object.entries(layout.headers)) headers[name] = list.map((block, index) => prepBlock(block, `${name}.${index}`))
  const byKey = new Map(allBlocks.map((block) => [block.key, block]))

  const contextOf = (text: string, start: number, end: number) => {
    const before = text.slice(Math.max(0, start - 28), start).replace(/[\t\n\u0000]+/g, ' ')
    const after = text.slice(end, end + 18).replace(/[\t\n\u0000]+/g, ' ')
    return `${before.trimStart()}［…］${after.trimEnd()}`
  }

  /** ผูกช่วงข้อความ [start,end) ของย่อหน้ากับช่องข้อมูล */
  const bind = (block: PreparedBlock, start: number, end: number, def: Omit<AdditionalField, 'uses' | 'sample' | 'context'>) => {
    const text = plainOf(block.runs)
    if (start < 0 || end <= start || covered(block.runs, start, end)) return false
    block.runs = markRange(block.runs, start, end, def.id)
    const current = fields.get(def.id)
    if (current) current.uses += 1
    else fields.set(def.id, { ...def, sample: text.slice(start, end), context: contextOf(text, start, end), uses: 1 })
    return true
  }
  /** ผูกข้อความส่วนที่เป็นสาระ (ตัดช่องว่างหัวท้าย) ของกลุ่มที่จับได้ */
  const bindTrimmed = (block: PreparedBlock, start: number, raw: string, def: Omit<AdditionalField, 'uses' | 'sample' | 'context'>) => {
    const lead = raw.length - raw.trimStart().length
    const value = raw.trim()
    if (!value || /^[.…]+$/.test(value)) return false
    return bind(block, start + lead, start + lead + value.length, def)
  }

  // 1) ช่องที่กำหนดไว้ใน additionalForms.fields.ts
  for (const def of spec?.fields ?? []) {
    for (const ref of def.at) {
      const block = byKey.get(ref.b)
      if (!block) throw new Error(`${layout.id}: ไม่พบย่อหน้า ${ref.b} ของช่อง ${def.id}`)
      const text = plainOf(block.runs)
      let start = -1
      for (let n = 0, from = 0; n <= (ref.nth ?? 0); n++) {
        start = text.indexOf(ref.text, from)
        if (start < 0) break
        from = start + 1
      }
      if (start < 0) throw new Error(`${layout.id}: ไม่พบข้อความ "${ref.text}" ในย่อหน้า ${ref.b} ของช่อง ${def.id}`)
      if (!bind(block, start, start + ref.text.length, { id: def.id, label: def.label, group: def.group, multiline: Boolean(def.multiline) }))
        throw new Error(`${layout.id}: ช่อง ${def.id} ซ้อนกับช่องอื่นในย่อหน้า ${ref.b}`)
    }
  }

  // 2) หัวบันทึก/หัวหนังสือ: ส่วนราชการ ที่ วันที่ เรื่อง เรียน
  const firstSalutation = blocks.findIndex((block) => /^\s*เรียน\s/.test(plainOf(block.runs)))
  blocks.slice(0, firstSalutation + 1).forEach((block) => {
    const text = plainOf(block.runs)
    const head = { group: HEAD_GROUP, multiline: false }
    let m: RegExpMatchArray | null
    if ((m = text.match(/^(\s*ส่วนราชการ)(.*)$/))) bindTrimmed(block, m[1].length, m[2], { ...head, id: 'department', label: 'ส่วนราชการ' })
    else if ((m = text.match(/^(\s*ที่)(.*?)(วันที่)(.*)$/))) {
      bindTrimmed(block, m[1].length, m[2].replace(/\t/g, ' '), { ...head, id: 'docNo', label: 'ที่' })
      bindTrimmed(block, m[1].length + m[2].length + m[3].length, m[4].replace(/\t/g, ' '), { ...head, id: 'date', label: 'วันที่' })
    } else if ((m = text.match(/^(\s*ที่\s+)(ปป\s*[0-9๐-๙]+\/)/))) bind(block, m[1].length, m[1].length + m[2].length, { ...head, id: 'docNo', label: 'ที่' })
    else if (MONTH_LINE.test(text.trim())) bindTrimmed(block, 0, text, { ...head, id: 'date', label: 'วันที่' })
    else if ((m = text.match(/^(\s*เรื่อง)(.*)$/))) {
      const subject = m[2].split(/\s+สำนวนคดี/)[0]
      bindTrimmed(block, m[1].length, subject, { ...head, id: 'subject', label: 'เรื่อง' })
    } else if ((m = text.match(/^(\s*เรียน)(.*)$/)) && !/[.…]{2,}/.test(m[2])) bindTrimmed(block, m[1].length, m[2], { ...head, id: 'recipient', label: 'เรียน' })
  })

  // 3) ผู้ลงนาม: ยศ ชื่อในวงเล็บ และตำแหน่ง (ไม่เกินสองบรรทัดถัดไป)
  const nonEmpty = (index: number, step: number) => {
    for (let j = index + step; j >= 0 && j < blocks.length; j += step) {
      const text = plainOf(blocks[j].runs).replace(/[\t\u0000]/g, ' ').trim()
      if (text) return { index: j, text }
      if (Math.abs(j - index) > 3) break
    }
    return null
  }
  blocks.forEach((block, index) => {
    const text = plainOf(block.runs)
    const m = text.match(/\([.…]{3,}\)/)
    if (!m || text.replace(/[\t\u0000]/g, ' ').trim() !== m[0]) return
    const role = nonEmpty(index, 1)
    const roleText = role && !/\([.…]{3,}\)/.test(role.text) && !/^[0-9๐-๙]+\./.test(role.text) ? role.text : ''
    const suffix = roleText ? ` · ${roleText.replace(/\s+/g, ' ')}` : ''
    const id = `signer:${block.key}`
    bind(block, m.index!, m.index! + m[0].length, { id, label: `ชื่อผู้ลงนาม${suffix}`, group: SIGN_GROUP, multiline: false })
    const rank = nonEmpty(index, -1)
    if (rank && RANK.test(rank.text)) {
      const rb = blocks[rank.index]
      const rt = plainOf(rb.runs)
      bind(rb, rt.indexOf(rank.text), rt.indexOf(rank.text) + rank.text.length, { id: `${id}:rank`, label: `ยศ${suffix}`, group: SIGN_GROUP, multiline: false })
    }
    if (roleText && role) {
      let line = role
      for (let n = 0; n < 2 && line; n++) {
        if (/\([.…]{3,}\)/.test(line.text) || /^[0-9๐-๙]+\./.test(line.text) || RANK.test(line.text) || /^(เรียน|จึงเรียน|ความเห็น)/.test(line.text)) break
        const lb = blocks[line.index]
        const lt = plainOf(lb.runs)
        const start = lt.indexOf(line.text.split(/\s{2,}/)[0])
        const value = lt.slice(start).replace(/[\t\u0000]/g, ' ').trimEnd()
        bind(lb, start, start + value.length, { id: `${id}:title${n}`, label: `${n === 0 ? 'ตำแหน่ง' : 'ตำแหน่ง (บรรทัดที่ 2)'}${suffix}`, group: SIGN_GROUP, multiline: false })
        const next = nonEmpty(line.index, 1)
        if (!next || next.index !== line.index + 1) break
        line = next
      }
    }
  })

  // 4) ช่องความเห็น: บรรทัดเส้นจุด/เส้นใต้ต่อกันหลังหัวข้อ "ความเห็น..."
  const opinions: Record<string, { id: string; keys: string[]; dotted: boolean }> = {}
  blocks.forEach((block, index) => {
    const heading = plainOf(block.runs).replace(/[\t\u0000]/g, ' ').trim()
    if (!/^[0-9๐-๙]+\.\s*ความเห็น/.test(heading)) return
    const keys: string[] = []
    let dotted = false
    for (let j = index + 1; j < blocks.length && isLineOnly(blocks[j]); j++) {
      keys.push(blocks[j].key)
      if (/[.…]{20,}/.test(plainOf(blocks[j].runs))) dotted = true
    }
    if (!keys.length) return
    const id = `opinion:${block.key}`
    opinions[keys[0]] = { id, keys, dotted }
    const label = heading.replace(/\s*\(.*$/, '')
    fields.set(id, { id, label, group: OPINION_GROUP, multiline: true, sample: '', context: heading, uses: 1 })
  })

  // 5) จุดไข่ปลาที่เหลือ ตั้งชื่อตามชนิดและข้อที่อยู่
  let group = HEAD_GROUP
  let item = ''
  const walk = (block: PreparedBlock, inTextbox: boolean) => {
    const text = plainOf(block.runs)
    const trimmed = text.replace(/[\t\u0000]/g, ' ').trim()
    if (!inTextbox) {
      const heading = trimmed.match(/^([0-9๐-๙]+)\.\s*(\S.*)$/)
      const sub = trimmed.match(/^(?:[0-9๐-๙]+\.)+[0-9๐-๙]+|^\([0-9๐-๙]+\)/)
      if (heading && trimmed.length < 90) { group = `${heading[1]}. ${heading[2].replace(/\s*\(.*$/, '').replace(/\s+/g, ' ')}`; item = '' }
      else if (sub) item = sub[0]
      else if (/^เรียน\s/.test(trimmed) && group === HEAD_GROUP) group = 'เนื้อความ'
    }
    if (inTextbox && /^\//.test(trimmed)) return // ข้อความต่อหน้า เช่น /๓.๒ ระเบียบ...
    if (!inTextbox && isLineOnly(block)) return
    const found: { start: number; end: number; kind: string }[] = []
    for (const { re, kind } of BLANK_PATTERNS) {
      re.lastIndex = 0
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const start = m.index
        const end = start + m[0].length
        if (found.some((f) => start < f.end && end > f.start) || covered(block.runs, start, end)) continue
        // จุดไข่ปลาที่ขึ้นต้นหรือปิดท้ายข้อความ เป็นการละข้อความตัวบทกฎหมาย ไม่ใช่ช่องกรอก
        if (kind === 'blank' && (text.slice(0, start).trim() === '' || text.slice(end).replace(/[.…\s]/g, '') === '')) continue
        found.push({ start, end, kind })
      }
    }
    found.sort((a, b) => a.start - b.start)
    found.forEach((hit, index) => {
      const linked = spec?.links?.find((link) => link.kind === hit.kind && link.after.test(text.slice(0, hit.start)))
      const before = text.slice(0, hit.start).replace(/[\t\n\u0000]+/g, ' ').trim()
      const word = before.split(/\s+/).slice(-1)[0]?.replace(/[(.…]+$/, '').slice(-24) ?? ''
      const label = linked ? linked.label
        : `${item ? `${item} · ` : ''}${hit.kind === 'blank' && word ? word : KIND_LABEL[hit.kind]}`
      bind(block, hit.start, hit.end, {
        id: linked ? linked.id : `${block.key}:${index}`, label,
        group: linked ? 'ข้อมูลที่ใช้ทั้งฉบับ' : group, multiline: false,
      })
    })
    for (const float of block.floats ?? []) if (float.type === 'textbox') (float.blocks as PreparedBlock[]).forEach((inner) => walk(inner, true))
  }
  blocks.forEach((block) => walk(block, false))

  // ชุดลงนาม (ข้อความก่อนหน้า ยศ ชื่อ ตำแหน่ง) และส่วนท้ายหนังสือ ต้องไม่แยกหน้า
  const textAt = (i: number) => plainOf(blocks[i].runs).replace(/[\t\u0000]/g, ' ').trim()
  blocks.forEach((block, index) => {
    if (!block.runs.some((run) => run.f?.startsWith('signer:') && !run.f.includes(':', 7))) return
    const before = nonEmpty(index, -1)
    let start = before ? before.index : index
    let end = index
    for (let j = index + 1; j < blocks.length && j <= index + 3; j++) {
      const t = textAt(j)
      if (!t) continue
      if (blocks[j].runs.some((run) => run.f?.startsWith(`signer:${block.key}:title`))) end = j
      else break
    }
    if (before && /^[0-9๐-๙]+\./.test(before.text)) start = index
    for (let j = start; j < end; j++) blocks[j].keepNext = true
  })
  let tail = blocks.length - 1
  while (tail > 0 && !textAt(tail)) tail--
  for (let j = tail - 1; j >= 0 && textAt(j) && !blocks[j].runs.some((run) => run.f?.startsWith('signer:')); j--) blocks[j].keepNext = true

  for (const block of blocks) {
    if (isPageNumberLine(plainOf(block.runs))) block.pageNo = true
    const opinion = opinions[block.key]
    if (opinion) block.opinion = opinion
  }
  for (const opinion of Object.values(opinions)) opinion.keys.slice(1).forEach((key) => { byKey.get(key)!.opinionPart = opinion.id })

  const order = [HEAD_GROUP, 'ข้อมูลที่ใช้ทั้งฉบับ']
  const list = Array.from(fields.values())
  const groupRank = (name: string) => {
    const i = order.indexOf(name)
    if (i >= 0) return i
    if (name === SIGN_GROUP) return 1000
    if (name === OPINION_GROUP) return 1001
    if (name === 'ส่วนท้ายหนังสือ') return 1002
    return 10
  }
  // คงลำดับตามที่ปรากฏบนกระดาษภายในหมวด
  return { blocks, headers, fields: list.map((field, index) => ({ field, index })).sort((a, b) => groupRank(a.field.group) - groupRank(b.field.group) || a.index - b.index).map(({ field }) => field) }
}

/* ---------- ข้อมูลแบบทั้ง 7 ---------- */

const LAYOUTS = layouts as unknown as Record<string, FormLayout>

const preparedCache = new Map<string, Prepared>()
function getPrepared(id: string, layout: FormLayout) {
  let prepared = preparedCache.get(id)
  if (!prepared) {
    prepared = prepare(layout, FIELD_SPECS[id])
    preparedCache.set(id, prepared)
  }
  return prepared
}

/** แบบฟอร์มและหนังสือประกอบ ไม่ใช้เลข คบ. และไม่เชื่อมสถานะการอนุมัติ */
export const ADDITIONAL_FORMS: AdditionalFormTemplate[] = (data as Omit<AdditionalFormTemplate, 'layout' | 'fields'>[]).map((form) => {
  const layout = LAYOUTS[form.id]
  return { ...form, layout, fields: getPrepared(form.id, layout).fields }
})


export const getAdditionalForm = (id: string) => ADDITIONAL_FORMS.find((form) => form.id === id)

/* ---------- สร้าง HTML ---------- */

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`)
const pt = (value: number) => `${Math.round(value * 100) / 100}pt`

/**
 * ระยะบรรทัด "1.0" ของ TH SarabunIT๙ ใน Word ต่อขนาดตัวอักษร
 * ฟอนต์ตระกูล PSK/IT๙ ใช้ ascent 850 + descent 250 ต่อ 1000 (1.10 em) แคบกว่า TH Sarabun New (1.301 em)
 * ค่านี้สอบเทียบกับจำนวนหน้าที่ Word บันทึกไว้ในไฟล์ต้นฉบับ (บันทึกขอขยาย 6 หน้า เบิกเงิน 3 หน้า หนังสือ 1 หน้า)
 */
const SINGLE = 1.1

const HIGHLIGHT: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
  darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
}

function runCss(style: RunStyle, line?: Block['line']) {
  const css: string[] = []
  const size = style.sz ?? 16
  css.push(`font-size:${pt(size)}`)
  if (style.b) css.push('font-weight:700')
  if (style.i) css.push('font-style:italic')
  const deco: string[] = []
  if (style.u) deco.push('underline')
  if (style.s) deco.push('line-through')
  if (deco.length) {
    css.push(`text-decoration-line:${deco.join(' ')}`)
    if (style.u === 'dotted' || style.u === 'dottedHeavy') css.push('text-decoration-style:dotted')
    else if (style.u === 'double') css.push('text-decoration-style:double')
    else if (style.u === 'dash' || style.u === 'dashLong') css.push('text-decoration-style:dashed')
    else if (style.u === 'wave') css.push('text-decoration-style:wavy')
  }
  if (style.sp) css.push(`letter-spacing:${pt(style.sp)}`)
  if (style.va === 'superscript' || style.va === 'subscript') {
    css.push(`vertical-align:${style.va === 'superscript' ? 'super' : 'sub'}`)
    css.push(`font-size:${pt(size * 0.65)}`)
  }
  if (style.pos) css.push('position:relative', `top:${pt(-style.pos)}`)
  if (style.color && /^[0-9a-f]{6}$/i.test(style.color)) css.push(`color:#${style.color}`)
  if (style.hl && HIGHLIGHT[style.hl]) css.push(`background:${HIGHLIGHT[style.hl]}`)
  if (line?.rule === 'exact') css.push(`line-height:${pt(line.v)}`)
  return css.join(';')
}

function lineCss(block: Pick<Block, 'line'>) {
  const line = block.line
  if (!line || line.rule === 'auto') return `line-height:${SINGLE * (line?.v ?? 1)}`
  if (line.rule === 'exact') return `line-height:${pt(line.v)}`
  return `line-height:max(${SINGLE}em, ${pt(line.v)})`
}

interface RenderCtx {
  values: AdditionalFormValues
  interactive: boolean
  signableField?: string
  asset: (file: string) => string
}

function fieldText(id: string, sample: string, ctx: RenderCtx) {
  const value = ctx.values.values[id]
  if (value === undefined) return sample
  if (value.trim() === '') {
    const dots = (sample.match(/[.…]/g) ?? []).length
    return '.'.repeat(Math.max(dots, 12))
  }
  return value
}

function renderRuns(block: PreparedBlock, ctx: RenderCtx) {
  const pieces: string[] = []
  const lines: string[][] = [[]]
  let seg: string[] = []
  const flushSeg = () => {
    if (seg.length) lines[lines.length - 1].push(`<span class="a6-seg">${seg.join('')}</span>`)
    seg = []
  }
  const pushLineBreak = () => {
    flushSeg()
    lines.push([])
  }
  let i = 0
  while (i < block.runs.length) {
    const run = block.runs[i]
    const css = runCss(run, block.line)
    if (run.f) {
      // รวม run ต่อเนื่องของช่องเดียวกันเป็นช่องเดียว ใช้รูปแบบตัวอักษรของ run แรก
      let sample = ''
      let j = i
      while (j < block.runs.length && block.runs[j].f === run.f) { sample += block.runs[j].t ?? ''; j++ }
      const text = fieldText(run.f, sample, ctx)
      const signature = ctx.values.values[`_signature:${run.f}`]
      if (signature && /^data:image\/(png|jpeg|webp);base64,/.test(signature)) {
        seg.push(`<span style="display:inline-block;text-align:center;position:relative"><img src="${escapeHtml(signature)}" alt="ลายมือชื่อ" style="position:absolute;bottom:100%;left:50%;transform:translateX(-50%);height:36pt;max-width:110pt;object-fit:contain"/><span style="${css}">${escapeHtml(text)}</span></span>`)
        i = j
        continue
      }
      if (ctx.signableField === run.f) {
        seg.push(`<span style="display:inline-block;position:relative;${css}">${escapeHtml(text)}<button type="button" class="a6-paper-sign" data-sign-field="${escapeHtml(run.f)}" aria-label="ลงนามเลขาธิการ"><svg width="10" height="10" viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M362.7 19.3c25-25 65.5-25 90.5 0l39.5 39.5c25 25 25 65.5 0 90.5L400 242 270 112l92.7-92.7zM247.4 134.6l130 130L142.8 499.2 12.8 512 25.6 382l221.8-247.4z"/></svg>ลงนาม</button></span>`)
        i = j
        continue
      }
      const parts = text.split('\n')
      parts.forEach((part, index) => {
        if (index > 0) pushLineBreak()
        seg.push(`<span class="a6-f" data-f="${escapeHtml(run.f!)}" style="${css}">${escapeHtml(part) || '&#8203;'}</span>`)
      })
      i = j
      continue
    }
    if (run.t !== undefined) {
      if (run.t) seg.push(`<span style="${css}">${escapeHtml(run.t)}</span>`)
    } else if (run.tab) {
      flushSeg()
      lines[lines.length - 1].push(`<span class="a6-tab${run.u ? ` a6-u-${run.u === 'dotted' ? 'dotted' : 'solid'}` : ''}" style="font-size:${pt(run.sz ?? block.mark.sz ?? 16)}"></span>`)
    } else if (run.br) {
      pushLineBreak()
    } else if (run.page) {
      seg.push(`<span class="a6-pg" style="${css}">1</span>`)
    } else if (run.img) {
      seg.push(`<img class="a6-inline" src="${ctx.asset(run.img)}" alt="" style="width:${pt(run.w ?? 0)};height:${pt(run.h ?? 0)}">`)
    }
    i++
  }
  flushSeg()
  pieces.push(...lines.map((line) => line.join('')))
  return pieces
}

function paragraphOverride(block: PreparedBlock, text: string): PreparedBlock {
  const base = block.runs.find((run) => run.t && !run.f) ?? block.runs.find((run) => run.t) ?? block.mark
  const style: RunStyle = { ...base }
  delete (style as FieldRun).f
  delete (style as Run).t
  const runs: FieldRun[] = []
  text.split(/(\n|\t)/).forEach((part) => {
    if (part === '\n') runs.push({ br: 1 })
    else if (part === '\t') runs.push({ tab: 1, sz: style.sz })
    else if (part) runs.push({ ...style, t: part })
  })
  return { ...block, runs }
}

function renderFloat(float: NonNullable<PreparedBlock['floats']>[number], block: PreparedBlock, ctx: RenderCtx) {
  const indentLeft = block.l ?? 0
  const pos = (value: number | FloatPos | undefined, from: string | undefined, axis: 'x' | 'y') => {
    if (typeof value === 'number') return { attr: '', css: `${axis === 'x' ? 'left' : 'top'}:${pt(value - (axis === 'x' ? indentLeft : 0))}` }
    const v = value ?? { from: from ?? 'column', off: 0, align: null }
    if (v.from === 'page') return { attr: ` data-${axis}page="${v.off}"`, css: '' }
    return { attr: '', css: `${axis === 'x' ? 'left' : 'top'}:${pt(v.off - (axis === 'x' ? indentLeft : 0))}` }
  }
  if (float.type === 'line') {
    const left = Math.min(float.x1, float.x2) - indentLeft
    const top = Math.min(float.y1, float.y2)
    const horizontal = Math.abs(float.y2 - float.y1) < Math.abs(float.x2 - float.x1)
    const style = float.dash === 'solid' ? 'solid' : /^(1 1|dot|shortdot|1 2)$/i.test(float.dash) ? 'dotted' : 'dashed'
    const size = horizontal ? `width:${pt(Math.abs(float.x2 - float.x1))};height:0;border-top:${pt(Math.max(float.weight, 0.5))} ${style} #000`
      : `height:${pt(Math.abs(float.y2 - float.y1))};width:0;border-left:${pt(Math.max(float.weight, 0.5))} ${style} #000`
    return `<span class="a6-float" style="left:${pt(left)};top:${pt(top)};${size}"></span>`
  }
  const x = pos(float.x, float.xFrom, 'x')
  const y = pos(float.y, float.yFrom, 'y')
  const z = float.behind ? 'z-index:-1' : 'z-index:2'
  if (float.type === 'img') {
    return `<img class="a6-float"${x.attr}${y.attr} src="${ctx.asset(float.img)}" alt="" style="${x.css};${y.css};width:${pt(float.w)};height:${pt(float.h)};${z}">`
  }
  const inner = (float.blocks as PreparedBlock[]).map((innerBlock) => renderBlock(innerBlock, ctx)).join('')
  const [l, t, r, b] = float.inset
  return `<span class="a6-float a6-col a6-box"${x.attr}${y.attr} style="${x.css};${y.css};width:${pt(float.w)};min-height:${pt(float.h)};padding:${pt(t)} ${pt(r)} ${pt(b)} ${pt(l)};${float.stroke ? 'border:0.75pt solid #000;' : ''}${z}">${inner}</span>`
}

function renderBlock(source: PreparedBlock, ctx: RenderCtx): string {
  const override = ctx.values.paragraphs[source.key]
  const block = override !== undefined ? paragraphOverride(source, override) : source
  const css: string[] = []
  const jc = block.jc ?? 'left'
  const justify = jc === 'justify' || jc === 'thai' || jc === 'distribute'
  css.push(`text-align:${justify ? 'justify' : jc === 'center' ? 'center' : jc === 'right' ? 'right' : 'left'}`)
  if (jc === 'distribute') css.push('text-align-last:justify')
  if (block.l) css.push(`margin-left:${pt(block.l)}`)
  if (block.r) css.push(`margin-right:${pt(block.r)}`)
  if (block.fl) css.push(`text-indent:${pt(block.fl)}`)
  if (block.sb) css.push(`padding-top:${pt(block.sb)}`)
  if (block.sa) css.push(`padding-bottom:${pt(block.sa)}`)
  css.push(lineCss(block))
  css.push(`font-size:${pt(block.mark.sz ?? 16)}`)
  const border = block.border
  if (border) {
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const value = border[side]
      if (value) css.push(`border-${side}:${pt(Math.max(value.sz, 0.5))} ${value.val === 'dotted' ? 'dotted' : value.val === 'dashed' ? 'dashed' : value.val === 'double' ? 'double' : 'solid'} #000`)
    }
  }
  const lines = renderRuns(block, ctx)
  const mark = `<span style="${runCss(block.mark, block.line)}">&#8203;</span>`
  let content: string
  if (justify && lines.length > 1) {
    // Word ยืดบรรทัดที่จบด้วยการขึ้นบรรทัดใหม่ (Shift+Enter) ให้เต็มบรรทัดในย่อหน้าจัดเต็ม
    content = lines.map((line, index) => {
      const last = index === lines.length - 1
      const style = `${index > 0 ? 'text-indent:0;' : ''}${last ? '' : 'text-align-last:justify;'}`
      return `<span class="a6-ln" style="${style}">${line || '&#8203;'}${last ? mark : ''}</span>`
    }).join('')
  } else {
    content = lines.join('<br>') + mark
  }
  const floats = (source.floats ?? []).map((float) => renderFloat(float, block, ctx)).join('')
  const empty = !block.runs.some((run) => run.t?.trim() || run.f || run.img)
  const attrs = [
    `class="a6-p${override !== undefined ? ' a6-edited' : ''}"`,
    `data-b="${escapeHtml(source.key)}"`,
    block.tabs?.length ? `data-tabs='${JSON.stringify(block.tabs.map(({ pos, val, leader }) => ({ pos, val, leader })))}'` : '',
    block.l ? `data-l="${block.l}"` : '',
    block.fl ? `data-fl="${block.fl}"` : '',
    block.keepNext ? 'data-keep-next="1"' : '',
    block.keepLines ? 'data-keep-lines="1"' : '',
    block.pb || source.pageNo ? 'data-pb="1"' : '',
    empty ? 'data-empty="1"' : '',
  ].filter(Boolean).join(' ')
  return `<div ${attrs} style="${css.join(';')}">${floats}${content}</div>`
}

/** ตำแหน่งขึ้นหน้าใหม่ตามต้นฉบับ: เลขหน้าที่พิมพ์ไว้ในเนื้อความ และจุดที่ Word บันทึกว่าขึ้นหน้าใหม่ */
function sourceBreaks(blocks: PreparedBlock[]) {
  return blocks.map((block, index) => {
    if (!block.rendered || block.pageNo) return block
    // ถ้าย่อหน้าก่อนหน้าคือเลขหน้า (หรือบรรทัดว่างหลังเลขหน้า) ถือว่าขึ้นหน้าที่เลขหน้าแล้ว
    for (let j = index - 1; j >= 0; j--) {
      if (blocks[j].pageNo) return block
      if (plainOf(blocks[j].runs).trim()) break
    }
    return { ...block, pb: true }
  })
}

/** ความเห็นที่พิมพ์ลงบนบรรทัดเส้นจุด/เส้นใต้ คงความสูงอย่างน้อยเท่าจำนวนบรรทัดเดิม */
function renderOpinion(block: PreparedBlock, text: string) {
  const size = block.mark.sz ?? 16
  const lineHeight = size * SINGLE
  const rule = block.opinion!.dotted
    ? `radial-gradient(circle at 50% calc(100% - 0.8pt), #000 0.55pt, transparent 0.65pt);background-size:2.4pt ${pt(lineHeight)}`
    : `linear-gradient(to top, #000 0.75pt, transparent 0.75pt);background-size:100% ${pt(lineHeight)}`
  const lines = text.split('\n').map((line) => escapeHtml(line) || '&#8203;').join('<br>')
  return `<div class="a6-p a6-opinion" data-b="${escapeHtml(block.key)}" style="font-size:${pt(size)};line-height:${SINGLE};min-height:${pt(lineHeight * block.opinion!.keys.length)};background-image:${rule};background-repeat:repeat"><span class="a6-f" data-f="${escapeHtml(block.opinion!.id)}" style="font-size:${pt(size)}">${lines}</span></div>`
}

function bodyHtml(form: AdditionalFormTemplate, values: AdditionalFormValues, ctx: RenderCtx) {
  const prepared = getPrepared(form.id, form.layout)
  return sourceBreaks(prepared.blocks).map((block) => {
    const opinionId = block.opinion?.id ?? block.opinionPart
    const opinion = opinionId ? values.values[opinionId] : undefined
    if (opinion?.trim()) return block.opinion ? renderOpinion(block, opinion) : ''
    if (block.opinion && ctx.interactive) {
      // คลิกบรรทัดความเห็นว่างเพื่อเปิดช่องกรอกความเห็น
      return renderBlock(block, ctx).replace('class="a6-p', `data-f="${escapeHtml(block.opinion.id)}" class="a6-p`)
    }
    return renderBlock(block, ctx)
  }).join('')
}

export interface DocumentOptions {
  signableField?: string
  interactive?: boolean
  /** ฝังฟอนต์และรูปเป็น data URI เพื่อเปิดไฟล์ได้โดยไม่ต้องต่อระบบ */
  embedded?: { fonts: Record<string, string>; images: Record<string, string> }
}

const FONT_FILES: Record<string, { weight: number; style: string }> = {
  'THSarabunNew.ttf': { weight: 400, style: 'normal' },
  'THSarabunNew-Bold.ttf': { weight: 700, style: 'normal' },
  'THSarabunNew-Italic.ttf': { weight: 400, style: 'italic' },
  'THSarabunNew-BoldItalic.ttf': { weight: 700, style: 'italic' },
}
export const ADDITIONAL_FONT_FILES = Object.keys(FONT_FILES)
export const FONT_BASE = '/assets/fonts/'
export const MEDIA_BASE = '/assets/forms/additional/media/'

export function additionalFormImages(form: AdditionalFormTemplate) {
  const files = new Set<string>()
  const visit = (blocks: Block[]) => blocks.forEach((block) => {
    block.runs.forEach((run) => { if (run.img) files.add(run.img) })
    block.floats?.forEach((float) => {
      if (float.type === 'img') files.add(float.img)
      if (float.type === 'textbox') visit(float.blocks)
    })
  })
  visit(form.layout.blocks)
  Object.values(form.layout.headers).forEach(visit)
  return Array.from(files)
}

/** เนื้อความของแบบ (ย่อหน้าทั้งหมดก่อนตัดหน้า) ใช้ส่งให้ตัวอย่างที่เปิดอยู่จัดหน้าใหม่ */
export function additionalFormBody(form: AdditionalFormTemplate, values: AdditionalFormValues, options: DocumentOptions = {}) {
  const ctx = renderCtx(values, options)
  return bodyHtml(form, values, ctx)
}

function renderCtx(values: AdditionalFormValues, options: DocumentOptions): RenderCtx {
  return {
    values,
    signableField: options.signableField,
    interactive: Boolean(options.interactive),
    asset: (file) => options.embedded?.images[file] ?? `${MEDIA_BASE}${file}`,
  }
}

/** เอกสาร HTML ฉบับเต็ม ใช้ทั้งตัวอย่างบนหน้าจอ การพิมพ์/บันทึก PDF และไฟล์ดาวน์โหลด */
export function additionalFormDocument(form: AdditionalFormTemplate, values: AdditionalFormValues, options: DocumentOptions = {}) {
  const ctx = renderCtx(values, options)
  const { page } = form.layout
  const prepared = getPrepared(form.id, form.layout)
  const fontFaces = Object.entries(FONT_FILES).map(([file, face]) => {
    const local = face.weight === 700 ? (face.style === 'italic' ? 'TH SarabunIT๙ Bold Italic' : 'TH SarabunIT๙ Bold') : face.style === 'italic' ? 'TH SarabunIT๙ Italic' : 'TH SarabunIT๙'
    const url = options.embedded?.fonts[file] ?? `${FONT_BASE}${file}`
    return `@font-face{font-family:"A6 Sarabun";src:local("${local}"),url("${url}") format("truetype");font-weight:${face.weight};font-style:${face.style}}`
  }).join('')
  const bodyWidth = page.w - page.left - page.right
  const headerTemplates = Object.entries(prepared.headers).map(([name, blocks]) => {
    const kind = name.replace(/^header-/, '').replace(/^footer-/, 'footer-')
    if (!name.startsWith('header-')) return ''
    return `<template id="a6-header-${kind === 'even' ? 'even' : kind}">${blocks.map((block) => renderBlock(block, ctx)).join('')}</template>`
  }).join('')
  const config: RuntimeConfig = {
    defaultTab: 36,
    numFmt: page.numFmt,
    titlePg: page.titlePg,
    topExact: Boolean(page.topExact),
    interactive: Boolean(options.interactive),
  }
  const interactiveCss = options.interactive
    ? '.a6-f{cursor:pointer;border-radius:2px}.a6-f:hover,.a6-p:hover>.a6-ln>.a6-seg>.a6-f{background:rgba(202,166,49,.18)}.a6-on{background:rgba(202,166,49,.32)!important;outline:1px solid rgba(202,166,49,.9)}.a6-p{cursor:text}.a6-edited{background:rgba(8,43,80,.04)}.a6-editing .a6-f{background:rgba(247,237,203,.6);outline:1px dashed rgba(202,166,49,.8);cursor:text}.a6-editing .a6-f:focus{outline:2px solid #caa631;background:#fff8df}'
    : ''
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(form.title)}</title>
<style>${options.signableField ? "@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@600&display=swap');" : ''}${fontFaces}
@page{size:${pt(page.w)} ${pt(page.h)};margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#525659;color:#000;font-family:"A6 Sarabun","TH SarabunIT๙","TH Sarabun New","TH SarabunPSK",sans-serif;font-kerning:normal;-webkit-print-color-adjust:exact;print-color-adjust:exact}
#a6-pages{padding:0}
.a6-sheet{position:relative;z-index:0;width:${pt(page.w)};height:${pt(page.h)};margin:0 auto 18px;background:#fff;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.35)}
.a6-sheet:last-child{margin-bottom:0}
.a6-body{position:absolute;left:${pt(page.left)};top:${pt(page.top)};width:${pt(bodyWidth)};height:${pt(page.h - page.top - page.bottom)}}
.a6-header{position:absolute;left:${pt(page.left)};top:${pt(page.header)};width:${pt(bodyWidth)}}
.a6-p{position:relative;margin:0;white-space:pre-wrap;overflow-wrap:break-word;line-break:auto}
.a6-ln{display:block}
.a6-tab{display:inline-block;height:0;vertical-align:-0.05em;white-space:nowrap}
.a6-u-solid{border-bottom:0.75pt solid #000}.a6-u-dotted{border-bottom:1pt dotted #000}
.a6-leader-dot{border-bottom:1pt dotted #000}.a6-leader-hyphen{border-bottom:0.75pt dashed #000}.a6-leader-underscore{border-bottom:0.75pt solid #000}
.a6-float{position:absolute;display:block;text-indent:0;text-align:left;white-space:normal}
.a6-box{white-space:normal}
.a6-box .a6-p{white-space:pre-wrap}
.a6-inline{vertical-align:baseline}
[style*="text-decoration-line"]{text-decoration-thickness:from-font;text-underline-position:auto;text-underline-offset:auto}
#a6-source{position:absolute;left:-10000px;top:0;width:${pt(bodyWidth)};visibility:hidden}
${interactiveCss}
/* Match PAPER_SIGN_BUTTON_CLASS inside this isolated document iframe. */
.a6-paper-sign{position:absolute;left:50%;bottom:0.1em;transform:translateX(-50%);z-index:2;display:inline-flex;min-height:26px;align-items:center;gap:4px;white-space:nowrap;border-radius:9999px;border:1px solid #5b84c4;background:rgba(243,247,254,.95);padding:2px 10px;font-family:Sarabun,"Noto Sans Thai",Tahoma,sans-serif;font-size:12px;font-weight:600;line-height:1.25;color:#1f4f8f;box-shadow:0 1px 2px rgba(15,35,70,.12);cursor:pointer;transition:background-color .15s}
.a6-paper-sign:hover{background:#e3edfb}
@media print{.a6-paper-sign{display:none!important}}
@media print{body{background:none}.a6-sheet{margin:0;box-shadow:none;break-after:page}.a6-sheet:last-child{break-after:auto}.a6-on,.a6-f:hover{background:none!important;outline:none!important}.a6-edited{background:none}}
</style></head><body>
<template id="a6-page"><section class="a6-sheet"><div class="a6-header a6-col"></div><div class="a6-body a6-col"></div></section></template>
${headerTemplates}
<div id="a6-source" class="a6-col" aria-hidden="true">${bodyHtml(form, values, ctx)}</div>
<main id="a6-pages" aria-label="${escapeHtml(form.title)}"></main>
<script>(${a6LayoutRuntime.toString()})(${JSON.stringify(config)})</script>
</body></html>`
}

/** ข้อความเดิมรายย่อหน้า สำหรับเปิดร่างที่บันทึกไว้ก่อนมีช่องข้อมูล */
export function legacyAdditionalFormHtml(template: AdditionalFormTemplate, texts: string[]): string {
  const paragraphs = template.paragraphs.map((paragraph, index) =>
    `<p style="text-align:${paragraph.align};font-weight:${paragraph.bold ? '700' : '400'}">${escapeHtml(texts[index] ?? paragraph.text)}</p>`,
  ).join('\n')
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(template.title)}</title>
    <style>@page{size:A4;margin:25mm 20mm}body{margin:0;font-family:'TH SarabunIT๙','TH Sarabun New','Sarabun',sans-serif;font-size:16pt;line-height:1.35}p{white-space:pre-wrap;margin:0 0 6pt}</style></head><body>${paragraphs}</body></html>`
}

/** ค่าที่กรอกของช่องหนึ่ง (ไม่กรอก = ข้อความตัวอย่างตามต้นฉบับ) */
export const fieldValue = (field: AdditionalField, values: AdditionalFormValues) => values.values[field.id] ?? field.sample

/** ข้อความของย่อหน้า (รวมค่าที่กรอกแล้ว) สำหรับเปิดแก้ทั้งย่อหน้า */
export function additionalParagraphText(form: AdditionalFormTemplate, key: string, values: AdditionalFormValues) {
  if (values.paragraphs[key] !== undefined) return values.paragraphs[key]
  const prepared = getPrepared(form.id, form.layout)
  const find = (blocks: PreparedBlock[]): PreparedBlock | undefined => {
    for (const block of blocks) {
      if (block.key === key) return block
      for (const float of block.floats ?? []) {
        if (float.type === 'textbox') {
          const hit = find(float.blocks as PreparedBlock[])
          if (hit) return hit
        }
      }
    }
    return undefined
  }
  const block = find(prepared.blocks)
  if (!block) return undefined
  const ctx = renderCtx(values, {})
  let text = ''
  for (let i = 0; i < block.runs.length; i++) {
    const run = block.runs[i]
    if (run.f) {
      let sample = ''
      let j = i
      while (j < block.runs.length && block.runs[j].f === run.f) { sample += block.runs[j].t ?? ''; j++ }
      text += fieldText(run.f, sample, ctx)
      i = j - 1
    } else if (run.t !== undefined) text += run.t
    else if (run.tab) text += '\t'
    else if (run.br) text += '\n'
  }
  return text
}

/** จำนวนหน้าตามที่ Word บันทึกไว้ในต้นฉบับ */
export const sourcePageCount = (form: AdditionalFormTemplate) => form.layout.page.wordPages
