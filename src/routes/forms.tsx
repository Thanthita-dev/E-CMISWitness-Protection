import { ReferralDocumentWorkspace } from '../components/forms/ReferralDocumentWorkspace'
import { isReferralDocumentId } from '../lib/referralDocumentIdentity'
import { POLICE_CATALOG, PoliceLetterCatalog } from '../components/protection/PoliceLetterCatalog'
import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { FormCodeTooltip } from '../components/common/FormCodeTooltip'
import { FORMS_CATALOG } from '../lib/constants'
import { canOpenForm } from '../lib/permissions'
import { useAuthStore } from '../store/useAuthStore'
import { ADDITIONAL_FORMS, getAdditionalForm } from '../lib/additionalForms'
import { AdditionalFormEditor } from '../components/forms/AdditionalFormEditor'
import { Button } from '../components/common/Button'

export const Route = createFileRoute('/forms')({
  validateSearch: (search: Record<string, unknown>): { additional?: string; caseNo?: string; history?: boolean } => ({
    history: search.history === true || search.history === 'true' ? true : undefined,
    caseNo: typeof search.caseNo === 'string' ? search.caseNo : undefined,
    additional: typeof search.additional === 'string' ? search.additional : undefined,
  }),
  component: FormsCatalogPage,
})

export function FormsCatalogPage() {
  const { currentRole } = useAuthStore()
  const { additional, caseNo, history } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [section, setSection] = React.useState<'kb' | 'additional'>('kb')
  const allowed = canOpenForm(currentRole)
  const back = () => {
    setSection('additional')
    navigate({ search: {} })
  }

  if (isReferralDocumentId(additional) && allowed) return <ReferralDocumentWorkspace key={`${additional}:${caseNo || ''}`} id={additional} caseNo={caseNo} showHistory={history} onBack={back} />

  const policeTemplate = POLICE_CATALOG.find(t => t.id === additional)
  if (policeTemplate && !allowed) return <div className="space-y-4"><PageHeader title="ไม่มีสิทธิ์เปิดแบบฟอร์มนี้" /><Button variant="secondary" onClick={back}>กลับรายการแบบฟอร์ม</Button></div>
  if (policeTemplate && allowed) return <PoliceLetterCatalog key={policeTemplate.id} kind={policeTemplate.kind} onBack={back} />
  if (additional) {
    const template = getAdditionalForm(additional)
    if (!template || !allowed) return <div className="space-y-4">
      <PageHeader title={!template ? 'ไม่พบแบบฟอร์ม' : 'ไม่มีสิทธิ์เปิดแบบฟอร์มนี้'} />
      <Button variant="secondary" size="md" onClick={back}>กลับรายการแบบฟอร์ม</Button>
    </div>
    return <AdditionalFormEditor key={template.id} template={template} onBack={back} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="งานคุ้มครองพยาน · แบบฟอร์ม"
        title="แบบฟอร์มและหนังสือคุ้มครองพยาน"
        description="รวมแบบ คบ.1–17 บันทึกข้อความ และหนังสือประกอบงานคุ้มครองพยาน"
      />

      <div className="flex flex-wrap gap-2" aria-label="หมวดแบบฟอร์ม">
        <Button variant={section === 'kb' ? 'primary' : 'secondary'} size="md" aria-pressed={section === 'kb'} onClick={() => setSection('kb')}>แบบ คบ. ({FORMS_CATALOG.filter(f => f.n <= 17).length})</Button>
        <Button variant={section === 'additional' ? 'primary' : 'secondary'} size="md" aria-pressed={section === 'additional'} onClick={() => setSection('additional')}>แบบฟอร์มและหนังสือประกอบ ({ADDITIONAL_FORMS.length + POLICE_CATALOG.length + FORMS_CATALOG.filter(f => f.n === 18).length})</Button>
      </div>

      {section === 'additional' && <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-label="แบบฟอร์มและหนังสือประกอบ">
          <h2 className="col-span-full text-lg font-bold text-navy">ส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ</h2>
          {ADDITIONAL_FORMS.map((template, index) => <React.Fragment key={template.id}>{index === 2 && <h2 className="col-span-full text-lg font-bold text-navy">หนังสือประกอบอื่น</h2>}<article key={template.id} className="flex flex-col justify-between ws-card p-5 hover:border-navy hover:shadow-md transition group">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-8 w-20 items-center justify-center rounded-lg bg-blue-100 font-bold text-blue-800 text-xs">เอกสาร {index + 1}</span>
                <span className="text-xs font-semibold text-slate-500">{template.category}</span>
              </div>
              <h3 className="text-base font-bold text-navy group-hover:text-blue transition leading-snug">{template.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">{template.description}</p>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-end">
              <Button className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2.5 text-[0.9375rem] font-semibold transition ${allowed ? 'bg-navy text-white hover:bg-blue' : 'bg-slate-100 border border-slate-200 text-slate-600'}`} disabled={!allowed} title={!allowed ? 'ไม่มีสิทธิ์เปิดแบบฟอร์มนี้' : undefined} onClick={() => navigate({ search: { additional: template.id } })}>
                <i className="fa-solid fa-pen-to-square text-xs" aria-hidden="true" />เปิดแบบฟอร์ม
              </Button>
            </div>
          </article></React.Fragment>)}
          <article className="ws-card flex flex-col justify-between gap-4 p-5"><div><h3 className="font-bold text-navy">หนังสือส่งต่อหน่วยงานอื่น</h3><p className="mt-2 text-sm text-muted">สำหรับกรมการปกครอง ตำรวจ หรือทหาร</p></div><Link to="/form/$formId" params={{ formId: '18' }} search={{ from: 'forms' }} className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-navy px-4 py-2 font-semibold text-white">เปิดแบบฟอร์ม</Link></article>
          <h2 className="col-span-full text-lg font-bold text-navy">ประสานตำรวจ</h2>
          {POLICE_CATALOG.map(template => <article key={template.id} className="ws-card p-5 flex flex-col justify-between gap-4"><div><span className="text-sm text-muted">หนังสือประกอบ · ประสานตำรวจ</span><h3 className="text-base font-bold text-navy mt-2">{template.title}</h3><p className="text-sm text-muted mt-2">ขอความอนุเคราะห์จัดเจ้าหน้าที่ตำรวจให้ความคุ้มครองพยาน</p></div><Button disabled={!allowed} onClick={() => navigate({ search: { additional: template.id } })}>เปิดหนังสือ</Button></article>)}
      </section>}

      {section === 'kb' && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {FORMS_CATALOG.filter(f => f.n <= 17).map((f) => (
          <div
            key={f.n}
            className="flex flex-col justify-between ws-card p-5 hover:border-navy hover:shadow-md transition group"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <FormCodeTooltip formNo={f.n}>
                  <span className="flex h-8 min-w-14 items-center justify-center rounded-lg bg-blue-100 px-2 font-bold text-blue-800 text-xs">
                    {f.code}
                  </span>
                </FormCodeTooltip>
                <span className="text-xs font-semibold text-slate-500">
                  {f.pages ? `${f.pages} หน้า A4` : '1 หน้า'}
                </span>
              </div>

              <h3 className="text-base font-bold text-navy group-hover:text-blue transition leading-snug">
                {f.t}
              </h3>

              <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">
                {f.d}
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-end">
              {canOpenForm(currentRole) ? (
                <Link
                  to="/form/$formId"
                  params={{ formId: String(f.n) }}
                  search={{ from: 'forms' }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-[0.9375rem] font-semibold text-white hover:bg-blue transition"
                >
                  <i className="fa-solid fa-pen-to-square text-xs" />
                  เปิดแบบฟอร์ม
                </Link>
              ) : (
                <span
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-100 border border-slate-200 px-4 py-2.5 text-[0.9375rem] font-semibold text-slate-600 cursor-not-allowed"
                  title="ธุรการสำนัก/กองไม่มีสิทธิ์เปิดแบบฟอร์มนี้"
                >
                  <i className="fa-solid fa-pen-to-square text-xs" />
                  เปิดแบบฟอร์ม
                </span>
              )}
            </div>
          </div>
        ))}
      </div>}
    </div>
  )
}
