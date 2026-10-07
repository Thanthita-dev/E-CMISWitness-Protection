import React, { useState } from 'react'
import { Button } from '../common/Button'
import { SignatureModal } from '../common/SignatureModal'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import { useSignatureLinkStore } from '../../store/useSignatureLinkStore'
import { showToast, showLinkDialog } from '../../lib/swal'
import { ECMIS_USER_DIRECTORY } from '../../lib/constants'
import { KB6_DEFAULT_OPINION, KB6_SIGNERS, Kb6Signer, canEditKb6Opinion } from '../../lib/formSignature'
import { activateCaseForms } from '../../lib/formPrefill'

interface Kb6SignatureActionsProps {
    /** เลขคำร้องของแฟ้มที่เปิดแบบ คบ.6 นี้ — ไม่มีเมื่อเปิดจากคลังแบบฟอร์มโดยไม่ผูกแฟ้ม */
    caseNo?: string
}

/**
 * ปุ่ม "ลงนาม" ของแบบ คบ.6 (ข้อ 10–13) — วางไว้ในแถบปุ่มท้ายหน้ากรอกแบบ /form/6 ข้าง "บันทึกแบบ คบ.6"
 * (TC-011) ความเห็นของแต่ละข้อกรอกในแบบฟอร์มเอง (แหล่งเดียว) — โมดัลนี้จึงไม่มีช่องความเห็นซ้ำอีก
 * มีแค่ผู้ลงนามคนเดียวที่ "ถึงคิว" ในเวลาหนึ่ง (ตามขั้นตอนของแฟ้ม) ปุ่มจึงแสดงชื่อ "ลงนาม" เฉย ๆ
 */
