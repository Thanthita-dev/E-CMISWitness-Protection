import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { Director, roleName } from '../../director'
import type { UserRole } from '../../../src/types/user'

/**
 * ผู้กำกับคู่มือภาพหน้าจอ — ใช้ API เดียวกับ Director (click / fill / confirm / switchRole ...)
 * แต่แทนที่จะอัดวิดีโอ จะถ่ายภาพหน้าจอพร้อมกรอบไฮไลต์จุดที่ต้องกด "ก่อน" ทำการกดแต่ละครั้ง
 * แล้วเก็บรายการขั้นไว้ให้ build-guide.mjs สร้างหน้าเว็บคู่มือ
 *
 * - section(title) เริ่มกลุ่มขั้นใหม่ (หัวข้อในหน้าคู่มือ)
 * - recording = false ทำงานโดยไม่ถ่ายภาพ (ใช้เดินช่วงร่วมก่อนจุดแยกของทางแยก)
 */

export interface GuideShot {
  /** ลำดับภาพในเส้นทาง (นับจาก 1) */
  n: number
  section: string
  role: UserRole | null
  roleName: string
  /** ชนิดการกระทำ: click · fill · select · check · attach · date · confirm · look */
  action: string
  /** คำอธิบายบนป้ายไฮไลต์ */
  note: string
  /** ข้อความที่กรอก/ตัวเลือกที่เลือก (ถ้ามี) */
  value?: string
  /** ชื่อไฟล์ภาพ สัมพันธ์กับโฟลเดอร์ของเส้นทาง */
  file: string
  url: string
}

export interface GuideSection {
  title: string
  detail?: string
  role: UserRole | null
  roleName: string
}

export class GuideDirector extends Director {
  recording = true
  readonly shots: GuideShot[] = []
  readonly sections: GuideSection[] = []
  private sectionTitle = ''
  private pendingAction: { action: string; value?: string } | null = null

  constructor(page: Page, readonly outDir: string) {
    super(page)
    mkdirSync(outDir, { recursive: true })
  }

  /** ไม่ต้องมีเคอร์เซอร์จำลอง — ภาพนิ่งใช้กรอบไฮไลต์อย่างเดียว */
  override async install() {
    await this.page.addInitScript(() => {
      const s = document.createElement('style')
      s.textContent = '*,*::before,*::after{transition:none!important;animation-duration:0s!important;caret-color:transparent!important}'
      const mount = () => document.documentElement.appendChild(s)
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
      else mount()
    })
  }

  /** ภาพนิ่งไม่ต้องรอจังหวะผู้ชม — หน่วงสั้น ๆ ให้ UI นิ่งพอ */
  override async pause(ms = 800) {
    await this.page.waitForTimeout(Math.min(ms, 250))
  }

  override async moveTo() {}

  /** เริ่มหัวข้อใหม่ในคู่มือ */
  section(title: string, detail?: string) {
    this.sectionTitle = title
    if (this.recording) this.sections.push({ title, detail, role: this.currentRole, roleName: this.currentRole ? roleName(this.currentRole) : '' })
  }

  /** สลับบทบาท: ไม่มีฉากคั่นเต็มจอ แต่เปิดหัวข้อใหม่ตามป้ายของบทบาท */
  override async roleCard(s: { role: UserRole; label: string; detail?: string }) {
    this.currentRole = s.role
    this.section(s.label, s.detail)
  }

  override async titleCard() {}
  override async stepBadge() {}

  /** วาดกรอบ (สไตล์ภาพนิ่ง) → ถ่ายภาพ → ลบกรอบ */
  protected override async drawHighlight(target: Locator, note?: string) {
    const box = await super.drawHighlight(target, note)
    const pending = this.pendingAction ?? { action: 'look' }
    this.pendingAction = null
    if (!box || !this.recording) return box
    // ภาพนิ่ง: ปิดแอนิเมชัน และวางป้ายตามความสูงจริง (ป้ายสองบรรทัดต้องไม่ทับองค์ประกอบที่ชี้)
    await this.page.evaluate((box) => {
      const els = [...document.querySelectorAll<HTMLElement>('.__vid_hl')]
      els.forEach((e) => (e.style.animation = 'none'))
      const tag = els.find((e) => e.textContent)
      if (!tag) return
      const pad = 6
      const h = tag.getBoundingClientRect().height
      const above = box.y - pad - h - 8
      tag.style.top = `${above >= 72 ? above : box.y + box.height + pad + 8}px`
    }, box)
    if (!this.sectionTitle) this.section('เริ่มต้น')
    const n = this.shots.length + 1
    const file = `${String(n).padStart(3, '0')}.jpg`
    await this.page.screenshot({ path: resolve(this.outDir, file), type: 'jpeg', quality: 82 })
    this.shots.push({
      n,
      section: this.sectionTitle,
      role: this.currentRole,
      roleName: this.currentRole ? roleName(this.currentRole) : '',
      action: pending.action,
      note: note ?? '',
      value: pending.value,
      file,
      url: new URL(this.page.url()).pathname,
    })
    return box
  }

  private tag(action: string, value?: string) {
    this.pendingAction = { action, value }
  }

  override async click(target: Locator, opts: { note?: string; after?: number } = {}) {
    this.tag(this.inConfirm ? 'confirm' : 'click')
    return super.click(target, opts)
  }

  override async fill(target: Locator, text: string, opts: { note?: string; after?: number } = {}) {
    // super.fill อาจเรียก fillDate ต่อ — fillDate ตั้งชนิดเองทับ
    this.tag('fill', text)
    return super.fill(target, text, opts)
  }

  override async fillDate(target: Locator, iso: string, note?: string) {
    this.tag('date', iso)
    return super.fillDate(target, iso, note)
  }

  override async attach(input: Locator, fileName: string, note?: string) {
    this.tag('attach', fileName)
    return super.attach(input, fileName, note)
  }

  override async select(target: Locator, value: string | { label: string }, opts: { note?: string; after?: number } = {}) {
    this.tag('select', typeof value === 'string' ? value : value.label)
    return super.select(target, value, opts)
  }

  override async check(target: Locator, opts: { note?: string; after?: number } = {}) {
    this.tag('check')
    return super.check(target, opts)
  }

  override async highlight(target: Locator, note?: string, ms = 1800) {
    this.tag('look')
    return super.highlight(target, note, ms)
  }

  private inConfirm = false
  override async confirm(buttonName: string, note = 'ตรวจสรุปแล้วกดยืนยัน', readMs = 1200) {
    this.inConfirm = true
    try {
      return await super.confirm(buttonName, note, readMs)
    } finally {
      this.inConfirm = false
    }
  }

  /** ภาพหน้าจอผลลัพธ์ (ไม่มีจุดกด) — ใช้ปิดท้ายหัวข้อให้เห็นสถานะหลังทำเสร็จ */
  async result(target: Locator, note: string) {
    this.tag('result')
    await target.waitFor().catch(() => {})
    await this.drawHighlight(target, note)
    await this.clearHighlight()
  }

  /** เขียนข้อมูลเส้นทางให้ build-guide.mjs */
  save(meta: { id: string; title: string; summary: string; order?: number; branchFrom?: string; branchSection?: string; caseNo?: string }) {
    writeFileSync(
      resolve(this.outDir, 'guide.json'),
      JSON.stringify({ ...meta, capturedAt: new Date().toISOString(), sections: this.sections, shots: this.shots }, null, 2)
    )
  }
}
