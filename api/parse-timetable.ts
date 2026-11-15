// Vercel 서버 함수: 시간표 이미지(에브리타임 캡처 등) → 시간표 항목 JSON
// POST /api/parse-timetable   body: { image: base64, mediaType: "image/jpeg" | "image/png" | ... }
// 필요 환경변수 (Vercel > Settings > Environment Variables): ANTHROPIC_API_KEY
import Anthropic from '@anthropic-ai/sdk';
import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema';

// 공개 값 (앱의 .env 와 동일). 로그인한 사용자만 이 API 를 쓰도록 토큰 확인에 사용
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://vrezbqnabniscsoqkpqi.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_J70LKgYpqJFL0m51CQJjVg_xM673hHz';

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type MediaType = (typeof MEDIA_TYPES)[number];
const MAX_BASE64_LENGTH = 4_000_000; // Vercel 요청 본문 한도(4.5MB) 안쪽

const SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day_of_week: { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6], description: '0=일 1=월 2=화 3=수 4=목 5=금 6=토' },
          start: { type: 'string', description: '24시간제 HH:MM (예: 13:30)' },
          end: { type: 'string', description: '24시간제 HH:MM (예: 14:45)' },
          title: { type: 'string', description: '과목명/일정 이름' },
          location: { type: 'string', description: '강의실 등 장소. 없으면 빈 문자열' },
        },
        required: ['day_of_week', 'start', 'end', 'title', 'location'],
        additionalProperties: false,
      },
    },
    warning: { type: 'string', description: '시간표 이미지가 아니거나 읽기 어려운 부분이 있으면 그 설명. 없으면 빈 문자열' },
  },
  required: ['entries', 'warning'],
  additionalProperties: false,
} as const;

const PROMPT = `이 이미지는 대학생의 주간 시간표 캡처입니다(주로 '에브리타임' 앱).
시간표에 있는 모든 수업/일정 블록을 빠짐없이 추출하세요.

읽는 방법:
- 열은 요일(월 화 수 목 금, 있으면 토 일), 왼쪽 숫자는 시각입니다.
- 에브리타임은 오후 시각을 1, 2, 3 ... 처럼 12시간제로 표시합니다. 9, 10, 11, 12 다음의 1은 13시입니다. 결과는 반드시 24시간제로 쓰세요.
- 각 색깔 블록이 수업 하나입니다. 블록 안 첫 줄은 과목명, 그 아래는 보통 강의실(예: 공학관 301)입니다. 교수명은 장소에 넣지 마세요.
- 블록의 위·아래 경계가 어느 시각 눈금에 걸치는지 보고 시작/끝 시각을 정하세요. 블록 안에 시각이 적혀 있으면 그 값을 우선합니다. 눈금 사이에 걸치면 가장 가까운 5분 단위로 추정하세요(예: 10:30, 11:45).
- 같은 과목이 여러 요일에 있으면 요일마다 따로 항목을 만드세요.
- 시간표 아래쪽의 '시간 미지정 수업' 목록이나 학점 정보 등은 제외합니다.
- 시간표가 아니거나 거의 읽을 수 없으면 entries 를 비우고 warning 에 이유를 쓰세요.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 1440 ? v : null;
}

async function isLoggedIn(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: authHeader },
  });
  return res.ok;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: '서버에 ANTHROPIC_API_KEY 가 설정되지 않았어요. Vercel 환경변수를 확인해주세요.' }, 500);
  }
  if (!(await isLoggedIn(request.headers.get('authorization')))) {
    return json({ error: '로그인이 필요해요.' }, 401);
  }

  let body: { image?: unknown; mediaType?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: '잘못된 요청이에요.' }, 400);
  }
  const image = typeof body.image === 'string' ? body.image.replace(/^data:[^;]+;base64,/, '') : '';
  const mediaType = (MEDIA_TYPES as readonly string[]).includes(String(body.mediaType))
    ? (body.mediaType as MediaType)
    : 'image/jpeg';
  if (!image) return json({ error: '이미지가 없어요.' }, 400);
  if (image.length > MAX_BASE64_LENGTH) return json({ error: '이미지가 너무 커요. 더 작은 캡처로 시도해주세요.' }, 413);

  const client = new Anthropic();
  try {
    const message = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaJSONSchemaOutputFormat(SCHEMA) },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });

    if (message.stop_reason === 'refusal') {
      return json({ error: '이 이미지는 분석할 수 없어요. 다른 캡처로 시도해주세요.' }, 422);
    }
    const parsed = message.parsed_output;
    if (!parsed) {
      return json({ error: '시간표를 읽지 못했어요. 다시 시도해주세요.' }, 502);
    }

    const entries = parsed.entries
      .map((e) => ({
        day_of_week: e.day_of_week,
        start_min: toMinutes(e.start),
        end_min: toMinutes(e.end),
        title: e.title.trim().slice(0, 50),
        location: e.location.trim().slice(0, 50),
      }))
      .filter(
        (e): e is { day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6; start_min: number; end_min: number; title: string; location: string } =>
          e.start_min !== null && e.end_min !== null && e.end_min > e.start_min && e.title.length > 0,
      );

    return json({ entries, warning: parsed.warning });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: '서버의 API 키가 올바르지 않아요.' }, 500);
    }
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: '요청이 많아요. 잠시 후 다시 시도해주세요.' }, 429);
    }
    if (err instanceof Anthropic.BadRequestError) {
      return json({ error: '이미지를 처리할 수 없어요. PNG/JPG 캡처인지 확인해주세요.' }, 400);
    }
    if (err instanceof Anthropic.APIError) {
      return json({ error: `AI 서버 오류 (${err.status ?? '알 수 없음'})` }, 502);
    }
    console.error(err);
    return json({ error: '알 수 없는 오류가 발생했어요.' }, 500);
  }
}
