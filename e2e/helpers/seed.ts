import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { shiftMockDates } from '../../src/lib/mockDateShift'
import { WP_DATA_VERSION, WP_DATA_VERSION_KEY } from '../../src/lib/legacyDataReset'
import { authStateForAccount, mockStateAccountForRole } from '../../src/lib/mockStateAccounts'
import { getRoleSet, ROLE_SET_STORAGE_KEY } from '../../src/lib/roleSets'
import { remapMockStateUserNames, resolveCapturedUsers, type CapturedUsers } from '../../src/lib/mockStateRoleNames'
import baselineUsers from '../../src/data/mock-state-baseline-users.json' with { type: 'json' }
import type { UserRole } from '../../src/types/user'

const here = dirname(fileURLToPath(import.meta.url))
const mockStatesDir = resolve(here, '../../src/mock-states')

interface MockState {
  name: string
  to: string | null
  capturedAt?: string
  capturedUsers?: CapturedUsers
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
  const shifted = shiftMockDates({ ...state.localStorageData }, state.capturedAt)
  // แปลงชื่อผู้ใช้ที่ฝังในข้อมูลตามชุดรายชื่อของ state (เหมือน applyMockState)
  const data = {
    ...remapMockStateUserNames(shifted, resolveCapturedUsers(state.capturedUsers, baselineUsers), getRoleSet(state.localStorageData[ROLE_SET_STORAGE_KEY]).users),
  }

  if (role) {
    const auth = JSON.parse(data['ecmis-auth-storage'])
    // เข้าสู่ระบบด้วยบัญชีทดลองของบทบาทเดียวกับที่ mock state ใช้ ให้ผู้ใช้/หน่วยงานตรงกับบทบาท
    const account = mockStateAccountForRole(role as UserRole)
    auth.state = account ? authStateForAccount(account, auth.state) : { ...auth.state, currentRole: role }
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
  await page.addInitScript(({ entries, versionKey, version }: { entries: Record<string, string>; versionKey: string; version: string }) => {
    // ทำเครื่องหมายรุ่นข้อมูลปัจจุบัน ไม่ให้แอปล้าง state ที่ seed ไว้ว่าเป็นข้อมูลรุ่นเก่า
    localStorage.setItem(versionKey, version)
    if (localStorage.getItem('__e2e_seeded') === '1') return
    Object.keys(localStorage)
      .filter((k) => k.startsWith('ecmis-'))
      .forEach((k) => localStorage.removeItem(k))
    Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, v))
    localStorage.setItem('__e2e_seeded', '1')
  }, { entries: data, versionKey: WP_DATA_VERSION_KEY, version: WP_DATA_VERSION })
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
  await page.waitForURL(/\/(dossier\/|form\/[12]\?caseNo=)\d{4}(\/|%2F)\d{4}/)
  const url = page.url()
  if (opts.expectForm && !url.includes(`/form/${opts.expectForm}?caseNo=`)) throw new Error(`คาดว่าจะเปิดแบบ คบ.${opts.expectForm} แต่ได้ ${url}`)
  const caseNo = decodeURIComponent(url.match(/\d{4}(?:\/|%2F)\d{4}/)![0])
  if (url.includes('/form/') && opts.backToDossier !== false) await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
  return caseNo
}

/** casePatch สำหรับ mock state ที่เจ้าของสำนวนยังไม่บันทึก คบ.1 (เช่น Case 1.3) — ข้ามไปขั้นเชื่อมโยงคดีหลัก/กลั่นกรองได้ทันที */
export const KB1_DONE = { kb1CompletedAt: '08/09/2569 11:29' }

/**
 * ลำดับงานเจ้าของสำนวน: คบ.1 → เชื่อมโยงคดีหลัก → กลั่นกรองความเร่งด่วน → คบ.3
 * แผงกลั่นกรองอยู่ในการ์ดคดีหลักและแสดงหลังเชื่อมโยงแล้ว — เชื่อมโยงให้ก่อนถ้ายังไม่ได้เชื่อมโยง
 * ต้องเปิดหน้าแฟ้มอยู่แล้ว และแฟ้มต้องบันทึก คบ.1 แล้ว (ผ่าน UI หรือ casePatch KB1_DONE)
 */
export async function screenUrgencyAsOwner(page: Page, urgency: 'normal' | 'urgent') {
  const link = page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })
  if (await link.isVisible()) await linkMainCaseAsOfficer(page)
  await page
    .getByRole('button', { name: urgency === 'urgent' ? 'กรณีจำเป็นเร่งด่วน (→ คบ.3 → คบ.4 → คบ.5)' : 'กรณีปกติ (→ คบ.3 → คบ.6)' })
    .click()
}

/**
 * ทางลัดของเทสต์ที่สร้างแฟ้มใหม่ผ่าน /intake: ให้ผู้ใช้ปัจจุบันเป็นเจ้าของสำนวน (staff_review) และบันทึก คบ.1 แล้ว
 * แทนการเดิน ผอ. มอบหมาย + กรอก คบ.1 ผ่าน UI — ใช้เมื่อเทสต์ต้องการทดสอบขั้นเชื่อมโยงคดีหลัก/กลั่นกรองของแฟ้มนั้น
 */
export async function promoteToCaseOwner(page: Page, caseNo: string) {
  await page.evaluate(({ no, kb1 }: { no: string; kb1: Record<string, string> }) => {
    const auth = JSON.parse(localStorage.getItem('ecmis-auth-storage') || '{}').state || {}
    const store = JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}')
    store.state.cases = store.state.cases.map((c: Record<string, unknown>) =>
      c.no === no
        ? { ...c, ...kb1, stage: 'staff_review', assignedOfficerUserId: auth.currentOfficerUserId, assignedOfficer: c.owner }
        : c
    )
    localStorage.setItem('ecmis-case-storage-v2', JSON.stringify(store))
  }, { no: caseNo, kb1: KB1_DONE })
  await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
}
