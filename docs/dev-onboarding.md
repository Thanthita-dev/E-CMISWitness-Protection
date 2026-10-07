# คู่มือ Dev: E-CMIS Activity 6 (คุ้มครองพยาน)

Repo: `A6-E-CMISWitness-Protection` (branch `dev`, main/deploy branch `mercil-deployment`)
Stack: Vite 6 + React 18 + TanStack Router (file routes) + zustand 5 (`persist` → localStorage) + Tailwind 3 + sweetalert2
**ไม่มี backend**: ข้อมูลทั้งหมดอยู่ใน localStorage ของเบราว์เซอร์ (`src/lib/mockApi.ts` มีฟังก์ชันจำลองอยู่ตัวเดียวคือ `saveKb6Opinions`)

เอกสารนี้เขียนจากสิ่งที่ตรวจในโค้ดจริงเท่านั้น เลขบรรทัดอ้างอิงตามสถานะ repo ณ commit `d8461ee`


## 0. เริ่มที่นี่ (30 นาทีแรก)

1. `pnpm install && pnpm dev` แล้วเปิด http://localhost:3000/flow-guide
2. อ่านภาพรวมในหน้า **คู่มือเดิน Flow** (`/flow-guide`): ทุกขั้น WIT ของผัง `context/user-flow/User_Flow_Activity_6_Redesign_v5_A4_Tab_02.drawio` (19 แท็บ 227 ขั้น) จับคู่กับบทบาท หน้าจอ ปุ่มที่ต้องกด Mock State และไฟล์ spec
3. เลือก "เส้นทางปกติ" แล้วกด checkpoint ไล่จาก Case 1 → Case 1.16 ทีละจุด แต่ละจุดจะโหลดข้อมูลจำลอง สลับบทบาท และเปิดหน้าเป้าหมายในแท็บใหม่
4. อ่านหัวข้อ 2 (บทบาท) หัวข้อ 4 (Mock State) และหัวข้อ 10 (Gotchas) ของเอกสารนี้
5. ตารางจับคู่แบบอ่านออฟไลน์/พิมพ์ได้อยู่ที่ [`docs/flow-guide.md`](flow-guide.md)

> **ข้อมูลชุดเดียว**: หน้า `/flow-guide` และ `docs/flow-guide.md` อ่านจาก `src/flow-guide/flow-map.json` ไฟล์เดียวกัน
> ถ้าแก้ flow หรือเพิ่ม mock state ให้แก้ JSON นั้น แล้วรัน `node docs/build-flow-guide.mjs` เพื่อสร้าง markdown ใหม่
>
> โครงของแต่ละขั้นใน JSON: `code`, `text`, `lane` (มาจากผัง) และ `implemented` (`yes`/`partial`/`no`/`system`), `role` (UserRole), `role_note`, `route`, `ui`, `how_to`, `mock_state`, `specs`, `code_ref`, `note` (ส่วนที่จับคู่กับ prototype)
> ส่วน `scenarios` คือเส้นทางแนะนำ ซึ่งเป็นลำดับ checkpoint ของ mock state

---

## 1. วิธีรัน

### package.json scripts
| script | คำสั่ง | หมายเหตุ |
|---|---|---|
| `dev` | `vite` | port **3000**, `host: true` (`vite.config.ts`) → http://localhost:3000 |
| `build` | `tsr generate && tsc && vite build` | สร้าง `src/routeTree.gen.ts` ใหม่ก่อน type-check |
| `preview` | `vite preview` | port 3000 |
| `test` | `vitest` | unit test (jsdom) |
| `test:e2e` | `playwright test` | ใช้ `playwright.config.ts` |
| `test:e2e:ui` | `playwright test --ui` | |

Package manager คือ **pnpm** (`pnpm-lock.yaml`, `pnpm-workspace.yaml` มี `allowBuilds: esbuild`; Dockerfile ปักเวอร์ชัน `pnpm@11.5.1`; `.gitignore` ignore `package-lock.json`)

### Vite (`vite.config.ts`)
- `TanStackRouterVite({ routesDirectory: './src/routes', generatedRouteTree: './src/routeTree.gen.ts', routeFileIgnorePrefix: '-' })`: ไฟล์ใน `src/routes` ที่ขึ้นต้นด้วย `-` จะไม่ถูกนับเป็น route
- ปลั๊กอิน Babel `@locator/babel-jsx` (เปิดเฉพาะ development)
- alias `@` → `./src`

### Vitest (`vitest.config.ts`)
- `environment: 'jsdom'`, setup `src/test/setup.ts` (import `@testing-library/jest-dom/vitest`)
- exclude `e2e/**` (Playwright specs)
- ไฟล์ test มี 19 ไฟล์ เช่น `src/lib/*.test.ts`, `src/store/useCaseStore.test.ts`, `src/components/**/**.test.tsx`

### Playwright
| config | testDir | port | จุดต่าง |
|---|---|---|---|
| `playwright.config.ts` | `./e2e` | **5174** (`pnpm vite --port 5174 --strictPort`) | `fullyParallel`, retries 1 บน CI, locale `th-TH`, timezone `Asia/Bangkok`, chromium |
| `playwright.screenshots.config.ts` | `./e2e-screenshots` | 5174 | viewport 1920×1080, timeout 90s, `reuseExistingServer: true` |

รันชุดถ่ายภาพ (คำสั่งตามที่เขียนไว้ในคอมเมนต์ของ config):
```sh
pnpm playwright test -c playwright.screenshots.config.ts && node e2e-screenshots/build-report.mjs
```

### Docker / Deploy
- `docker-compose.dev.yml`: image `node:20-alpine`, mount `.` → `/app` พร้อม anonymous volume `/app/node_modules`, port `${APP_PORT:-8080}:3000`, command `npm run dev -- --host 0.0.0.0 --port 3000` (compose ไม่มีขั้น install dependency)
- `docker-compose.prod.yml`: ดึง `ghcr.io/mercil-pacc/a6-e-cmiswitness-protection:${IMAGE_TAG:-latest}`, expose container port 80 (host port สุ่ม)
- `Dockerfile`: multi-stage แบ่งเป็น (1) node:20-alpine + pnpm → `pnpm run build` (2) `nginx:alpine` เสิร์ฟ `/app/dist`
- `nginx.conf`: SPA fallback `try_files $uri $uri/ /index.html` และ cache `/assets/` 1 ปี (immutable) พร้อม gzip
- `wrangler.jsonc` (Cloudflare Workers static assets): name `pacc-a6`, `assets.directory: ./dist/`, `not_found_handling: single-page-application`
- `.env.example`: `APP_PORT=8080`, `IMAGE_TAG=latest`
- `.github/workflows/release-image.yml`: trigger แบบ push ถูกปิดอยู่ (`branches: [""]`, บรรทัดของ `mercil-deployment` ถูก comment ไว้) เหลือให้รันผ่าน `workflow_dispatch` เท่านั้น มี `cleanup-ghcr.yml` แยกอีกไฟล์ (README ยังเขียนว่า CI publish เมื่อ push ไป `mercil-deployment` ซึ่งไม่ตรงกับไฟล์ workflow ปัจจุบัน)

---

## 2. บทบาท (Roles)

`UserRole` (`src/types/user.ts:1-12`) + ชื่อไทยจาก `ROLE_NAMES` (`src/lib/constants.ts:39-51`)

