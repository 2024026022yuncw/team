// 서버 함수 공통: Gemini 호출 (모델 여러 개를 차례로 시도)
// 파일 이름이 _ 로 시작하면 Vercel 이 API 주소로 만들지 않음 (공통 코드 전용)
import { GoogleGenAI, ThinkingLevel, type GenerateContentConfig, type GenerateContentParameters } from '@google/genai';

export class TimeoutError extends Error {}

/** 무료로 쓸 수 있는 모델을 빠르고 정확한 순서로. GEMINI_MODEL 이 있으면 맨 앞에 */
export const MODEL_CHAIN = Array.from(
  new Set([process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-4-hydrogen'].filter(Boolean) as string[]),
);

/** SDK 오류에서 상태 코드·구글 원인(reason)·메시지를 꺼냄 (오류 클래스가 API 마다 달라서 공통 필드로 읽음) */
export function describeGeminiError(err: unknown): { status?: number; reason?: string; message?: string } {
  if (!err || typeof err !== 'object') return { message: String(err) };
  const e = err as { status?: unknown; statusCode?: unknown; body?: unknown; message?: unknown };
  const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : undefined;
  let reason: string | undefined;
  let message: string | undefined;
  try {
    const src = e.body ?? (typeof e.message === 'string' && e.message.includes('{') ? e.message.slice(e.message.indexOf('{')) : undefined);
    const raw = typeof src === 'string' ? JSON.parse(src) : src;
    const g = (Array.isArray(raw) ? raw[0] : raw)?.error;
    if (g) {
      message = typeof g.message === 'string' ? g.message : undefined;
      reason =
        (Array.isArray(g.details) ? g.details.find((d: { reason?: string }) => d?.reason)?.reason : undefined) ??
        (typeof g.status === 'string' ? g.status : undefined);
    }
  } catch {
    // body 가 JSON 이 아니면 무시
  }
  if (!message && typeof e.message === 'string') message = e.message.slice(0, 300);
  return { status, reason, message };
}

/** 다른 모델로 넘어가면 될 수 있는 오류: 시간 초과, 혼잡(503), 일시 오류(500), 모델별 사용량 초과(429), 모델 없음(404) */
function isRetryable(err: unknown) {
  if (err instanceof TimeoutError) return true;
  const { status, reason } = describeGeminiError(err);
  return status === 503 || status === 500 || status === 429 || status === 404 || reason === 'RESOURCE_EXHAUSTED';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 모델 체인을 차례로 시도해서 텍스트 응답을 반환.
 * - 생각 단계(LOW)를 모델이 거부하면 그 모델에서 설정 없이 한 번 더
 * - 전체 시간이 budgetMs 를 넘지 않게 (Vercel 함수 제한 60초 대비)
 */
export async function generateText(
  apiKey: string,
  request: { contents: GenerateContentParameters['contents']; config?: GenerateContentConfig },
  { budgetMs = 52_000, tag = 'gemini' }: { budgetMs?: number; tag?: string } = {},
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const deadline = Date.now() + budgetMs;
  let lastErr: unknown = new TimeoutError();

  for (let i = 0; i < MODEL_CHAIN.length; i++) {
    const model = MODEL_CHAIN[i];
    const remaining = deadline - Date.now();
    if (remaining < 6_000) break;
    // 첫 모델은 넉넉히, 그다음은 짧게
    const timeoutMs = Math.min(remaining, i === 0 ? 30_000 : 15_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    const call = (withThinking: boolean) =>
      ai.models.generateContent({
        model,
        contents: request.contents,
        config: {
          ...request.config,
          ...(withThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
          abortSignal: controller.signal,
        },
      });
    try {
      let res;
      try {
        res = await call(true);
      } catch (err) {
        const { status, message } = describeGeminiError(err);
        if (controller.signal.aborted || status !== 400 || !/thinking/i.test(message ?? '')) throw err;
        res = await call(false);
      }
      console.log(`[${tag}] ${model} ok ${Date.now() - startedAt}ms`);
      return res.text ?? '';
    } catch (err) {
      lastErr = controller.signal.aborted ? new TimeoutError() : err;
      console.warn(`[${tag}] ${model} failed`, describeGeminiError(lastErr).status ?? 'timeout');
      if (!isRetryable(lastErr)) throw lastErr;
      await sleep(300);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
