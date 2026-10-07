import type { GuideDirector } from './guide-director'

/** เรื่องตัวอย่างในข้อมูลตั้งต้น Demo — พยาน ตรีรุด หล่อจัง · “สูบบุหรี่ในที่ทำงาน” · เลขสำนวน กบค. 0001/2569 */
export const GUIDE_CASE_NO = 'WP-2569-000612'
export const GUIDE_DOSSIER_URL = `/dossier/${GUIDE_CASE_NO}`

/**
 * หนึ่งเส้นทางของคู่มือ (หนึ่งแท็บ) — run ใช้ d.click / d.fill / d.confirm / d.switchRole / d.highlight / d.result
 * ทุกการกดจะได้ภาพหน้าจอพร้อมกรอบไฮไลต์อัตโนมัติ
 * เปิดหัวข้อใหม่ด้วย d.section(...) หรือ d.switchRole(...) (สลับบทบาทเปิดหัวข้อให้เอง)
 */
export interface GuideFlow {
  id: string
  title: string
  summary: string
  /**
   * ทางแยก: เดินช่วงที่เหมือนเส้นหลักโดยไม่ถ่ายภาพ ก่อนเริ่ม run (ค่าเริ่มต้นของทางแยกคือช่วงร่วมทั้งหมดจนถึงเลขาธิการฯ)
   * เส้นหลัก (id 'main') ไม่มี prefix — ถ่ายตั้งแต่ทะเบียน
   */
  prefix?: (d: GuideDirector) => Promise<void>
  /** ชื่อหัวข้อในเส้นหลักที่ทางแยกนี้แยกออกมา — หน้าคู่มือแสดง "ต่อจากขั้นที่ X ของเส้นทางหลัก" */
  branchSection?: string
  /** เรื่องที่ใช้ในเส้นทางนี้ (ค่าเริ่มต้น GUIDE_CASE_NO) — แสดงในหน้าคู่มือ */
  caseNo?: string
}
