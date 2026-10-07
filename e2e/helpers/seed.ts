import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { shiftMockDates } from '../../src/lib/mockDateShift'

const here = dirname(fileURLToPath(import.meta.url))
const mockStatesDir = resolve(here, '../../src/mock-states')

interface MockState {
  name: string
  to: string | null
  capturedAt?: string
  localStorageData: Record<string, string>
}

export function loadMockState(name: string): MockState {
  return JSON.parse(readFileSync(resolve(mockStatesDir, `${name}.json`), 'utf-8'))
}

/**
 * โหลด mock state ของโปรโตไทป์ลง localStorage ก่อนแอปบูต
 * `role` ใช้สลับผู้ใช้ที่ล็อกอินอยู่ (ecmis-auth-storage) โดยไม่ต้องผ่าน UI
 */
export async function seedMockState(
  page: Page,
  name: string,
  role?: string,
  /** ปรับค่าในแฟ้มคำร้องของ mock state ก่อนโหลด — ใช้ตั้งต้นสถานะที่ UI ไม่มีทางลัดให้กด (เช่น ลายมือชื่อใน คบ.6) */
  casePatch?: Record<string, unknown>
) {
  const state = loadMockState(name)
  const data = shiftMockDates({ ...state.localStorageData }, state.capturedAt)

  if (role) {
    const auth = JSON.parse(data['ecmis-auth-storage'])
    auth.state.currentRole = role
    data['ecmis-auth-storage'] = JSON.stringify(auth)
  }

  if (casePatch) {
    const store = JSON.parse(data['ecmis-case-storage-v2'])
    store.state.cases = store.state.cases.map((c: Record<string, unknown>, i: number) =>
      i === 0 ? { ...c, ...casePatch } : c
    )
    data['ecmis-case-storage-v2'] = JSON.stringify(store)
  }

  // init script ทำงานทุกครั้งที่โหลดหน้า — seed ครั้งแรกครั้งเดียว
  // ไม่เช่นนั้นการ reload กลางเทสต์จะล้างผลลัพธ์ที่เพิ่งกดไป
  await page.addInitScript((entries: Record<string, string>) => {
    if (localStorage.getItem('__e2e_seeded') === '1') return
    Object.keys(localStorage)
      .filter((k) => k.startsWith('ecmis-'))
      .forEach((k) => localStorage.removeItem(k))
    Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v))
    localStorage.setItem('__e2e_seeded', '1')
  }, data)
}

/** อ่านสถานะแฟ้มคำร้องจาก store ที่ persist ไว้ — ใช้ยืนยันผลลัพธ์เชิงกระบวนการ */
export async function readCase(page: Page, caseNo: string) {
  return page.evaluate((no: string) => {
    const raw = localStorage.getItem('ecmis-case-storage-v2')
    if (!raw) return null
    const cases = JSON.parse(raw).state.cases as Array<Record<string, unknown>>
    return cases.find((c) => c.no === no) ?? null
  }, caseNo)
}

/**
 * สลับ role ของผู้ใช้ที่ล็อกอินแล้วโหลดหน้าใหม่
 * ต้องลงทะเบียนเป็น init script เพิ่ม เพราะ seed script ของ seedMockState ทำงานซ้ำทุกครั้งที่โหลดหน้า
 * (init script ทำงานเรียงตามลำดับที่ลงทะเบียน ตัวหลังสุดจึงชนะ)
 */
export async function switchRole(page: Page, role: string) {
  await page.addInitScript((r: string) => {
    const raw = localStorage.getItem('ecmis-auth-storage')
    if (!raw) return
    const auth = JSON.parse(raw)
    auth.state.currentRole = r
    localStorage.setItem('ecmis-auth-storage', JSON.stringify(auth))
  }, role)
  await page.reload()
}

/**
 * เจ้าของสำนวนที่ ผอ. มอบหมาย (officer OFF-001) เชื่อมโยงคดีหลักบนหน้าแฟ้ม — ใช้กับ mock state ที่ตั้งต้นยังไม่เชื่อมโยง
 * (เช่น Case 1.3) ก่อนทดสอบขั้นที่ต้องผ่านด่าน "ต้องเชื่อมโยงคดีหลักก่อนส่งต่อ" ต้องเปิดหน้าแฟ้มอยู่แล้ว
 */
export async function linkMainCaseAsOfficer(page: Page) {
  await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
  await page.getByText('เชื่อมโยงแล้ว').first().waitFor()
}

/**
 * หลังรับเรื่องที่หน้า /intake: เอกสารต้นทางไปหน้าแฟ้ม ส่วน คบ.1 / คบ.2 เปิดแบบฟอร์มให้กรอกต่อทันที
 * คืนเลขคำร้องใหม่ และ (ถ้าอยู่หน้าแบบฟอร์ม) พากลับหน้าแฟ้มเพื่อเดินขั้นตอนถัดไป
 */
export async function newCaseNoAfterIntake(page: Page, opts: { expectForm?: 1 | 2; backToDossier?: boolean } = {}) {
  await page.waitForURL(/\/(dossier\/|form\/[12]\?caseNo=)WP-\d{4}-\d{6}/)
  const url = page.url()
  if (opts.expectForm && !url.includes(`/form/${opts.expectForm}?caseNo=`)) throw new Error(`คาดว่าจะเปิดแบบ คบ.${opts.expectForm} แต่ได้ ${url}`)
  const caseNo = url.match(/WP-\d{4}-\d{6}/)![0]
  if (url.includes('/form/') && opts.backToDossier !== false) await page.goto(`/dossier/${caseNo}`)
  return caseNo
}
