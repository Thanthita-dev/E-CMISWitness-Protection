import React, { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'
import { FLOW_GUIDE, FlowGuideTab, StepStatus, tabForms, tabShortTitle } from '../../lib/flowGuide'
import { FORMS_CATALOG } from '../../lib/constants'
import type { UserRole } from '../../types/user'
import type { MinimapItem } from './ZoomViewport'

/**
 * ผังภาพรวมข้ามแท็บของ Activity 6 — กล่อง = แท็บในผัง drawio, เส้น = การส่งต่อระหว่างแท็บ
 * (ยกจากข้อความ "ไปแท็บ …" / "รับจากแท็บ …" ในกล่อง WIT ของผัง context/user-flow)
 * สีของกล่องบอกความพร้อมใน prototype และป้ายบทบาทคือบทบาทที่ต้องสลับไปใช้จริง
 */

/** ตำแหน่งกล่องบนตาราง 5 คอลัมน์ (col อาจเป็นครึ่งช่องเพื่อจัดกึ่งกลาง) × แถวบนลงล่าง */
export const OVERVIEW_LAYOUT: Record<string, { col: number; row: number }> = {
    '02': { col: 2, row: 0 },
    '03': { col: 2, row: 1 },
    '04': { col: 2, row: 2 },
    '05': { col: 1, row: 3 },
    '06': { col: 3, row: 3 },
    '07': { col: 1, row: 4 },
    '07G': { col: 2, row: 4 },
    '08C': { col: 0, row: 5 },
    '08A': { col: 2, row: 5 },
    '09A': { col: 4, row: 5 },
    '08A-1': { col: 0, row: 6 },
    '08A-2': { col: 1, row: 6 },
    '08A-3': { col: 2, row: 6 },
    '08B': { col: 3, row: 6 },
    '09B': { col: 4, row: 6 },
    '10': { col: 1.5, row: 7 },
    '11A': { col: 1.5, row: 8 },
    '11B': { col: 0.5, row: 9 },
    '11C': { col: 2.5, row: 9 },
    '11D': { col: 2.5, row: 10 },
}

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
        from: '02', to: '03', wit: 'WIT0216', actor: 'ธุรการสำนัก/กอง',
        desc: 'รับคำขอเข้าทะเบียนและเชื่อมโยงกับเลขสำนวนคดีหลักแล้ว (หรือบันทึกว่าค้นไม่พบพร้อมเหตุผล) จึงส่งให้ ผอ. มอบหมายผู้รับผิดชอบ',
        forms: [1, 2],
        mockState: 'Case 1.1', mockRole: 'receiver', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '03', to: '04', wit: 'WIT0312', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ผอ. มอบหมายแล้ว และเรื่องเข้ามาเป็นคำร้องทั่วไปหรือ คบ.2 ซึ่งยังไม่มี คบ.1 เจ้าหน้าที่จึงต้องไปจัดทำ คบ.1 (และ คบ.3) ก่อน',
        forms: [1, 2, 3],
        mockState: 'Case 1.3', mockRole: 'officer', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '04', to: '05', label: 'ไม่เร่งด่วน', wit: 'WIT0411', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ประเมินแล้วว่าไม่เร่งด่วน ให้จัดทำ คบ.6 บันทึกเสนอความเห็น แล้วส่งผู้บังคับบัญชาชั้นต้นกลั่นกรองตามเส้นทางปกติ',
        forms: [6],
        mockState: 'Case 1.3', mockRole: 'officer', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '04', to: '06', label: 'เร่งด่วน', wit: 'WIT0412', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ประเมินแล้วว่าจำเป็นเร่งด่วน ให้จัดทำ คบ.4 และร่าง คบ.5 เสนอ ผอ. โดยตรงเพื่อคุ้มครองชั่วคราวทันที (Fast Track)',
        forms: [4, 5],
        mockState: 'Case 1.3', mockRole: 'officer', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '06', to: '05', label: 'คำร้องหลักเดินต่อ', wit: 'WIT0614', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'แม้พยานได้รับคุ้มครองชั่วคราวแล้ว คำร้องหลักยังต้องเดินต่อ: จัดทำ คบ.6 แล้วเสนอกลั่นกรองตามเส้นทางปกติเพื่อขออนุมัติจริง',
        forms: [6],
        mockState: 'Edge 06→05', mockRole: 'officer', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '06', to: '08A', label: 'คบ.5 ชั่วคราว', wit: 'WIT0613', actor: 'ผอ.สำนัก/กอง (ลงนาม) → เจ้าหน้าที่',
        desc: 'ผอ. อนุมัติและลงนามคำสั่ง คบ.5 แล้ว วิธีคุ้มครองที่อนุมัติจึงเริ่มปฏิบัติได้ทันทีในฐานะการคุ้มครองชั่วคราว',
        forms: [5],
        mockState: 'Case 3.2', mockRole: 'officer', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '05', to: '07', wit: 'WIT0514', actor: 'รองเลขาธิการ ป.ป.ท.',
        desc: 'ผู้บังคับบัญชาชั้นต้น ผอ. และรองเลขาธิการฯ ให้ความเห็นใน คบ.6 ครบทุกชั้นแล้ว จึงเสนอชุดเอกสารให้เลขาธิการ ป.ป.ท. ชี้ขาด',
        forms: [1, 3, 6, 9, 10],
        mockState: 'Edge 05→07', mockRole: 'deputy_secretary', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '07', to: '05', label: 'ส่งกลับ', wit: 'WIT0712', actor: 'เลขาธิการ ป.ป.ท.',
        desc: 'เลขาธิการฯ เห็นว่าเอกสารยังไม่ครบหรือต้องแก้ จึงส่งกลับให้แก้ไขเป็นฉบับใหม่ (Revision) แล้วเสนอพิจารณาอีกครั้ง',
        forms: [6],
        mockState: 'Case 1.7', mockRole: 'secretary', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '07', to: '08A', label: 'เจ้าของสำนวนเดิม', wit: 'WIT0710', actor: 'เลขาธิการ ป.ป.ท. → เจ้าของสำนวนเดิม',
        desc: 'เลขาธิการฯ ลงนาม คบ.9 พร้อมผลอนุมัติและเลือกเจ้าของสำนวนเดิม ผู้รับงานเติมรายละเอียดเป็นรุ่นใหม่ ตรวจพร้อมส่ง แล้วนำส่ง คบ.9 และทำ คบ.11 ตามโฟลว์เดิม งานไม่เข้าคิว กอท.',
        forms: [9, 11],
        mockState: 'PostApproval 1', mockRole: 'secretary', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '07', to: '07G', label: 'มอบหมาย กอท.', wit: 'WIT0710', actor: 'เลขาธิการ ป.ป.ท. → ธุรการคดี กอท.',
        desc: 'อนุมัติพร้อมลงนาม คบ.9 แล้วเลือก กอท. ส่งแฟ้มเดิมให้ธุรการรับเรื่องและเสนอ ผอ. มอบหมายผู้รับผิดชอบ ห้ามส่งตรงผู้ปฏิบัติงานหรือเสนอ คบ.9 ลงนามซ้ำ',
        forms: [6, 9, 11], mockState: 'PostApproval 1', mockRole: 'secretary', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '07G', to: '08A', label: 'รับงานแล้ว', wit: 'A6POST06', actor: 'ผู้ได้รับมอบหมาย กอท.',
        desc: 'ผู้ได้รับมอบหมายรับงานแล้วเติม คบ.9 เฉพาะช่องที่อนุญาต ตรวจพร้อมส่ง และดำเนินการด้วยผลอนุมัติเดิม ไม่อนุมัติซ้ำหรือส่งกลับเจ้าของสำนวนเดิม',
        forms: [9, 11], mockState: 'Notice 6', mockRole: 'got_officer', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '07', to: '09A', label: 'ไม่อนุมัติ', wit: 'WIT0711', actor: 'เลขาธิการ ป.ป.ท. (ไม่อนุมัติ) → เจ้าหน้าที่',
        desc: 'เลขาธิการฯ ไม่อนุมัติพร้อมลงนาม คบ.10 จากชุดเสนอ เจ้าหน้าที่ตามเส้นทางเดิมเติมรายละเอียด ตรวจพร้อมส่ง แล้วแจ้งสิทธิอุทธรณ์ 30 วัน ไม่มีเส้นทาง กอท. หรือการลงนาม คบ.10 ซ้ำ',
        forms: [10],
        mockState: 'Edge 07→08A·09A·08C', mockRole: 'secretary', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '07', to: '08C', label: 'ข้อ 14', wit: 'WIT0713', actor: 'เลขาธิการ ป.ป.ท.',
        desc: 'เลขาธิการฯ เห็นควรใช้ข้อ 14 คือส่งเรื่องให้กรมคุ้มครองสิทธิและเสรีภาพรับไปคุ้มครองแทน (เมื่อมีมติเห็นชอบ)',
        mockState: 'Edge 07→08A·09A·08C', mockRole: 'secretary', mockRoute: '/dossier/WP-2569-000501',
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
        desc: 'วิธีที่อนุมัติรวมวิธีที่ 4 (ให้หน่วยงานอื่นคุ้มครอง) จึงเปิดงานทำหนังสือประสานและส่งมอบพยานด้วย คบ.12',
        forms: [12],
        mockState: 'Case 8.1', mockRole: 'officer', mockRoute: '/protection-methods',
    },
    {
        from: '08A-1', to: '10', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ลงนาม คบ.8 จัดแผนปฏิบัติ และชี้แจงชุดคุ้มครองครบแล้ว กด "เริ่มปฏิบัติจริง" การคุ้มครองจึงเข้าสู่ช่วงติดตามและรายงานผล',
        forms: [8, 13],
        mockState: 'Edge 08A-1→10', mockRole: 'officer', mockRoute: '/protection-method/1?caseNo=WP-2569-000501',
    },
    {
        from: '08A-2', to: '10', wit: 'WIT0829', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'พยานเข้าพักในสถานที่ที่ประเมินว่าปลอดภัยแล้ว บันทึกวันเริ่มจริงและสถานะเป็น ACTIVE แล้วเข้าสู่ช่วงติดตามและรายงานผล',
        forms: [13],
        mockState: 'Edge 08A-2→10', mockRole: 'officer', mockRoute: '/protection-method/2?caseNo=WP-2569-000501',
    },
    {
        from: '08A-3', to: '10', wit: 'WIT0837', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'เปิดใช้มาตรการปกปิดข้อมูลแล้ว (มีผลกับการค้นหา ดาวน์โหลด พิมพ์ และบันทึก Access Log จริง) แล้วเข้าสู่ช่วงติดตามและรายงานผล',
        forms: [13],
        mockState: 'Edge 08A-3→10', mockRole: 'officer', mockRoute: '/protection-method/3?caseNo=WP-2569-000501',
    },
    {
        from: '08B', to: '10', wit: 'WIT0851', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'หน่วยงานภายนอกตอบรับ รับมอบพยาน (ลงนาม คบ.12) และเริ่มปฏิบัติแล้ว เจ้าหน้าที่ยังต้องติดตามและรายงาน คบ.13 ทุกเดือน',
        forms: [12, 13],
        mockState: 'Edge 08B→10', mockRole: 'officer', mockRoute: '/protection-method/4?caseNo=WP-2569-000501',
    },
    {
        from: '09A', to: '09B', label: 'อุทธรณ์', wit: 'WIT0910', actor: 'พยาน/ผู้ยื่นคำร้อง → เจ้าหน้าที่รับเรื่อง',
        desc: 'หลังได้รับ คบ.10 พยานยื่นอุทธรณ์ภายใน 30 วัน เจ้าหน้าที่รับคำอุทธรณ์เข้าแฟ้มเดิมเพื่อกลั่นกรองและเสนอคณะกรรมการ',
        forms: [10],
        mockState: 'Case 4.1', mockRole: 'officer', mockRoute: '/dossier/WP-2569-000501',
    },
    {
        from: '09B', to: '08A', label: 'เปลี่ยนคำสั่ง', wit: 'WIT0922', actor: 'คณะกรรมการ ป.ป.ท. (มติ) → เจ้าหน้าที่',
        desc: 'คณะกรรมการมีมติเปลี่ยนคำสั่งเป็นให้คุ้มครอง จึงกลับไปเริ่มการคุ้มครองที่ 08A โดยใช้แฟ้มเดิม ไม่ต้องยื่นคำร้องใหม่',
        mockState: 'Case 4.3', mockRole: 'committee', mockRoute: '/appeal-folder/WP-2569-000501',
    },
    {
        from: '08C', to: '11C', label: 'ไม่เห็นชอบ', wit: 'WIT0858', actor: 'เลขาธิการ / คณะกรรมการ ป.ป.ท.',
        desc: 'ไม่เห็นชอบให้ส่งกรมคุ้มครองสิทธิฯ จึงบันทึกมติและเหตุผลไว้ เมื่อมาตรการเดิมสิ้นสุดแล้วให้เข้าสู่การจัดทำเรื่องยุติ',
        mockState: 'Edge 08C→11C', mockRole: 'committee', mockRoute: '/article14',
    },
    {
        from: '10', to: '11A', label: 'ถึงรอบทบทวน', wit: 'WIT1013', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'ผลรายงาน คบ.13 หรือกำหนดเวลาบอกว่าถึงเวลาทบทวน ระบบส่ง คบ.13 ล่าสุด ความเสี่ยง คำสั่ง และยอดวันสะสมไปประกอบการทบทวน',
        forms: [13],
        mockState: 'Edge 10→11A', mockRole: 'officer', mockRoute: '/protection-monitor?caseNo=WP-2569-000501',
    },
    {
        from: '11A', to: '10', label: 'คุ้มครองต่อ', wit: 'WIT1108', actor: 'เจ้าหน้าที่ (ผบช.ชั้นต้นเห็นชอบ)',
        desc: 'ทบทวนแล้วเห็นว่ายังคุ้มครองต่อได้ภายใต้คำสั่งเดิม จึงกลับไปตั้งรอบรายงาน คบ.13 ถัดไป',
        forms: [13],
        mockState: 'Edge 11A→10', mockRole: 'officer', mockRoute: '/protection-review/WP-2569-000501',
    },
    {
        from: '11A', to: '11B', label: 'ขยายเวลา', wit: 'WIT1109', actor: 'เจ้าหน้าที่ (ผบช.ชั้นต้นเห็นชอบ)',
        desc: 'คำสั่งเดิมใกล้หมดแต่พยานยังต้องการคุ้มครอง และยอดสะสมยังไม่ถึงเพดาน 6 เดือน (180 วัน) จึงขอขยายเวลาด้วย คบ.14',
        forms: [14],
        mockState: 'Edge 11A→11B', mockRole: 'officer', mockRoute: '/protection-review/WP-2569-000501',
    },
    {
        from: '11A', to: '11C', label: 'ยุติ', wit: 'WIT1111', actor: 'เจ้าหน้าที่ (ผบช.ชั้นต้นเห็นชอบ)',
        desc: 'ทบทวนแล้วเห็นควรยุติ เช่น พยานปลอดภัยแล้ว ครบกำหนด หรือพยานขอยุติเอง (คบ.7) จึงเข้าสู่การจัดทำเรื่องยุติ',
        forms: [7, 15],
        mockState: 'Edge 11A→11C', mockRole: 'officer', mockRoute: '/protection-review/WP-2569-000501',
    },
    {
        from: '11A', to: '08C', label: 'ครบ 6 เดือน ยังมีภัย', wit: 'WIT1149', actor: 'เจ้าหน้าที่ผู้รับผิดชอบ',
        desc: 'คุ้มครองครบเพดาน 6 เดือนแล้วแต่พยานยังมีภัย ขยายด้วย คบ.14 ไม่ได้อีก จึงต้องส่งเรื่องตามข้อ 14 ให้กรมคุ้มครองสิทธิฯ รับช่วง',
        forms: [14],
        mockState: 'Case 10', mockRole: 'officer', mockRoute: '/protection-review/WP-2569-000501',
    },
    {
        from: '11B', to: '10', label: 'อนุมัติ', wit: 'WIT1122', actor: 'เลขาธิการ ป.ป.ท.',
        desc: 'เลขาธิการฯ อนุมัติขยายเวลา ระบบล็อก คบ.14 ฉบับลงนามและเพิ่มช่วงคุ้มครองใหม่ต่อจากเดิม แล้วกลับไปติดตามและรายงานผล',
        forms: [14, 13],
        mockState: 'Case 9.2', mockRole: 'secretary', mockRoute: '/protection-extension/WP-2569-000501',
    },
    {
        from: '11B', to: '11C', label: 'ไม่อนุมัติ', wit: 'WIT1123', actor: 'เลขาธิการ ป.ป.ท.',
        desc: 'เลขาธิการฯ ไม่อนุมัติขยายเวลา คำสั่งเดิมยังมีผลจนถึงวันสิ้นสุด เมื่อถึงกำหนดแล้วเจ้าหน้าที่ต้องเข้าสู่การจัดทำเรื่องยุติ',
        forms: [14],
        mockState: 'Case 9.2', mockRole: 'secretary', mockRoute: '/protection-extension/WP-2569-000501',
    },
    {
        from: '11C', to: '11D', wit: 'WIT1134', actor: 'ผู้บังคับบัญชาชั้นต้น',
        desc: 'ผู้บังคับบัญชาตรวจรายงาน คบ.15 แล้วเห็นว่าครบถ้วน จึงเสนอผู้มีอำนาจพิจารณาออกคำสั่งยุติ',
        forms: [15],
        mockState: 'Case 1.15', mockRole: 'supervisor', mockRoute: '/termination/WP-2569-000501',
    },
    {
        from: '11D', to: '10', label: 'ไม่อนุมัติยุติ', wit: 'WIT1137', actor: 'ผู้มีอำนาจพิจารณา',
        desc: 'ผู้มีอำนาจไม่อนุมัติให้ยุติ การคุ้มครองจึงดำเนินต่อภายใต้คำสั่งเดิมและกลับไปติดตามและรายงานผล',
        forms: [13],
        mockState: 'Case 1.16', mockRole: 'director', mockRoute: '/termination/WP-2569-000501',
    },
    {
        from: '11D', to: '09B', label: 'อุทธรณ์', wit: 'WIT1147', actor: 'พยาน → เจ้าหน้าที่รับเรื่อง',
        desc: 'หลังได้รับหนังสือแจ้งคำสั่งยุติ คบ.17 พยานยื่นอุทธรณ์ภายใน 30 วัน เจ้าหน้าที่ผูกคำอุทธรณ์กับแฟ้มเดิม ไม่ต้องยื่นคำร้องใหม่',
        forms: [17],
        mockState: 'Case 1.18', mockRole: 'officer', mockRoute: '/termination/WP-2569-000501',
    },
]

