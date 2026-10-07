import type { Locator, Page } from '@playwright/test'
import type { UserRole } from '../../src/types/user'
import { Director, roleName } from '../director'
import { BRIEF, briefSpeech, keepNote } from './brief'
import { NOTE_SPEECH } from './note-speech'
import { emit } from './progress'
import { synth } from './tts'

/**
 * ผู้กำกับวิดีโอนำเสนอ — ต่อยอด Director (เคอร์เซอร์ ไฮไลต์ การกด) ด้วย
 * - ป้ายขั้นตอน (เส้นทางหลัก/ทางแยก แท็บ ชื่อขั้น บทบาท แถบความคืบหน้า) และซับไตเติลตามเสียงพากย์
 *   บันทึกเป็นข้อมูลตามเวลาให้หน้าเว็บ index.html แสดง — PRESENT_BURN_HUD=1 ฝังลงในภาพแบบเดิม
 * - สลับบทบาทด้วยเคอร์เซอร์ที่ช่อง "สิทธิ์การทำงาน" บน TopBar
 * ทุกประโยคที่พากย์บันทึกเป็น cue (เวลาเริ่มในวิดีโอ + ไฟล์เสียง) ให้ build-presentation.mjs วางเสียงตามเวลา
 */

const Z = 2147483000
/** ไม่สร้างเสียงและไม่รอเสียง — ใช้ตรวจสคริปต์การกดอย่างเร็ว */
const NO_VOICE = process.env.VIDEO_NO_VOICE === '1'
/** ฝังซับไตเติลและป้ายขั้นตอนลงในภาพ (แบบเดิม) — ค่าเริ่มต้นไม่ฝัง หน้าเว็บ index.html แสดงจากข้อมูลแทน */
const BURN_HUD = process.env.PRESENT_BURN_HUD === '1'

/** ป้ายชื่อบทบาทให้ตรงกับตัวเลือกใน TopBar */
export const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'receiver', label: 'ธุรการสำนัก/กอง' },
  { value: 'officer', label: 'เจ้าหน้าที่ ป.ป.ท.' },
  { value: 'case_owner', label: 'เจ้าของสำนวน' },
  { value: 'supervisor', label: 'ผู้บังคับบัญชาชั้นต้น' },
  { value: 'director', label: 'ผอ.สำนัก/กอง' },
  { value: 'deputy_secretary', label: 'รองเลขาธิการ ป.ป.ท.' },
  { value: 'secretary', label: 'เลขาธิการ ป.ป.ท.' },
  { value: 'committee', label: 'ฝ่ายเลขานุการคณะกรรมการ ป.ป.ท.' },
  { value: 'protection', label: 'ชุดคุ้มครอง' },
  { value: 'appeal', label: 'เจ้าหน้าที่อุทธรณ์' },
]

/** ป้ายบนจอไม่แสดงรหัส user flow (เช่น "(WIT1138)") */
export function displayNote(note: string) {
  return note
    .replace(/\s*\((?:[^()]*\s)?WIT\d{4}[^()]*\)/g, '')
    .replace(/\s*WIT\d{4}(?:\s*[–-]\s*(?:WIT)?\d{2,4})?/g, '')
    .trim()
}

/** คำพากย์ของป้ายแต่ละจุด — ใช้บทใน note-speech.ts ถ้ามี ไม่มีก็อ่านป้ายตามที่เห็น (ตัดเครื่องหมายคำพูด) */
export function speechFor(shown: string) {
  return briefSpeech(shown) ?? NOTE_SPEECH[shown] ?? shown.replace(/["“”]/g, '').replace(/\s*—\s*/g, ' ')
}

export interface Stage {
  /** แท็บในผัง เช่น '05' */
  tab: string
  /** ชื่อขั้นในผัง */
  title: string
  /** ชื่อขั้นย่อยของจุดนี้ */
  step: string
  role: UserRole
  /** ชื่อทางแยก (ไม่ระบุ = เส้นทางหลัก) */
  branch?: string
  /** แท็บของเส้นทางหลักสำหรับแถบความคืบหน้า และแท็บที่ผ่านแล้ว */
  route: string[]
  doneTabs: string[]
}

export interface Cue {
  key: string
  at: number
  seconds: number
  file: string
  text: string
}

interface Sub {
  from: number
  to: number
  text: string
}

/** แบ่งบทพากย์เป็นช่วงซับไตเติลไม่เกิน ~2 บรรทัด ตัดที่ช่องว่าง (ช่วงวลีภาษาไทย) */
export function chunkSubtitle(text: string, max = 78): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max) {
      out.push(cur)
      cur = w
    } else cur = cur ? `${cur} ${w}` : w
  }
  if (cur) out.push(cur)
  return out
}

