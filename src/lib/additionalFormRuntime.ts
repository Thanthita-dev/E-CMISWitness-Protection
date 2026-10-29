/**
 * ตัวจัดหน้ากระดาษที่ฝังอยู่ในเอกสาร HTML ของแบบฟอร์มและหนังสือประกอบ
 *
 * ฟังก์ชันนี้ถูกแปลงเป็นข้อความด้วย toString() แล้วฝังลงในเอกสาร จึงห้ามอ้างตัวแปรนอกฟังก์ชัน
 * ตัวอย่างบนหน้าจอ ผลพิมพ์ และไฟล์ที่ดาวน์โหลดใช้โค้ดชุดนี้ชุดเดียว ทำให้ตัดหน้าเหมือนกัน
 *
 * ลำดับงาน: วางย่อหน้าทีละย่อหน้าลงหน้ากระดาษ → คำนวณความกว้างแท็บตามตำแหน่งแท็บของ Word →
 * ถ้าล้นหน้า ตัดย่อหน้าตามบรรทัด (คุมบรรทัดเดี่ยวหัว/ท้ายหน้าแบบ Word) หรือย้ายทั้งชุดที่ต้องอยู่ด้วยกัน
 */
export interface RuntimeConfig {
  /** ระยะแท็บเริ่มต้นของเอกสาร (pt) */
  defaultTab: number
  /** รูปแบบเลขหน้าในหัวกระดาษ */
  numFmt: string
  /** หน้าแรกใช้หัวกระดาษแยก (Word: Different first page) */
  titlePg: boolean
  /** ขอบบนแบบตรงตามค่า หัวกระดาษไม่ดันเนื้อหา */
  topExact: boolean
  interactive: boolean
}

