/**
 * Authentication type definitions for ClearScrub
 *
 * This file defines TypeScript types for authentication-related data structures
 * used throughout the application.
 */

/**
 * Extended user type that includes org_id from profiles table
 *
 * Note: org_id is stored in the profiles table, NOT in the JWT token.
 * It must be fetched via a database query after authentication.
 */
export interface AuthUser {
  /** User UUID from Supabase Auth (auth.users.id) */
  id: string

  /** User email address */
  email: string

  /**
   * Organization ID from profiles table
   *
   * Architecture notes:
   * - Populated by database trigger on user signup
   * - Used for multi-tenant RLS isolation
   * - All data tables filter by org_id
   * - NULL if profile not yet created (edge case)
   */
  org_id: string | null
}

/**
 * Profile record from profiles table
 *
 * Full schema for reference. The AuthUser type above is a subset.
 */
export interface UserProfile {
  /** User UUID (matches auth.users.id) */
  id: string

  /** Organization UUID (foreign key to organizations.id) */
  org_id: string

  /** User email (synced from auth.users.email) */
  email: string

  /** Full name (optional) */
  full_name?: string | null

  /** Role within organization (owner, admin, member, viewer) */
  role?: 'owner' | 'admin' | 'member' | 'viewer'

  /** Profile creation timestamp */
  created_at: string

  /** Profile last updated timestamp */
  updated_at: string
}

/**
 * Organization record from organizations table
 *
 * Root entity for multi-tenancy
 */
export interface Organization {
  /** Organization UUID */
  id: string

  /** Organization display name */
  name: string

  /** URL-safe slug for vanity URLs (optional) */
  slug?: string | null

  /** Subscription plan (free, pro, enterprise) */
  subscription_plan?: 'free' | 'pro' | 'enterprise'

  /** User UUID of organization owner (first user who signed up) */
  owner_id?: string | null

  /** Organization creation timestamp */
  created_at: string

  /** Organization last updated timestamp */
  updated_at: string
}

/**
 * Supabase JWT payload structure
 *
 * Standard claims from Supabase Auth JWT tokens.
 * Note: org_id is NOT in JWT - must be fetched from database.
 */
export interface SupabaseJwtPayload {
  /** Audience (always "authenticated" for logged-in users) */
  aud: 'authenticated'

  /** Expiration time (Unix timestamp) */
  exp: number

  /** Issued at time (Unix timestamp) */
  iat: number

  /** Issuer (Supabase Auth URL) */
  iss: string

  /** Subject (user UUID - same as auth.users.id) */
  sub: string

  /** User email */
  email: string

  /** Phone number (if used for auth) */
  phone?: string

  /** App metadata (custom claims set by backend) */
  app_metadata?: {
    provider?: string
    providers?: string[]
  }

  /** User metadata (custom claims set by user) */
  user_metadata?: Record<string, unknown>

  /** Role (always "authenticated" for logged-in users) */
  role: 'authenticated' | 'anon' | 'service_role'

  /** Authenticator assurance level (aal1 or aal2 for MFA) */
  aal?: 'aal1' | 'aal2'

  /** Authentication method reference (e.g., "password", "otp") */
  amr?: Array<{ method: string; timestamp: number }>

  /** Session ID */
  session_id?: string
}

/**
 * Type guard to check if user has org_id
 *
 * @param user - Auth user object
 * @returns true if user.org_id is not null
 *
 * @example
 * ```tsx
 * const { user } = useAuth()
 *
 * if (hasOrgId(user)) {
 *   // TypeScript knows user.org_id is string (not null)
 *   console.log('User org:', user.org_id)
 * }
 * ```
 */
export function hasOrgId(user: AuthUser | null): user is AuthUser & { org_id: string } {
  return user !== null && user.org_id !== null
}

/**
 * Auth error types
 *
 * Common authentication errors that can occur
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'user_not_found'
  | 'weak_password'
  | 'email_already_exists'
  | 'profile_not_found'
  | 'org_not_found'
  | 'session_expired'
  | 'unknown_error'

/**
 * Structured auth error
 */
export interface AuthError {
  code: AuthErrorCode
  message: string
  details?: Record<string, unknown>
}