export class Presenter extends Director {
  readonly cues: Cue[] = []
  /** ป้ายทุกจุดที่ขึ้นในวิดีโอ ตามลำดับ (ใช้เขียนบทพากย์รายการกดใน note-speech.ts) */
  readonly notes: Array<{ segment: string; note: string }> = []
  /** ป้ายขั้นตอนตามเวลา (วินาทีจาก t0) — หน้าเว็บแสดงข้างเครื่องเล่นแทนการฝังในภาพ */
  readonly stages: Array<{ at: number; stage: (Stage & { roleName: string }) | null }> = []
  /** จุดพัก/ฉากที่กำลังถ่าย */
  segment = ''
  /** ส่วนที่ worker นี้ถ่าย (ใช้รายงานความคืบหน้า) */
  part = 0
  readonly t0 = Date.now()
  private voiceEndsAt = 0
  private hud: { stage: Stage | null; subs: Sub[] } = { stage: null, subs: [] }

  constructor(page: Page) {
    super(page)
  }

  async install() {
    await super.install()
    await this.page.addInitScript((z: number) => {
      const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
      const mount = () => {
        if (document.getElementById('__vid_hud_style')) return
        const st = document.createElement('style')
        st.id = '__vid_hud_style'
        st.textContent = `
          #__vid_stage{position:fixed;left:20px;bottom:20px;width:380px;z-index:${z + 30};pointer-events:none;
            background:rgba(8,43,80,.95);color:#fff;border-radius:14px;border-left:6px solid #caa631;
            box-shadow:0 10px 30px rgba(0,0,0,.35);padding:12px 16px 12px 14px;font:400 17px Kanit,"Noto Sans Thai",sans-serif;
            transition:opacity .3s}
          #__vid_stage .k{display:flex;gap:8px;align-items:center;font-size:14px;letter-spacing:.04em;color:#f7edcb}
          #__vid_stage .k b{padding:2px 10px;border-radius:99px;background:#caa631;color:#172434;font-weight:600}
          #__vid_stage .k b.br{background:#f59e0b}
          #__vid_stage .t{font-size:19px;font-weight:600;line-height:1.35;margin:6px 0 4px}
          #__vid_stage .t span{color:#fbbf24;margin-right:8px}
          #__vid_stage .s{font-size:16px;line-height:1.45;color:#dbe4ee}
          #__vid_stage .r{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:3px 12px;border-radius:99px;
            background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);font-size:15px}
          #__vid_stage .p{display:flex;flex-wrap:nowrap;gap:3px;margin-top:10px}
          #__vid_stage .p i{font-style:normal;font-size:11.5px;padding:2px 5px;border-radius:6px;background:rgba(255,255,255,.1);color:#9fb3c8}
          #__vid_stage .p i.d{background:rgba(34,112,74,.55);color:#dff0e7}
          #__vid_stage .p i.c{background:#caa631;color:#172434;font-weight:600}
          #__vid_sub{position:fixed;left:430px;right:40px;bottom:34px;z-index:${z + 31};display:flex;justify-content:center;pointer-events:none}
          #__vid_sub div{max-width:1280px;padding:10px 24px;border-radius:12px;background:rgba(10,15,25,.82);color:#fff;
            font:500 29px/1.45 Kanit,"Noto Sans Thai",sans-serif;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.6)}
          #__vid_sub div::before{content:attr(data-t)}
          #__vid_cover{position:fixed;inset:0;z-index:${z + 45};background:#0a1530;pointer-events:none;transition:opacity .45s ease}`
        document.documentElement.appendChild(st)
        if (sessionStorage.getItem('__vid_cover') === '1') {
          const c = document.createElement('div')
          c.id = '__vid_cover'
          document.documentElement.appendChild(c)
        }
        const stage = document.createElement('div')
        stage.id = '__vid_stage'
        stage.style.opacity = '0'
        const sub = document.createElement('div')
        sub.id = '__vid_sub'
        document.documentElement.append(stage, sub)
        let lastStage = ''
        let lastSub = ''
        const render = () => {
          const hud = JSON.parse(sessionStorage.getItem('__vid_hud') || '{"stage":null,"subs":[]}')
          const s = hud.stage
          const stageHtml = s
            ? `<div class="k">${s.branch ? `<b class="br">ทางแยก</b>${esc(s.branch)}` : '<b>เส้นทางหลัก</b>คำร้องเดียว ตั้งแต่รับเรื่องจนปิดงาน'}</div>
               <div class="t"><span>${esc(s.tab)}</span>${esc(s.title)}</div>
               <div class="s">${esc(s.step)}</div>
               <div class="r">👤 ${esc(s.roleName)}</div>
               <div class="p">${s.route
                 .map((r: string) => `<i class="${r === s.tab ? 'c' : s.doneTabs.includes(r) ? 'd' : ''}">${esc(r)}</i>`)
                 .join('')}</div>`
            : ''
          if (stageHtml !== lastStage) {
            stage.innerHTML = stageHtml
            stage.style.opacity = s ? '1' : '0'
            lastStage = stageHtml
          }
          const now = Date.now()
          const cur = (hud.subs || []).find((x: { from: number; to: number }) => now >= x.from && now < x.to)
          const text = cur ? cur.text : ''
          if (text !== lastSub) {
            // วาดข้อความด้วย ::before — ซับที่ตรงกับป้ายปุ่ม (เช่น "จำกัดการค้นหา") จะไม่ชน getByText ของสคริปต์
            sub.innerHTML = text ? `<div data-t="${esc(text)}"></div>` : ''
            lastSub = text
          }
        }
        ;(window as unknown as { __vidHud: () => void }).__vidHud = render
        render()
        setInterval(render, 80)
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
      else mount()
    }, Z)
  }

  private async syncHud() {
    const data = BURN_HUD
      ? { stage: this.hud.stage && { ...this.hud.stage, roleName: roleName(this.hud.stage.role) }, subs: this.hud.subs.filter((s) => s.to > Date.now()) }
      : { stage: null, subs: [] }
    await this.page
      .evaluate((json) => {
        sessionStorage.setItem('__vid_hud', json)
        ;(window as unknown as { __vidHud?: () => void }).__vidHud?.()
      }, JSON.stringify(data))
      .catch(() => {})
  }

  /**
   * พากย์ทุกการกด: ป้ายของไฮไลต์ขึ้นพร้อมเสียง แล้วรอให้พูดจบก่อนกด/ไปต่อ
   * ฉบับกระชับ: ป้ายที่ไม่อยู่ใน keep ไม่ขึ้นและไม่พากย์ (ป้ายสลับบทบาทขึ้นจออย่างเดียว)
   */
  protected async drawHighlight(target: Locator, note?: string) {
    let shown = note ? displayNote(note) : undefined
    if (shown) emit({ type: 'action', part: this.part, key: this.segment, note: shown, voiced: keepNote(this.segment, shown) })
    if (shown && !keepNote(this.segment, shown)) {
      if (shown.startsWith('สลับบทบาทเป็น')) return super.drawHighlight(target, shown)
      shown = undefined
    }
    if (shown) await this.waitVoice(250)
    const box = await super.drawHighlight(target, shown)
    if (shown) {
      this.notes.push({ segment: this.segment, note: shown })
      await this.say(`${this.segment} · ${shown}`, speechFor(shown))
    }
    return box
  }

  /** ฉบับกระชับข้ามไฮไลต์ที่ชี้ให้ดูเฉย ๆ ถ้าป้ายไม่อยู่ใน keep */
  async highlight(target: Locator, note?: string, ms = 1800) {
    if (BRIEF && (!note || !keepNote(this.segment, displayNote(note)))) return
    await super.highlight(target, note, ms)
  }

  async clearHighlight() {
    await this.waitVoice(150)
    await super.clearHighlight()
  }

  async setStage(stage: Stage | null) {
    this.hud.stage = stage
    this.stages.push({ at: (Date.now() - this.t0) / 1000, stage: stage && { ...stage, roleName: roleName(stage.role) } })
    await this.syncHud()
  }

  /** เปิดฉากใหม่แบบจางผ่านพื้นสีกรมท่า (ไม่เห็นหน้าขาวตอนโหลด) */
  async loadCheckpoint(name: string, role: UserRole, path?: string | null) {
    await this.page
      .evaluate(() => {
        sessionStorage.setItem('__vid_cover', '1')
        const c = document.createElement('div')
        c.id = '__vid_cover'
        c.style.opacity = '0'
        document.documentElement.appendChild(c)
        requestAnimationFrame(() => (c.style.opacity = '1'))
      })
      .catch(() => {})
    await this.page.waitForTimeout(350)
    await super.loadCheckpoint(name, role, path)
    await this.syncHud()
    await this.page.evaluate(() => {
      sessionStorage.removeItem('__vid_cover')
      const c = document.getElementById('__vid_cover')
      if (!c) return
      c.style.opacity = '0'
      setTimeout(() => c.remove(), 500)
    })
    await this.page.waitForTimeout(450)
  }

  async goto(path: string) {
    await super.goto(path)
    await this.syncHud()
  }

  /**
   * เริ่มพากย์ (ไม่รอให้จบ) — ซับไตเติลขึ้นตามสัดส่วนความยาวข้อความ แล้วบันทึก cue ไว้ประกอบเสียงภายหลัง
   * ใช้ waitVoice() เพื่อรอให้พากย์จบก่อนไปขั้นถัดไป
   */
  async say(key: string, text: string) {
    await this.waitVoice()
    const voice = NO_VOICE ? { file: '', seconds: Math.max(3, text.length / 13) } : synth(text)
    const start = Date.now()
    this.cues.push({ key, at: (start - this.t0) / 1000, seconds: voice.seconds, file: voice.file, text })
    const chunks = chunkSubtitle(text)
    const total = chunks.reduce((a, c) => a + c.length, 0)
    let from = start
    this.hud.subs = chunks.map((c) => {
      const span = (voice.seconds * 1000 * c.length) / total
      const s = { from, to: from + span, text: c }
      from += span
      return s
    })
    this.voiceEndsAt = start + voice.seconds * 1000
    await this.syncHud()
  }

  /** รอให้เสียงพากย์ที่กำลังเล่นจบ แล้วเว้นช่วงหายใจสั้น ๆ */
  async waitVoice(gap = BRIEF ? 250 : 450) {
    if (NO_VOICE) return
    const left = this.voiceEndsAt + gap - Date.now()
    if (left > 0) await this.page.waitForTimeout(left)
  }

  /** ฉากเต็มจอพร้อมเสียงพากย์ — ค้างจนพากย์จบ */
  async narratedCard(key: string, text: string, html: string, opaque: boolean) {
    await this.page.evaluate(
      ({ html, opaque, z }) => {
        document.getElementById('__vid_card')?.remove()
        const el = document.createElement('div')
        el.id = '__vid_card'
        el.innerHTML = html
        Object.assign(el.style, {
          position: 'fixed', inset: '0', zIndex: String(z + 40), display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: opaque
            ? 'radial-gradient(1200px 700px at 30% 20%, #0f416f 0%, #082b50 55%, #061d35 100%)'
            : 'rgba(6,29,53,.84)',
          backdropFilter: opaque ? 'none' : 'blur(6px)', color: '#fff',
          font: '400 22px Kanit, "Noto Sans Thai", sans-serif', opacity: '0', transition: 'opacity .45s ease',
        })
        document.documentElement.appendChild(el)
        requestAnimationFrame(() => (el.style.opacity = '1'))
      },
      { html, opaque, z: Z }
    )
    await this.page.waitForTimeout(500)
    await this.say(key, text)
    await this.waitVoice(NO_VOICE ? 0 : 700)
    if (NO_VOICE) await this.page.waitForTimeout(1200)
    await this.page.evaluate(() => {
      const el = document.getElementById('__vid_card')
      if (!el) return
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 500)
    })
    await this.page.waitForTimeout(550)
  }

