import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from './supabase';

/**
 * 지정한 테이블에 변경이 생기면 onChange 를 호출합니다 (팀원 간 실시간 동기화).
 * filter 예: `team_id=eq.<uuid>`
 */
export function useRealtime(
  key: string,
  subs: { table: string; filter?: string }[],
  onChange: () => void,
) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const subsKey = JSON.stringify(subs);

  useEffect(() => {
    if (!key) return;
    let channel = supabase.channel(`${key}-${Math.random().toString(36).slice(2)}`);
    for (const s of JSON.parse(subsKey) as { table: string; filter?: string }[]) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        () => cb.current(),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [key, subsKey]);
}

/** 화면에 들어올 때마다 다시 불러오는 비동기 데이터 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[], initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    try {
      const result = await loaderRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { data, setData, loading, error, reload };
}
