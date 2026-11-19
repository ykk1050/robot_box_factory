// 반 랭킹: 선생님 구글 시트(Apps Script 웹 앱)와 주고받는다.
// 연결 방법은 tools/ranking/연결방법.md. 웹 앱 주소를 아래 RANK_URL에 넣으면 랭킹이 켜진다.
export const RANK_URL = 'https://script.google.com/macros/s/AKfycbz2XqmcRuvearCO1u3CpAkBkCfcOUecudbxLuJUYVgBfXUFPZSZOhUCzwNVd7sdpszGyw/exec';

// 반을 나누지 않고 모두 한 랭킹에서 겨룬다(서버의 반 칸에는 늘 이 값이 들어간다)
export const RANK_ALL = '전체';

// 점검 봇(?test=1)으로 돌릴 때는 랭킹에 올리지 않는다
export const TEST = new URLSearchParams(location.search).has('test');
export const rankOn = () => !!RANK_URL && !TEST;

export const CATS = [
  { id: 'day', name: '📅 일차별 매출', unit: (v) => `₩${v.toLocaleString('ko-KR')}` },
  { id: 'combo', name: '📐 최고 콤보', unit: (v) => `콤보 ${v}` },
  { id: 'perfect', name: '✨ 완벽한 상자', unit: (v) => `${v}개` },
  { id: 'nets', name: '🧩 전개도 수집', unit: (v) => `${v}/11가지` },
  { id: 'reach', name: '🚚 최고 도달 일차', unit: (v) => `${v}일차` },
];

export async function call(q, ms = 15000) {
  if (!RANK_URL) return { ok: false, msg: '선생님이 랭킹을 아직 연결하지 않았어요.' };
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`${RANK_URL}?q=${encodeURIComponent(JSON.stringify(q))}`, { signal: ctl.signal });
    return await r.json();
  } catch (_) {
    return { ok: false, msg: '인터넷 연결이 안 돼서 랭킹 서버와 이야기하지 못했어요.' };
  } finally { clearTimeout(tm); }
}
