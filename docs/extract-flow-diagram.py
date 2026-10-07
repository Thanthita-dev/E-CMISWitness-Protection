"""ดึงตำแหน่งกล่อง เส้นเชื่อม และ swimlane ของทุกแท็บในผัง drawio ไปเป็น src/flow-guide/flow-diagram.json

ใช้วาดผังรายขั้น WIT ในหน้า /flow-chart (กดกล่องแท็บในผังภาพรวมเพื่อกางดู)
รันใหม่ทุกครั้งที่ผัง drawio เปลี่ยน:  python3 docs/extract-flow-diagram.py
"""
import html
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'context/user-flow/User_Flow_Activity_6_Redesign_v5_A4_Tab_02.drawio'
OUT = ROOT / 'src/flow-guide/flow-diagram.json'


def clean(value):
    value = re.sub(r'<br\s*/?>|</div>|</p>', ' ', value or '')
    value = re.sub(r'<[^>]+>', '', value)
    return re.sub(r'\s+', ' ', html.unescape(value).replace('\xa0', ' ')).strip()


def style_of(cell):
    parts = (cell.get('style') or '').split(';')
    return {k: v for k, _, v in (p.partition('=') for p in parts if p)}


def geometry(cell):
    g = cell.find('mxGeometry')
    return {k: float(g.get(k, 0)) for k in ('x', 'y', 'width', 'height')} if g is not None else None


def point(el):
    return [float(el.get('x', 0)), float(el.get('y', 0))]


def extract(diagram):
    cells = list(diagram.iter('mxCell'))
    lanes, nodes, edges = [], [], []
    right = 0.0
    bottom = 0.0
    for c in cells:
        if c.get('vertex') != '1':
            continue
        st = style_of(c)
        g = geometry(c)
        text = clean(c.get('value'))
        right = max(right, g['x'] + g['width'])
        bottom = max(bottom, g['y'] + g['height'])
        box = {'x': g['x'], 'y': g['y'], 'w': g['width'], 'h': g['height']}
        if st.get('horizontal') == '0':
            lanes.append({'label': text, **box, 'fill': st.get('fillColor')})
        elif 'text' in st or (not text and 'ellipse' not in st):
            continue  # หัวเรื่องของแท็บ / พื้นหลัง swimlane
        else:
            code = c.get('id') if re.fullmatch(r'(?:WIT\d{4}|A6POST\d{2})', c.get('id') or '') else None
            if 'rhombus' in st:
                kind = 'decision'
            elif 'ellipse' in st:
                kind = 'terminal'
            elif st.get('shape') == 'note':
                kind = 'note'
            else:
                kind = 'step' if code else 'box'
            # ข้อความในกล่อง WIT ตัดเลข WIT ข้างหน้าออก (แสดงเลขแยก)
            if code:
                text = re.sub(r'^(?:WIT\d{4}|A6POST\d{2})\s*[—-]?\s*', '', text)
            nodes.append({'id': c.get('id'), 'code': code, 'kind': kind, 'text': text, **box})

    for c in cells:
        if c.get('edge') != '1':
            continue
        st = style_of(c)
        g = c.find('mxGeometry')
        arr = g.find('Array') if g is not None else None
        pts = [point(p) for p in arr.findall('mxPoint')] if arr is not None else []
        src_pt = next((point(p) for p in g.findall('mxPoint') if p.get('as') == 'sourcePoint'), None) if g is not None else None
        tgt_pt = next((point(p) for p in g.findall('mxPoint') if p.get('as') == 'targetPoint'), None) if g is not None else None
        edges.append({
            'id': c.get('id'),
            'source': c.get('source'),
            'target': c.get('target'),
            'label': clean(c.get('value')) or None,
            'points': pts,
            'sourcePoint': src_pt,
            'targetPoint': tgt_pt,
            'exit': [float(st['exitX']), float(st['exitY'])] if 'exitX' in st else None,
            'entry': [float(st['entryX']), float(st['entryY'])] if 'entryX' in st else None,
            'dashed': st.get('dashed') == '1',
        })
    lanes.sort(key=lambda l: l['y'])
    return {'width': right + 20, 'height': bottom + 20, 'lanes': lanes, 'nodes': nodes, 'edges': edges}


def main():
    root = ET.parse(SOURCE).getroot()
    tabs = {d.get('name').split()[0]: extract(d) for d in root.findall('diagram')}
    OUT.write_text(json.dumps({'source': str(SOURCE.relative_to(ROOT)), 'tabs': tabs}, ensure_ascii=False, indent=1), encoding='utf-8')
    total = sum(len(t['nodes']) for t in tabs.values())
    print(f'{OUT.relative_to(ROOT)} · {len(tabs)} แท็บ · {total} กล่อง · {sum(len(t["edges"]) for t in tabs.values())} เส้น')


if __name__ == '__main__':
    main()
