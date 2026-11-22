// Vercel 서버 함수: AI 비서 ("오늘 일정 뭐야?" 같은 질문에 내 데이터로 답변)
// POST /api/assistant  body: { messages: [{role:'user'|'model', text}], today: 'YYYY-MM-DD', tzOffset: number(분, Date.getTimezoneOffset) }
// 필요 환경변수: GEMINI_API_KEY (시간표 인식과 같은 키)
//
// 사용자의 로그인 토큰으로 Supabase 를 조회하므로 RLS 가 그대로 적용됨 → 본인이 볼 수 있는 데이터만 AI 에 전달
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { describeGeminiError, generateText, TimeoutError } from './_gemini';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://vrezbqnabniscsoqkpqi.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_J70LKgYpqJFL0m51CQJjVg_xM673hHz';
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

// ---------------------------------------------------------------- 날짜 (사용자 기기 시간대 기준)
const pad = (n: number) => String(n).padStart(2, '0');
function addDaysKey(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
function weekdayOfKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function labelKey(key: string) {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}(${DAYS[weekdayOfKey(key)]})`;
}
const hm = (min: number) => `${Math.floor(min / 60)}:${pad(min % 60)}`;
/** UTC ISO → 사용자 현지 { key, min } */
function toLocal(iso: string, tzOffset: number) {
  const t = new Date(new Date(iso).getTime() - tzOffset * 60_000);
  return { key: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`, min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}
/** 사용자 현지 날짜 0시 → UTC ISO */
function localKeyToIso(key: string, tzOffset: number) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + tzOffset * 60_000).toISOString();
}

// ---------------------------------------------------------------- 내 데이터 → 텍스트
const PLATFORM: Record<string, string> = { zoom: 'Zoom', kakao: '카카오톡', facetime: '페이스타임', meet: 'Google Meet', discord: 'Discord', other: '기타' };

