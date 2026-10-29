#!/usr/bin/env python3
"""แปลง Word ต้นฉบับของแบบฟอร์มและหนังสือประกอบเป็น layout JSON สำหรับจำลองกระดาษ

ใช้ค่าจาก Word โดยตรง (ขนาดกระดาษ ขอบ ฟอนต์ ย่อหน้า แท็บ ระยะบรรทัด รูป กล่องข้อความ เส้น VML
และตำแหน่งขึ้นหน้าที่ Word บันทึกไว้) ไม่แก้ไฟล์ต้นฉบับ

    python3 scripts/import-additional-forms.py [--doc-docx case-owner-notice=<path.docx>] [--dump DIR]

ไฟล์ .doc (หนังสือแจ้งเจ้าของสำนวน) ต้องแปลงเป็น .docx ก่อน (เช่น ส่งออกจาก Pages/Word เป็น .docx)
แล้วส่ง path ผ่าน --doc-docx
"""
import argparse
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'public/assets/forms/additional')
OUT = os.path.join(ROOT, 'src/lib/additionalForms.layout.json')
MEDIA_OUT = os.path.join(ROOT, 'public/assets/forms/additional/media')

NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'v': 'urn:schemas-microsoft-com:vml',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'pr': 'http://schemas.openxmlformats.org/package/2006/relationships',
}
W = '{%s}' % NS['w']


def q(tag):
    pre, local = tag.split(':')
    return '{%s}%s' % (NS[pre], local)


def wval(el, attr='val'):
    if el is None:
        return None
    return el.get(W + attr)


def twip(v):
    return None if v is None else round(int(float(v)) / 20, 2)


def emu(v):
    return round(int(v) / 12700, 2)


def on(el):
    """ค่าสวิตช์ของ Word เช่น <w:b/> หรือ <w:b w:val="0"/>"""
    if el is None:
        return None
    v = wval(el)
    return v not in ('0', 'false', 'off')


def css_len(value):
    """แปลงค่า VML เช่น 12.5pt / 1in / 3cm เป็น pt"""
    if value is None:
        return 0.0
    m = re.match(r'(-?[\d.]+)(pt|in|cm|mm|px)?', value.strip())
    if not m:
        return 0.0
    n = float(m.group(1))
    unit = m.group(2) or 'px'
    return round(n * {'pt': 1, 'in': 72, 'cm': 72 / 2.54, 'mm': 72 / 25.4, 'px': 0.75}[unit], 2)


def emf_bitmap(data):
    """คืนไฟล์ BMP จากเรคคอร์ด EMR_STRETCHDIBITS ตัวแรกใน EMF"""
    import struct
    off = 0
    while off + 8 <= len(data):
        kind, size = struct.unpack('<II', data[off:off + 8])
        if size == 0:
            break
        if kind == 81:
            off_bmi, cb_bmi, off_bits, cb_bits = struct.unpack('<IIII', data[off + 48:off + 64])
            bmi = data[off + off_bmi:off + off_bmi + cb_bmi]
            bits = data[off + off_bits:off + off_bits + cb_bits]
            header = b'BM' + struct.pack('<IHHI', 14 + len(bmi) + len(bits), 0, 0, 14 + len(bmi))
            return header + bmi + bits
        off += size
    return None


def parse_style(style):
    out = {}
    for part in (style or '').split(';'):
        if ':' in part:
            k, v = part.split(':', 1)
            out[k.strip()] = v.strip()
    return out


