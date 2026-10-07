/**
 * ซิงก์ store ที่ persist ลง localStorage ข้ามแท็บของเบราว์เซอร์เดียวกัน
 * จำเป็นสำหรับลิงก์ลงชื่อที่เปิดในแท็บใหม่ (หน้าจอจำลองฝั่งผู้ขอคุ้มครอง) — เมื่ออีกแท็บบันทึกผล
 * แท็บของเจ้าหน้าที่ต้องโหลดค่าล่าสุดเข้ามา มิฉะนั้นจะแสดงสถานะเก่าและอาจเขียนทับผลการลงชื่อ
 */
interface PersistedStore {
  persist: { rehydrate: () => Promise<void> | void; getOptions: () => { name?: string } }
}

export function syncStoresAcrossTabs(stores: PersistedStore[]): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: StorageEvent) => {
    if (event.storageArea !== window.localStorage || !event.key || event.newValue === null) return
    stores.forEach((store) => {
      if (store.persist.getOptions().name === event.key) void store.persist.rehydrate()
    })
  }
  // Background tabs can miss an event while suspended. Resume from persisted state.
  const refresh = () => { stores.filter((store) => store.persist.getOptions().name === 'ecmis-case-storage-v2').forEach((store) => void store.persist.rehydrate()) }
  const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
  window.addEventListener('storage', handler)
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    window.removeEventListener('storage', handler)
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
