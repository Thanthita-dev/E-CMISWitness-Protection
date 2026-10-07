/**
 * ตรวจสอบไฟล์แนบก่อนรับเข้าแฟ้ม — ใช้ร่วมกันทุกจุดอัปโหลดเอกสารในระบบ
 * เกณฑ์: รับเฉพาะ PDF / รูปภาพ / เอกสาร Office และขนาดไม่เกิน 20MB ต่อไฟล์
 * (ไม่ใช้กับการอัปโหลดรูปลายมือชื่อใน SignaturePad ซึ่งจำกัดเป็นรูปภาพอยู่แล้ว)
 */

/** ขนาดสูงสุดต่อไฟล์ 20MB */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

/** นามสกุลไฟล์เอกสารแนบที่ระบบรองรับ */
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
    'pdf',
    'jpg',
    'jpeg',
    'png',
    'doc',
    'docx',
    'xls',
    'xlsx',
]

/** ค่า accept ของ input[type=file] ให้ตรงกับเกณฑ์เดียวกัน */
export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(',')

/** ข้อความบรรยายเกณฑ์ สำหรับแสดงใต้ปุ่มอัปโหลด */
export const ATTACHMENT_RULE_TEXT =
    'รองรับไฟล์ PDF, JPG, PNG และเอกสาร Office ขนาดไม่เกิน 20MB ต่อไฟล์'

export function formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`
    return `${bytes}B`
}

function extensionOf(name: string): string {
    const dot = name.lastIndexOf('.')
    return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/** ตรวจไฟล์เดียว — คืนข้อความเหตุผลเมื่อไม่ผ่าน และคืน null เมื่อผ่าน */
export function getAttachmentRejection(file: File): string | null {
    const ext = extensionOf(file.name)
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
        return `ไฟล์ "${file.name}" นามสกุลไม่รองรับ — ${ATTACHMENT_RULE_TEXT}`
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
        return `ไฟล์ "${file.name}" ขนาด ${formatFileSize(file.size)} เกินขนาดที่กำหนด — สูงสุด 20MB ต่อไฟล์`
    }
    return null
}

export interface AttachmentFilterResult {
    /** ไฟล์ที่ผ่านเกณฑ์ นำไปบันทึกเข้าแฟ้มได้ */
    accepted: File[]
    /** เหตุผลของไฟล์ที่ถูกปฏิเสธ เรียงตามลำดับไฟล์ที่เลือก */
    rejections: string[]
}

/** คัดไฟล์ที่ผ่านเกณฑ์ออกจากรายการที่ผู้ใช้เลือก พร้อมเก็บเหตุผลของไฟล์ที่ถูกปฏิเสธ */
export function filterValidAttachments(files: File[]): AttachmentFilterResult {
    const accepted: File[] = []
    const rejections: string[] = []
    files.forEach((file) => {
        const rejection = getAttachmentRejection(file)
        if (rejection) rejections.push(rejection)
        else accepted.push(file)
    })
    return { accepted, rejections }
}
