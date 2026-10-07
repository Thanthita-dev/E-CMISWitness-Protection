import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'
import { shiftMockDates } from '../src/lib/mockDateShift'
import { ROLE_NAMES, ROLE_ORG_ASSIGNMENTS } from '../src/lib/constants'
import type { UserRole } from '../src/types/user'

/**
 * ผู้กำกับวิดีโอสอนใช้งาน — ห่อ Page ของ Playwright ให้ทุกการกดมีเคอร์เซอร์เคลื่อนที่ให้เห็น
 * มีกรอบไฮไลต์องค์ประกอบก่อนกด และมีฉากเปิด/ฉากคั่นบทบาทซ้อนบนหน้าแอป (ใช้ฟอนต์ Kanit ของแอป)
 *
 * วิดีโอของ Playwright ไม่บันทึกเมาส์จริง จึงวาดเคอร์เซอร์เองด้วย init script ที่ตามเหตุการณ์ mousemove
 */

const here = dirname(fileURLToPath(import.meta.url))
const mockStatesDir = resolve(here, '../src/mock-states')

/** เวลาค้างของแต่ละฉาก (ms) — ปรับรวมได้ด้วย VIDEO_PACE เช่น VIDEO_PACE=0.5 เพื่อเรนเดอร์เร็วตอนตรวจสคริปต์ */
const PACE = Number(process.env.VIDEO_PACE || 1)
const t = (ms: number) => Math.round(ms * PACE)

const Z = 2147483000

export interface MockStateFile {
  name: string
  to: string | null
  capturedAt?: string
  localStorageData: Record<string, string>
}

export function readMockState(name: string): MockStateFile {
  return JSON.parse(readFileSync(resolve(mockStatesDir, `${name}.json`), 'utf-8'))
}

/** บทบาทที่ล็อกอินอยู่ตอนบันทึก mock state */
export function mockStateRole(name: string): UserRole {
  const raw = readMockState(name).localStorageData['ecmis-auth-storage']
  return JSON.parse(raw).state.currentRole as UserRole
}

export const roleName = (role: UserRole) => ROLE_NAMES[role] ?? role