| UserRole | ROLE_NAMES | label ใน dropdown ของ TopBar |
|---|---|---|
| `receiver` | ธุรการสำนัก/กอง | เหมือนกัน |
| `officer` | เจ้าหน้าที่ ป.ป.ท. | เหมือนกัน |
| `case_owner` | เจ้าของสำนวน | เหมือนกัน |
| `supervisor` | ผู้บังคับบัญชาชั้นต้น | เหมือนกัน |
| `director` | ผอ.สำนัก/กอง | เหมือนกัน |
| `deputy_secretary` | รองเลขาธิการ ป.ป.ท. | เหมือนกัน |
| `secretary` | เลขาธิการ ป.ป.ท. | เหมือนกัน |
| `committee` | ฝ่ายเลขานุการคณะกรรมการ ป.ป.ท. | เหมือนกัน |
| `protection` | ชุดคุ้มครอง | เหมือนกัน |
| `appeal` | นางสาววราภรณ์ นิติธรรม (เจ้าหน้าที่อุทธรณ์) | "เจ้าหน้าที่อุทธรณ์" |
| `admin` | Super Admin | เหมือนกัน |

- `CASE_WORKER_ROLES = ['officer','case_owner']` (`constants.ts:57`) สองบทบาทนี้มีสิทธิ์และเส้นทางเหมือนกัน
- `ROLE_ORG_ASSIGNMENTS` (`constants.ts:62+`) กำหนดหน่วยงานที่แต่ละบทบาทเลือกได้

### การสลับบทบาทใน UI
- **`<select>` ที่มุมขวาบนของ TopBar** (`src/components/layout/TopBar.tsx:135-154`, handler `handleRoleChange` ที่บรรทัด 52) เรียก `useAuthStore.setRole(role)` แล้ว toast "เปลี่ยนบทบาทเป็น: …"
- `setRole` (`src/store/useAuthStore.ts:40-44`) รีเซ็ต `currentOrgUnitId` ไปเป็นหน่วยแรกของบทบาทนั้นด้วย
- TopBar มี dropdown อื่นอีก 2 ตัว คือ **หน่วยงาน** (`setOrgUnitId`) และ **บัญชีผู้ปฏิบัติ** ที่แสดงเฉพาะตอนเป็น `officer`/`case_owner` (`setOfficerUserId`, รายชื่อจาก `ECMIS_USER_DIRECTORY`) บัญชีผู้ปฏิบัติมีผลกับ "คิวของฉัน" เพราะระบบกรองตามผู้ที่ถูกมอบหมาย
- ใน e2e สลับบทบาทด้วย `switchRole(page, role)` (`e2e/helpers/seed.ts`) ซึ่งเขียน `ecmis-auth-storage.state.currentRole` แล้ว reload ไม่ได้กดผ่าน UI

### สิทธิ์และเมนู (`src/lib/permissions.ts`)
- `NAV_ITEMS` (บรรทัด 33) คือเมนูทั้งหมด แบ่ง 4 กลุ่ม (`intake`/`operations`/`dispatch`/`info`) และ 2 กลุ่มย่อยที่พับได้ (`protect`/`review`)
- `COMMON_ROUTES` (บรรทัด 62) ทุกบทบาทเข้าได้: `/`, `/registry`, `/queue`, `/dossier`, `/forms`, `/form`, `/notifications`
- `ROLE_ROUTES` (บรรทัด 82-145) คือเส้นทางเพิ่มของแต่ละบทบาท เช่น receiver ได้แค่ `/intake` กับ `/delivery-tracking` ส่วน protection ได้แค่ `/protection*` ส่วน `admin: []` แต่ `canAccessRoute` ให้ admin ผ่านทุกเส้นทาง
- `canAccessRoute` (บรรทัด 156) เทียบแบบ prefix ส่วน **`/mock-state` เปิดให้ทุกบทบาทเสมอ** (บรรทัด 159)
- `getNavItemsForRole` (บรรทัด 167) = `NAV_ITEMS.filter(canAccessRoute)`
- `getNavTreeForRole` (บรรทัด 200) จัดเป็น กลุ่ม > กลุ่มย่อย > รายการ และถ้ากลุ่มย่อยเหลือรายการเดียวจะคลี่ออกเป็นรายการเดี่ยว
- Helper อื่น: `isCaseOwnedBy` (233), `isAssignedProtectionOfficer` (253), `isMyQueueCase` (270), `DOSSIER_CARD_ROLES`/`canSeeDossierCard` (284/310), `canOpenForm` (314), `canEditFormsInDossier` (322), `canSeeFormsSection` (339), `canSeeCaseAuditLog` (356), `canSeeAllForms` (371)
- **RouteGuard** (`src/components/layout/RouteGuard.tsx`) ถูกเรียกใน `AppLayout` ถ้าไม่มีสิทธิ์จะแสดงการ์ด "ไม่มีสิทธิ์เข้าถึงหน้านี้" โดยไม่ redirect อัตโนมัติ และมีลิงก์ไป `/queue/$role` กับ `/registry`
- `AppLayout` (`src/components/layout/AppLayout.tsx`) ข้าม Sidebar/TopBar/RouteGuard ทั้งหมดเมื่อ path ขึ้นต้นด้วย `/sign/`

### หน้าคิว `/queue/$role` (`src/routes/queue/$role.tsx`)
- เปิดได้เฉพาะคิวของบทบาทตัวเอง (admin เปิดได้ทุกคิว) ถ้าไม่ใช่จะแสดงการ์ดล็อก
- กรองด้วย `isMyQueueCase(role, c, currentOfficerUserId)` ก่อน แล้วกรองตาม `stage` ต่อบทบาท เช่น receiver ดู `receiver_intake`; officer ดู `officer_intake`/`staff_review`/`returned`/notice ที่ยังไม่ `deliveredAt`/protection ที่ยังไม่ `policeAckAt`; supervisor/director ดู stage ของตัวเอง รวมทั้งข้อเสนอ consent-decline, coordination และ withdrawal ที่รอชั้นตน
- ลิงก์ "คิวงานของฉัน" ใน Sidebar คือ `/queue/${currentRole}` (`Sidebar.tsx:111`)

---

## 3. Data model และ state

ทุก store ใช้ zustand `persist` กับ localStorage และทุก key ขึ้นต้นด้วย `ecmis-`

| Store | ไฟล์ | localStorage key |
|---|---|---|
| `useCaseStore` | `src/store/useCaseStore.ts` (4,593 บรรทัด) | `ecmis-case-storage-v2` (บรรทัด 4588) |
| `useAuthStore` | `src/store/useAuthStore.ts` | `ecmis-auth-storage` |
| `useFormDraftStore` | `src/store/useFormDraftStore.ts` | `ecmis-form-draft-storage-v2` (บรรทัด 514) |
| `useSignatureLinkStore` | `src/store/useSignatureLinkStore.ts` | `ecmis-signature-link-storage-v1` |
| `useAuditStore` | `src/store/useAuditStore.ts` | `ecmis-audit-storage` |
| `useNotificationStore` | `src/store/useNotificationStore.ts` | `ecmis-notifications-storage` |

