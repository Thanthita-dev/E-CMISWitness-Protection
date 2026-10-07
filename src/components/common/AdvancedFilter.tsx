import { Button } from "./Button"
import React, { useState } from 'react'
import { FORMS_CATALOG, ORG_UNITS } from '../../lib/constants'

interface AdvancedFilterProps {
  onSearch: (filters: Record<string, any>) => void
  onReset: () => void
}

export const AdvancedFilter: React.FC<AdvancedFilterProps> = ({ onSearch, onReset }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [filters, setFilters] = useState<Record<string, any>>({
    formCode: '',
    startDate: '',
    endDate: '',
    urgency: '',
    risk: '',
    orgUnit: '',
    ownerName: '',
  })

  const handleChange = (key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleApply = () => {
    onSearch(filters)
  }

  const handleReset = () => {
    setFilters({
      formCode: '',
      startDate: '',
      endDate: '',
      urgency: '',
      risk: '',
      orgUnit: '',
      ownerName: '',
    })
    onReset()
  }

  return (
    <details
      open={isOpen}
      onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
      className="ws-card mb-4 overflow-hidden"
    >
      <summary className="cursor-pointer bg-slate-50/70 px-4 py-3 text-[1rem] font-bold text-navy flex items-center justify-between hover:bg-slate-100/80 select-none">
        <span className="flex items-center gap-2">
          <i className="fa-solid fa-sliders" />
          ตัวกรองขั้นสูง (Advanced Filters)
        </span>
        <i className={`fa-solid ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'} text-slate-400`} />
      </summary>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 gap-[0.72rem] sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="ws-label">ประเภทแบบ คบ.</label>
            <select
              value={filters.formCode}
              onChange={(e) => handleChange('formCode', e.target.value)}
              className="ws-input"
            >
              <option value="">ทุกแบบฟอร์ม</option>
              {FORMS_CATALOG.map((f) => (
                <option key={f.n} value={f.code}>
                  {f.code} - {f.t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ws-label">ความเร่งด่วน</label>
            <select
              value={filters.urgency}
              onChange={(e) => handleChange('urgency', e.target.value)}
              className="ws-input"
            >
              <option value="">ทั้งหมด</option>
              <option value="normal">กรณีปกติ</option>
              <option value="urgent">กรณีจำเป็นเร่งด่วน</option>
            </select>
          </div>

          <div>
            <label className="ws-label">ระดับความเสี่ยง</label>
            <select
              value={filters.risk}
              onChange={(e) => handleChange('risk', e.target.value)}
              className="ws-input"
            >
              <option value="">ทุกระดับ</option>
              <option value="ต่ำ">ต่ำ</option>
              <option value="ปานกลาง">ปานกลาง</option>
              <option value="สูง">สูง</option>
              <option value="วิกฤต">วิกฤต</option>
            </select>
          </div>

          <div>
            <label className="ws-label">สำนัก / กอง / เขต</label>
            <select
              value={filters.orgUnit}
              onChange={(e) => handleChange('orgUnit', e.target.value)}
              className="ws-input"
            >
              <option value="">ทุกหน่วยงาน</option>
              {ORG_UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="ws-label">วันที่รับคำร้องตั้งแต่</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleChange('startDate', e.target.value)}
              className="ws-input"
            />
          </div>

          <div>
            <label className="ws-label">ถึงวันที่</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleChange('endDate', e.target.value)}
              className="ws-input"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="ws-label">เจ้าของเรื่อง / ผู้รับผิดชอบ</label>
            <input
              type="text"
              placeholder="ระบุชื่อเจ้าหน้าที่..."
              value={filters.ownerName}
              onChange={(e) => handleChange('ownerName', e.target.value)}
              className="ws-input"
            />
          </div>
        </div>

        <div className="ws-actions justify-end border-t border-line pt-3">
          <Button
            type="button"
            onClick={handleReset}
            variant="secondary"
            size="md"
          >
            <i className="fa-solid fa-rotate-left text-muted" />
            ล้างตัวกรอง
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            variant="primary"
            size="md"
          >
            <i className="fa-solid fa-filter" />
            นำตัวกรองไปใช้
          </Button>
        </div>
      </div>
    </details>
  )
}
