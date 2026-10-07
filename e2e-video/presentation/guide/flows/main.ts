import type { GuideFlow } from '../types'
import { approveToOperation } from './main-approve'
import { reportToClose } from './main-close'

/** เส้นทางหลัก: ต่อจากช่วงร่วม — เลขาธิการฯ อนุมัติ → แจ้งพยาน → ข้อตกลง → ปฏิบัติการคุ้มครอง → รายงานผล → ยุติ → ปิดงาน */
export default {
  id: 'main',
  title: 'เส้นทางหลัก: อนุมัติ → คุ้มครอง → ปิดงาน',
  summary: 'เลือกเรื่องของตรีรุด หล่อจัง จากทะเบียน แล้วเดินทุกขั้นตั้งแต่ส่งต่อ ผอ. จนเลขาธิการฯ อนุมัติ คุ้มครองจริง รายงานผล ยุติ และปิดงาน',
  run: async (d) => {
    await approveToOperation(d)
    await reportToClose(d)
  },
} satisfies GuideFlow
