import Swal, { SweetAlertOptions } from 'sweetalert2'
import withReactContent from 'sweetalert2-react-content'

export const MySwal = withReactContent(Swal)

export const showSuccessAlert = (title: string, text: string, onConfirm?: () => void) => {
    return Swal.fire({
        icon: 'success',
        title,
        text,
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#082b50',
        customClass: {
            popup: 'font-sans !rounded-xl shadow-card',
            title: '!text-[1.25rem] !font-bold !text-navy',
            htmlContainer: '!text-[0.95rem] !text-ink',
            confirmButton: 'min-h-[44px] px-6 py-[0.68rem] rounded-lg text-[0.88rem] font-semibold text-white',
        },
    }).then((res) => {
        if (res.isConfirmed && onConfirm) {
            onConfirm()
        }
    })
}

export const showConfirmAlert = (options: SweetAlertOptions) => {
    return Swal.fire({
        confirmButtonColor: '#082b50',
        cancelButtonColor: '#506276',
        reverseButtons: true,
        customClass: {
            popup: 'font-sans !rounded-xl shadow-card',
            title: '!text-[1.25rem] !font-bold !text-navy',
            htmlContainer: '!text-[0.95rem] !text-ink',
            confirmButton: 'min-h-[44px] px-5 py-[0.68rem] rounded-lg text-[0.88rem] font-semibold text-white',
            cancelButton: 'min-h-[44px] px-5 py-[0.68rem] rounded-lg text-[0.88rem] font-semibold text-white',
        },
        ...options,
    })
}

/** Shows a copyable signing link (prototype: copies to clipboard best-effort, no real security). */
export const showLinkDialog = (title: string, url: string) => {
    navigator.clipboard?.writeText(url).catch(() => { })
    return Swal.fire({
        icon: 'success',
        title,
        html: `<input type="text" readonly value="${url}" onclick="this.select()" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;color:#334155;" />
      <p style="font-size:11px;color:#64748b;margin-top:10px;">คัดลอกลิงก์ไปยังคลิปบอร์ดแล้ว ส่งให้ผู้ลงนามเปิดเพื่อเซ็นชื่อทางไกลได้เลย (สาธิต — ใช้งานได้เมื่อเปิดจากเบราว์เซอร์/อุปกรณ์เดียวกัน)</p>`,
        confirmButtonText: 'ปิด',
        confirmButtonColor: '#082b50',
        customClass: {
            popup: 'font-sans !rounded-xl shadow-card',
            title: '!text-[1.25rem] !font-bold !text-navy',
            htmlContainer: '!text-[0.95rem] !text-ink',
            confirmButton: 'min-h-[44px] px-6 py-[0.68rem] rounded-lg text-[0.88rem] font-semibold text-white',
        },
    })
}

export const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    const Toast = Swal.mixin({
        toast: true,
        position: 'bottom-end',
        showConfirmButton: false,
        timer: 2400,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.onmouseenter = Swal.stopTimer
            toast.onmouseleave = Swal.resumeTimer
        },
    })
    return Toast.fire({
        icon: type,
        title: message,
    })
}

const esc = (value: string): string =>
    value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/**
 * เนื้อหามาตรฐานของจอยืนยัน — บอก "สิ่งที่กำลังจะเกิดขึ้นจริง" ไม่ใช่แค่ถามว่าแน่ใจไหม
 * ใช้กับทุกปุ่มที่เปลี่ยนเจ้าของงานหรือสถานะแฟ้ม
 */
export const confirmBody = (lead: string, facts: Array<[string, string]>, effect: string): string => `
  <div style="text-align:left;font-size:12px;line-height:1.7;color:#334155">
    <p style="margin:0 0 10px">${lead}</p>
    ${facts
        .map(
            ([label, value]) => `<div style="margin-bottom:6px">
            <span style="color:#64748b">${esc(label)}</span><br/>
            <strong style="color:#0f172a">${esc(value)}</strong>
          </div>`
        )
        .join('')}
    <div style="margin-top:10px;padding:10px;border-radius:8px;background:#f1f5f9;border:1px solid #e2e8f0">
      <span style="display:block;font-weight:700;color:#334155;margin-bottom:2px">ผลที่จะเกิดขึ้นเมื่อยืนยัน</span>
      ${effect}
    </div>
  </div>`