### useCaseStore
- State: `cases: CaseItem[]` และ `activeCaseNo` โดย**ค่าเริ่มต้นคือ `cases: []`** ไม่มี seed data ในโค้ด (`resetToDefault` ที่บรรทัด 4583 ก็ set กลับเป็นว่าง)
- `getCase(no?)` (568) ถ้าไม่ส่ง `no` หรือหาไม่เจอจะ**คืนเคสแรก** (`cases[0]`)
- `CaseItem` (`src/types/case.ts:262`) เป็น object แบนขนาดใหญ่ ฟิลด์หลัก: `no`, `person`, `status` (ข้อความ), `stage` (**string** ไม่ใช่ enum), `owner`, `next`, `risk` (`'ต่ำ'|'ปานกลาง'|'สูง'|'วิกฤต'|'ยังไม่ประเมิน'`), `urgency`/`urgent`, `activity7State` (`pending|approved|rejected|returned|committee|article14`), ฟิลด์ลงนาม `kb6*Signed*`, `kb8*`, `kb10*`, `methodTracks`, `monthlyReports`, `extensionRequests`, `appealFolder`, `kb15`/`kb16`/`kb17`, `assignmentHistory` (timeline) ฯลฯ
- ค่า `stage` ที่ใช้อยู่ (`STAGE_LABELS`, `constants.ts:167-186`): `receiver_intake`, `officer_intake`, `director_assign`, `staff_review`, `supervisor_review`, `director_review`, `deputy_review`, `external_pending`, `notice`, `protection`, `appeal`, `method_operation`, `article14`, `termination_review`, `termination_order`, `terminated`, `transferred`, `withdrawn`
- ตัวแสดงขั้นในแฟ้ม: `STAGES` 14 หมุด + `getStageIndex` + `getCurrentStageInfo` ใน `src/components/dossier/DossierStageTracker.tsx:18/45/156`
- Enum ย่อยอื่นใน `types/case.ts`: `Kb6SignerRole` (2), `OutgoingNoticeFormNo = 8|9|10` (5), `FastTrackStep` (558), `ProtectionPhaseKind = 'TEMPORARY'|'MAIN'` (626), `ProtectionMethodNo = 1|2|3|4` (659), `ProtectionMethodStatus` (669), `Article14Step` (814), `ReviewOutcome` (871), `ConsentDeclineAction` (1040), `AppealFolderStage` (1151)
- Action สำคัญ (เลขบรรทัด = ตำแหน่ง implementation):
  - พื้นฐาน: `addCase` 574, `updateCase` 581, `logHistory` 602, `recordLockedEditAttempt` 593
  - รับเรื่อง/มอบหมาย: `linkMainCase` 610, `markMainCaseNotFound` 650, `assignOfficer` 683, `assessUrgency` 763, `screenUrgencyAtIntake` 2484
  - เดินงานตามลำดับชั้น: **`getNextStage` 817** (state machine ของเส้นทางปกติ/เร่งด่วน/revision), **`forwardCase` 838**, `returnCase` 947
  - เลขาธิการฯ: `secretaryApprove` 1043, `secretaryReject` 1110, `secretaryReturn` 1161, `assignReturnRevision` 1203
  - แจ้งผล/นำส่ง: `submitOutgoingForSignature` 1288, `signOutgoingNotice` 1414, `recordDispatch` 1493, `recordDelivery` 1544, `closeNonApprovalCase` 1772
  - อุทธรณ์: `fileAppeal` 1592, `assignAppealOfficer` 1647, `checkAppealFolder` 4335, `acceptLateAppeal` 4369, `recordAppealOpinion` 4398, `scheduleAppealAgenda` 4455, `recordAppealResolution` 4470, `recordAppealNotice` 4507
  - Fast track: `submitFastTrackForDecision` 2510, `confirmFastTrackReadiness` 2578, `returnFastTrackForRework` 2601, `approveTemporaryProtection` 2647, `denyTemporaryProtection` 2691
  - คุ้มครอง/วิธี: `recordConsent` 2781, `declineConsent` 2824, `setApprovedMethods` 3247, `setMethodStatus` 3312, `startPhase` 3374, `endEpisode` 3391
  - คบ.13: `addMonthlyReport` 1865, `signMonthlyReport` 1888, `setNextReportDue` 2071, `sendToProtectionReview` 2095
  - ทบทวน/ขยาย/ยุติ: `requestExtension` 2125, `decideExtension` 2171, `submitReviewProposal` 3550, `applyReviewOutcome` 3604, `proposeMethodChange` 3673, `recordTerminationTrigger` 3818, `decideTerminationApproval` 3957, `closeProtectionCase` 4302
- เลขคำร้องสร้างจาก `generateNextCaseNo(cases.length + 500)` (`src/routes/intake.tsx:110`, `src/lib/utils.ts:39`) รูปแบบ `WP-{ปี พ.ศ.}-{6 หลัก}` ดังนั้นคำร้องแรกของปี 2569 คือ **`WP-2569-000501`** ซึ่งเป็นเคสเดียวที่อยู่ในทุก mock state และเป็น `CASE_NO` ของ e2e ทุกไฟล์

### useAuthStore
`currentRole` (ค่าเริ่ม `'officer'`), `currentOfficerUserId` (`OFF-001`), `currentDirectorUserId` (`DIR-001`), `currentOrgUnitId` (`central-wp`), `sidebarCollapsed`, global search และ getter `getCurrentOfficerAccount`/`getOrgUnitsForRole`/`getCurrentOrgUnit`

### useFormDraftStore
- `drafts: Record<formId, Record<field, any>>`: **ร่างเก็บแยกตามเลขแบบ ไม่ได้แยกตามแฟ้ม** มี `draftCaseNo[formId]` ไว้บอกว่าร่างนั้นเป็นของแฟ้มใด และ `ensureDraftForCase` (317) จะแทนที่ร่างเมื่อเปิดแบบเดียวกันจากแฟ้มอื่น
- `locks[formId]` + `lockForm` (330) / `isFormLocked` (336) ใช้ล็อกฉบับที่ลงนามแล้ว
- `revisions[formId]` + `reviseForm` (340) เก็บ snapshot ฉบับเดิม ปลดล็อก แล้วคืนเลขเวอร์ชันใหม่ ส่วน `getFormVersion` (366) = จำนวน revisions + 1
- `signatures[key]` + `signDocument` (468), `relatedPersons`, `attachmentSets`
- `updateField` (281) และ `updateSignedField` (304): ตัวหลังยอมให้เขียนช่องความเห็นตามลำดับชั้นของ คบ.6 ได้แม้ฟอร์มถูกล็อก
- ค่าตั้งต้น `DEFAULT_KB1/2/3/6/11_DRAFT` (101-216)

### useSignatureLinkStore
`createLink({title, signerRole, defaultSignerName, target})` คืน token ส่วน `completeLink(token, name, image)` ใช้ปิดลิงก์ `target.kind` มี 4 แบบ: `formDraft` | `kb1Case` | `kb6` | `outgoingNotice`

### useAuditStore / useNotificationStore
- `addLog` เติม `device` (userAgent) และ `ipAddress: '10.0.0.1'` ให้อัตโนมัติ (WIT0837) ส่วน `getLogsByCase(caseNo)`
- `addNotification`, `markAsRead`, `markAllAsRead` และ `filterNotificationsForUser` (กรองด้วย `toUserId`, admin เห็นทั้งหมด)

---

## 4. กลไก Mock State

ไฟล์: `src/lib/mockState.ts`, `src/lib/mockDateShift.ts`, `src/routes/mock-state.tsx`, `src/mock-states/*.json` (51 ไฟล์)

### รูปแบบไฟล์ (`MockState`, `mockState.ts:3-11`)
```ts
{ name: string; description: string; to: string | null; group?: string; capturedAt?: string; localStorageData: Record<string, string> }
```
`localStorageData` คือค่า raw string ของแต่ละ key `ecmis-*` (เป็น JSON ของ zustand persist อยู่ข้างในอีกชั้น)

### การโหลด
- เข้าหน้า **`/mock-state`** โดยพิมพ์ URL เอง หรือกดจากหน้า `/flow-guide` (ไม่มีลิงก์ใน Sidebar/TopBar) ทุกบทบาทเข้าได้ทั้งสองหน้า
- ไฟล์ถูกรวมด้วย `import.meta.glob('/src/mock-states/*.json', { eager: true })` (บรรทัด 17) **จึงต้อง rebuild/HMR หลังเพิ่มไฟล์**
- ปุ่ม "โหลด state นี้" → SweetAlert ยืนยัน → `applyMockState` (บรรทัด 43) **ลบ key `ecmis-*` ทั้งหมด** แล้วเขียนค่าจากไฟล์ (ผ่าน `shiftMockDates`) → `window.open(state.to || '/mock-state', '_blank')` คือ**เปิดแท็บใหม่**

