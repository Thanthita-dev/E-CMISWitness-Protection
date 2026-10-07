import React from 'react'
import ReactDOM from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './index.css'
import { syncStoresAcrossTabs } from './lib/crossTabSync'
import { useConsentSigningStore } from './store/useConsentSigningStore'
import { useCaseStore } from './store/useCaseStore'
import { useNotificationStore } from './store/useNotificationStore'
import { useFormDraftStore } from './store/useFormDraftStore'
import { useSignatureLinkStore } from './store/useSignatureLinkStore'

// ลิงก์ลงชื่อ (ผู้ขอคุ้มครอง / บุคคลที่เกี่ยวข้อง / ผู้ลงนามทางไกล) เปิดในแท็บใหม่ — ให้แท็บเจ้าหน้าที่เห็นผลทันทีและไม่เขียนทับกัน
syncStoresAcrossTabs([useConsentSigningStore, useCaseStore, useNotificationStore, useFormDraftStore, useSignatureLinkStore])

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  )
}
