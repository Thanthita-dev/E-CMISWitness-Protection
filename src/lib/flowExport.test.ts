import { describe, expect, it } from 'vitest'
import { FLOW_GUIDE } from './flowGuide'
import { flowChartJson, flowChartMarkdown, flowGuideJson, flowGuideMarkdown } from './flowExport'

describe('ดาวน์โหลดคู่มือ / ผังภาพรวม', () => {
    it('JSON คู่มือมีทุกแท็บและทุกขั้น', () => {
        const data = flowGuideJson()
        expect(data.tabs).toHaveLength(FLOW_GUIDE.tabs.length)
        expect(data.tabs.flatMap((t) => t.steps)).toHaveLength(FLOW_GUIDE.tabs.flatMap((t) => t.steps).length)
    })

    it('Markdown คู่มือมีหัวข้อทุกแท็บและทุกเลข WIT', () => {
        const md = flowGuideMarkdown()
        FLOW_GUIDE.tabs.forEach((t) => {
            expect(md).toContain(`### ${t.title}`)
            t.steps.forEach((s) => expect(md).toContain(`**${s.code}**`))
        })
    })

    it('JSON ผังมีเส้นข้ามแท็บ และผังรายขั้นของทุกแท็บโดยไม่มีพิกัด', () => {
        const data = flowChartJson()
        expect(data.crossTabEdges.length).toBeGreaterThan(0)
        expect(data.tabs.map((t) => t.tab)).toEqual(FLOW_GUIDE.tabs.map((t) => t.tab))
        const withDiagram = data.tabs.filter((t) => t.diagram.nodes.length)
        expect(withDiagram.length).toBeGreaterThan(0)
        withDiagram.forEach((t) => {
            expect(t.diagram.edges.length).toBeGreaterThan(0)
            expect(t.diagram.nodes[0]).not.toHaveProperty('x')
        })
    })

    it('Markdown ผังมีตารางเส้นข้ามแท็บและหัวข้อทุกแท็บ', () => {
        const md = flowChartMarkdown()
        expect(md).toContain('## เส้นส่งต่อระหว่างแท็บ')
        FLOW_GUIDE.tabs.forEach((t) => expect(md).toContain(`### ${t.title}`))
    })
})