class Doc:
    def __init__(self, path, form_id):
        self.zip = zipfile.ZipFile(path)
        self.form_id = form_id
        self.rels = self._rels('word/_rels/document.xml.rels')
        self.styles = {}
        self.default_rpr = {}
        self.default_ppr = {}
        self.media = {}
        self.warnings = []
        self._load_styles()
        self.numbering = self._load_numbering()
        self.num_counters = {}

    def _xml(self, name):
        return ET.fromstring(self.zip.read(name))

    def _rels(self, name):
        try:
            root = self._xml(name)
        except KeyError:
            return {}
        return {r.get('Id'): r.get('Target') for r in root.findall('pr:Relationship', NS)}

    # ---------- styles ----------
    def _load_styles(self):
        try:
            root = self._xml('word/styles.xml')
        except KeyError:
            return
        dd = root.find('w:docDefaults', NS)
        if dd is not None:
            self.default_rpr = self.rpr(dd.find('w:rPrDefault/w:rPr', NS), {})
            self.default_ppr = self.ppr(dd.find('w:pPrDefault/w:pPr', NS), {})
        raw = {}
        for s in root.findall('w:style', NS):
            raw[s.get(W + 'styleId')] = s
        self._raw_styles = raw
        self.default_pstyle = None
        for sid, s in raw.items():
            if s.get(W + 'type') == 'paragraph' and s.get(W + 'default') == '1':
                self.default_pstyle = sid

    def style_props(self, sid, seen=None):
        """คืน (pPr, rPr) ของสไตล์รวม basedOn"""
        if sid in self.styles:
            return self.styles[sid]
        s = getattr(self, '_raw_styles', {}).get(sid)
        if s is None:
            return ({}, {})
        seen = seen or set()
        if sid in seen:
            return ({}, {})
        seen.add(sid)
        base = wval(s.find('w:basedOn', NS))
        bp, br = self.style_props(base, seen) if base else ({}, {})
        p = self.ppr(s.find('w:pPr', NS), dict(bp))
        r = self.rpr(s.find('w:rPr', NS), dict(br))
        self.styles[sid] = (p, r)
        return (p, r)

    # ---------- numbering ----------
    def _load_numbering(self):
        try:
            root = self._xml('word/numbering.xml')
        except KeyError:
            return {}
        abstract = {}
        for an in root.findall('w:abstractNum', NS):
            levels = {}
            for lvl in an.findall('w:lvl', NS):
                levels[lvl.get(W + 'ilvl')] = {
                    'fmt': wval(lvl.find('w:numFmt', NS)) or 'decimal',
                    'text': wval(lvl.find('w:lvlText', NS)) or '',
                    'start': int(wval(lvl.find('w:start', NS)) or 1),
                    'ppr': self.ppr(lvl.find('w:pPr', NS), {}),
                    'rpr': self.rpr(lvl.find('w:rPr', NS), {}),
                    'suff': wval(lvl.find('w:suff', NS)) or 'tab',
                }
            abstract[an.get(W + 'abstractNumId')] = levels
        nums = {}
        for n in root.findall('w:num', NS):
            nums[n.get(W + 'numId')] = abstract.get(wval(n.find('w:abstractNumId', NS)), {})
        return nums

    def num_label(self, num_id, ilvl):
        levels = self.numbering.get(num_id)
        if not levels or ilvl not in levels:
            return None
        key = (num_id,)
        counters = self.num_counters.setdefault(key, {})
        lvl = levels[ilvl]
        counters[ilvl] = counters.get(ilvl, lvl['start'] - 1) + 1
        for deeper in [k for k in counters if int(k) > int(ilvl)]:
            del counters[deeper]
        text = lvl['text']

        def fmt(value, f):
            if f == 'thaiNumbers':
                return str(value).translate(str.maketrans('0123456789', '๐๑๒๓๔๕๖๗๘๙'))
            if f == 'thaiLetters':
                letters = 'กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ'
                return letters[(value - 1) % len(letters)]
            if f == 'bullet':
                return ''
            return str(value)

        def repl(m):
            lv = str(int(m.group(1)) - 1)
            if lv not in levels:
                return ''
            return fmt(counters.get(lv, levels[lv]['start']), levels[lv]['fmt'])

        label = re.sub(r'%(\d)', repl, text)
        if lvl['fmt'] == 'bullet':
            label = text
        return {'label': label, 'ppr': lvl['ppr'], 'rpr': lvl['rpr'], 'suff': lvl['suff']}

    # ---------- properties ----------
    def ppr(self, el, base):
        p = dict(base)
        if el is None:
            return p
        jc = wval(el.find('w:jc', NS))
        if jc:
            p['jc'] = {'both': 'justify', 'thaiDistribute': 'thai', 'distribute': 'distribute',
                       'start': 'left', 'end': 'right'}.get(jc, jc)
        ind = el.find('w:ind', NS)
        if ind is not None:
            for src, dst in (('left', 'l'), ('start', 'l'), ('right', 'r'), ('end', 'r')):
                if ind.get(W + src) is not None:
                    p[dst] = twip(ind.get(W + src))
            if ind.get(W + 'firstLine') is not None:
                p['fl'] = twip(ind.get(W + 'firstLine'))
            if ind.get(W + 'hanging') is not None:
                p['fl'] = -twip(ind.get(W + 'hanging'))
        sp = el.find('w:spacing', NS)
        if sp is not None:
            if sp.get(W + 'before') is not None:
                p['sb'] = twip(sp.get(W + 'before'))
            if sp.get(W + 'after') is not None:
                p['sa'] = twip(sp.get(W + 'after'))
            if sp.get(W + 'beforeAutospacing') in ('1', 'true'):
                p['sb'] = 14
            if sp.get(W + 'afterAutospacing') in ('1', 'true'):
                p['sa'] = 14
            if sp.get(W + 'line') is not None:
                rule = sp.get(W + 'lineRule') or 'auto'
                v = int(sp.get(W + 'line'))
                p['line'] = {'rule': rule, 'v': round(v / 240, 4) if rule == 'auto' else twip(v)}
        cs = el.find('w:contextualSpacing', NS)
        if cs is not None:
            p['ctx'] = on(cs)
        tabs = el.find('w:tabs', NS)
        if tabs is not None:
            cur = {t['pos']: t for t in p.get('tabs', [])}
            for t in tabs.findall('w:tab', NS):
                pos = twip(t.get(W + 'pos'))
                if t.get(W + 'val') == 'clear':
                    cur.pop(pos, None)
                    continue
                cur[pos] = {'pos': pos, 'val': t.get(W + 'val'), 'leader': t.get(W + 'leader') or 'none'}
            p['tabs'] = sorted(cur.values(), key=lambda t: t['pos'])
        for tag, key in (('keepNext', 'keepNext'), ('keepLines', 'keepLines'), ('pageBreakBefore', 'pb'),
                         ('widowControl', 'widow')):
            e = el.find('w:' + tag, NS)
            if e is not None:
                p[key] = on(e)
        sid = wval(el.find('w:pStyle', NS))
        if sid:
            p['_style'] = sid
        num = el.find('w:numPr', NS)
        if num is not None:
            p['_num'] = (wval(num.find('w:numId', NS)), wval(num.find('w:ilvl', NS)) or '0')
        bdr = el.find('w:pBdr', NS)
        if bdr is not None:
            sides = {side.tag.split('}')[1]: {'val': wval(side), 'sz': int(side.get(W + 'sz') or 4) / 8,
                                              'space': int(side.get(W + 'space') or 0)}
                     for side in bdr if wval(side) not in ('nil', 'none')}
            if sides:
                p['border'] = sides
            else:
                p.pop('border', None)
        return p

    def rpr(self, el, base):
        r = dict(base)
        if el is None:
            return r
        for tag, key in (('b', 'b'), ('bCs', 'b'), ('i', 'i'), ('iCs', 'i'), ('strike', 's'), ('caps', 'caps'),
                         ('vanish', 'hidden')):
            e = el.find('w:' + tag, NS)
            if e is not None:
                r[key] = on(e)
        u = el.find('w:u', NS)
        if u is not None:
            r['u'] = None if wval(u) in ('none', None) and wval(u) != 'single' and wval(u) is not None else (wval(u) or 'single')
            if wval(u) == 'none':
                r['u'] = None
        # ข้อความไทยใช้ขนาด complex script (szCs) ส่วนอักษรละตินใช้ sz
        sz = wval(el.find('w:szCs', NS)) or wval(el.find('w:sz', NS))
        if sz:
            r['sz'] = int(sz) / 2
        szl = wval(el.find('w:sz', NS))
        if szl:
            r['szl'] = int(szl) / 2
        sp = wval(el.find('w:spacing', NS))
        if sp is not None:
            r['sp'] = twip(sp)
        va = wval(el.find('w:vertAlign', NS))
        if va:
            r['va'] = va
        pos = wval(el.find('w:position', NS))
        if pos:
            r['pos'] = int(pos) / 2
        color = wval(el.find('w:color', NS))
        if color:
            # color=auto ในตัวอักษรต้องลบสีที่ได้จากสไตล์ (เช่น Emphasis สีแดง) ด้วย
            r['color'] = None if color.lower() in ('auto', '000000') else color
        hl = wval(el.find('w:highlight', NS))
        if hl and hl != 'none':
            r['hl'] = hl
        fonts = el.find('w:rFonts', NS)
        if fonts is not None:
            f = fonts.get(W + 'cs') or fonts.get(W + 'ascii') or fonts.get(W + 'hAnsi')
            if f:
                r['font'] = f
        rs = wval(el.find('w:rStyle', NS))
        if rs:
            r['_rstyle'] = rs
        return r