  /**
   * สลับบทบาทที่ช่อง "สิทธิ์การทำงาน" บน TopBar ให้เห็นการกด:
   * ไฮไลต์ช่อง → เคอร์เซอร์กด → รายการบทบาทกางออก → เลื่อนไปเลือกบทบาทใหม่ → กด
   * (รายการของ <select> ตัวจริงเป็นหน้าต่างของระบบที่วิดีโอไม่บันทึก จึงวาดรายการจำลองตามตัวเลือกจริง)
   */
  async switchRoleByMouse(role: UserRole) {
    const { page } = this
    const select = page.locator('#topbar-role-select')
    const box = await this.drawHighlight(select, `สลับบทบาทเป็น "${roleName(role)}"`)
    if (!box) throw new Error('ไม่พบช่องเลือกบทบาทบน TopBar')
    await this.moveTo(box.x + box.width / 2, box.y + box.height / 2)
    await this.pause(500)
    await this.ripple(box.x + box.width / 2, box.y + box.height / 2)
    const options = ROLE_OPTIONS
    const target = options.findIndex((o) => o.value === role)
    const rowH = 38
    const list = await page.evaluate(
      ({ box, options, current, z, rowH }) => {
        document.querySelectorAll('.__vid_hl').forEach((e) => e.remove())
        const w = Math.max(box.width, 290)
        const left = Math.min(box.x, window.innerWidth - w - 12)
        const el = document.createElement('div')
        el.id = '__vid_roles'
        Object.assign(el.style, {
          position: 'fixed', left: `${left}px`, top: `${box.y + box.height + 4}px`, width: `${w}px`, zIndex: String(z + 15),
          background: '#fff', border: '1px solid #aebdca', borderRadius: '8px', boxShadow: '0 12px 30px rgba(8,43,80,.25)',
          padding: '4px 0', font: '400 16px Kanit, "Noto Sans Thai", sans-serif', color: '#172434', pointerEvents: 'none',
          transformOrigin: 'top', animation: '__vidIn .2s ease-out',
        })
        el.innerHTML = options
          .map(
            (o: { value: string; label: string }) =>
              `<div data-v="${o.value}" style="height:${rowH}px;display:flex;align-items:center;padding:0 14px;transition:background .15s${
                o.value === current ? ';font-weight:600;color:#082b50' : ''
              }">${o.value === current ? '✓ ' : ''}${o.label}</div>`
          )
          .join('')
        document.documentElement.appendChild(el)
        return { left, top: box.y + box.height + 8, w }
      },
      { box, options, current: this.currentRole, z: Z, rowH }
    )
    await this.pause(450)
    const y = list.top + rowH * target + rowH / 2
    await this.moveTo(list.left + 60, y)
    await page.evaluate((v) => {
      const row = document.querySelector<HTMLElement>(`#__vid_roles [data-v="${v}"]`)
      if (row) Object.assign(row.style, { background: '#082b50', color: '#fff', fontWeight: '600' })
    }, role)
    await this.pause(500)
    await this.ripple(list.left + 60, y)
    await page.evaluate(() => document.getElementById('__vid_roles')?.remove())
    await select.selectOption(role)
    this.currentRole = role
    await page.waitForLoadState('networkidle').catch(() => {})
    await this.pause(900)
  }

  private async ripple(x: number, y: number) {
    await this.page.evaluate(
      ({ x, y, z }) => {
        const r = document.createElement('div')
        Object.assign(r.style, {
          position: 'fixed', left: `${x - 22}px`, top: `${y - 22}px`, width: '44px', height: '44px', borderRadius: '50%',
          background: 'rgba(245,158,11,.45)', border: '2px solid #f59e0b', zIndex: String(z + 49), pointerEvents: 'none',
          transform: 'scale(.3)', opacity: '1', transition: 'transform .45s ease-out, opacity .45s ease-out',
        })
        document.documentElement.appendChild(r)
        requestAnimationFrame(() => {
          r.style.transform = 'scale(1.4)'
          r.style.opacity = '0'
        })
        setTimeout(() => r.remove(), 600)
      },
      { x, y, z: Z }
    )
    await this.page.waitForTimeout(250)
  }
}
