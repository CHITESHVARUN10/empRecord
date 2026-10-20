import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../../lib/api';

export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  lastLoginAt: string | null;
};

export function useAdminSession() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const data = await apiFetch<{ admin: AdminUser }>('/api/auth/me');
        return data.admin;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    const handleUnauthorized = () => {
      queryClient.setQueryData(['auth', 'me'], null);
    };
    window.addEventListener('bpi:unauthorized', handleUnauthorized);
    return () =>
      window.removeEventListener('bpi:unauthorized', handleUnauthorized);
  }, [queryClient]);

  return query;
}
