import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EcmisUser } from '../types/user'
import baseline from '../data/mock-state-baseline-users.json'
import { getRoleSet } from './roleSets'
import { capturedUsersFor, remapMockStateUserNames, resolveCapturedUsers, type CapturedUsers } from './mockStateRoleNames'

const u = (id: string, name: string, position: string): EcmisUser => ({ id, name, position, unit: 'x' } as EcmisUser)
const toUsers = (c: CapturedUsers): EcmisUser[] => Object.entries(c).map(([id, v]) => u(id, v.name, v.position))
const rename = (c: CapturedUsers, patch: Record<string, Partial<{ name: string; position: string }>>) =>
  Object.entries(c).map(([id, v]) => u(id, patch[id]?.name ?? v.name, patch[id]?.position ?? v.position))

const from: CapturedUsers = {
  'GOT-OFF-001': { name: 'นางสาวอรุณี ใจมั่น', position: 'นักสืบชำนาญการ' },
  'OFF-001': { name: 'นางสาวอรุณี ใจมั่น', position: 'นักสืบชำนาญการ' },
  'OFF-REG1': { name: 'พ.ต.ต. ณัฐวุฒิ สรรพกิจ', position: 'นักสืบปฏิบัติการ' },
  'OFF-REG2': { name: 'ร.ต.อ. สมชาย ใจดี', position: 'นักสืบปฏิบัติการ' },
  'DIR-001': { name: 'นายวีระ', position: 'ผู้อำนวยการเฉพาะ' },
}
const wrap = (v: unknown) => ({ k: JSON.stringify(v) })

