import type { Director } from './director'

/** สคริปต์ของหนึ่งจุดพัก — คีย์คือชื่อ mock state ใน flow-map.json (เช่น 'Case 1.4') */
export interface CheckpointScript {
  /** 1–2 ประโยคบนฉากคั่น/ป้ายขั้น: บทบาทนี้ทำอะไรในขั้นนี้ */
  detail: string
  /** เปิดหน้าอื่นแทน `to` ของ mock state (เช่น หน้าคิวงาน) */
  path?: string
  /** การกระทำบนหน้าจอ — ใช้ d.click / d.fill / d.highlight ฯลฯ เท่านั้น เพื่อให้เห็นเคอร์เซอร์และไฮไลต์ */
  run: (d: Director) => Promise<void>
}

export interface ScenarioScript {
  /** id ของ scenario ใน flow-map.json */
  id: string
  steps: Record<string, CheckpointScript>
}