def clean_run(r):
    out = {}
    for k in ('b', 'i', 'u', 's', 'sz', 'szl', 'sp', 'va', 'pos', 'color', 'caps', 'hl'):
        v = r.get(k)
        if v not in (None, False, 0):
            out[k] = v
    return out


def clean_para(p):
    out = {}
    for k in ('jc', 'l', 'r', 'fl', 'sb', 'sa', 'line', 'tabs', 'keepNext', 'keepLines', 'pb', 'border', 'ctx'):
        v = p.get(k)
        if v not in (None, False) and not (k in ('l', 'r', 'fl', 'sb', 'sa') and v == 0):
            out[k] = v
    if out.get('jc') == 'left':
        del out['jc']
    return out


class Converter:
    def __init__(self, doc, part='word/document.xml'):
        self.doc = doc
        self.part = part
        rel_name = 'word/_rels/' + part.split('/')[-1] + '.rels'
        self.rels = doc._rels(rel_name)

    def media(self, rid):
        target = self.rels.get(rid)
        if not target:
            return None
        name = 'word/' + target if not target.startswith('/') else target[1:]
        try:
            data = self.doc.zip.read(name)
        except KeyError:
            self.doc.warnings.append('รูปอ้างไฟล์ที่ไม่มีในเอกสาร (%s)' % target)
            return None
        ext = name.rsplit('.', 1)[-1].lower()
        file = '%s-%s' % (self.doc.form_id, os.path.basename(name))
        if ext == 'emf':
            # เบราว์เซอร์แสดง EMF ไม่ได้ ดึงภาพบิตแมปที่ฝังใน EMF ออกมาเป็น BMP โดยไม่แปลงค่าพิกเซล
            bmp = emf_bitmap(data)
            if bmp is None:
                self.doc.warnings.append('EMF ไม่มีบิตแมปฝัง (%s)' % target)
                return None
            data, ext = bmp, 'bmp'
            file = file.rsplit('.', 1)[0] + '.bmp'
        self.doc.media[file] = data
        return {'file': file, 'ext': ext}

    def blocks(self, body):
        out = []
        for el in body:
            if el.tag == q('w:p'):
                out.append(self.paragraph(el))
            elif el.tag == q('w:tbl'):
                self.doc.warnings.append('พบตาราง ยังไม่รองรับ')
            elif el.tag == q('w:sdt'):
                content = el.find('w:sdtContent', NS)
                if content is not None:
                    out.extend(self.blocks(content))
        return out

    def paragraph(self, el):
        d = self.doc
        ppr_el = el.find('w:pPr', NS)
        style_id = wval(ppr_el.find('w:pStyle', NS)) if ppr_el is not None else None
        style_id = style_id or d.default_pstyle
        sp, sr = d.style_props(style_id) if style_id else ({}, {})
        p = d.ppr(ppr_el, dict(d.default_ppr, **sp))
        base_r = dict(d.default_rpr, **sr)
        runs = []
        floats = []
        rendered_break = False
        num = p.get('_num')
        if num and num[0] not in (None, '0'):
            info = d.num_label(num[0], num[1])
            if info:
                for k, v in info['ppr'].items():
                    if k in ('l', 'fl', 'tabs') and k not in (ppr_el is not None and d.ppr(ppr_el, {}) or {}):
                        p[k] = v
                mark_r = dict(base_r, **info['rpr'])
                if ppr_el is not None:
                    mark_r = d.rpr(ppr_el.find('w:rPr', NS), mark_r)
                runs.append(dict(clean_run(mark_r), t=info['label']))
                if info['suff'] == 'tab':
                    runs.append({'tab': 1})
                elif info['suff'] == 'space':
                    runs.append(dict(clean_run(mark_r), t=' '))
        state = {'field': 0}

        def walk(node, rbase):
            nonlocal rendered_break
            for child in node:
                tag = child.tag
                if tag == q('w:r'):
                    run(child, rbase)
                elif tag in (q('w:hyperlink'), q('w:smartTag'), q('w:ins'), q('w:customXml'), q('w:fldSimple')):
                    if tag == q('w:fldSimple') and 'PAGE' in (child.get(W + 'instr') or ''):
                        runs.append(dict(clean_run(rbase), page=1))
                        continue
                    walk(child, rbase)
                elif tag == q('w:sdt'):
                    c = child.find('w:sdtContent', NS)
                    if c is not None:
                        walk(c, rbase)
                elif tag == q('mc:AlternateContent'):
                    fb = child.find('mc:Fallback', NS)
                    ch = child.find('mc:Choice', NS)
                    walk(fb if fb is not None else ch, rbase)

        def run(rel, rbase):
            nonlocal rendered_break
            r_el = rel.find('w:rPr', NS)
            rstyle = wval(r_el.find('w:rStyle', NS)) if r_el is not None else None
            rb = dict(rbase)
            if rstyle:
                rb.update(d.style_props(rstyle)[1])
            r = d.rpr(r_el, rb)
            if r.get('hidden'):
                return
            for c in rel:
                tag = c.tag
                if tag == q('w:fldChar'):
                    kind = c.get(W + 'fldCharType')
                    if kind == 'begin':
                        state['field'] = 1
                        state['instr'] = ''
                    elif kind == 'separate':
                        if 'PAGE' in state.get('instr', ''):
                            runs.append(dict(clean_run(r), page=1))
                        state['field'] = 2
                    elif kind == 'end':
                        state['field'] = 0
                    continue
                if tag == q('w:instrText'):
                    state['instr'] = state.get('instr', '') + (c.text or '')
                    continue
                if state['field'] == 1:
                    continue
                if state['field'] == 2 and 'PAGE' in state.get('instr', ''):
                    continue
                if tag == q('w:t'):
                    text = c.text or ''
                    if r.get('caps'):
                        text = text.upper()
                    if runs and 't' in runs[-1] and 'page' not in runs[-1] and \
                            {k: v for k, v in runs[-1].items() if k != 't'} == clean_run(r):
                        runs[-1]['t'] += text
                    else:
                        runs.append(dict(clean_run(r), t=text))
                elif tag == q('w:tab') or tag == q('w:ptab'):
                    runs.append(dict({k: v for k, v in clean_run(r).items() if k in ('u', 'sz')}, tab=1))
                elif tag in (q('w:br'), q('w:cr')):
                    if c.get(W + 'type') == 'page':
                        runs.append({'pagebreak': 1})
                    else:
                        runs.append({'br': 1})
                elif tag == q('w:noBreakHyphen'):
                    runs.append(dict(clean_run(r), t='‑'))
                elif tag == q('w:sym'):
                    ch = c.get(W + 'char')
                    runs.append(dict(clean_run(r), t=chr(int(ch, 16) & 0xFFFF if int(ch, 16) < 0xF000 else int(ch, 16) - 0xF000)))
                elif tag == q('w:lastRenderedPageBreak'):
                    if not runs or all(('anchor' in x) for x in runs):
                        rendered_break = True
                    else:
                        runs.append({'rendered': 1})
                elif tag == q('w:drawing'):
                    self.drawing(c, floats, runs)
                elif tag == q('w:pict') or tag == q('w:object'):
                    self.vml(c, floats, runs)
                elif tag == q('mc:AlternateContent'):
                    fb = c.find('mc:Fallback', NS)
                    if fb is not None:
                        for sub in fb:
                            if sub.tag == q('w:pict'):
                                self.vml(sub, floats, runs)
                            elif sub.tag == q('w:drawing'):
                                self.drawing(sub, floats, runs)

        walk(el, d.rpr(None, base_r))
        mark_rpr = d.rpr(ppr_el.find('w:rPr', NS), dict(base_r)) if ppr_el is not None else base_r
        block = dict(clean_para(p), k='p', runs=runs, mark=clean_run(mark_rpr))
        if 'sz' not in block['mark'] and base_r.get('sz'):
            block['mark']['sz'] = base_r['sz']
        if floats:
            block['floats'] = floats
        if rendered_break:
            block['rendered'] = True
        return block

    def drawing(self, el, floats, runs):
        anchor = el.find('wp:anchor', NS)
        inline = el.find('wp:inline', NS)
        node = anchor if anchor is not None else inline
        if node is None:
            return
        ext = node.find('wp:extent', NS)
        w, h = emu(ext.get('cx')), emu(ext.get('cy'))
        blip = node.find('.//a:blip', NS)
        img = self.media(blip.get('{%s}embed' % NS['r'])) if blip is not None else None
        if img is None:
            txbx = node.find('.//wps:txbx', NS)
            if txbx is not None:
                self.doc.warnings.append('พบ text box แบบ DrawingML ใช้ fallback VML')
            return
        if inline is not None:
            runs.append({'img': img['file'], 'w': w, 'h': h})
            return
        ph = anchor.find('wp:positionH', NS)
        pv = anchor.find('wp:positionV', NS)

        def pos(p):
            off = p.find('wp:posOffset', NS)
            al = p.find('wp:align', NS)
            return {'from': p.get('relativeFrom'), 'off': emu(off.text) if off is not None else 0,
                    'align': al.text if al is not None else None}

        floats.append({'type': 'img', 'img': img['file'], 'w': w, 'h': h, 'x': pos(ph), 'y': pos(pv),
                       'behind': anchor.get('behindDoc') == '1'})

    def vml(self, el, floats, runs):
        for shape in el:
            tag = shape.tag.split('}')[1]
            style = parse_style(shape.get('style'))
            if tag == 'line':
                fx, fy = [css_len(v) for v in shape.get('from', '0,0').split(',')]
                tx, ty = [css_len(v) for v in shape.get('to', '0,0').split(',')]
                stroke = shape.find('v:stroke', NS)
                dash = stroke.get('dashstyle') if stroke is not None else None
                floats.append({'type': 'line', 'x1': fx, 'y1': fy, 'x2': tx, 'y2': ty,
                               'dash': dash or 'solid', 'weight': css_len(shape.get('strokeweight') or '0.75pt'),
                               'xFrom': style.get('mso-position-horizontal-relative', 'text'),
                               'yFrom': style.get('mso-position-vertical-relative', 'text')})
                continue
            if tag not in ('shape', 'rect', 'roundrect'):
                continue
            imagedata = shape.find('v:imagedata', NS)
            box = {'x': css_len(style.get('margin-left') or style.get('left')),
                   'y': css_len(style.get('margin-top') or style.get('top')),
                   'w': css_len(style.get('width')), 'h': css_len(style.get('height')),
                   'xFrom': style.get('mso-position-horizontal-relative', 'text'),
                   'yFrom': style.get('mso-position-vertical-relative', 'text')}
            if style.get('z-index', '0').lstrip('-').isdigit() and style.get('z-index', '0').startswith('-'):
                box['behind'] = True
            inline = style.get('position') != 'absolute'
            if imagedata is not None:
                img = self.media(imagedata.get('{%s}id' % NS['r']))
                if img:
                    if inline:
                        runs.append({'img': img['file'], 'w': box['w'], 'h': box['h']})
                    else:
                        floats.append(dict(box, type='img', img=img['file']))
                continue
            textbox = shape.find('v:textbox', NS)
            if textbox is not None:
                content = textbox.find('w:txbxContent', NS)
                inset = [css_len(x) for x in (textbox.get('inset') or '7.2pt,3.6pt,7.2pt,3.6pt').split(',')]
                while len(inset) < 4:
                    inset.append([7.2, 3.6, 7.2, 3.6][len(inset)])
                stroked = shape.get('stroked') != 'f' and shape.get('strokecolor') not in ('white', '#ffffff', 'white [3212]')
                floats.append(dict(box, type='textbox', inset=inset, stroke=stroked,
                                   blocks=self.blocks(content) if content is not None else []))
                continue
            fill = (shape.get('fillcolor') or '').split(' ')[0]
            if tag == 'rect' and fill in ('white', '#ffffff', '#fff'):
                # แผ่นสีขาวสำหรับบังพื้นที่ในต้นฉบับ ไม่มีข้อความ จึงไม่ต้องจำลอง
                continue
            self.doc.warnings.append('VML %s ที่ไม่รองรับ' % tag)