export function a6LayoutRuntime(cfg: RuntimeConfig) {
  const PX = 96 / 72
  const doc = document
  const source = doc.getElementById('a6-source') as HTMLElement
  const sheets = doc.getElementById('a6-pages') as HTMLElement
  const pageTemplate = doc.getElementById('a6-page') as HTMLTemplateElement
  const win = window as unknown as Record<string, unknown>

  const thaiDigits = (value: string) => value.replace(/[0-9]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'[Number(d)])
  const pageLabel = (n: number) => (cfg.numFmt === 'thaiNumbers' ? thaiDigits(String(n)) : String(n))

  function newPage(index: number) {
    const page = (pageTemplate.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement
    sheets.appendChild(page)
    const kind = index === 0 && cfg.titlePg ? 'first' : 'default'
    const header = doc.getElementById('a6-header-' + kind) as HTMLTemplateElement | null
    const headerBox = page.querySelector('.a6-header') as HTMLElement
    if (header) headerBox.appendChild(header.content.cloneNode(true))
    headerBox.querySelectorAll('.a6-pg').forEach((el) => { el.textContent = pageLabel(index + 1) })
    const body = page.querySelector('.a6-body') as HTMLElement
    if (header && !cfg.topExact) {
      // Word ดันเนื้อหาลงเมื่อหัวกระดาษสูงเกินขอบบน
      layoutTabs(headerBox)
      const headerBottom = headerBox.offsetTop + headerBox.offsetHeight
      if (headerBottom > body.offsetTop) {
        const shift = headerBottom - body.offsetTop
        body.style.top = headerBottom + 'px'
        body.style.height = body.offsetHeight - shift + 'px'
      }
    } else if (header) {
      layoutTabs(headerBox)
    }
    return body
  }

  /** ความกว้างแท็บตามตำแหน่งแท็บในย่อหน้า วัดจากขอบซ้ายของคอลัมน์ (เหมือน Word) */
  function layoutTabs(scope: HTMLElement) {
    const paras = Array.from(scope.querySelectorAll<HTMLElement>('.a6-p'))
    if (scope.classList.contains('a6-p')) paras.unshift(scope)
    paras.forEach((para) => {
      const tabs = Array.from(para.querySelectorAll<HTMLElement>('.a6-tab')).filter((tab) => tab.closest('.a6-p') === para)
      if (!tabs.length) return
      const column = (para.closest('.a6-col') as HTMLElement) || para.parentElement!
      const stops: { pos: number; val: string; leader: string }[] = JSON.parse(para.dataset.tabs || '[]')
      const indentLeft = Number(para.dataset.l || 0)
      const hanging = Number(para.dataset.fl || 0) < 0
      tabs.forEach((tab) => { tab.style.width = '0px' })
      for (const tab of tabs) {
        const colLeft = column.getBoundingClientRect().left + (column.clientLeft || 0) + parseFloat(getComputedStyle(column).paddingLeft || '0')
        const x = (tab.getBoundingClientRect().left - colLeft) / PX
        const custom = stops.filter((stop) => stop.pos > x + 0.3 && stop.val !== 'bar')
        if (hanging && indentLeft > x + 0.3) custom.push({ pos: indentLeft, val: 'left', leader: 'none' })
        custom.sort((a, b) => a.pos - b.pos)
        let stop = custom[0]
        if (!stop) {
          const next = (Math.floor((x + 0.3) / cfg.defaultTab) + 1) * cfg.defaultTab
          stop = { pos: next, val: 'left', leader: 'none' }
        }
        let width = stop.pos - x
        if (stop.val === 'center' || stop.val === 'right' || stop.val === 'decimal') {
          const segment = tab.nextElementSibling as HTMLElement | null
          const segWidth = segment && segment.classList.contains('a6-seg') ? segment.getBoundingClientRect().width / PX : 0
          width -= stop.val === 'center' ? segWidth / 2 : segWidth
        }
        tab.style.width = Math.max(0, width) + 'pt'
        if (stop.leader && stop.leader !== 'none') tab.classList.add('a6-leader-' + stop.leader)
      }
    })
  }

  const contentBottom = (block: HTMLElement) => block.offsetTop + block.offsetHeight - parseFloat(getComputedStyle(block).paddingBottom || '0')

  function textNodes(root: HTMLElement) {
    const nodes: Text[] = []
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => ((node.parentElement?.closest('.a6-float') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)),
    })
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    return nodes
  }

  /** ตัดย่อหน้าที่ล้นหน้าตามบรรทัด คงอย่างน้อย 2 บรรทัดทั้งท้ายหน้าและหัวหน้าถัดไป */
  function splitParagraph(block: HTMLElement, limit: number): HTMLElement | null {
    if (block.dataset.keepLines === '1') return null
    const range = doc.createRange()
    const lines: { node: Text; offset: number; top: number; bottom: number }[] = []
    for (const node of textNodes(block)) {
      for (let i = 0; i < node.length; i++) {
        range.setStart(node, i)
        range.setEnd(node, i + 1)
        const rect = range.getClientRects()[0]
        if (!rect || rect.width === 0 && /\s/.test(node.data[i])) continue
        const last = lines[lines.length - 1]
        if (!last || rect.top >= last.bottom - 2) lines.push({ node, offset: i, top: rect.top, bottom: rect.bottom })
        else last.bottom = Math.max(last.bottom, rect.bottom)
      }
    }
    const blockTop = block.getBoundingClientRect().top
    const fitCount = lines.filter((line) => line.bottom - blockTop + block.offsetTop <= limit + 0.5).length
    if (lines.length < 4 || fitCount < 2) return null
    const keep = Math.min(fitCount, lines.length - 2)
    if (keep < 2) return null
    const cut = lines[keep]
    range.setStart(block, 0)
    range.setEnd(cut.node, cut.offset)
    const first = block.cloneNode(false) as HTMLElement
    first.appendChild(range.extractContents())
    first.style.paddingBottom = '0'
    first.dataset.split = 'head'
    block.parentElement!.insertBefore(first, block)
    // ส่วนที่ต่อหน้าใหม่ไม่มีย่อหน้าบรรทัดแรกและระยะก่อนย่อหน้า
    block.style.textIndent = '0'
    block.style.paddingTop = '0'
    block.dataset.cont = '1'
    block.querySelectorAll<HTMLElement>('.a6-ln').forEach((line, index) => { if (index === 0) line.style.textIndent = '0' })
    return block
  }

  function paginate() {
    sheets.innerHTML = ''
    const queue = Array.from(source.children).map((block) => block.cloneNode(true) as HTMLElement)
    let pageIndex = 0
    let body = newPage(pageIndex)
    while (queue.length) {
      const block = queue.shift()!
      if (block.dataset.pb === '1' && body.children.length) body = newPage(++pageIndex)
      // Word ไม่เว้นระยะก่อนย่อหน้าแรกของหน้าที่ขึ้นใหม่
      if (!body.children.length && pageIndex > 0) block.style.paddingTop = '0'
      body.appendChild(block)
      layoutTabs(block)
      const limit = body.clientHeight
      if (contentBottom(block) <= limit + 0.5) continue
      // บรรทัดว่างท้ายหน้าที่ตามด้วยการขึ้นหน้าใหม่ ปล่อยไว้ในขอบล่าง ไม่ต้องเปิดหน้าว่าง
      if (block.dataset.empty === '1' && queue[0]?.dataset.pb === '1') continue
      const rest = block.dataset.empty === '1' ? null : splitParagraph(block, limit)
      if (rest) {
        rest.remove()
        queue.unshift(rest)
        body = newPage(++pageIndex)
        continue
      }
      if (block === body.firstElementChild) continue // ยาวเกินหน้าและตัดไม่ได้ วางต่อเหมือน Word
      // ย้ายย่อหน้าพร้อมย่อหน้าก่อนหน้าที่ตั้งให้อยู่กับย่อหน้าถัดไป (keep with next) ไปหน้าใหม่
      const moving: HTMLElement[] = [block]
      let prev = block.previousElementSibling as HTMLElement | null
      while (prev && prev.dataset.keepNext === '1') {
        moving.unshift(prev)
        prev = prev.previousElementSibling as HTMLElement | null
      }
      if (moving[0] === body.firstElementChild) moving.splice(0, moving.length - 1)
      moving.forEach((el) => el.remove())
      queue.unshift(...moving)
      body = newPage(++pageIndex)
    }
    placePageFloats()
    sheets.querySelectorAll<HTMLElement>('.a6-sheet').forEach((sheet, index, all) => {
      sheet.dataset.page = String(index + 1)
      sheet.setAttribute('aria-label', 'หน้า ' + (index + 1) + ' จาก ' + all.length)
    })
    win.a6PageCount = sheets.children.length
  }

  /** รูป/กล่องที่ Word วางเทียบกับหน้ากระดาษ ต้องคำนวณหลังรู้ตำแหน่งย่อหน้าในหน้า */
  function placePageFloats() {
    sheets.querySelectorAll<HTMLElement>('[data-ypage],[data-xpage]').forEach((el) => {
      const sheet = el.closest('.a6-sheet') as HTMLElement
      const host = el.offsetParent as HTMLElement
      if (!sheet || !host) return
      const sheetRect = sheet.getBoundingClientRect()
      const hostRect = host.getBoundingClientRect()
      if (el.dataset.ypage) el.style.top = Number(el.dataset.ypage) * PX - (hostRect.top - sheetRect.top) + 'px'
      if (el.dataset.xpage) el.style.left = Number(el.dataset.xpage) * PX - (hostRect.left - sheetRect.left) + 'px'
    })
  }

  function notifySize() {
    const height = sheets.scrollHeight
    win.a6Height = height
    try {
      window.parent?.postMessage({ type: 'a6-layout', height, pages: sheets.children.length }, '*')
    } catch {
      // หน้าเปิดเดี่ยว ไม่มีหน้าแม่
    }
  }

  /** ขยายเอกสาร: ช่องข้อมูลบนกระดาษพิมพ์แก้ได้โดยตรง ส่งค่าให้หน้าแม่เก็บในร่างชุดเดียวกัน */
  let editable = false
  function applyEditable() {
    sheets.querySelectorAll<HTMLElement>('.a6-f[data-f]').forEach((el) => {
      if (editable) {
        el.setAttribute('contenteditable', 'plaintext-only')
        el.setAttribute('role', 'textbox')
        el.setAttribute('aria-label', el.dataset.f || '')
        el.spellcheck = false
      } else {
        el.removeAttribute('contenteditable')
        el.removeAttribute('role')
      }
    })
    doc.body.classList.toggle('a6-editing', editable)
  }
  win.a6SetEditable = (on: boolean) => { editable = on; applyEditable() }

  let ready: Promise<void>
  function run() {
    const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts
    const wait = fonts
      ? Promise.all([
        fonts.load('16pt "A6 Sarabun"'), fonts.load('bold 16pt "A6 Sarabun"'), fonts.load('italic 16pt "A6 Sarabun"'),
      ]).then(() => fonts.ready).catch(() => undefined)
      : Promise.resolve()
    ready = wait.then(() => {
      paginate()
      applyEditable()
      notifySize()
    })
    win.a6Ready = ready
    return ready
  }

  /** หน้าแม่ส่งเนื้อหาใหม่มาเมื่อกรอกข้อมูล โดยไม่ต้องโหลดเอกสารใหม่ทั้งฉบับ */
  win.a6Update = (html: string) => {
    source.innerHTML = html
    return run()
  }

  if (cfg.interactive) {
    doc.addEventListener('input', (event) => {
      const field = (event.target as HTMLElement).closest?.('[data-f]') as HTMLElement | null
      if (!editable || !field) return
      window.parent?.postMessage({ type: 'a6-input', id: field.dataset.f, value: field.innerText.replace(/\n$/, '') }, '*')
    })
    doc.addEventListener('focusout', (event) => {
      if (editable && (event.target as HTMLElement).closest?.('[data-f]')) window.parent?.postMessage({ type: 'a6-commit' }, '*')
    })
    doc.addEventListener('click', (event) => {
      if (editable) return
      const target = event.target as HTMLElement
      const field = target.closest('[data-f]') as HTMLElement | null
      const para = target.closest('[data-b]') as HTMLElement | null
      if (!field && !para) return
      window.parent?.postMessage(field
        ? { type: 'a6-field', id: field.dataset.f }
        : { type: 'a6-paragraph', key: para!.dataset.b }, '*')
    })
    win.a6Focus = (id: string) => {
      sheets.querySelectorAll('.a6-on').forEach((el) => el.classList.remove('a6-on'))
      const hits = sheets.querySelectorAll<HTMLElement>('[data-f="' + id + '"]')
      hits.forEach((el) => el.classList.add('a6-on'))
      const first = hits[0]
      if (!first) return null
      const sheet = first.closest('.a6-sheet') as HTMLElement
      return sheet.offsetTop + (first.getBoundingClientRect().top - sheet.getBoundingClientRect().top)
    }
  }

  run()
}
