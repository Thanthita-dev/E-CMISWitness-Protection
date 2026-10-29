import { FormMeta } from '../types/forms'
import { ACTIVE_ROLE_SET } from './roleSets'
import { OrgUnit, EcmisUser, UserRole, RoleAssignment } from '../types/user'
import { Article14ReviewLevel, Article14Step, CaseItem, CoordinationAgencyType, MainCaseOption, ReturnIssue } from '../types/case'

export const FORMS_CATALOG: FormMeta[] = [
    { n: 1, code: 'คบ.1', t: 'คำร้องขอให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น', d: 'สำหรับผู้ร้อง/พยานยื่นคำขอเพื่อเข้าสู่มาตรการคุ้มครองพยาน พร้อมลายมือชื่อยินยอมของบุคคลที่เกี่ยวข้องทุกคน', pages: 4 },
    { n: 2, code: 'คบ.2', t: 'คำร้องขอคุ้มครองพยานผ่านช่องทางการสื่อสาร', d: 'สำหรับเจ้าพนักงานบันทึกรายละเอียดกรณีเร่งด่วน เมื่อผู้ร้องขอไม่อาจมายื่นคำร้องขอด้วยตนเอง (พยานต้องมาลงนาม คบ.1 ภายหลัง)', pages: 1 },
    { n: 3, code: 'คบ.3', t: 'บันทึกข้อเท็จจริงประกอบการขอใช้มาตรการคุ้มครองเบื้องต้น', d: 'สำหรับเจ้าพนักงานบันทึกถ้อยคำและข้อเท็จจริงประกอบคำร้อง (ข้ามได้หากระบุครบใน คบ.1 แต่ต้องบันทึกเหตุผล)', pages: 2 },
    { n: 4, code: 'คบ.4', t: 'บันทึกข้อความขอคุ้มครองพยานชั่วคราว กรณีจำเป็นเร่งด่วน', d: 'สำหรับเจ้าพนักงานเสนอ ผอ.สำนัก/กอง/ศูนย์ พิจารณามาตรการชั่วคราวทันที', pages: 3 },
    { n: 5, code: 'คบ.5', t: 'คำสั่งมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองชั่วคราว', d: 'คำสั่ง ผอ.สำนัก/กอง/ศูนย์ แต่งตั้งชุดคุ้มครองปฏิบัติการชั่วคราวกรณีเร่งด่วน', pages: 1 },
    { n: 6, code: 'คบ.6', t: 'บันทึกข้อความการคุ้มครองพยานในเบื้องต้น', d: 'สำหรับเจ้าพนักงานประเมินความเสี่ยงและเสนอมาตรการ ผ่านความเห็นตามลำดับชั้นถึงเลขาธิการคณะกรรมการ ป.ป.ท.', pages: 3 },
    { n: 7, code: 'คบ.7', t: 'คำร้องขอยุติการคุ้มครองพยาน', d: 'เสนอเลขาธิการ ป.ป.ท. ลงนามสั่งยุติมาตรการเมื่อพยานปลอดภัยแล้ว ครบกำหนด หรือไม่อนุมัติขยายเวลา', pages: 2 },
    { n: 8, code: 'คบ.8', t: 'คำสั่งมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น', d: 'คำสั่งเลขาธิการคณะกรรมการ ป.ป.ท. แต่งตั้งชุดคุ้มครองและกำหนดอำนาจหน้าที่', pages: 1 },
    { n: 9, code: 'คบ.9', t: 'หนังสือแจ้งตอบรับการให้ความคุ้มครอง', d: 'แจ้งผลการอนุมัติและเงื่อนไขการปฏิบัติระหว่างอยู่ในความคุ้มครองให้ผู้ยื่นคำร้องทราบ', pages: 1 },
    { n: 10, code: 'คบ.10', t: 'หนังสือแจ้งคำสั่งไม่ให้พยานได้รับการคุ้มครอง', d: 'แจ้งผลไม่อนุมัติพร้อมเหตุผลและสิทธิอุทธรณ์ภายใน 30 วันนับแต่วันที่ได้รับแจ้งคำสั่ง', pages: 1 },
    { n: 11, code: 'คบ.11', t: 'บันทึกข้อตกลงการคุ้มครองพยานโดยใช้มาตรการเบื้องต้น', d: 'ข้อตกลงรูปแบบ ระยะเวลา วิธีการและเงื่อนไขการคุ้มครองระหว่างพยานกับสำนักงาน ป.ป.ท.', pages: 3 },
    { n: 12, code: 'คบ.12', t: 'บันทึกการส่งมอบพยานในคดีการทุจริตในภาครัฐ', d: 'บันทึกส่งมอบพยานให้หน่วยงานภายนอกดูแลต่อ พร้อมรายงานการปฏิบัติหน้าที่ของเจ้าหน้าที่คุ้มครองพยาน', pages: 2 },
    { n: 13, code: 'คบ.13', t: 'รายงานผลการปฏิบัติการคุ้มครองพยาน', d: 'รายงานการปฏิบัติงานคุ้มครองพยานประจำงวดรายเดือน และรายงานเหตุสำคัญ', pages: 1 },
    { n: 14, code: 'คบ.14', t: 'หนังสือขยายระยะเวลาการคุ้มครองพยาน', d: 'เสนอผ่านผู้บังคับบัญชาชั้นต้น ผอ.กอง รองเลขาธิการ และเลขาธิการ', pages: 1 },
    { n: 15, code: 'คบ.15', t: 'รายงานการให้ความคุ้มครองพยานสิ้นสุด', d: 'สรุปเหตุยุติ ผลการคุ้มครองและหลักฐานประกอบ เสนอตามลำดับชั้นก่อนเลขาธิการ ป.ป.ท.ออกคำสั่งยุติ (คบ.15 เพียงอย่างเดียวยังไม่ทำให้การคุ้มครองสิ้นสุด)', pages: 2 },
    { n: 16, code: 'คบ.16', t: 'คำสั่งยุติการให้ความคุ้มครองพยาน', d: 'คำสั่งของเลขาธิการ ป.ป.ท. ระบุเหตุยุติ วันที่ออกคำสั่ง และวันที่คำสั่งมีผล — สถานะยุติเกิดขึ้นเมื่อคำสั่งลงนามและถึงวันที่มีผลเท่านั้น', pages: 1 },
    { n: 17, code: 'คบ.17', t: 'หนังสือแจ้งคำสั่งยุติการคุ้มครองพยาน', d: 'แจ้งคำสั่งยุติพร้อมสิทธิอุทธรณ์ภายใน 30 วันนับแต่วันที่พยานได้รับหนังสือ ออกเลขและนำส่งผ่านระบบสารบรรณเดิม', pages: 1 },
    { n: 18, code: 'หนังสือส่งต่อหน่วยงานอื่น', t: 'หนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยาน (ส่งหน่วยงานปลายทาง)', d: 'หนังสือจากสำนักงาน ป.ป.ท. ถึงหัวหน้าหน่วยงานปลายทาง (กรมการปกครอง / ตำรวจ / ทหาร / กรมคุ้มครองสิทธิและเสรีภาพ) แจ้งมติให้มีมาตรการช่วยเหลือแก่พยานตามมาตรา 54 — จัดทำในเส้นทางส่งต่อหน่วยงานอื่นช่วยคุ้มครองพยาน', pages: 1, flowOnly: true },
    { n: 19, code: 'บันทึกเสนอประธานลงนาม', t: 'บันทึกเสนอประธานกรรมการ ป.ป.ท. ลงนาม ผ่านเลขาธิการ', d: 'บันทึกเสนอประธานลงนามหนังสือถึงอธิบดีกรมคุ้มครองสิทธิและเสรีภาพ ตามต้นฉบับลูกค้า', pages: 2, flowOnly: true },
    { n: 20, code: 'หนังสือถึงกรมคุ้มครองสิทธิฯ', t: 'หนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยาน ถึงอธิบดีกรมคุ้มครองสิทธิและเสรีภาพ', d: 'หนังสือประกอบการส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ ตามต้นฉบับลูกค้า', pages: 1, flowOnly: true },
]

