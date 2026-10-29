import type { EcmisUser } from '../types/user'
import type { RoleSet } from './roleSets'

/** ชื่อ/ตำแหน่งของผู้ใช้แต่ละรหัส ณ ตอนที่ mock state ถูกบันทึก */
export type CapturedUsers = Record<string, { name: string; position: string }>

export function capturedUsersFor(set: RoleSet): CapturedUsers {
  const out: CapturedUsers = {}
  set.users.forEach((u) => {
    out[u.id] = { name: u.name, position: u.position }
  })
  return out
}

/** ชื่อสั้นกว่านี้ไม่ถูกใช้แทนที่ (กัน substring ชนข้อความทั่วไป) */
const MIN_NAME_LENGTH = 4
/** ตำแหน่งที่เป็นของคนเดียวและยาวพอ แทนแบบ substring ได้ (เช่น "X (เลขาธิการคณะกรรมการ ป.ป.ท.)") */
const MIN_SUBSTRING_POSITION_LENGTH = 8
const GOT_PREFIX = 'GOT-'

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const validName = (v: unknown) => (typeof v === 'string' && v.trim().length >= MIN_NAME_LENGTH ? v : undefined)
const validPosition = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)

/** คืน capturedUsers ที่ใช้ได้ — ไม่ใช่ object ธรรมดา = ใช้ fallback (ชื่อตั้งต้น) */
export function resolveCapturedUsers(candidate: unknown, fallback: CapturedUsers): CapturedUsers {
  return isPlainObject(candidate) ? (candidate as CapturedUsers) : fallback
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const idRegExp = (id: string) => new RegExp(`(?<![A-Za-z0-9-])${escapeRegExp(id)}(?![A-Za-z0-9-])`)

interface PositionOwner {
  id: string
  name?: string
  to: string
}

interface Plan {
  /** ชื่อ/ตำแหน่งเดิมที่เปลี่ยนจริง (ใช้กรองค่าที่ไม่เกี่ยวข้องโดยไม่ต้อง parse) */
  needles: string[]
  regex: RegExp
  /** สตริงเดิม → ใหม่ (ชื่อที่ไม่กำกวม รวมถึงชื่อที่ไม่เปลี่ยน และตำแหน่งของคนเดียวที่ยาวพอ) */
  freeSubs: Map<string, string>
  /** ชื่อเดิมที่หลายรหัสใช้ร่วมกันและเปลี่ยนไม่เหมือนกัน: ชื่อเดิม → (รหัส → ชื่อใหม่) ตามลำดับรหัสใน from */
  ambiguousNames: Map<string, Map<string, string>>
  ambiguousIds: Set<string>
  /** รหัสที่ไม่ใช่ GOT ซึ่งอยู่ในกลุ่มกำกวม — ใช้ตรวจว่าค่านั้นมีรหัสชุดเดิม (legacy) หรือไม่ */
  legacyIdRegexes: RegExp[]
  /** ตำแหน่งเดิม (exact-match) → เจ้าของที่ตำแหน่งเปลี่ยน */
  positions: Map<string, PositionOwner[]>
  uniquePositions: Set<string>
}

function buildPlan(rawFrom: CapturedUsers, to: EcmisUser[]): Plan | null {
  // ตรวจ capturedUsers: ข้ามรายการ/ฟิลด์ที่ไม่ใช่ string ที่ใช้ได้ (ชื่อต้องยาว >= MIN_NAME_LENGTH)
  const from = new Map<string, { name?: string; position?: string }>()
  Object.entries(isPlainObject(rawFrom) ? rawFrom : {}).forEach(([id, u]) => {
    if (!isPlainObject(u)) return
    from.set(id, { name: validName(u.name), position: validPosition(u.position) })
  })
  const toById = new Map(to.map((u) => [u.id, u]))
  const idsByName = new Map<string, string[]>()
  const idsByPosition = new Map<string, string[]>()
  from.forEach((u, id) => {
    if (u.name) idsByName.set(u.name, [...(idsByName.get(u.name) ?? []), id])
    if (u.position) idsByPosition.set(u.position, [...(idsByPosition.get(u.position) ?? []), id])
  })

  const newName = (id: string) => {
    const n = toById.get(id)?.name
    return typeof n === 'string' && n.trim() ? n : from.get(id)!.name!
  }
  const newPosition = (id: string) => {
    const p = toById.get(id)?.position
    return typeof p === 'string' && p.trim() ? p : from.get(id)!.position!
  }

  let changed = false
  const needles: string[] = []
  const freeSubs = new Map<string, string>()
  const ambiguousNames = new Map<string, Map<string, string>>()
  idsByName.forEach((ids, oldName) => {
    const targets = ids.map(newName)
    if (targets.every((t) => t === oldName)) {
      freeSubs.set(oldName, oldName) // ไม่เปลี่ยน — เก็บไว้กันชื่อสั้นไปชนส่วนของชื่อยาว
    } else if (targets.every((t) => t === targets[0])) {
      freeSubs.set(oldName, targets[0])
      needles.push(oldName)
      changed = true
    } else {
      ambiguousNames.set(oldName, new Map(ids.map((id, i) => [id, targets[i]])))
      needles.push(oldName)
      changed = true
    }
  })

  const positions = new Map<string, PositionOwner[]>()
  const uniquePositions = new Set<string>()
  idsByPosition.forEach((ids, oldPos) => {
    // เก็บเฉพาะเจ้าของที่ตำแหน่งเปลี่ยน — เจ้าของที่ไม่เปลี่ยนไม่มีอะไรต้องแทน
    const owners = ids
      .filter((id) => newPosition(id) !== oldPos)
      .map((id) => ({ id, name: from.get(id)!.name, to: newPosition(id) }))
    if (!owners.length) return
    positions.set(oldPos, owners)
    needles.push(oldPos)
    changed = true
    if (ids.length === 1) {
      uniquePositions.add(oldPos)
      if (oldPos.length >= MIN_SUBSTRING_POSITION_LENGTH && !freeSubs.has(oldPos)) freeSubs.set(oldPos, owners[0].to)
    }
  })

  if (!changed) return null
  // ตำแหน่งอื่นที่ยาวพอ (ไม่เปลี่ยน หรือใช้ร่วมกัน) ใส่เป็น identity เพื่อให้ longest-first ปกป้องไม่ให้ตำแหน่งสั้นที่เปลี่ยน
  // ไปแทนที่ส่วนท้ายของตำแหน่งยาวกว่า (เช่น "เลขาธิการ..." ใน "รองเลขาธิการ...")
  idsByPosition.forEach((_, pos) => {
    if (pos.length >= MIN_SUBSTRING_POSITION_LENGTH && !freeSubs.has(pos)) freeSubs.set(pos, pos)
  })
  const ambiguousIds = new Set<string>()
  ambiguousNames.forEach((byId) => byId.forEach((_, id) => ambiguousIds.add(id)))
  const keys = [...freeSubs.keys(), ...ambiguousNames.keys()].sort((a, b) => b.length - a.length)
  return {
    needles,
    regex: new RegExp(keys.map(escapeRegExp).join('|'), 'g'),
    freeSubs,
    ambiguousNames,
    ambiguousIds,
    legacyIdRegexes: [...ambiguousIds].filter((id) => !id.startsWith(GOT_PREFIX)).map(idRegExp),
    positions,
    uniquePositions,
  }
}

/** บริบทที่ส่งลงไปตามต้นไม้: รหัสผู้ใช้ของ ancestor (ใกล้สุดก่อน), อยู่ในขอบเขต กอท. หรือไม่, ค่านี้มีรหัสชุดเดิมหรือไม่ */
interface Ctx {
  ids: Array<Set<string>>
  got: boolean
  legacy: boolean
}

/** ขอบเขต กอท. ตามแบบเดียวกับ mockStateAccounts: action มี 'กอท.' หรือ actorRole ขึ้นต้น got_ */
function isGotScope(obj: Record<string, unknown>): boolean {
  if (typeof obj.action === 'string' && obj.action.includes('กอท.')) return true
  return typeof obj.actorRole === 'string' && obj.actorRole.startsWith('got_')
}

/** ฟิลด์ชื่อที่คู่กับรหัส กอท. หรือเป็น owner ของแฟ้มที่ส่งต่อ กอท. */
function isGotNameField(obj: Record<string, unknown>, key: string): boolean {
  const idKeys = [`${key}UserId`, key.replace(/Name$/, 'UserId'), key.replace(/Name$/, 'Id')]
  if (idKeys.some((k) => k !== key && typeof obj[k] === 'string' && (obj[k] as string).startsWith(GOT_PREFIX))) return true
  if (key === 'owner') {
    const handoff = obj.protectionHandoff as { destination?: string } | undefined
    return handoff?.destination === 'got' || Boolean(obj.gotRevision)
  }
  return false
}

const stringsOf = (values: unknown[]) => values.filter((v): v is string => typeof v === 'string')

function childCtx(strings: string[], plan: Plan, ctx: Ctx, got: boolean): Ctx {
  const ids = strings.filter((s) => plan.ambiguousIds.has(s))
  return { ids: ids.length ? [new Set(ids), ...ctx.ids] : ctx.ids, got, legacy: ctx.legacy }
}

function transform(node: unknown, key: string | null, plan: Plan, ctx: Ctx, parent: Record<string, unknown> | null, siblings: Set<string>): unknown {
  if (typeof node === 'string') return mapString(node, key, plan, ctx, parent, siblings)
  if (Array.isArray(node)) {
    const strs = stringsOf(node)
    const sib = new Set(strs)
    const inner = childCtx(strs, plan, ctx, ctx.got)
    return node.map((v) => transform(v, null, plan, inner, null, sib))
  }
  if (!isPlainObject(node)) return node
  const sib = new Set(stringsOf(Object.values(node)))
  const inner = childCtx([...sib], plan, ctx, ctx.got || isGotScope(node))
  return Object.fromEntries(
    Object.entries(node).map(([k, v]) => [k, transform(v, k, plan, k === 'gotRevision' ? { ...inner, got: true } : inner, node, sib)])
  )
}

/**
 * เลือกชื่อใหม่ของชื่อที่กำกวม (เช่น GOT-OFF-001 กับ OFF-001 ใช้ชื่อเดิมเดียวกัน) ตามลำดับ:
 * 1. รหัสพี่น้องใน object เดียวกัน (ถ้ามีหลายรหัส ใช้รหัสในฟิลด์ที่คู่กับ key ของชื่อ เช่น ownerName↔ownerUserId ไม่เช่นนั้นรหัสแรกตามลำดับใน from)
 * 2. รหัสของ ancestor ใกล้สุดที่มีรหัสในกลุ่มนี้
 * 3. อยู่ในขอบเขต กอท. → รหัส GOT-
 * 4. fallback ระดับค่า localStorage: ไม่มีรหัสชุดเดิม (OFF-001 ฯลฯ) ในค่านี้ → รหัส GOT- ไม่เช่นนั้นรหัสชุดเดิม
 */
function pickAmbiguous(byId: Map<string, string>, key: string | null, parent: Record<string, unknown> | null, siblings: Set<string>, ctx: Ctx, nameGot: boolean): string {
  const ids = [...byId.keys()]
  const direct = ids.filter((id) => siblings.has(id))
  if (direct.length) {
    if (direct.length > 1 && key && parent) {
      const idKeys = [`${key}UserId`, key.replace(/Name$/, 'UserId'), key.replace(/Name$/, 'Id')]
      const paired = direct.find((id) => idKeys.some((k) => k !== key && parent[k] === id))
      if (paired) return byId.get(paired)!
    }
    return byId.get(direct[0])!
  }
  for (const set of ctx.ids) {
    const hit = ids.find((id) => set.has(id))
    if (hit) return byId.get(hit)!
  }
  const gotId = ids.find((id) => id.startsWith(GOT_PREFIX))
  const legacyId = ids.find((id) => !id.startsWith(GOT_PREFIX))
  const preferGot = ctx.got || nameGot || !ctx.legacy
  return byId.get((preferGot ? gotId ?? legacyId : legacyId ?? gotId)!)!
}

function mapString(s: string, key: string | null, plan: Plan, ctx: Ctx, parent: Record<string, unknown> | null, siblings: Set<string>): string {
  const owners = plan.positions.get(s)
  if (owners) {
    const owner = plan.uniquePositions.has(s) ? owners[0] : owners.find((o) => siblings.has(o.id) || (o.name !== undefined && siblings.has(o.name)))
    if (owner) return owner.to
  }
  const nameGot = key !== null && parent !== null && isGotNameField(parent, key)
  return s.replace(plan.regex, (m) => {
    const free = plan.freeSubs.get(m)
    if (free !== undefined) return free
    const byId = plan.ambiguousNames.get(m)
    return byId ? pickAmbiguous(byId, key, parent, siblings, ctx, nameGot) : m
  })
}

/**
 * แปลงชื่อ/ตำแหน่งผู้ใช้ที่ฝังอยู่ในค่า localStorage ของ mock state จากชุดที่บันทึกไว้ (from) เป็นชุดที่ใช้อยู่ (to)
 * - แต่ละค่า parse เป็น JSON แล้วแทนทุก string (ทุกตำแหน่ง รวมสมาชิก array และราก) ไม่แตะ key
 *   ค่าที่ไม่ใช่ JSON หรือไม่เปลี่ยนคงเดิมทุกไบต์ · ค่าที่เปลี่ยนจะถูก serialise ใหม่แบบ compact (JSON.stringify)
 * - ชื่อ: แทนแบบ substring (ชื่อยาวก่อน, single-pass จึงสลับชื่อกันได้โดยไม่ต่อเนื่อง) · ชื่อสั้นกว่า 4 ตัวอักษรไม่ถูกใช้
 * - ชื่อที่หลายรหัสใช้ร่วมกันและเปลี่ยนไม่เหมือนกัน (เช่น GOT-OFF-001 กับ OFF-001): เลือกรหัสตาม pickAmbiguous
 * - ตำแหน่ง: แทนเมื่อ string ตรงทั้งค่า และเป็นตำแหน่งของคนเดียว หรือ object เดียวกันมีรหัส/ชื่อเดิมของเจ้าของ
 *   ตำแหน่งของคนเดียวที่ยาว >= 8 ตัวอักษรแทนแบบ substring ได้ด้วย
 */
export function remapMockStateUserNames(
  localStorageData: Record<string, string>,
  from: CapturedUsers,
  to: EcmisUser[]
): Record<string, string> {
  const plan = buildPlan(from, to)
  if (!plan) return localStorageData

  return Object.fromEntries(
    Object.entries(localStorageData).map(([key, value]) => {
      if (typeof value !== 'string' || !plan.needles.some((n) => value.includes(n))) return [key, value]
      let parsed: unknown
      try {
        parsed = JSON.parse(value)
      } catch {
        return [key, value]
      }
      const ctx: Ctx = { ids: [], got: false, legacy: plan.legacyIdRegexes.some((re) => re.test(value)) }
      const next = JSON.stringify(transform(parsed, null, plan, ctx, null, new Set()))
      return [key, next !== JSON.stringify(parsed) ? next : value]
    })
  )
}