### การบันทึก state ใหม่
- ปุ่ม **"บันทึก state ปัจจุบันเป็น JSON"** ที่หัวหน้า `/mock-state` เปิด modal ให้กรอก name (บังคับ), description (ค่าตั้งต้นเป็น `[ชื่อบทบาท] [ชื่อขั้นปัจจุบัน]`) และ to (ค่าตั้งต้นเป็น `window.location.pathname` ซึ่งตอนนั้นก็คือ `/mock-state`) → `downloadMockState` ดาวน์โหลดไฟล์ `<name>.json`
- สิ่งที่ถูก capture: `captureCurrentLocalStorageData()` (ทุก key `ecmis-*`)
- **ไฟล์ที่ดาวน์โหลดจะไม่มี `capturedAt` และ `group`** ถ้าต้องการให้เลื่อนวันหรือจัดกลุ่มเอง ต้องแก้ไฟล์ด้วยมือ แล้ววางไฟล์ไว้ใน `src/mock-states/`

### การจัดกลุ่ม
`mockStateGroup` (บรรทัด 26) ใช้ `group` ถ้ามี ถ้าไม่มีจะใช้ regex จากชื่อ เช่น `Case 1.10` → "ชุด Case 1" ส่วน `groupMockStates` เรียงชื่อแบบ numeric (`localeCompare(..., { numeric: true })`)

### การเลื่อนวัน (`src/lib/mockDateShift.ts`)
`shiftMockDates(data, capturedAt, now)` หา ISO datetime เต็มรูปแบบ (`YYYY-MM-DDTHH:MM:SS(.mmm)Z`) ในทุกค่า แล้วบวก `now − capturedAt` เพื่อให้เงื่อนไขที่อิง "วันนี้" (กรอบอุทธรณ์ 30 วัน, ยอดสะสม 180 วัน) คงที่ทุกครั้งที่โหลด ถ้าไม่มี `capturedAt` หรือ delta ≤ 0 จะไม่เลื่อน ส่วน**วันที่ไทย `dd/mm/25xx` ไม่ถูกเลื่อน** มีผลเฉพาะไฟล์ที่ระบุ `capturedAt` ซึ่งตอนนี้มีแค่ Case 4.x และ 5.x

### รายการ mock state ทั้งหมด (ทุกไฟล์มีเคสเดียวคือ `WP-2569-000501`)
| name | group (แสดงผล) | description | to |
|---|---|---|---|
| Case 1 | ชุด Case 1 | [ธุรการสำนัก/กอง] [คำร้อง] | /dossier/WP-2569-000501 |
| Case 1.1 | ชุด Case 1 | [ธุรการสำนัก/กอง] [เชื่อมคดีหลัก] | /dossier/WP-2569-000501 |
| Case 1.2 | ชุด Case 1 | [ผอ.สำนัก/กอง] [มอบหมายสำนวน] | /dossier/WP-2569-000501 |
| Case 1.3 | ชุด Case 1 | [เจ้าหน้าที่ ป.ป.ท.] [จัดทำเอกสาร] | /dossier/WP-2569-000501 |
| Case 1.4 | ชุด Case 1 | [ผู้บังคับบัญชาชั้นต้น] [กลั่นกรอง] | /dossier/WP-2569-000501 |
| Case 1.5 | ชุด Case 1 | [ผอ.สำนัก/กอง] [ผอ.ลงนาม คบ.6] | /dossier/WP-2569-000501 |
| Case 1.6 | ชุด Case 1 | [รองเลขาธิการ ป.ป.ท.] [รองเลขาธิการฯ] | /dossier/WP-2569-000501 |
| Case 1.7 | ชุด Case 1 | [เลขาธิการ ป.ป.ท.] [เลขาธิการฯ] | /dossier/WP-2569-000501 |
| Case 1.8 | ชุด Case 1 | [เจ้าหน้าที่ ป.ป.ท.] [แจ้งผล/นำส่ง] | /dossier/WP-2569-000501 |
| Case 1.9 | ชุด Case 1 | [เลขาธิการ ป.ป.ท.] [แจ้งผล/นำส่ง] | /dossier/WP-2569-000501 |
| Case 1.10 | ชุด Case 1 | [เจ้าหน้าที่ ป.ป.ท.] [แจ้งผล/นำส่ง] | /dossier/WP-2569-000501 |
| Case 1.11 | ชุด Case 1 | [เจ้าหน้าที่ ป.ป.ท.] [ลงนาม คบ.11] | /dossier/WP-2569-000501 |
| Case 1.12 | ชุด Case 1 | [เจ้าหน้าที่ ป.ป.ท.] [ปฏิบัติตามวิธี (08A/08B)] | /dossier/WP-2569-000501 |
| Case 1.13 | ชุด Case 1 | [เจ้าหน้าที่ ป.ป.ท.] [ติดตาม/รายงาน คบ.13] | /dossier/WP-2569-000501 |
| Case 1.14 | ชุด Case 1 | [เจ้าหน้าที่ ป.ป.ท.] [ทบทวนผล] | /protection-review/WP-2569-000501 |
| Case 1.15 | ชุด Case 1 | [ผู้บังคับบัญชาชั้นต้น] [ขยายเวลา/เรื่องยุติ] | /dossier/WP-2569-000501 |
| Case 1.16 | ชุด Case 1 | [ผอ.สำนัก/กอง] [อนุมัติให้ยุติ] | /termination/WP-2569-000501 |
| Case 2 | ชุด Case 2 | [ผบช.ต้น][กลั่นกรอง] | /dossier/WP-2569-000501 |
| Case 2.1 | ชุด Case 2 | [ผอ][ผอ.ลงนาม คบ.6] | /dossier/WP-2569-000501 |
| Case 2.2 | ชุด Case 2 | [รองเลขาธิการฯ][กลั่นกรองก่อนเสนอ] | /dossier/WP-2569-000501 |
| Case 3 | ชุด Case 3 | [เจ้าหน้าที่ ป.ป.ท.] [เร่งด่วน: จัดทำ คบ.4 / ร่าง คบ.5] | /dossier/WP-2569-000501 |
| Case 3.1 | ชุด Case 3 | [ผอ.สำนัก/กอง] [เร่งด่วน: ตรวจ คบ.4 / ร่าง คบ.5 · WIT0606] | /dossier/WP-2569-000501 |
| Case 4 | อุทธรณ์ (09A → 09B) | [เจ้าหน้าที่ ป.ป.ท.] [ไม่อนุมัติ: ร่าง คบ.10] ตรวจครบถ้วนแล้วเสนอรองเลขาธิการฯ กลั่นกรอง → ลงนาม → นำส่ง (WIT0903–0907) | /dossier/WP-2569-000501 |
| Case 4.1 | อุทธรณ์ (09A → 09B) | [เจ้าหน้าที่ ป.ป.ท.] [อยู่ในกรอบอุทธรณ์ 30 วัน] พยานได้รับ คบ.10 แล้ว เหลือ 25 วัน: รับคำอุทธรณ์เข้าแฟ้มเดิม (WIT0908–0913) | /dossier/WP-2569-000501 |
| Case 4.2 | อุทธรณ์ (09A → 09B) | [เจ้าหน้าที่ ป.ป.ท.] [แฟ้มอุทธรณ์: รับเรื่องแล้ว] ตรวจครบถ้วน → เสนอตามลำดับชั้นจนบรรจุวาระ (WIT0914–0919) | /appeal-folder/WP-2569-000501 |
| Case 4.3 | อุทธรณ์ (09A → 09B) | [คณะกรรมการ ป.ป.ท.] [บรรจุวาระแล้ว รอวินิจฉัย] ยืนคำสั่งเดิม/เปลี่ยนเป็นอนุมัติ → หนังสือแจ้งผล (WIT0920–0922) | /appeal-folder/WP-2569-000501 |
| Case 5 | ส่งกรมคุ้มครองสิทธิและเสรีภาพ (08C · ข้อ 14) | [เจ้าหน้าที่ ป.ป.ท.] [ใกล้ครบเพดาน: สะสม 178/180 วัน] ข้อเสนอข้อ 14 → ผบช. → เลขาธิการฯ → มติ → หนังสือถึงกรม (WIT0852–0859) | /article14 |
| Case 5.1 | ส่งกรมคุ้มครองสิทธิและเสรีภาพ (08C · ข้อ 14) | [เจ้าหน้าที่ ป.ป.ท.] [ส่งหนังสือถึงกรมแล้ว] มติที่ 25/2569: ส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่ ปิด Episode เดิม (WIT0860–0863) | /article14 |
| Case 10 | ครบ 6 เดือน ยังมีภัย (11A → 08C) | [เจ้าหน้าที่ ป.ป.ท.] [ทบทวนผล: ครบเพดาน 180/180 วัน ยังมีภัย] ขยาย คบ.14 ไม่ได้ ต้องเสนอแนวทางตามข้อ 14 (WIT1107 → WIT1149) | /protection-review/WP-2569-000501 |
| Case 10.1 | ครบ 6 เดือน ยังมีภัย (11A → 08C) | [ผู้บังคับบัญชาชั้นต้น] [ตรวจผลทบทวน: ครบเพดานแต่ยังมีภัย] ตรวจข้อเสนอแนวทางข้อ 14 — เห็นชอบ / ส่งคืนแก้ไข (WIT1106, WIT1149) | /protection-review/WP-2569-000501 |
| Case 10.2 | ครบ 6 เดือน ยังมีภัย (11A → 08C) | [เจ้าหน้าที่ ป.ป.ท.] [ผบช.ชั้นต้นเห็นชอบแล้ว] กด "ดำเนินการตามแนวทางที่เห็นชอบ" ไปหน้าส่งต่อกรมคุ้มครองสิทธิฯ (/article14) ต่อจาก Case 5 (WIT1107, WIT1149 → WIT0852) | /protection-review/WP-2569-000501 |