export const ORG_UNITS: OrgUnit[] = [
    { id: 'central-gmc', name: 'กองอำนวยการต่อต้านทุจริต (กอท.)', isCentral: true },
    { id: 'central-wp', name: 'กลุ่มงานคุ้มครองพยาน (ส่วนกลาง)', isCentral: true },
    { id: 'pacc-reg-1', name: 'สำนักงาน ป.ป.ท. เขต 1 (ภาคกลาง)' },
    { id: 'pacc-reg-2', name: 'สำนักงาน ป.ป.ท. เขต 2 (ภาคตะวันออก)' },
    { id: 'pacc-reg-3', name: 'สำนักงาน ป.ป.ท. เขต 3 (ภาคตะวันออกเฉียงเหนือตอนล่าง)' },
    { id: 'pacc-reg-4', name: 'สำนักงาน ป.ป.ท. เขต 4 (ภาคตะวันออกเฉียงเหนือตอนบน)' },
    { id: 'pacc-reg-5', name: 'สำนักงาน ป.ป.ท. เขต 5 (ภาคเหนือตอนบน)' },
    { id: 'pacc-reg-6', name: 'สำนักงาน ป.ป.ท. เขต 6 (ภาคเหนือตอนล่าง)' },
    { id: 'pacc-reg-7', name: 'สำนักงาน ป.ป.ท. เขต 7 (ภาคตะวันตก)' },
    { id: 'pacc-reg-8', name: 'สำนักงาน ป.ป.ท. เขต 8 (ภาคใต้ตอนบน)' },
    { id: 'pacc-reg-9', name: 'สำนักงาน ป.ป.ท. เขต 9 (ภาคใต้ตอนล่าง)' },
]

/** ชื่อบทบาทและรายชื่อผู้ใช้มาจากชุดบทบาท (src/data/role-sets/*.json) ที่เลือกตอนบูต */
export const ROLE_NAMES: Record<UserRole, string> = ACTIVE_ROLE_SET.roleNames

/**
 * บทบาทที่ทำหน้าที่ "ผู้ปฏิบัติในสำนวน" — เจ้าหน้าที่ ป.ป.ท. และเจ้าของสำนวน
 * ทั้งสองบทบาทมีสิทธิ์และเส้นทางงานเหมือนกัน ต่างกันที่ความรับผิดชอบต่อคดีหลัก
 */
export const CASE_WORKER_ROLES: UserRole[] = ['officer', 'case_owner']

export const isCaseWorkerRole = (role: UserRole): boolean =>
    role === 'officer' || role === 'case_owner' || role === 'got_officer' || role === 'admin'

