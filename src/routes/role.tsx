import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { RoleSwitchPicker } from '../components/common/RoleSwitchPicker'

/** หน้าลับสำหรับสาธิต/ทดสอบ: สลับบทบาทโดยไม่ต้องออกจากระบบ (ไม่แสดงในเมนู) */
export const Route = createFileRoute('/role')({
    component: RoleSwitchPage,
})

function RoleSwitchPage() {
    return (
        <div className="min-w-0">
            <PageHeader
                eyebrow="เครื่องมือทดสอบ · สลับบทบาท"
                title="สลับบทบาท"
                description="เลือกบัญชีเพื่อสลับบทบาทการทำงานทันทีโดยไม่ต้องออกจากระบบ ใช้สำหรับสาธิตและทดสอบ"
            />
            <RoleSwitchPicker />
        </div>
    )
}