Case 4–5.1 มี `group` และ `capturedAt: 2026-09-23T06:22:16.725Z` ส่วน Case 1–3.1 ไม่มีทั้งสองฟิลด์ Case 1 และ 1.1–1.3 มีแค่ `ecmis-auth-storage` กับ `ecmis-case-storage-v2` ไฟล์อื่นมี `ecmis-form-draft-storage-v2` ด้วย ไม่มีไฟล์ใดเก็บ audit, notification หรือ signature-link

---

## 5. Routes (`src/routes/**`)

| Path | ไฟล์ | หน้าที่ |
|---|---|---|
| `/` | `index.tsx` | redirect ไป `/registry` |
| `/registry` | `registry.tsx` | ทะเบียนคำร้องทั้งหมด ค้นหาและเปิดแฟ้ม |
| `/intake` | `intake.tsx` | รับคำร้องใหม่ (สร้าง `CaseItem` ด้วย `addCase`) |
| `/queue/$role` | `queue/$role.tsx` | คิวงานของบทบาทปัจจุบัน |
| `/dossier/$caseNo` | `dossier/$caseNo.tsx` | แฟ้มคำร้องอิเล็กทรอนิกส์ เป็นหน้าหลักที่รวมการ์ดทุกขั้น (stage tracker, forward/return, main case link, fast track, notice, protection ฯลฯ) |
| `/forms` | `forms.tsx` | แค็ตตาล็อกแบบ คบ. |
| `/form/$formId` | `form/$formId.tsx` | editor แบบ คบ. ซ้ายเป็นฟอร์ม ขวาเป็นกระดาษ A4 search params `?caseNo=&context=method4` |
| `/activity7-results` | `activity7-results.tsx` | ผลพิจารณาและคำสั่งเลขาธิการฯ (4 แขนงตาม WIT0704) |
| `/notice` | `notice.tsx` | แจ้งผลแก่พยาน (คบ.9/คบ.11 เมื่ออนุมัติ และ คบ.10 เมื่อไม่อนุมัติ) |
| `/delivery-tracking` | `delivery-tracking.tsx` | นำส่งและติดตามหนังสือ วันรับจริงเป็นจุดเริ่มนับอุทธรณ์ |
| `/appeal` | `appeal.tsx` | รายการอุทธรณ์ (คบ.10/คบ.17) รวมกลุ่มยื่นเกินกำหนด |
| `/appeal-folder/$caseNo` | `appeal-folder/$caseNo.tsx` | แฟ้มคำอุทธรณ์รายเคส (ลำดับชั้น 09B และมติคณะกรรมการ) |
| `/protection` | `protection.tsx` | ภาพรวมการคุ้มครองและติดตาม |
| `/protection-methods` | `protection-methods.tsx` | รับคำสั่ง ตรวจความยินยอม และแยกเส้นทางรายวิธีตามข้อ 15 |
| `/protection-method/$method` | `protection-method/$method.tsx` | เส้นทางปฏิบัติรายวิธี 08A-1/2/3 และ 08B (`?caseNo=`) |
| `/protection-monitor` | `protection-monitor.tsx` | แท็บ 10 รายงาน คบ.13 (`?caseNo=` ถ้าไม่ระบุและบทบาทเข้า `/protection` ได้จะ redirect ไป `/protection`) |
| `/protection-reviews` | `protection-reviews.tsx` | รายการที่ส่งทบทวน (11A) |
| `/protection-review/$caseNo` | `protection-review/$caseNo.tsx` | เลือกแนวทางทบทวนรายเคส |
| `/protection-extensions` | `protection-extensions.tsx` | รายการขยายเวลา คบ.14 (11B) |
| `/protection-extension/$caseNo` | `protection-extension/$caseNo.tsx` | ทำ/เสนอ/อนุมัติ คบ.14 รายเคส |
| `/termination` | `termination.tsx` | รายการยุติ (11C/11D) เป็น layout ที่มี `<Outlet>` |
| `/termination/$caseNo` | `termination/$caseNo.tsx` | คบ.15 → คบ.16 → คบ.17 → ปิดงาน รายเคส |
| `/article14` | `article14.tsx` | ดำเนินการตามข้อ 14 ส่งกรมคุ้มครองสิทธิฯ (08C) |
| `/reports` | `reports.tsx` | รายงานและสถิติ |
| `/notifications` | `notifications.tsx` | รายการแจ้งเตือน |
| `/sign/$token` | `sign/$token.tsx` | หน้าลงนามทางไกล ไม่มี layout และไม่ผ่าน RouteGuard |
| `/mock-state` | `mock-state.tsx` | เครื่องมือ dev/QA สำหรับโหลดและบันทึก state |
| `/flow-chart` | `flow-chart.tsx` | ผังภาพรวมข้ามแท็บ ซูม/เลื่อน/เต็มจอ/แผนที่ย่อได้ (`components/flow-guide/ZoomViewport.tsx`) กดกล่องแท็บเพื่อเปิดแผงคำอธิบายแท็บ (`?box=`, สรุปภาษาง่ายใน `TAB_SUMMARY`) และกดเส้นเพื่อเปิดแผงคำอธิบายเส้น (`?edge=`, ข้อความใน `OVERVIEW_EDGES`) จากแผงกด "เปิดผังรายขั้น" เพื่อกางผังรายขั้น WIT (`?tab=`) ซึ่งวาดจากตำแหน่งในผัง drawio (`TabStepDiagram.tsx` + `src/flow-guide/flow-diagram.json` สร้างด้วย `python3 docs/extract-flow-diagram.py`) กดขั้น WIT เพื่อเปิดแผงรายละเอียดและปุ่มเล่น (`?node=`) ส่วนผังภาพรวมตั้งตำแหน่งใน `OVERVIEW_LAYOUT` และเส้นใน `OVERVIEW_EDGES` (`FlowOverviewChart.tsx`) |
| `/flow-guide` | `flow-guide.tsx` | คู่มือเดิน flow: จับคู่ขั้น WIT ↔ หน้าจอ + ปุ่มเล่นจาก mock state (ข้อมูลจาก `src/flow-guide/flow-map.json`) |