describe('remapMockStateUserNames', () => {
  it('ไม่มีความต่าง = คืน object เดิม', () => {
    const data = { a: '{"x":"นายวีระ"}' }
    expect(remapMockStateUserNames(data, from, toUsers(from))).toBe(data)
  })

  it('เปลี่ยนชื่อ 1 คน แพร่ไปทุก string ใน JSON ซ้อนและข้อความอิสระ', () => {
    const data = wrap({ owner: 'พ.ต.ต. ณัฐวุฒิ สรรพกิจ', history: [{ note: 'ส่งต่อโดย พ.ต.ต. ณัฐวุฒิ สรรพกิจ แล้ว', n: 3 }] })
    const to = rename(from, { 'OFF-REG1': { name: 'ร.ต.ท. ใหม่ ทดสอบ' } })
    const out = remapMockStateUserNames(data, from, to)
    expect(JSON.parse(out.k)).toEqual({ owner: 'ร.ต.ท. ใหม่ ทดสอบ', history: [{ note: 'ส่งต่อโดย ร.ต.ท. ใหม่ ทดสอบ แล้ว', n: 3 }] })
  })

  it('ชื่อซ้ำหลายรหัส: แทนตามรหัสพี่น้อง ไม่มีบริบทคงเดิม', () => {
    const to = rename(from, { 'OFF-001': { name: 'นางสาวใหม่ เอก' } })
    const data = wrap([
      { userId: 'OFF-001', name: 'นางสาวอรุณี ใจมั่น' },
      { userId: 'GOT-OFF-001', name: 'นางสาวอรุณี ใจมั่น' },
    ])
    expect(JSON.parse(remapMockStateUserNames(data, from, to).k)).toEqual([
      { userId: 'OFF-001', name: 'นางสาวใหม่ เอก' },
      { userId: 'GOT-OFF-001', name: 'นางสาวอรุณี ใจมั่น' },
    ])
  })

  it('ชื่อซ้ำที่ทุกรหัสเปลี่ยนเป็นชื่อเดียวกัน แทนได้เลย', () => {
    const to = rename(from, { 'OFF-001': { name: 'ใหม่' }, 'GOT-OFF-001': { name: 'ใหม่' } })
    expect(JSON.parse(remapMockStateUserNames(wrap({ a: 'คุณ นางสาวอรุณี ใจมั่น' }), from, to).k)).toEqual({ a: 'คุณ ใหม่' })
  })

  it('ตำแหน่งที่หลายคนใช้ร่วมกัน: ไม่แทนถ้าไม่มีบริบท, ตำแหน่งเฉพาะคนเดียวแทนได้', () => {
    const to = rename(from, { 'OFF-REG1': { position: 'ตำแหน่งใหม่' }, 'DIR-001': { position: 'ผอ.ใหม่' } })
    const data = wrap([
      { position: 'นักสืบปฏิบัติการ' },
      { position: 'นักสืบปฏิบัติการ', userId: 'OFF-REG1' },
      { position: 'นักสืบปฏิบัติการ', name: 'ร.ต.อ. สมชาย ใจดี' },
      { role: 'ผู้อำนวยการเฉพาะ' },
      { text: 'ผู้อำนวยการเฉพาะ และอื่น ๆ' },
    ])
    expect(JSON.parse(remapMockStateUserNames(data, from, to).k)).toEqual([
      { position: 'นักสืบปฏิบัติการ' },
      { position: 'ตำแหน่งใหม่', userId: 'OFF-REG1' },
      { position: 'นักสืบปฏิบัติการ', name: 'ร.ต.อ. สมชาย ใจดี' },
      { role: 'ผอ.ใหม่' },
      { text: 'ผอ.ใหม่ และอื่น ๆ' }, // ตำแหน่งของคนเดียวที่ยาวพอ แทนแบบ substring
    ])
  })

  it('สลับชื่อ A↔B ไม่ต่อเนื่อง', () => {
    const to = rename(from, { 'OFF-REG1': { name: 'ร.ต.อ. สมชาย ใจดี' }, 'OFF-REG2': { name: 'พ.ต.ต. ณัฐวุฒิ สรรพกิจ' } })
    const data = wrap({ a: 'พ.ต.ต. ณัฐวุฒิ สรรพกิจ', b: 'ร.ต.อ. สมชาย ใจดี' })
    expect(JSON.parse(remapMockStateUserNames(data, from, to).k)).toEqual({ a: 'ร.ต.อ. สมชาย ใจดี', b: 'พ.ต.ต. ณัฐวุฒิ สรรพกิจ' })
  })

  it('ค่าที่ไม่ใช่ JSON คงเดิม และ key ไม่ถูกแตะ', () => {
    const to = rename(from, { 'OFF-REG1': { name: 'ใหม่' } })
    const data = { raw: 'พ.ต.ต. ณัฐวุฒิ สรรพกิจ', obj: '{"พ.ต.ต. ณัฐวุฒิ สรรพกิจ":1}', same: '{"a":1}' }
    const out = remapMockStateUserNames(data, from, to)
    expect(out.raw).toBe(data.raw)
    expect(out.obj).toBe(data.obj)
    expect(out.same).toBe(data.same)
  })
})

