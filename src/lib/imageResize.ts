/**
 * ย่อรูปให้พอดีกรอบที่กำหนด โดยคงสัดส่วนเดิม แล้วคืนค่าเป็น PNG data URL
 *
 * ลายมือชื่อถูกเก็บลง localStorage ผ่าน useFormDraftStore ซึ่งมีโควตารวมราว 5 MB
 * รูปถ่ายจากมือถือขนาดหลาย MB จึงต้องย่อก่อนเสมอ ผลลัพธ์จะมีขนาดใกล้เคียงกับ
 * ลายมือชื่อที่วาดเอง (หลักสิบ KB)
 */
export const resizeImageToDataUrl = (file: File, maxWidth: number, maxHeight: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const { width, height } = image
      if (!width || !height) {
        reject(new Error('ไฟล์รูปไม่มีขนาด'))
        return
      }

      /** ย่อเท่านั้น ไม่ขยายรูปที่เล็กกว่ากรอบอยู่แล้ว */
      const ratio = Math.min(maxWidth / width, maxHeight / height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * ratio))
      canvas.height = Math.max(1, Math.round(height * ratio))

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('สร้าง canvas ไม่สำเร็จ'))
        return
      }

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png'))
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('อ่านไฟล์รูปไม่สำเร็จ'))
    }

    image.src = objectUrl
  })