/** สรุปภาษาง่ายว่าแต่ละแท็บคือช่วงไหนของงานคุ้มครองพยาน — ใช้ในการ์ดตอนชี้และแผงข้างของกล่องแท็บ */
export const TAB_SUMMARY: Record<string, string> = {
    '07G': 'อนุมัติและมอบหมาย กอท. → ธุรการคดีรับเรื่อง → ส่งเสนอ ผอ. กอท. → ผอ. มอบหมาย → ผู้รับผิดชอบรับงานและดำเนินการต่อด้วยผลอนุมัติเดิม',
    '02': 'จุดเริ่มต้น: ธุรการรับคำขอคุ้มครองเข้าทะเบียน (เป็นคำร้อง คบ.1 หรือ คบ.2) แล้วค้นหาและเชื่อมโยงกับเลขสำนวนคดีหลักที่พยานเกี่ยวข้อง',
    '03': 'ผอ. มอบหมายเจ้าหน้าที่ผู้รับผิดชอบ เจ้าหน้าที่ตรวจว่าเรื่องเร่งด่วนหรือไม่ และระบบบอกว่าต้องจัดทำเอกสารตั้งต้นอะไรบ้าง',
    '04': 'เจ้าหน้าที่จัดทำเอกสารตั้งต้นให้ครบ (คบ.1 คำร้อง และ คบ.3 บันทึกข้อเท็จจริง) แล้วแยกทางตามความเร่งด่วน: ปกติทำ คบ.6 ส่วนเร่งด่วนทำ คบ.4',
    '05': 'เส้นทางปกติ: บันทึกเสนอความเห็น คบ.6 ผ่านการกลั่นกรองตามลำดับชั้น ผู้บังคับบัญชาชั้นต้น → ผอ. → รองเลขาธิการฯ ก่อนเสนอเลขาธิการฯ',
    '06': 'เส้นทางเร่งด่วน: ผอ. สั่งคุ้มครองชั่วคราวได้ทันทีด้วยคำสั่ง คบ.5 ระหว่างนั้นคำร้องหลักยังต้องเดินเส้นทางปกติต่อเพื่อขออนุมัติจริง',
    '07': 'เลขาธิการ ป.ป.ท. ชี้ขาดคำร้อง: อนุมัติ ไม่อนุมัติ ส่งกลับให้แก้ หรือเห็นควรส่งกรมคุ้มครองสิทธิฯ ตามข้อ 14',
    '08A': 'หลังอนุมัติ เจ้าหน้าที่แจ้งพยาน (คบ.9) และทำบันทึกข้อตกลง (คบ.11) ให้ลงนามครบ แล้วแยกงานไปตามวิธีคุ้มครองที่อนุมัติ',
    '08A-1': 'วิธีที่ 1 จัดเจ้าหน้าที่คุ้มครองความปลอดภัย: ออกคำสั่งตั้งชุดคุ้มครอง (คบ.8) วางแผนเวร รถ อุปกรณ์ แล้วเริ่มปฏิบัติจริง',
    '08A-2': 'วิธีที่ 2 จัดให้พยานอยู่ในสถานที่ปลอดภัย: เสนอสถานที่ ประเมินความปลอดภัย วางแผนย้าย แล้วบันทึกว่าพยานเข้าพักแล้ว',
    '08A-3': 'วิธีที่ 3 ปกปิดข้อมูลพยาน: เลือกข้อมูลที่ต้องปกปิด กำหนดว่าใครเห็นได้ และจำกัดการค้นหา ดาวน์โหลด พิมพ์ และส่งต่อ',
    '08B': 'วิธีที่ 4 ให้หน่วยงานอื่นคุ้มครอง: ทำหนังสือประสาน รอตอบรับ ส่งมอบพยานพร้อมบันทึก คบ.12 และยังต้องติดตามรายงานทุกเดือน',
    '08C': 'ส่งเรื่องให้กรมคุ้มครองสิทธิและเสรีภาพรับไปคุ้มครองแทนตามข้อ 14 ต้องผ่านความเห็นชอบตามลำดับชั้นและมติคณะกรรมการ',
    '09A': 'เมื่อไม่อนุมัติ เจ้าหน้าที่ทำหนังสือแจ้งผล คบ.10 ให้เลขาธิการฯ ลงนาม ส่งถึงพยาน แล้วเริ่มนับกรอบอุทธรณ์ 30 วัน',
    '09B': 'รับคำอุทธรณ์ของพยาน กลั่นกรองตามลำดับชั้น แล้วเสนอคณะกรรมการ ป.ป.ท. มีมติยืนคำสั่งเดิมหรือเปลี่ยนคำสั่ง',
    '10': 'ช่วงคุ้มครองจริง: เจ้าหน้าที่ติดตามผลและทำรายงาน คบ.13 ทุกรอบ (ลงนามทั้งเจ้าหน้าที่และพยาน) และเฝ้าดูวันสะสมไม่ให้เกิน 180 วัน',
    '11A': 'ทบทวนผลการคุ้มครองเมื่อถึงรอบ แล้วเลือกแนวทาง: คุ้มครองต่อ ขยายเวลา ยุติ หรือส่งกรมคุ้มครองสิทธิฯ เมื่อครบ 6 เดือนแต่ยังมีภัย',
    '11B': 'ขอขยายระยะเวลาคุ้มครองด้วย คบ.14 เสนอตรงถึงเลขาธิการฯ อนุมัติ โดยยอดรวมทั้งหมดต้องไม่เกินเพดาน 6 เดือน',
    '11C': 'เริ่มกระบวนการยุติ: บันทึกที่มาของเหตุยุติ (เช่น พยานขอยุติด้วย คบ.7 หรือครบกำหนด) แล้วทำรายงานสรุป คบ.15 ให้ผู้บังคับบัญชาตรวจ',
    '11D': 'ผู้มีอำนาจออกคำสั่งยุติ (คบ.16) แจ้งพยานด้วย คบ.17 พร้อมสิทธิอุทธรณ์ 30 วัน แล้วปิดงานเมื่อพ้นกรอบอุทธรณ์',
}

