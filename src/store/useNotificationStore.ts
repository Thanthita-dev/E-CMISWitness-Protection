import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { NotificationItem } from '../types/workflow'
import { nowDisplay } from '../lib/utils'

interface NotificationState {
  notifications: NotificationItem[]
  unreadCount: number

  addNotification: (item: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
}

/**
 * คัดเฉพาะการแจ้งเตือนที่ "ถึงตัวผู้ใช้ที่กำลังใช้งาน" — รายการที่ระบุผู้รับไว้ (toUserId) จะเห็นได้เฉพาะ
 * เจ้าตัวเท่านั้น ส่วนรายการที่ไม่ระบุผู้รับถือเป็นประกาศทั่วไปที่ทุกคนเห็นได้
 * ใช้ร่วมกันทั้งหน้า /notifications และตัวนับบนแถบด้านบน เพื่อไม่ให้ตัวเลขกับรายการขัดกัน
 */
export const filterNotificationsForUser = (
  notifications: NotificationItem[],
  userIds: Array<string | undefined>,
  role?: string
): NotificationItem[] => {
  if (role === 'admin') return notifications
  const mine = userIds.filter(Boolean) as string[]
  return notifications.filter((n) => !n.toUserId || mine.includes(n.toUserId))
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,

      addNotification: (item) => {
        const newNotif: NotificationItem = {
          ...item,
          id: `NOTIF-${Date.now()}-${crypto.randomUUID()}`,
          timestamp: nowDisplay(),
          read: false,
        }
        set((state) => ({
          notifications: [newNotif, ...state.notifications],
          unreadCount: state.unreadCount + 1,
        }))
      },

      markAsRead: (id) => {
        set((state) => {
          const updated = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
          return {
            notifications: updated,
            unreadCount: updated.filter((n) => !n.read).length,
          }
        })
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }))
      },
    }),
    {
      name: 'ecmis-notifications-storage',
    }
  )
)
