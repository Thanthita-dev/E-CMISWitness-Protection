import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
/** ภาพหลักฐานสำหรับรายงานผลการแก้ไข — เก็บเมื่อรันด้วย EVIDENCE=1 เท่านั้น เทสต์ปกติไม่เสียเวลาถ่ายภาพ */
export const EVIDENCE_DIR = resolve(here, '../../e2e-evidence')

/**
 * ถ่ายภาพหน้าจอจุดที่พิสูจน์ว่าแก้แล้ว พร้อมกรอบไฮไลต์และป้ายคำอธิบายบนองค์ประกอบนั้น
 * ชื่อไฟล์ `<id>.png` เช่น `TC-043-a.png` — รายงาน HTML อ้างชื่อนี้
 * กรอบและป้ายถูกถอดออกหลังถ่าย เทสต์ที่เดินต่อจึงไม่ถูกบัง
 */
export async function captureEvidence(page: Page, id: string, target: Locator | Locator[], label: string) {
  if (process.env.EVIDENCE !== '1') return
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const targets = Array.isArray(target) ? target : [target]
  const first = targets[0]
  await first.scrollIntoViewIfNeeded()
  const handles = await Promise.all(targets.map((t) => t.elementHandle()))
  await page.evaluate(
    ({ els, text }) => {
      els.forEach((el, i) => {
        if (!el) return
        const r = (el as HTMLElement).getBoundingClientRect()
        const box = document.createElement('div')
        box.className = '__evidence'
        Object.assign(box.style, {
          position: 'fixed',
          left: `${r.left - 6}px`,
          top: `${r.top - 6}px`,
          width: `${r.width + 12}px`,
          height: `${r.height + 12}px`,
          border: '3px solid #e11d48',
          borderRadius: '8px',
          boxShadow: '0 0 0 4px rgba(225,29,72,.18)',
          pointerEvents: 'none',
          zIndex: '2147483646',
        })
        document.body.appendChild(box)
        if (i === 0) {
          const tag = document.createElement('div')
          tag.className = '__evidence'
          tag.textContent = text
          const above = r.top > 40
          Object.assign(tag.style, {
            position: 'fixed',
            left: `${Math.max(8, r.left - 6)}px`,
            top: above ? `${r.top - 38}px` : `${r.bottom + 10}px`,
            maxWidth: '560px',
            background: '#e11d48',
            color: '#fff',
            font: '600 13px/1.35 system-ui, sans-serif',
            padding: '5px 10px',
            borderRadius: '6px',
            pointerEvents: 'none',
            zIndex: '2147483647',
          })
          document.body.appendChild(tag)
        }
      })
    },
    { els: handles, text: label }
  )
  await page.screenshot({ path: resolve(EVIDENCE_DIR, `${id}.png`) })
  await page.evaluate(() => document.querySelectorAll('.__evidence').forEach((n) => n.remove()))
}
