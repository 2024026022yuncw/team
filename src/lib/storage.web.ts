// 웹: 브라우저 localStorage (정적 빌드 중에는 window 가 없을 수 있음)
export const authStorage = typeof window !== 'undefined' ? window.localStorage : undefined;