async function buildContext(sb: SupabaseClient, userId: string, today: string, tzOffset: number): Promise<string> {
  const from = addDaysKey(today, -1);
  const to = addDaysKey(today, 14);
  const fromIso = localKeyToIso(from, tzOffset);
  const toIso = localKeyToIso(addDaysKey(to, 1), tzOffset);

  const [profile, teams, events, entries, exceptions, personal, tasks, polls, posts, reads, diary] = await Promise.all([
    sb.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
    sb.from('teams').select('id, name, course_name'),
    sb.from('events').select('*').lt('starts_at', toIso).gte('ends_at', fromIso).order('starts_at'),
    sb.from('timetable_entries').select('id, day_of_week, start_min, end_min, title, location'),
    sb.from('timetable_exceptions').select('entry_id, exception_date').gte('exception_date', from).lte('exception_date', to),
    sb.from('personal_events').select('event_date, start_min, end_min, title, location').gte('event_date', from).lte('event_date', to),
    sb.from('tasks').select('team_id, title, assignee_id, due_date, status').neq('status', 'done').limit(80),
    sb.from('polls').select('team_id, title, dates, closed').eq('closed', false).limit(20),
    sb.from('team_posts').select('id, team_id, kind, title, content, pinned, meeting_date, created_by, created_at').order('created_at', { ascending: false }).limit(15),
    sb.from('post_reads').select('post_id').eq('user_id', userId),
    sb.from('diary_todos').select('title, done').eq('entry_date', today),
  ]);

  const teamRows = (teams.data ?? []) as { id: string; name: string; course_name?: string }[];
  const teamName = new Map(teamRows.map((t) => [t.id, t.course_name ? `${t.name}(${t.course_name})` : t.name]));

  // 팀원 이름 (할 일 담당자 표시용)
  const members = await sb.from('team_members').select('user_id');
  const ids = Array.from(new Set(((members.data ?? []) as { user_id: string }[]).map((m) => m.user_id)));
  const profiles = ids.length ? await sb.from('profiles').select('id, display_name').in('id', ids) : { data: [] };
  const nameOf = new Map(((profiles.data ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]));
  const who = (id: string | null) => (!id ? '미지정' : id === userId ? '나' : nameOf.get(id) ?? '팀원');

  const lines: string[] = [];
  lines.push(`사용자 이름: ${(profile.data as { display_name?: string } | null)?.display_name ?? ''}`);
  lines.push(`오늘: ${labelKey(today)} (${today}), 내일: ${labelKey(addDaysKey(today, 1))}`);
  lines.push(`내 팀: ${teamRows.map((t) => teamName.get(t.id)).join(', ') || '없음'}`);

  // 팀 일정
  lines.push('', '## 팀 일정 (어제~2주 뒤)');
  const evs = (events.data ?? []) as {
    team_id: string; title: string; starts_at: string; ends_at: string; location: string; description: string;
    meeting_type: string | null; online_platform: string; meeting_link: string;
  }[];
  if (evs.length === 0) lines.push('- 없음');
  for (const e of evs) {
    const s = toLocal(e.starts_at, tzOffset);
    const en = toLocal(e.ends_at, tzOffset);
    const how =
      e.meeting_type === 'offline' ? `오프라인${e.location ? ` @${e.location}` : ''}`
      : e.meeting_type === 'online' ? `온라인 ${PLATFORM[e.online_platform] ?? ''}${e.meeting_link ? ` ${e.meeting_link}` : ''}`
      : e.location ? `장소 ${e.location}` : '';
    lines.push(`- ${labelKey(s.key)} ${hm(s.min)}~${s.key === en.key ? hm(en.min) : `${labelKey(en.key)} ${hm(en.min)}`} [${teamName.get(e.team_id) ?? '팀'}] ${e.title}${how ? ` (${how})` : ''}${e.description ? ` / 메모: ${e.description.slice(0, 80)}` : ''}`);
  }

  // 내 시간표 → 날짜별로 펼침 (휴강 제외) + 개인 일정
  const cancelled = new Set(((exceptions.data ?? []) as { entry_id: string; exception_date: string }[]).map((x) => `${x.entry_id}|${x.exception_date}`));
  const ents = (entries.data ?? []) as { id: string; day_of_week: number; start_min: number; end_min: number; title: string; location: string }[];
  const pers = (personal.data ?? []) as { event_date: string; start_min: number; end_min: number; title: string; location: string }[];
  lines.push('', '## 내 수업·개인 일정 (오늘~1주, 휴강 반영)');
  for (let i = 0; i <= 7; i++) {
    const key = addDaysKey(today, i);
    const dow = weekdayOfKey(key);
    const items = [
      ...ents.filter((e) => e.day_of_week === dow).map((e) => ({
        start: e.start_min,
        text: cancelled.has(`${e.id}|${key}`) ? `${hm(e.start_min)}~${hm(e.end_min)} ${e.title} (휴강)` : `${hm(e.start_min)}~${hm(e.end_min)} 수업 ${e.title}${e.location ? ` @${e.location}` : ''}`,
      })),
      ...pers.filter((p) => p.event_date === key).map((p) => ({ start: p.start_min, text: `${hm(p.start_min)}~${hm(p.end_min)} 개인 일정 ${p.title}${p.location ? ` @${p.location}` : ''}` })),
    ].sort((a, b) => a.start - b.start);
    lines.push(`- ${labelKey(key)}: ${items.length ? items.map((x) => x.text).join(' / ') : '없음'}`);
  }

  // 할 일
  lines.push('', '## 끝나지 않은 할 일');
  const tks = (tasks.data ?? []) as { team_id: string; title: string; assignee_id: string | null; due_date: string | null; status: string }[];
  if (tks.length === 0) lines.push('- 없음');
  for (const t of tks.sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))) {
    lines.push(`- [${teamName.get(t.team_id) ?? '팀'}] ${t.title} / 담당: ${who(t.assignee_id)} / 마감: ${t.due_date ? labelKey(t.due_date) : '없음'} / ${t.status === 'doing' ? '진행 중' : '할 일'}`);
  }

  // 투표
  const pls = (polls.data ?? []) as { team_id: string; title: string; dates: string[] }[];
  if (pls.length) {
    lines.push('', '## 진행 중인 시간 투표');
    for (const p of pls) lines.push(`- [${teamName.get(p.team_id) ?? '팀'}] ${p.title} (후보 ${p.dates.map(labelKey).join(', ')})`);
  }

  // 공지
  const readSet = new Set(((reads.data ?? []) as { post_id: string }[]).map((r) => r.post_id));
  const pst = (posts.data ?? []) as { id: string; team_id: string; kind: string; title: string; content: string; pinned: boolean; created_by: string | null; created_at: string }[];
  if (pst.length) {
    lines.push('', '## 최근 공지·회의록 (최신순)');
    for (const p of pst) {
      const unread = !readSet.has(p.id) && p.created_by !== userId;
      lines.push(`- [${teamName.get(p.team_id) ?? '팀'}] ${p.kind === 'minutes' ? '회의록' : '공지'}${p.pinned ? '(고정)' : ''}${unread ? '(안 읽음)' : ''} "${p.title}" ${labelKey(toLocal(p.created_at, tzOffset).key)}: ${p.content.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  }

  // 다이어리
  const todos = (diary.data ?? []) as { title: string; done: boolean }[];
  lines.push('', `## 오늘 다이어리 할 일: ${todos.length ? todos.map((t) => `${t.done ? '✓' : '□'} ${t.title}`).join(', ') : '없음'}`);

  return lines.join('\n');
}

const SYSTEM = `너는 대학생 팀 프로젝트 앱 "팀플모임"의 AI 비서야.
아래 [내 데이터]만 근거로 사용자의 질문에 한국어로 답해.
- 데이터에 없는 일정·할 일을 지어내지 마. 모르면 "앱에 등록된 정보로는 확인되지 않아요"라고 말해.
- 시간은 "오후 3시" 처럼 읽기 쉽게, 날짜는 "11/24(월)"처럼 써.
- 짧고 친근하게. 목록이 필요하면 "-" 글머리표를 써. 마크다운 제목(#)이나 표는 쓰지 마.
- 일정 추가·수정 같은 작업은 직접 할 수 없으니, 앱의 어느 화면에서 하면 되는지 안내해.
  (팀 일정: 팀 → 캘린더 +, 시간표·개인 일정: 시간표 탭, 할 일: 팀 → 할 일, 공지: 팀 → 공지)`;

// ---------------------------------------------------------------- Gemini
type Msg = { role: 'user' | 'model'; text: string };

function ask(apiKey: string, context: string, messages: Msg[]): Promise<string> {
  return generateText(
    apiKey,
    {
      contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      config: { systemInstruction: `${SYSTEM}

[내 데이터]
${context}` },
    },
    { tag: 'assistant', budgetMs: 50_000 },
  );
}

// ---------------------------------------------------------------- 핸들러
export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: '서버에 GEMINI_API_KEY 가 설정되지 않았어요.' }, 500);

  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: '로그인이 필요해요.' }, 401);
  // 사용자 토큰으로 조회 → RLS 적용
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser(auth.slice(7));
  if (userErr || !userData.user) return json({ error: '로그인이 필요해요.' }, 401);

  let body: { messages?: unknown; today?: unknown; tzOffset?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: '잘못된 요청이에요.' }, 400);
  }
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const tzOffset = typeof body.tzOffset === 'number' && Math.abs(body.tzOffset) <= 840 ? body.tzOffset : -540; // 기본 한국
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m): m is Msg => !!m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string')
    .slice(-10)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') return json({ error: '질문을 입력해주세요.' }, 400);

  try {
    const context = await buildContext(sb, userData.user.id, today, tzOffset);
    const reply = await ask(apiKey, context, messages);
    return json({ reply: reply.trim() || '답변을 만들지 못했어요. 다시 물어봐 주세요.' });
  } catch (err) {
    if (err instanceof TimeoutError) return json({ error: 'AI 응답이 너무 오래 걸렸어요. 잠시 후 다시 시도해주세요.' }, 504);
    console.error('[assistant]', err);
    const { status, message } = describeGeminiError(err);
    if (status === 429) return json({ error: '오늘 무료 사용량을 다 썼거나 요청이 많아요. 잠시 후 다시 시도해주세요.' }, 429);
    if (status === 503 || status === 500) {
      return json({ error: '지금 구글 AI가 많이 붐벼요 (여러 모델을 시도했지만 모두 혼잡). 1~2분 뒤 다시 물어봐 주세요.' }, 503);
    }
    if (status === 401 || status === 403 || /API key/i.test(message ?? '')) {
      // 키가 있어도 권한·모델·지역 문제로 거절될 수 있어 구글의 실제 이유를 함께 보여줌
      return json({ error: `Gemini 가 요청을 거절했어요${status ? ` (${status})` : ''}: ${message ?? '이유 없음'}` }, 502);
    }
    return json({ error: `AI 서버 오류${status ? ` (${status})` : ''}: ${message ?? '알 수 없는 오류'}` }, 502);
  }
}
