"""js/data.js의 물건·근무일 표를 랭킹 서버(Code.gs)에 똑같이 옮긴다.
data.js를 고친 뒤 실행: python tools/ranking/sync.py  → 바뀌었으면 Code.gs를 Apps Script에 다시 붙여 넣는다.
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parents[2]
data = (root / 'js' / 'data.js').read_text(encoding='utf-8')
gs_path = root / 'tools' / 'ranking' / 'Code.gs'
gs = gs_path.read_text(encoding='utf-8')

items_src = data[data.index('export const ITEMS'):data.index('};', data.index('export const ITEMS'))]
items = []
for m in re.finditer(r"^\s*(\w+): \{(.*)\},?\s*$", items_src, re.M):
    key, body = m.group(1), m.group(2)
    d = re.search(r"d: \[(\d+), (\d+), (\d+)\]", body)
    flags = ''.join(f", {f}: 1" for f in ('fragile', 'cold', 'up') if re.search(rf"\b{f}: true", body))
    sheet = re.search(r"sheet: (\d+)", body).group(1)
    items.append(f"  {key}: {{ d: [{d.group(1)}, {d.group(2)}, {d.group(3)}], s: {sheet}{flags} }},")

days_src = data[data.index('export const DAYS'):data.index('export function dayConfig')]
days = []
for m in re.finditer(r"items: (\[[^\]]*\]), time: (\d+), every: (\d+), patience: \d+, target: (\d+)(, sketch: (\d+))?", days_src):
    sk = f", sketch: {m.group(6)}" if m.group(6) else ''
    days.append(f"  {{ items: {m.group(1)}, time: {m.group(2)}, every: {m.group(3)}, target: {m.group(4)}{sk} }},")

cost = re.search(r"export const COST = (\{[^}]*\});", data).group(1)

block = ("var ITEMS = {\n" + "\n".join(items) + "\n};\nvar DAYS = [\n" + "\n".join(days) + "\n];\nvar COST = " + cost + ";")
new = re.sub(r"var ITEMS = \{.*?\nvar COST = \{[^}]*\};", lambda _: block, gs, flags=re.S)
# 오늘의 계약
con = re.search(r"export const CONTRACTS = (\[.*?\n\]);", data, re.S).group(1)
rate = re.search(r"export const CONTRACT_RATE = (\[[^\]]*\]);", data).group(1)
frm = re.search(r"export const CONTRACT_FROM = (\d+);", data).group(1)
new = re.sub(r"var CONTRACTS = \[.*?\n\];\nvar CONTRACT_RATE = \[[^\]]*\], CONTRACT_FROM = \d+;", lambda _: f"var CONTRACTS = {con};\nvar CONTRACT_RATE = {rate}, CONTRACT_FROM = {frm};", new, flags=re.S)
# 닉네임 단어 (js/nickwords.js)
import json
nw = (root / 'js' / 'nickwords.js').read_text(encoding='utf-8')
words = {k: re.findall(r"'([^']*)'", body) for k, body in re.findall(r"^\s*(color|like|mood|who): \[(.*?)\]", nw, re.S | re.M)}
assert set(words) == {'color', 'like', 'mood', 'who'}, words.keys()
nick_block = 'var NICK_WORDS = ' + json.dumps(words, ensure_ascii=False) + ';'
new = re.sub(r"var NICK_WORDS = \{.*?\};", lambda _: nick_block, new, count=1, flags=re.S)
if new != gs:
    gs_path.write_text(new, encoding='utf-8')
    print(f'Code.gs를 고쳤어요 (물건 {len(items)}개, 근무일 {len(days)}일, 닉네임 단어 {sum(map(len, words.values()))}개). Apps Script에 다시 붙여 넣어 주세요.')
else:
    print(f'Code.gs가 이미 data.js와 같아요 (물건 {len(items)}개, 근무일 {len(days)}일).')
