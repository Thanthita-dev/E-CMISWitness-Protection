# Gap Analysis — flow ไม่อนุมัติ / ปฏิเสธ / ตีกลับ ที่ยังไม่มีใน logic prototype

อ้างอิงผัง: `context/user-flow/User_Flow_Activity_6_Redesign_v5_A4_Tab_02.drawio` (19 sheet)
เกณฑ์ตัดสิน: นับว่า **มี** ก็ต่อเมื่อ (1) มี UI ที่กดได้ **และ** (2) มี action/field ใน `useCaseStore` + `types/*` ที่เปลี่ยน state จริง
สถานะ: `ขาด` = ไม่มีเลย · `บางส่วน` = มีอย่างใดอย่างหนึ่ง หรือมีแต่พฤติกรรมไม่ตรงผัง

---

## สรุปภาพรวม

| ระดับ | จำนวน branch |
|---|---|
| ขาดทั้งหมด | 3 |
| มีบางส่วน / ไม่ตรงผัง | 6 |
| ครบแล้ว | 18 |

branch ที่ตรวจแล้ว **ครบ** (ไม่ต้องทำเพิ่ม): WIT0215, WIT0505–0506, WIT0603, WIT0606–WIT0611, WIT0812 (แกนหลัก), WIT0858, WIT1106, WIT1119, WIT1123, WIT1133, WIT1137, WIT1149, WIT1150, WIT0922

---

## A. ขาดทั้งหมด (ไม่มีทั้ง UI และ logic)

### A1 — `06 เส้นทางเร่งด่วน: คบ.4 / คบ.5 และเริ่มคุ้มครองชั่วคราว` — ✅ ปิดครบแล้ว
| code | name | สถานะ | หลักฐาน |
|---|---|---|---|
| WIT0603 | เลือกวิธีตามข้อ 15 (1)–(4) ใน คบ.4 ได้มากกว่า 1 วิธี | **ครบ** | `ProtectionMethodChecks` ใน `Kb4FormEditor` เขียนลง `KB4_PROTECTION_METHOD_FIELD` แล้วผูกเข้า `fastTrack.proposedMethods` |
| WIT0606 | ข้อมูลครบและพร้อมพิจารณา? | **ครบ** | `confirmFastTrackReadiness` เป็นประตูที่ต้องผ่านก่อนจึงเห็นปุ่มของ WIT0609 |
| WIT0607 / WIT0608 | ตีกลับตรงเจ้าหน้าที่ แล้วส่ง ผอ. ตรวจใหม่ | **ครบ** | `returnFastTrackForRework` + `submitFastTrackForDecision` (รอบแก้ไข) |
| WIT0609 / WIT0611 | อนุมัติคุ้มครองชั่วคราว และลงนาม คบ.5 | **ครบ** | `approveTemporaryProtection` เขียน `kb5Approved` และ `lockForm(5)` ล็อกฉบับลงนาม |
| WIT0610 | ไม่อนุมัติชั่วคราว ไม่ปิดคำร้องหลัก ไม่ออก คบ.10 | **ครบ** | `denyTemporaryProtection` เขียน `temporaryDenied*` โดยไม่แตะ `activity7State` |
| WIT0612 / WIT0613 | พยานยินยอมอ้างอิง คบ.5 แล้วส่งวิธีไปแท็บ 08 | **ครบ** | `acknowledgeKb5Order` → `recordConsent('kb5')` → `setApprovedMethods` |
| WIT0614 | คำร้องหลักยังเดินต่อ | **ครบ** | `mainPetitionNotice` + guard ห้ามลัดขั้นตอนใน `ForwardWorkflowCard` |

> **ผลลัพธ์**: Phase `TEMPORARY` เกิดขึ้นได้จากการกดจริงในระบบแล้ว ไม่ต้อง seed ผ่าน mock-state
> ครอบคลุมด้วย `e2e/flows/wit0606-fast-track-temporary-protection.spec.ts` ทั้งเส้นอนุมัติ · เส้นตีกลับ · เส้นไม่อนุมัติ · เส้นห้ามลัดขั้นตอน

### A2 — `09A ไม่อนุมัติและแจ้งสิทธิอุทธรณ์`
| code | name | สถานะ | หลักฐาน |
|---|---|---|---|
| WIT0904 | ตรวจความครบถ้วนของร่าง คบ.10 แล้วเสนอรองเลขาธิการฯ | **ขาด** | `nonApprovalStep` ถูกเซ็ต `0` ครั้งเดียวที่ `useCaseStore.ts:709` แล้วไม่ถูกใช้อีกเลย |
| WIT0905 | รองเลขาธิการฯ กลั่นกรอง คบ.10 ให้ตรงกับผลพิจารณาและข้อความแจ้งสิทธิ | **ขาด** | ไม่มี `deputy` ใด ๆ ใน `NoticeDispatchCard.tsx` / `notice.tsx` (มีเฉพาะ `deputyReviewState` ของ คบ.6) |
| WIT0909 | ไม่อุทธรณ์ → สิ้นสุดกระบวนการไม่อนุมัติ | **ขาด** | `closeProtectionCase` ถูกเรียกจาก `Kb17Section.tsx` (11D) เท่านั้น ไม่มีทางปิดเรื่องฝั่ง คบ.10 เมื่อพ้น 30 วัน |

