import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AuditEntry } from '../types/workflow'
import { nowDisplay } from '../lib/utils'

interface AuditState {
  logs: AuditEntry[]
  addLog: (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  getLogsByCase: (caseNo: string) => AuditEntry[]
}

export const useAuditStore = create<AuditState>()(
  persist(
    (set, get) => ({
      logs: [],

      addLog: (entry) => {
        const newLog: AuditEntry = {
          /**
           * WIT0837 — ทุกรายการต้องมีอุปกรณ์/ที่มาของการเข้าถึงติดมาด้วยเสมอ
           * เติมให้อัตโนมัติที่นี่ที่เดียว ผู้เรียกจึงไม่ต้องจำและไม่มีรายการใดขาดข้อมูลนี้
           */
          device: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : 'unknown-device',
          ipAddress: '10.0.0.1',
          ...entry,
          /** ต่อท้ายด้วยเลขสุ่ม กันรหัสซ้ำเมื่อมีหลายรายการเกิดขึ้นในมิลลิวินาทีเดียวกัน */
          id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: nowDisplay(),
        }
        set((state) => ({
          logs: [newLog, ...state.logs],
        }))
      },

      getLogsByCase: (caseNo) => {
        return get().logs.filter((l) => l.caseNo === caseNo)
      },
    }),
    {
      name: 'ecmis-audit-storage',
    }
  )
)