describe('remapMockStateUserNames: บริบทและกรณีขอบ', () => {
  const toOff = rename(from, { 'OFF-001': { name: 'ชื่อชุดเดิม ใหม่' }, 'GOT-OFF-001': { name: 'ชื่อ กอท. ใหม่' } })
  const OLD = 'นางสาวอรุณี ใจมั่น'
  const run = (v: unknown, to = toOff) => JSON.parse(remapMockStateUserNames(wrap(v), from, to).k)

  it('string ที่เป็นสมาชิก array และรากถูกแทน', () => {
    const to = rename(from, { 'OFF-REG1': { name: 'ชื่อใหม่ ทดสอบ' } })
    expect(run({ signers: ['พ.ต.ต. ณัฐวุฒิ สรรพกิจ (หัวหน้า)'] }, to)).toEqual({ signers: ['ชื่อใหม่ ทดสอบ (หัวหน้า)'] })
    expect(JSON.parse(remapMockStateUserNames({ k: '"พ.ต.ต. ณัฐวุฒิ สรรพกิจ"' }, from, to).k)).toBe('ชื่อใหม่ ทดสอบ')
  })

  it('รหัสใน ancestor ใช้เลือกชื่อกำกวม (ใกล้สุดชนะ)', () => {
    expect(run({ id: 'GOT-OFF-001', rows: [{ n: OLD }, { id: 'OFF-001', inner: { n: OLD } }] })).toEqual({
      id: 'GOT-OFF-001',
      rows: [{ n: 'ชื่อ กอท. ใหม่' }, { id: 'OFF-001', inner: { n: 'ชื่อชุดเดิม ใหม่' } }],
    })
  })

  it('ฟิลด์ที่คู่กับ key ชื่อชนะเมื่อมีสองรหัสใน object เดียว', () => {
    expect(run({ ownerUserId: 'OFF-001', otherId: 'GOT-OFF-001', ownerName: OLD })).toMatchObject({ ownerName: 'ชื่อชุดเดิม ใหม่' })
    expect(run({ ownerUserId: 'GOT-OFF-001', otherId: 'OFF-001', ownerName: OLD })).toMatchObject({ ownerName: 'ชื่อ กอท. ใหม่' })
  })

  it('ขอบเขต กอท. เลือกรหัส GOT แม้มีรหัสชุดเดิมอยู่ในค่า', () => {
    expect(run({ nested: { ref: 'OFF-001' }, log: [{ action: 'ส่งให้ กอท.', by: OLD }, { actorRole: 'got_officer', by: OLD }] })).toEqual({
      nested: { ref: 'OFF-001' },
      log: [{ action: 'ส่งให้ กอท.', by: 'ชื่อ กอท. ใหม่' }, { actorRole: 'got_officer', by: 'ชื่อ กอท. ใหม่' }],
    })
  })

  it('fallback ระดับค่า: ไม่มีรหัสชุดเดิม → GOT, มี → ชุดเดิม (GOT-OFF-001 ไม่นับเป็น OFF-001)', () => {
    expect(run({ by: OLD, ref: 'GOT-OFF-001' })).toEqual({ by: 'ชื่อ กอท. ใหม่', ref: 'GOT-OFF-001' })
    expect(run({ by: OLD, x: { ref: 'OFF-001' } }).by).toBe('ชื่อชุดเดิม ใหม่')
  })

  it('ตำแหน่งของคนเดียวที่ยาวพอแทนแบบ substring · ตำแหน่งร่วมแทนเฉพาะ exact+บริบท', () => {
    const to = rename(from, { 'DIR-001': { position: 'ตำแหน่งใหม่ยาว' }, 'OFF-REG1': { position: 'ใหม่' } })
    expect(run({ a: 'นายวีระ (ผู้อำนวยการเฉพาะ)', b: 'ผู้อำนวยการเฉพาะ', c: 'นักสืบปฏิบัติการ (x)' }, to)).toEqual({
      a: 'นายวีระ (ตำแหน่งใหม่ยาว)', b: 'ตำแหน่งใหม่ยาว', c: 'นักสืบปฏิบัติการ (x)',
    })
  })

  it('ตำแหน่งสั้นที่เปลี่ยนไม่ไปทำลายตำแหน่งยาวที่มันเป็นส่วนท้าย (SEC/DSEC)', () => {
    const f: CapturedUsers = {
      'SEC-001': { name: 'นายสุรศักดิ์ ธรรมพิทักษ์', position: 'เลขาธิการคณะกรรมการ ป.ป.ท.' },
      'DSEC-001': { name: 'นายรอง ตัวอย่างดี', position: 'รองเลขาธิการคณะกรรมการ ป.ป.ท.' },
    }
    const to = rename(f, { 'SEC-001': { position: 'ZZSECPOS' } })
    const v = { a: 'รองเลขาธิการคณะกรรมการ ป.ป.ท.', b: 'นายรอง ตัวอย่างดี (รองเลขาธิการคณะกรรมการ ป.ป.ท.)', c: 'นายสุรศักดิ์ ธรรมพิทักษ์ (เลขาธิการคณะกรรมการ ป.ป.ท.)', d: 'เลขาธิการคณะกรรมการ ป.ป.ท.' }
    expect(JSON.parse(remapMockStateUserNames(wrap(v), f, to).k)).toEqual({ ...v, c: 'นายสุรศักดิ์ ธรรมพิทักษ์ (ZZSECPOS)', d: 'ZZSECPOS' })
  })

  it('capturedUsers ที่เสียถูกข้าม', () => {
    const bad = { 'OFF-REG1': null, 'OFF-REG2': { name: 5, position: '  ' }, X: { name: 'abc', position: 'ตำแหน่งยาวพอควร' }, 'DIR-001': undefined } as unknown
    const to = rename(from, { 'OFF-REG1': { name: 'ชื่อใหม่ ทดสอบ' }, X: {} })
    const data = wrap({ a: 'พ.ต.ต. ณัฐวุฒิ สรรพกิจ abc' })
    expect(remapMockStateUserNames(data, bad as CapturedUsers, to)).toBe(data)
    expect(resolveCapturedUsers('x', from)).toBe(from)
    expect(resolveCapturedUsers(null, from)).toBe(from)
    expect(resolveCapturedUsers([], from)).toBe(from)
  })

  it('key __proto__ ยังอยู่ และค่าที่เปลี่ยนเป็น compact', () => {
    const to = rename(from, { 'OFF-REG1': { name: 'ชื่อใหม่ ทดสอบ' } })
    const raw = '{"__proto__":{"a":"พ.ต.ต. ณัฐวุฒิ สรรพกิจ"},"b":1}'
    const out = remapMockStateUserNames({ k: raw }, from, to).k
    expect(out).toBe('{"__proto__":{"a":"ชื่อใหม่ ทดสอบ"},"b":1}')
  })
})

