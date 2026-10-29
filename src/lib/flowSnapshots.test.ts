import { afterEach, describe, expect, it, vi } from 'vitest'
import snapshotIndex from '../flow-snapshots/index.json'
import * as flowGuide from './flowGuide'
import { hasSnapshot, playSnapshot, snapshotCoverage, snapshotFor, snapshotKey } from './flowSnapshots'

describe('flowSnapshots helpers', () => {
    it('สร้าง key ตามสัญญากับ build-flow-snapshots', () => {
        expect(snapshotKey.node('02', 'WIT0201')).toBe('node:02:WIT0201')
        expect(snapshotKey.edge('02', 'E01')).toBe('edge:02:E01')
        expect(snapshotKey.overview('02>03')).toBe('overview:02>03')
        expect(snapshotKey.tab('02')).toBe('tab:02')
    })

    it('key ที่ไม่มีหรือว่างคืน null/false', () => {
        expect(snapshotFor(undefined)).toBeNull()
        expect(snapshotFor('node:99:none')).toBeNull()
        expect(hasSnapshot(null)).toBe(false)
        expect(snapshotFor('constructor')).toBeNull()
    })

    it('นับความครอบคลุมจากรายการ key', () => {
        expect(snapshotCoverage(['node:99:a', 'node:99:b'])).toEqual({ done: 0, total: 2 })
    })
})

describe('playSnapshot', () => {
    const entries = (snapshotIndex as unknown as { entries: Record<string, { route: string; role: string | null }> }).entries
    const key = Object.keys(entries).find((k) => entries[k].role) as string

    afterEach(() => {
        vi.restoreAllMocks()
        localStorage.clear()
    })

    const fakeWin = () => ({ location: { href: '' }, opener: {} as unknown, close: vi.fn() })

    it('ถ้าเบราว์เซอร์บล็อกหน้าต่างใหม่ ต้องหยุดก่อนแตะ localStorage และแจ้งเป็นภาษาไทย', async () => {
        localStorage.setItem('ecmis-keep', 'x')
        vi.spyOn(window, 'open').mockReturnValue(null)
        await expect(playSnapshot(key)).rejects.toThrow('เบราว์เซอร์บล็อกหน้าต่างใหม่')
        expect(localStorage.getItem('ecmis-keep')).toBe('x')
    })

    it('เล่นสำเร็จ: ตัด opener และเปิดเฉพาะ route ภายในแอป', async () => {
        const win = fakeWin()
        vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window)
        vi.spyOn(flowGuide, 'overrideRole').mockImplementation(() => {})
        await playSnapshot(key)
        expect(win.opener).toBeNull()
        expect(win.location.href).toMatch(/^\/(?!\/)/)
        expect(win.close).not.toHaveBeenCalled()
    })

    it.each([1, 2, 3, 4])('เล่นกิ่งวิธีที่ %s เปิด คบ.9 พร้อมข้อมูลของวิธีนั้น', async (method) => {
        const win = fakeWin()
        vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window)
        vi.spyOn(flowGuide, 'overrideRole').mockImplementation(() => {})
        await playSnapshot(`node:07:A6METHOD${method}`)
        expect(win.location.href).toBe('/form/9?caseNo=0501%2F2569')
        const forms = JSON.parse(localStorage.getItem('ecmis-form-draft-storage-v2')!).state
        expect(forms.drafts[6]['รูปแบบคุ้มครองที่เลือก']).toEqual([method])
        const c = JSON.parse(localStorage.getItem('ecmis-case-storage-v2')!).state.cases.find((c: any) => c.no === '0501/2569')
        expect(c.preliminaryDecision.formNo).toBe(9)
        if (method === 4) expect(Object.keys(c.policeLetters.letters)).toEqual(['station', 'national'])
        expect(win.close).not.toHaveBeenCalled()
    })

    it('ถ้านำ state เข้าไม่สำเร็จ ต้องคืนข้อมูล ecmis-* เดิมและปิดแท็บใหม่', async () => {
        localStorage.setItem('ecmis-keep', 'x')
        const win = fakeWin()
        vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window)
        vi.spyOn(flowGuide, 'overrideRole').mockImplementation(() => {
            localStorage.setItem('ecmis-partial', 'y')
            throw new Error('boom')
        })
        await expect(playSnapshot(key)).rejects.toThrow('boom')
        expect(localStorage.getItem('ecmis-keep')).toBe('x')
        expect(localStorage.getItem('ecmis-partial')).toBeNull()
        expect(win.close).toHaveBeenCalled()
    })
})