`src/routes/__root.tsx` ใช้ `AppLayout` (Sidebar + TopBar + RouteGuard + GlobalSearchModal)

---

## 6. แบบฟอร์ม คบ.1–คบ.17

- **แค็ตตาล็อก**: `FORMS_CATALOG` (`src/lib/constants.ts:5-23`) มี `n`, `code`, `t`, `d`, `pages` ครบ 17 แบบ
- **Editor**: `src/routes/form/$formId.tsx:127-151` เลือก component ตามเลขแบบ
  - มี editor เฉพาะ: `Kb1FormEditor`, `Kb2`, `Kb3`, `Kb4`, `Kb5`, `Kb6`, `Kb7`, `Kb11`, `Kb12` (รับ `context`), `Kb13`, `Kb14`, `Kb15` (อยู่ใน `src/components/forms/`)
  - คบ.8, 9, 10, 16, 17 ใช้ `GenericKbEditor.tsx`
  - field primitives อยู่ที่ `src/components/forms/fields/FormKit.tsx`
- **กระดาษ A4 สำหรับพิมพ์**: `FormPaperViewer.tsx` (กว้าง A4 = 794px และ scale ให้พอดีคอลัมน์) → `getFormPages(formId)` ใน `src/components/forms/paper/formPages.tsx:2594` และ primitives (`FormHead`, `MemoHead`, `OrderHead`, `LetterHead`, `SignSlot`, `IdBoxes`, …) ใน `paper/PaperPrimitives.tsx` แบบที่เป็นหนังสือ/บันทึก: `LETTER_STYLE_FORMS = [4,5,6,8,9,10,16,17]` (`formPages.tsx:2592`) ค่าบนกระดาษดึงจาก draft ก่อน ถ้าไม่มีจึงใช้ข้อมูลแฟ้ม แล้วค่า fallback การพิมพ์ใช้ `window.print()` (`form/$formId.tsx:76`) และจะถูกบล็อกถ้า `isPrivacyBlocked(..., 'print')` พร้อมเขียน audit log
- `FormPreviewModal.tsx`, `FormFilesPanel.tsx` คือ preview และไฟล์แนบของแบบ
- **ลายมือชื่อ** (`src/lib/formSignature.ts`) เป็นแหล่งความจริงเดียวว่าแบบไหนลงนามอย่างไร
  - `SIGNABLE_FORMS = [6, 8, 9, 10, 11, 13]` (155), `getFormSignatureKind` (157) → `'kb6'|'outgoing'|'kb11'|'kb13'`
  - `KB6_SIGNERS` (32) คือข้อ 10–13 ของ คบ.6 (supervisor → director → deputy → secretary) พร้อม `opinionField` ที่ต้องกรอกก่อนลงนาม ส่วน `canEditKb6Opinion` (223) กันการแก้ข้ามชั้น และ `mockApi.saveKb6Opinions` คืน 403 จำลอง
  - `OUTGOING_NOTICES` (95) ใช้กับ คบ.8/9/10, `KB11_SIGN_SLOTS` (122), `KB13_SIGN_SLOTS` (133), `kb11Gate` (207), `canSignFormNow` (237), `isFormFullySigned` (297)
  - UI: `src/components/common/SignatureModal.tsx` (ชื่อ, checkbox รับรอง, `SignaturePad`, ช่อง `opinion` ตามต้องการ, ปุ่ม `onGenerateLink` สำหรับลิงก์เซ็นทางไกล) และ `forms/FormSignatureModal.tsx`, `Kb6SignatureActions`, `Kb11SignatureActions`, `Kb13SignatureActions`, `OutgoingNoticeSignature`
  - **ลิงก์เซ็นทางไกล**: `useSignatureLinkStore.createLink` → `${origin}/sign/${token}` (สร้างได้จาก Kb1FormEditor, Kb6SignatureActions, Kb11SignatureActions, OutgoingNoticeSignature, ForwardWorkflowCard) หน้า `/sign/$token` เรียก `completeLink` แล้ว apply ผลตาม `target.kind` (`confirmKb1Signature` / `signKb6` / `signOutgoingNotice` / `signDocument`)
- **เวอร์ชันและการล็อก**: `lockForm` ถูกเรียกหลังลงนามใน คบ.3, คบ.5 (FastTrackCard), คบ.6, คบ.8 (GenericKbEditor) และ คบ.11 ถ้าพยายามแก้ฉบับที่ล็อก จะเรียก `useCaseStore.recordLockedEditAttempt` (WIT0611) เมื่อถูกตีกลับให้ `reviseForm` ทำ snapshot แล้วขึ้นเวอร์ชันใหม่ ส่วนชุดเสนอ คบ.3/คบ.6 ใช้ `PROPOSAL_SET_FORMS = [3, 6]` + `reviseProposalSet` (`useCaseStore.ts:73-84`) และฝั่งแฟ้มเก็บ `kb3Version`/`kb8Version`/`kb*PreviousVersions` UI ดูประวัติคือ `src/components/common/VersionHistory.tsx`
- Prefill: `src/lib/formPrefill.ts` (`buildKb1Seed` ตั้งต้น คบ.1 จากข้อมูลแฟ้มหรือร่าง คบ.2 ที่แก้แล้วของแฟ้มเดียวกัน และ `buildSeedForCase`)

---

## 7. Domain logic ใน `src/lib`

