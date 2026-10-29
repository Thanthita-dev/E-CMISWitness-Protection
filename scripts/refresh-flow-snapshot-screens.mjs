#!/usr/bin/env node
/** Refresh saved entry points after the referral workspace moved into the dossier.
 * Produces raw snapshots for build-flow-snapshots.mjs --merge; preserves capture
 * dates, roles, workflow stages, signatures and existing document drafts.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'e2e/.screen-snapshots-raw')
const { entries } = JSON.parse(readFileSync(resolve(root, 'src/flow-snapshots/index.json'), 'utf8'))
mkdirSync(output, { recursive: true })
let count = 0
for (const [key, entry] of Object.entries(entries)) {
  const snapshot = JSON.parse(readFileSync(resolve(root, `src/flow-snapshots/states/${entry.state}.json`), 'utf8'))
  const data = snapshot.localStorageData
  if (!data['ecmis-case-storage-v2']) continue
  const stored = JSON.parse(data['ecmis-case-storage-v2'])
  const url = new URL(entry.route, 'http://localhost')
  const routeCase = url.searchParams.get('caseNo') || (/^\/(dossier|saraban)\//.test(url.pathname) ? decodeURIComponent(url.pathname.split('/').slice(2).join('/')) : null)
  const caseNo = routeCase || stored.state.activeCaseNo
  const c = stored.state.cases.find(c => c.no === caseNo)
  if (!c) continue
  const rights = c.article14 && (!c.article14.targetAgencyType || c.article14.targetAgencyType === 'rlpd')
  let route = entry.route
  if (url.pathname === '/article14') {
    route = rights ? `/dossier/${encodeURIComponent(c.no)}` : `/article14?caseNo=${encodeURIComponent(c.no)}`
  }
  // Both originals are part of the current referral dossier. Existing scoped
  // drafts are retained; opening the form supplies its original template.
  let changed = false
  if (rights && !c.extraForms?.includes(19)) {
    c.extraForms = [...new Set([...(c.extraForms || []), 19])]
    changed = true
  }
  if (!changed && route === entry.route) continue
  data['ecmis-case-storage-v2'] = JSON.stringify(stored)
  const label = entry.label.replace('ข้อมูลเก่า เรื่องข้อ 14', 'เรื่องส่งต่อกรมคุ้มครองสิทธิฯ').replace('เปิดหน้า /article14', 'เปิดแฟ้มส่งต่อกรมคุ้มครองสิทธิฯ')
  writeFileSync(resolve(output, `${key.replace(/[:>]/g, '_')}.json`), JSON.stringify({
    key, label, role: entry.role, route, capturedAt: snapshot.capturedAt, localStorageData: data,
  }))
  count++
}
console.log(`Prepared ${count} current-screen snapshots in ${output}`)
