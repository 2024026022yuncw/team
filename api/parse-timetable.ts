// Vercel 서버 함수: 시간표 이미지(에브리타임 캡처 등) → 시간표 항목 JSON
// POST /api/parse-timetable   body: { image: base64, mediaType: "image/jpeg" | "image/png" | ... }
// 필요 환경변수 (Vercel > Settings > Environment Variables): GEMINI_API_KEY (Google AI Studio 무료 키)
// 선택: GEMINI_MODEL (기본 gemini-3.8-flash)
import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
// 기본 모델이 너무 오래 걸릴 때 한 번 더 시도할 가벼운 모델
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';

class TimeoutError extends Error {}

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
          day_of_week: { type: 'integer', minimum: 0, maximum: 6, description: '0=일 1=월 2=화 3=수 4=목 5=금 6=토' },
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: '서버에 GEMINI_API_KEY 가 설정되지 않았어요. Vercel 환경변수를 확인해주세요.' }, 500);
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

  const ai = new GoogleGenAI({ apiKey });

  /**
   * 모델 한 번 호출. timeoutMs 안에 답이 없으면 취소하고 TimeoutError 를 던짐.
   * 시간표 읽기는 깊은 추론이 필요 없어 생각 단계를 LOW 로 낮춤(속도). 모델이 그 설정을
   * 거부하면(모델마다 지원 단계가 다름) 설정 없이 같은 시간 안에서 한 번 더 시도.
   */
  async function callModel(model: string, timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    const request = (withThinking: boolean) =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType: mediaType, data: image } }, { text: PROMPT }],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: SCHEMA,
          ...(withThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          abortSignal: controller.signal,
        },
      });
    try {
      let res;
      try {
        res = await request(true);
      } catch (err) {
        const { status, message } = describeGeminiError(err);
        if (controller.signal.aborted || status !== 400 || !/thinking/i.test(message ?? '')) throw err;
        console.warn(`[parse-timetable] ${model} rejected thinking level, retrying without it`);
        res = await request(false);
      }
      console.log(`[parse-timetable] ${model} ${Date.now() - startedAt}ms`);
      return res.text ?? '';
    } catch (err) {
      if (controller.signal.aborted) {
        console.warn(`[parse-timetable] ${model} timeout after ${Date.now() - startedAt}ms`);
        throw new TimeoutError();
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    // Vercel 함수 제한 시간 안에 끝나도록: 기본 모델 40초 → 안 되면 가벼운 모델 15초
    let text: string;
    try {
      text = await callModel(MODEL, 40_000);
    } catch (err) {
      if (!(err instanceof TimeoutError) || MODEL === FALLBACK_MODEL) throw err;
      text = await callModel(FALLBACK_MODEL, 15_000);
    }

    let parsed: { entries?: unknown; warning?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: '시간표를 읽지 못했어요. 다시 시도해주세요.' }, 502);
    }
    const rawEntries = Array.isArray(parsed.entries) ? (parsed.entries as Record<string, unknown>[]) : [];

    // AI 결과는 그대로 믿지 않고 형식·범위를 다시 검사
    const entries = rawEntries
      .map((e) => ({
        day_of_week: Number(e.day_of_week),
        start_min: toMinutes(String(e.start ?? '')),
        end_min: toMinutes(String(e.end ?? '')),
        title: String(e.title ?? '').trim().slice(0, 50),
        location: String(e.location ?? '').trim().slice(0, 50),
      }))
      .filter(
        (e): e is { day_of_week: number; start_min: number; end_min: number; title: string; location: string } =>
          Number.isInteger(e.day_of_week) &&
          e.day_of_week >= 0 &&
          e.day_of_week <= 6 &&
          e.start_min !== null &&
          e.end_min !== null &&
          e.end_min > e.start_min &&
          e.title.length > 0,
      );

    return json({ entries, warning: typeof parsed.warning === 'string' ? parsed.warning : '' });
  } catch (err) {
    if (err instanceof TimeoutError) {
      return json({ error: 'AI 응답이 너무 오래 걸렸어요. 시간표 부분만 잘라서 캡처하면 더 빨라요.' }, 504);
    }
    console.error('[parse-timetable]', err);
    const { status, reason, message } = describeGeminiError(err);

    if (reason === 'API_KEY_INVALID' || status === 401 || status === 403) {
      return json({ error: '서버의 Gemini API 키가 올바르지 않아요. Vercel 의 GEMINI_API_KEY 값을 확인해주세요.' }, 500);
    }
    if (status === 429 || reason === 'RESOURCE_EXHAUSTED') {
      return json({ error: '오늘 무료 사용량을 다 썼거나 요청이 많아요. 잠시 후 다시 시도해주세요.' }, 429);
    }
    if (status === 404) {
      return json({ error: `AI 모델(${MODEL})을 사용할 수 없어요. (${message || 'not found'})` }, 502);
    }
    if (status === 400) {
      return json({ error: `요청을 처리할 수 없어요: ${message || '잘못된 요청'}` }, 400);
    }
    return json({ error: `AI 서버 오류${status ? ` (${status})` : ''}: ${message || String(err)}` }, 502);
  }
}

/**
 * Gemini SDK 는 API 종류에 따라 서로 다른 오류 클래스를 던지므로(ApiError, BadRequestError 등)
 * 공통 필드(status/statusCode, body)에서 상태 코드와 구글의 원인 메시지를 꺼냄
 */
function describeGeminiError(err: unknown): { status?: number; reason?: string; message?: string } {
  if (!err || typeof err !== 'object') return { message: String(err) };
  const e = err as { status?: unknown; statusCode?: unknown; body?: unknown; message?: unknown };
  const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : undefined;

  let reason: string | undefined;
  let message: string | undefined;
  try {
    // interactions API 는 body 에, generateContent API(ApiError)는 message 안에 JSON 으로 원인을 담음
    const jsonInMessage =
      e.body === undefined && typeof e.message === 'string' && e.message.includes('{')
        ? e.message.slice(e.message.indexOf('{'))
        : undefined;
    const source = e.body ?? jsonInMessage;
    const raw = typeof source === 'string' ? JSON.parse(source) : source;
    const body = Array.isArray(raw) ? raw[0] : raw;
    const g = body?.error;
    if (g) {
      message = typeof g.message === 'string' ? g.message : undefined;
      reason =
        (Array.isArray(g.details) ? g.details.find((d: { reason?: string }) => d?.reason)?.reason : undefined) ??
        (typeof g.status === 'string' ? g.status : undefined);
    }
  } catch {
    // body 가 JSON 이 아니면 무시
  }
  if (!message && err instanceof ApiError) message = err.message;
  if (!message && typeof e.message === 'string') message = e.message.slice(0, 300);
  return { status, reason, message };
}