/** วันที่ yyyy-mm-dd ที่เลื่อนจากวันนี้ (เวลาท้องถิ่น) — ใช้กรอกช่องวันที่ให้สัมพันธ์กับ mock state ที่เลื่อนวันตามวันนี้ */
export function isoDaysFromToday(n: number) {
  const x = new Date()
  x.setDate(x.getDate() + n)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

interface ActionOptions {
  /** ป้ายข้อความเหนือกรอบไฮไลต์ — บอกสั้น ๆ ว่ากำลังกดอะไร */
  note?: string
  /** หน่วงหลังทำเสร็จ (ms ก่อนคูณ PACE) */
  after?: number
}

let checkpointSeq = 0

export class Director {
  /** บทบาทที่กำลังล็อกอินอยู่ในวิดีโอ — ใช้ตัดสินว่าต้องขึ้นฉากคั่นบทบาทหรือไม่ */
  currentRole: UserRole | null = null
  /** จุดเริ่มของแต่ละช่วงในวิดีโอ (วินาที) — หน้ารวมวิดีโอใช้ทำรายการขั้นที่กดข้ามไปได้ */
  readonly chapters: Array<{ at: number; role: UserRole; label: string }> = []
  private readonly startedAt = Date.now()

  /** บันทึกจุดเริ่มช่วงใหม่ในวิดีโอ */
  mark(role: UserRole, label: string) {
    this.chapters.push({ at: (Date.now() - this.startedAt) / 1000, role, label })
  }

  constructor(readonly page: Page) {}

  /** ติดตั้งเคอร์เซอร์จำลองให้ทุกหน้าที่โหลด — เรียกครั้งเดียวก่อนเริ่มถ่าย */
  async install() {
    await this.page.addInitScript((z: number) => {
      const mount = () => {
        if (document.getElementById('__vid_cursor')) return
        const s = document.createElement('style')
        s.id = '__vid_style'
        s.textContent =
          '@keyframes __vidPulse{0%,100%{box-shadow:0 0 0 4px rgba(245,158,11,.25),0 0 18px rgba(245,158,11,.45)}50%{box-shadow:0 0 0 8px rgba(245,158,11,.15),0 0 32px rgba(245,158,11,.75)}}' +
          '@keyframes __vidIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}'
        document.documentElement.appendChild(s)
        const pos = JSON.parse(sessionStorage.getItem('__vid_pos') || '[960,540]')
        const c = document.createElement('div')
        c.id = '__vid_cursor'
        c.innerHTML =
          '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2l15 11.5-6.6 1.1 3.9 7.4-3 1.6-3.9-7.5L4 21z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
        Object.assign(c.style, {
          position: 'fixed', left: '0', top: '0', width: '30px', height: '30px', zIndex: String(z + 50),
          pointerEvents: 'none', transform: `translate(${pos[0]}px, ${pos[1]}px)`,
          filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))', transition: 'opacity .2s',
        })
        document.documentElement.appendChild(c)
        window.addEventListener('mousemove', (e) => {
          c.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`
          sessionStorage.setItem('__vid_pos', JSON.stringify([e.clientX - 3, e.clientY - 2]))
        }, true)
        window.addEventListener('mousedown', (e) => {
          const r = document.createElement('div')
          Object.assign(r.style, {
            position: 'fixed', left: `${e.clientX - 22}px`, top: `${e.clientY - 22}px`, width: '44px', height: '44px',
            borderRadius: '50%', background: 'rgba(245,158,11,.45)', border: '2px solid #f59e0b',
            zIndex: String(z + 49), pointerEvents: 'none', transform: 'scale(.3)', opacity: '1',
            transition: 'transform .45s ease-out, opacity .45s ease-out',
          })
          document.documentElement.appendChild(r)
          requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0' })
          setTimeout(() => r.remove(), 600)
        }, true)
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
      else mount()
    }, Z)
  }

  async pause(ms = 800) {
    await this.page.waitForTimeout(t(ms))
  }

  /**
   * โหลด mock state ของจุดพัก (แทนข้อมูล ecmis-* ทั้งหมด) แล้วเปิดหน้าเป้าหมาย
   * ใช้ init script ที่มีลำดับกำกับ — สคริปต์ของจุดพักก่อนหน้าจะไม่เขียนทับจุดพักใหม่เมื่อมีการโหลดหน้าซ้ำ
   */
  async loadCheckpoint(name: string, role: UserRole, path?: string | null) {
    const state = readMockState(name)
    const data = shiftMockDates({ ...state.localStorageData }, state.capturedAt)
    const auth = JSON.parse(data['ecmis-auth-storage'])
    if (auth.state.currentRole !== role) {
      const a = ROLE_ORG_ASSIGNMENTS[role] || ROLE_ORG_ASSIGNMENTS.receiver
      auth.state.currentRole = role
      auth.state.currentOrgUnitId = a.central ? 'central-wp' : a.units[0] || 'central-wp'
    }
    data['ecmis-auth-storage'] = JSON.stringify(auth)
    const seq = ++checkpointSeq
    await this.page.addInitScript(
      ({ entries, seq }: { entries: Record<string, string>; seq: number }) => {
        if (Number(sessionStorage.getItem('__vid_cp') || 0) >= seq) return
        Object.keys(localStorage).filter((k) => k.startsWith('ecmis-')).forEach((k) => localStorage.removeItem(k))
        Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v))
        sessionStorage.setItem('__vid_cp', String(seq))
      },
      { entries: data, seq }
    )
    await this.goto(path || state.to || '/')
  }

  /**
   * สลับผู้ใช้กลางจุดพัก (ข้อมูลแฟ้มคงเดิม) แล้วขึ้นฉากคั่นบทบาท — ใช้เมื่อขั้นถัดไปเป็นงานของบทบาทอื่น
   * เช่น เจ้าหน้าที่เสนอแล้ว → ผบช.ชั้นต้นตรวจ ภายในจุดพักเดียวกัน
   */
  async switchRole(role: UserRole, label: string, detail?: string, path?: string) {
    await this.page.evaluate(
      ({ role, a }) => {
        const raw = localStorage.getItem('ecmis-auth-storage')
        if (!raw) return
        const auth = JSON.parse(raw)
        auth.state.currentRole = role
        auth.state.currentOrgUnitId = a.central ? 'central-wp' : a.units[0] || 'central-wp'
        localStorage.setItem('ecmis-auth-storage', JSON.stringify(auth))
      },
      { role, a: ROLE_ORG_ASSIGNMENTS[role] || ROLE_ORG_ASSIGNMENTS.receiver }
    )
    if (path) await this.goto(path)
    else {
      await this.page.reload()
      await this.page.waitForLoadState('networkidle').catch(() => {})
    }
    this.mark(role, label)
    if (this.currentRole !== role) await this.roleCard({ role, label, detail })
    this.currentRole = role
  }

  async goto(path: string) {
    await this.page.goto(path)
    await this.page.waitForLoadState('networkidle').catch(() => {})
    await this.page.waitForTimeout(300)
  }

  /** เลื่อนเคอร์เซอร์อย่างนุ่มนวลไปยังจุด (x, y) */
  async moveTo(x: number, y: number) {
    const from = await this.page.evaluate(() => JSON.parse(sessionStorage.getItem('__vid_pos') || '[960,540]'))
    const dist = Math.hypot(x - from[0], y - from[1])
    const steps = Math.max(8, Math.min(45, Math.round(dist / 22)))
    await this.page.mouse.move(x, y, { steps })
  }

  /** วาดกรอบไฮไลต์รอบองค์ประกอบ (คืนค่า id ไว้ลบ) */
  protected async drawHighlight(target: Locator, note?: string) {
    await target.scrollIntoViewIfNeeded()
    await this.page.waitForTimeout(150)
    const box = await target.boundingBox()
    if (!box) return null
    await this.page.evaluate(
      ({ box, note, z }) => {
        document.querySelectorAll('.__vid_hl').forEach((e) => e.remove())
        const pad = 6
        const hl = document.createElement('div')
        hl.className = '__vid_hl'
        Object.assign(hl.style, {
          position: 'fixed', left: `${box.x - pad}px`, top: `${box.y - pad}px`,
          width: `${box.width + pad * 2}px`, height: `${box.height + pad * 2}px`,
          border: '3px solid #f59e0b', borderRadius: '10px', zIndex: String(z + 10), pointerEvents: 'none',
          boxShadow: '0 0 0 4px rgba(245,158,11,.25), 0 0 24px rgba(245,158,11,.55)',
          animation: '__vidPulse 1s ease-in-out infinite',
        })
        document.documentElement.appendChild(hl)
        if (note) {
          const tag = document.createElement('div')
          tag.className = '__vid_hl'
          tag.textContent = note
          const above = box.y > 70
          Object.assign(tag.style, {
            position: 'fixed', left: `${Math.max(8, Math.min(box.x - pad, window.innerWidth - 520))}px`,
            top: above ? `${box.y - pad - 46}px` : `${box.y + box.height + pad + 8}px`,
            maxWidth: '520px', padding: '7px 14px', borderRadius: '8px', background: '#f59e0b', color: '#1f2937',
            font: '600 17px Kanit, "Noto Sans Thai", sans-serif', zIndex: String(z + 11), pointerEvents: 'none',
            boxShadow: '0 6px 18px rgba(0,0,0,.25)', animation: '__vidIn .25s ease-out',
          })
          document.documentElement.appendChild(tag)
        }
      },
      { box, note, z: Z }
    )
    return box
  }

  async clearHighlight() {
    await this.page.evaluate(() => document.querySelectorAll('.__vid_hl').forEach((e) => e.remove())).catch(() => {})
  }

  /** ไฮไลต์เพื่อชี้ให้ดูเท่านั้น (ไม่กด) — ใช้กับข้อมูลสำคัญบนหน้าจอ */
  async highlight(target: Locator, note?: string, ms = 1800) {
    const box = await this.drawHighlight(target, note)
    if (box) await this.moveTo(box.x + Math.min(box.width - 10, 40), box.y + box.height / 2)
    await this.pause(ms)
    await this.clearHighlight()
  }

  /** ไฮไลต์ → เลื่อนเคอร์เซอร์ไปที่ปุ่ม → กด */
  async click(target: Locator, opts: ActionOptions = {}) {
    const box = await this.drawHighlight(target, opts.note)
    if (box) await this.moveTo(box.x + box.width / 2, box.y + box.height / 2)
    await this.pause(650)
    await this.clearHighlight()
    await target.click()
    await this.pause(opts.after ?? 900)
  }

  /** กดช่องกรอก แล้วพิมพ์ให้เห็นทีละตัว (ข้อความยาวพิมพ์ช่วงต้นแล้วเติมที่เหลือ) */
  async fill(target: Locator, text: string, opts: ActionOptions = {}) {
    if (/^(date|datetime-local|time|month)$/.test((await target.getAttribute('type')) ?? '')) {
      return this.fillDate(target, text, opts.note)
    }
    const box = await this.drawHighlight(target, opts.note)
    if (box) await this.moveTo(box.x + Math.min(box.width / 2, 120), box.y + box.height / 2)
    await this.pause(400)
    await target.click()
    await target.fill('')
    const typed = text.slice(0, 48)
    await target.pressSequentially(typed, { delay: Math.max(5, t(28)) })
    if (text.length > typed.length) await target.fill(text)
    await this.clearHighlight()
    await this.pause(opts.after ?? 500)
  }

  /**
   * ช่องวันที่ (input[type=date]) — พิมพ์ทีละตัวไม่ได้เพราะโลเคล th-TH แสดงปี พ.ศ. แล้วปีเพี้ยน
   * จึงชี้ช่องแล้วตั้งค่า ISO (yyyy-mm-dd) ตรง ๆ
   */
  async fillDate(target: Locator, iso: string, note?: string) {
    const box = await this.drawHighlight(target, note)
    if (box) await this.moveTo(box.x + Math.min(box.width / 2, 120), box.y + box.height / 2)
    await this.pause(600)
    await target.fill(iso)
    await this.clearHighlight()
    await this.pause(600)
  }

  /**
   * แนบไฟล์จำลอง — ช่อง file ของแอปซ่อนอยู่ใต้ปุ่ม/ป้ายอัปโหลด จึงชี้และเลื่อนเคอร์เซอร์ไปที่ตัวที่มองเห็นแทน
   * แล้วใส่ไฟล์ด้วย setInputFiles (ไม่เปิดหน้าต่างเลือกไฟล์ของระบบ)
   */
  async attach(input: Locator, fileName: string, note = 'แนบไฟล์หลักฐาน') {
    const visible = (await input.isVisible()) ? input : input.locator('xpath=ancestor::label[1] | ..').first()
    const box = await this.drawHighlight(visible, note)
    if (box) await this.moveTo(box.x + box.width / 2, box.y + box.height / 2)
    await this.pause(700)
    await input.setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 mock') })
    await this.clearHighlight()
    await this.pause(700)
  }

  /** จอยืนยัน SweetAlert2 — ค้างให้ผู้ชมอ่านสรุป แล้วกดปุ่มตามชื่อ */
  async confirm(buttonName: string, note = 'ตรวจสรุปแล้วกดยืนยัน', readMs = 1200) {
    const dialog = this.page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()
    await this.pause(readMs)
    await this.click(this.page.getByRole('button', { name: buttonName, exact: true }), { note, after: 0 })
    await dialog.waitFor({ state: 'detached' })
    await this.pause(600)
  }

  /** โมดัลลายมือชื่ออิเล็กทรอนิกส์ที่เปิดอยู่ — กรอกชื่อ (ถ้ายังว่าง) ติ๊กรับรอง แล้วยืนยัน */
  async sign(signer: string) {
    const nameInput = this.page.getByTestId('signature-name-input')
    await nameInput.waitFor()
    if (!(await nameInput.inputValue()).trim()) await this.fill(nameInput, signer, { note: 'กรอกชื่อผู้ลงนาม' })
    await this.check(this.page.getByTestId('signature-certify-checkbox'), { note: 'ติ๊กรับรองลายมือชื่อ' })
    await this.click(this.page.getByTestId('signature-confirm-button'), { note: 'ยืนยันลงลายมือชื่อ' })
  }

  async select(target: Locator, value: string | { label: string }, opts: ActionOptions = {}) {
    const box = await this.drawHighlight(target, opts.note)
    if (box) await this.moveTo(box.x + box.width / 2, box.y + box.height / 2)
    await this.pause(500)
    await target.selectOption(value)
    await this.clearHighlight()
    await this.pause(opts.after ?? 600)
  }

  async check(target: Locator, opts: ActionOptions = {}) {
    const box = await this.drawHighlight(target, opts.note)
    if (box) await this.moveTo(box.x + box.width / 2, box.y + box.height / 2)
    await this.pause(450)
    await this.clearHighlight()
    await target.check()
    await this.pause(opts.after ?? 600)
  }

  /** เลื่อนหน้าจอไปยังองค์ประกอบช้า ๆ ให้ผู้ชมตามทัน */
  async scrollTo(target: Locator) {
    await target.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await this.pause(900)
  }

  /** ฉากซ้อนเต็มจอ ค้างไว้ `ms` แล้วจางหาย */
  private async card(html: string, ms: number, opaque: boolean) {
    await this.page.evaluate(
      ({ html, opaque, z }) => {
        document.getElementById('__vid_card')?.remove()
        const el = document.createElement('div')
        el.id = '__vid_card'
        el.innerHTML = html
        Object.assign(el.style, {
          position: 'fixed', inset: '0', zIndex: String(z + 40), display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: opaque
            ? 'radial-gradient(1200px 700px at 30% 20%, #1e3a8a 0%, #0f1f45 55%, #0a1530 100%)'
            : 'rgba(10,21,48,.78)',
          backdropFilter: opaque ? 'none' : 'blur(6px)', color: '#fff',
          font: '400 22px Kanit, "Noto Sans Thai", sans-serif', opacity: '0', transition: 'opacity .45s ease',
        })
        document.documentElement.appendChild(el)
        requestAnimationFrame(() => (el.style.opacity = '1'))
      },
      { html, opaque, z: Z }
    )
    await this.page.waitForTimeout(450 + t(ms))
    await this.page.evaluate(() => {
      const el = document.getElementById('__vid_card')
      if (!el) return
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 500)
    })
    await this.page.waitForTimeout(550)
  }

  /** ฉากเปิดเส้นทาง — ชื่อ เป้าหมาย บทบาทที่เกี่ยวข้อง และลำดับจุดพัก */
  async titleCard(s: { order: number; title: string; summary: string; tabs: string[]; steps: Array<{ role: UserRole; label: string }> }) {
    const roles = [...new Set(s.steps.map((x) => x.role))]
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    const cols = s.steps.length > 10 ? 2 : 1
    const html = `
      <div style="width:1560px;display:grid;grid-template-columns:1fr 1.05fr;gap:56px;align-items:center;animation:__vidIn .6s ease-out">
        <div>
          <div style="font-size:20px;letter-spacing:.12em;color:#fbbf24;font-weight:500">วิดีโอสอนใช้งาน · เส้นทางที่ ${s.order}</div>
          <h1 style="font-size:50px;line-height:1.25;font-weight:600;margin:14px 0 22px">${esc(s.title)}</h1>
          <p style="font-size:23px;line-height:1.6;color:#cbd5e1;margin:0 0 26px">${esc(s.summary)}</p>
          <div style="font-size:17px;color:#93c5fd;margin-bottom:10px">แท็บในผัง: ${s.tabs.map(esc).join(' · ')}</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px">${roles
            .map((r) => `<span style="padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);font-size:18px">${esc(roleName(r))}</span>`)
            .join('')}</div>
        </div>
        <ol style="list-style:none;margin:0;padding:24px 28px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);display:grid;grid-template-columns:repeat(${cols},1fr);gap:${cols > 1 ? '8px 22px' : '12px'}">
          ${s.steps
            .map(
              (x, i) => `<li style="display:flex;gap:10px;align-items:baseline;font-size:${cols > 1 ? 16 : 19}px;line-height:1.35">
                <span style="flex:none;width:28px;height:28px;border-radius:50%;background:#f59e0b;color:#1f2937;font-weight:600;font-size:15px;display:inline-flex;align-items:center;justify-content:center">${i + 1}</span>
                <span><span style="color:#fbbf24">${esc(roleName(x.role))}</span><br>${esc(x.label)}</span></li>`
            )
            .join('')}
        </ol>
      </div>`
    await this.card(html, 4500 + s.steps.length * 250, true)
  }

  /** ฉากคั่นเมื่อสลับบทบาท — บอกว่าต่อไปใครทำอะไร */
  async roleCard(s: { index?: number; total?: number; role: UserRole; label: string; detail?: string }) {
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    const html = `
      <div style="text-align:center;max-width:1100px;animation:__vidIn .5s ease-out">
        <div style="font-size:20px;color:#93c5fd">${s.index ? `ขั้นที่ ${s.index} จาก ${s.total} · ` : ''}สลับบทบาท</div>
        <div style="margin:18px auto 10px;display:inline-flex;align-items:center;gap:14px;padding:12px 30px;border-radius:999px;background:#f59e0b;color:#1f2937;font-size:38px;font-weight:600">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="#1f2937"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-9 2.2-9 5v3h18v-3c0-2.8-4.6-5-9-5z"/></svg>
          ${esc(roleName(s.role))}
        </div>
        <h2 style="font-size:40px;font-weight:600;margin:18px 0 12px">${esc(s.label)}</h2>
        ${s.detail ? `<p style="font-size:24px;line-height:1.6;color:#e2e8f0;margin:0">${esc(s.detail)}</p>` : ''}
      </div>`
    await this.card(html, 2600, false)
  }

  /** ป้ายมุมจอบอกขั้นปัจจุบัน — ใช้เมื่อบทบาทเดิมทำต่อ (ไม่ต้องขึ้นฉากคั่นเต็มจอ) */
  async stepBadge(s: { index: number; total: number; role: UserRole; label: string }) {
    await this.page.evaluate(
      ({ text, z }) => {
        document.getElementById('__vid_badge')?.remove()
        const b = document.createElement('div')
        b.id = '__vid_badge'
        b.textContent = text
        Object.assign(b.style, {
          position: 'fixed', left: '24px', bottom: '24px', zIndex: String(z + 20), pointerEvents: 'none',
          padding: '10px 18px', borderRadius: '12px', background: 'rgba(15,31,69,.92)', color: '#fff',
          font: '500 19px Kanit, "Noto Sans Thai", sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.3)',
          borderLeft: '5px solid #f59e0b', animation: '__vidIn .3s ease-out',
        })
        document.documentElement.appendChild(b)
        setTimeout(() => b.remove(), 3200)
      },
      { text: `ขั้นที่ ${s.index}/${s.total} · ${roleName(s.role)} — ${s.label}`, z: Z }
    )
    await this.pause(1200)
  }
}
