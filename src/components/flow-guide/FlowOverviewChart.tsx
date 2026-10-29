import React, { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'
import { FLOW_GUIDE, FlowGuideTab, StepStatus, tabForms, tabShortTitle } from '../../lib/flowGuide'
import { FORMS_CATALOG } from '../../lib/constants'
import type { UserRole } from '../../types/user'
import flowDiagram from '../../flow-guide/flow-diagram.json'
import { hasSnapshot } from '../../lib/flowSnapshots'
import type { MinimapItem } from './ZoomViewport'
import { PlayMark } from './playback'
import {
    HEAD_H,
    OVERVIEW_DETAIL,
    OVERVIEW_LAYOUT,
    OverviewStep,
    OverviewStepEdge,
    RoutedEdge,
    crossId,
    overviewGeometry,
    overviewRoutes,
    stepEdgeId,
    stepKey,
} from './overviewLayout'

/**
 * ผังภาพรวมข้ามแท็บของ Activity 6 — กรอบ = แท็บในผัง drawio, กล่องในกรอบ = ขั้นสำคัญ (milestone) ของแท็บ,
 * เส้นในกรอบ = ลำดับระหว่างขั้นสำคัญ, เส้นข้ามกรอบ = การส่งต่อระหว่างแท็บ
 * (ยกจากข้อความ "ไปแท็บ …" / "รับจากแท็บ …" ในกล่อง WIT ของผัง context/user-flow)
 * ข้อมูลขั้นสำคัญอยู่ที่ src/flow-guide/overview-detail.json
 * สีของกล่องบอกความพร้อมใน prototype และป้ายบทบาทคือบทบาทที่ต้องสลับไปใช้จริง
 */

export { OVERVIEW_LAYOUT }

export interface OverviewEdge {
    from: string
    to: string
    label?: string
    /** WIT ในผังที่เป็นต้นทางของเส้นนี้ */
    wit?: string
    /** อธิบายภาษาง่ายว่าเส้นนี้เกิดขึ้นเมื่อไรและเกิดอะไรขึ้น */
    desc: string
    /** ใครเป็นคนทำให้งานเดินตามเส้นนี้ */
    actor: string
    /** แบบ คบ. ที่ส่งต่อหรือเกี่ยวข้องกับการเดินเส้นนี้ */
    forms?: number[]
    /** mock state ที่เล่นต่อจากเส้นนี้ได้ (ชื่อไฟล์ใน src/mock-states ไม่รวม .json) */
    mockState?: string
    /** บทบาทที่ใช้เข้าระบบเมื่อเล่น mock state นี้ */
    mockRole?: UserRole
    /** หน้าที่เปิดหลังเล่น ถ้าไม่ระบุใช้หน้าปลายทางของ mock state */
    mockRoute?: string
}

export const OVERVIEW_EDGES: OverviewEdge[] = [
    {
        from: '02', to: '03', wit: 'WIT0216', actor: 'ธุรการสำนัก/กอง หรือเจ้าหน้าที่ ป.ป.ท. ผู้รับเรื่อง',
        desc: 'ธุรการรับคำขอเข้าทะเบียนแล้วกดส่ง ผอ. มอบหมายผู้รับผิดชอบได้ทันที (เจ้าของสำนวนที่ ผอ. มอบหมายเชื่อมโยงเลขสำนวนหลักต่อที่แท็บ 04) ส่วนเจ้าหน้าที่ ป.ป.ท. ที่รับเรื่องเองต้องเชื่อมโยงเลขสำนวนหลัก (หรือบันทึกว่าค้นไม่พบพร้อมเหตุผล) ในแฟ้มก่อน จึงส่ง ผอ. ได้',
        forms: [1, 2],
        mockState: 'Case 1', mockRole: 'receiver', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '03', to: '04', wit: 'WIT0312', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ผอ. มอบหมายแล้ว เจ้าหน้าที่เปิดงานเชื่อมโยงคดีหลักและประเมินความเร่งด่วนที่แท็บ 04 ถ้าเรื่องเป็นคำร้องทั่วไปหรือ คบ.2 ซึ่งยังไม่มี คบ.1 ต้องจัดทำ คบ.1 (และ คบ.3) ก่อน',
        forms: [1, 2, 3],
        mockState: 'Case 1.3', mockRole: 'officer', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '04', to: '05', label: 'ไม่เร่งด่วน', wit: 'WIT0411', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ประเมินแล้วว่าไม่เร่งด่วน ให้จัดทำ คบ.6 บันทึกเสนอความเห็น แล้วส่งผู้บังคับบัญชาชั้นต้นกลั่นกรองตามเส้นทางปกติ',
        forms: [6],
        mockState: 'Case 1.3', mockRole: 'officer', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '04', to: '06', label: 'เร่งด่วน', wit: 'WIT0412', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ประเมินแล้วว่าจำเป็นเร่งด่วน ให้จัดทำ คบ.4 และร่าง คบ.5 เสนอ ผอ. โดยตรงเพื่อคุ้มครองชั่วคราวทันที',
        forms: [4, 5],
        mockState: 'Case 1.3', mockRole: 'officer', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '05', to: '06', label: 'ผบช.ชั้นต้นแก้เป็นเร่งด่วน', wit: 'WIT0522', actor: 'ผู้บังคับบัญชาชั้นต้น → ผอ.สำนัก/กอง',
        desc: 'ผู้บังคับบัญชาชั้นต้นแก้ผลประเมินเป็น "เร่งด่วน" ระหว่างกลั่นกรอง ระบบตัดเข้าเส้นทางเร่งด่วนส่ง ผอ. ทันที ผอ. รับแฟ้มที่ยังไม่มี คบ.4 / ร่าง คบ.5 แล้วส่งกลับเจ้าหน้าที่จัดทำก่อน',
        forms: [4, 5],
        mockState: 'Case 1.4', mockRole: 'supervisor', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '06', to: '05', label: 'คำร้องหลักเดินต่อ', wit: 'WIT0614', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'แม้พยานได้รับคุ้มครองชั่วคราวแล้ว คำร้องหลักยังต้องเดินต่อ: จัดทำ คบ.6 แล้วเสนอกลั่นกรองตามเส้นทางปกติเพื่อขออนุมัติจริง ถ้า ผอ. อนุมัติ คบ.5 ต้องเปิดงานตามวิธีคุ้มครองที่แท็บ 08A ก่อน ปุ่มส่งผู้บังคับบัญชาชั้นต้นจึงกดได้',
        forms: [5, 6],
        mockState: 'Edge 06→05', mockRole: 'officer', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '06', to: '08A', label: 'คบ.5 ชั่วคราว', wit: 'WIT0613', actor: 'ผอ.สำนัก/กอง (ลงนาม) → เจ้าหน้าที่',
        desc: 'ผอ. อนุมัติและลงนามคำสั่ง คบ.5 แล้ว วิธีคุ้มครองที่อนุมัติจึงเริ่มปฏิบัติได้ทันทีในฐานะการคุ้มครองชั่วคราว',
        forms: [5],
        mockState: 'Case 3.2', mockRole: 'officer', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '05', to: '07', wit: 'WIT0514', actor: 'รองเลขาธิการ ป.ป.ท.',
        desc: 'ผู้บังคับบัญชาชั้นต้น ผอ. และรองเลขาธิการฯ ให้ความเห็นใน คบ.6 ครบทุกชั้นแล้ว (ระหว่าง ผอ. กับรองเลขาธิการฯ ต้องผ่านธุรการสำนัก/กองและธุรการ สลธ. ออกเลขส่ง-เลขรับ) จึงเสนอชุดเอกสารให้เลขาธิการ ป.ป.ท. ชี้ขาด',
        forms: [1, 3, 6, 9, 10],
        mockState: 'Edge 05→07', mockRole: 'deputy_secretary', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '07', to: '05', label: 'ส่งกลับ', wit: 'WIT0707', actor: 'เลขาธิการ ป.ป.ท. → ธุรการ → ผอ. มอบหมาย Revision',
        desc: 'เลขาธิการฯ เห็นว่าเอกสารยังไม่ครบหรือต้องแก้ จึงส่งกลับผ่านธุรการ สลธ. และธุรการสำนัก/กอง ถึง ผอ. ซึ่งมอบหมาย Revision เจ้าหน้าที่แก้เป็นฉบับใหม่แล้วเดินแท็บ 05 ตามลำดับเดิมทุกชั้นกลับมาเสนอเลขาธิการฯ อีกครั้ง',
        forms: [6],
        mockState: 'Case 1.7', mockRole: 'secretary', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '07', to: '08A', label: 'เจ้าของสำนวนเดิม', wit: 'WIT0710', actor: 'เลขาธิการ ป.ป.ท. → ธุรการ สลธ./ธุรการปลายทาง → เจ้าของสำนวนเดิม',
        desc: 'เลขาธิการฯ ลงนาม คบ.9 พร้อมผลอนุมัติและเลือกเจ้าของสำนวนเดิม ธุรการ สลธ. ออกเลขส่งและธุรการปลายทางลงเลขรับ (WIT0715) แล้ว ผู้รับงานเติมรายละเอียดเป็นรุ่นใหม่ ตรวจพร้อมส่ง แล้วนำส่ง คบ.9 และทำ คบ.11 ตามโฟลว์เดิม งานไม่เข้าคิว กอท.',
        forms: [9, 11],
        mockState: 'PostApproval 1', mockRole: 'secretary', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '07', to: '07G', label: 'อนุมัติ · ส่ง กอท. ทำต่อ', wit: 'WIT0710', actor: 'เลขาธิการ ป.ป.ท. → ธุรการ สลธ. → ธุรการคดี กอท.',
        desc: 'เลือกปลายทาง กอท. และลงนามเอกสารครบแล้ว เลขาธิการกดส่งให้ธุรการ สลธ. ออกเลขส่ง ธุรการ กอท. ลงเลขรับและกดส่งต่อให้ ผอ. กอท. มอบหมายเจ้าหน้าที่ ผู้ได้รับมอบหมายรับงานและดำเนินการต่อในแฟ้มเดิม โดยใช้ผลอนุมัติเดิม',
        forms: [6, 9, 11], mockState: 'PostApproval 1', mockRole: 'secretary', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '07G', to: '08A', label: 'รับงานแล้ว', wit: 'A6POST06', actor: 'ผู้ได้รับมอบหมาย กอท.',
        desc: 'ผู้ได้รับมอบหมายรับงานแล้วเติม คบ.9 เฉพาะช่องที่อนุญาต ตรวจพร้อมส่ง และดำเนินการด้วยผลอนุมัติเดิม ไม่อนุมัติซ้ำหรือส่งกลับเจ้าของสำนวนเดิม',
        forms: [9, 11], mockState: 'Notice 6', mockRole: 'got_officer', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '07', to: '09A', label: 'ไม่อนุมัติ', wit: 'WIT0711', actor: 'เลขาธิการ ป.ป.ท. (ไม่อนุมัติ) → ธุรการ สลธ./ธุรการสำนัก/กอง → เจ้าหน้าที่',
        desc: 'เลขาธิการฯ ไม่อนุมัติพร้อมลงนาม คบ.10 จากชุดเสนอ ผ่านธุรการ สลธ. ออกเลขส่งและธุรการสำนัก/กองลงเลขรับ (WIT0716) แล้วเจ้าหน้าที่ตามเส้นทางเดิมเติมรายละเอียด ตรวจพร้อมส่ง แล้วแจ้งสิทธิอุทธรณ์ 30 วัน ไม่มีเส้นทาง กอท. หรือการลงนาม คบ.10 ซ้ำ',
        forms: [10],
        mockState: 'Edge 07→08A·09A·08C', mockRole: 'secretary', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '08A', to: '08A-1', label: 'วิธี 1', wit: 'WIT0813', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'วิธีที่อนุมัติรวมวิธีที่ 1 (จัดชุดเจ้าหน้าที่คุ้มครองพยาน) จึงเปิดงานจัดชุดคุ้มครองด้วยคำสั่ง คบ.8',
        forms: [8],
        mockState: 'Case 1.12', mockRole: 'officer', mockRoute: '/protection-methods',
    },
    {
        from: '08A', to: '08A-2', label: 'วิธี 2', wit: 'WIT0813', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'วิธีที่อนุมัติรวมวิธีที่ 2 (จัดให้พยานอยู่ในสถานที่ที่เหมาะสม) จึงเปิดงานหาและประเมินสถานที่ปลอดภัย',
        mockState: 'Case 8', mockRole: 'officer', mockRoute: '/protection-methods',
    },
    {
        from: '08A', to: '08A-3', label: 'วิธี 3', wit: 'WIT0813', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'วิธีที่อนุมัติรวมวิธีที่ 3 (ปกปิดและรักษาความลับ) จึงเปิดงานกำหนดข้อมูลที่ต้องปกปิดและจำกัดสิทธิการเข้าถึง',
        mockState: 'Case 8', mockRole: 'officer', mockRoute: '/protection-methods',
    },
    {
        from: '08A', to: '08B', label: 'วิธี 4', wit: 'WIT0813', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'วิธีที่อนุมัติหรือที่เลือกตอนเปิดงานรวมวิธีที่ 4 (ให้หน่วยงานอื่นคุ้มครอง เช่น กรมการปกครอง ตำรวจ ทหาร หรือกรมคุ้มครองสิทธิและเสรีภาพ) จึงเปิดงานทำหนังสือประสานและส่งมอบพยานด้วย คบ.12',
        forms: [12],
        mockState: 'Case 8.1', mockRole: 'officer', mockRoute: '/protection-methods',
    },
    {
        from: '08A-2', to: '08B', label: 'สถานที่ไม่เหมาะสม', wit: 'WIT0873', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ประเมินแล้วสถานที่ไม่เหมาะสมและต้องให้หน่วยงานภายนอกดำเนินการแทน จึงเปลี่ยนไปใช้วิธีที่ 4 (นำวิธีที่ 1-3 ออกจากแฟ้ม) แล้วเปิดงานประสานหน่วยงานและส่งมอบด้วย คบ.12',
        forms: [12],
        mockState: 'Case 8', mockRole: 'officer', mockRoute: '/protection-method/2?caseNo=0501/2569',
    },
    {
        from: '08A', to: '11A', label: 'พยานไม่ยินยอม · ทบทวน', wit: 'WIT0840', actor: 'ผอ.สำนัก/กอง (อนุมัติแนวทาง) → เจ้าหน้าที่',
        desc: 'พยานไม่ยินยอมตาม คบ.11 หรือ คบ.5 ผู้บังคับบัญชาชั้นต้นเห็นชอบและ ผอ. อนุมัติแนวทาง "ทบทวน" ระบบส่งแฟ้มเข้าการทบทวนผลการคุ้มครองเช่นเดียวกับ WIT1013',
        forms: [5, 11],
        mockState: 'Case 1.11', mockRole: 'director', mockRoute: '/protection-method-work?caseNo=0501/2569',
    },
    {
        from: '08A', to: '11C', label: 'พยานไม่ยินยอม · ยุติ', wit: 'WIT0840', actor: 'ผอ.สำนัก/กอง (อนุมัติแนวทาง) → เจ้าหน้าที่',
        desc: 'พยานไม่ยินยอมตาม คบ.11 หรือ คบ.5 และ ผอ. อนุมัติแนวทาง "ยุติ" ระบบบันทึกเหตุเริ่มยุติแล้วแฟ้มเข้าขั้นจัดทำเรื่องยุติ (คบ.15) ที่แท็บ 11C',
        forms: [5, 11, 15],
        mockState: 'Case 1.11', mockRole: 'director', mockRoute: '/protection-method-work?caseNo=0501/2569',
    },
    {
        from: '08A-1', to: '10', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ลงนาม คบ.8 จัดแผนปฏิบัติ และชี้แจงชุดคุ้มครองครบแล้ว กด "เริ่มปฏิบัติจริง" การคุ้มครองจึงเข้าสู่ช่วงติดตามและรายงานผล',
        forms: [8, 13],
        mockState: 'Edge 08A-1→10', mockRole: 'officer', mockRoute: '/protection-method/1?caseNo=0501/2569',
    },
    {
        from: '08A-2', to: '10', wit: 'WIT0829', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'พยานเข้าพักในสถานที่ที่ประเมินว่าปลอดภัยแล้ว บันทึกวันเริ่มจริงและสถานะเป็น ACTIVE แล้วเข้าสู่ช่วงติดตามและรายงานผล',
        forms: [13],
        mockState: 'Edge 08A-2→10', mockRole: 'officer', mockRoute: '/protection-method/2?caseNo=0501/2569',
    },
    {
        from: '08A-3', to: '10', wit: 'WIT0837', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'เปิดใช้มาตรการปกปิดข้อมูลแล้ว (มีผลกับการค้นหา ดาวน์โหลด พิมพ์ และบันทึก Access Log จริง) แล้วเข้าสู่ช่วงติดตามและรายงานผล',
        forms: [13],
        mockState: 'Edge 08A-3→10', mockRole: 'officer', mockRoute: '/protection-method/3?caseNo=0501/2569',
    },
    {
        from: '08B', to: '10', wit: 'WIT0851', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'หน่วยงานภายนอกตอบรับ รับมอบพยาน (ลงนาม คบ.12) และเริ่มปฏิบัติแล้ว เจ้าหน้าที่ยังต้องติดตามและรายงาน คบ.13 ทุกเดือน',
        forms: [12, 13],
        mockState: 'Edge 08B→10', mockRole: 'officer', mockRoute: '/protection-method/4?caseNo=0501/2569',
    },
    {
        from: '09A', to: '09B', label: 'อุทธรณ์', wit: 'WIT0910', actor: 'พยาน/ผู้ยื่นคำร้อง → เจ้าหน้าที่รับเรื่อง',
        desc: 'หลังได้รับ คบ.10 พยานยื่นอุทธรณ์ภายใน 30 วัน เจ้าหน้าที่รับคำอุทธรณ์เข้าแฟ้มเดิมเพื่อกลั่นกรองและเสนอคณะกรรมการ',
        forms: [10],
        mockState: 'Case 4.1', mockRole: 'officer', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '09B', to: '05', label: 'เปลี่ยนคำสั่ง', wit: 'WIT0935', actor: 'คณะกรรมการ ป.ป.ท. (มติ) → เจ้าหน้าที่',
        desc: 'คณะกรรมการมีมติเปลี่ยนคำสั่งจาก คบ.10 หลังธุรการขาลงลงทะเบียน เจ้าหน้าที่จัดทำ คบ.6 รุ่นใหม่ (v2) ในแฟ้มเดิมไม่ต้องยื่นคำร้องใหม่ แล้วเสนอตามลำดับชั้นของแท็บ 05 ผลอนุมัติรอบใหม่จึงเข้าแท็บ 07 และ 08A ตามปกติ',
        forms: [6, 10],
        mockState: 'Case 4.3', mockRole: 'committee', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '09B', to: '11D', label: 'อุทธรณ์คำสั่งยุติ', wit: 'WIT0921', actor: 'คณะกรรมการ ป.ป.ท. (มติ) → เจ้าหน้าที่',
        desc: 'อุทธรณ์ที่ยื่นต่อคำสั่งยุติ คบ.17 เมื่อคณะกรรมการยกคำร้อง แฟ้มกลับเป็นสถานะยุติ ปิดงานต่อที่แท็บ 11D ถ้ามีมติเพิกถอนคำสั่งยุติ การคุ้มครองกลับมาดำเนินการต่อโดยไม่ปิดงาน',
        forms: [17],
        mockState: 'Case 1.18', mockRole: 'officer', mockRoute: '/termination/0501%2F2569',
    },
    {
        from: '08C', to: '11C', label: 'ไม่เห็นชอบ', wit: 'WIT0858', actor: 'เลขาธิการ / คณะกรรมการ ป.ป.ท.',
        desc: 'ไม่เห็นชอบให้ส่งกรมคุ้มครองสิทธิฯ จึงบันทึกมติและเหตุผลไว้ เมื่อมาตรการเดิมสิ้นสุดแล้วให้เข้าสู่การจัดทำเรื่องยุติ',
        mockState: 'Edge 08C→11C', mockRole: 'committee', mockRoute: '/article14',
    },
    {
        from: '10', to: '11A', label: 'ถึงรอบทบทวน', wit: 'WIT1013', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ผลรายงาน คบ.13 หรือกำหนดเวลาบอกว่าถึงเวลาทบทวน เจ้าหน้าที่กด "ส่งเข้าทบทวนผลการคุ้มครอง" โมดัลสรุป คบ.13 ล่าสุด ความเสี่ยง คำสั่ง และยอดวันสะสมให้เลือกแนวทางต่อ (ไม่มีหน้าทบทวนแยกแล้ว)',
        forms: [13],
        mockState: 'Edge 10→11A', mockRole: 'officer', mockRoute: '/protection-monitor?caseNo=0501/2569',
    },
    {
        from: '11A', to: '10', label: 'คุ้มครองต่อ', wit: 'WIT1108', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'เจ้าหน้าที่ทบทวนแล้วเห็นว่ายังคุ้มครองต่อได้ภายใต้คำสั่งเดิม จึงกลับไปตั้งรอบรายงาน คบ.13 ถัดไป (ไม่มีขั้นเสนอ ผบช.ชั้นต้นเห็นชอบผลทบทวน)',
        forms: [13],
        mockState: 'Edge 11A→10', mockRole: 'officer', mockRoute: '/protection-duration?caseNo=0501/2569',
    },
    {
        from: '11A', to: '11B', label: 'ขยายเวลา', wit: 'WIT1109', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'คำสั่งเดิมใกล้หมดแต่พยานยังต้องการคุ้มครอง และยอดสะสมยังไม่ถึงเพดาน 6 เดือน (180 วัน) จึงขอขยายเวลาด้วย คบ.14',
        forms: [14],
        mockState: 'Edge 11A→11B', mockRole: 'officer', mockRoute: '/protection-duration?caseNo=0501/2569',
    },
    {
        from: '11A', to: '08A', label: 'เปลี่ยนวิธี/เงื่อนไข', wit: 'WIT1110', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ทบทวนแล้วเห็นควรเปลี่ยนวิธีหรือเงื่อนไขการคุ้มครอง เปิดงานวิธีคุ้มครองที่ /protection-methods เสนออนุมัติและปรับ คบ.11 ถ้าเปลี่ยนเป็นวิธีที่ 1 ต้องจัดทำ/ลงนาม คบ.8 ใหม่',
        forms: [8, 11],
        mockState: 'Case 1.14', mockRole: 'officer', mockRoute: '/protection-monitor?caseNo=0501/2569',
    },
    {
        from: '11A', to: '11C', label: 'ยุติ', wit: 'WIT1111', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ทบทวนแล้วเห็นควรยุติ เช่น พยานปลอดภัยแล้ว ครบกำหนด หรือพยานขอยุติเอง (คบ.7) ปุ่ม "ยุติ" บันทึกเหตุเริ่มยุติให้แล้วเข้าสู่การจัดทำเรื่องยุติ (คบ.15) ที่หน้า /termination',
        forms: [7, 15],
        mockState: 'Edge 11A→11C', mockRole: 'officer', mockRoute: '/protection-duration?caseNo=0501/2569',
    },
    {
        from: '11A', to: '08C', label: 'ครบ 6 เดือน ยังมีภัย', wit: 'WIT1149', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'คุ้มครองครบเพดาน 6 เดือนแล้วแต่พยานยังมีภัย ขยายด้วย คบ.14 ไม่ได้อีก จึงต้องส่งเรื่องให้กรมคุ้มครองสิทธิฯ รับช่วง (ถ้าเลือกขยายเวลาตอนครบเพดาน ระบบเปลี่ยนเป็นเส้นทางส่งต่อหน่วยงานอื่นให้เอง)',
        forms: [14],
        mockState: 'Case 10', mockRole: 'officer', mockRoute: '/protection-duration?caseNo=0501/2569',
    },
    {
        from: '10', to: '08C', label: 'ใกล้ครบ 6 เดือน / เสนอก่อนครบ', wit: 'WIT1011', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ระหว่างคุ้มครอง เหลือไม่เกิน 30 วันก่อนครบ 6 เดือน ระบบแจ้งเตือนในกระดิ่งและแฟ้ม และแฟ้มขึ้นในหน้าส่งต่อกรมคุ้มครองสิทธิฯ เอง หรือเจ้าหน้าที่กด "เสนอส่งกรมคุ้มครองสิทธิฯ" ที่หน้าระยะเวลาคุ้มครองได้ทุกเมื่อ ถ้าเสนอก่อนครบ 6 เดือน หลังเลขาธิการเห็นชอบต้องส่งคณะกรรมการพิจารณาต่อ',
        mockState: 'Case 5', mockRole: 'officer', mockRoute: '/article14',
    },
    {
        from: '11B', to: '08C', label: 'ครบเพดาน ขอ คบ.14 ไม่ได้', wit: 'WIT1150', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ยอดคุ้มครองสะสมถึง 6 เดือนแล้ว ฟอร์ม คบ.14 ถูกปิด การ์ดขยายเวลามีลิงก์ไปหน้าส่งต่อกรมคุ้มครองสิทธิฯ และถ้ายื่นขอขยายตอนครบเพดาน ระบบเปลี่ยนแฟ้มเป็นเส้นทางส่งต่อหน่วยงานอื่นแทน',
        forms: [14],
        mockState: 'Case 10', mockRole: 'officer', mockRoute: '/protection-duration?caseNo=0501/2569',
    },
    {
        from: '11B', to: '10', label: 'อนุมัติ', wit: 'WIT1122', actor: 'เลขาธิการ ป.ป.ท.',
        desc: 'เลขาธิการฯ อนุมัติขยายเวลา ระบบล็อก คบ.14 ฉบับลงนามและเพิ่มช่วงคุ้มครองใหม่ต่อจากเดิม แล้วกลับไปติดตามและรายงานผล เจ้าของเรื่องได้กระดิ่งแจ้งเตือนและป๊อปอัปแจ้งผลครั้งเดียว พร้อมแบนเนอร์ "อนุมัติ" ที่หน้าขอขยายเวลา และขอขยายรอบถัดไปได้จนครบเพดาน 6 เดือน',
        forms: [14, 13],
        mockState: 'Case 9.3', mockRole: 'officer', mockRoute: '/protection-duration?caseNo=0501/2569',
    },
    {
        from: '11B', to: '11B', label: 'ขอรอบถัดไป', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'หลังเลขาธิการฯ อนุมัติ คบ.14 รอบก่อน หากยอดสะสมยังไม่ถึงเพดาน 6 เดือน เจ้าของเรื่องขอขยายซ้ำเป็นรอบใหม่ได้ วันเริ่มรอบใหม่คือวันถัดจากวันสิ้นสุดเดิม เอกสารประกอบ คบ.3/คบ.6 แยกรายรอบ (การ์ดเอกสารประกอบการขยายเวลาในแฟ้ม) แล้วเสนอ คบ.14 ผ่านรองเลขาธิการฯ ถึงเลขาธิการฯ เหมือนรอบแรก เมื่อครบเพดานและยังมีภัยให้ไปตามเส้น ครบ 6 เดือน ยังมีภัย',
        forms: [14, 3, 6],
        mockState: 'Case 9.5', mockRole: 'officer', mockRoute: '/dossier/0501%2F2569',
    },
    {
        from: '11B', to: '11C', label: 'ไม่อนุมัติ', wit: 'WIT1123', actor: 'เลขาธิการ ป.ป.ท.',
        desc: 'เลขาธิการฯ ไม่อนุมัติขยายเวลา (รอบใดก็ตาม) คำสั่งเดิมยังมีผลจนถึงวันสิ้นสุด เจ้าของเรื่องได้กระดิ่งและป๊อปอัปแจ้งผลครั้งเดียว พร้อมแบนเนอร์ "ไม่อนุมัติ" ที่หน้าขอขยายเวลา เมื่อถึงกำหนดแล้วเจ้าหน้าที่ต้องเข้าสู่การจัดทำเรื่องยุติ',
        forms: [14],
        mockState: 'Case 9.4', mockRole: 'officer', mockRoute: '/protection-duration?caseNo=0501/2569',
    },
    {
        from: '11C', to: '11D', wit: 'WIT1162', actor: 'เลขาธิการ ป.ป.ท.',
        desc: 'คบ.15 ถูกตรวจตามลำดับชั้น: ผอ.สำนัก/กองเห็นชอบ → ธุรการสำนัก/กองและธุรการสำนักงานเลขาธิการ (ออกเลขส่ง-เลขรับ) → รองเลขาธิการเห็นชอบ → เลขาธิการลงนาม คบ.15 จากนั้นพิจารณาอนุมัติให้ยุติ เมื่ออนุมัติยุติแล้วเจ้าหน้าที่ร่าง คบ.16 ได้ตรงจากเรื่องยุติ (ครั้งเดียว) แล้วเสนอลงนาม',
        forms: [15, 16],
        mockState: 'Case 1.16', mockRole: 'secretary', mockRoute: '/termination/0501%2F2569',
    },
    {
        from: '11D', to: '10', label: 'ไม่อนุมัติยุติ', wit: 'WIT1137', actor: 'เลขาธิการ ป.ป.ท.',
        desc: 'เลขาธิการ ป.ป.ท. ไม่อนุมัติให้ยุติ (ก่อนลงนามคำสั่งยุติ) การคุ้มครองจึงดำเนินต่อภายใต้คำสั่งเดิมและกลับไปติดตามและรายงานผล',
        forms: [13],
        mockState: 'Case 1.16', mockRole: 'secretary', mockRoute: '/termination/0501%2F2569',
    },
    {
        from: '11D', to: '09B', label: 'อุทธรณ์', wit: 'WIT1147', actor: 'พยาน → เจ้าหน้าที่รับเรื่อง',
        desc: 'หลัง คบ.16 ลงนามและส่งหนังสือแจ้งคำสั่งยุติ คบ.17 แฟ้มยังเปิดอยู่ตลอดกรอบอุทธรณ์ 30 วัน พยานยื่นอุทธรณ์ภายในกรอบ เจ้าหน้าที่ผูกคำอุทธรณ์กับแฟ้มเดิม ไม่ต้องยื่นคำร้องใหม่ หากพ้นกรอบโดยไม่มีอุทธรณ์จึงปิดงาน',
        forms: [16, 17],
        mockState: 'Case 1.18', mockRole: 'officer', mockRoute: '/termination/0501%2F2569',
    },
]

/** สรุปภาษาง่ายว่าแต่ละแท็บคือช่วงไหนของงานคุ้มครองพยาน — ใช้ในการ์ดตอนชี้และแผงข้างของกล่องแท็บ */
export const TAB_SUMMARY: Record<string, string> = {
    '07G': 'อนุมัติและมอบหมาย กอท. → ธุรการคดีรับเรื่อง → ส่งเสนอ ผอ. กอท. → ผอ. มอบหมาย → ผู้รับผิดชอบรับงานและดำเนินการต่อด้วยผลอนุมัติเดิม',
    '02': 'จุดเริ่มต้น: รับคำขอคุ้มครองเข้าทะเบียน (เป็นคำร้อง คบ.1 หรือ คบ.2) ธุรการส่ง ผอ. มอบหมายได้ทันทีแล้วให้เจ้าของสำนวนเชื่อมโยงเลขสำนวนคดีหลักต่อที่แท็บ 04 ส่วนเจ้าหน้าที่ที่รับเรื่องเองเชื่อมโยงคดีหลักก่อนส่ง ผอ.',
    '03': 'ผอ. มอบหมายเจ้าหน้าที่ผู้รับผิดชอบ เจ้าหน้าที่ตรวจว่าเรื่องเร่งด่วนหรือไม่ และระบบบอกว่าต้องจัดทำเอกสารตั้งต้นอะไรบ้าง',
    '04': 'เจ้าหน้าที่เชื่อมโยงเลขสำนวนคดีหลัก (หรือบันทึกว่าค้นไม่พบ) จัดทำเอกสารตั้งต้นให้ครบ (คบ.1 คำร้อง และ คบ.3 บันทึกข้อเท็จจริง) แล้วแยกทางตามความเร่งด่วน: ปกติทำ คบ.6 ส่วนเร่งด่วนทำ คบ.4',
    '05': 'เส้นทางปกติ: บันทึกเสนอความเห็น คบ.6 ผ่านการกลั่นกรองตามลำดับชั้น ผู้บังคับบัญชาชั้นต้น → ผอ. → ธุรการสำนัก/กองและ สลธ. ลงเลขส่ง-เลขรับ → รองเลขาธิการฯ ก่อนเสนอเลขาธิการฯ ถ้าผู้บังคับบัญชาชั้นต้นแก้เป็นเร่งด่วน แฟ้มตัดเข้าเส้นทางเร่งด่วนที่ ผอ.',
    '06': 'เส้นทางเร่งด่วน: ผอ. สั่งคุ้มครองชั่วคราวได้ทันทีด้วยคำสั่ง คบ.5 (จำนวนวันนับจากช่วงวันที่ในร่าง คบ.5 ไม่เกินเพดาน 180 วัน) ระหว่างนั้นคำร้องหลักยังต้องเดินเส้นทางปกติต่อเพื่อขออนุมัติจริง หลังเปิดงานตามวิธีคุ้มครองแล้ว (ผอ. รับแฟ้มที่ถูกตัดเข้าเร่งด่วนกลางทางแล้วส่งกลับเจ้าหน้าที่จัดทำ คบ.4 / ร่าง คบ.5 ก่อน)',
    '07': 'เลขาธิการ ป.ป.ท. ชี้ขาดคำร้อง: อนุมัติ ไม่อนุมัติ หรือส่งกลับให้แก้ (ผ่านธุรการแล้ว ผอ. มอบหมาย Revision) ผลอนุมัติ/ไม่อนุมัติลงหน่วยต้องผ่านธุรการ สลธ. และธุรการปลายทางก่อน — การส่งกรมคุ้มครองสิทธิฯ เลือกเป็นข้อย่อยของรูปแบบข้อ 4 ใน คบ.6 แทน',
    '08A': 'หลังอนุมัติ เจ้าหน้าที่แจ้งพยาน (คบ.9) และทำบันทึกข้อตกลง (คบ.11) ให้ลงนามครบ แล้วเลือกแนวทางตอนเปิดงาน (ตาม คบ.6 — เร่งด่วนที่ คบ.6 ยังไม่ลงนามใช้ตาม คบ.4 — หรือเลือกใหม่) แยกงานไปตามวิธีคุ้มครอง งานคุ้มครองชั่วคราวตาม คบ.5 แยกเก็บไม่ถูกแทนที่ ถ้าพยานไม่ยินยอม ผอ. อนุมัติแนวทางเปลี่ยนวิธี ทบทวน หรือยุติ',
    '08A-1': 'วิธีที่ 1 จัดเจ้าหน้าที่คุ้มครองความปลอดภัย: ออกคำสั่งตั้งชุดคุ้มครอง (คบ.8) วางแผนเวร รถ อุปกรณ์ แล้วเริ่มปฏิบัติจริง',
    '08A-2': 'วิธีที่ 2 จัดให้พยานอยู่ในสถานที่ปลอดภัย: เสนอสถานที่ ประเมินความปลอดภัย วางแผนย้าย แล้วบันทึกว่าพยานเข้าพักแล้ว',
    '08A-3': 'วิธีที่ 3 ปกปิดข้อมูลพยาน: เลือกข้อมูลที่ต้องปกปิด กำหนดว่าใครเห็นได้ และจำกัดการค้นหา ดาวน์โหลด พิมพ์ และส่งต่อ',
    '08B': 'วิธีที่ 4 ให้หน่วยงานอื่นคุ้มครอง: ทำหนังสือประสาน รอตอบรับ ส่งมอบพยานพร้อมบันทึก คบ.12 และยังต้องติดตามรายงานทุกเดือน',
    '08C': 'ส่งเรื่องให้กรมคุ้มครองสิทธิและเสรีภาพรับไปคุ้มครองแทน เข้าได้จากผลทบทวน ขอ คบ.14 แต่ครบเพดาน ใกล้ครบ 6 เดือน หรือเสนอก่อนครบ 6 เดือน ทุกทางผ่านความเห็นชอบตามลำดับชั้นถึงเลขาธิการ กรณีเสนอก่อนครบ 6 เดือนต้องส่งคณะกรรมการพิจารณาต่อ',
    '09A': 'เมื่อไม่อนุมัติ เจ้าหน้าที่ทำหนังสือแจ้งผล คบ.10 ให้เลขาธิการฯ ลงนาม ส่งถึงพยาน แล้วเริ่มนับกรอบอุทธรณ์ 30 วัน',
    '09B': 'รับคำอุทธรณ์ของพยาน กลั่นกรองตามลำดับชั้น แล้วเสนอคณะกรรมการ ป.ป.ท. มีมติยกคำร้องหรือเปลี่ยนคำสั่ง (เปลี่ยนคำสั่ง คบ.10 ต้องจัดทำ คบ.6 รุ่นใหม่เสนอผ่านแท็บ 05) รับอุทธรณ์คำสั่งยุติ คบ.17 ได้ด้วย',
    '10': 'ช่วงคุ้มครองจริง: เจ้าหน้าที่ติดตามผลและทำรายงาน คบ.13 ทุกรอบ (ลงนามทั้งเจ้าหน้าที่และพยาน) และเฝ้าดูวันสะสมไม่ให้เกิน 180 วัน เมื่อถึงรอบกด "ส่งเข้าทบทวนผลการคุ้มครอง" ในโมดัล',
    '11A': 'ทบทวนผลการคุ้มครองเมื่อถึงรอบ (ผ่านโมดัลที่หน้ารายงานผลและป็อปอัปที่หน้าระยะเวลาคุ้มครอง ไม่มีหน้าทบทวนแยก) เจ้าหน้าที่เลือกแนวทางเอง: คุ้มครองต่อ ขยายเวลา เปลี่ยนวิธี ยุติ หรือส่งกรมคุ้มครองสิทธิฯ เมื่อครบ 6 เดือนแต่ยังมีภัย',
    '11B': 'ขอขยายระยะเวลาคุ้มครองด้วย คบ.14 เสนอถึงเลขาธิการฯ อนุมัติ ขอซ้ำเป็นรอบถัดไปได้ (เริ่มวันถัดจากวันสิ้นสุดเดิม) โดยยอดรวมไม่เกินเพดาน 6 เดือน แนบ คบ.3/คบ.6 แยกรายรอบในการ์ดเอกสารประกอบ และเจ้าของเรื่องได้กระดิ่ง/ป๊อปอัปแจ้งผลอนุมัติหรือไม่อนุมัติ',
    '11C': 'เริ่มกระบวนการยุติแบบเรียบง่าย: บันทึกที่มาของเหตุยุติ (เช่น พยานขอยุติด้วย คบ.7 หรือครบกำหนด) เจ้าหน้าที่จัดทำรายงานสรุป คบ.15 แล้วเสนอตามลำดับชั้น ผอ.สำนัก/กอง เห็นชอบ → ธุรการขาไป → รองเลขาธิการ เห็นชอบ → เลขาธิการลงนาม คบ.15 (ทุกชั้นส่งคืนแก้ไขได้ และเริ่มเสนอใหม่ในฉบับถัดไป) แล้วจึงไปแท็บ 11D พิจารณาอนุมัติยุติและร่าง คบ.16',
    '11D': 'คบ.16 ที่ร่างตรงจากเรื่องยุติเสนอลงนาม เลขาธิการ ป.ป.ท. ลงนามคำสั่งยุติ แจ้งพยานด้วย คบ.17 พร้อมสิทธิอุทธรณ์ 30 วัน แฟ้มยังเปิดตลอดกรอบอุทธรณ์ แล้วปิดงานเมื่อพ้นกรอบ',
}

/** ชื่อบทบาทแบบย่อสำหรับป้ายในกล่อง */
export const ROLE_SHORT: Record<UserRole, string> = {
    got_receiver: 'ธุรการคดี กอท.',
    got_director: 'ผอ. กอท.',
    got_officer: 'จนท. กอท.',
    got_supervisor: 'ผบช.ต้น กอท.',
    secretary_receiver: 'ธุรการ ลธ.',
    receiver: 'ธุรการ',
    officer: 'จนท.',
    case_owner: 'เจ้าของสำนวน',
    supervisor: 'ผบช.ต้น',
    director: 'ผอ.',
    deputy_secretary: 'รอง ลธ.',
    secretary: 'ลธ.',
    committee: 'คกก.',
    protection: 'ชุดคุ้มครอง',
    appeal: 'จนท.อุทธรณ์',
    admin: 'Admin',
}

export const STATUS_ORDER: StepStatus[] = ['yes', 'partial', 'system', 'no']
export const STATUS_BAR: Record<StepStatus, { className: string; label: string }> = {
    yes: { className: 'bg-emerald-500', label: 'ทำได้ใน UI' },
    partial: { className: 'bg-amber-400', label: 'ทำได้บางส่วน' },
    system: { className: 'bg-slate-300', label: 'ระบบ / นอกระบบ' },
    no: { className: 'bg-rose-500', label: 'ยังไม่มี' },
}

export function tabRoles(tab: FlowGuideTab): UserRole[] {
    const seen: UserRole[] = []
    tab.steps.forEach((s) => {
        if (s.role && !seen.includes(s.role)) seen.push(s.role)
    })
    return seen
}

/** ป้ายแบบ คบ. ที่เกี่ยวข้อง — ใช้ร่วมกันทั้งกล่องแท็บและกล่องขั้น WIT */
export const FormChips: React.FC<{ forms: number[]; className?: string }> = ({ forms, className }) => (
    <span className={cn('flex flex-wrap items-center gap-0.5', className)}>
        {forms.map((n) => (
            <span key={n} className="rounded border border-gold/60 bg-gold-soft px-1 font-mono text-[9.5px] font-semibold leading-[14px] text-gold-dark">
                คบ.{n}
            </span>
        ))}
    </span>
)

export const formMeta = (n: number) => FORMS_CATALOG.find((f) => f.n === n)

/** ชื่อเต็มของแบบ คบ. สำหรับ tooltip */
export const formsTitle = (forms: number[]) => forms.map((n) => `คบ.${n} ${formMeta(n)?.t ?? ''}`.trim()).join('\n')

export const OVERVIEW_W = overviewGeometry().width
export const OVERVIEW_H = overviewGeometry().height

export const STEP_TONE_BOX: Record<StepStatus, string> = {
    yes: 'border-emerald-400 bg-emerald-50',
    partial: 'border-amber-400 bg-amber-50',
    system: 'border-slate-300 bg-slate-50',
    no: 'border-rose-400 bg-rose-50',
}
const STEP_TONE_FILL: Record<StepStatus, string> = { yes: '#6ee7b7', partial: '#fcd34d', system: '#cbd5e1', no: '#fda4af' }

const STEP_BY_CODE = new Map(FLOW_GUIDE.tabs.flatMap((t) => t.steps.map((s) => [s.code, s] as const)))
/** ชนิดกล่องในผังรายขั้น (step / decision / terminal) ของ milestone */
const NODE_KIND = new Map(
    Object.entries((flowDiagram as unknown as { tabs: Record<string, { nodes: { id: string; kind: string }[] }> }).tabs).flatMap(([tab, d]) =>
        d.nodes.map((n) => [stepKey(tab, n.id), n.kind] as const)
    )
)

/** อ่านเฉพาะ key ของตัวเอง — กัน query ที่ผู้ใช้พิมพ์เอง เช่น ?ms=constructor:x ชนกับ prototype ของ Object */
const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

export const overviewStep = (tab: string, code: string | null | undefined): OverviewStep | undefined =>
    hasOwn(OVERVIEW_DETAIL.tabs, tab) ? OVERVIEW_DETAIL.tabs[tab].steps.find((s) => s.code === code) : undefined

/** id เส้นในกรอบแท็บ รูปแบบ "<tab>:<from>><to>" (ใช้ใน query ?mlink=) */
export const stepEdgeParam = (tab: string, e: OverviewStepEdge) => `${tab}:${e.from}>${e.to}`
export function stepEdgeByParam(param: string | null | undefined): { tab: string; edge: OverviewStepEdge } | null {
    const m = param?.match(/^([^:]+):([^>]+)>(.+)$/)
    if (!m) return null
    const edge = (hasOwn(OVERVIEW_DETAIL.tabs, m[1]) ? OVERVIEW_DETAIL.tabs[m[1]] : undefined)?.edges.find((e) => e.from === m[2] && e.to === m[3])
    return edge ? { tab: m[1], edge } : null
}

/** เส้นข้ามแท็บที่ออก/เข้ากล่อง milestone นี้ */
export const crossEdgesOfStep = (tab: string, code: string) =>
    OVERVIEW_EDGES.filter((e) => {
        const c = OVERVIEW_DETAIL.cross[edgeKey(e)]
        return (e.from === tab && c.from === code) || (e.to === tab && c.to === code)
    })

/** กรอบและกล่อง milestone ของแต่ละแท็บสำหรับแผนที่ย่อ (กรอบสีตามสถานะรวมของแท็บ) */
export function overviewMinimap(): MinimapItem[] {
    const geo = overviewGeometry()
    const frames = FLOW_GUIDE.tabs
        .filter((t) => geo.frames[t.tab])
        .map((t) => ({ ...geo.frames[t.tab], fill: `${TONE_FILL[tabTone(t)]}55` }))
    const steps = Object.values(geo.steps).map((b) => {
        const st = STEP_BY_CODE.get(b.code)
        return { x: b.x, y: b.y, w: b.w, h: b.h, fill: st ? STEP_TONE_FILL[st.implemented] : '#e2e8f0' }
    })
    return [...frames, ...steps]
}


const TONE_FILL = { emerald: '#34d399', amber: '#fbbf24', rose: '#fb7185' } as const

/** จำนวนขั้นในแท็บแยกตามสถานะใน prototype */
export const tabStatusCount = (t: FlowGuideTab, s: StepStatus) => t.steps.filter((step) => step.implemented === s).length

/** แถบสัดส่วนสถานะของขั้นในแท็บ */
export const StatusBar: React.FC<{ tab: FlowGuideTab; className?: string }> = ({ tab, className }) => (
    <div className={cn('flex w-full', className)}>
        {STATUS_ORDER.map((s) => {
            const n = tabStatusCount(tab, s)
            return n > 0 ? <span key={s} className={STATUS_BAR[s].className} style={{ width: `${(n / tab.steps.length) * 100}%` }} /> : null
        })}
    </div>
)

function tabTone(t: FlowGuideTab): keyof typeof TONE_FILL {
    if (t.steps.some((s) => s.implemented === 'no')) return 'rose'
    if (t.steps.some((s) => s.implemented === 'partial')) return 'amber'
    return 'emerald'
}

export const edgeKey = (e: OverviewEdge) => `${e.from}>${e.to}`
export const edgeByKey = (key: string | null | undefined) => OVERVIEW_EDGES.find((e) => edgeKey(e) === key) ?? null
const tabTitle = (tab: string) => {
    const t = FLOW_GUIDE.tabs.find((x) => x.tab === tab)
    return t ? tabShortTitle(t) : tab
}

interface DrawnEdge {
    id: string
    kind: 'cross' | 'intra'
    route: RoutedEdge
    fromTab: string
    toTab: string
    fromKey: string
    toKey: string
    label?: string
    snapshot: string
    cross?: OverviewEdge
    intra?: { tab: string; edge: OverviewStepEdge }
}

function drawnEdges(): DrawnEdge[] {
    const routes = overviewRoutes()
    const out: DrawnEdge[] = []
    Object.entries(OVERVIEW_DETAIL.tabs).forEach(([tab, d]) => {
        d.edges.forEach((e) => {
            const id = stepEdgeId(tab, e.from, e.to)
            const route = routes.get(id)
            if (route) out.push({ id, kind: 'intra', route, fromTab: tab, toTab: tab, fromKey: stepKey(tab, e.from), toKey: stepKey(tab, e.to), label: e.label, snapshot: e.snapshot, intra: { tab, edge: e } })
        })
    })
    OVERVIEW_EDGES.forEach((e) => {
        const c = OVERVIEW_DETAIL.cross[edgeKey(e)]
        const id = crossId(edgeKey(e))
        const route = routes.get(id)
        if (route) out.push({ id, kind: 'cross', route, fromTab: e.from, toTab: e.to, fromKey: stepKey(e.from, c.from), toKey: stepKey(e.to, c.to), label: e.label, snapshot: c.snapshot, cross: e })
    })
    return out
}

interface FlowOverviewCanvasProps {
    /** กดหัวกรอบแท็บ */
    onPick: (tab: string) => void
    /** กรอบแท็บที่เลือกอยู่ — แผงรายละเอียดเปิดอยู่ */
    selectedTab?: string | null
    /** เส้นข้ามแท็บที่เลือกอยู่ (edgeKey) — แผงรายละเอียดเปิดอยู่ */
    selectedEdge?: string | null
    onPickEdge?: (edge: OverviewEdge) => void
    /** กล่อง milestone ที่เลือกอยู่ (รูปแบบ "<tab>:<code>") */
    selectedStep?: string | null
    onPickStep?: (tab: string, code: string) => void
    /** เส้นระหว่าง milestone ในกรอบแท็บที่เลือกอยู่ (รูปแบบ "<tab>:<from>><to>") */
    selectedStepEdge?: string | null
    onPickStepEdge?: (tab: string, edge: OverviewStepEdge) => void
}

/** เนื้อผังภาพรวม ขนาด OVERVIEW_W × OVERVIEW_H — วางใน ZoomViewport ซึ่งจัดการซูม เลื่อน และเต็มจอ */
export const FlowOverviewCanvas: React.FC<FlowOverviewCanvasProps> = ({
    onPick,
    selectedTab = null,
    selectedEdge = null,
    onPickEdge,
    selectedStep = null,
    onPickStep,
    selectedStepEdge = null,
    onPickStepEdge,
}) => {
    const [hoveredTab, setHoveredTab] = useState<string | null>(null)
    const [hoveredStep, setHoveredStep] = useState<string | null>(null)
    const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
    const geo = overviewGeometry()
    const tabs = useMemo(() => FLOW_GUIDE.tabs.filter((t) => geo.frames[t.tab]), [geo])
    const edges = useMemo(drawnEdges, [])

    // ลำดับการไฮไลต์: เส้นที่ชี้ > กล่องที่ชี้ > กรอบที่ชี้ > เส้นที่เลือก > กล่องที่เลือก > กรอบที่เลือก
    const selEdgeId = selectedEdge ? crossId(selectedEdge) : selectedStepEdge ? `i:${selectedStepEdge}` : null
    const focusEdge = hoveredEdge ?? (hoveredStep || hoveredTab ? null : selEdgeId)
    const focusStep = hoveredEdge ? null : hoveredStep ?? (hoveredTab || selEdgeId ? null : selectedStep)
    const focusTab = hoveredEdge || hoveredStep ? null : hoveredTab ?? (selEdgeId || selectedStep ? null : selectedTab)
    const anyFocus = !!focusEdge || !!focusStep || !!focusTab
    const isLinked = (e: DrawnEdge) => {
        if (focusEdge) return e.id === focusEdge
        if (focusStep) return e.fromKey === focusStep || e.toKey === focusStep
        if (focusTab) return e.fromTab === focusTab || e.toTab === focusTab
        return false
    }
    const linkedKeys = useMemo(() => {
        const keys = new Set<string>()
        edges.filter(isLinked).forEach((e) => {
            keys.add(e.fromKey)
            keys.add(e.toKey)
        })
        return keys
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [edges, focusEdge, focusStep, focusTab])

    const tabTip = hoveredTab && hoveredTab !== selectedTab && !hoveredEdge && !hoveredStep ? tabs.find((t) => t.tab === hoveredTab) : undefined
    const tip =
        hoveredEdge && hoveredEdge !== selEdgeId ? edges.find((e) => e.id === hoveredEdge && e.kind === 'cross') : undefined
    const edgeHandlers = (e: DrawnEdge) => ({
        onMouseEnter: () => setHoveredEdge(e.id),
        onMouseLeave: () => setHoveredEdge(null),
        onClick: () => (e.cross ? onPickEdge?.(e.cross) : e.intra && onPickStepEdge?.(e.intra.tab, e.intra.edge)),
    })
    const edgeName = (e: DrawnEdge) =>
        e.cross
            ? `เส้นข้ามแท็บ ${e.fromTab} ไป ${e.toTab}${e.label ? ` ${e.label}` : ''}`
            : `เส้นในแท็บ ${e.fromTab} จาก ${e.intra?.edge.from} ไป ${e.intra?.edge.to}${e.label ? ` ${e.label}` : ''}`

    return (
        <div className="relative" style={{ width: OVERVIEW_W, height: OVERVIEW_H }}>
            {tabs.map((t) => {
                const f = geo.frames[t.tab]
                const tone = tabTone(t)
                return (
                    <div
                        key={`frame-${t.tab}`}
                        className={cn(
                            'absolute rounded-2xl border-2 bg-slate-50/80',
                            tone === 'emerald' && 'border-emerald-400',
                            tone === 'amber' && 'border-amber-400',
                            tone === 'rose' && 'border-rose-400',
                            (hoveredTab === t.tab || selectedTab === t.tab) && 'ring-2 ring-blue'
                        )}
                        style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
                    />
                )
            })}

            <svg className="pointer-events-none absolute inset-0" width={OVERVIEW_W} height={OVERVIEW_H}>
                <defs>
                    <marker id="fo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
                    </marker>
                    <marker id="fo-arrow-cross" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M0,0 L10,5 L0,10 z" fill="#5b7490" />
                    </marker>
                    <marker id="fo-arrow-hl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M0,0 L10,5 L0,10 z" fill="#16558f" />
                    </marker>
                </defs>
                {edges.map((e) => {
                    const hl = isLinked(e)
                    const cross = e.kind === 'cross'
                    return (
                        <g key={e.id}>
                            <path
                                d={e.route.d}
                                fill="none"
                                stroke={hl ? '#16558f' : cross ? '#5b7490' : '#94a3b8'}
                                strokeWidth={hl ? 2.25 : cross ? 1.5 : 1.25}
                                strokeDasharray={e.route.back ? '5 4' : undefined}
                                opacity={anyFocus && !hl ? 0.2 : 1}
                                markerEnd={hl ? 'url(#fo-arrow-hl)' : cross ? 'url(#fo-arrow-cross)' : 'url(#fo-arrow)'}
                            />
                            {/* เส้นโปร่งใสหนา ๆ ให้ชี้/กดโดนง่าย */}
                            <path d={e.route.d} fill="none" stroke="transparent" strokeWidth={12} className="cursor-pointer" pointerEvents="stroke" {...edgeHandlers(e)}>
                                <title>{edgeName(e)}</title>
                            </path>
                        </g>
                    )
                })}
            </svg>

            {edges.map((e) => {
                const hl = isLinked(e)
                const marked = hasSnapshot(e.snapshot)
                const cross = e.kind === 'cross'
                return (
                    <button
                        key={`label-${e.id}`}
                        type="button"
                        aria-label={edgeName(e)}
                        {...edgeHandlers(e)}
                        onFocus={() => setHoveredEdge(e.id)}
                        onBlur={() => setHoveredEdge(null)}
                        className={cn(
                            'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 whitespace-nowrap rounded-full border leading-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue',
                            cross ? 'text-[10px]' : 'text-[9.5px]',
                            e.label ? 'max-w-[130px] overflow-hidden text-ellipsis px-1.5 py-px' : cn('p-0', cross ? 'h-4 w-4' : 'h-3.5 w-3.5'),
                            hl ? 'z-40 border-blue bg-blue text-white' : cn('z-[35] bg-white hover:border-blue hover:text-blue', cross ? 'border-slate-300 text-slate-600' : 'border-slate-200 text-slate-500'),
                            anyFocus && !hl && 'opacity-30'
                        )}
                        style={{ left: e.route.mid.x, top: e.route.mid.y }}
                    >
                        {marked && <i className={cn('fa-solid fa-play text-[7px]', hl ? 'text-white' : 'text-success')} aria-hidden="true" />}
                        {e.label ?? (!marked && <i className="fa-solid fa-info text-[7px]" />)}
                    </button>
                )
            })}

            {tip?.cross && <EdgeTooltip edge={tip.cross} x={tip.route.mid.x} y={tip.route.mid.y} />}
            {tabTip && <TabTooltip tab={tabTip} />}

            {tabs.map((t) => {
                const f = geo.frames[t.tab]
                const forms = tabForms(t)
                return (
                    <button
                        key={`head-${t.tab}`}
                        type="button"
                        onClick={() => onPick(t.tab)}
                        onMouseEnter={() => setHoveredTab(t.tab)}
                        onMouseLeave={() => setHoveredTab(null)}
                        onFocus={() => setHoveredTab(t.tab)}
                        onBlur={() => setHoveredTab(null)}
                        aria-label={`แท็บ ${t.tab} ${tabShortTitle(t)} — กดเพื่อดูคำอธิบาย`}
                        className="absolute z-30 flex flex-col overflow-hidden rounded-t-[0.85rem] bg-white text-left transition hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue"
                        style={{ left: f.x + 2, top: f.y + 2, width: f.w - 4, height: HEAD_H - 2 }}
                    >
                        <div className="flex flex-1 flex-col overflow-hidden px-2.5 pt-1.5">
                            <div className="flex items-baseline gap-1.5">
                                <span className="shrink-0 whitespace-nowrap font-mono text-sm font-bold text-navy-deep">{t.tab}</span>
                                <span className="line-clamp-2 text-xs font-semibold leading-snug text-slate-700">{tabShortTitle(t)}</span>
                            </div>
                            <div className="mt-auto flex flex-wrap items-center gap-x-1 gap-y-0.5 pb-1">
                                {tabRoles(t).map((r) => (
                                    <span key={r} className="rounded bg-blue-50 px-1 text-[10px] font-medium leading-[14px] text-blue">
                                        {ROLE_SHORT[r] ?? r}
                                    </span>
                                ))}
                                {forms.length > 0 && <FormChips forms={forms} />}
                            </div>
                        </div>
                        <StatusBar tab={t} className="h-1.5 shrink-0" />
                    </button>
                )
            })}

            {Object.values(geo.steps).map((b) => {
                const step = overviewStep(b.tab, b.code) as OverviewStep
                const info = STEP_BY_CODE.get(b.code)
                const kind = NODE_KIND.get(b.key) ?? 'step'
                const selected = selectedStep === b.key
                const marked = hasSnapshot(step.snapshot)
                const dim = anyFocus && focusStep !== b.key && focusTab !== b.tab && !linkedKeys.has(b.key)
                return (
                    <button
                        key={b.key}
                        type="button"
                        onClick={() => onPickStep?.(b.tab, b.code)}
                        onMouseEnter={() => setHoveredStep(b.key)}
                        onMouseLeave={() => setHoveredStep(null)}
                        onFocus={() => setHoveredStep(b.key)}
                        onBlur={() => setHoveredStep(null)}
                        aria-label={`ขั้น ${b.code} แท็บ ${b.tab}: ${step.label}`}
                        title={`${b.code} · ${step.label}`}
                        className={cn(
                            'absolute z-30 flex flex-col justify-center border bg-white px-2 py-1 text-left shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue',
                            info ? STEP_TONE_BOX[info.implemented] : 'border-slate-300 bg-slate-50',
                            kind === 'terminal' ? 'rounded-[20px]' : 'rounded-lg',
                            kind === 'decision' && 'border-dashed',
                            (selected || focusStep === b.key) && 'ring-2 ring-blue',
                            dim && 'opacity-40'
                        )}
                        style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                    >
                        <span className="flex items-center gap-1">
                            <span className="font-mono text-[10px] font-bold leading-[14px] text-navy-deep">{step.displayCode || b.code}</span>
                            {kind === 'decision' && <span className="text-[10px] leading-none text-warning" title="จุดตัดสินใจ">◇</span>}
                            {info?.role && (
                                <span className="truncate rounded bg-blue-50 px-1 text-[9.5px] font-medium leading-[14px] text-blue">{ROLE_SHORT[info.role] ?? info.role}</span>
                            )}
                        </span>
                        <span className="line-clamp-2 text-[11px] font-medium leading-[14px] text-slate-700">{step.label}</span>
                        {marked && <PlayMark className="absolute -right-1.5 -top-1.5" />}
                    </button>
                )
            })}
        </div>
    )
}

/** การ์ดอธิบายเส้นตอนชี้ — กดเส้นเพื่อเปิดรายละเอียดเต็มในแผงข้าง */
const EdgeTooltip: React.FC<{ edge: OverviewEdge; x: number; y: number }> = ({ edge, x, y }) => {
    // วางการ์ดฝั่งที่มีที่ว่าง ไม่ให้ล้นขอบผัง
    const W = 272
    const left = Math.min(Math.max(x - W / 2, 8), OVERVIEW_W - W - 8)
    const below = y < OVERVIEW_H - 220
    return (
        <div
            role="tooltip"
            className="pointer-events-none absolute z-50 rounded-xl border border-slate-200 bg-white p-2.5 text-left text-[11px] leading-snug shadow-xl"
            style={{ left, width: W, ...(below ? { top: y + 14 } : { bottom: OVERVIEW_H - y + 14 }) }}
        >
            <div className="flex flex-wrap items-center gap-1 font-semibold text-navy-deep">
                <span className="font-mono">{edge.from}</span>
                <i className="fa-solid fa-arrow-right text-[9px] text-slate-400" />
                <span className="font-mono">{edge.to}</span>
                {edge.label && <span className="rounded-full bg-blue px-1.5 text-[10px] text-white">{edge.label}</span>}
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">
                {tabTitle(edge.from)} → {tabTitle(edge.to)}
            </p>
            <p className="mt-1.5 text-slate-700">{edge.desc}</p>
            <p className="mt-1.5 text-slate-500">
                <i className="fa-solid fa-user mr-1 text-[9px]" />
                {edge.actor}
            </p>
            {(edge.wit || !!edge.forms?.length) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {edge.wit && <span className="rounded bg-navy-deep px-1 font-mono text-[9.5px] font-bold leading-[14px] text-white">{edge.wit}</span>}
                    {!!edge.forms?.length && <FormChips forms={edge.forms} />}
                </div>
            )}
            <p className="mt-1.5 text-[10px] text-blue">กดที่เส้นเพื่อดูรายละเอียด</p>
        </div>
    )
}

/** การ์ดอธิบายกล่องแท็บตอนชี้ — กดกล่องเพื่อเปิดรายละเอียดเต็มในแผงข้าง */
const TabTooltip: React.FC<{ tab: FlowGuideTab }> = ({ tab }) => {
    const W = 288
    const box = overviewGeometry().frames[tab.tab]
    // วางขวาของกรอบถ้ามีที่ ไม่เช่นนั้นวางซ้าย และไม่ให้ล้นขอบล่าง
    const right = box.x + box.w + 12 + W <= OVERVIEW_W
    const left = right ? box.x + box.w + 12 : Math.max(box.x - W - 12, 8)
    const top = Math.min(box.y, OVERVIEW_H - 250)
    const forms = tabForms(tab)
    const inCount = OVERVIEW_EDGES.filter((e) => e.to === tab.tab).length
    const outCount = OVERVIEW_EDGES.filter((e) => e.from === tab.tab).length
    return (
        <div
            role="tooltip"
            className="pointer-events-none absolute z-50 rounded-xl border border-slate-200 bg-white p-2.5 text-left text-[11px] leading-snug shadow-xl"
            style={{ left, top, width: W }}
        >
            <p className="font-semibold text-navy-deep">
                <span className="mr-1 font-mono">{tab.tab}</span>
                {tabShortTitle(tab)}
            </p>
            <p className="mt-1.5 text-slate-700">{TAB_SUMMARY[tab.tab]}</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
                {tabRoles(tab).map((r) => (
                    <span key={r} className="rounded bg-blue-50 px-1 text-[10px] font-medium text-blue">
                        {ROLE_SHORT[r] ?? r}
                    </span>
                ))}
            </div>
            {forms.length > 0 && <FormChips forms={forms} className="mt-1" />}
            <StatusBar tab={tab} className="mt-2 h-1.5 overflow-hidden rounded-full" />
            <p className="mt-1 text-[10px] text-slate-500">
                {tab.steps.length} ขั้น · ทำได้ใน UI {tabStatusCount(tab, 'yes')} · บางส่วน {tabStatusCount(tab, 'partial')} · ยังไม่มี{' '}
                {tabStatusCount(tab, 'no')} · เส้นเข้า {inCount} / ออก {outCount}
            </p>
            <p className="mt-1.5 text-[10px] text-blue">กดที่กล่องเพื่อดูรายละเอียดและเปิดผังรายขั้น</p>
        </div>
    )
}
