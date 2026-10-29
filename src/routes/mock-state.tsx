import React, { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { Button } from '../components/common/Button'
import { MySwal, showToast } from '../lib/swal'
import {
    MOCK_STATES,
    MockState,
    applyMockState,
    captureCurrentLocalStorageData,
    downloadMockState,
    groupMockStates,
} from '../lib/mockState'
import { ROLE_SETS, ROLE_SET_STORAGE_KEY, DEFAULT_ROLE_SET_ID, getRoleSet, readActiveRoleSetId } from '../lib/roleSets'
import { capturedUsersFor } from '../lib/mockStateRoleNames'
import { useAuthStore } from '../store/useAuthStore'
import { useCaseStore } from '../store/useCaseStore'
import { getCurrentStageInfo } from '../components/dossier/DossierStageTracker'
import { ROLE_NAMES } from '../lib/constants'

export const Route = createFileRoute('/mock-state')({
    component: MockStatePage,
})

const SaveStateModalBody: React.FC<{
    defaultTo: string
    defaultDescription: string
    onCancel: () => void
    onConfirm: (name: string, description: string, to: string | null) => void
}> = ({ defaultTo, defaultDescription, onCancel, onConfirm }) => {
    const [name, setName] = useState('')
    const [description, setDescription] = useState(defaultDescription)
    const [to, setTo] = useState(defaultTo)

    return (
        <div className="space-y-3 text-left">
            <p className="text-[0.88rem] text-muted leading-relaxed">
                ตั้งชื่อ state นี้ก่อนดาวน์โหลดเป็นไฟล์ JSON เพื่อนำกลับมาโหลดซ้ำหรือแชร์ให้คนอื่นได้ภายหลัง
            </p>
            <div className="ws-field">
                <label className="ws-label" htmlFor="mockStateName">ชื่อ (name) <span className="text-danger">*</span></label>
                <input
                    id="mockStateName"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="เช่น เจ้าหน้าที่ - มีคดีค้างคิว 3 เรื่อง"
                    className="ws-input"
                />
            </div>
            <div className="ws-field">
                <label className="ws-label" htmlFor="mockStateDesc">คำอธิบาย (description)</label>
                <textarea
                    id="mockStateDesc"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="อธิบาย state นี้ไว้ใช้งาน/ทดสอบอะไร"
                    className="ws-input"
                />
            </div>
            <div className="ws-field">
                <label className="ws-label" htmlFor="mockStateTo">ไปหน้า (to)</label>
                <input
                    id="mockStateTo"
                    type="text"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="/queue/officer (เว้นว่างไว้ = ไม่ย้ายหน้า)"
                    className="ws-input"
                />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                <Button
                    type="button"
                    onClick={onCancel}
                    variant="secondary"
                    size="md"
                >
                    ยกเลิก
                </Button>
                <Button
                    type="button"
                    onClick={() => onConfirm(name, description, to.trim() || null)}
                    variant="primary"
                    size="md"
                >
                    <i className="fa-solid fa-download" />
                    ดาวน์โหลด JSON
                </Button>
            </div>
        </div>
    )
}

function MockStatePage() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
    // ชุดรายชื่อที่ใช้อยู่ตาม localStorage จริง (แท็บอื่นอาจเปลี่ยนไปแล้ว) — อัปเดตเมื่อมี storage event
    const [roleSetId, setRoleSetId] = useState(() => readActiveRoleSetId())
    useEffect(() => {
        const onStorage = () => setRoleSetId(readActiveRoleSetId())
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])
    // แสดงเฉพาะ state ที่ผูกกับชุดรายชื่อที่เลือก — ไม่ระบุ ecmis-role-set = ชุดตั้งต้น
    const visibleStates = MOCK_STATES.filter(
        (state) => getRoleSet(state.localStorageData[ROLE_SET_STORAGE_KEY]).id === roleSetId
    )
    const handleLoad = (state: MockState) => {
        MySwal.fire({
            icon: 'question',
            title: `โหลด state "${state.name}"?`,
            html: (
                <p className="text-[0.88rem] text-ink leading-relaxed text-left">
                    ข้อมูล localStorage ปัจจุบันของระบบ (ecmis-*) จะถูก<strong>ล้างและแทนที่ทั้งหมด</strong>ด้วยข้อมูลใน state นี้
                    {state.to && (
                        <>
                            {' '}แล้วพาไปหน้า <strong>{state.to}</strong>
                        </>
                    )}
                </p>
            ),
            showCancelButton: true,
            confirmButtonText: 'ยืนยันโหลด',
            cancelButtonText: 'ยกเลิก',
            reverseButtons: true,
            confirmButtonColor: '#16558f',
            cancelButtonColor: '#62738a',
            customClass: {
                popup: 'font-sans rounded-xl',
                confirmButton: 'px-5 py-2.5 rounded-lg font-medium text-white',
                cancelButton: 'px-5 py-2.5 rounded-lg font-medium text-white',
            },
        }).then((result) => {
            if (!result.isConfirmed) return
            applyMockState(state)
            window.open(state.to || '/mock-state', '_blank')
        })
    }

    const handleSaveCurrentState = () => {
        const currentRoleName = ROLE_NAMES[useAuthStore.getState().currentRole]
        const activeCase = useCaseStore.getState().getCase()
        const defaultDescription = activeCase
            ? `[${currentRoleName}] [${getCurrentStageInfo(activeCase).label}]`
            : `[${currentRoleName}]`

        MySwal.fire({
            title: 'บันทึก state ปัจจุบัน',
            html: (
                <SaveStateModalBody
                    defaultTo={window.location.pathname}
                    defaultDescription={defaultDescription}
                    onCancel={() => MySwal.close()}
                    onConfirm={(name, description, to) => {
                        if (!name.trim()) {
                            showToast('กรุณาระบุชื่อ state')
                            return
                        }
                        downloadMockState({
                            name: name.trim(),
                            description: description.trim(),
                            to,
                            capturedUsers: capturedUsersFor(getRoleSet(readActiveRoleSetId())),
                            localStorageData: captureCurrentLocalStorageData(),
                        })
                        MySwal.close()
                        showToast('ดาวน์โหลด state เป็น JSON เรียบร้อยแล้ว')
                    }}
                />
            ),
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'font-sans rounded-xl' },
        })
    }

    return (
        <div>
            <PageHeader
                eyebrow="เครื่องมือทดสอบ · Mock State"
                title="Mock State"
                description="สลับไปยัง flow ต่างๆ ด้วยข้อมูลจำลอง (localStorage) ที่เตรียมไว้ล่วงหน้า หรือบันทึก state ปัจจุบันเป็นไฟล์ JSON เพื่อนำกลับมาใช้ภายหลัง"
                actions={
                    <>
                    {!isAuthenticated && (
                        <Link
                            to="/login"
                            className="inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy hover:bg-slate-50"
                        >
                            <i className="fa-solid fa-right-to-bracket" />
                            เข้าสู่ระบบ
                        </Link>
                    )}
                    <Link
                        to="/flow-guide"
                        className="inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy hover:bg-slate-50"
                    >
                        <i className="fa-solid fa-route" />
                        คู่มือเดิน Flow
                    </Link>
                    <Button
                        variant="primary"
                        size="md"
                        onClick={handleSaveCurrentState}
                    >
                        <i className="fa-solid fa-download" />
                        บันทึก state ปัจจุบันเป็น JSON
                    </Button>
                    </>
                }
            />

            <div className="ws-card mt-5 flex flex-wrap items-center gap-3 p-4">
                <label className="ws-label" htmlFor="roleSetSelect">ชุดรายชื่อผู้ใช้</label>
                <select
                    id="roleSetSelect"
                    className="ws-input w-auto"
                    value={roleSetId}
                    onChange={(e) => {
                        try {
                            if (e.target.value === DEFAULT_ROLE_SET_ID) localStorage.removeItem(ROLE_SET_STORAGE_KEY)
                            else localStorage.setItem(ROLE_SET_STORAGE_KEY, e.target.value)
                        } catch {
                            showToast('เปลี่ยนชุดรายชื่อผู้ใช้ไม่สำเร็จ: เบราว์เซอร์ไม่อนุญาตให้บันทึกข้อมูล')
                            return
                        }
                        window.location.reload()
                    }}
                >
                    {ROLE_SETS.map((set) => (
                        <option key={set.id} value={set.id}>{set.label}</option>
                    ))}
                </select>
                <p className="text-[0.8rem] text-muted leading-relaxed">
                    แสดงเฉพาะ state ที่ผูกกับชุดรายชื่อนี้ (state ที่ไม่ได้ระบุชุดรายชื่อนับเป็นรายชื่อตั้งต้น) ชุดที่เลือกใช้กับข้อมูลปัจจุบันและ state ที่บันทึกจากนี้ไปด้วย
                </p>
            </div>

            <div className="space-y-6 mt-5">
                {groupMockStates(visibleStates).map(({ group, states }) => (
                    <section key={group}>
                        <h2 className="mb-3 flex items-center gap-2 text-[1.1rem] font-bold leading-snug text-navy">
                            <i className="fa-solid fa-layer-group text-muted" />
                            {group}
                            <span className="text-[0.8rem] font-normal text-muted">{states.length} state</span>
                        </h2>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {states.map((state) => (
                                <div
                                    key={state.name}
                                    className="ws-card flex flex-col justify-between p-4"
                                >
                                    <div>
                                        <h3 className="text-[0.95rem] font-semibold text-ink">{state.name}</h3>
                                        {state.localStorageData[ROLE_SET_STORAGE_KEY] && (
                                            <p className="mt-1 text-[0.8rem] text-muted">
                                                <i className="fa-solid fa-users mr-1" />
                                                ชุดรายชื่อ: {getRoleSet(state.localStorageData[ROLE_SET_STORAGE_KEY]).label}
                                            </p>
                                        )}
                                        {state.description && (
                                            <p className="mt-1.5 text-[0.8rem] text-muted leading-relaxed">{state.description}</p>
                                        )}
                                        <p className="mt-2 text-[0.8rem] text-muted">
                                            <i className="fa-solid fa-location-arrow mr-1" />
                                            {state.to || 'อยู่หน้าเดิม'}
                                        </p>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="md"
                                        onClick={() => handleLoad(state)}
                                        className="mt-3"
                                    >
                                        <i className="fa-solid fa-play" />
                                        โหลด state นี้
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </section>
                ))}

                {MOCK_STATES.length === 0 && (
                    <p className="text-[0.88rem] text-muted">
                        ยังไม่มีไฟล์ mock state — เพิ่มไฟล์ .json ได้ที่ src/mock-states/
                    </p>
                )}
                {MOCK_STATES.length > 0 && visibleStates.length === 0 && (
                    <p className="text-[0.88rem] text-muted">ยังไม่มี mock state ที่ผูกกับชุดรายชื่อนี้</p>
                )}
            </div>
        </div>
    )
}