export const ROLE_ORG_ASSIGNMENTS: Record<string, RoleAssignment> = {
    got_receiver: { units: ['central-gmc'] },
    got_director: { units: ['central-gmc'] },
    got_officer: { units: ['central-gmc'] },
    got_supervisor: { units: ['central-gmc'] },
    receiver: { units: ['central-gmc', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    officer: { units: ['central-wp', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    case_owner: { units: ['central-wp', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    supervisor: { units: ['central-wp', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    director: { units: ['central-gmc', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    secretary_receiver: { units: ['central-gmc', 'central-wp'], central: true },
    deputy_secretary: { units: ['central-gmc', 'central-wp'], central: true },
    secretary: { units: ['central-gmc', 'central-wp'], central: true },
    committee: { units: ['central-gmc'], central: true },
    protection: { units: ['central-wp', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    appeal: { units: ['central-gmc', 'central-wp'], central: true },
    admin: { units: ORG_UNITS.map(u => u.id), central: true },
}

export const ECMIS_USER_DIRECTORY: EcmisUser[] = ACTIVE_ROLE_SET.users

/** ชื่อผู้ใช้ตามรหัสในทะเบียน — ใช้แทนการฝังชื่อบุคคล เพื่อให้เปลี่ยนชุดบทบาทแล้วชื่อเปลี่ยนตาม */
export const userNameById = (id: string): string => ECMIS_USER_DIRECTORY.find((u) => u.id === id)?.name ?? id
export const userPositionById = (id: string): string => ECMIS_USER_DIRECTORY.find((u) => u.id === id)?.position ?? ''

export const MAIN_CASE_OPTIONS: MainCaseOption[] = [
    { id: 'GBK-2569-0001', no: 'กบค. 001/2569', title: 'คดีทุจริตโครงการจัดซื้ออุปกรณ์เทศบาลตำบลโคกสะอาด', accused: 'นายวิชาญ พรหมรักษา และพวก', agency: 'กองบริหารคดี', leadOfficer: 'ร.ต.อ.สมชาย ตรวจสอบธรรม', risk: 'สูง', matchScore: 100 },
    { id: 'GBK-2569-0123', no: 'กบค. 123/2569', title: 'คดีเรียกรับผลประโยชน์การตรวจรับงานก่อสร้างเขื่อนกั้นดิน', accused: 'นายอัครเดช บรรเจิดศิลป์', agency: 'สำนักงาน ป.ป.ท. เขต 1', leadOfficer: 'พ.ต.ท.สมศักดิ์ สืบสวนดี', risk: 'วิกฤต', matchScore: 98 },
    { id: 'GBK-2569-0089', no: 'กบค. 089/2569', title: 'คดีเบิกจ่ายงบประมาณโครงการฝึกอบรมอันเป็นเท็จ', accused: 'นางเพ็ญศรี สุขเกษม', agency: 'กองบริหารคดี', leadOfficer: userNameById('OFF-002'), risk: 'ปานกลาง', matchScore: 85 },
    { id: 'GBK-2569-0045', no: 'กบค. 045/2569', title: 'คดีลักลอบตัดไม้มีค่าในเขตป่าสงวนโดยเจ้าหน้าที่เอื้อประโยชน์', accused: 'นายชูชาติ รัตนโกสินทร์', agency: 'สำนักงาน ป.ป.ท. เขต 5', leadOfficer: 'พ.ต.ต.เอกชัย ไพรพิทักษ์', risk: 'สูง', matchScore: 90 },
    // Customer Demo — เรื่องร้องเรียนจากกิจกรรมที่ 4 (context/scenario/2_Oct/scenario e-cmis.xlsx และ context/scenario/data-A4-5/) ที่มีเลขสำนวนตามมาตรา 18/1 ก
    { id: 'GBK-2569-D0001', no: 'กบค. 0001/2569', title: 'สูบบุหรี่ในที่ทำงาน', accused: 'ณัฐกานต์ แพนดอร่า', agency: 'กองบริหารคดี', leadOfficer: 'กรรชัย กำเนิดทอง', risk: 'ปานกลาง', matchScore: 100 },
    { id: 'GBK-2569-D0005', no: 'กบค. 0005/2569', title: 'เรียกรับเงิน “แป๊ะเจี๊ยะ” จากผู้ปกครองโดยไม่ออกใบเสร็จ และนำเงินเข้ากองทุนส่วนตัว เพื่อแลกกับสิทธิ์ในการรับนักเรียนเข้าศึกษาต่อ', accused: 'นายสมศักดิ์ หาผลประโยชน์', agency: 'กองบริหารคดี', leadOfficer: 'กรรชัย กำเนิดทอง', risk: 'สูง', matchScore: 100 },
]

/**
 * ดึงเจ้าของสำนวนคดีหลักเพื่อบันทึกเป็น snapshot ลงในแฟ้ม ณ ตอนเชื่อมโยง
 * เจ้าของสำนวนคดีหลักบางรายเป็นเจ้าพนักงานนอกทะเบียนผู้ใช้งานคุ้มครองพยาน จึงคืนเฉพาะชื่อ (ไม่มี userId)
 * ส่ง mainCaseId ที่ไม่พบหรือ undefined จะคืนค่าว่างทั้งคู่ ใช้สำหรับล้างค่าเมื่อยกเลิกการเชื่อมโยงได้ด้วย
 */
export const resolveMainCaseLeadOfficer = (
    mainCaseId?: string
): Pick<CaseItem, 'mainCaseLeadOfficer' | 'mainCaseLeadOfficerUserId'> => {
    const option = MAIN_CASE_OPTIONS.find((opt) => opt.id === mainCaseId)
    if (!option) return { mainCaseLeadOfficer: undefined, mainCaseLeadOfficerUserId: undefined }
    return {
        mainCaseLeadOfficer: option.leadOfficer,
        mainCaseLeadOfficerUserId: ECMIS_USER_DIRECTORY.find((u) => u.name === option.leadOfficer)?.id,
    }
}

export const RETURN_ISSUE_CATALOG: Record<'supervisor' | 'director' | 'deputy_secretary' | 'secretary', ReturnIssue[]> = {
    supervisor: [
        { value: 'risk_incomplete', target: 'officer', label: 'การประเมินความเสี่ยงและมาตรการไม่ครบถ้วน' },
        { value: 'evidence_missing', target: 'officer', label: 'หลักฐานภัยคุกคามหรือเอกสารพยานไม่สมบูรณ์' },
        { value: 'main_case_mismatch', target: 'officer', label: 'ข้อมูลเชื่อมโยงคดีหลักไม่ตรงกับสำนวน' },
        { value: 'signature_missing', target: 'officer', label: 'ลายมือชื่อผู้ให้ถ้อยคำหรือเจ้าหน้าที่ไม่ครบ' },
    ],
    /** WIT0510 — ข้อสั่งการของ ผอ. ส่งกลับ "ตรง" ถึงเจ้าหน้าที่ผู้รับผิดชอบทุกประเด็น ไม่ย้อนผ่าน ผบช.ชั้นต้น */
    director: [
        { value: 'supervisor_opinion_unclear', target: 'officer', label: 'ความเห็นผู้บังคับบัญชาชั้นต้นไม่ชัดเจน' },
        { value: 'protection_budget_unclear', target: 'officer', label: 'งบประมาณหรือกำลังพลชุดคุ้มครองไม่สมเหตุสมผล' },
        { value: 'fact_discrepancy', target: 'officer', label: 'ข้อเท็จจริงใน คบ.3 และ คบ.6 ขัดแย้งกัน' },
        { value: 'urgent_condition_unmet', target: 'officer', label: 'ไม่เข้าข่ายกรณีจำเป็นเร่งด่วนตามระเบียบ' },
    ],
    /** WIT0513 — ประเด็นที่รองเลขาธิการฯ พบระหว่างกลั่นกรองก่อนเสนอเลขาธิการฯ */
    deputy_secretary: [
        { value: 'director_opinion_unclear', target: 'director', label: 'ความเห็นและการลงนาม คบ.6 ของ ผอ.สำนัก/กอง ไม่ชัดเจน' },
        { value: 'kb6_attachment_incomplete', target: 'officer', label: 'ชุดเสนอ คบ.1 / คบ.3 / คบ.6 และหลักฐานประกอบไม่ครบถ้วน' },
        { value: 'legal_basis_unclear', target: 'officer', label: 'ฐานอำนาจและเหตุแห่งภัยยังอธิบายไม่ครบตามระเบียบ' },
        { value: 'protection_method_unclear', target: 'officer', label: 'วิธีคุ้มครองที่เสนอยังไม่สอดคล้องกับระดับภัย' },
    ],
    secretary: [
        { value: 'legal_basis_missing', target: 'director', label: 'ฐานอำนาจและระเบียบข้อกฎหมายไม่ครบถ้วน' },
        { value: 'inter_agency_coordination', target: 'director', label: 'ยังไม่ได้ประสานหน่วยงานคุ้มครองภายนอก (ตร./DSI)' },
        { value: 'committee_submission_required', target: 'director', label: 'กรณีเกินกรอบอำนาจ ต้องเสนอคณะกรรมการ ป.ป.ท.' },
    ],
}

/**
 * WIT0607 — ประเด็นตีกลับของเส้นทางเร่งด่วน แยกชุดจาก RETURN_ISSUE_CATALOG เพราะเป็นเอกสารคนละชุด
 * (คบ.4 / ร่าง คบ.5 ไม่ใช่ คบ.1 / คบ.3 / คบ.6) และตีกลับตรงถึงเจ้าหน้าที่โดยไม่ผ่าน ผบช.ชั้นต้น
 */
export const FAST_TRACK_RETURN_ISSUES: ReturnIssue[] = [
    { value: 'kb4_facts_incomplete', target: 'officer', label: 'พฤติการณ์และเหตุเร่งด่วนใน คบ.4 ยังไม่ครบถ้วน' },
    { value: 'kb4_methods_unclear', target: 'officer', label: 'วิธีคุ้มครองที่เลือกยังไม่สอดคล้องกับระดับภัย' },
    { value: 'kb5_draft_incomplete', target: 'officer', label: 'ร่างคำสั่ง คบ.5 ยังไม่ครบ (ชุดเจ้าพนักงาน / ช่วงเวลา)' },
    { value: 'evidence_missing', target: 'officer', label: 'หลักฐานภัยคุกคามประกอบเรื่องเร่งด่วนไม่เพียงพอ' },
]

/**
 * ขั้นตอนที่ 5 — รอบแจ้งผลอนุมัติ ใช้ คบ.9 (แจ้งพยาน) และ คบ.11 (ข้อตกลง) เท่านั้น
 * คบ.8 ไม่อยู่ในรอบนี้ — เป็นคำสั่งของขั้น 08A-1 ที่จัดทำหลังพยานลงนาม คบ.11 และเลือกวิธีที่ 1
 */
export const APPROVAL_STEP_LABELS = [
    'รับผลอนุมัติจากเลขาธิการ ป.ป.ท.',
    'จัดทำ คบ.9 / คบ.11 ครบ 2 ฉบับ',
    'เสนอเลขาธิการ ป.ป.ท. ลงนาม คบ.9',
    'นำส่งหนังสือและลงนามข้อตกลง คบ.11 กับพยาน',
    'เปิดเส้นทางปฏิบัติตามวิธีที่อนุมัติ (วิธีที่ 1 จัดทำ คบ.8) · เริ่มนับระยะเวลาคุ้มครอง',
]

/** ขั้นตอน (stage) ทั้งหมดของ state machine ตาม flow.md ทั้ง 7 ขั้น */
export const STAGE_LABELS: Record<string, string> = {
    receiver_intake: 'ธุรการรับเรื่องเข้าทะเบียน',
    officer_intake: 'เจ้าหน้าที่ ป.ป.ท. รับเรื่องและเชื่อมโยงคดีหลัก',
    director_assign: 'ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน',
    staff_review: 'เจ้าหน้าที่เจ้าของสำนวนดำเนินการ',
    supervisor_review: 'ผู้บังคับบัญชาชั้นต้นกลั่นกรอง',
    director_review: 'ผอ.สำนัก/กอง พิจารณาและลงนาม คบ.6',
    director_outgoing_registry: 'ธุรการสำนัก/กอง ออกเลขทะเบียนส่ง',
    secretary_incoming_registry: 'ธุรการสำนักงานเลขาธิการ ลงเลขทะเบียนรับ',
    deputy_review: 'รองเลขาธิการ ป.ป.ท. กลั่นกรองก่อนเสนอเลขาธิการฯ',
    external_pending: 'เลขาธิการ ป.ป.ท. พิจารณาสั่งการ',
    notice: 'จัดทำและนำส่งหนังสือแจ้งผล',
    protection: 'อยู่ระหว่างการคุ้มครองพยาน',
    appeal: 'อยู่ระหว่างพิจารณาอุทธรณ์',
    method_operation: 'ปฏิบัติการตามวิธีที่ได้รับอนุมัติ',
    article14: 'ส่งต่อหน่วยงานอื่นช่วยคุ้มครองพยาน',
    termination_review: 'จัดทำเรื่องยุติ (คบ.15) และเสนอตามลำดับชั้น',
    termination_order: 'รอคำสั่งยุติ (คบ.16) และแจ้งผล (คบ.17)',
    terminated: 'ยุติการคุ้มครองแล้ว',
    transferred: 'ส่งต่อหน่วยงานภายนอกแล้ว',
    withdrawn: 'พยานถอนตัวจากการคุ้มครอง',
}

/** ระยะเวลาคุ้มครองตามกรอบอำนาจ ป.ป.ท. — ครั้งละไม่เกิน 60 วัน (เริ่มแรกมักอนุมัติ 30 วัน) */
export const PROTECTION_MAX_DAYS = 60
export const PROTECTION_DEFAULT_DAYS = 30
/**
 * เพดานรวมของทั้ง Episode — TEMPORARY + MAIN นับสะสมต่อเนื่องได้ไม่เกิน 6 เดือน/180 วัน
 * ครบเพดานแล้วห้ามจัดทำ คบ.14 เพิ่ม (WIT1150) หากยังมีภัยให้ไปเส้นทางข้อ 14 (WIT1149)
 */
export const PROTECTION_TOTAL_CAP_DAYS = 180
/** ระยะเวลายื่นอุทธรณ์ นับแต่วันที่พยานได้รับหนังสือ คบ.10 หรือ คบ.17 */
export const APPEAL_WINDOW_DAYS = 30

/** ระดับความเสี่ยงที่เลือกได้ตอนประเมิน — เรียงจากน้อยไปมาก (WIT1009 บันทึกผลประเมินรายรอบ) */
export const RISK_LEVELS: CaseItem['risk'][] = ['ต่ำ', 'ปานกลาง', 'สูง', 'วิกฤต']

export const PROTECTION_DURATION_OPTIONS = [15, 30, 45, 60]

/**
 * รูปแบบการคุ้มครองพยานตามระเบียบฯ ข้อ 15 — ใช้ร่วมกันระหว่างหน้าแก้ไขและกระดาษ A4
 * ข้อ 5 ปรากฏเฉพาะใน คบ.4 (คบ.6 มีเพียงข้อ 1–4)
 */
export const PROTECTION_METHOD_OPTIONS = [
    { n: 1, label: 'จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย (ชื่อ สกุล) ผู้รับการคุ้มครอง' },
    { n: 2, label: 'จัดให้พยานอยู่ในสถานที่เหมาะสม' },
    { n: 3, label: 'ปกปิด และรักษาความลับเกี่ยวกับชื่อตัว สกุล ที่อยู่ ภาพ หรือข้อมูลอย่างอื่นที่สามารถระบุตัวพยาน' },
    { n: 4, label: 'ประสานงานกับหน่วยงานอื่นให้การคุ้มครองพยาน' },
    { n: 5, label: 'ดำเนินการอื่นใด เช่น จัดให้มีการติดต่อสอบถามความเป็นอยู่หรือตรวจสถานที่อยู่อย่างสม่ำเสมอ' },
] as const

/** ชื่อฟิลด์ใน draft ของ คบ.6 ที่เก็บรูปแบบการคุ้มครองที่เลือกไว้ใน 8.2 */
export const KB6_PROTECTION_METHOD_FIELD = 'รูปแบบคุ้มครองที่เลือก'

/** FB-012 — ชื่อฟิลด์ใน draft ของ คบ.6 ที่เก็บข้อความอิสระของข้อ ๓ รูปแบบวิธีและระยะเวลาการดำเนินการคุ้มครอง */
export const KB6_DURATION_DETAIL_FIELD = 'รายละเอียดรูปแบบวิธีและระยะเวลา'

/**
 * WIT0603 — ชื่อฟิลด์ใน draft ของ คบ.4 ที่เก็บวิธีคุ้มครองตามข้อ 15 ที่เลือกไว้ในข้อ 4.2
 * แยก key จาก คบ.6 เพราะเป็นคนละฉบับและคนละเส้นทาง (เร่งด่วน vs ปกติ) แต่ใช้ตัวเลือกชุดเดียวกัน
 */
export const KB4_PROTECTION_METHOD_FIELD = 'วิธีคุ้มครองที่เลือก'

/** วิธีที่เดินเป็นเส้นทางปฏิบัติ 08A-1/08A-2/08A-3/08B ได้จริงคือ 1–4 (ข้อ 5 เป็นมาตรการเสริมใน คบ.4) */
export const ROUTABLE_PROTECTION_METHODS = [1, 2, 3, 4]

/**
 * วิธีคุ้มครองที่เจ้าหน้าที่ติ๊กไว้ในข้อ 8.2 ของ คบ.6 — คัดเฉพาะวิธีที่เปิดเป็นเส้นทางปฏิบัติได้
 * ใช้ตอนพยานลงนาม คบ.11 เพื่อเปิดเส้นทาง 08A-x/08B ให้ตรงกับที่เสนอไว้ในบันทึกข้อความ
 */
export const readRoutableProtectionMethods = (
    draft: Record<string, any>,
    field: string = KB6_PROTECTION_METHOD_FIELD
): number[] => {
    const raw = draft[field]
    if (!Array.isArray(raw)) return []
    return ROUTABLE_PROTECTION_METHODS.filter((n) => raw.includes(n))
}

/**
 * คบ.5 (เคสเร่งด่วนในตัว) ต้องมอบหมายชุดเจ้าพนักงานก็ต่อเมื่อ คบ.4 เลือกวิธีที่ 1
 * วิธีอื่น (2–4) หรือยังไม่เลือกวิธี → ไม่ต้องกรอกชุด และเอกสาร คบ.5 ตัดรายชื่อชุดออก
 */
export const kb5RequiresOfficerTeam = (kb4Draft: Record<string, any>): boolean =>
    readRoutableProtectionMethods(kb4Draft, KB4_PROTECTION_METHOD_FIELD).includes(1)

/** ชื่อฟิลด์ใน draft ของ คบ.6 ที่เก็บรายการกฎหมาย กฎ ระเบียบ ในข้อ 7 */
export const KB6_LEGAL_REFS_FIELD = 'กฎหมายที่เกี่ยวข้อง'

/**
 * FB-013 — ชื่อฟิลด์ใน draft ของ คบ.6 ที่เก็บข้อพิจารณาข้อ 8 ซึ่งเจ้าหน้าที่พิมพ์เอง
 * (เห็นควรคุ้มครองหรือไม่คุ้มครอง พร้อมเหตุผล) ว่าง = เว้นเส้นประให้เขียนด้วยลายมือ
 */
export const KB6_RATIONALE_FIELD = 'ข้อพิจารณา'

/** จำนวนเส้นประที่ใช้แทนข้อความข้อพิจารณา — เท่ากับความสูงของข้อความเดิม เพื่อไม่ให้ 8.1 ขยับ */
export const KB6_RATIONALE_BLANK_ROWS = 11

/** FB-015 — รายละเอียดที่เจ้าหน้าที่กรอกเองใต้รูปแบบข้อ 2 (สถานที่ที่จัดให้พยานอยู่) และข้อ 3 (ข้อมูลที่ปกปิด/วิธีรักษาความลับ) ของ คบ.6 */
export const KB6_METHOD2_DETAIL_FIELD = 'รายละเอียดรูปแบบข้อ2'
export const KB6_METHOD3_DETAIL_FIELD = 'รายละเอียดรูปแบบข้อ3'

/**
 * FB-014 — ชื่อรูปแบบที่ คบ.4 และ คบ.6 ใช้แทน PROTECTION_METHOD_OPTIONS (หน้าอื่นคงชื่อเดิม)
 * ข้อ 4 คือ "ประสานงานหน่วยงานอื่น" ซึ่งมีตัวเลือกย่อยตาม KB6_METHOD_SUBITEMS
 */
export const KB6_METHOD_LABELS: Record<number, string> = {
    4: 'ประสานงานหน่วยงานอื่น',
}

/**
 * ตัวเลือกย่อยใต้รูปแบบการคุ้มครองของ คบ.4/คบ.6 — แสดงเป็น 4.1, 4.2, … และเลือกได้ข้อเดียว
 * ข้อ 4 คือหน่วยงานที่ส่งต่อ (แทนปุ่ม "เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ" ที่เคยอยู่ในคำสั่งชี้ขาดของเลขาธิการ)
 */
export const KB6_METHOD_SUBITEMS: Record<number, string[]> = {
    4: ['ส่งให้ตำรวจ', 'ส่งให้ทหาร', 'ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ'],
}

/** ฟิลด์ใน draft ที่เก็บตัวเลือกย่อยที่เลือกไว้ (ข้อความตาม KB6_METHOD_SUBITEMS) แยกตามเลขข้อ — ใช้ชื่อเดียวกันทั้ง คบ.4 และ คบ.6 */
export const KB6_METHOD_SUBITEM_FIELDS: Record<number, string> = {
    4: 'หน่วยงานรูปแบบข้อ4',
}

/** ตัวเลือกย่อยที่เลือกไว้ใน draft ทุกข้อ — ใช้ส่งให้ ProtectionMethodChecks และกระดาษ */
export const readMethodSubitems = (draft: Record<string, any>): Record<number, string> =>
    Object.fromEntries(
        Object.entries(KB6_METHOD_SUBITEM_FIELDS).map(([n, field]) => [Number(n), String(draft[field] ?? '')])
    )

/** ข้อที่เลือกไว้แต่ยังไม่ได้เลือกตัวเลือกย่อย (เช่น ข้อ 4 ยังไม่เลือก 4.1–4.4) — undefined เมื่อครบ */
export const missingMethodSubitem = (
    selected: number[],
    subitemSelected: Record<number, string> = {}
): number | undefined =>
    selected.find((n) => KB6_METHOD_SUBITEMS[n]?.length && !subitemSelected[n]?.trim())

/**
 * รูปแบบการคุ้มครองใน คบ.4/คบ.6 ต้องเลือกให้ครบก่อนส่งต่อ — คืนเหตุผลที่ยังส่งไม่ได้ หรือ undefined เมื่อครบ
 * ครบ = เลือกอย่างน้อยหนึ่งข้อ และข้อที่มีตัวเลือกย่อยต้องเลือกตัวเลือกย่อยแล้ว
 */
export const protectionMethodSelectionIssue = (
    selected: number[],
    subitemSelected: Record<number, string> = {}
): string | undefined => {
    if (selected.length === 0) return 'ยังไม่ได้เลือกรูปแบบการคุ้มครอง'
    const n = missingMethodSubitem(selected, subitemSelected)
    if (n !== undefined)
        return `เลือกข้อ ${n} แล้วแต่ยังไม่ได้เลือกตัวเลือกย่อย (${n}.1–${n}.${KB6_METHOD_SUBITEMS[n].length})`
    return undefined
}

/**
 * ข้อ 7 กฎหมาย กฎ ระเบียบที่เกี่ยวข้อง — ค่าตั้งต้นตามต้นฉบับ คบ.6
 * แก้ไข เพิ่ม หรือลบได้ทั้งหมดเมื่อกฎหมายเปลี่ยน (ลบจนหมดได้ เหลือเพียงหัวข้อ 7)
 */
export const KB6_DEFAULT_LEGAL_REFS = [
    'พระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2551 และที่แก้ไขเพิ่มเติม',
    'ระเบียบคณะกรรมการ ป.ป.ท. ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2554',
    'ระเบียบสำนักนายกรัฐมนตรีว่าด้วยค่าใช้จ่ายและวิธีการเบิกจ่ายตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2565 และที่แก้ไขเพิ่มเติม',
]

/**
 * รายการกฎหมายที่ใช้จริง — `undefined` แปลว่ายังไม่เคยแก้ (รวมถึง draft เก่าที่บันทึกไว้ก่อนมีฟีเจอร์นี้)
 * จึงคืนค่าตั้งต้น ส่วน `[]` แปลว่าผู้ใช้ลบออกหมดเอง ต้องคงความว่างไว้
 */
export const readLegalRefs = (draft: Record<string, any>): string[] =>
    Array.isArray(draft[KB6_LEGAL_REFS_FIELD]) ? draft[KB6_LEGAL_REFS_FIELD] : KB6_DEFAULT_LEGAL_REFS

/** ข้อ 1–3 เลือกพร้อมกันทั้งกลุ่ม */
export const KB6_METHOD_GROUP = [1, 2, 3]

/** ข้อ 4 เลือกเดี่ยว และตัดข้อ 8.1 (คำสั่งมอบหมายชุดเจ้าพนักงาน) ออกจากเอกสาร */
export const KB6_METHOD_EXTERNAL = 4

/**
 * สลับการเลือกวิธีคุ้มครองตามข้อ 15 — ข้อ 1–3 เลือกร่วมกันได้ ส่วนข้อ 4 ต้องเลือกเดี่ยว
 * เลือกข้อ 4 จะล้างข้อ 1–3 ออกให้ และเลือกข้อ 1–3 จะล้างข้อ 4 ออกให้ (ข้อ 5 ใน คบ.4 เป็นมาตรการเสริม ไม่ถูกล้าง)
 */
export const toggleProtectionMethod = <T extends number>(selected: readonly T[], n: T): T[] => {
    if (selected.includes(n)) return selected.filter((x) => x !== n)
    const conflicts = (x: number) =>
        n === KB6_METHOD_EXTERNAL ? KB6_METHOD_GROUP.includes(x) : KB6_METHOD_GROUP.includes(n) && x === KB6_METHOD_EXTERNAL
    return [...selected.filter((x) => !conflicts(x)), n].sort((a, b) => a - b)
}

/** ข้อความแจ้งเมื่อ toggleProtectionMethod ล้างวิธีที่เลือกร่วมกันไม่ได้ออกให้ — ไม่มีการล้างคืน null */
export const protectionMethodSwitchNotice = (selected: readonly number[], n: number): string | null => {
    if (selected.includes(n)) return null
    if (n === KB6_METHOD_EXTERNAL && selected.some((x) => KB6_METHOD_GROUP.includes(x)))
        return 'วิธีที่ 4 ต้องเลือกเดี่ยว — นำวิธีที่ 1–3 ออกให้แล้ว'
    if (KB6_METHOD_GROUP.includes(n) && selected.includes(KB6_METHOD_EXTERNAL))
        return 'วิธีที่ 1–3 เลือกร่วมกับวิธีที่ 4 ไม่ได้ — นำวิธีที่ 4 ออกให้แล้ว'
    return null
}

/**
 * หน่วยงานที่ประสานให้ช่วยคุ้มครองตามข้อ 15(4) — วิธีที่ 4 และเอกสารส่งมอบ คบ.12
 *
 * ไม่รวมกรมคุ้มครองสิทธิและเสรีภาพโดยเจตนา: การส่งกรมคุ้มครองสิทธิฯ เป็นเส้นทางตามข้อ 14
 * ซึ่งต้องผ่านมติคณะกรรมการ ป.ป.ท. และ "ไม่ถือเป็นวิธีที่ 4 ตามข้อ 15(4)" (flow note08c01)
 * ดู ARTICLE14_TARGET_AGENCY และหน้า /article14
 */
export const EXTERNAL_TRANSFER_AGENCIES = [
    'สำนักงานคุ้มครองพยาน กรมสอบสวนคดีพิเศษ (DSI)',
    'กองบังคับการปราบปราม สำนักงานตำรวจแห่งชาติ',
    'ตำรวจภูธรจังหวัดในพื้นที่',
]

/** ปลายทางของเส้นทางข้อ 14 — คนละเส้นทางกับวิธีที่ 4 */
export const ARTICLE14_TARGET_AGENCY = 'สำนักงานคุ้มครองพยาน กรมคุ้มครองสิทธิและเสรีภาพ กระทรวงยุติธรรม'

/** ตัวเลือกหน่วยงานปลายทางของวิธีที่ 4 ตอนเปิดงาน — ตำรวจเลือกสถานีจากทะเบียน หน่วยงานอื่นกรอกชื่อหน่วยงาน */
export const COORDINATION_AGENCY_TYPES: { value: CoordinationAgencyType; label: string; agency: string; recipient: string }[] = [
    { value: 'police', label: 'ส่งให้ตำรวจ', agency: '', recipient: '' },
    { value: 'military', label: 'ส่งให้ทหาร', agency: 'กองบัญชาการกองทัพไทย', recipient: 'ผู้บัญชาการทหารสูงสุด' },
    { value: 'rlpd', label: 'ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ', agency: ARTICLE14_TARGET_AGENCY, recipient: 'อธิบดีกรมคุ้มครองสิทธิและเสรีภาพ' },
]

/**
 * หน่วยงานปลายทางของเส้นทางส่งต่อตามข้อ 14 — ใช้ตัวเลือกชุดเดียวกับข้อ 4 ของ คบ.4/คบ.6 (KB6_METHOD_SUBITEMS)
 * short ใช้ในข้อความสั้นบนหน้าจอ · name ใช้ในหนังสือ · office ใช้เป็นหน่วยงานผู้รับช่วงคุ้มครอง · recipient คือผู้รับหนังสือแบบ 18
 */
export const ARTICLE14_AGENCIES: Record<CoordinationAgencyType, { label: string; short: string; name: string; office: string; recipient: string }> = {
    dopa: { label: 'ส่งให้กรมการปกครอง', short: 'กรมการปกครอง', name: 'กรมการปกครอง', office: 'กรมการปกครอง กระทรวงมหาดไทย', recipient: 'อธิบดีกรมการปกครอง' },
    police: { label: 'ส่งให้ตำรวจ', short: 'สำนักงานตำรวจแห่งชาติ', name: 'สำนักงานตำรวจแห่งชาติ', office: 'สำนักงานตำรวจแห่งชาติ', recipient: 'ผู้บัญชาการตำรวจแห่งชาติ' },
    military: { label: 'ส่งให้ทหาร', short: 'กองบัญชาการกองทัพไทย', name: 'กองบัญชาการกองทัพไทย', office: 'กองบัญชาการกองทัพไทย', recipient: 'ผู้บัญชาการทหารสูงสุด' },
    rlpd: { label: 'ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ', short: 'กรมคุ้มครองสิทธิฯ', name: 'กรมคุ้มครองสิทธิและเสรีภาพ', office: ARTICLE14_TARGET_AGENCY, recipient: 'อธิบดีกรมคุ้มครองสิทธิและเสรีภาพ' },
}

/** ค่าตั้งต้นของหน่วยงานปลายทางข้อ 14 — แฟ้มเดิมที่ไม่มี targetAgencyType ถือว่าส่งกรมคุ้มครองสิทธิฯ */
export const DEFAULT_ARTICLE14_AGENCY: CoordinationAgencyType = 'rlpd'

/** ลำดับตัวเลือกในป็อปอัป/ฟอร์มเสนอ — เรียงตาม 4.1–4.4 ของ คบ.4/คบ.6 */
export const ARTICLE14_AGENCY_ORDER: CoordinationAgencyType[] = ['dopa', 'police', 'military', 'rlpd']

export const isArticle14AgencyType = (value: unknown): value is CoordinationAgencyType =>
    typeof value === 'string' && value in ARTICLE14_AGENCIES

/** หน่วยงานปลายทางข้อ 14 ของแฟ้ม (ยังไม่เปิดเรื่อง/ข้อมูลเดิม = กรมคุ้มครองสิทธิฯ) */
export const article14Agency = (caseItem?: { article14?: { targetAgencyType?: CoordinationAgencyType } }) =>
    ARTICLE14_AGENCIES[caseItem?.article14?.targetAgencyType || DEFAULT_ARTICLE14_AGENCY]

/** ตัวเลือกย่อยข้อ 4 ที่เลือกไว้ใน คบ.4/คบ.6 (ข้อความตาม KB6_METHOD_SUBITEMS) → หน่วยงานปลายทางของวิธีที่ 4 ตอนเปิดงาน */
export const coordinationAgencyFromSubitem = (subitem?: string): CoordinationAgencyType | undefined =>
    COORDINATION_AGENCY_TYPES.find((t) => t.label === subitem?.trim())?.value

/** ชื่อวิธีในหน้าเลือกแนวทางตอนเปิดงาน (ข้อ 4 ใช้ถ้อยคำ "ดำเนินการอื่น" ตาม คบ.6) */
export const METHOD_CHOICE_LABELS: Record<number, string> = {
    1: 'จัดเจ้าพนักงานเป็นชุดคุ้มครอง',
    2: 'จัดให้พยานอยู่ในสถานที่เหมาะสม',
    3: 'ปกปิดและรักษาความลับ',
    4: 'ดำเนินการอื่นเพื่อให้พยานได้รับความช่วยเหลือหรือได้รับการคุ้มครองตามที่เห็นสมควร',
}

/** ชื่อขั้นของเส้นทางส่งต่อกรมคุ้มครองสิทธิฯ (ใช้ทั้งหน้า /article14 และหมุดในแฟ้ม) */
export const ARTICLE14_STEP_LABELS: Record<Article14Step, string> = {
    proposal_draft: 'จัดทำ/แก้ไขข้อเสนอ',
    supervisor_review: 'ผู้บังคับบัญชาชั้นต้นพิจารณา',
    director_review: 'ผอ.สำนัก/กอง พิจารณา',
    deputy_review: 'รองเลขาธิการพิจารณา',
    secretary_review: 'เลขาธิการพิจารณา',
    committee_pending: 'รอมติคณะกรรมการ ป.ป.ท.',
    committee_rejected: 'คณะกรรมการไม่เห็นชอบ',
    letter_sent: 'บันทึกการนำส่ง/การได้รับหนังสือกับหน่วยงานปลายทาง',
    /** WIT0860 แขนง — กรมแจ้งว่าดำเนินการไม่ได้ ต้องเสนอผู้มีอำนาจทันทีไม่ให้คุ้มครองขาดช่วง */
    delivery_failed: 'หน่วยงานปลายทางแจ้งว่าดำเนินการไม่ได้ · เสนอ ผอ.สำนัก/กอง',
    response_received: 'ได้รับผลประสานแล้ว',
    handover_ready: 'เตรียมส่งมอบ',
    handover_done: 'ส่งมอบและเริ่มมาตรการแล้ว',
}

/**
 * ลำดับชั้นพิจารณาเรื่องส่งต่อกรมคุ้มครองสิทธิฯ (ทั้งเสนอครั้งแรกและ Revision)
 * ผบช.ชั้นต้น → ผอ.สำนัก/กอง → รองเลขาธิการ → เลขาธิการ แล้วส่งคืนเจ้าหน้าที่บันทึกการนำส่ง/การได้รับหนังสือ
 */
export const ARTICLE14_REVIEW_CHAIN: Array<{
    level: Article14ReviewLevel
    step: Article14Step
    label: string
    roles: string[]
}> = [
        { level: 'supervisor', step: 'supervisor_review', label: 'ผู้บังคับบัญชาชั้นต้น', roles: ['supervisor', 'admin'] },
        { level: 'director', step: 'director_review', label: 'ผอ.สำนัก/กอง', roles: ['director', 'got_director', 'admin'] },
        { level: 'deputy_secretary', step: 'deputy_review', label: 'รองเลขาธิการ', roles: ['deputy_secretary', 'admin'] },
        { level: 'secretary', step: 'secretary_review', label: 'เลขาธิการ', roles: ['secretary', 'admin'] },
    ]

/** ช่องทางส่งหนังสือราชการผ่านระบบสารบรรณเดิม (WIT0843) */
export const OFFICIAL_LETTER_CHANNELS = [
    { value: 'direct', label: 'นำส่งโดยตรง' },
    { value: 'post', label: 'ไปรษณีย์' },
    { value: 'official_other', label: 'ช่องทางราชการอื่น' },
] as const

/** ตัวระบุที่มักต้องปกปิดตามวิธีที่ 3 (WIT0831) */
export const MASKABLE_IDENTIFIERS = [
    'ชื่อตัว - ชื่อสกุล',
    'เลขประจำตัวประชาชน',
    'ที่อยู่ / ที่พักปัจจุบัน',
    'หมายเลขโทรศัพท์',
    'ภาพถ่าย / ภาพจากกล้อง',
    'สถานที่ทำงาน',
    'ข้อมูลยานพาหนะ',
]

/** เหตุผลที่เชื่อมโยงเลขสำนวนหลักไม่ได้ — บังคับเลือกก่อนตั้งสถานะ "ไม่พบคดี" (WIT0213/WIT0215) */
export const MAIN_CASE_NOT_FOUND_REASONS = [
    'ยังไม่ได้เปิดสำนวนคดีหลักในกิจกรรมที่ 4 / 5',
    'อยู่ระหว่างตรวจสอบข้อเท็จจริงเบื้องต้น ยังไม่ออกเลขสำนวน',
    'เรื่องไม่อยู่ในอำนาจหน้าที่ของ ป.ป.ท. แต่รับไว้เพื่อส่งต่อ',
    'ผู้ร้องให้ข้อมูลเลขสำนวน/ชื่อคดีไม่ครบถ้วน ต้องติดตามเพิ่มเติม',
    'ค้นแล้วไม่พบสำนวนที่ตรงกันในระบบ E-CMIS',
]

/** เหตุผลการยุติการคุ้มครอง (คบ.7) */
export const TERMINATION_REASONS = [
    'พยานมีความปลอดภัยอย่างสมบูรณ์ ภัยคุกคามหมดไป',
    'ครบกำหนดระยะเวลาคุ้มครองตามคำสั่ง และเหตุแห่งภัยดับลง',
    'เลขาธิการ ป.ป.ท. ไม่อนุมัติขยายระยะเวลาคุ้มครอง',
    'พยานไม่ปฏิบัติตามข้อตกลงและเงื่อนไขการคุ้มครอง (คบ.11)',
    'พยานไม่ยินยอมรับการคุ้มครองตามวิธีที่ได้รับอนุมัติ',
    'พยานได้รับความคุ้มครองตามกฎหมายว่าด้วยการคุ้มครองพยานในคดีอาญา',
]

/** ข้อ 18 — noticeAppeal กำกับข้อความใน คบ.17 เท่านั้น ไม่ใช้ปิดรับคำอุทธรณ์ */
export const TERMINATION_CLAUSES = [
    { value: 1, label: 'ข้อ 18 (1) พยานยื่นคำร้องเป็นลายลักษณ์อักษรขอให้ยุติการคุ้มครอง', noticeAppeal: false },
    { value: 2, label: 'ข้อ 18 (2) ครบกำหนดระยะเวลาคุ้มครอง', noticeAppeal: false },
    { value: 3, label: 'ข้อ 18 (3) พยานได้รับความคุ้มครองตามกฎหมายว่าด้วยการคุ้มครองพยานในคดีอาญา', noticeAppeal: false },
    { value: 4, label: 'ข้อ 18 (4) เลขาธิการสั่งให้ยุติการคุ้มครองตามข้อ 19', noticeAppeal: true },
] as const

/** แหล่งที่มาของเหตุยุติ (WIT1125-1128) */
export const TERMINATION_TRIGGERS = [
    { value: 'witness_kb7', label: 'พยานยื่น คบ.7 ต่อเจ้าหน้าที่ หรือกรอกคำขอยุติในระบบ' },
    { value: 'external_letter', label: 'หนังสือขอยุติจากภายนอก (รับผ่านสารบรรณและอัปโหลดเข้าแฟ้มเดิม)' },
    { value: 'due_or_officer', label: 'เจ้าหน้าที่ตรวจพบหรือเสนอเรื่อง' },
] as const

/** แนวทางที่เลือกได้หลังทบทวนผล (WIT1107-1111 / WIT1149) */
export const REVIEW_OUTCOMES = [
    { value: 'continue', label: 'คุ้มครองต่อภายใต้คำสั่งเดิม', hint: 'กลับหน้าติดตามเพื่อกำหนดรอบ คบ.13 ถัดไป' },
    { value: 'extend', label: 'ขยายระยะเวลา (คบ.14)', hint: 'ทำได้เมื่อยังไม่ถึงเพดานรวม 180 วัน' },
    { value: 'change_method', label: 'เปลี่ยนวิธี / เงื่อนไข', hint: 'เสนออนุมัติและปรับ คบ.11 — เปลี่ยนเป็นวิธีที่ 1 จึงจัดทำ/แก้ คบ.8' },
    { value: 'terminate', label: 'เข้าสู่กระบวนการยุติ', hint: 'จัดทำ คบ.15 เสนอเลขาธิการ ป.ป.ท.ออกคำสั่ง คบ.16' },
    { value: 'article14', label: 'ครบเพดานแต่ยังมีภัย — ส่งต่อกรมคุ้มครองสิทธิฯ', hint: 'ห้ามขยาย คบ.14 ให้ส่งกรมคุ้มครองสิทธิและเสรีภาพ' },
] as const

/**
 * ขั้นตอนที่ 1 — ประเภทเอกสารตั้งต้นที่ผู้รับเรื่องบันทึกเข้าระบบ
 * ประเภทเอกสารเป็นตัวกำหนดเส้นทาง ส่วนช่องทางการยื่น (channel) ผูกมาโดยอัตโนมัติ
 *  - คำร้อง  → เอกสารคำร้องดิบที่พยานเขียน/ส่งมาเอง ยังไม่เข้าแบบฟอร์ม คบ. (channel: document)
 *  - คบ.1    → พยานมายื่นและลงนามในแบบคำร้องด้วยตนเอง (channel: walkin)
 *  - คบ.2    → รับแจ้งทางโทรศัพท์/สื่ออิเล็กทรอนิกส์ (channel: phone)
 * ทุกประเภทเข้าสู่ ผอ.สำนัก/กอง เพื่อมอบหมายเจ้าของสำนวนเสมอ
 */
export const INTAKE_DOC_TYPES = [
    {
        value: 'petition',
        form: 'คำร้อง',
        channel: 'document',
        label: 'คำร้อง (เอกสารคำร้องดิบ)',
        hint: 'หนังสือหรือคำร้องที่พยานเขียนเอง/ส่งมา ยังไม่เข้าแบบ คบ. — เจ้าของสำนวนจัดทำ คบ.1 ต่อหลัง ผอ. มอบหมาย',
        /** งานที่เหลือหลัง ผอ. มอบหมาย */
        followUp: ['คบ.1', 'คบ.3'],
    },
    {
        value: 'kb1',
        form: 'คบ.1',
        channel: 'walkin',
        label: 'คบ.1 — คำร้องขอคุ้มครองพยาน',
        hint: 'พยานเข้ามาติดต่อและลงลายมือชื่อในแบบ คบ.1 ด้วยตนเอง — หลัง ผอ. มอบหมาย ทำ คบ.3 ได้ทันที',
        followUp: ['คบ.3'],
    },
    {
        value: 'kb2',
        form: 'คบ.2',
        channel: 'phone',
        label: 'คบ.2 — บันทึกรับแจ้งทางโทรศัพท์',
        hint: 'รับแจ้งทางโทรศัพท์สายด่วน 1206 อีเมล หรือโทรสาร — เจ้าของสำนวนจัดทำ คบ.1 ต่อหลัง ผอ. มอบหมาย',
        followUp: ['คบ.1', 'คบ.3'],
    },
] as const

export type IntakeDocTypeValue = (typeof INTAKE_DOC_TYPES)[number]['value']

/**
 * ประเภทเอกสารที่แต่ละบทบาทมีสิทธิ์รับเข้าระบบ
 *  - ธุรการ (สำนัก/กอง และคดี กอท.) → คำร้อง เท่านั้น
 *  - เจ้าของสำนวน      → คำร้อง, คบ.1, คบ.2
 *  - เจ้าหน้าที่ ป.ป.ท. → คำร้อง, คบ.1, คบ.2
 */
export const INTAKE_DOC_TYPES_BY_ROLE: Record<string, IntakeDocTypeValue[]> = {
    receiver: ['petition'],
    got_receiver: ['petition'],
    got_officer: ['petition', 'kb1', 'kb2'],
    case_owner: ['petition', 'kb1', 'kb2'],
    officer: ['petition', 'kb1', 'kb2'],
    admin: ['petition', 'kb1', 'kb2'],
}

/** ช่องทางการยื่นคำร้อง — ผูกกับประเภทเอกสารโดยอัตโนมัติ ใช้แสดงผลเท่านั้น */
export const INTAKE_CHANNELS = [
    { value: 'walkin', label: 'พยานเข้ามาติดต่อเอง (Walk-in)', hint: 'ยื่นและลงนามแบบ คบ.1 ด้วยตนเอง', form: 'คบ.1' },
    { value: 'document', label: 'พยานส่งเอกสารคำร้องมา', hint: 'รับคำร้องดิบเข้าทะเบียน', form: 'คำร้อง' },
    { value: 'phone', label: 'แจ้งทางโทรศัพท์ / สื่ออิเล็กทรอนิกส์', hint: 'ลงบันทึก คบ.2 ไว้ก่อน', form: 'คบ.2' },
] as const

/**
 * แหล่งที่มาของเรื่อง — เฉพาะขั้นรับเอกสารต้นทาง (คำร้องดิบ) ก่อนจะระบุว่าเป็น คบ.1 หรือ คบ.2
 * แต่ละแหล่งที่มามีช่องทางที่รับตั้งต้นให้ (defaultChannel) แต่เจ้าหน้าที่แก้ไขได้
 */
export const INTAKE_SOURCE_TYPES = [
    { value: 'in_person', label: 'มาพบเจ้าหน้าที่ด้วยตนเอง', defaultChannel: 'มาพบด้วยตนเอง' },
    { value: 'remote', label: 'โทรศัพท์/โทรสาร/อีเมล/ช่องทางสื่อสาร', defaultChannel: 'โทรศัพท์/โทรสาร/อีเมล' },
    { value: 'self_document', label: 'หนังสือหรือเอกสารที่พยานเขียนเอง', defaultChannel: 'เอกสารส่งมาเอง' },
    { value: 'field', label: 'เจ้าหน้าที่ออกรับเรื่องนอกสถานที่/ภาคสนาม', defaultChannel: 'ภาคสนาม' },
    { value: 'referred', label: 'หน่วยงานหรือเจ้าหน้าที่อื่นส่งต่อ', defaultChannel: 'หน่วยงานส่งต่อ' },
] as const

export type IntakeSourceTypeValue = (typeof INTAKE_SOURCE_TYPES)[number]['value']