# ค่าที่ตัวแปลง .doc → .docx ทำหาย ตรวจจาก sprm ของไฟล์ .doc ต้นฉบับโดยตรง
# หนังสือแจ้งเจ้าของสำนวน: sprmSDyaTop = -1702 (ขอบบนแบบ "ตรงตามค่า" 3 ซม. ข้อความวางทับเส้นหัวบันทึก)
PAGE_FIXES = {
    'case-owner-notice': {'top': 85.1, 'topExact': True},
}


def convert(form_id, path):
    doc = Doc(path, form_id)
    root = doc._xml('word/document.xml')
    body = root.find('w:body', NS)
    conv = Converter(doc)
    blocks = conv.blocks(body)
    sect = body.find('w:sectPr', NS)
    pg = sect.find('w:pgSz', NS)
    mar = sect.find('w:pgMar', NS)
    page = {
        'w': twip(pg.get(W + 'w')), 'h': twip(pg.get(W + 'h')),
        'orient': pg.get(W + 'orient') or 'portrait',
        'top': twip(mar.get(W + 'top')), 'right': twip(mar.get(W + 'right')),
        'bottom': twip(mar.get(W + 'bottom')), 'left': twip(mar.get(W + 'left')),
        'header': twip(mar.get(W + 'header')), 'footer': twip(mar.get(W + 'footer')),
    }
    num_type = sect.find('w:pgNumType', NS)
    page['numFmt'] = num_type.get(W + 'fmt') if num_type is not None and num_type.get(W + 'fmt') else 'decimal'
    page['titlePg'] = sect.find('w:titlePg', NS) is not None
    if mar.get(W + 'top', '0').startswith('-'):
        page['top'], page['topExact'] = -page['top'], True
    page.update(PAGE_FIXES.get(form_id, {}))
    headers = {}
    for kind in ('headerReference', 'footerReference'):
        for ref in sect.findall('w:' + kind, NS):
            target = doc.rels.get(ref.get('{%s}id' % NS['r']))
            part = 'word/' + target
            hconv = Converter(doc, part)
            hblocks = hconv.blocks(doc._xml(part))
            if any(b['runs'] or b.get('floats') for b in hblocks):
                headers['%s-%s' % (kind[:6], ref.get(W + 'type'))] = hblocks
    try:
        app = ET.fromstring(doc.zip.read('docProps/app.xml'))
        pages = app.find('{http://schemas.openxmlformats.org/officeDocument/2006/extended-properties}Pages')
        page['wordPages'] = int(pages.text) if pages is not None else None
    except KeyError:
        page['wordPages'] = None
    return {'id': form_id, 'page': page, 'headers': headers, 'blocks': blocks}, doc


