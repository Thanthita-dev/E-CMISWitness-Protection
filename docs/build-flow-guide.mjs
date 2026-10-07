// สร้าง docs/flow-guide.md จาก src/flow-guide/flow-map.json (ข้อมูลชุดเดียวกับหน้า /flow-guide)
// รันหลังแก้ flow-map.json: node docs/build-flow-guide.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(readFileSync(resolve(root, 'src/flow-guide/flow-map.json'), 'utf-8'))

const ROLE_NAMES = {
  got_receiver: 'ธุรการคดี กอท.',
  got_director: 'ผอ. กอท.',
  got_officer: 'ผู้รับผิดชอบคุ้มครอง กอท.',
  receiver: 'ธุรการสำนัก/กอง',
  officer: 'เจ้าหน้าที่ ป.ป.ท.',
  case_owner: 'เจ้าของสำนวน',
  supervisor: 'ผู้บังคับบัญชาชั้นต้น',
  director: 'ผอ.สำนัก/กอง',
  deputy_secretary: 'รองเลขาธิการ ป.ป.ท.',
  secretary: 'เลขาธิการ ป.ป.ท.',
  committee: 'ฝ่ายเลขานุการคณะกรรมการ ป.ป.ท.',
  protection: 'ชุดคุ้มครอง',
  appeal: 'เจ้าหน้าที่อุทธรณ์',
  admin: 'Super Admin',
}
const STATUS = { yes: '✅ ทำได้ใน UI', partial: '🟡 บางส่วน', no: '❌ ยังไม่มี', system: '⚙️ ระบบ/นอกระบบ' }

// เซลล์ตาราง markdown ห้ามมี | และขึ้นบรรทัดใหม่
const cell = (v) => (v == null || v === '' ? '—' : String(v).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' '))
const role = (s) => [s.role ? ROLE_NAMES[s.role] ?? s.role : null, s.role_note].filter(Boolean).join(' — ')
const anchor = (tab) => `tab-${tab.toLowerCase()}`

const all = data.tabs.flatMap((t) => t.steps)
const count = (steps, k) => steps.filter((s) => s.implemented === k).length

