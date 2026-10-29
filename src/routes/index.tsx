import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../store/useAuthStore'

/** หน้าแรกของทุกบทบาท = งานของฉัน (คิวงานตามบทบาทปัจจุบัน) */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/queue/$role',
      params: { role: useAuthStore.getState().currentRole },
    })
  },
})
