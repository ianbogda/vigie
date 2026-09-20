import { useEffect, useState } from 'react';

export type ApiResource<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
};

/** Loads an API resource while preventing stale promises from updating an unmounted view. */
export function useApiResource<T>(loader: (() => Promise<T>) | null, dependencies: readonly unknown[]): ApiResource<T> {
  const [state, setState] = useState<ApiResource<T>>({ data: null, loading: Boolean(loader), error: null });

  useEffect(() => {
    let active = true;
    if (!loader) {
      setState({ data: null, loading: false, error: null });
      return () => {
        active = false;
      };
    }

    setState({ data: null, loading: true, error: null });
    loader()
      .then((data) => active && setState({ data, loading: false, error: null }))
      .catch((error: unknown) => {
        if (!active) return;
        setState({ data: null, loading: false, error: error instanceof Error ? error : new Error(String(error)) });
      });

    return () => {
      active = false;
    };
    // The caller explicitly controls reload semantics through dependencies.
  }, dependencies);

  return state;
}
