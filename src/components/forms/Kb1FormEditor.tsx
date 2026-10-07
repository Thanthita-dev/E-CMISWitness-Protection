import { Button } from '../common/Button'
import React, { useState } from 'react'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useSignatureLinkStore } from '../../store/useSignatureLinkStore'
import { SignatureModal } from '../common/SignatureModal'
import { showToast, showLinkDialog } from '../../lib/swal'
import { ATTACHMENT_ACCEPT, filterValidAttachments } from '../../lib/fileValidation'
import { Area, Checks, DateField, DocHeaderFields, Field, Grid, Radios, Section } from './fields/FormKit'
import { FormFilesPanel } from './FormFilesPanel'
import { CaseClosedBanner, useIsFormCaseClosed } from './FormCaseScope'
import { ApplicantConsentPanel } from './ApplicantConsentPanel'

interface Kb1FormEditorProps {
    onSaved?: () => void
    /** แฟ้มคำร้องที่เปิด คบ.1 อยู่ — ใช้กับการส่งลิงก์ให้ผู้ขอคุ้มครองลงชื่อ */
    caseNo?: string
}

const THREAT_OPTIONS = [
    'โทรศัพท์ข่มขู่',
    'ยานพาหนะติดตาม',
    'บุคคลเฝ้าติดตาม',
    'ข่มขู่ทางวาจา',
    'ทำร้ายร่างกาย',
    'จ้างวาน',
]

const THREAT_LABELS: Record<string, string> = {
    โทรศัพท์ข่มขู่: 'มีบุคคลไม่ทราบชื่อโทรศัพท์มาข่มขู่พยานและผู้ใกล้ชิด',
    ยานพาหนะติดตาม: 'มีรถยนต์/รถจักรยานยนต์ติดตามพยานและผู้ใกล้ชิด',
    บุคคลเฝ้าติดตาม: 'มีบุคคลเฝ้าติดตาม',
    ข่มขู่ทางวาจา: 'มีการข่มขู่คุกคามทางวาจาหรือสื่ออิเล็กทรอนิกส์ต่อพยานหรือผู้ใกล้ชิด',
    ทำร้ายร่างกาย: 'มีการทำร้ายร่างกาย ทรัพย์สิน พยานหรือผู้ใกล้ชิด',
    จ้างวาน: 'มีการจ้างวานให้ผู้อื่นมาข่มขู่หรือทำร้ายพยานหรือผู้ใกล้ชิด',
}

/**
 * WIT0404 — ฟิลด์ที่ต้องกรอกให้ครบก่อนบันทึก คบ.1
 * จำกัดไว้เฉพาะชื่อ-นามสกุลผู้ยื่นคำร้อง ซึ่งขั้นตอนถัดไปอ้างถึงโดยตรง
 * (คบ.6 / คำสั่งคุ้มครอง / หนังสือแจ้งผล) ฟิลด์อื่นยังเติมภายหลังได้
 * เพื่อไม่ให้การสัมภาษณ์หลายรอบถูกบล็อกโดยไม่จำเป็น
 */
const KB1_REQUIRED_FIELDS: Array<{ name: string; label: string }> = [
    { name: 'ชื่อ', label: 'ชื่อผู้ยื่นคำร้อง' },
    { name: 'นามสกุล', label: 'นามสกุลผู้ยื่นคำร้อง' },
]

