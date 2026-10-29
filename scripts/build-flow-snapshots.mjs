#!/usr/bin/env node
/**
 * รวม snapshot ดิบจาก e2e/.flow-snapshots-raw (เขียนโดย e2e/helpers/snapshot.ts) เข้า src/flow-snapshots
 *
 *   src/flow-snapshots/states/<hash>.json   state ที่ไม่ซ้ำกัน (รูปแบบเดียวกับ src/mock-states ใช้ applyMockState ได้)
 *   src/flow-snapshots/index.json           key ของกล่อง/เส้น → state + บทบาท + หน้า + คำอธิบาย
 *
 * กล่อง/เส้นที่ได้ state เหมือนกัน (ไม่นับวันเวลา ISO ซึ่งต่างกันทุกครั้งที่รัน) จะชี้ไฟล์เดียวกัน (แต่ละ key ยังมีบทบาท/หน้า/คำอธิบายของตัวเอง)
 * ไฟล์ state ที่มีอยู่แล้วและ hash ตรงกันจะคงไว้ตามเดิม เพื่อให้ build ซ้ำไม่เปลี่ยนไฟล์โดยไม่จำเป็น
 * key แท็บ (tab:<tab>) สร้างให้อัตโนมัติจากกล่องแรกของแท็บที่มี snapshot
 *
 *   node scripts/build-flow-snapshots.mjs           รวมและแสดงความครอบคลุม
 *   node scripts/build-flow-snapshots.mjs --check   ไม่เขียนไฟล์ ออกด้วย code 1 ถ้ายังขาด
 *   node scripts/build-flow-snapshots.mjs --partial ยอมเขียนแม้ยังขาดบาง key (ปกติจะไม่เขียนทับเพื่อไม่ให้ state ที่ commit ไว้หาย)
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { flowSnapshotTargets } from './flow-snapshot-checklist.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const inputDir = process.argv.find(arg => arg.startsWith('--input-dir='))?.slice('--input-dir='.length)
const RAW = resolve(root, inputDir || 'e2e/.flow-snapshots-raw')
const merge = process.argv.includes('--merge')
const OUT = resolve(root, 'src/flow-snapshots')
const STATES = resolve(OUT, 'states')
const check = process.argv.includes('--check')
const partial = process.argv.includes('--partial')

const flowMap = JSON.parse(readFileSync(resolve(root, 'src/flow-guide/flow-map.json'), 'utf-8'))
const targets = flowSnapshotTargets()
const targetKeys = new Set(targets.map((t) => t.key))

const raws = existsSync(RAW)
  ? readdirSync(RAW).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(resolve(RAW, f), 'utf-8')))
  : []

const ISO_DATETIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g
const stableData = (data) =>
  JSON.stringify(Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)))).replace(ISO_DATETIME, 'T')
const states = new Map()
const entries = merge && existsSync(resolve(OUT, 'index.json')) ? JSON.parse(readFileSync(resolve(OUT, 'index.json'), 'utf-8')).entries : {}
const unknown = []

for (const r of raws.sort((a, b) => a.key.localeCompare(b.key))) {
  if (!targetKeys.has(r.key)) unknown.push(r.key)
  const hash = createHash('sha1').update(stableData(r.localStorageData)).digest('hex').slice(0, 12)
  if (!states.has(hash)) {
    states.set(hash, { name: hash, description: r.label, to: r.route, capturedAt: r.capturedAt, localStorageData: r.localStorageData })
  }
  entries[r.key] = { state: hash, label: r.label, role: r.role, route: r.route }
}

// กล่องแท็บในผังภาพรวม = กล่องแรกตามลำดับขั้นใน flow-map ที่มี snapshot
for (const tab of flowMap.tabs) {
  const first = tab.steps.map((s) => entries[`node:${tab.tab}:${s.code}`]).find(Boolean)
  if (first && (!merge || !entries[`tab:${tab.tab}`])) entries[`tab:${tab.tab}`] = { ...first, label: `เริ่มแท็บ ${tab.tab}: ${first.label}` }
}

const missing = targets.filter((t) => !entries[t.key])
const byType = (type) => {
  const all = targets.filter((t) => t.type === type)
  return `${all.length - missing.filter((m) => m.type === type).length}/${all.length}`
}
console.log(`snapshot ดิบ ${raws.length} · state ไม่ซ้ำ ${states.size}`)
console.log(`กล่อง ${byType('node')} · เส้นผังรายขั้น ${byType('edge')} · เส้นผังภาพรวม ${byType('overview')}`)
if (unknown.length) console.log(`⚠ key ที่ไม่ตรงกับกล่อง/เส้นในผัง (${unknown.length}): ${unknown.join(', ')}`)
if (missing.length) {
  const tabs = new Map()
  missing.forEach((m) => tabs.set(m.tab, (tabs.get(m.tab) ?? 0) + 1))
  console.log(`ยังขาด ${missing.length}: ${[...tabs].map(([t, n]) => `${t}(${n})`).join(' ')}`)
}

if (check) process.exit(missing.length || unknown.length ? 1 : 0)
if (raws.length === 0 || (missing.length && !partial)) {
  console.error(`ไม่เขียนทับ src/flow-snapshots: ${raws.length === 0 ? 'ไม่พบ snapshot ดิบ (รัน pnpm snapshots:capture ก่อน)' : 'ยังขาดบาง key (ใช้ --partial ถ้าตั้งใจ)'}`)
  process.exit(1)
}

mkdirSync(STATES, { recursive: true })
for (const f of readdirSync(STATES)) {
  if (!merge && f.endsWith('.json') && !states.has(f.slice(0, -5))) rmSync(resolve(STATES, f))
}
for (const [hash, state] of states) {
  const file = resolve(STATES, `${hash}.json`)
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(state))
}
const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(resolve(OUT, 'index.json'), `${JSON.stringify({ entries: sorted }, null, 1)}\n`)
console.log(`เขียน ${OUT}/index.json และ ${states.size} ไฟล์ใน states/`)
