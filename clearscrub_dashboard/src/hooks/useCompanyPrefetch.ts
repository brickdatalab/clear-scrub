import { useRef, useCallback } from 'react'
import { api, type CompanyDetailResponse } from '@/services/api'

/**
 * Simple in-memory cache for prefetched company details.
 * Uses module-level Map to persist across component remounts.
 */
const prefetchCache = new Map<string, CompanyDetailResponse>()

/**
 * Set of company IDs currently being fetched to prevent duplicate requests.
 */
const pendingFetches = new Set<string>()

/**
 * Hook for debounced hover prefetching of company details.
 *
 * Features:
 * - 150ms debounce: Only prefetches if user hovers for 150ms+
 * - No duplicate fetches: Skips companies already cached or in-flight
 * - Simple cache: Module-level Map that persists across remounts
 *
 * @example
 * const { prefetch, cancelPrefetch, getCached } = useCompanyPrefetch()
 *
 * // On row hover start
 * prefetch(companyId)
 *
 * // On row hover end (before 150ms)
 * cancelPrefetch()
 *
 * // On row click - check cache first
 * const cached = getCached(companyId)
 * if (cached) {
 *   // Use cached data immediately
 * }
 */
export function useCompanyPrefetch() {
  // Ref to store timeout ID for debounce cancellation
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Cancel any pending prefetch timeout.
   * Call this when user moves away from a row before 150ms.
   */
  const cancelPrefetch = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  /**
   * Schedule a prefetch for a company's detail data.
   *
   * @param companyId - The company ID to prefetch
   *
   * Behavior:
   * - Debounces for 150ms before fetching
   * - Skips if already cached or currently fetching
   * - Silently handles errors (prefetch is non-critical)
   */
  const prefetch = useCallback((companyId: string) => {
    // Cancel any existing pending prefetch
    cancelPrefetch()

    // Skip if already cached or in-flight
    if (prefetchCache.has(companyId) || pendingFetches.has(companyId)) {
      return
    }

    // Schedule prefetch after 150ms debounce
    timeoutRef.current = setTimeout(async () => {
      // Double-check after debounce
      if (prefetchCache.has(companyId) || pendingFetches.has(companyId)) {
        return
      }

      // Mark as in-flight
      pendingFetches.add(companyId)

      try {
        const data = await api.getCompanyDetail(companyId)
        prefetchCache.set(companyId, data)

        if (import.meta.env.DEV) {
          console.log(`[Prefetch] Cached company ${companyId}`)
        }
      } catch (error) {
        // Silently ignore prefetch errors - this is a performance optimization
        if (import.meta.env.DEV) {
          console.warn(`[Prefetch] Failed for company ${companyId}:`, error)
        }
      } finally {
        pendingFetches.delete(companyId)
      }
    }, 150)
  }, [cancelPrefetch])

  /**
   * Get cached company detail data if available.
   *
   * @param companyId - The company ID to retrieve
   * @returns Cached CompanyDetailResponse or undefined
   */
  const getCached = useCallback((companyId: string): CompanyDetailResponse | undefined => {
    return prefetchCache.get(companyId)
  }, [])

  /**
   * Check if company data is currently being fetched.
   *
   * @param companyId - The company ID to check
   * @returns true if fetch is in progress
   */
  const isFetching = useCallback((companyId: string): boolean => {
    return pendingFetches.has(companyId)
  }, [])

  /**
   * Clear all cached data.
   * Useful for logout or data refresh scenarios.
   */
  const clearCache = useCallback(() => {
    prefetchCache.clear()
    pendingFetches.clear()
  }, [])

  return {
    prefetch,
    cancelPrefetch,
    getCached,
    isFetching,
    clearCache,
  }
}

/**
 * Direct cache access for use outside of React hooks.
 * For example, in the CompanyDetail page to check for prefetched data.
 */
export const companyPrefetchCache = {
  get: (companyId: string): CompanyDetailResponse | undefined => {
    return prefetchCache.get(companyId)
  },
  has: (companyId: string): boolean => {
    return prefetchCache.has(companyId)
  },
  clear: (): void => {
    prefetchCache.clear()
    pendingFetches.clear()
  },
}
