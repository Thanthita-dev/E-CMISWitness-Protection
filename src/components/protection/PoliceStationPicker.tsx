import React from 'react'
import registry from '../../data/police-stations.json'

export const POLICE_STATIONS = registry.stations
const normalize = (value: string) => value.normalize('NFC').replace(/[\s.]/g, '').toLowerCase()
export const PoliceStationPicker: React.FC<{
  province: string
  stationId: string
  onProvinceChange: (province: string) => void
  onStationChange: (id: string) => void
}> = ({ province, stationId, onProvinceChange, onStationChange }) => {
  const [query, setQuery] = React.useState('')
  const id = React.useId()
  const stations = POLICE_STATIONS.filter((s) => (!province || s.province === province) &&
    normalize(`${s.name} ${s.shortName}`).includes(normalize(query)))
  const selected = POLICE_STATIONS.find((s) => s.id === stationId)
  const options = selected && !stations.some((s) => s.id === selected.id) ? [selected, ...stations] : stations
  return <div className="space-y-3">
    <label className="block" htmlFor={`${id}-province`}><span className="ws-label">จังหวัด</span>
      <select id={`${id}-province`} data-testid="coordination-province" className="ws-input w-full" value={province} onChange={(e) => { setQuery(''); onProvinceChange(e.target.value) }}>
        <option value="">ทุกจังหวัด</option>{registry.provinces.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </label>
    <label className="block" htmlFor={`${id}-search`}><span className="ws-label">ค้นหาสถานีตำรวจด้วยชื่อหรือคำย่อ สน./สภ.</span>
      <input id={`${id}-search`} data-testid="coordination-station-search" type="search" className="ws-input w-full" placeholder="ค้นหาและเลือกสถานีตำรวจ" value={query} onChange={(e) => setQuery(e.target.value)} />
    </label>
    <label className="block" htmlFor={`${id}-station`}><span className="ws-label">สถานีตำรวจที่ประสาน *</span>
      <select id={`${id}-station`} data-testid="coordination-agency" className="ws-input w-full" value={stationId} onChange={(e) => onStationChange(e.target.value)}>
        <option value="">ค้นหาและเลือกสถานีตำรวจ</option>{options.map((s) => <option key={s.id} value={s.id}>{s.shortName} · {s.province}</option>)}
      </select>
    </label>
    {!stations.length && <p role="status" className="text-[0.8rem] text-muted">{province && !POLICE_STATIONS.some((s) => s.province === province) ? 'ยังไม่ได้นำเข้าทะเบียนสถานีตำรวจของจังหวัดนี้' : 'ไม่พบสถานีในทะเบียนที่นำเข้า กรุณาตรวจคำค้น'}</p>}
    <p className="text-[0.8rem] text-warning" data-testid="police-registry-coverage">ทะเบียนทางการที่นำเข้าแล้ว {POLICE_STATIONS.length} แห่ง ในกรุงเทพมหานครและนนทบุรี ยังไม่ครบทั่วประเทศ</p>
  </div>
}
