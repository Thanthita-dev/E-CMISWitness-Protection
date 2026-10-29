import { isGotIntakeCase } from '../../lib/protectionHandoff'
import React, { useState } from 'react'
import { SignatureModal } from '../common/SignatureModal'
import { PaperSignRegistration } from './paper/paperSign'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import { useSignatureLinkStore } from '../../store/useSignatureLinkStore'
import { showToast, showLinkDialog, showConfirmAlert, confirmBody } from '../../lib/swal'
import { ECMIS_USER_DIRECTORY } from '../../lib/constants'
import {
    KB6_DEFAULT_OPINION,
    KB6_SIGNERS,
    Kb6Signer,
    canEditKb6Opinion,
    extensionKb6PendingSigner,
    addendumLabel,
    getActiveExtensionDocs,
} from '../../lib/formSignature'
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
    const { getCase, signKb6, signExtensionKb6 } = useCaseStore()
    /**
     * ช่องชื่อผู้ลงนามในแบบ คบ.6 เขียนผ่าน updateSignedField เพราะฉบับอาจถูกล็อกทั้งฉบับแล้ว
     * (ล็อกกันแก้เนื้อหาส่วนของเจ้าหน้าที่ ไม่ได้กันการเติมชื่อผู้ลงนามของขั้นตอนนี้)
     */
    const updateSignedField = useFormDraftStore((s) => s.updateSignedField)
    const kb6Draft = useFormDraftStore((s) => selectCaseDraft(s, 6, caseNo))
    const createSignatureLink = useSignatureLinkStore((s) => s.createLink)
    const [signRole, setSignRole] = useState<string | null>(null)

    const appealSignatures = useFormDraftStore((s) => caseNo && s.draftCaseNo[6] !== caseNo ? s.caseDrafts[caseNo]?.signatures : s.signatures)
    const caseItem = caseNo ? getCase(caseNo) : undefined

    if (!caseItem) return null

    /** ผู้ลงนามที่ถึงคิวของ currentRole อยู่ในเวลานี้ — มีได้อย่างมากหนึ่งคนต่อแฟ้ม (ผูกกับ stage) */
    /** รอบขยายเวลาที่มี คบ.3/คบ.6 ฉบับใหม่แนบอยู่ — ลงนามไปพร้อมการเห็นชอบ คบ.14 ตามลำดับชั้นเดียวกัน */
    const extDocs = getActiveExtensionDocs(caseItem)
    const extPending = extDocs ? extensionKb6PendingSigner(caseItem, currentRole) : null
    const pendingSigner = extDocs
        ? extPending
        : KB6_SIGNERS.find((s) => canEditKb6Opinion(s, currentRole, caseItem) && (!caseItem.appealFolder?.addendum || !appealSignatures?.[`kb6-${s.role}`]?.signed))
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
        /** FB-018 — รอบแก้ไขที่ กอท. รับไปทำ: ผู้ลงนามข้อ 10 / 11 คือบัญชีสาย กอท. ที่สวมบทบาทอยู่ */
        if ((caseItem.gotRevision || isGotIntakeCase(caseItem)) && currentRole.startsWith('got_') && ['supervisor', 'director'].includes(signer.role)) {
            return accountNameForRole(currentRole)
        }
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
        const choice = extDocs
            ? useFormDraftStore.getState().getDraft(6)[signer.role === 'secretary' ? 'ผลความเห็นเลขาธิการขยายเวลา' : 'ผลความเห็นรองเลขาธิการขยายเวลา']
            : caseItem.appealFolder?.addendum
            ? useFormDraftStore.getState().getDraft(6)[signer.role === 'secretary' ? 'ผลความเห็นเลขาธิการอุทธรณ์' : 'ผลความเห็นรองเลขาธิการอุทธรณ์']
            : signer.role === 'secretary' ? caseItem.kb6SecretaryOpinionChoice : caseItem.kb6DeputyOpinionChoice
        const defaultOpinion = ['deputy', 'secretary'].includes(signer.role) && choice === 'disagree'
            ? 'ไม่เห็นควรดำเนินการตามที่เสนอ' : KB6_DEFAULT_OPINION
        updateSignedField(6, signer.opinionField, defaultOpinion)
    }

    const hasOpinionChoice = (signer: Kb6Signer) => {
        if (extDocs || !['deputy', 'secretary'].includes(signer.role)) return true
        const current = useCaseStore.getState().getCase(caseItem.no)
        const choice = current?.appealFolder?.addendum
            ? useFormDraftStore.getState().getDraft(6)[signer.role === 'secretary' ? 'ผลความเห็นเลขาธิการอุทธรณ์' : 'ผลความเห็นรองเลขาธิการอุทธรณ์']
            : signer.role === 'secretary' ? current?.kb6SecretaryOpinionChoice : current?.kb6DeputyOpinionChoice
        if (choice === 'agree' || choice === 'disagree') return true
        showToast(`กรุณาเลือกเห็นควรหรือไม่เห็นควรในข้อ ${signer.no} ก่อนลงนาม`, 'warning')
        return false
    }
    const handleOpenSign = () => {
        if (!pendingSigner || !hasOpinionChoice(pendingSigner)) return
        setSignRole(pendingSigner.role)
    }

    const handleConfirmSign = (signerName: string, signatureImage?: string) => {
        if (!activeSigner || !hasOpinionChoice(activeSigner)) return
        ensureOpinion(activeSigner)
        if (extDocs) {
            /** ฉบับขยายเวลา: ความเห็นอ่านจากร่างที่เพิ่งเติม (ว่าง = ค่าตั้งต้น) — ยังไม่ส่งต่อ คบ.14 จนกว่าจะกดส่งที่ footer */
            const opinion = String(useFormDraftStore.getState().getDraft(6)[activeSigner.opinionField] ?? '').trim()
            signExtensionKb6(caseItem.no, opinion || KB6_DEFAULT_OPINION, signerName)
        } else if (!caseItem.appealFolder?.addendum) {
            signKb6(caseItem.no, activeSigner.role, signerName)
        }
        /** เติมชื่อผู้ลงนามลงในช่องของแบบ คบ.6 เพื่อให้ฉบับพิมพ์ A4 ตรงกับผู้ลงนามจริง */
        if (signerName.trim()) {
            activateCaseForms(caseItem, [6])
            updateSignedField(6, activeSigner.nameField, signerName)
        }
        // เก็บรูปที่ผู้ลงนามเลือกไว้กับแฟ้มเดียวกัน เพื่อใช้บนกระดาษและฉบับพิมพ์
        useFormDraftStore.getState().signDocument(`kb6-${activeSigner.role}`, signerName, signatureImage, caseItem.no)
        showToast(
            extDocs
                ? `ลงนาม${activeSigner.label} (ข้อ ${activeSigner.no}) ใน คบ.6 ${addendumLabel(extDocs.round)} แล้ว`
                : `ลงนาม${activeSigner.label} (ข้อ ${activeSigner.no}) ใน คบ.6 แล้ว`
        )
        setSignRole(null)
    }

    /** ฉบับขยายเวลา — ขอยืนยันก่อนลงนาม: ทุกชั้นลงนามอย่างเดียว การส่งต่อ/อนุมัติแยกที่ footer */
    const handleExtensionSignClick = () => {
        if (!extPending || !extDocs) return
        const isSecretary = extPending.role === 'secretary'
        showConfirmAlert({
            icon: 'question',
            title: `ลงนาม คบ.6 ${addendumLabel(extDocs.round)}?`,
            html: confirmBody(
                `ขยายระยะเวลาคุ้มครองครั้งที่ ${extDocs.round} ของแฟ้ม ${caseItem.no}`,
                [['ผู้ลงนาม', `${extPending.label} (ข้อ ${extPending.no})`]],
                isSecretary
                    ? 'บันทึกลายมือชื่อใน คบ.6 ฉบับนี้ แล้วจึงกด "อนุมัติ/ไม่อนุมัติ/ส่งคืนแก้ไข" ที่ footer หน้าแฟ้ม/หน้าขยายเวลา'
                    : 'บันทึกลายมือชื่อใน คบ.6 ฉบับนี้ แล้วจึงกด "ส่ง…" ที่ footer หน้าแฟ้ม/หน้าขยายเวลาเพื่อส่งต่อชั้นถัดไป'
            ),
            showCancelButton: true,
            confirmButtonText: 'ยืนยันลงนาม',
            cancelButtonText: 'ยกเลิก',
        }).then((res) => {
            if (res.isConfirmed) handleOpenSign()
        })
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
            {pendingSigner && <PaperSignRegistration signKey={`kb6-${pendingSigner.role}`} handler={{ onSign: extDocs ? handleExtensionSignClick : handleOpenSign }} />}
            {activeSigner && (
                <SignatureModal
                    isOpen
                    title={`ลงนาม${activeSigner.label} (ข้อ ${activeSigner.no}) ในแบบ คบ.6`}
                    signerRole={activeSigner.signerRole}
                    defaultSignerName={defaultSignerName(activeSigner)}
                    onClose={() => setSignRole(null)}
                    onConfirm={handleConfirmSign}
                    onGenerateLink={extDocs || caseItem.appealFolder?.addendum ? undefined : handleGenerateLink}
                />
            )}
        </>
    )
}
