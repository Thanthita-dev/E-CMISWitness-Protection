import Swal from 'sweetalert2'
import { CoordinationAgencyType } from '../types/case'
import { ARTICLE14_AGENCIES, ARTICLE14_AGENCY_ORDER, DEFAULT_ARTICLE14_AGENCY, isArticle14AgencyType } from './constants'
import { showConfirmAlert } from './swal'

const AGENCY_RADIO_NAME = 'article14-agency'

/** ตัวเลือกแบบการ์ดเรียงลงทีละแถว — การ์ดที่เลือกขอบ/พื้นเป็นสีน้ำเงิน มีเครื่องหมายถูกด้านขวา */
const agencyOptionsHtml = (current: CoordinationAgencyType) =>
    ARTICLE14_AGENCY_ORDER.map((value) => `
        <label class="group flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50 has-[:checked]:border-navy has-[:checked]:bg-blue-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-300">
            <input type="radio" name="${AGENCY_RADIO_NAME}" value="${value}" ${value === current ? 'checked' : ''} class="h-4 w-4 shrink-0 accent-navy" />
            <span class="flex-1 text-[0.95rem] font-medium text-ink group-has-[:checked]:font-semibold group-has-[:checked]:text-navy">${ARTICLE14_AGENCIES[value].label}</span>
            <svg class="h-5 w-5 shrink-0 text-navy opacity-0 group-has-[:checked]:opacity-100" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clip-rule="evenodd"/></svg>
        </label>`).join('')

/**
 * ป็อปอัปเลือกหน่วยงานปลายทางก่อนเข้าหน้าเสนอส่งต่อตามข้อ 14 — ตัวเลือกชุดเดียวกับข้อ 4 ของ คบ.4/คบ.6
 * คืน undefined เมื่อผู้ใช้กดยกเลิก
 */
export const promptArticle14Agency = async (
    current: CoordinationAgencyType = DEFAULT_ARTICLE14_AGENCY
): Promise<CoordinationAgencyType | undefined> => {
    const res = await showConfirmAlert({
        title: 'เสนอส่งต่อหน่วยงานอื่น',
        html: `
            <p class="text-left text-[0.92rem] text-muted">เลือกหน่วยงานที่จะรับช่วงคุ้มครองพยาน เพื่อจัดทำหนังสือและเสนอผ่านลำดับชั้นในแฟ้มคำร้อง</p>
            <div role="radiogroup" aria-label="หน่วยงานที่จะรับช่วงคุ้มครองพยาน" class="mt-4 flex flex-col gap-2">${agencyOptionsHtml(current)}</div>`,
        width: '34rem',
        preConfirm: () => {
            const value = Swal.getPopup()?.querySelector<HTMLInputElement>(`input[name="${AGENCY_RADIO_NAME}"]:checked`)?.value
            if (!isArticle14AgencyType(value)) {
                Swal.showValidationMessage('กรุณาเลือกหน่วยงาน')
                return false
            }
            return value
        },
        showCancelButton: true,
        confirmButtonText: 'เปิดแฟ้มและจัดทำหนังสือ',
        cancelButtonText: 'ยกเลิก',
        customClass: {
            popup: 'font-sans !rounded-xl shadow-card !p-6',
            title: '!p-0 !text-left !text-[1.25rem] !font-bold !text-navy',
            htmlContainer: '!m-0 !mt-2 !p-0 !text-[0.95rem] !text-ink',
            actions: '!mt-6 !w-full !justify-end !gap-2',
            confirmButton: 'min-h-[44px] px-5 py-[0.68rem] rounded-lg text-[0.88rem] font-semibold text-white',
            cancelButton: 'min-h-[44px] px-5 py-[0.68rem] rounded-lg text-[0.88rem] font-semibold text-white',
        },
    })
    return res.isConfirmed && isArticle14AgencyType(res.value) ? res.value : undefined
}