---

## B. มีบางส่วน / พฤติกรรมไม่ตรงผัง

### B1 — `05 เส้นทางปกติ: กลั่นกรอง คบ.6`
| code | name | สถานะ | ปัญหา |
|---|---|---|---|
| WIT0510 | ผอ. บันทึกเหตุผลและ**ส่งกลับตรง**เจ้าหน้าที่ผู้รับผิดชอบ | **บางส่วน** | `ForwardWorkflowCard.tsx:244-246` — เมื่อ `currentRole === 'director'` จะส่ง `targetRole = 'supervisor'` คือเด้งกลับ ผบช.ชั้นต้น ไม่ใช่ส่งตรงเจ้าหน้าที่ตามผัง |
| WIT0511 | แก้ตามคำสั่ง ผอ. แล้ว**ส่งกลับ ผอ.** ตรวจใหม่ | **บางส่วน** | ผลพ่วงจากข้างบน — เมื่อแก้เสร็จจะไหลผ่าน ผบช. อีกรอบแทนที่จะกลับ ผอ. โดยตรง |

### B2 — `07 รับและบันทึกผลการพิจารณา`
| code | name | สถานะ | ปัญหา |
|---|---|---|---|
| WIT0708 | เจ้าหน้าที่แก้ คบ.3/คบ.6 เป็น Revision ใหม่ | **บางส่วน** | `secretaryReturn` (`useCaseStore.ts:722-750`) ตั้ง `stage: 'director_review'` + `owner: director` → งานไปจอดที่ ผอ. ไม่ได้ลงถึงเจ้าหน้าที่ผู้แก้ตามผัง |
| WIT0709 | ส่ง Revision ผ่าน ผบช.ชั้นต้น และ ผอ. **ตามลำดับเดิม ห้ามข้ามลำดับชั้น** | **ขาด** | ไม่มี guard บังคับลำดับ — จาก `director_review` สามารถ forward ต่อได้เลยโดยไม่ผ่าน `supervisor_review` |
| WIT0713 | เห็นควรตามข้อ 14 (แขนงที่ 4 ของ WIT0704) | **ขาด** | `article14.tsx:42-47` คัดเฉพาะเคสที่ `atCap`/`nearCap` หรือเปิด `article14` แล้ว → เข้าข้อ 14 จากผลพิจารณาแท็บ 07 ไม่ได้ มีแต่ทางเข้าจาก 11A (WIT1149) |

### B3 — `08A รับคำสั่งและแยกแนวทางคุ้มครอง`
| code | name | สถานะ | ปัญหา |
|---|---|---|---|
| WIT0812 | ไม่ยินยอม — เสนอ**ทบทวน / เปลี่ยนวิธี / ยุติ** ผ่านลำดับผู้บังคับบัญชา | **บางส่วน** | `protection-methods.tsx:110` hardcode `proposedAction: 'review'` — ผู้ใช้เลือก 3 แนวทางตามผังไม่ได้ และไม่มีการสร้างงานเสนอตามลำดับชั้น |

### B4 — `08B ประสานหน่วยงานอื่นตามข้อ 15(4)`
| code | name | สถานะ | ปัญหา |
|---|---|---|---|
| WIT0845 | ปฏิเสธ — บันทึกเหตุผล แล้ว**เสนอผู้มีอำนาจพิจารณาหน่วยงานหรือแนวทางใหม่** | **บางส่วน** | `MethodPanels.tsx:755-757` บันทึก `declined` + `blocked` ครบ แต่ประโยค "เสนอผู้มีอำนาจ…" เป็นแค่ข้อความ `showToast` ไม่มีงาน/สถานะรออนุมัติเกิดขึ้นจริง |

### B5 — `09B รับอุทธรณ์ กลั่นกรอง และเสนอคณะกรรมการ`
| code | name | สถานะ | ปัญหา |
|---|---|---|---|
| WIT0914 | ล่าช้าเกิน 30 วัน → บันทึกเหตุผลและจัดทำแฟ้มเสนอ **ไม่ปัดตกอัตโนมัติ** | **ขาด (ขัดผัง)** | `appeal.tsx:25-30` — `return left !== null && left >= 0` ทำให้เคสที่พ้นกำหนดหายจากรายการ = ปัดตกอัตโนมัติ และไม่มี field เก็บเหตุผลความล่าช้า |
| WIT0917 | รองเลขาธิการฯ กลั่นกรองแฟ้มอุทธรณ์และให้ความเห็น | **บางส่วน** | `appeal-folder/$caseNo.tsx:261` เรียกแค่ `logHistory` ไม่มี field ใน `CaseItem` → กดแล้วสถานะแฟ้มไม่เปลี่ยน กดซ้ำได้ไม่จำกัด |
| WIT0915 / WIT0916 / WIT0918 | ผู้ตรวจชั้นต้นบันทึกความเห็น · ผบช. ลงนามเสนอ · เลขาธิการฯ ให้ความเห็นก่อนส่งคณะกรรมการ | **ขาด** | ไม่มีขั้นลำดับชั้นของแฟ้มอุทธรณ์ในโค้ด — แฟ้มกระโดดจากรับเรื่องไปมติคณะกรรมการได้ทันที |
| WIT0921 | ยืนคำสั่งเดิม → **ทำหนังสือแจ้งผลอุทธรณ์** ผ่านสารบรรณ เก็บหลักฐานรับ | **บางส่วน** | `AppealResolution.noticeDocumentName / noticeRegistryNo / noticeDeliveredAt` ประกาศไว้ใน `types/case.ts` แต่ไม่มี UI หรือ action ใดเขียนค่า (grep เจอเฉพาะไฟล์ type) |

