import { Button } from '../common/Button'
import React from 'react'
import { showToast } from '../../lib/swal'
import { useCaseStore } from '../../store/useCaseStore'
import { VersionHistory, VersionHistoryEntry } from '../common/VersionHistory'
import { DateField, EditorShell, Field, Grid, Section, Select } from './fields/FormKit'
import { article14Agency } from '../../lib/constants'

interface Article14LetterEditorProps {
    onSaved?: () => void
    /** แฟ้มคำร้องที่เปิดหนังสือฉบับนี้ — ใช้ดึงประวัติเวอร์ชันของหนังสือในเส้นทางข้อ 14 */
    caseNo?: string
}

/** ประวัติฉบับที่ถูกส่งคืนของหนังสือข้อ 14 — เก็บที่ CaseItem.article14LetterPreviousVersions */
interface LetterPreviousVersion {
    version: number
    returnedAt: string
    returnedBy: string
    returnReason: string
}

const MEASURE_OPTIONS = ['มาตรการทั่วไป', 'มาตรการพิเศษ']

/** หนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยาน (สำนักงาน ป.ป.ท. → อธิบดีกรมคุ้มครองสิทธิและเสรีภาพ) ใช้แทน คบ.3 ในเส้นทางส่งต่อข้อ 14 */
export const Article14LetterEditor: React.FC<Article14LetterEditorProps> = ({ onSaved, caseNo }) => {
    const getCase = useCaseStore((s) => s.getCase)
    const caseItem = caseNo ? getCase(caseNo) : undefined
    /** หน่วยงานปลายทางที่เลือกตอนเสนอ (ค่าตั้งต้นกรมคุ้มครองสิทธิฯ) */
    const agency = article14Agency(caseItem)

    /** ฟิลด์เวอร์ชันหนังสือถูกเพิ่มในเส้นทางข้อ 14 — อ่านผ่านชนิดแคบเพื่อไม่ผูกกับลำดับการแก้ types/case.ts */
    const letterCase = caseItem as
        | { article14?: { letterVersion?: number }; article14LetterPreviousVersions?: LetterPreviousVersion[] }
        | undefined
    const letterVersion = letterCase?.article14?.letterVersion || 1
    const previousVersions = letterCase?.article14LetterPreviousVersions || []
    const historyEntries: VersionHistoryEntry[] = previousVersions.map((v) => ({
        version: v.version,
        at: v.returnedAt,
        by: v.returnedBy,
        status: 'returned',
        note: v.returnReason,
    }))

    return (
        <EditorShell
            code={`หนังสือส่ง${agency.short}`}
            formId={18}
            title="หนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยาน"
            hint={`หนังสือสำนักงาน ป.ป.ท. ถึง${agency.recipient} แจ้งมติให้มีมาตรการช่วยเหลือแก่พยาน`}
            caseNo={caseNo}
            footer={
                <Button
                    type="button"
                    onClick={() => {
                        /** บันทึกฉบับปัจจุบันแล้ว — ปลดล็อกปุ่ม "ส่งให้ผู้บังคับบัญชาชั้นต้น" ในแฟ้ม */
                        if (caseNo) useCaseStore.getState().markArticle14LetterSaved(caseNo)
                        showToast(`บันทึกหนังสือแจ้ง${agency.short} เรียบร้อยแล้ว`)
                        onSaved?.()
                    }}
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
                >
                    <i className="fa-solid fa-check" />
                    บันทึกหนังสือ
                </Button>
            }
        >
            <VersionHistory code="article14-letter" currentVersion={letterVersion} entries={historyEntries} />

            <Section title="ข้อมูลหนังสือ">
                <Grid>
                    <Field formId={18} name="เลขที่หนังสือ" label="เลขที่หนังสือ (ต่อจาก ปป ๐๐๑๒/)" required />
                    <DateField formId={18} name="วันที่หนังสือ" label="วันที่หนังสือ" required />
                </Grid>
            </Section>

            <Section title="ข้อมูลพยาน">
                <Grid>
                    <Field formId={18} name="ชื่อพยาน" label="ชื่อพยาน" required />
                    <Field formId={18} name="อายุ" label="อายุ" />
                </Grid>
                <Field formId={18} name="เลขบัตรประชาชน" label="เลขบัตรประชาชน" />
                <Grid cols={4}>
                    <Field formId={18} name="ภูมิลำเนา" label="บ้านเลขที่/ภูมิลำเนา" />
                    <Field formId={18} name="หมู่ที่" label="หมู่ที่" />
                    <Field formId={18} name="ตำบล" label="ตำบล" />
                    <Field formId={18} name="อำเภอ" label="อำเภอ" />
                </Grid>
                <Field formId={18} name="จังหวัด" label="จังหวัด" />
            </Section>

            <Section title="มติคณะกรรมการ ป.ป.ท.">
                <Grid>
                    <Field formId={18} name="ครั้งที่ประชุม" label="ครั้งที่ประชุม" />
                    <DateField formId={18} name="วันที่ประชุม" label="วันที่ประชุม" />
                </Grid>
                <Field formId={18} name="ระเบียบวาระ" label="ระเบียบวาระ" />
                <Grid>
                    <Field formId={18} name="มติ" label="มติ" placeholder="เอกฉันท์" />
                    <Select formId={18} name="มาตรการ" label="มาตรการ" options={MEASURE_OPTIONS} />
                </Grid>
            </Section>

            <Section title="ผู้ลงนามและส่วนราชการ">
                <Grid>
                    <Field formId={18} name="ผู้ลงนาม" label="ผู้ลงนาม" required />
                    <Field formId={18} name="ตำแหน่งผู้ลงนาม" label="ตำแหน่งผู้ลงนาม" />
                </Grid>
                <Field formId={18} name="ส่วนราชการเจ้าของเรื่อง" label="ส่วนราชการเจ้าของเรื่อง" />
                <Grid>
                    <Field formId={18} name="โทรศัพท์" label="โทรศัพท์" />
                    <Field formId={18} name="โทรสาร" label="โทรสาร" />
                </Grid>
            </Section>
        </EditorShell>
    )
}