const out = []
out.push('# คู่มือเดิน Flow: Activity 6 คุ้มครองพยาน')
out.push('')
out.push(`> ไฟล์นี้สร้างอัตโนมัติจาก \`src/flow-guide/flow-map.json\` ด้วย \`node docs/build-flow-guide.mjs\` ห้ามแก้ไฟล์นี้ตรง ๆ`)
out.push(`> ผังต้นทาง: \`${data.source}\` · ข้อมูล ณ ${data.generatedAt}`)
out.push('')
out.push('ใช้คู่กับหน้า **`/flow-guide`** ใน prototype ซึ่งมีปุ่ม "เล่นจากจุดนี้" ที่โหลด Mock State และสลับบทบาทให้ทันที ส่วนโครงสร้างโค้ดอ่านได้ที่ [dev-onboarding.md](dev-onboarding.md)')
out.push('')
out.push(
  `**ทั้งหมด ${all.length} ขั้น** · ${STATUS.yes} ${count(all, 'yes')} · ${STATUS.partial} ${count(all, 'partial')} · ${STATUS.system} ${count(all, 'system')} · ${STATUS.no} ${count(all, 'no')}`
)
out.push('')
out.push('## วิธีเล่น')
out.push('')
out.push('1. เปิด `/flow-guide` (หรือ `/mock-state`) แล้วโหลด Mock State ตามคอลัมน์ "Mock State" ระบบจะล้างข้อมูล `ecmis-*` เดิมใน localStorage แล้วเปิดหน้าเป้าหมายในแท็บใหม่')
out.push('2. สลับบทบาทด้วยช่อง "เลือกบทบาทผู้ใช้งาน" มุมขวาบน (TopBar) ให้ตรงคอลัมน์ "บทบาท" ปุ่มใน `/flow-guide` ทำขั้นนี้ให้อัตโนมัติ')
out.push('3. ทำตาม "วิธีกด" ทุกเคสใช้แฟ้มเดียวกันคือ `WP-2569-000501`')
out.push('')
out.push('## เส้นทางแนะนำ (เล่นตั้งแต่ต้นจนจบ)')
out.push('')
for (const sc of data.scenarios) {
  out.push(`### ${sc.title}`)
  out.push('')
  out.push(sc.summary)
  out.push('')
  out.push(`แท็บที่ผ่าน: ${sc.tabs.map((t) => `[${t}](#${anchor(t)})`).join(' → ')}`)
  out.push('')
  sc.checkpoints.forEach((cp, i) => {
    out.push(`${i + 1}. **${cp.mock_state}**: ${cp.label}${cp.role ? ` (สลับเป็น ${ROLE_NAMES[cp.role]})` : ''}`)
  })
  out.push('')
}

out.push('## สารบัญแท็บ')
out.push('')
out.push('| แท็บ | ชื่อ | ขั้น | ทำได้ | บางส่วน | ระบบ | ยังไม่มี | เริ่มจาก |')
out.push('|---|---|---|---|---|---|---|---|')
for (const t of data.tabs) {
  out.push(
    `| [${t.tab}](#${anchor(t.tab)}) | ${cell(t.title.replace(/\s*—\s*กิจกรรมที่ 6.*$/, '').replace(/^\S+\s+/, ''))} | ${t.steps.length} | ${count(t.steps, 'yes')} | ${count(t.steps, 'partial')} | ${count(t.steps, 'system')} | ${count(t.steps, 'no')} | ${cell(t.entry_mock_state)} |`
  )
}
out.push('')

let phase = null
for (const t of data.tabs) {
  if (t.phase !== phase) {
    phase = t.phase
    out.push(`## ${phase}`)
    out.push('')
  }
  out.push(`<a id="${anchor(t.tab)}"></a>`)
  out.push('')
  out.push(`### ${t.title}`)
  out.push('')
  out.push(t.path_summary)
  out.push('')
  out.push(`**เริ่มแท็บนี้:** ${t.entry}`)
  out.push('')
  out.push(`**Swimlane ในผัง:** ${t.lanes.join(' · ')}`)
  out.push('')
  if (t.gaps.length) {
    out.push('**จุดที่ prototype ยังต่างจากผัง**')
    out.push('')
    t.gaps.forEach((g) => out.push(`- ${g}`))
    out.push('')
  }
  out.push('| ขั้น | ในผัง | สถานะ | บทบาท | หน้า | วิธีกด | Mock State |')
  out.push('|---|---|---|---|---|---|---|')
  for (const s of t.steps) {
    const how = [s.how_to, s.note ? `⚠️ ${s.note}` : null].filter(Boolean).join(' ')
    out.push(
      `| **${s.code}**${s.decision ? ' ◇' : ''} | ${cell(s.text)} | ${STATUS[s.implemented]} | ${cell(role(s))} | ${s.route ? `\`${cell(s.route)}\`` : '—'} | ${cell(how)} | ${cell(s.mock_state)} |`
    )
  }
  out.push('')
  const refs = t.steps.filter((s) => s.code_ref || s.specs.length)
  if (refs.length) {
    out.push('<details><summary>อ้างอิงโค้ดและ spec</summary>')
    out.push('')
    for (const s of refs) {
      out.push(`- **${s.code}**: ${[s.code_ref && `\`${s.code_ref}\``, ...s.specs.map((x) => `\`${x}\``)].filter(Boolean).join(', ')}`)
    }
    out.push('')
    out.push('</details>')
    out.push('')
  }
}
out.push('◇ = จุดตัดสินใจในผัง')
out.push('')

writeFileSync(resolve(root, 'docs/flow-guide.md'), out.join('\n'), 'utf-8')
console.log(`docs/flow-guide.md · ${data.tabs.length} แท็บ · ${all.length} ขั้น`)
