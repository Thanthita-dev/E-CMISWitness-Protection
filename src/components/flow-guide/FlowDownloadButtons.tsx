import React from 'react'
import { FlowExportKind, downloadFlowExport } from '../../lib/flowExport'

/** ปุ่มดาวน์โหลดข้อมูลทุกแท็บของหน้า /flow-guide หรือ /flow-chart เป็น JSON / Markdown */
export const FlowDownloadButtons: React.FC<{ kind: FlowExportKind }> = ({ kind }) => (
    <div className="inline-flex min-h-[44px] items-stretch overflow-hidden rounded-lg border border-[#9aabba] bg-white text-[0.88rem] font-semibold text-navy" role="group" aria-label="ดาวน์โหลดข้อมูลทุกแท็บ">
        <span className="inline-flex items-center gap-[0.45rem] border-r border-[#9aabba] px-3 text-muted">
            <i className="fa-solid fa-download" />
            ดาวน์โหลด
        </span>
        <button type="button" onClick={() => downloadFlowExport(kind, 'json')} className="px-3 transition hover:bg-slate-50" title="ดาวน์โหลดข้อมูลทุกแท็บเป็นไฟล์ JSON">
            JSON
        </button>
        <button type="button" onClick={() => downloadFlowExport(kind, 'md')} className="border-l border-[#9aabba] px-3 transition hover:bg-slate-50" title="ดาวน์โหลดข้อมูลทุกแท็บเป็นไฟล์ Markdown">
            MD
        </button>
    </div>
)
