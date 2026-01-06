# ClearScrub React Patterns

## Overview

React hooks and patterns for the ClearScrub Supabase project.

**Project URL:** https://vnhauomvzjucxadrbywg.supabase.co
**Anon Key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuaGF1b212emp1Y3hhZHJieXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxODgwMTQsImV4cCI6MjA3NDc2NDAxNH0.02F8onN1U6DgDZYUSdY2EY12RG16jux-uy--lRSKe5c

---

## Supabase Client Setup

### lib/supabase.ts

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = 'https://vnhauomvzjucxadrbywg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuaGF1b212emp1Y3hhZHJieXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxODgwMTQsImV4cCI6MjA3NDc2NDAxNH0.02F8onN1U6DgDZYUSdY2EY12RG16jux-uy--lRSKe5c';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
```

---

## Authentication Hooks

### useAuth

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  });

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
      });
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState({
          user: session?.user ?? null,
          session,
          loading: false,
        });
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
```

### useProfile

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  company_role: string | null;
  org_id: string;
}

export function useProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setProfile(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, authLoading]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    setProfile(data);
    return data;
  };

  return { profile, loading, error, updateProfile };
}
```

---

## Organization Hooks

### useOrganization

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';

interface Organization {
  id: string;
  name: string;
  email_address: string;
  status: 'active' | 'suspended' | 'cancelled';
  subscription_tier: 'free' | 'basic' | 'pro' | 'enterprise';
  metadata: Record<string, unknown>;
}

export function useOrganization() {
  const { profile, loading: profileLoading } = useProfile();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile?.org_id) {
      setOrganization(null);
      setLoading(false);
      return;
    }

    const fetchOrg = async () => {
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', profile.org_id)
          .single();

        if (error) throw error;
        setOrganization(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrg();
  }, [profile, profileLoading]);

  return { organization, loading, error };
}
```

---

## Submission Hooks

### useSubmissions

```typescript
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';

interface Submission {
  id: string;
  org_id: string;
  user_id: string | null;
  ingestion_method: 'api' | 'dashboard' | 'email';
  status: 'received' | 'processing' | 'completed' | 'failed';
  company_name: string | null;
  files_total: number;
  files_processed: number;
  created_at: string;
  updated_at: string;
}

interface UseSubmissionsOptions {
  status?: Submission['status'];
  limit?: number;
  orderBy?: 'created_at' | 'updated_at';
  ascending?: boolean;
}

export function useSubmissions(options: UseSubmissionsOptions = {}) {
  const { profile, loading: profileLoading } = useProfile();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const {
    status,
    limit = 50,
    orderBy = 'created_at',
    ascending = false,
  } = options;

  const fetchSubmissions = useCallback(async () => {
    if (!profile?.org_id) return;

    try {
      setLoading(true);
      let query = supabase
        .from('submissions')
        .select('*')
        .eq('org_id', profile.org_id)
        .order(orderBy, { ascending })
        .limit(limit);

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSubmissions(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [profile?.org_id, status, limit, orderBy, ascending]);

  useEffect(() => {
    if (profileLoading) return;
    fetchSubmissions();
  }, [fetchSubmissions, profileLoading]);

  // Real-time subscription
  useEffect(() => {
    if (!profile?.org_id) return;

    const channel = supabase
      .channel('submissions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'submissions',
          filter: `org_id=eq.${profile.org_id}`,
        },
        () => {
          fetchSubmissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.org_id, fetchSubmissions]);

  return { submissions, loading, error, refetch: fetchSubmissions };
}
```

### useSubmission

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface SubmissionDetail {
  id: string;
  org_id: string;
  company_name: string | null;
  status: string;
  files: Array<{
    id: string;
    filename: string;
    status: string;
    classification_type: string | null;
  }>;
  accounts: Array<{
    id: string;
    bank_name: string;
    account_number_masked: string | null;
    latest_balance: number | null;
  }>;
  applications: Array<{
    id: string;
    company_legal_name: string;
    app_amount_requested: number | null;
  }>;
  metrics: {
    total_deposits: number | null;
    total_withdrawals: number | null;
    true_revenue: number | null;
  } | null;
}

