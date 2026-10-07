import React from 'react'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold'
  className?: string
  icon?: string
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className = '', icon }) => {
  // ค่าเทียบ .ws-status: default/pending (ทองอ่อน) | success | danger
  const styles = {
    default: 'bg-[#f7edcb] text-[#654b08] border-transparent',
    neutral: 'bg-slate-100 text-slate-700 border-transparent',
    warning: 'bg-[#f7edcb] text-[#654b08] border-transparent',
    success: 'bg-[#dff0e7] text-[#1e6141] border-transparent',
    danger: 'bg-[#f9e1df] text-[#8c261f] border-transparent',
    info: 'bg-blue-soft text-blue border-transparent',
    gold: 'bg-[#f7edcb] text-[#654b08] border-gold/40',
  }[variant]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-[0.58rem] py-[0.28rem] text-[0.74rem] font-semibold leading-tight ${styles} ${className}`}
    >
      {icon && <i className={`fa-solid ${icon} text-[0.74rem]`} />}
      {children}
    </span>
  )
}
