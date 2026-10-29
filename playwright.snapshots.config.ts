import { defineConfig } from '@playwright/test'
import base from './playwright.config'

/**
 * รัน e2e/flow-paths แล้วจับ snapshot ของทุกกล่อง/เส้นในผัง /flow-chart (ดู e2e/helpers/snapshot.ts)
 *   pnpm snapshots:capture   แล้ว   node scripts/build-flow-snapshots.mjs
 */
process.env.FLOW_SNAPSHOTS = '1'

export default defineConfig({
  ...base,
  testDir: './e2e/flow-paths',
  retries: 0,
})