export function useSubmission(submissionId: string | null) {
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!submissionId) {
      setSubmission(null);
      setLoading(false);
      return;
    }

    const fetchSubmission = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from('submissions')
          .select(`
            *,
            files (
              id,
              filename,
              status,
              classification_type
            ),
            accounts (
              id,
              bank_name,
              account_number_masked,
              latest_balance
            ),
            applications (
              id,
              company_legal_name,
              app_amount_requested
            ),
            submission_metrics (
              total_deposits,
              total_withdrawals,
              true_revenue
            )
          `)
          .eq('id', submissionId)
          .single();

        if (error) throw error;

        setSubmission({
          ...data,
          metrics: data.submission_metrics?.[0] ?? null,
        });
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchSubmission();
  }, [submissionId]);

  return { submission, loading, error };
}
```

---

## Transaction Hooks

### useTransactions

```typescript
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Transaction {
  id: string;
  amount: number;
  description: string;
  transaction_date: string;
  running_balance: number | null;
  merchant_name: string | null;
  is_revenue: boolean | null;
  category: {
    id: string;
    label: string;
    analytics_group: string;
  } | null;
}

interface UseTransactionsOptions {
  statementId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export function useTransactions(options: UseTransactionsOptions = {}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const {
    statementId,
    accountId,
    startDate,
    endDate,
    limit = 100,
  } = options;

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('transactions')
        .select(`
          id,
          amount,
          description,
          transaction_date,
          running_balance,
          merchant_name,
          is_revenue,
          category:categories (
            id,
            label,
            analytics_group
          )
        `)
        .order('transaction_date', { ascending: false })
        .limit(limit);

      if (statementId) {
        query = query.eq('bank_statement_id', statementId);
      }
      if (accountId) {
        query = query.eq('account_id', accountId);
      }
      if (startDate) {
        query = query.gte('transaction_date', startDate);
      }
      if (endDate) {
        query = query.lte('transaction_date', endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTransactions(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [statementId, accountId, startDate, endDate, limit]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const updateCategory = async (transactionId: string, categoryId: string) => {
    const { error } = await supabase
      .from('transactions')
      .update({
        category_id: categoryId,
        category_override_at: new Date().toISOString(),
      })
      .eq('id', transactionId);

    if (error) throw error;
    await fetchTransactions();
  };

  return { transactions, loading, error, refetch: fetchTransactions, updateCategory };
}
```

---

## API Keys Hooks

### useApiKeys

```typescript
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';

interface ApiKey {
  id: string;
  key_name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  is_default: boolean;
}

export function useApiKeys() {
  const { profile, loading: profileLoading } = useProfile();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchApiKeys = useCallback(async () => {
    if (!profile?.org_id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('org_id', profile.org_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [profile?.org_id]);

  useEffect(() => {
    if (profileLoading) return;
    fetchApiKeys();
  }, [fetchApiKeys, profileLoading]);

  const revokeKey = async (keyId: string) => {
    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('id', keyId);

    if (error) throw error;
    await fetchApiKeys();
  };

  return { apiKeys, loading, error, refetch: fetchApiKeys, revokeKey };
}
```

---

## Categories Hook

### useCategories

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Category {
  id: string;
  label: string;
  description: string | null;
  analytics_group: string;
  is_system: boolean;
  is_revenue: boolean;
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .order('analytics_group')
          .order('label');

        if (error) throw error;
        setCategories(data);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  // Group categories by analytics_group for UI
  const groupedCategories = categories.reduce((acc, cat) => {
    if (!acc[cat.analytics_group]) {
      acc[cat.analytics_group] = [];
    }
    acc[cat.analytics_group].push(cat);
    return acc;
  }, {} as Record<string, Category[]>);

  return { categories, groupedCategories, loading, error };
}
```

---

## File Upload Hook

### useFileUpload

```typescript
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface UploadResult {
  submissionId: string;
  fileIds: string[];
}

export function useFileUpload() {
  const { profile } = useProfile();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const uploadFiles = async (
    files: File[],
    companyName?: string
  ): Promise<UploadResult> => {
    if (!profile?.org_id) {
      throw new Error('Not authenticated');
    }

    setUploading(true);
    setError(null);

    try {
      // Create submission
      const { data: submission, error: subError } = await supabase
        .from('submissions')
        .insert({
          org_id: profile.org_id,
          user_id: profile.id,
          ingestion_method: 'dashboard',
          status: 'received',
          company_name: companyName,
          files_total: files.length,
          files_processed: 0,
        })
        .select()
        .single();

      if (subError) throw subError;

      const fileIds: string[] = [];

      // Upload each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = `${profile.org_id}/${submission.id}/${file.name}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Create file record
        const { data: fileRecord, error: fileError } = await supabase
          .from('files')
          .insert({
            submission_id: submission.id,
            org_id: profile.org_id,
            filename: file.name,
            file_path: filePath,
            file_size_bytes: file.size,
            mime_type: file.type,
            source: 'dashboard',
            status: 'uploaded',
          })
          .select()
          .single();

        if (fileError) throw fileError;
        fileIds.push(fileRecord.id);

        setProgress({
          loaded: i + 1,
          total: files.length,
          percentage: ((i + 1) / files.length) * 100,
        });
      }

      // Trigger processing
      await supabase.functions.invoke('process-document', {
        body: { submission_id: submission.id },
      });

      return {
        submissionId: submission.id,
        fileIds,
      };
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  return { uploadFiles, uploading, progress, error };
}
```

---

## Edge Function Hook

### useEdgeFunction

```typescript
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface UseEdgeFunctionOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function useEdgeFunction<TInput, TOutput>(
  functionName: string,
  options: UseEdgeFunctionOptions<TOutput> = {}
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<TOutput | null>(null);

  const invoke = useCallback(
    async (body: TInput) => {
      setLoading(true);
      setError(null);

      try {
        const { data: result, error: fnError } = await supabase.functions.invoke<TOutput>(
          functionName,
          { body }
        );

        if (fnError) throw fnError;

        setData(result);
        options.onSuccess?.(result!);
        return result;
      } catch (err) {
        const error = err as Error;
        setError(error);
        options.onError?.(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [functionName, options]
  );

  return { invoke, loading, error, data };
}

// Usage example:
// const { invoke, loading } = useEdgeFunction<{ limit: number }, Company[]>('list-companies');
// const companies = await invoke({ limit: 10 });
```

---

## Real-time Subscription Hook

### useRealtimeSubscription

```typescript
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions<T> {
  table: string;
  filter?: string;
  event?: PostgresChangeEvent;
  onInsert?: (payload: T) => void;
  onUpdate?: (payload: T) => void;
  onDelete?: (payload: T) => void;
  onChange?: (payload: T, eventType: PostgresChangeEvent) => void;
}

export function useRealtimeSubscription<T extends Record<string, unknown>>(
  options: UseRealtimeOptions<T>
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${options.table}`)
      .on(
        'postgres_changes',
        {
          event: options.event ?? '*',
          schema: 'public',
          table: options.table,
          filter: options.filter,
        },
        (payload) => {
          const record = payload.new as T;
          const eventType = payload.eventType as PostgresChangeEvent;

          if (eventType === 'INSERT' && options.onInsert) {
            options.onInsert(record);
          } else if (eventType === 'UPDATE' && options.onUpdate) {
            options.onUpdate(record);
          } else if (eventType === 'DELETE' && options.onDelete) {
            options.onDelete(payload.old as T);
          }

          options.onChange?.(record, eventType);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [options.table, options.filter, options.event]);
}

// Usage example:
// useRealtimeSubscription<Submission>({
//   table: 'submissions',
//   filter: `org_id=eq.${orgId}`,
//   onUpdate: (submission) => {
//     console.log('Submission updated:', submission);
//   },
// });
```