| ไฟล์ | สรุป |
|---|---|
| `episode.ts` | Episode/Phase ที่ TEMPORARY (คบ.5) กับ MAIN อยู่ใน Episode เดียวกัน นับวันสะสมต่อเนื่องไม่รีเซ็ต เพดานรวม `PROTECTION_TOTAL_CAP_DAYS = 180` ฟังก์ชันหลัก: `cumulativeDays` (91), `remainingDays` (97), `isAtCap` (102), `checkExtension` (150, ห้ามทำ คบ.14 เมื่อถึงเพดาน WIT1150), `checkTemporaryDuration` (166), `summarizeEpisode` (217), `deriveEpisode` (236), `NEAR_CAP_WINDOW_DAYS = 30` |
| `fastTrack.ts` | เส้นทางเร่งด่วน คบ.4/คบ.5 (sheet 06): `isFastTrackCase` (16), `fastTrackStep` (20), `submitFastTrackGate` (46, ต้องเลือกวิธีข้อ 15 ≥ 1), `temporaryDurationCheck` (70), `fastTrackReviewItems` (83) คำร้องหลักยังเดินต่อเสมอ |
| `kb13.ts` | รอบรายงาน คบ.13 (แท็บ 10) อนุมานจาก `monthlyReports`: `openKb13Round` (33), `compareKb13Methods` (59), `kb13DueStatus` (82, ถึงรอบเมื่อเหลือ ≤ 7 วัน), `needsReview` (98), `getKb13Progress` (112) |
| `methodProgress.ts` | ความคืบหน้ารายวิธี 08A-1/2/3/08B: `method1Gate` (72, ต้องลงนาม คบ.8 หรือมี คบ.5 อนุมัติ), `wizardSectionCount` (158), `getMethodProgress` (181), `methodStartBlocker` (223) |
| `terminationProgress.ts` | ขั้นยุติ 11C→11D อนุมานจาก `terminationTrigger`/`kb15`/`terminationApproval`/`kb16`/`kb17`/`closedAt` (`getTerminationProgress` 20) และ `evaluateCloseGuard` (90) ที่ปิดงานได้เมื่อพ้นกรอบอุทธรณ์ 30 วันและไม่มีงานค้าง |
| `privacyGuard.ts` | มาตรการปกปิดตามข้อ 15(3): `isPrivacyBlocked(case, role, 'search'|'download'|'print'|'forward')` (48) โดย `officer`/`case_owner`/`admin` ไม่ถูกบล็อกเสมอ (`PRIVACY_MINIMUM_ROLES` 33) |
| `auditTrail.ts` | `classifyAuditAction` (31) จัดหมวดจากข้อความ action, `buildUnifiedAuditTimeline` (60) รวม `assignmentHistory` กับ access log, `buildAuditCsv` (94, CSV มี UTF-8 BOM) |
| อื่น ๆ | `permissions.ts` (หัวข้อ 2), `formSignature.ts` (หัวข้อ 6), `constants.ts` (catalog, org units, user directory, stage labels, `APPEAL_WINDOW_DAYS = 30`, `PROTECTION_MAX_DAYS = 60`, `PROTECTION_DEFAULT_DAYS = 30`), `utils.ts` (วันที่ไทย, `nowDisplay`, `generateNextCaseNo`, `parseAnyDate`), `fileValidation.ts` (ไฟล์แนบ ≤ 20MB), `swal.ts` (`MySwal`, `showToast`), `imageResize.ts`, `mockApi.ts` |

---

## 8. Tests

### Unit (vitest)
19 ไฟล์ ครอบคลุม `episode`, `kb13`, `methodProgress`, `mockDateShift`, `navigation`, `permissions`, `utils`, `useCaseStore` และ component (Sidebar, Button, FileManager, SignaturePad, FormPaperViewer, PaperPrimitives, Kb6*, SkipKb3Button, ReviewBranchModal)

### E2E (`e2e/`, config `playwright.config.ts`) มี `test(` ราว 209 จุด
```
e2e/
├── helpers/seed.ts      # seedMockState / loadMockState / readCase / switchRole
├── sheets/              # 20 ไฟล์ ไล่ตาม sheet ของผัง User Flow (sheet02 … sheet11d)
├── flows/               # ข้ามโมดูล: e2e-cross-module, mock-states-appeal-article14, wit0510-director-direct-return, wit0606-fast-track-temporary-protection
└── feedback/            # 5 ไฟล์ตาม feedback ผู้ใช้ (fb1–fb5, kb4, kb6)
```
**`e2e/helpers/seed.ts`**
- `loadMockState(name)` อ่าน `src/mock-states/<name>.json`
- `seedMockState(page, name, role?, casePatch?)` ทำ `shiftMockDates` ก่อน ถ้ามี `role` จะแก้ `ecmis-auth-storage.state.currentRole` ถ้ามี `casePatch` จะ merge เข้า**เคสแรก**ใน `ecmis-case-storage-v2` แล้ว `page.addInitScript` ลบ `ecmis-*` เดิมและเขียนค่าใหม่ **ครั้งเดียว** (ใช้ flag `__e2e_seeded` ใน localStorage เพื่อไม่ให้ reload กลางเทสต์ล้างผล) ต้องเรียก**ก่อน** `page.goto`
- `readCase(page, caseNo)` อ่าน case จาก localStorage เพื่อ assert
- `switchRole(page, role)` เพิ่ม init script แก้ role แล้ว `page.reload()`

### ชุดภาพหน้าจอ (`e2e-screenshots/`, config `playwright.screenshots.config.ts`)
- `shot.ts` → `createRecorder(page, scenario, initialRole)` คืน `{ shot, asRole, confirm, save }`
  - `scenario = { id, flow: 'appeal' | 'article14', order, title, summary, testRef }`
  - สร้างโฟลเดอร์ใหม่ `e2e-screenshots/output/<id>/` (ลบของเดิมก่อน)
  - `shot(title, detail = '', focus?: Locator, block = 'center')` จะ scroll `focus` เข้ากลางจอ (ถ้าระบุ) รอ 450ms แล้วถ่าย**เฉพาะ viewport** เป็น `NN.png` (01, 02, …) จากนั้น push step และเขียน `steps.json` ทันที
  - `asRole(role, url?)` เรียก `switchRole` แล้วไป `url` ถ้าระบุ แล้วรอ `networkidle` โดย role ของ step ถัดไปจะเปลี่ยนตาม
  - `confirm(buttonName, title, detail = '', resultFocus?)` รอ `.swal2-popup:not(.swal2-toast)` ถ่าย `"จอยืนยัน — {title}"` กดปุ่มชื่อ `buttonName` (exact) รอ dialog หาย แล้วถ่าย `"ผลลัพธ์ — {title}"`
  - `fieldAfterLabel(scope, labelText)` หา input ที่เป็น sibling ถัดจาก label
  - `ROLE_LABELS` แปลง role เป็นป้ายไทย เฉพาะ officer, supervisor, deputy_secretary, secretary, committee ถ้าเป็น role อื่นจะแสดง key ดิบ
- **รูปแบบ `steps.json`**
  ```json
  {
    "id": "appeal-1-kb10-notice", "flow": "appeal", "order": 1,
    "title": "…", "summary": "…", "testRef": "e2e/sheets/sheet09a-non-approval.spec.ts · TC-101",
    "steps": [ { "n": 1, "title": "…", "detail": "…", "role": "เจ้าหน้าที่", "file": "01.png" } ]
  }
  ```
- Spec ที่มีอยู่: `appeal.spec.ts` (A1–A5) และ `article14.spec.ts` (B1–B2) ทั้งสองใช้ `seedMockState(page, 'Case 1.8' | 'Case 1.12', role, <casePatch>)` เพื่อตั้งต้นสถานะเอง ไม่ได้โหลด Case 4/5
- `build-report.mjs` อ่านทุก `output/*/steps.json` เรียงตาม flow (appeal ก่อน) แล้วตาม `order` แล้วเขียน `output/index.html` (มี lightbox) โดยใช้ step ที่ `title` ขึ้นต้นด้วย `จอยืนยัน` หรือ `ผลลัพธ์` เป็นประเภทการ์ด ส่วนตัวอักษรนำหน้าคือ `appeal → A` และอย่างอื่นเป็น `B`
- **การเพิ่มสถานการณ์ใหม่**: ถ้าอยู่ใน flow เดิม ให้เพิ่ม `test(...)` ใน spec เดิมหรือไฟล์ `*.spec.ts` ใหม่ใน `e2e-screenshots/` แล้วใช้ `createRecorder` กับ `id` ที่ไม่ซ้ำและ `order` ถัดไป ถ้าต้องการ **flow ใหม่** ต้องแก้ 3 จุด คือ union type `flow` ใน `shot.ts`, object `FLOWS` ใน `build-report.mjs` และการเลือกตัวอักษร (`key === 'appeal' ? 'A' : 'B'`) กับ sort ใน `build-report.mjs` ถ้า role ใหม่ต้องการป้ายไทยให้เพิ่มใน `ROLE_LABELS`
- `e2e-screenshots/output/` (PNG + index.html) **ถูก commit เข้า git** ส่วน `test-results/` ถูก ignore

---

## 9. Known gaps (จาก `context/`)