/** ชื่อบทบาทแบบย่อสำหรับป้ายในกล่อง */
export const ROLE_SHORT: Record<UserRole, string> = {
    got_receiver: 'ธุรการคดี กอท.',
    got_director: 'ผอ. กอท.',
    got_officer: 'จนท. กอท.',
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

const PAD_X = 64
const PAD_Y = 16
const NODE_W = 188
const NODE_H = 104
const COL_PITCH = 236
const ROW_PITCH = 148
export const OVERVIEW_W = PAD_X * 2 + COL_PITCH * 4 + NODE_W
export const OVERVIEW_H = PAD_Y * 2 + ROW_PITCH * 10 + NODE_H

const nodeBox = (tab: string) => {
    const { col, row } = OVERVIEW_LAYOUT[tab]
    return { x: PAD_X + col * COL_PITCH, y: PAD_Y + row * ROW_PITCH }
}

/** เส้นลงล่างออกจากขอบล่างเข้าขอบบน เส้นแถวเดียวกันต่อตรง ส่วนเส้นย้อนขึ้นอ้อมด้านข้างให้ไม่ทับกล่อง */
function edgePath(edge: OverviewEdge) {
    const a = nodeBox(edge.from)
    const b = nodeBox(edge.to)
    if (b.y > a.y) {
        const x1 = a.x + NODE_W / 2
        const y1 = a.y + NODE_H
        const x2 = b.x + NODE_W / 2
        const y2 = b.y
        const dy = (y2 - y1) / 2
        return { d: `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, back: false }
    }
    if (b.y === a.y) {
        // แถวเดียวกัน: ต่อตรงระหว่างขอบที่หันเข้าหากัน
        const x1 = b.x > a.x ? a.x + NODE_W : a.x
        const x2 = b.x > a.x ? b.x : b.x + NODE_W
        const y = a.y + NODE_H / 2
        return { d: `M${x1},${y} L${x2},${y}`, mid: { x: (x1 + x2) / 2, y }, back: false }
    }
    if (a.y - b.y === ROW_PITCH && b.x !== a.x) {
        // ย้อนขึ้นหนึ่งแถวแบบเฉียง: ออกขอบบนแล้ววิ่งในช่องว่างระหว่างแถว เข้าขอบล่างฝั่งที่หันหาต้นทาง
        const toLeft = b.x < a.x
        const x1 = toLeft ? a.x + 24 : a.x + NODE_W - 24
        const y1 = a.y
        const x2 = toLeft ? b.x + NODE_W - 24 : b.x + 24
        const y2 = b.y + NODE_H
        const gap = (y1 + y2) / 2
        return { d: `M${x1},${y1} C${x1},${gap} ${x2},${gap} ${x2},${y2}`, mid: { x: (x1 + x2) / 2, y: gap }, back: true }
    }
    const left = b.x < a.x || (b.x === a.x && a.x <= OVERVIEW_W / 2 - NODE_W / 2)
    const x1 = left ? a.x : a.x + NODE_W
    const x2 = left ? b.x : b.x + NODE_W
    const y1 = a.y + NODE_H / 2
    const y2 = b.y + NODE_H / 2
    const bulge = (left ? -1 : 1) * (48 + Math.abs(y2 - y1) * 0.12)
    const cx1 = x1 + bulge
    const cx2 = x2 + bulge
    // จุดกึ่งกลางของ cubic bezier ที่ t = 0.5
    const mid = { x: (x1 + 3 * cx1 + 3 * cx2 + x2) / 8, y: (y1 + y2) / 2 }
    return { d: `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`, mid, back: true }
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

/** กล่องของแต่ละแท็บสำหรับแผนที่ย่อ (สีตามสถานะรวมของแท็บ) */
export function overviewMinimap(): MinimapItem[] {
    return FLOW_GUIDE.tabs
        .filter((t) => OVERVIEW_LAYOUT[t.tab])
        .map((t) => ({ ...nodeBox(t.tab), w: NODE_W, h: NODE_H, fill: TONE_FILL[tabTone(t)] }))
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

interface FlowOverviewCanvasProps {
    onPick: (tab: string) => void
    /** กล่องแท็บที่เลือกอยู่ — แผงรายละเอียดเปิดอยู่ */
    selectedTab?: string | null
    /** เส้นที่เลือกอยู่ (edgeKey) — แผงรายละเอียดเปิดอยู่ */
    selectedEdge?: string | null
    onPickEdge?: (edge: OverviewEdge) => void
}

/** เนื้อผังภาพรวม ขนาด OVERVIEW_W × OVERVIEW_H — วางใน ZoomViewport ซึ่งจัดการซูม เลื่อน และเต็มจอ */
export const FlowOverviewCanvas: React.FC<FlowOverviewCanvasProps> = ({ onPick, selectedTab = null, selectedEdge = null, onPickEdge }) => {
    const [hovered, setHovered] = useState<string | null>(null)
    const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
    const tabs = useMemo(() => FLOW_GUIDE.tabs.filter((t) => OVERVIEW_LAYOUT[t.tab]), [])
    const paths = useMemo(() => OVERVIEW_EDGES.map((e) => ({ edge: e, ...edgePath(e) })), [])
    // ลำดับการไฮไลต์: เส้นที่ชี้ > กล่องที่ชี้ > เส้นที่เลือก > กล่องที่เลือก
    const focusEdge = hoveredEdge ?? (hovered ? null : selectedEdge)
    const focusTab = hoveredEdge ? null : hovered ?? (selectedEdge ? null : selectedTab)
    const isLinked = (e: OverviewEdge) => (focusEdge ? edgeKey(e) === focusEdge : !!focusTab && (e.from === focusTab || e.to === focusTab))
    const anyFocus = !!focusEdge || !!focusTab
    const tabTip = hovered && hovered !== selectedTab && !hoveredEdge ? tabs.find((t) => t.tab === hovered) : undefined
    const tip = hoveredEdge && hoveredEdge !== selectedEdge ? paths.find((p) => edgeKey(p.edge) === hoveredEdge) : undefined
    const edgeHandlers = (e: OverviewEdge) => ({
        onMouseEnter: () => setHoveredEdge(edgeKey(e)),
        onMouseLeave: () => setHoveredEdge(null),
        onClick: () => onPickEdge?.(e),
    })

    return (
                <div className="relative" style={{ width: OVERVIEW_W, height: OVERVIEW_H }}>
                    <svg className="absolute inset-0" width={OVERVIEW_W} height={OVERVIEW_H}>
                        <defs>
                            <marker id="fo-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                                <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
                            </marker>
                            <marker id="fo-arrow-hl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                                <path d="M0,0 L10,5 L0,10 z" fill="#16558f" />
                            </marker>
                        </defs>
                        {paths.map(({ edge, d, back }) => {
                            const hl = isLinked(edge)
                            return (
                                <g key={edgeKey(edge)}>
                                    <path
                                        d={d}
                                        fill="none"
                                        stroke={hl ? '#16558f' : '#94a3b8'}
                                        strokeWidth={hl ? 2.25 : 1.25}
                                        strokeDasharray={back ? '5 4' : undefined}
                                        opacity={anyFocus && !hl ? 0.25 : 1}
                                        markerEnd={hl ? 'url(#fo-arrow-hl)' : 'url(#fo-arrow)'}
                                        pointerEvents="none"
                                    />
                                    {/* เส้นโปร่งใสหนา ๆ ให้ชี้/กดโดนง่าย */}
                                    <path d={d} fill="none" stroke="transparent" strokeWidth={14} className="cursor-pointer" pointerEvents="stroke" {...edgeHandlers(edge)}>
                                        <title>{`${edge.from} → ${edge.to}${edge.label ? ` · ${edge.label}` : ''}`}</title>
                                    </path>
                                </g>
                            )
                        })}
                    </svg>

                    {paths.map(({ edge, mid }) => {
                        const hl = isLinked(edge)
                        return (
                            <button
                                key={`label-${edgeKey(edge)}`}
                                type="button"
                                aria-label={`คำอธิบายเส้น ${edge.from} ไป ${edge.to}${edge.label ? ` ${edge.label}` : ''}`}
                                {...edgeHandlers(edge)}
                                onFocus={() => setHoveredEdge(edgeKey(edge))}
                                onBlur={() => setHoveredEdge(null)}
                                className={cn(
                                    'absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border text-[10px] leading-tight transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue',
                                    edge.label ? 'px-1.5 py-px' : 'flex h-4 w-4 items-center justify-center p-0',
                                    hl ? 'z-20 border-blue bg-blue text-white' : 'z-10 border-slate-200 bg-white text-slate-500 hover:border-blue hover:text-blue',
                                    anyFocus && !hl && 'opacity-30'
                                )}
                                style={{ left: mid.x, top: mid.y }}
                            >
                                {edge.label ?? <i className="fa-solid fa-info text-[8px]" />}
                            </button>
                        )
                    })}

                    {tip && <EdgeTooltip edge={tip.edge} x={tip.mid.x} y={tip.mid.y} />}
                    {tabTip && <TabTooltip tab={tabTip} />}

                    {tabs.map((t) => {
                        const { x, y } = nodeBox(t.tab)
                        const tone = tabTone(t)
                        const forms = tabForms(t)
                        const dim = anyFocus && focusTab !== t.tab && !OVERVIEW_EDGES.some((e) => isLinked(e) && (e.from === t.tab || e.to === t.tab))
                        return (
                            <button
                                key={t.tab}
                                type="button"
                                onClick={() => onPick(t.tab)}
                                onMouseEnter={() => setHovered(t.tab)}
                                onMouseLeave={() => setHovered(null)}
                                onFocus={() => setHovered(t.tab)}
                                onBlur={() => setHovered(null)}
                                aria-label={`แท็บ ${t.tab} ${tabShortTitle(t)} — กดเพื่อดูคำอธิบาย`}
                                className={cn(
                                    'absolute z-30 flex flex-col overflow-hidden rounded-xl border-2 bg-white text-left shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue',
                                    tone === 'emerald' && 'border-emerald-400',
                                    tone === 'amber' && 'border-amber-400',
                                    tone === 'rose' && 'border-rose-400',
                                    (hovered === t.tab || selectedTab === t.tab) && 'ring-2 ring-blue',
                                    dim && 'opacity-40'
                                )}
                                style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
                            >
                                <div className="flex flex-1 flex-col px-2.5 pt-1.5">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="shrink-0 whitespace-nowrap font-mono text-xs font-bold text-navy-deep">{t.tab}</span>
                                        <span className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-700">{tabShortTitle(t)}</span>
                                    </div>
                                    <div className="mt-auto space-y-1 pb-1.5">
                                        <div className="flex flex-wrap gap-1">
                                            {tabRoles(t).map((r) => (
                                                <span key={r} className="rounded bg-blue-50 px-1 text-[10px] font-medium text-blue">
                                                    {ROLE_SHORT[r] ?? r}
                                                </span>
                                            ))}
                                        </div>
                                        {forms.length > 0 && <FormChips forms={forms} />}
                                    </div>
                                </div>
                                <StatusBar tab={t} className="h-1.5" />
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
    const box = nodeBox(tab.tab)
    // วางขวาของกล่องถ้ามีที่ ไม่เช่นนั้นวางซ้าย และไม่ให้ล้นขอบล่าง
    const right = box.x + NODE_W + 12 + W <= OVERVIEW_W
    const left = right ? box.x + NODE_W + 12 : Math.max(box.x - W - 12, 8)
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
