import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'gold' | 'icon' | 'unstyled'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'unstyled'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
}

// ค่าเทียบ .ws-button ของ ก4/ก5: primary = navy, secondary = ขาวขอบ #9aabba, ghost = #edf2f6,
// danger = --ws-danger (#a52c25 = rose-600), gold = #e0bd4f / #172434 (ใช้เมื่อมีความหมายเน้นเฉพาะ)
const variantClasses: Record<ButtonVariant, string> = {
    primary: 'bg-navy text-white font-semibold hover:bg-blue rounded-lg',
    secondary: 'border border-[#9aabba] bg-white text-navy font-semibold hover:bg-slate-50 rounded-lg',
    outline: 'border border-[#9aabba] bg-white text-navy font-semibold hover:bg-slate-50 rounded-lg',
    danger: 'bg-rose-600 text-white font-semibold hover:bg-rose-700 rounded-lg',
    ghost: 'bg-[#edf2f6] text-navy font-semibold hover:bg-slate-200 rounded-lg',
    gold: 'bg-gold-accent text-ink font-semibold hover:bg-gold rounded-lg',
    icon: 'bg-transparent text-slate-500 hover:bg-slate-100 rounded-lg',
    unstyled: '',
}

// md = ปุ่มทั่วไป 44px (.68rem 1rem, .88rem/600); lg = ปุ่มงานหลักหน้ารายละเอียด 52px/radius 12px/700;
// sm/icon 38px = ข้อยกเว้นของ toolbar เดิม (ไม่ใช้เป็นค่าเริ่มต้นของงานใหม่)
const sizeClasses: Record<ButtonSize, string> = {
    sm: 'inline-flex min-h-[38px] items-center justify-center gap-[0.45rem] whitespace-nowrap px-3 py-1.5 text-[0.85rem]',
    md: 'inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] px-4 py-[0.68rem] text-[0.88rem]',
    lg: 'inline-flex min-h-[52px] items-center justify-center gap-[0.45rem] rounded-xl px-6 py-3 text-[0.88rem] font-bold leading-tight',
    icon: 'inline-flex min-h-[38px] min-w-[38px] items-center justify-center whitespace-nowrap p-2 text-sm',
    unstyled: '',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'unstyled', size = 'unstyled', ...props }, ref) => (
        <button
            ref={ref}
            className={cn(
                variantClasses[variant],
                sizeClasses[size],
                // ปุ่มที่ไม่ได้เลือก size คงพฤติกรรมเดิม (ไม่ตัดบรรทัด); size md/lg ให้ข้อความไทยยาว wrap ได้
                size === 'unstyled' && 'whitespace-nowrap',
                'disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            {...props}
        />
    ),
)

Button.displayName = 'Button'
