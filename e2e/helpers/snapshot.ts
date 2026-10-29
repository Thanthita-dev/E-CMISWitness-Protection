import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

/**
 * จับ snapshot ของ localStorage (ecmis-*) ระหว่างเดิน flow-paths เพื่อใช้เป็นปุ่ม "เล่นจากจุดนี้" ในหน้า /flow-chart
 * ทำงานเฉพาะเมื่อรันด้วย FLOW_SNAPSHOTS=1 (playwright.snapshots.config.ts) — รันเทสต์ปกติจะไม่เขียนไฟล์
 *
 * key ที่ใช้:
 *   node:<tab>:<nodeId>     กล่องในผังรายขั้น — จับ "ก่อน" ทำขั้นนั้น (เปิดหน้าที่ต้องกดขั้นนั้นอยู่)
 *   edge:<tab>:<edgeId>     เส้นในผังรายขั้น — จับ "หลัง" เดินเส้นนั้นแล้ว (อยู่หน้าที่ทำขั้นปลายทางต่อ)
 *   overview:<from>><to>    เส้นในผังภาพรวม — จับหลังเดินข้ามแท็บแล้ว
 * nodeId/edgeId คือ id ใน src/flow-guide/flow-diagram.json (ดูรายการด้วย node scripts/flow-snapshot-checklist.mjs <tab>)
 *
 * ไฟล์ดิบเขียนลง e2e/.flow-snapshots-raw/ แล้วรวม/ตัดซ้ำเข้า src/flow-snapshots ด้วย node scripts/build-flow-snapshots.mjs
 */

const here = dirname(fileURLToPath(import.meta.url))
export const RAW_SNAPSHOT_DIR = resolve(here, '../.flow-snapshots-raw')

export const snapshotsEnabled = () => process.env.FLOW_SNAPSHOTS === '1'

export interface SnapOptions {
  /** คำอธิบายสั้นภาษาไทยว่า state นี้อยู่จุดไหน เช่น "ธุรการรับเรื่องแล้ว รอส่ง ผอ." */
  label: string
  /** หน้าที่เปิดเมื่อกดเล่น — ไม่ระบุ = URL ปัจจุบันของ page */
  route?: string
  /** บทบาทที่ใช้เล่น — ไม่ระบุ = บทบาทที่ล็อกอินอยู่ใน ecmis-auth-storage */
  role?: string
}

const safeName = (key: string) => key.replace(/[:>]/g, '__').replace(/[^\w.\-ก-๙]+/g, '_')

/** บันทึก snapshot ของ state ปัจจุบันให้ทุก key ที่ส่งมา (หลาย key ชี้ state เดียวกันได้ เช่น เส้นที่เข้ากล่องถัดไป) */
export async function snap(page: Page, keys: string | string[], options: SnapOptions) {
  if (!snapshotsEnabled()) return
  const { data, href } = await page.evaluate(() => {
    const out: Record<string, string> = {}
    Object.keys(localStorage)
      .filter((k) => k.startsWith('ecmis-'))
      .forEach((k) => {
        out[k] = localStorage.getItem(k) ?? ''
      })
    return { data: out, href: location.pathname + location.search }
  })
  let role = options.role ?? null
  if (!role) {
    try {
      role = JSON.parse(data['ecmis-auth-storage']).state?.currentRole ?? null
    } catch {
      role = null
    }
  }
  mkdirSync(RAW_SNAPSHOT_DIR, { recursive: true })
  const capturedAt = new Date().toISOString()
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const record = { key, label: options.label, role, route: options.route ?? href, capturedAt, localStorageData: data }
    writeFileSync(resolve(RAW_SNAPSHOT_DIR, `${safeName(key)}.json`), JSON.stringify(record))
  }
}