- **`context/gap-analysis-reject-flow.md`** เป็นการตรวจ branch ไม่อนุมัติ/ปฏิเสธ/ตีกลับเทียบผัง `context/user-flow/User_Flow_Activity_6_Redesign_v5_A4_Tab_02.drawio` สรุปว่า "ขาดทั้งหมด 3 · บางส่วน 6 · ครบ 18" พร้อมแผนลำดับ 1–5 (09A ให้ครบ, ลำดับชั้นแฟ้มอุทธรณ์ 09B, ทิศทางส่งกลับ WIT0510/0511/0708/0709, WIT0812/0845/0713) **แต่เอกสารนี้ล้าสมัยแล้วบางส่วน** ตรวจในโค้ดพบว่า `closeNonApprovalCase` (useCaseStore:1772), ขั้นกลั่นกรอง คบ.10 (`Kb10ScreeningCard`, test-id `kb10-deputy-note`), `checkAppealFolder`/`acceptLateAppeal`, กลุ่ม `lateAppeals` ใน `appeal.tsx`, guard WIT0709/WIT0511 ใน `getNextStage`, `ConsentDeclineCard` ที่เลือก `proposedAction` ได้ และ `AppealNoticeCard` ที่แสดง `noticeRegistryNo` มีอยู่แล้วทั้งหมด
- **`context/missing-flow-detail.md`** เป็นเอกสารใหม่กว่าและใช้แทนฉบับบน ระบุว่าไล่ผังครบ 227 node แล้ว **"ไม่มีจุดค้างเหลือ"** ทุก sheet (02–11D) ปิดครบ ภาคผนวกมีตารางยืนยันรายการ WIT ที่แก้แล้ว ข้อจำกัดที่เอกสารระบุเองคือ WIT0845 ทำเฉพาะแขนง "ประสานหน่วยงานใหม่" ไม่ได้ทำแขนง "แนวทางใหม่"
- `context/test-case/E2E_Test_Cases_Activity6_Witness_Protection.xlsx` (+ `user-feedback/`) คือชุด test case ต้นทาง ซึ่งอ้างอิงด้วยรหัส TC-xxx/WITxxxx ในคอมเมนต์ของโค้ดและ spec

---

## 10. Gotchas สำหรับผู้มาใหม่

1. **เปิดครั้งแรกจะไม่มีข้อมูล** เพราะ `cases: []` ทะเบียนจึงว่าง ต้องรับคำร้องใหม่ที่ `/intake` (ต้องเป็นบทบาทที่เข้าได้) หรือไปที่ **`/mock-state`** (พิมพ์ URL เอง เพราะไม่มีเมนู) แล้วโหลด state
2. **การรีเซ็ต**: คลิก**โลโก้/หัว Sidebar "E-CMIS"** (`Sidebar.tsx:113-131`) แล้ว confirm ระบบจะเรียก `localStorage.clear()` (ล้างทุก key ไม่ใช่แค่ `ecmis-*`) แล้ว reload ซึ่งกดโดนได้ง่ายโดยไม่ตั้งใจ
3. **โหลด mock state แล้วจะเปิดแท็บใหม่** (`window.open(..., '_blank')`) แท็บเดิมยังค้าง state ในหน่วยความจำ ถ้าแท็บเดิมมีการเขียน store ต่อ อาจทับค่าที่เพิ่งโหลดได้
4. **ทุกอย่างอยู่ใน localStorage ของเบราว์เซอร์เดียว** ลิงก์ `/sign/$token` จึงใช้ได้เฉพาะในเบราว์เซอร์/โปรไฟล์เดียวกับที่สร้างลิงก์เท่านั้น ข้อมูลไม่แชร์ข้ามเครื่องหรือข้ามผู้ใช้
5. **การสลับบทบาทไม่ย้ายหน้า** ถ้าบทบาทใหม่ไม่มีสิทธิ์ในหน้าปัจจุบันจะเห็นการ์ด "ไม่มีสิทธิ์เข้าถึงหน้านี้" (ไม่ redirect) ส่วน `/queue/$role` เปิดได้เฉพาะ role ของตัวเอง และสำหรับ officer/case_owner ต้องเลือก**บัญชีผู้ปฏิบัติ**ให้ตรงกับผู้ที่ถูกมอบหมาย ไม่เช่นนั้นเคสจะไม่ขึ้นคิว (`isMyQueueCase`)
6. **วันที่**: ระบบใช้วันที่สองแบบ คือ ISO (ใช้คำนวณ) และไทย `dd/mm/25xx HH:MM` (แสดงผล จาก `nowDisplay`) โดย `shiftMockDates` เลื่อนเฉพาะ ISO และเฉพาะไฟล์ที่มี `capturedAt` (Case 4.x/5.x) ส่วน Case 1–3.x ไม่มี `capturedAt` ยิ่งเวลาผ่านไป เงื่อนไขที่อิงวันนี้ (รอบ คบ.13, กรอบอุทธรณ์, วันสะสม) ก็จะเพี้ยนไปเรื่อย ๆ ไฟล์ที่ดาวน์โหลดจากปุ่ม "บันทึก state" ก็ไม่มี `capturedAt` ต้องเติมเอง ส่วน e2e ปัก timezone `Asia/Bangkok` และ locale `th-TH`
7. **`src/routeTree.gen.ts` เป็นไฟล์ที่ generate และ commit อยู่ใน git** ห้ามแก้เอง ปลั๊กอิน Vite จะสร้างใหม่ตอน `dev` และ `build` รัน `tsr generate` ถ้าเพิ่มหรือเปลี่ยนชื่อ route แล้ว type ของ `Link`/`createFileRoute` error ให้รัน dev หรือ `pnpm tsr generate`
8. **เพิ่มเส้นทางใหม่ต้องเพิ่มสิทธิ์ด้วย** ต้องใส่ path ใน `ROLE_ROUTES` หรือ `COMMON_ROUTES` ของ `permissions.ts` (และ `NAV_ITEMS` ถ้าต้องการเมนู) ไม่เช่นนั้น RouteGuard จะบล็อกทุกบทบาทยกเว้น admin ระวัง path เอกพจน์/พหูพจน์ (`/protection-method` กับ `/protection-methods`) ที่ต้องระบุแยกกัน
9. **ร่างแบบ คบ. เก็บตามเลขแบบ ไม่ใช่ตามแฟ้ม** (`drafts[formId]`) ถ้าเปิดแบบเดียวกันจากแฟ้มอื่น `ensureDraftForCase` จะแทนที่ร่าง และ `lock`/`revisions` ก็เก็บตาม formId เช่นกัน
10. **`getCase()` คืนเคสแรกเมื่อหาไม่เจอ** และ `seedMockState(casePatch)` ก็ patch เคสแรกเสมอ ถ้าในอนาคตมีหลายเคสใน mock state ต้องระวังเรื่องนี้
11. **`stage` เป็น string อิสระ** ไม่มี union type TypeScript จึงจับการสะกดผิดไม่ได้ ให้ยึด `STAGE_LABELS` เป็นรายการอ้างอิง
12. **พอร์ต**: dev = 3000, Playwright ทั้งสองชุด = 5174 (strictPort, ชุดหลัก reuse server เมื่อไม่ใช่ CI) และ docker dev ใช้ host 8080
13. **mock state ถูก bundle ตอน build** (`import.meta.glob` eager) ไฟล์ JSON ขนาดใหญ่จึงเพิ่มขนาด bundle ของ production ด้วย และเพิ่มไฟล์ใหม่แล้วต้องให้ Vite เห็นไฟล์ก่อน
14. **CI release ปิดอยู่** (`branches: [""]`) ต้องกดรันด้วย `workflow_dispatch` เอง