---

## C. แผน implement ที่เสนอ (เรียงตามความสำคัญ)

### ~~ลำดับ 1 — sheet 06 fast track~~ ✅ ทำแล้ว
- `types/case.ts`: `FastTrackState` (`fastTrack.step` เดินแยกจาก `stage` ของคำร้องหลัก) + ใช้ `temporaryDeniedAt/Reason` ที่ประกาศไว้
- `lib/fastTrack.ts`: ตรรกะประตูทั้งหมดของ sheet 06 แยกเป็น pure function ใช้ร่วมกับ guard ห้ามลัดขั้นตอน
- `useCaseStore.ts`: `submitFastTrackForDecision` · `confirmFastTrackReadiness` · `returnFastTrackForRework` · `approveTemporaryProtection` · `denyTemporaryProtection` · `acknowledgeKb5Order`
- UI: `components/dossier/FastTrackCard.tsx` (ทั้งเส้น WIT0603–WIT0614) และช่องเลือกวิธีตามข้อ 15 ใน `Kb4FormEditor`
- mock state ใหม่: `Case 3` (WIT0603) และ `Case 3.1` (WIT0605/WIT0606)

### ลำดับ 2 — 09A ให้ครบเส้น (WIT0904–0905, WIT0909)
- ใช้ `nonApprovalStep` ที่มีอยู่แล้วให้เดินจริง: `0 ร่าง → 1 เจ้าหน้าที่ตรวจครบ → 2 รองเลขาฯ กลั่นกรอง → 3 ลงนาม → 4 ส่งออก`
- เพิ่ม `kb10DeputyScreenedAt/By/Note` ใน `CaseItem` + ขั้นในกล่อง `NoticeDispatchCard`
- เพิ่ม `closeNonApprovalCase(caseNo)` (WIT0909) + ปุ่ม "ปิดเรื่อง — ไม่อุทธรณ์ภายในกำหนด" ที่โผล่เมื่อ `daysUntil(appealDueAt) < 0 && !appealFiledAt`

### ลำดับ 3 — 09B ลำดับชั้นแฟ้มอุทธรณ์ + ไม่ปัดตกอัตโนมัติ
- เพิ่ม `AppealFolder` state: `{ stage: 'received'|'officer_opinion'|'supervisor'|'deputy'|'secretary'|'agenda'|'resolved', lateReason?, lateAcceptedBy? }`
- แก้ `appeal.tsx:29` ให้แสดงเคสพ้นกำหนดในกลุ่มแยก "เกินกรอบ 30 วัน — ต้องบันทึกเหตุผลก่อนเสนอ"
- ผูก `WIT0917` ให้เขียน state จริงแทน `logHistory` เปล่า
- เพิ่มฟอร์มบันทึกหนังสือแจ้งผลอุทธรณ์ (WIT0921) เขียนลง `appealResolution.notice*`

### ลำดับ 4 — แก้ทิศทางการส่งกลับให้ตรงผัง
- `ForwardWorkflowCard.tsx:244-246`: `director` → `targetRole = 'officer'` (WIT0510) และให้ flow กลับขึ้น `director_review` โดยตรงเมื่อแก้เสร็จ (WIT0511)
- `secretaryReturn`: ตั้ง `stage: 'staff_review'` + `owner: assignedOfficer` (WIT0708) แล้วเพิ่ม guard ลำดับชั้นใน `getNextStage` (WIT0709)

### ลำดับ 5 — เก็บรายละเอียดที่เหลือ
- `WIT0812`: เปลี่ยน `proposedAction` เป็น dropdown 3 ตัวเลือก + สร้างงานเสนอ ผบช.
- `WIT0845`: หลังบันทึกปฏิเสธ ให้สร้าง `ReviewProposal`/งานเสนอผู้มีอำนาจ แทน toast
- `WIT0713`: เพิ่มเงื่อนไข candidate ของ `article14.tsx` ให้รับเคสที่ผลพิจารณาแท็บ 07 ระบุ "เห็นควรตามข้อ 14"