describe('remapMockStateUserNames กับไฟล์ mock state จริง', () => {
  const dir = resolve(__dirname, '../mock-states')
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  const baseUsers = getRoleSet('default').users

  it('ชุดตั้งต้น = ผลลัพธ์เท่าเดิมทุกไบต์ ทุกไฟล์', () => {
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const s = JSON.parse(readFileSync(resolve(dir, f), 'utf-8'))
      expect(remapMockStateUserNames(s.localStorageData, baseline as CapturedUsers, baseUsers), f).toBe(s.localStorageData)
    }
  })

  it('Case 1.15 เปลี่ยนชื่อ OFF-REG1 แล้วไม่เหลือชื่อเก่า', () => {
    const old = 'พ.ต.ต. ณัฐวุฒิ สรรพกิจ'
    const s = JSON.parse(readFileSync(resolve(dir, 'Case 1.15.json'), 'utf-8'))
    const to = baseUsers.map((x) => (x.id === 'OFF-REG1' ? { ...x, name: 'ร.ต.ท. ทดสอบ ใหม่เอี่ยม' } : x))
    const out = remapMockStateUserNames(s.localStorageData, baseline as CapturedUsers, to)
    const all = Object.values(out).join('\n')
    expect(all).not.toContain(old)
    expect(all).toContain('ร.ต.ท. ทดสอบ ใหม่เอี่ยม')
    expect(Object.keys(out)).toEqual(Object.keys(s.localStorageData))
  })

  it('Notice 6: เปลี่ยน SEC-001 + GOT-OFF-001 แล้วไม่เหลือชื่อเก่า', () => {
    const s = JSON.parse(readFileSync(resolve(dir, 'Notice 6.json'), 'utf-8'))
    const to = baseUsers.map((x) =>
      x.id === 'SEC-001' ? { ...x, name: 'นายเลขา ทดสอบใหม่', position: 'เลขาธิการทดสอบ' }
      : x.id === 'GOT-OFF-001' ? { ...x, name: 'นางสาวกอท ทดสอบใหม่' } : x)
    const all = Object.values(remapMockStateUserNames(s.localStorageData, baseline as CapturedUsers, to)).join('\n')
    expect(all).not.toContain('นายสุรศักดิ์ ธรรมพิทักษ์')
    expect(all).not.toContain('เลขาธิการคณะกรรมการ ป.ป.ท.')
    expect(all).not.toContain('นางสาวอรุณี ใจมั่น')
    expect(all).toContain('นายเลขา ทดสอบใหม่')
    expect(all).toContain('นางสาวกอท ทดสอบใหม่')
  })

  it('capturedUsersFor ตรงกับ baseline ของชุดตั้งต้น', () => {
    expect(capturedUsersFor(getRoleSet('default'))).toEqual(baseline)
  })
})