/** คบ.1 — คำร้องขอให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น (ข้อ 1–8 ตามต้นฉบับ) */
export const Kb1FormEditor: React.FC<Kb1FormEditorProps> = ({ onSaved, caseNo }) => {
    const {
        section,
        setSection,
        getDraft,
        relatedPersons,
        addRelatedPerson,
        removeRelatedPerson,
        attachmentSets,
        addAttachmentSet,
        addFileToSet,
        removeFileFromSet,
        signatures,
        signDocument,
    } = useFormDraftStore()

    const createSignatureLink = useSignatureLinkStore((s) => s.createLink)

    const draft = getDraft(1)
    /** WIT1148 — แฟ้มปิดงานคุ้มครองแล้ว: ล็อกทั้งฉบับ ยกเว้นแท็บรวมไฟล์ที่ยังดู/ดาวน์โหลดได้ */
    const caseClosed = useIsFormCaseClosed(1)
    const [activeSignKey, setActiveSignKey] = useState<string | null>(null)
    const [newPerson, setNewPerson] = useState({
        title: 'นาย',
        firstName: '',
        lastName: '',
        citizenId: '',
        relation: '',
        risk: 'ปานกลาง',
    })
    const [isAddingPerson, setIsAddingPerson] = useState(false)

    const tabs = [
        { label: '1. ผู้ยื่นคำร้อง', icon: 'fa-user-pen' },
        { label: '2. ข้อมูลพยาน', icon: 'fa-user-shield' },
        { label: '3-4. ผู้ติดต่อ/ความประสงค์', icon: 'fa-address-book' },
        { label: '5. พฤติการณ์ภัยคุกคาม', icon: 'fa-triangle-exclamation' },
        { label: '6. บุคคลที่เกี่ยวข้อง', icon: 'fa-users' },
        { label: '7. เอกสารประกอบ', icon: 'fa-paperclip' },
        { label: '8. ลายมือชื่อ', icon: 'fa-file-signature' },
        { label: 'รวมไฟล์ คบ.', icon: 'fa-folder-open' },
    ]

    const handleAddPerson = () => {
        if (!newPerson.firstName.trim() || !newPerson.lastName.trim()) {
            showToast('กรุณากรอกชื่อและนามสกุลบุคคลที่เกี่ยวข้อง')
            return
        }
        addRelatedPerson(newPerson)
        setNewPerson({ title: 'นาย', firstName: '', lastName: '', citizenId: '', relation: '', risk: 'ปานกลาง' })
        setIsAddingPerson(false)
        showToast('เพิ่มบุคคลที่เกี่ยวข้องแล้ว')
    }

    const handleFileUpload = (setId: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        /** คัดไฟล์ที่นามสกุลไม่รองรับ/เกิน 20MB ออกก่อน แล้วแจ้งเหตุผลรายไฟล์ */
        const { accepted, rejections } = filterValidAttachments(Array.from(files))
        e.target.value = ''
        rejections.forEach((message) => showToast(message, 'error'))
        if (accepted.length === 0) return
        accepted.forEach((file) => {
            addFileToSet(setId, { name: file.name, size: file.size, type: file.type })
        })
        showToast(`อัปโหลด ${accepted.length} ไฟล์สำเร็จ`)
    }

    return (
        <div className="ws-card overflow-hidden">
            <div className="flex border-b border-line bg-soft overflow-x-auto p-1.5 gap-1">
                {tabs.map((tab, idx) => (
                    <Button
                        key={idx}
                        type="button"
                        onClick={() => setSection(idx)}
                        className={`flex items-center gap-2 min-h-[44px] rounded-lg px-3 py-[0.68rem] text-[0.88rem] font-semibold whitespace-nowrap transition ${section === idx ? 'bg-navy text-white' : 'text-ink hover:bg-line/60'
                            }`}
                    >
                        <i className={`fa-solid ${tab.icon} text-[0.8rem]`} />
                        <span>{tab.label}</span>
                    </Button>
                ))}
            </div>

            <fieldset disabled={caseClosed && section !== 7} className="m-0 min-w-0 border-0 p-5 md:p-6 space-y-6">
                {caseClosed && <CaseClosedBanner />}
                {/* 1. ข้าพเจ้า (ผู้ยื่นคำร้อง) */}
                {section === 0 && (
                    <div className="space-y-5">
                        <Section title="หัวเอกสาร" hint="ปรากฏมุมขวาบนของแบบ คบ.1">
                            <DocHeaderFields formId={1} />
                        </Section>

                        <Section no="1." title="ข้าพเจ้า (ผู้ยื่นคำร้อง)">
                            <Grid cols={3}>
                                <Field formId={1} name="คำนำหน้า" label="นาย/นาง/นางสาว" required />
                                <Field formId={1} name="ชื่อ" label="ชื่อ" required />
                                <Field formId={1} name="นามสกุล" label="นามสกุล" required />
                            </Grid>
                            <Radios
                                formId={1}
                                name="ฐานะผู้ยื่น"
                                label="เกี่ยวข้องในฐานะ"
                                options={['พยาน', 'ผู้ซึ่งมีประโยชน์เกี่ยวข้อง', 'ผู้ยื่นคำร้องแทน']}
                                required
                            />
                            <Grid cols={4}>
                                <Field formId={1} name="บ้านเลขที่" label="ที่อยู่ปัจจุบัน บ้านเลขที่" />
                                <Field formId={1} name="หมู่ที่" label="หมู่ที่" />
                                <Field formId={1} name="ตำบล" label="ตำบล/แขวง" />
                                <Field formId={1} name="อำเภอ" label="อำเภอ/เขต" />
                            </Grid>
                            <Grid cols={3}>
                                <Field formId={1} name="จังหวัด" label="จังหวัด" />
                                <Field formId={1} name="รหัสไปรษณีย์" label="รหัสไปรษณีย์" />
                                <Field formId={1} name="เบอร์โทรศัพท์" label="โทรศัพท์" required />
                            </Grid>
                            <Grid cols={3}>
                                <Field
                                    formId={1}
                                    name="เลขบัตรประชาชน"
                                    label="เลขประจำตัวประชาชน (13 หลัก)"
                                    placeholder="1100400123456"
                                />
                                <Field formId={1} name="เลขบัตรเจ้าหน้าที่รัฐ" label="หรือเลขที่บัตรประจำตัวเจ้าหน้าที่ของรัฐ" />
                                <Field formId={1} name="สังกัด" label="สังกัด" />
                            </Grid>
                            <Grid>
                                <DateField formId={1} name="วันออกบัตร" label="วันออกบัตร" />
                                <DateField formId={1} name="บัตรหมดอายุ" label="บัตรหมดอายุ" />
                            </Grid>
                        </Section>
                    </div>
                )}

                {/* 2. ข้อมูลพยาน */}
                {section === 1 && (
                    <Section no="2." title="ข้อมูลพยาน" hint="กรอกเมื่อผู้ยื่นคำร้องไม่ใช่ตัวพยานเอง">
                        <Grid>
                            <Field formId={1} name="พยานชื่อ" label="ชื่อ นาย/นาง/นางสาว" required />
                            <Field formId={1} name="พยานนามสกุล" label="นามสกุล" required />
                        </Grid>
                        <Radios
                            formId={1}
                            name="อาชีพ"
                            label="อาชีพ"
                            options={['รับราชการ', 'รับจ้าง', 'นักศึกษา']}
                        />
                        <Field formId={1} name="อาชีพ" label="หรือระบุอาชีพอื่น ๆ" placeholder="เช่น เจ้าพนักงานพัสดุ" />
                        <Grid>
                            <Radios formId={1} name="สถานภาพ" label="สถานภาพ" options={['โสด', 'สมรส', 'หย่า', 'หม้าย']} />
                            <Field formId={1} name="จำนวนบุตร" label="บุตรจำนวน (คน)" />
                        </Grid>
                        <Grid>
                            <Field formId={1} name="ชื่อบิดา" label="ชื่อบิดา" />
                            <Field formId={1} name="ชื่อมารดา" label="ชื่อมารดา" />
                        </Grid>
                        <Grid cols={1}>
                            <Field formId={1} name="พยานที่อยู่" label="ที่อยู่ปัจจุบัน" />
                            <Field formId={1} name="พยานที่อยู่ต่อ" label="ที่อยู่ปัจจุบัน (ต่อ)" />
                        </Grid>
                        <Grid cols={3}>
                            <Field formId={1} name="พยานโทรศัพท์" label="โทรศัพท์" />
                            <Field formId={1} name="สถานที่ทำงาน" label="สถานที่ทำงาน" />
                            <Field formId={1} name="โทรศัพท์ที่ทำงาน" label="โทรศัพท์ที่ทำงาน" />
                        </Grid>
                        <Grid cols={3}>
                            <Field formId={1} name="พยานเลขบัตรประชาชน" label="เลขประจำตัวประชาชน (13 หลัก)" />
                            <Field formId={1} name="พยานเลขบัตรรัฐ" label="หรือเลขที่บัตรประจำตัวเจ้าหน้าที่ของรัฐ" />
                            <Field formId={1} name="พยานสังกัด" label="สังกัด" />
                        </Grid>
                        <Grid>
                            <DateField formId={1} name="พยานวันออกบัตร" label="วันออกบัตร" />
                            <DateField formId={1} name="พยานบัตรหมดอายุ" label="บัตรหมดอายุ" />
                        </Grid>
                        <Grid cols={3}>
                            <Field formId={1} name="line" label="Line ID" />
                            <Field formId={1} name="instagram" label="Instagram" />
                            <Field formId={1} name="facebook" label="Facebook" />
                        </Grid>
                    </Section>
                )}

                {/* 3-4 */}
                {section === 2 && (
                    <div className="space-y-5">
                        <Section no="3." title="บุคคลที่สามารถติดต่อได้">
                            <Grid>
                                <Field formId={1} name="ผู้ติดต่อได้" label="ชื่อ - สกุล" />
                                <Field formId={1} name="ผู้ติดต่อที่อยู่" label="ที่อยู่" />
                            </Grid>
                            <Grid cols={3}>
                                <Field formId={1} name="ผู้ติดต่อโทรศัพท์" label="โทรศัพท์" />
                                <Field formId={1} name="ผู้ติดต่อที่ทำงาน" label="สถานที่ทำงาน" />
                                <Field formId={1} name="ผู้ติดต่อโทรที่ทำงาน" label="โทรศัพท์ที่ทำงาน" />
                            </Grid>
                        </Section>

                        <Section no="4." title="ความประสงค์ขอรับการคุ้มครอง">
                            <Radios
                                formId={1}
                                name="ช่วงเวลาคุ้มครอง"
                                label="มีความประสงค์จะขอรับการคุ้มครองจากการ"
                                options={['จะมาเป็นพยาน', 'ได้มาเป็นพยาน']}
                                required
                            />
                            <Area
                                formId={1}
                                name="เกี่ยวข้องกับคดี"
                                label="ในเรื่องร้องเรียน/กล่าวหา"
                                rows={2}
                                placeholder="ระบุชื่อสำนวนคดีหรือเลขที่คดีของ ป.ป.ท."
                                required
                            />
                        </Section>
                    </div>
                )}

                {/* 5. พฤติการณ์ */}
                {section === 3 && (
                    <Section
                        no="5."
                        title="พฤติการณ์แห่งคดีที่เป็นพยานและความไม่ปลอดภัยที่พยานได้รับ"
                        hint="รายละเอียดของคดี การเข้าเป็นพยานในคดีดังกล่าว และพฤติการณ์ที่แสดงถึงความไม่ปลอดภัย"
                    >
                        <Checks
                            formId={1}
                            name="ภัยคุกคามที่เลือก"
                            label="ลักษณะภัยคุกคาม (เลือกได้หลายข้อ — ไม่เลือกเลยคือ ‘ไม่มี’)"
                            options={THREAT_OPTIONS}
                            columns
                        />
                        <div className="ws-readonly text-[0.88rem] leading-relaxed text-muted">
                            {THREAT_OPTIONS.map((o) => (
                                <div key={o}>
                                    <strong className="text-ink">{o}</strong> — {THREAT_LABELS[o]}
                                </div>
                            ))}
                        </div>
                        <Field formId={1} name="ภัยคุกคามอื่นๆ" label="อื่น ๆ (ระบุ)" />
                        <Area
                            formId={1}
                            name="พฤติการณ์ภัยคุกคาม"
                            label="รายละเอียดพฤติการณ์"
                            rows={6}
                            placeholder="บรรยายพฤติการณ์ วัน เวลา สถานที่ และบุคคลที่ก่อให้เกิดภัยคุกคาม..."
                            required
                        />
                    </Section>
                )}

                {/* 6. บุคคลที่เกี่ยวข้อง */}
                {section === 4 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-line pb-2">
                            <div>
                                <h3 className="text-[0.95rem] font-semibold text-navy">
                                    <span className="mr-1.5 text-blue">6.</span>กรณีขอให้มีการคุ้มครองบุคคลที่เกี่ยวข้อง
                                </h3>
                                <p className="text-[0.8rem] text-muted">
                                    ระบุชื่อและพฤติการณ์ที่แสดงให้เห็นถึงความไม่ปลอดภัย (ต้นฉบับรองรับ 4 ราย)
                                </p>
                            </div>
                            <Button
                                type="button"
                                onClick={() => setIsAddingPerson(true)}
                                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-3 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
                            >
                                <i className="fa-solid fa-plus text-[0.8rem]" />
                                เพิ่มบุคคลที่เกี่ยวข้อง
                            </Button>
                        </div>

                        {isAddingPerson && (
                            <div className="rounded-lg border border-line bg-blue-soft p-4 space-y-3">
                                <div className="text-[0.95rem] font-semibold text-navy">ระบุข้อมูลบุคคลที่เกี่ยวข้อง</div>
                                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                                    <div>
                                        <label className="ws-label">คำนำหน้า</label>
                                        <select
                                            value={newPerson.title}
                                            onChange={(e) => setNewPerson({ ...newPerson, title: e.target.value })}
                                            className="ws-input"
                                        >
                                            {['นาย', 'นาง', 'นางสาว', 'ด.ช.', 'ด.ญ.'].map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="ws-label">ชื่อ</label>
                                        <input
                                            type="text"
                                            value={newPerson.firstName}
                                            onChange={(e) => setNewPerson({ ...newPerson, firstName: e.target.value })}
                                            className="ws-input"
                                        />
                                    </div>
                                    <div>
                                        <label className="ws-label">นามสกุล</label>
                                        <input
                                            type="text"
                                            value={newPerson.lastName}
                                            onChange={(e) => setNewPerson({ ...newPerson, lastName: e.target.value })}
                                            className="ws-input"
                                        />
                                    </div>
                                    <div>
                                        <label className="ws-label">
                                            เลขประจำตัวประชาชน
                                        </label>
                                        <input
                                            type="text"
                                            value={newPerson.citizenId}
                                            onChange={(e) => setNewPerson({ ...newPerson, citizenId: e.target.value })}
                                            className="ws-input"
                                        />
                                    </div>
                                    <div>
                                        <label className="ws-label">
                                            เกี่ยวข้องในฐานะ
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="เช่น บุตร, บิดา, คู่สมรส"
                                            value={newPerson.relation}
                                            onChange={(e) => setNewPerson({ ...newPerson, relation: e.target.value })}
                                            className="ws-input"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                    <Button
                                        type="button"
                                        onClick={() => setIsAddingPerson(false)}
                                        className="min-h-[44px] rounded-lg px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy bg-[#edf2f6] hover:bg-line"
                                    >
                                        ยกเลิก
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={handleAddPerson}
                                        className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-navy px-4 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue"
                                    >
                                        บันทึกรายการ
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="ws-callout text-[0.88rem] leading-relaxed">
                            <i className="fa-solid fa-circle-info mr-1.5" />
                            พยาน<strong>และบุคคลที่เกี่ยวข้องทุกคน</strong>ต้องลงลายมือชื่อยินยอม
                            เนื่องจากการคุ้มครองอาจกระทบต่อข้อจำกัดสิทธิ์บางประการ
                        </div>

                        <div className="space-y-2">
                            {relatedPersons.map((p, idx) => {
                                const signKey = `kb1-person-${p.id}`
                                const sign = signatures[signKey]
                                return (
                                    <div
                                        key={p.id}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-line bg-white p-3.5"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-[0.95rem] font-semibold text-navy">
                                                {idx + 1}. {p.title} {p.firstName} {p.lastName}
                                            </div>
                                            <div className="text-[0.8rem] text-muted mt-0.5">
                                                เลขประจำตัวประชาชน: <span className="font-semibold text-ink">{p.citizenId || '-'}</span>{' '}
                                                | เกี่ยวข้องในฐานะ: <span className="font-semibold text-ink">{p.relation || '-'}</span> |
                                                ความไม่ปลอดภัย: <span className="font-semibold text-blue-700">{p.risk}</span>
                                            </div>
                                            <div className="text-[0.8rem] mt-1">
                                                {sign?.signed ? (
                                                    <span className="font-bold text-success">
                                                        <i className="fa-solid fa-circle-check mr-1" />
                                                        ลงลายมือชื่อยินยอมแล้ว ({sign.signedAt})
                                                    </span>
                                                ) : (
                                                    <span className="font-semibold text-warning">
                                                        <i className="fa-solid fa-circle-exclamation mr-1" />
                                                        ยังไม่ได้ลงลายมือชื่อยินยอม
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <Button
                                                type="button"
                                                onClick={() => setActiveSignKey(signKey)}
                                                className={`flex items-center gap-1.5 min-h-[44px] rounded-lg px-3 py-[0.68rem] text-[0.88rem] font-semibold transition ${sign?.signed
                                                        ? 'border border-[#aebdca] bg-white text-ink hover:bg-soft'
                                                        : 'bg-blue text-white hover:bg-blue-dark'
                                                    }`}
                                            >
                                                <i className="fa-solid fa-pen-nib" />
                                                {sign?.signed ? 'ลงนามใหม่' : 'ลงลายมือชื่อยินยอม'}
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={() => removeRelatedPerson(p.id)}
                                                className="rounded-lg p-1.5 text-danger hover:bg-danger-soft transition"
                                                title="ลบรายการ"
                                            >
                                                <i className="fa-solid fa-trash text-[0.8rem]" />
                                            </Button>
                                        </div>
                                    </div>
                                )
                            })}
                            {relatedPersons.length > 4 && (
                                <div className="text-[0.8rem] font-semibold text-warning">
                                    ต้นฉบับ คบ.1 หน้า 3 มีช่องกรอกเพียง 4 ราย — รายที่เกิน 4 จะไม่ปรากฏบนกระดาษ
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 7. เอกสารประกอบ */}
                {section === 5 && (
                    <div className="space-y-5">
                        <Section no="7." title="เอกสารประกอบการยื่นคำร้อง">
                            <Checks
                                formId={1}
                                name="เอกสารประกอบ"
                                label="ประเภทเอกสารที่แนบ"
                                options={['หลักฐานแสดงการเป็นพยาน', 'หลักฐานแสดงความเสียหาย']}
                                columns
                            />
                            <Field formId={1} name="เอกสารอื่นๆ" label="อื่น ๆ (ระบุ)" />
                        </Section>

                        <div className="flex items-center justify-between border-b border-line pb-2">
                            <div>
                                <h4 className="text-[0.95rem] font-semibold text-navy">ไฟล์แนบ</h4>
                                <p className="text-[0.8rem] text-muted">
                                    อัปโหลดสำเนาบัตรประชาชน ใบรับรองแพทย์ ภาพถ่าย หรือบันทึกประจำวัน
                                </p>
                            </div>
                            <Button
                                type="button"
                                onClick={() => addAttachmentSet('หลักฐานเพิ่มเติม', 'ชุดเอกสารที่เกี่ยวข้อง', 1)}
                                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#9aabba] bg-white px-3 py-[0.68rem] text-[0.88rem] font-semibold text-navy hover:bg-soft transition"
                            >
                                <i className="fa-solid fa-folder-plus text-[0.8rem]" />
                                เพิ่มชุดเอกสาร
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {attachmentSets
                                .filter((set) => (set.formId ?? 1) === 1)
                                .map((set) => (
                                    <div key={set.id} className="rounded-lg border border-line bg-white p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="text-[0.95rem] font-semibold text-navy">{set.category}</div>
                                                <div className="text-[0.8rem] text-muted">{set.description}</div>
                                            </div>
                                            <label className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-blue-soft border border-line px-3 py-[0.68rem] text-[0.88rem] font-semibold text-blue-700 hover:bg-blue-100 cursor-pointer">
                                                <i className="fa-solid fa-cloud-arrow-up" />
                                                เพิ่มไฟล์
                                                <input type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" onChange={(e) => handleFileUpload(set.id, e)} />
                                            </label>
                                        </div>

                                        {set.files.length > 0 ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {set.files.map((file, fIdx) => (
                                                    <div
                                                        key={fIdx}
                                                        className="flex items-center justify-between rounded-lg border border-line bg-soft p-2.5"
                                                    >
                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                            <i className="fa-solid fa-file-pdf text-danger text-sm" />
                                                            <span className="truncate text-[0.8rem] font-medium text-ink">{file.name}</span>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            onClick={() => removeFileFromSet(set.id, fIdx)}
                                                            className="text-muted hover:text-danger ml-2"
                                                        >
                                                            <i className="fa-solid fa-xmark text-[0.8rem]" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="rounded-lg border border-dashed border-line p-3 text-center text-[0.8rem] text-muted">
                                                ยังไม่มีไฟล์ในชุดนี้
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* 8. ลายมือชื่อ */}
                {section === 6 && (
                    <div className="space-y-4">
                        <Section
                            no="8."
                            title="การรับทราบสิทธิและลงลายมือชื่อ"
                            hint="ผู้ยื่นคำร้องรับทราบสิทธิและยินยอมปฏิบัติตามหลักเกณฑ์ วิธีการ และเงื่อนไข 8 ข้อของสำนักงาน ป.ป.ท. ตามที่ปรากฏบนกระดาษหน้า 4"
                        >
                            <Field
                                formId={1}
                                name="ตำแหน่งเจ้าพนักงาน"
                                label="ตำแหน่งเจ้าพนักงานผู้รับคำร้อง"
                                placeholder="นักสืบสวนสอบสวนชำนาญการ"
                            />
                        </Section>

                        {/* ลายมือชื่อผู้ขอคุ้มครอง — ลงชื่อด้วยตนเองผ่านลิงก์เท่านั้น เจ้าหน้าที่ลงชื่อแทนไม่ได้ */}
                        {caseNo ? (
                            <ApplicantConsentPanel caseNo={caseNo} />
                        ) : (
                            <div className="rounded-lg border border-line bg-white p-4">
                                <div className="text-[0.95rem] font-semibold text-navy">ลายมือชื่อผู้ขอคุ้มครอง (ผู้ยื่นคำร้อง)</div>
                                <p className="text-[0.8rem] text-muted mt-1">
                                    เปิดแบบ คบ.1 จากแฟ้มคำร้องเพื่อส่งลิงก์ให้ผู้ขอคุ้มครองลงชื่อด้วยตนเอง
                                </p>
                            </div>
                        )}

                        {/* ลายมือชื่อเจ้าหน้าที่ — แยกจากลายมือชื่อผู้ขอคุ้มครองโดยสิ้นเชิง */}
                        <div className="rounded-lg border border-line bg-white p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-[0.95rem] font-semibold text-navy">ลายมือชื่อเจ้าหน้าที่ (เจ้าพนักงานผู้รับคำร้อง)</div>
                                    <p className="text-[0.8rem] text-muted mt-1">เจ้าพนักงาน ป.ป.ท. ตรวจรับและรับรองความครบถ้วน</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="rounded-lg bg-soft border border-line px-4 py-2 text-center min-w-[11rem]">
                                        {signatures['kb1-officer']?.signed ? (
                                            <div>
                                                <div className="text-sm font-bold text-navy-mid italic font-serif underline decoration-blue-500">
                                                    {signatures['kb1-officer'].signerName}
                                                </div>
                                                <div className="text-[0.8rem] text-success font-bold mt-1">
                                                    ✓ ลงนามแล้ว ({signatures['kb1-officer'].signedAt})
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-[0.8rem] text-muted italic">ยังไม่ได้ลงลายมือชื่อ</div>
                                        )}
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={() => setActiveSignKey('kb1-officer')}
                                        data-testid="kb1-officer-sign-button"
                                        className="flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg px-4 py-[0.68rem] text-[0.88rem] font-semibold text-white transition bg-warning hover:bg-gold"
                                    >
                                        <i className="fa-solid fa-stamp" />
                                        {signatures['kb1-officer']?.signed ? 'ลงนามใหม่' : 'เจ้าพนักงานลงนามรับรอง'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* รวมไฟล์ คบ. — ไฟล์แนบของแบบ คบ. ทุกฉบับในสำนวนเดียวกัน */}
                {section === 7 && <FormFilesPanel formId={1} />}
            </fieldset>

            <div className="flex items-center justify-between border-t border-line bg-soft px-5 py-3.5">
                <Button
                    type="button"
                    disabled={section === 0}
                    onClick={() => setSection(Math.max(0, section - 1))}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy hover:bg-soft transition disabled:opacity-40"
                >
                    <i className="fa-solid fa-arrow-left" />
                    ส่วนก่อนหน้า
                </Button>

                <div className="flex gap-2">
                    {section < tabs.length - 1 && (
                        <Button
                            type="button"
                            onClick={() => setSection(section + 1)}
                            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-5 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
                        >
                            ส่วนถัดไป
                            <i className="fa-solid fa-arrow-right" />
                        </Button>
                    )}
                    {/* ลงนามครบแล้วบันทึกได้ทันที ไม่ต้องผ่านแท็บรวมไฟล์ */}
                    {section >= tabs.length - 2 && (
                        <Button
                            type="button"
                            disabled={caseClosed}
                            onClick={() => {
                                const missing = KB1_REQUIRED_FIELDS.filter((f) => !String(draft[f.name] ?? '').trim())
                                if (missing.length > 0) {
                                    showToast(`กรุณากรอกฟิลด์บังคับให้ครบก่อนบันทึก: ${missing.map((m) => m.label).join(' / ')}`, 'error')
                                    setSection(0)
                                    return
                                }
                                showToast('บันทึกแบบ คบ.1 ฉบับสมบูรณ์เรียบร้อยแล้ว')
                                onSaved?.()
                            }}
                            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-success px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-success-dark transition"
                        >
                            <i className="fa-solid fa-check" />
                            บันทึกแบบ คบ.1
                        </Button>
                    )}
                </div>
            </div>

            {activeSignKey && (() => {
                const signMeta = {
                    title: activeSignKey.startsWith('kb1-person-')
                        ? 'ลงลายมือชื่อยินยอมของบุคคลที่เกี่ยวข้อง'
                        : 'ลงลายมือชื่อเจ้าพนักงาน',
                    signerRole: activeSignKey.startsWith('kb1-person-')
                        ? 'บุคคลที่เกี่ยวข้องและอยู่ในความดูแล'
                        : 'เจ้าพนักงาน ป.ป.ท.',
                    defaultSignerName: activeSignKey.startsWith('kb1-person-')
                        ? (() => {
                            const pid = Number(activeSignKey.replace('kb1-person-', ''))
                            const person = relatedPersons.find((rp) => rp.id === pid)
                            return person ? `${person.title}${person.firstName} ${person.lastName}` : ''
                        })()
                        : 'นางสาวอรุณี ใจมั่น',
                }

                return (
                    <SignatureModal
                        isOpen
                        title={signMeta.title}
                        signerRole={signMeta.signerRole}
                        defaultSignerName={signMeta.defaultSignerName}
                        onClose={() => setActiveSignKey(null)}
                        onConfirm={(name, img) => {
                            signDocument(activeSignKey, name, img)
                            setActiveSignKey(null)
                            showToast('บันทึกลายมือชื่ออิเล็กทรอนิกส์แล้ว')
                        }}
                        onGenerateLink={() => {
                            const token = createSignatureLink({
                                title: signMeta.title,
                                signerRole: signMeta.signerRole,
                                defaultSignerName: signMeta.defaultSignerName,
                                target: { kind: 'formDraft', key: activeSignKey },
                            })
                            setActiveSignKey(null)
                            showLinkDialog('สร้างลิงก์เซ็นทางไกลสำเร็จ', `${window.location.origin}/sign/${token}`)
                        }}
                    />
                )
            })()}
        </div>
    )
}
