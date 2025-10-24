import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from './useAuth';

export interface Company {
  id: string;
  org_id: string;
  legal_name: string;
  dba_name?: string;
  ein?: string;
  industry?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  website?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  normalized_legal_name?: string;
}

/**
 * Custom hook for subscribing to company changes in realtime.
 * Includes polling fallback when realtime connection drops.
 *
 * @returns Companies array, loading state, error, and connection status
 */
export function useCompanySubscription() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  // Initial fetch
  useEffect(() => {
    if (!user?.org_id) return;

    const fetchCompanies = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('companies')
          .select('*')
          .eq('org_id', user.org_id)
          .order('created_at', { ascending: false});

        if (fetchError) throw fetchError;
        setCompanies(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch companies');
        console.error('Error fetching companies:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompanies();
  }, [user?.org_id]);

  // Realtime subscription + polling fallback
  useEffect(() => {
    if (!user?.org_id) return;

    let channel: RealtimeChannel | null = null;
    let pollingInterval: NodeJS.Timeout | null = null;

    const subscribe = () => {
      channel = supabase
        .channel(`companies:${user.org_id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'companies',
            filter: `org_id=eq.${user.org_id}`,
          },
          (payload) => {
            console.log('Company realtime event:', payload.eventType, payload.new || payload.old);

            if (payload.eventType === 'INSERT') {
              setCompanies(prev => [payload.new as Company, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setCompanies(prev =>
                prev.map(c =>
                  c.id === (payload.new as Company).id ? (payload.new as Company) : c
                )
              );
            } else if (payload.eventType === 'DELETE') {
              setCompanies(prev =>
                prev.filter(c => c.id !== (payload.old as Company).id)
              );
            }
          }
        )
        .subscribe((status) => {
          console.log('Company subscription status:', status);

          if (status === 'SUBSCRIBED') {
            setIsConnected(true);
            // Clear polling interval when connected
            if (pollingInterval) {
              clearInterval(pollingInterval);
              pollingInterval = null;
            }
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setIsConnected(false);
            // Start polling when disconnected
            startPolling();
          }
        });
    };

    const startPolling = () => {
      if (pollingInterval) return; // Prevent multiple polling intervals

      console.log('Starting polling fallback for companies...');
      pollingInterval = setInterval(async () => {
        try {
          const { data } = await supabase
            .from('companies')
            .select('*')
            .eq('org_id', user.org_id)
            .order('created_at', { ascending: false });

          if (data) {
            setCompanies(data);
            console.log('Polling update: fetched', data.length, 'companies');
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 5000); // 5 second interval
    };

    subscribe();

    return () => {
      console.log('Cleaning up company subscription');
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [user?.org_id]);

  return { companies, isLoading, error, isConnected };
}
