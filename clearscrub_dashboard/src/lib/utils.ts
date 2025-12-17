import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Default timeout values for different operation types (in milliseconds)
 */
export const TIMEOUT_MS = {
  /** Supabase database queries */
  SUPABASE_QUERY: 30000,
  /** Edge Function invocations */
  EDGE_FUNCTION: 60000,
  /** External HTTP requests (webhooks, etc) */
  EXTERNAL_HTTP: 30000,
  /** File uploads to storage */
  STORAGE_UPLOAD: 120000,
} as const

/**
 * Wraps a promise or promise-like (thenable) object with a timeout.
 * If the promise doesn't resolve within the specified time, it rejects with a TimeoutError.
 *
 * Works with Supabase query builders which are PromiseLike but not full Promises.
 *
 * @param promiseOrThenable - The promise or thenable to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Human-readable name for error messages
 * @returns The resolved value if successful
 * @throws TimeoutError if the operation times out
 */
export async function withTimeout<T>(
  promiseOrThenable: PromiseLike<T> | Promise<T>,
  timeoutMs: number,
  operationName = 'Operation'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>

  // Convert thenable to a proper Promise to ensure compatibility
  const promise = Promise.resolve(promiseOrThenable)

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${operationName} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutId!)
    return result
  } catch (error) {
    clearTimeout(timeoutId!)
    throw error
  }
}

/**
 * Custom error class for timeout errors
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

/**
 * Creates a fetch wrapper with AbortController timeout
 *
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns The fetch Response
 * @throws Error if request times out or fails
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = TIMEOUT_MS.EXTERNAL_HTTP
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TimeoutError(`Request to ${url} timed out after ${timeoutMs}ms`)
    }
    throw err
  }
}