def text_of(block):
    return ''.join(r.get('t', '\t' if r.get('tab') else '\n' if r.get('br') else '') for r in block['runs'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--doc-docx', action='append', default=[], help='form-id=path.docx สำหรับต้นฉบับ .doc')
    ap.add_argument('--dump', help='โฟลเดอร์สำหรับเขียนข้อความพร้อมเลขย่อหน้าเพื่อตรวจ')
    args = ap.parse_args()
    overrides = dict(x.split('=', 1) for x in args.doc_docx)
    forms = json.load(open(os.path.join(ROOT, 'src/lib/additionalForms.data.json'), encoding='utf-8'))
    out = {}
    os.makedirs(MEDIA_OUT, exist_ok=True)
    for form in forms:
        fid = form['id']
        path = overrides.get(fid) or os.path.join(ROOT, 'public', form['sourceUrl'].lstrip('/'))
        if not path.endswith('.docx'):
            print('ข้าม %s: ต้องส่ง --doc-docx %s=<ไฟล์ .docx ที่แปลงจาก .doc>' % (fid, fid), file=sys.stderr)
            continue
        layout, doc = convert(fid, path)
        out[fid] = layout
        for name, data in doc.media.items():
            with open(os.path.join(MEDIA_OUT, name), 'wb') as fh:
                fh.write(data)
        for w in sorted(set(doc.warnings)):
            print('%s: %s' % (fid, w), file=sys.stderr)
        if args.dump:
            os.makedirs(args.dump, exist_ok=True)
            with open(os.path.join(args.dump, fid + '.txt'), 'w', encoding='utf-8') as fh:
                fh.write(json.dumps(layout['page'], ensure_ascii=False) + '\n')
                for hk, hb in layout['headers'].items():
                    for b in hb:
                        fh.write('  {%s} %s %r\n' % (hk, json.dumps({k: v for k, v in b.items() if k not in ('runs', 'k')}, ensure_ascii=False), text_of(b)))
                for i, b in enumerate(layout['blocks']):
                    props = {k: v for k, v in b.items() if k not in ('runs', 'floats', 'k')}
                    fh.write('[%d]%s %s\n    %r\n' % (i, ' <RB>' if b.get('rendered') else '', json.dumps(props, ensure_ascii=False), text_of(b)))
                    for f in b.get('floats', []):
                        if f['type'] == 'textbox':
                            fh.write('    TEXTBOX %s\n' % json.dumps({k: v for k, v in f.items() if k != 'blocks'}, ensure_ascii=False))
                            for tb in f['blocks']:
                                fh.write('      | %r\n' % text_of(tb))
                        else:
                            fh.write('    FLOAT %s\n' % json.dumps(f, ensure_ascii=False))
    previous = {}
    if os.path.exists(OUT):
        previous = json.load(open(OUT, encoding='utf-8'))
    previous.update(out)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(previous, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    print('เขียน %s (%d แบบ)' % (os.path.relpath(OUT, ROOT), len(previous)))


if __name__ == '__main__':
    main()
