import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ADDITIONAL_FORMS, additionalFormBody, additionalFormDocument, additionalParagraphText, getAdditionalForm } from './additionalForms'

const EMPTY = { values: {}, paragraphs: {} }
const textOf = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent ?? ''
}
const sourceOf = (html: string) => new DOMParser().parseFromString(html, 'text/html').getElementById('a6-source')!

describe('แบบฟอร์มและหนังสือประกอบ', () => {
  it('มีต้นฉบับครบทั้ง 7 รายการ ตรง checksum และมี layout จาก Word', () => {
    expect(ADDITIONAL_FORMS).toHaveLength(7)
    expect(new Set(ADDITIONAL_FORMS.map((form) => form.id)).size).toBe(7)
    for (const form of ADDITIONAL_FORMS) {
      const original = readFileSync(`public${form.sourceUrl}`)
      expect(createHash('sha256').update(original).digest('hex')).toBe(form.sourceSha256)
      expect(form.layout.blocks.length).toBeGreaterThan(10)
      expect(form.layout.page.w).toBeCloseTo(595.3, 0)
      expect(form.layout.page.h).toBeCloseTo(841.9, 0)
      expect(form.fields.length).toBeGreaterThan(5)
    }
  })

  it('ใช้ขนาดกระดาษและขอบตาม Word ของแต่ละฉบับ', () => {
    const chairman = getAdditionalForm('chairman-signature')!.layout.page
    expect([chairman.top, chairman.left, chairman.right, chairman.bottom]).toEqual([35.45, 85.05, 56.7, 36.85])
    const owner = getAdditionalForm('case-owner-notice')!.layout.page
    expect(owner).toMatchObject({ top: 85.1, topExact: true, left: 85.05, right: 56.7 })
    const html = additionalFormDocument(getAdditionalForm('police-extension-request')!, EMPTY)
    expect(html).toContain('@page{size:595.3pt 841.9pt;margin:0}')
    expect(html).toContain('left:72pt;top:42.55pt')
  })

  it('ข้อความตามต้นฉบับอยู่ครบ รวมย่อหน้าท้ายของฉบับยาว ความเห็น และข้อความต่อหน้า', () => {
    const board = getAdditionalForm('board-proposal')!
    const text = textOf(additionalFormDocument(board, EMPTY))
    expect(text).toContain('เสนอความเห็นการคุ้มครองพยาน')
    expect(text).toContain('-๑๓-')
    expect(text).toContain('/คุ้มครอง')
    expect(text).toContain('๙. ความเห็นเลขาธิการฯ')
    expect(text).toContain('เลขาธิการคณะกรรมการ ป.ป.ท.')
    // พ.ศ. 25465 เป็นข้อความในต้นฉบับ ห้ามแก้เอง
    expect(text).toContain('พ.ศ. 25465')
  })

  it('ขึ้นหน้าใหม่ตรงเลขหน้าที่ผู้จัดทำพิมพ์ไว้ และจุดที่ Word ขึ้นหน้า', () => {
    const memo = sourceOf(additionalFormDocument(getAdditionalForm('extension-memo')!, EMPTY))
    const breaks = Array.from(memo.querySelectorAll('[data-pb="1"]')).map((el) => el.textContent!.replace(/​/g, '').trim())
    expect(breaks).toEqual(['-2-', '-3-', '-4-', '-5-', '-6-'])
    const expense = sourceOf(additionalFormDocument(getAdditionalForm('extension-expense')!, EMPTY))
    expect(Array.from(expense.querySelectorAll('[data-pb="1"]')).map((el) => el.getAttribute('data-b'))).toEqual(['19', '31'])
  })

  it('ช่องที่กรอกแสดงบนกระดาษทุกจุดที่ใช้ค่าเดียวกัน และช่องที่ล้างแล้วกลับเป็นเส้นจุด', () => {
    const police = getAdditionalForm('police-extension-request')!
    const witness = police.fields.find((field) => field.id === 'witnessName')!
    expect(witness.uses).toBe(2)
    const html = additionalFormBody(police, { values: { witnessName: 'นายทดสอบ ใจดี', subject: '' }, paragraphs: {} })
    expect(html.match(/นายทดสอบ ใจดี/g)).toHaveLength(2)
    expect(html).not.toContain('ขอความอนุเคราะห์ขยายระยะเวลาให้ความคุ้มครองพยาน<')
    expect(html).toMatch(/data-f="subject"[^>]*>\.{12,}</)
  })

  it('ตั้งชื่อช่องหัวหนังสือ ผู้ลงนาม และความเห็น', () => {
    const memo = getAdditionalForm('extension-memo')!
    const byId = new Map(memo.fields.map((field) => [field.id, field]))
    expect(byId.get('department')?.sample).toBe('กอท. (กลุ่มงานอำนวยการด้านคุ้มครองพยาน) โทร ๔๒๒๒')
    expect(byId.get('docNo')?.sample).toBe('ปป ๐๐๑๒/')
    expect(byId.get('date')?.sample).toBe('เมษายน 2566')
    expect(byId.get('subject')?.sample).toBe('การคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น')
    expect(byId.get('caseNo')?.uses).toBeGreaterThan(1)
    expect(memo.fields.filter((field) => field.group === 'ความเห็นผู้บังคับบัญชา').map((field) => field.label))
      .toEqual(['๑๐. ความเห็นผู้บังคับบัญชาชั้นต้น', '๑๑. ความเห็นผู้อำนวยการกอง', '๑๒. ความเห็นรองเลขาธิการฯ', '๑๓. ความเห็นเลขาธิการฯ'])
    expect(memo.fields.some((field) => field.label.startsWith('ชื่อผู้ลงนาม · นักสืบสวนสอบสวนชำนาญการพิเศษ'))).toBe(true)
    expect(memo.fields.some((field) => field.label.startsWith('ยศ · นักสืบสวนสอบสวนชำนาญการพิเศษ') && field.sample === 'พ.ต.ต.')).toBe(true)
    // ข้อความตัดตอนตัวบทกฎหมาย (...) ไม่ใช่ช่องกรอก
    expect(memo.fields.some((field) => field.sample === '...')).toBe(false)
  })

  it('ความเห็นที่พิมพ์แทนบรรทัดว่างของช่องนั้น และแก้ทั้งย่อหน้าได้', () => {
    const memo = getAdditionalForm('extension-memo')!
    const opinion = memo.fields.find((field) => field.label.startsWith('๑๑.'))!
    const html = additionalFormBody(memo, { values: { [opinion.id]: 'เห็นชอบตามเสนอ' }, paragraphs: { 4: 'เรียน  เลขาธิการ (ทดสอบ)' } })
    expect(html).toContain('เห็นชอบตามเสนอ')
    expect(html).toContain('a6-opinion')
    expect(html).toContain('เรียน  เลขาธิการ (ทดสอบ)')
    expect(additionalParagraphText(memo, '4', { values: {}, paragraphs: {} })).toBe('เรียน  เลขาธิการคณะกรรมการ ป.ป.ท.')
  })

  it('ข้อความที่กรอกไม่สร้าง script หรือ markup ในเอกสาร', () => {
    const template = ADDITIONAL_FORMS[0]
    const html = additionalFormDocument(template, { values: { subject: '<script>alert("x")</script> & <img src=x onerror=alert(1)>' }, paragraphs: {} })
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&#60;script&#62;')
  })

  it('ไม่เติมตราหรือชั้นความลับที่ต้นฉบับไม่มี', () => {
    // บันทึกขอขยาย (คบ.๖) อ้างรูปครุฑที่ไม่มีไฟล์ในต้นฉบับ จึงไม่แสดงรูป
    expect(additionalFormDocument(getAdditionalForm('extension-memo')!, EMPTY)).not.toContain('<img')
    // ตราครุฑมาจากรูปในไฟล์ Word เท่านั้น
    expect(additionalFormDocument(getAdditionalForm('police-extension-request')!, EMPTY).match(/<img /g)).toHaveLength(1)
    for (const form of ADDITIONAL_FORMS) {
      const source = form.layout.blocks.map((block) => block.runs.map((run) => run.t ?? '').join('')).join(' ')
      const rendered = textOf(additionalFormDocument(form, EMPTY))
      for (const word of ['ลับที่สุด', 'ลับมาก', 'ด่วนที่สุด', 'สำเนาถูกต้อง']) expect(rendered.split(word).length).toBe(source.split(word).length)
    }
  })
})

 it('offers only the authorized signature field and keeps print output free of controls', () => {
  const form = getAdditionalForm('chairman-signature')!
  const html = additionalFormBody(form, EMPTY, { signableField: 'signer:17' })
  const doc = new DOMParser().parseFromString(html, 'text/html')
  expect(doc.querySelectorAll('[data-sign-field]')).toHaveLength(1)
  expect(doc.querySelector('[data-sign-field]')?.getAttribute('data-sign-field')).toBe('signer:17')
  expect(additionalFormDocument(form, EMPTY)).not.toContain('data-sign-field')
 })
