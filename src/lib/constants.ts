import { FormMeta } from '../types/forms'
import { OrgUnit, EcmisUser, UserRole, RoleAssignment } from '../types/user'
import { CaseItem, MainCaseOption, ReturnIssue } from '../types/case'

export const FORMS_CATALOG: FormMeta[] = [
    { n: 1, code: 'คบ.1', t: 'คำร้องขอให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น', d: 'สำหรับผู้ร้อง/พยานยื่นคำขอเพื่อเข้าสู่มาตรการคุ้มครองพยาน พร้อมลายมือชื่อยินยอมของบุคคลที่เกี่ยวข้องทุกคน', pages: 4 },
    { n: 2, code: 'คบ.2', t: 'คำร้องขอคุ้มครองพยานผ่านช่องทางการสื่อสาร', d: 'สำหรับเจ้าพนักงานบันทึกรายละเอียดกรณีเร่งด่วน เมื่อผู้ร้องขอไม่อาจมายื่นคำร้องขอด้วยตนเอง (พยานต้องมาลงนาม คบ.1 ภายหลัง)', pages: 1 },
    { n: 3, code: 'คบ.3', t: 'บันทึกข้อเท็จจริงประกอบการขอใช้มาตรการคุ้มครองเบื้องต้น', d: 'สำหรับเจ้าพนักงานบันทึกถ้อยคำและข้อเท็จจริงประกอบคำร้อง (ข้ามได้หากระบุครบใน คบ.1 แต่ต้องบันทึกเหตุผล)', pages: 2 },
    { n: 4, code: 'คบ.4', t: 'บันทึกข้อความขอคุ้มครองพยานชั่วคราว กรณีจำเป็นเร่งด่วน', d: 'สำหรับเจ้าพนักงานเสนอ ผอ.สำนัก/กอง/ศูนย์ พิจารณามาตรการชั่วคราวทันที (Fast Track)', pages: 3 },
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
    { n: 15, code: 'คบ.15', t: 'รายงานการให้ความคุ้มครองพยานสิ้นสุด', d: 'สรุปเหตุยุติ ผลการคุ้มครองและหลักฐานประกอบ เสนอตามลำดับชั้นก่อนผู้มีอำนาจออกคำสั่งยุติ (คบ.15 เพียงอย่างเดียวยังไม่ทำให้การคุ้มครองสิ้นสุด)', pages: 2 },
    { n: 16, code: 'คบ.16', t: 'คำสั่งยุติการให้ความคุ้มครองพยาน', d: 'คำสั่งของผู้มีอำนาจ ระบุเหตุยุติ วันที่ออกคำสั่ง และวันที่คำสั่งมีผล — สถานะยุติเกิดขึ้นเมื่อคำสั่งลงนามและถึงวันที่มีผลเท่านั้น', pages: 1 },
    { n: 17, code: 'คบ.17', t: 'หนังสือแจ้งคำสั่งยุติการคุ้มครองพยาน', d: 'แจ้งคำสั่งยุติพร้อมสิทธิอุทธรณ์ภายใน 30 วันนับแต่วันที่พยานได้รับหนังสือ ออกเลขและนำส่งผ่านระบบสารบรรณเดิม', pages: 1 },
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

export const ROLE_NAMES: Record<UserRole, string> = {
    got_receiver: 'ธุรการคดี กอท.',
    got_director: 'ผอ. กอท.',
    got_officer: 'ผู้รับผิดชอบคุ้มครอง กอท.',
    receiver: 'ธุรการสำนัก/กอง',
    officer: 'เจ้าหน้าที่ ป.ป.ท.',
    case_owner: 'เจ้าของสำนวน',
    supervisor: 'ผู้บังคับบัญชาชั้นต้น',
    director: 'ผอ.สำนัก/กอง',
    deputy_secretary: 'รองเลขาธิการ ป.ป.ท.',
    secretary: 'เลขาธิการ ป.ป.ท.',
    committee: 'ฝ่ายเลขานุการคณะกรรมการ ป.ป.ท.',
    protection: 'ชุดคุ้มครอง',
    appeal: 'นางสาววราภรณ์ นิติธรรม (เจ้าหน้าที่อุทธรณ์)',
    admin: 'Super Admin',
}

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
    receiver: { units: ['central-gmc', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    officer: { units: ['central-wp', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    case_owner: { units: ['central-wp', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    supervisor: { units: ['central-wp', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    director: { units: ['central-gmc', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    deputy_secretary: { units: ['central-gmc', 'central-wp'], central: true },
    secretary: { units: ['central-gmc', 'central-wp'], central: true },
    committee: { units: ['central-gmc'], central: true },
    protection: { units: ['central-wp', 'pacc-reg-1', 'pacc-reg-2', 'pacc-reg-3', 'pacc-reg-4', 'pacc-reg-5', 'pacc-reg-6', 'pacc-reg-7', 'pacc-reg-8', 'pacc-reg-9'] },
    appeal: { units: ['central-gmc', 'central-wp'], central: true },
    admin: { units: ORG_UNITS.map(u => u.id), central: true },
}

export const ECMIS_USER_DIRECTORY: EcmisUser[] = [
    { id: 'GOT-REC-001', name: 'นางสาวพิมพ์ชนก รับเรื่อง', position: 'เจ้าพนักงานธุรการคดี', unit: 'กองอำนวยการต่อต้านทุจริต (กอท.)', orgUnitId: 'central-gmc', roles: ['got_receiver'], active: true },
    { id: 'GOT-DIR-001', name: 'นายภาคิน อำนวยการ', position: 'ผู้อำนวยการ กอท.', unit: 'กองอำนวยการต่อต้านทุจริต (กอท.)', orgUnitId: 'central-gmc', roles: ['got_director'], active: true },
    { id: 'GOT-OFF-001', name: 'นางสาวณิชา คุ้มภัย', position: 'นักสืบสวนสอบสวนชำนาญการ', unit: 'กองอำนวยการต่อต้านทุจริต (กอท.)', orgUnitId: 'central-gmc', roles: ['got_officer', 'protection_owner'], active: true },
    { id: 'GOT-OFF-002', name: 'นายธันวา พิทักษ์พยาน', position: 'นักสืบสวนสอบสวนปฏิบัติการ', unit: 'กองอำนวยการต่อต้านทุจริต (กอท.)', orgUnitId: 'central-gmc', roles: ['got_officer', 'protection_owner'], active: true },
    { id: 'OFF-001', name: 'นางสาวอรุณี ใจมั่น', position: 'นักสืบสวนสอบสวนชำนาญการ', unit: 'กลุ่มงานคุ้มครองพยาน (ส่วนกลาง)', orgUnitId: 'central-wp', roles: ['officer', 'case_owner', 'protection_owner'], active: true },
    { id: 'OFF-002', name: 'นายธนาธิป สุวรรณเวช', position: 'นักสืบสวนสอบสวนชำนาญการ', unit: 'กลุ่มงานคุ้มครองพยาน (ส่วนกลาง)', orgUnitId: 'central-wp', roles: ['officer', 'case_owner', 'protection_owner'], active: true },
    { id: 'OFF-REG1', name: 'พ.ต.ต. ณัฐวุฒิ สรรพกิจ', position: 'นักสืบสวนสอบสวนปฏิบัติการ', unit: 'สำนักงาน ป.ป.ท. เขต 1', orgUnitId: 'pacc-reg-1', roles: ['officer', 'case_owner', 'protection_owner'], active: true },
    { id: 'SUP-001', name: 'นายกิตติศักดิ์ ธรรมรักษ์', position: 'หัวหน้ากลุ่มงานคุ้มครองพยาน', unit: 'กลุ่มงานคุ้มครองพยาน (ส่วนกลาง)', orgUnitId: 'central-wp', roles: ['supervisor'], active: true },
    { id: 'SUP-REG1', name: 'พ.ต.ท. เกรียงไกร มั่นคง', position: 'หัวหน้ากลุ่มงานสืบสวน เขต 1', unit: 'สำนักงาน ป.ป.ท. เขต 1', orgUnitId: 'pacc-reg-1', roles: ['supervisor'], active: true },
    { id: 'DIR-001', name: 'นายวีระยุทธ พิทักษ์ธรรม', position: 'ผู้อำนวยการกองบริหารคดี', unit: 'กองบริหารคดี (ส่วนกลาง)', orgUnitId: 'central-gmc', roles: ['director'], active: true },
    { id: 'DIR-REG1', name: 'พ.ต.อ. ธนดล ยุติธรรม', position: 'ผู้อำนวยการสำนักงาน ป.ป.ท. เขต 1', unit: 'สำนักงาน ป.ป.ท. เขต 1', orgUnitId: 'pacc-reg-1', roles: ['director'], active: true },
    { id: 'DSEC-001', name: 'นายพิพัฒน์ ศรีสุวรรณ', position: 'รองเลขาธิการคณะกรรมการ ป.ป.ท.', unit: 'สำนักงาน ป.ป.ท. (ส่วนกลาง)', orgUnitId: 'central-gmc', roles: ['deputy_secretary'], active: true },
    { id: 'CMT-001', name: 'นางสาวปิยะนุช เลขะกุล', position: 'ฝ่ายเลขานุการคณะกรรมการ ป.ป.ท.', unit: 'สำนักงานเลขานุการคณะกรรมการ ป.ป.ท.', orgUnitId: 'central-gmc', roles: ['committee'], active: true },
    { id: 'SEC-001', name: 'นายสุรศักดิ์ ธรรมพิทักษ์', position: 'เลขาธิการคณะกรรมการ ป.ป.ท.', unit: 'สำนักงาน ป.ป.ท. (ส่วนกลาง)', orgUnitId: 'central-gmc', roles: ['secretary'], active: true },
    { id: 'PROT-001', name: 'ร.ต.อ. อนุชา กล้าหาญ', position: 'หัวหน้าชุดปฏิบัติการคุ้มครองพยานพิเศษ', unit: 'ชุดคุ้มครองพยาน (ส่วนกลาง)', orgUnitId: 'central-wp', roles: ['protection'], active: true },
    { id: 'APP-001', name: 'นางสาววราภรณ์ นิติธรรม', position: 'นิติกรชำนาญการพิเศษ (งานวินิจฉัยอุทธรณ์)', unit: 'กลุ่มงานกฎหมายและอุทธรณ์', orgUnitId: 'central-gmc', roles: ['appeal'], active: true },
    { id: 'REC-001', name: 'นายสมบัติ รับสารบรรณ', position: 'เจ้าพนักงานธุรการชำนาญงาน', unit: 'กองบริหารคดี (ส่วนกลาง)', orgUnitId: 'central-gmc', roles: ['receiver'], active: true },
]

export const MAIN_CASE_OPTIONS: MainCaseOption[] = [
    { id: 'GBK-2569-0001', no: 'กบค. 001/2569', title: 'คดีทุจริตโครงการจัดซื้ออุปกรณ์เทศบาลตำบลโคกสะอาด', accused: 'นายวิชาญ พรหมรักษา และพวก', agency: 'กองบริหารคดี', leadOfficer: 'ร.ต.อ.สมชาย ตรวจสอบธรรม', risk: 'สูง', matchScore: 100 },
    { id: 'GBK-2569-0123', no: 'กบค. 123/2569', title: 'คดีเรียกรับผลประโยชน์การตรวจรับงานก่อสร้างเขื่อนกั้นดิน', accused: 'นายอัครเดช บรรเจิดศิลป์', agency: 'สำนักงาน ป.ป.ท. เขต 1', leadOfficer: 'พ.ต.ท.สมศักดิ์ สืบสวนดี', risk: 'วิกฤต', matchScore: 98 },
    { id: 'GBK-2569-0089', no: 'กบค. 089/2569', title: 'คดีเบิกจ่ายงบประมาณโครงการฝึกอบรมอันเป็นเท็จ', accused: 'นางเพ็ญศรี สุขเกษม', agency: 'กองบริหารคดี', leadOfficer: 'นายธนาธิป สุวรรณเวช', risk: 'ปานกลาง', matchScore: 85 },
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
    deputy_review: 'รองเลขาธิการ ป.ป.ท. กลั่นกรองก่อนเสนอเลขาธิการฯ',
    external_pending: 'เลขาธิการ ป.ป.ท. พิจารณาสั่งการ',
    notice: 'จัดทำและนำส่งหนังสือแจ้งผล',
    protection: 'อยู่ระหว่างการคุ้มครองพยาน',
    appeal: 'อยู่ระหว่างพิจารณาอุทธรณ์',
    method_operation: 'ปฏิบัติการตามวิธีที่ได้รับอนุมัติ',
    article14: 'ส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ',
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

/** ชื่อฟิลด์ใน draft ของ คบ.6 ที่เก็บรายการกฎหมาย กฎ ระเบียบ ในข้อ 7 */
export const KB6_LEGAL_REFS_FIELD = 'กฎหมายที่เกี่ยวข้อง'

/** ชื่อฟิลด์ใน draft ของ คบ.6 ที่บอกว่าจะพิมพ์ข้อความข้อพิจารณามาตรฐานในข้อ 8 หรือเว้นเป็นเส้นประ */
export const KB6_SHOW_RATIONALE_FIELD = 'พิมพ์ข้อความข้อพิจารณา'

/** จำนวนเส้นประที่ใช้แทนข้อความข้อพิจารณา — เท่ากับความสูงของข้อความเดิม เพื่อไม่ให้ 8.1 ขยับ */
export const KB6_RATIONALE_BLANK_ROWS = 11

/**
 * พิมพ์ข้อความข้อพิจารณาหรือไม่ — ค่าตั้งต้นคือพิมพ์
 * `undefined` (รวมถึง draft เก่าที่บันทึกไว้ก่อนมีฟีเจอร์นี้) จึงถือว่าพิมพ์ มีเพียง `false` เท่านั้นที่เว้นเส้นประ
 */
export const readShowRationale = (draft: Record<string, any>): boolean =>
    draft[KB6_SHOW_RATIONALE_FIELD] !== false

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
]

/** แหล่งที่มาของเหตุยุติ (WIT1125-1128) */
export const TERMINATION_TRIGGERS = [
    { value: 'witness_kb7', label: 'พยานยื่น คบ.7 ต่อเจ้าหน้าที่ หรือกรอกคำขอยุติในระบบ' },
    { value: 'external_letter', label: 'หนังสือขอยุติจากภายนอก (รับผ่านสารบรรณและอัปโหลดเข้าแฟ้มเดิม)' },
    { value: 'due_or_officer', label: 'ครบกำหนด หรือเจ้าหน้าที่เห็นควรยุติตามผลประเมินล่าสุด' },
] as const

/** แนวทางที่เลือกได้หลังทบทวนผล (WIT1107-1111 / WIT1149) */
export const REVIEW_OUTCOMES = [
    { value: 'continue', label: 'คุ้มครองต่อภายใต้คำสั่งเดิม', hint: 'กลับหน้าติดตามเพื่อกำหนดรอบ คบ.13 ถัดไป' },
    { value: 'extend', label: 'ขยายระยะเวลา (คบ.14)', hint: 'ทำได้เมื่อยังไม่ถึงเพดานรวม 180 วัน' },
    { value: 'change_method', label: 'เปลี่ยนวิธี / เงื่อนไข', hint: 'เสนออนุมัติและปรับ คบ.11 — เปลี่ยนเป็นวิธีที่ 1 จึงจัดทำ/แก้ คบ.8' },
    { value: 'terminate', label: 'เข้าสู่กระบวนการยุติ', hint: 'จัดทำ คบ.15 เสนอผู้มีอำนาจออกคำสั่ง คบ.16' },
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
 *  - ธุรการ            → คำร้อง เท่านั้น
 *  - เจ้าของสำนวน      → คำร้อง, คบ.1, คบ.2
 *  - เจ้าหน้าที่ ป.ป.ท. → คำร้อง, คบ.1, คบ.2
 */
export const INTAKE_DOC_TYPES_BY_ROLE: Record<string, IntakeDocTypeValue[]> = {
    receiver: ['petition'],
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
