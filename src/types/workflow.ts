export interface AuditEntry {
  id: string
  caseNo: string
  actorName: string
  actorRole: string
  /** รหัสผู้ใช้ที่ก่อเหตุการณ์ — ใช้แยกว่าใครเข้าถึงแฟ้มเมื่อชื่อซ้ำกันได้ */
  actorUserId?: string
  action: string
  before?: string
  after?: string
  docRef?: string
  /**
   * WIT0837 — Access Log ต้องระบุอุปกรณ์/ที่มาของการเข้าถึงด้วย ไม่ใช่แค่ผู้ใช้และเวลา
   * ระบบจำลองอ่านจาก user agent ของเบราว์เซอร์ และใช้ที่อยู่เครือข่ายจำลองแทน IP จริง
   */
  device?: string
  ipAddress?: string
  timestamp: string
}

export interface NotificationItem {
  id: string
  caseNo: string
  type: string
  toName: string
  /**
   * ผู้รับการแจ้งเตือน (รหัสผู้ใช้ใน ECMIS_USER_DIRECTORY) — WIT0306 กำหนดให้การแจ้งเตือนพุ่งไปที่
   * "เจ้าหน้าที่ที่ถูกมอบหมาย" เป็นรายบุคคล ไม่ใช่ประกาศรวมทั้งระบบ
   * เว้นว่างไว้ = แจ้งเตือนทั่วไปที่ทุกบทบาทเห็นได้
   */
  toUserId?: string
  channel: string
  message: string
  urgency: 'ปกติ' | 'ด่วน' | 'ด่วนที่สุด'
  timestamp: string
  read: boolean
}

export interface AssignmentLog {
  id: string
  caseNo: string
  type: string
  fromName: string
  fromRole: string
  toName: string
  toRole: string
  due: string
  timestamp: string
}