export const Kb6SignatureActions: React.FC<Kb6SignatureActionsProps> = ({ caseNo }) => {
    const { currentRole, currentOrgUnitId, getCurrentDirectorAccount } = useAuthStore()
    const { getCase, signKb6 } = useCaseStore()
    /**
     * ช่องชื่อผู้ลงนามในแบบ คบ.6 เขียนผ่าน updateSignedField เพราะฉบับอาจถูกล็อกทั้งฉบับแล้ว
     * (ล็อกกันแก้เนื้อหาส่วนของเจ้าหน้าที่ ไม่ได้กันการเติมชื่อผู้ลงนามของขั้นตอนนี้)
     */
    const updateSignedField = useFormDraftStore((s) => s.updateSignedField)
    const kb6Draft = useFormDraftStore((s) => selectCaseDraft(s, 6, caseNo))
    const createSignatureLink = useSignatureLinkStore((s) => s.createLink)
    const [signRole, setSignRole] = useState<string | null>(null)

    const caseItem = caseNo ? getCase(caseNo) : undefined

    if (!caseItem) return null

    /** ผู้ลงนามที่ถึงคิวของ currentRole อยู่ในเวลานี้ — มีได้อย่างมากหนึ่งคนต่อแฟ้ม (ผูกกับ stage) */
    const pendingSigner = KB6_SIGNERS.find((s) => canEditKb6Opinion(s, currentRole, caseItem))
    const activeSigner = KB6_SIGNERS.find((s) => s.role === signRole)

    /** ชื่อที่เติมให้อัตโนมัติในกล่องลงนาม — ผูกกับบัญชีที่กำลังสวมบทบาทอยู่ */
    /**
     * TC-011 (BUG-002) — ชื่อผู้ลงนามต้องเป็นบัญชีของ "บทบาทที่ลงนามจริง" ไม่ใช่เจ้าหน้าที่เจ้าของสำนวน
     * ผบช.ชั้นต้น/รองเลขาฯ/เลขาฯ หาจากทะเบียนผู้ใช้ตามบทบาท (เลือกสังกัดเดียวกับที่สวมบทบาทอยู่ก่อน) ผอ. ใช้บัญชีที่เลือกไว้
     */
    const accountNameForRole = (userRole: string): string => {
        const candidates = ECMIS_USER_DIRECTORY.filter((u) => u.active && u.roles.includes(userRole as never))
        return (candidates.find((u) => u.orgUnitId === currentOrgUnitId) ?? candidates[0])?.name || ''
    }
    const defaultSignerName = (signer: Kb6Signer): string => {
        if (signer.role === 'director') return getCurrentDirectorAccount()?.name || accountNameForRole(signer.userRole)
        return accountNameForRole(signer.userRole)
    }

    /**
     * WIT0507 — ลายมือชื่อข้อ 10–13 ต้องมีความเห็นรองรับ โหมดสาธิตให้กด "ลงนาม" ได้ทันที:
     * ถ้ายังไม่ได้กรอกความเห็นในแบบฟอร์ม ระบบเติมความเห็นตั้งต้น (KB6_DEFAULT_OPINION) ให้ข้อนั้นก่อนลงนาม
     */
    const opinionOf = (signer: Kb6Signer) => String(kb6Draft[signer.opinionField] ?? '')
    const ensureOpinion = (signer: Kb6Signer) => {
        if (opinionOf(signer).trim()) return
        /** ผูกร่าง คบ.6 กับแฟ้มนี้ก่อนเขียน (กดลงนามจากหน้าแฟ้มได้โดยไม่ต้องเปิดแบบฟอร์ม) */
        activateCaseForms(caseItem, [6])
        updateSignedField(6, signer.opinionField, KB6_DEFAULT_OPINION)
    }

    const handleOpenSign = () => {
        if (!pendingSigner) return
        setSignRole(pendingSigner.role)
    }

    const handleConfirmSign = (signerName: string) => {
        if (!activeSigner) return
        ensureOpinion(activeSigner)
        signKb6(caseItem.no, activeSigner.role, signerName)
        /** เติมชื่อผู้ลงนามลงในช่องของแบบ คบ.6 เพื่อให้ฉบับพิมพ์ A4 ตรงกับผู้ลงนามจริง */
        if (signerName.trim()) {
            activateCaseForms(caseItem, [6])
            updateSignedField(6, activeSigner.nameField, signerName)
        }
        showToast(`ลงนาม${activeSigner.label} (ข้อ ${activeSigner.no}) ใน คบ.6 แล้ว`)
        setSignRole(null)
    }

    const handleGenerateLink = () => {
        if (!activeSigner) return
        /** ลิงก์เซ็นทางไกลก็ต้องมีความเห็นรองรับ — ว่างอยู่ให้เติมความเห็นตั้งต้นก่อนสร้างลิงก์ */
        ensureOpinion(activeSigner)
        const token = createSignatureLink({
            title: `ลงนาม${activeSigner.label}ในแบบ คบ.6`,
            signerRole: activeSigner.signerRole,
            defaultSignerName: defaultSignerName(activeSigner),
            target: { kind: 'kb6', caseNo: caseItem.no, role: activeSigner.role },
        })
        setSignRole(null)
        showLinkDialog('สร้างลิงก์เซ็นทางไกลสำเร็จ', `${window.location.origin}/sign/${token}`)
    }

    return (
        <>
            {pendingSigner && (
                <Button
                    type="button"
                    onClick={handleOpenSign}
                    data-testid="kb6-sign-button"
                    className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy-mid px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-navy transition"
                >
                    {/* aria-hidden — ไอคอนของ FontAwesome มีเนื้อหาจริงผ่าน ::before จึงถูกนับเป็นส่วนหนึ่งของ
                        accessible name ถ้าไม่ซ่อนไว้ ชื่อปุ่มต้องเป็น "ลงนาม" เป๊ะ ๆ (TC-011 อ้างชื่อนี้ตรง ๆ) */}
                    <i className="fa-solid fa-pen-nib" aria-hidden="true" />
                    ลงนาม
                </Button>
            )}

            {activeSigner && (
                <SignatureModal
                    isOpen
                    title={`ลงนาม${activeSigner.label} (ข้อ ${activeSigner.no}) ในแบบ คบ.6`}
                    signerRole={activeSigner.signerRole}
                    defaultSignerName={defaultSignerName(activeSigner)}
                    onClose={() => setSignRole(null)}
                    onConfirm={(signerName) => handleConfirmSign(signerName)}
                    onGenerateLink={handleGenerateLink}
                />
            )}
        </>
    )
}
