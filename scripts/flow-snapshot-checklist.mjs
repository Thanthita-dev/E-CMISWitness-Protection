#!/usr/bin/env node
/**
 * รายการกล่อง/เส้นที่ต้องมี snapshot ในผัง /flow-chart พร้อมสถานะว่าจับแล้วหรือยัง (ดู e2e/helpers/snapshot.ts)
 *
 *   node scripts/flow-snapshot-checklist.mjs            สรุปทุกแท็บ
 *   node scripts/flow-snapshot-checklist.mjs 02 03      รายการละเอียดของแท็บ 02, 03 (เฉพาะที่ยังขาด: --missing)
 *   node scripts/flow-snapshot-checklist.mjs --json     รายการทั้งหมดแบบ JSON
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = resolve(root, 'e2e/.flow-snapshots-raw')
const diagram = JSON.parse(readFileSync(resolve(root, 'src/flow-guide/flow-diagram.json'), 'utf-8')).tabs
const overviewSrc = readFileSync(resolve(root, 'src/components/flow-guide/FlowOverviewChart.tsx'), 'utf-8')

const safeName = (key) => key.replace(/[:>]/g, '__').replace(/[^\w.\-ก-๙]+/g, '_')
const captured = (key) => existsSync(resolve(RAW, `${safeName(key)}.json`))
const clip = (s, n = 48) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

export function flowSnapshotTargets() {
  const items = []
  for (const [tab, d] of Object.entries(diagram)) {
    const byId = new Map(d.nodes.map((n) => [n.id, n]))
    for (const n of d.nodes) {
      if (n.kind === 'note') continue
      items.push({ key: `node:${tab}:${n.id}`, tab, type: 'node', id: n.id, code: n.code, kind: n.kind, text: clip(n.text) })
    }
    for (const e of d.edges) {
      if (!e.source || !e.target || !byId.has(e.source) || !byId.has(e.target)) continue
      const s = byId.get(e.source)
      const t = byId.get(e.target)
      if (s.kind === 'note' || t.kind === 'note') continue
      items.push({
        key: `edge:${tab}:${e.id}`, tab, type: 'edge', id: e.id, label: e.label,
        source: e.source, target: e.target,
        text: `${s.code ?? s.id} “${clip(s.text, 28)}” → ${t.code ?? t.id} “${clip(t.text, 28)}”${e.label ? ` [${e.label}]` : ''}`,
      })
    }
  }
  for (const m of overviewSrc.matchAll(/from: '([^']+)', to: '([^']+)'(?:, label: '([^']+)')?/g)) {
    items.push({ key: `overview:${m[1]}>${m[2]}`, tab: m[1], type: 'overview', id: `${m[1]}>${m[2]}`, label: m[3] ?? null, text: `แท็บ ${m[1]} → ${m[2]}${m[3] ? ` [${m[3]}]` : ''}` })
  }
  return items.map((i) => ({ ...i, captured: captured(i.key) }))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const items = flowSnapshotTargets()
  if (args.includes('--json')) {
    console.log(JSON.stringify(items, null, 2))
  } else {
    const tabs = args.filter((a) => !a.startsWith('--'))
    const onlyMissing = args.includes('--missing')
    if (tabs.length === 0) {
      const byTab = new Map()
      items.forEach((i) => byTab.set(i.tab, [...(byTab.get(i.tab) ?? []), i]))
      let total = 0
      let done = 0
      for (const [tab, list] of byTab) {
        const c = list.filter((i) => i.captured).length
        total += list.length
        done += c
        console.log(`${tab.padEnd(6)} ${String(c).padStart(3)}/${String(list.length).padEnd(3)} ${c === list.length ? '✓' : ''}`)
      }
      console.log(`รวม ${done}/${total}`)
    } else {
      for (const i of items.filter((x) => tabs.includes(x.tab) && (!onlyMissing || !x.captured))) {
        console.log(`${i.captured ? '✓' : '·'} ${i.key.padEnd(24)} ${i.type === 'node' ? `[${i.kind}] ${i.code ?? ''} ${i.text}` : i.text}`)
      }
    }
  }
}
