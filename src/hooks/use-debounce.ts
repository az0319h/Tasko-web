import { useState, useEffect } from 'react';

/**
 * useDebounce 훅
 * 값의 변경을 지연시켜서 불필요한 API 호출이나 연산을 방지합니다.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // 값이 변경되면 지연 후 업데이트
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // 다음 effect 실행 전 또는 컴포넌트 언마운트 시 타이머 정리
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * useDebouncedCallback 훅
 * 콜백 함수의 실행을 지연시킵니다.
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const debouncedCallback = ((...args: Parameters<T>) => {
    // 기존 타이머가 있다면 제거
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // 새 타이머 설정
    const newTimeoutId = setTimeout(() => {
      callback(...args);
      setTimeoutId(null);
    }, delay);

    setTimeoutId(newTimeoutId);
  }) as T;

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeoutId]);

  return debouncedCallback;
}
