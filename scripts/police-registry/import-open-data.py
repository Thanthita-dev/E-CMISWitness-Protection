"""Import two verified official open datasets; explicitly NOT a national registry."""
import csv, hashlib, io, json, urllib.request
from pathlib import Path
sources = [
 {'id': 'bma', 'url': 'https://data.bangkok.go.th/dataset/2eeda85a-084c-462b-8686-24dbf85b9e03/resource/bf771314-9841-4a23-8bb4-5d0f7866fa41/download/police.csv', 'publisher': 'กรุงเทพมหานคร'},
 {'id': 'nonthaburi', 'url': 'https://nonthaburi.gdcatalog.go.th/dataset/ad5c0248-eb8e-4311-9380-0127cc13cbff/resource/245b4dcc-dcda-4d13-8700-5c9850ecb030/download/untitled.csv', 'publisher': 'สำนักงานตำรวจแห่งชาติ / ระบบบัญชีข้อมูลจังหวัดนนทบุรี'},
]
rows = []
for source in sources:
 raw = urllib.request.urlopen(source['url'], timeout=30).read()
 source['sha256'] = hashlib.sha256(raw).hexdigest()
 records = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
 if source['id'] == 'bma':
  for r in records:
   name = r['NAME'].strip()
   # Preserve source spelling, including two source inconsistencies; only derive search abbreviation.
   short = name.replace('ตํารวจ', 'ตำรวจ').replace('สถานีตำรวจนครบาล', '').replace('สถานีตำรวจนคร', '')
   rows.append({'id': 'bma-' + r['POLICE_ID'], 'name': name, 'shortName': 'สน.' + short, 'province': 'กรุงเทพมหานคร', 'source': source['id']})
 else:
  seen = set()
  for r in sorted(records, key=lambda r: int(r['ปี']), reverse=True):
   name = r['สถานีตำรวจ'].strip()
   if name in seen: continue
   seen.add(name)
   rows.append({'id': 'nonthaburi-' + hashlib.sha256(name.encode()).hexdigest()[:12], 'name': 'สถานีตำรวจภูธร' + name, 'shortName': 'สภ.' + name, 'province': r['จังหวัด'].strip(), 'source': source['id']})
province_source = 'https://gdcatalog.go.th/api/3/action/organization_list?all_fields=true&limit=1000'
orgs = json.load(urllib.request.urlopen(province_source))['result']
provinces = {o['title'][7:].strip() for o in orgs if o['title'].startswith('จังหวัด')}
provinces.discard('ส่วนกลาง')
provinces.add('กรุงเทพมหานคร')
assert len(provinces) == 77
assert len(rows) == 99 and len({r['id'] for r in rows}) == 99
assert any(r['shortName'] == 'สภ.ปากเกร็ด' for r in rows)
output = {'coverage': 'partial', 'importedAt': '2026-10-08', 'provinceSource': province_source, 'sources': sources, 'provinces': sorted(provinces), 'stations': sorted(rows, key=lambda r: (r['province'], r['shortName']))}
path = Path(__file__).resolve().parents[2] / 'src/data/police-stations.json'
path.parent.mkdir(exist_ok=True)
path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print('Imported 99 verified source records in 2 provinces; nationwide coverage remains incomplete.')
