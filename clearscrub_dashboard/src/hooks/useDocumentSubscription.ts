import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from './useAuth';

export interface Document {
  id: string;
  submission_id: string;
  filename: string;
  file_path: string;
  status: 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  org_id: string;
  created_at: string;
  processing_started_at?: string;
  processing_completed_at?: string;
  company_id?: string;
  file_size_bytes?: number;
}

/**
 * Custom hook for subscribing to document changes in realtime.
 * Includes polling fallback when realtime connection drops.
 *
 * @param submissionId - Optional submission ID to filter documents. If null, fetches all documents for org.
 * @returns Documents array, loading state, error, and connection status
 */
export function useDocumentSubscription(submissionId: string | null = null) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(true);

  // Initial fetch
  useEffect(() => {
    if (!user?.org_id) return;

    const fetchDocuments = async () => {
      setIsLoading(true);
      setError(null);
      try {
        let query = supabase
          .from('documents')
          .select('*')
          .eq('org_id', user.org_id)
          .order('created_at', { ascending: false });

        // Filter by submission_id if provided
        if (submissionId) {
          query = query.eq('submission_id', submissionId);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;
        setDocuments(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch documents');
        console.error('Error fetching documents:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [user?.org_id, submissionId]);

  // Realtime subscription + polling fallback
  useEffect(() => {
    if (!user?.org_id) return;

    let channel: RealtimeChannel | null = null;
    let pollingInterval: NodeJS.Timeout | null = null;

    const subscribe = () => {
      // Build filter: org_id is always required, submission_id is optional
      const filter = submissionId
        ? `org_id=eq.${user.org_id},submission_id=eq.${submissionId}`
        : `org_id=eq.${user.org_id}`;

      channel = supabase
        .channel(`documents:${user.org_id}${submissionId ? `:${submissionId}` : ''}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'documents',
            filter,
          },
          (payload) => {
            console.log('Document realtime event:', payload.eventType, payload.new || payload.old);

            if (payload.eventType === 'INSERT') {
              setDocuments(prev => [payload.new as Document, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setDocuments(prev =>
                prev.map(doc =>
                  doc.id === (payload.new as Document).id ? (payload.new as Document) : doc
                )
              );
            } else if (payload.eventType === 'DELETE') {
              setDocuments(prev =>
                prev.filter(doc => doc.id !== (payload.old as Document).id)
              );
            }
          }
        )
        .subscribe((status) => {
          console.log('Document subscription status:', status);

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

      console.log('Starting polling fallback for documents...');
      pollingInterval = setInterval(async () => {
        try {
          let query = supabase
            .from('documents')
            .select('*')
            .eq('org_id', user.org_id)
            .order('created_at', { ascending: false });

          if (submissionId) {
            query = query.eq('submission_id', submissionId);
          }

          const { data } = await query;

          if (data) {
            setDocuments(data);
            console.log('Polling update: fetched', data.length, 'documents');
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 5000); // 5 second interval
    };

    subscribe();

    return () => {
      console.log('Cleaning up document subscription');
      if (channel) {
        supabase.removeChannel(channel);
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [user?.org_id, submissionId]);

  return { documents, isLoading, error, isConnected };
}
