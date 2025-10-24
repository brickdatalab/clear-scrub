import { supabase, waitForSession } from '../lib/supabaseClient'

/**
 * Custom API Error with optional HTTP status code
 */
export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Generic wrapper for Supabase Edge Function calls that ensures JWT is attached.
 * This prevents race conditions where API calls are made before session is hydrated.
 *
 * @param functionName - Name of the Edge Function to invoke
 * @param body - Request body to send
 * @returns Typed response data
 * @throws ApiError with status code if request fails
 */
async function invokeWithAuth<T>(functionName: string, body?: Record<string, unknown>): Promise<T> {
  // Wait for session to be ready
  const session = await waitForSession()

  if (!session) {
    console.error(`[invokeWithAuth] ${functionName}: No session available`)
    throw new ApiError('Unauthorized: Please log in to continue', 401)
  }

  console.log(`[invokeWithAuth] ${functionName}: Session ready, JWT will be attached`)

  // Call Edge Function with explicit Authorization header
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  })

  if (error) {
    // Extract status code from error object (Supabase error format can vary)
    const status = error.status || error.context?.status || 500

    console.error(`[invokeWithAuth] ${functionName} failed - Status: ${status}`, error)

    throw new ApiError(
      error.message || `Error ${status}: Failed to call ${functionName}`,
      status
    )
  }

  return data as T
}

export interface CompanyListItem {
  id: string
  company_id: string
  name: string
  email: string
  file_status: 'completed' | 'processing' | 'failed'
  created: string
  last_activity: string
  lendsaas_synced: boolean
  crm_synced: boolean
}

export interface CompanyListResponse {
  companies: CompanyListItem[]
  total: number
  page: number
  limit: number
}

export interface CompanyDetailResponse {
  application: {
    id: string
    company_id: string
    name: string
    email: string
    status: string
    created_at: string
    processing_status: string
    lendsaas_synced: boolean
    crm_synced: boolean
  }
  business?: {
    address: {
      address_line_1: string
      address_line_2?: string
      city: string
      state: string
      zip: string
    }
    annual_revenue: number | null
    dba: string
    ein: string
    email: string | null
    incorporated_state: string
    industry: string
    monthly_revenue: number | null
    company_name: string
    phone_number: string | null
    start_date: string
    type_of_business_entity: string
    website: string | null
  }
  funding?: {
    amount_requested: number
    loan_purpose: string
  }
  owner?: {
    address: {
      address_line_1: string
      address_line_2?: string
      city: string
      state: string
      zip: string
    }
    cell_phone: string | null
    credit_score: number | null
    date_of_signature: string | null
    dob: string | null
    email: string | null
    first_name: string
    home_phone: string | null
    is_signed: boolean | null
    last_name: string
    ownership_percent: number | null
    ssn: string
  }
  owner_2?: {
    address: {
      address_line_1: string
      address_line_2?: string
      city: string
      state: string
      zip: string
    }
    cell_phone: string | null
    credit_score: number | null
    date_of_signature: string | null
    dob: string | null
    email: string | null
    first_name: string
    home_phone: string | null
    is_signed: boolean | null
    last_name: string
    ownership_percent: number | null
    ssn: string
  }
  bank_summary?: {
    recent_spend: number
    avg_monthly_revenue: number
    total_transactions: number
    account_count: number
    statement_count: number
    withholding_percentage: number
    periods: Array<{
      period: string
      deposits: number
      true_revenue: number
      avg_daily_balance: number
      deposit_count: number
      neg_ending_days: number
      statements: Array<{
        statement_id: string
        account_number: string
        deposits: number
        true_revenue: number
        avg_daily_balance: number
        deposit_count: number
        neg_ending_days: number
      }>
    }>
  }
  payment_methods?: Array<{
    type: string
    last_four: string
    expires: string
  }>
  activity?: Array<{
    action: string
    timestamp: string
  }>
}

export interface StatementTransaction {
  id: string
  date: string
  description: string
  amount: number
  type: 'deposit' | 'withdrawal' | 'fee'
  balance: number
}

export interface StatementTransactionsResponse {
  transactions: StatementTransaction[]
  statement_id: string
  account_number: string
}

export interface Debt {
  id: string
  creditor: string
  account_number: string
  balance: number
  monthly_payment: number
  interest_rate: number
  term_months: number
}

export interface CompanyDebtsResponse {
  debts: Debt[]
  total_debt: number
  monthly_debt_payments: number
}

export interface Document {
  id: string
  company_id: string
  filename: string
  file_size_bytes: number
  status: 'uploaded' | 'queued' | 'processing' | 'completed' | 'failed' | 'archived'
  created_at: string
  file_path: string
}

export interface EmailNotification {
  id: string
  org_id: string
  email: string
  events: string[]
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface UploadResponse {
  success: boolean
  documents: Array<{
    id: string
    filename: string
    file_path: string
  }>
}

export interface ApiKey {
  id: string
  org_id: string
  key_name: string
  prefix: string
  is_default: boolean
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

export interface CreateApiKeyResponse {
  id: string
  key: string
  prefix: string
}

export interface RegenerateApiKeyResponse {
  key: string
}

export interface Webhook {
  id: string
  org_id: string
  name: string | null
  url: string
  events: string[]
  status: 'active' | 'inactive' | 'failed'
  secret: string | null
  last_triggered_at: string | null
  failure_count: number
  created_at: string
  updated_at: string
}

export interface WebhookTestResult {
  success: boolean
  response: any
}

// ============================================================================
// TRIGGERS (AUTOMATION RULES) INTERFACES
// ============================================================================

/**
 * Trigger (Automation Rule) entity
 */
export interface Trigger {
  id: string
  org_id: string
  name: string
  description: string | null
  condition_type: string
  condition_value: any // jsonb
  action_type: string
  action_target: any // jsonb
  status: 'active' | 'inactive'
  last_triggered_at: string | null
  trigger_count: number
  created_at: string
  updated_at: string
}

/**
 * Trigger configuration for create/update operations
 */
export interface TriggerConfig {
  name: string
  description?: string
  condition_type: string
  condition_value: any
  action_type: string
  action_target: any
}

/**
 * Audit log entry
 */
export interface AuditLog {
  id: string
  org_id: string
  user_id: string
  action: string
  resource_type: string
  resource_id: string | null
  details: any // jsonb
  created_at: string
}

export const api = {
  /**
   * Fetch paginated list of companies
   */
  async getCompanies(page = 1, limit = 50): Promise<CompanyListResponse> {
    return invokeWithAuth<CompanyListResponse>('list-companies', { page, limit })
  },

  /**
   * Fetch detailed information for a specific company
   */
  async getCompanyDetail(id: string): Promise<CompanyDetailResponse> {
    return invokeWithAuth<CompanyDetailResponse>('get-company-detail', { id })
  },

  /**
   * Fetch transactions for a specific bank statement (lazy-loaded)
   */
  async getStatementTransactions(statementId: string): Promise<StatementTransaction[]> {
    const response = await invokeWithAuth<{ transactions: StatementTransaction[] }>(
      'get-statement-transactions',
      { statement_id: statementId }
    )
    return response.transactions
  },

  /**
   * Fetch debt information for a specific company
   */
  async getCompanyDebts(id: string): Promise<CompanyDebtsResponse> {
    return invokeWithAuth<CompanyDebtsResponse>('get-company-debts', { id })
  },

  /**
   * Upload documents to Supabase Storage
   * Files are uploaded to 'incoming-documents' bucket
   */
  async uploadDocuments(files: File[], companyId?: string): Promise<UploadResponse> {
    const uploadedDocs: Array<{ id: string; filename: string; file_path: string }> = []

    for (const file of files) {
      // Generate unique file path with timestamp
      const timestamp = Date.now()
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const filePath = `${companyId || 'unassigned'}/${timestamp}_${sanitizedFilename}`

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('incoming-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('Storage upload error:', error)
        throw new Error(`Failed to upload ${file.name}: ${error.message}`)
      }

      // Create document record in database
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          company_id: companyId || null,
          filename: file.name,
          file_path: data.path,
          file_size_bytes: file.size,
          file_type: file.type,
          status: 'uploaded'
        })
        .select('id, filename, file_path')
        .single()

      if (docError) {
        console.error('Document record creation error:', docError)
        throw new Error(`Failed to create document record: ${docError.message}`)
      }

      uploadedDocs.push(docData)
    }

    return {
      success: true,
      documents: uploadedDocs
    }
  },

  /**
   * Fetch documents for a specific company
   */
  async getDocuments(companyId: string): Promise<Document[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('id, company_id, filename, file_size_bytes, status, created_at, file_path')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('API Error (getDocuments):', error)
      throw new Error(error.message || 'Failed to fetch documents')
    }

    return data as Document[]
  },

  /**
   * Upload documents via Edge Function
   * This uses the upload-documents Edge Function which handles:
   * - Storage upload
   * - Document record creation
   * - Processing pipeline initiation
   */
  async uploadDocumentsViaEdgeFunction(files: File[]): Promise<{
    success: boolean
    submissions: Array<{
      id: string
      documents: Array<{
        id: string
        filename: string
        status: 'uploaded' | 'failed'
        processing_initiated: boolean
        error?: string
      }>
    }>
    summary: {
      total_files: number
      successful: number
      failed: number
    }
  }> {
    // Create FormData with files
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('upload-documents', {
      body: formData
    })

    if (error) {
      console.error('API Error (uploadDocumentsViaEdgeFunction):', error)
      throw new Error(error.message || 'Failed to upload documents')
    }

    return data
  },

  // ============================================================================
  // TRIGGERS (AUTOMATION RULES) CRUD OPERATIONS
  // ============================================================================

  /**
   * Fetch all automation triggers for organization
   * @param orgId - Organization UUID
   * @returns Array of triggers ordered by created_at DESC
   */
  async getTriggers(orgId: string): Promise<Trigger[]> {
    const { data, error } = await supabase
      .from('triggers')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('API Error (getTriggers):', error)
      throw new ApiError(error.message || 'Failed to fetch triggers', 500)
    }

    return data as Trigger[]
  },

  /**
   * Create new automation trigger
   * @param orgId - Organization UUID
   * @param ruleConfig - Trigger configuration
   * @returns Created trigger
   */
  async createTrigger(orgId: string, ruleConfig: TriggerConfig): Promise<Trigger> {
    // Wait for session to get user_id for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Insert trigger
    const { data: trigger, error: triggerError } = await supabase
      .from('triggers')
      .insert({
        org_id: orgId,
        name: ruleConfig.name,
        description: ruleConfig.description || null,
        condition_type: ruleConfig.condition_type,
        condition_value: ruleConfig.condition_value,
        action_type: ruleConfig.action_type,
        action_target: ruleConfig.action_target,
        status: 'active',
        trigger_count: 0
      })
      .select()
      .single()

    if (triggerError) {
      console.error('API Error (createTrigger):', triggerError)
      throw new ApiError(triggerError.message || 'Failed to create trigger', 500)
    }

    // Insert audit log
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: orgId,
        user_id: session.user.id,
        action: 'created',
        resource_type: 'trigger',
        resource_id: trigger.id,
        details: {
          trigger_name: ruleConfig.name,
          condition_type: ruleConfig.condition_type,
          action_type: ruleConfig.action_type
        }
      })

    if (auditError) {
      console.error('API Warning (createTrigger audit log):', auditError)
      // Don't fail the operation if audit log fails
    }

    return trigger as Trigger
  },

  /**
   * Update existing automation trigger
   * @param triggerId - Trigger UUID
   * @param ruleConfig - Updated trigger configuration
   */
  async updateTrigger(triggerId: string, ruleConfig: TriggerConfig): Promise<void> {
    // Wait for session to get user_id for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Get existing trigger for org_id (needed for audit log)
    const { data: existingTrigger, error: fetchError } = await supabase
      .from('triggers')
      .select('org_id, name')
      .eq('id', triggerId)
      .single()

    if (fetchError) {
      console.error('API Error (updateTrigger - fetch):', fetchError)
      throw new ApiError(fetchError.message || 'Trigger not found', 404)
    }

    // Update trigger
    const { error: updateError } = await supabase
      .from('triggers')
      .update({
        name: ruleConfig.name,
        description: ruleConfig.description || null,
        condition_type: ruleConfig.condition_type,
        condition_value: ruleConfig.condition_value,
        action_type: ruleConfig.action_type,
        action_target: ruleConfig.action_target,
        updated_at: new Date().toISOString()
      })
      .eq('id', triggerId)

    if (updateError) {
      console.error('API Error (updateTrigger):', updateError)
      throw new ApiError(updateError.message || 'Failed to update trigger', 500)
    }

    // Insert audit log
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: existingTrigger.org_id,
        user_id: session.user.id,
        action: 'updated',
        resource_type: 'trigger',
        resource_id: triggerId,
        details: {
          old_name: existingTrigger.name,
          new_name: ruleConfig.name,
          condition_type: ruleConfig.condition_type,
          action_type: ruleConfig.action_type
        }
      })

    if (auditError) {
      console.error('API Warning (updateTrigger audit log):', auditError)
      // Don't fail the operation if audit log fails
    }
  },

  /**
   * Delete automation trigger
   * @param triggerId - Trigger UUID
   */
  async deleteTrigger(triggerId: string): Promise<void> {
    // Wait for session to get user_id for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Get existing trigger for audit log (before deletion)
    const { data: existingTrigger, error: fetchError } = await supabase
      .from('triggers')
      .select('org_id, name')
      .eq('id', triggerId)
      .single()

    if (fetchError) {
      console.error('API Error (deleteTrigger - fetch):', fetchError)
      throw new ApiError(fetchError.message || 'Trigger not found', 404)
    }

    // Delete trigger
    const { error: deleteError } = await supabase
      .from('triggers')
      .delete()
      .eq('id', triggerId)

    if (deleteError) {
      console.error('API Error (deleteTrigger):', deleteError)
      throw new ApiError(deleteError.message || 'Failed to delete trigger', 500)
    }

    // Insert audit log
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: existingTrigger.org_id,
        user_id: session.user.id,
        action: 'deleted',
        resource_type: 'trigger',
        resource_id: triggerId,
        details: {
          trigger_name: existingTrigger.name
        }
      })

    if (auditError) {
      console.error('API Warning (deleteTrigger audit log):', auditError)
      // Don't fail the operation if audit log fails
    }
  },

  /**
   * Toggle trigger status (active/inactive)
   * @param triggerId - Trigger UUID
   * @param status - New status ('active' or 'inactive')
   */
  async toggleTrigger(triggerId: string, status: 'active' | 'inactive'): Promise<void> {
    // Wait for session to get user_id for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Get existing trigger for audit log
    const { data: existingTrigger, error: fetchError } = await supabase
      .from('triggers')
      .select('org_id, name, status')
      .eq('id', triggerId)
      .single()

    if (fetchError) {
      console.error('API Error (toggleTrigger - fetch):', fetchError)
      throw new ApiError(fetchError.message || 'Trigger not found', 404)
    }

    // Update trigger status
    const { error: updateError } = await supabase
      .from('triggers')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', triggerId)

    if (updateError) {
      console.error('API Error (toggleTrigger):', updateError)
      throw new ApiError(updateError.message || 'Failed to toggle trigger', 500)
    }

    // Insert audit log
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: existingTrigger.org_id,
        user_id: session.user.id,
        action: 'toggled',
        resource_type: 'trigger',
        resource_id: triggerId,
        details: {
          trigger_name: existingTrigger.name,
          old_status: existingTrigger.status,
          new_status: status
        }
      })

    if (auditError) {
      console.error('API Warning (toggleTrigger audit log):', auditError)
      // Don't fail the operation if audit log fails
    }
  },

  // ============================================================================
  // EMAIL NOTIFICATIONS CRUD OPERATIONS
  // ============================================================================

  /**
   * Fetch all email notifications for organization
   * RLS auto-filters by user's org_id via JWT
   * @param orgId - Organization UUID
   * @returns Array of email notifications ordered by created_at DESC
   */
  async getEmailNotifications(orgId: string): Promise<EmailNotification[]> {
    const { data, error } = await supabase
      .from('email_notifications')
      .select('id, org_id, email, events, status, created_at, updated_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('API Error (getEmailNotifications):', error)
      throw new ApiError(error.message || 'Failed to fetch email notifications', 500)
    }

    return data as EmailNotification[]
  },

  /**
   * Add new email notification
   * Inserts notification record and creates audit log entry
   * @param orgId - Organization UUID
   * @param email - Email address to receive notifications
   * @param events - Array of event types to subscribe to
   * @returns Created email notification
   */
  async addEmailNotification(orgId: string, email: string, events: string[]): Promise<EmailNotification> {
    // Wait for session to ensure user_id is available for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Insert email notification
    const { data: notification, error: notificationError } = await supabase
      .from('email_notifications')
      .insert({
        org_id: orgId,
        email,
        events,
        status: 'active'
      })
      .select('id, org_id, email, events, status, created_at, updated_at')
      .single()

    if (notificationError) {
      console.error('API Error (addEmailNotification):', notificationError)
      throw new ApiError(
        notificationError.message || 'Failed to create email notification',
        500
      )
    }

    // Insert audit log entry
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: orgId,
        user_id: session.user.id,
        action: 'created',
        resource_type: 'email_notification',
        resource_id: notification.id,
        details: {
          email,
          events,
          status: 'active'
        }
      })

    if (auditError) {
      console.error('API Warning (addEmailNotification audit log):', auditError)
      // Don't throw - notification was created successfully, audit log is secondary
    }

    return notification as EmailNotification
  },

  /**
   * Update email notification events
   * Updates notification record and creates audit log entry
   * @param notificationId - Email notification UUID
   * @param events - Updated array of event types
   */
  async updateEmailNotification(notificationId: string, events: string[]): Promise<void> {
    // Wait for session to ensure user_id is available for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Fetch current notification for audit log (before update)
    const { data: currentNotification, error: fetchError } = await supabase
      .from('email_notifications')
      .select('org_id, email, events')
      .eq('id', notificationId)
      .single()

    if (fetchError) {
      console.error('API Error (updateEmailNotification - fetch):', fetchError)
      throw new ApiError(
        fetchError.message || 'Failed to fetch email notification',
        404
      )
    }

    // Update email notification
    const { error: updateError } = await supabase
      .from('email_notifications')
      .update({
        events,
        updated_at: new Date().toISOString()
      })
      .eq('id', notificationId)

    if (updateError) {
      console.error('API Error (updateEmailNotification):', updateError)
      throw new ApiError(
        updateError.message || 'Failed to update email notification',
        500
      )
    }

    // Insert audit log entry
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: currentNotification.org_id,
        user_id: session.user.id,
        action: 'updated',
        resource_type: 'email_notification',
        resource_id: notificationId,
        details: {
          old_events: currentNotification.events,
          new_events: events,
          email: currentNotification.email
        }
      })

    if (auditError) {
      console.error('API Warning (updateEmailNotification audit log):', auditError)
      // Don't throw - notification was updated successfully, audit log is secondary
    }
  },

  /**
   * Remove email notification
   * Deletes notification record and creates audit log entry
   * @param notificationId - Email notification UUID
   */
  async removeEmailNotification(notificationId: string): Promise<void> {
    // Wait for session to ensure user_id is available for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Fetch notification details for audit log (before deletion)
    const { data: notification, error: fetchError } = await supabase
      .from('email_notifications')
      .select('org_id, email, events, status')
      .eq('id', notificationId)
      .single()

    if (fetchError) {
      console.error('API Error (removeEmailNotification - fetch):', fetchError)
      throw new ApiError(
        fetchError.message || 'Failed to fetch email notification',
        404
      )
    }

    // Delete email notification
    const { error: deleteError } = await supabase
      .from('email_notifications')
      .delete()
      .eq('id', notificationId)

    if (deleteError) {
      console.error('API Error (removeEmailNotification):', deleteError)
      throw new ApiError(
        deleteError.message || 'Failed to delete email notification',
        500
      )
    }

    // Insert audit log entry
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: notification.org_id,
        user_id: session.user.id,
        action: 'deleted',
        resource_type: 'email_notification',
        resource_id: notificationId,
        details: {
          email: notification.email,
          events: notification.events,
          status: notification.status
        }
      })

    if (auditError) {
      console.error('API Warning (removeEmailNotification audit log):', auditError)
      // Don't throw - notification was deleted successfully, audit log is secondary
    }
  },

  /**
   * Test email notification
   * Triggers test email and creates audit log entry
   * Note: Actual email sending should be implemented via Edge Function
   * @param notificationId - Email notification UUID
   */
  async testEmailNotification(notificationId: string): Promise<void> {
    // Wait for session to ensure user_id is available for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Fetch notification details for audit log and email sending
    const { data: notification, error: fetchError } = await supabase
      .from('email_notifications')
      .select('org_id, email, events, status')
      .eq('id', notificationId)
      .single()

    if (fetchError) {
      console.error('API Error (testEmailNotification - fetch):', fetchError)
      throw new ApiError(
        fetchError.message || 'Failed to fetch email notification',
        404
      )
    }

    // TODO: Call Edge Function to send test email
    // For now, just log the action
    console.log(`Test email would be sent to ${notification.email} for notification ${notificationId}`)

    // Insert audit log entry
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: notification.org_id,
        user_id: session.user.id,
        action: 'tested',
        resource_type: 'email_notification',
        resource_id: notificationId,
        details: {
          email: notification.email,
          events: notification.events,
          test_timestamp: new Date().toISOString()
        }
      })

    if (auditError) {
      console.error('API Warning (testEmailNotification audit log):', auditError)
      // Don't throw - test was initiated successfully, audit log is secondary
    }
  },

  // ============================================================================
  // WEBHOOKS CRUD OPERATIONS
  // ============================================================================

  /**
   * Fetch all webhooks for organization
   * RLS auto-filters by user's org_id via JWT
   * @param orgId - Organization UUID
   * @returns Array of webhooks ordered by created_at DESC
   */
  async getWebhooks(orgId: string): Promise<Webhook[]> {
    const { data, error } = await supabase
      .from('webhooks')
      .select('id, org_id, name, url, events, status, secret, last_triggered_at, failure_count, created_at, updated_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('API Error (getWebhooks):', error)
      throw new ApiError(error.message || 'Failed to fetch webhooks', 500)
    }

    return data as Webhook[]
  },

  /**
   * Create new webhook
   * Generates random webhook secret in format: whsec_{64_hex_chars}
   * Inserts webhook record and creates audit log entry
   * @param orgId - Organization UUID
   * @param name - Webhook name
   * @param url - Webhook endpoint URL
   * @param events - Array of event types to subscribe to
   * @returns Created webhook
   */
  async createWebhook(orgId: string, name: string, url: string, events: string[]): Promise<Webhook> {
    // Wait for session to ensure user_id is available for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Generate webhook secret: whsec_{64 random hex chars}
    const secretBytes = new Uint8Array(32) // 32 bytes = 64 hex chars
    crypto.getRandomValues(secretBytes)
    const secret = 'whsec_' + Array.from(secretBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // Insert webhook
    const { data: webhook, error: webhookError } = await supabase
      .from('webhooks')
      .insert({
        org_id: orgId,
        name,
        url,
        events,
        secret,
        status: 'active',
        failure_count: 0
      })
      .select()
      .single()

    if (webhookError) {
      console.error('API Error (createWebhook):', webhookError)
      throw new ApiError(webhookError.message || 'Failed to create webhook', 500)
    }

    // Write to audit log
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: orgId,
        user_id: session.user.id,
        action: 'created',
        resource_type: 'webhook',
        resource_id: webhook.id,
        new_values: {
          name,
          url,
          events,
          status: 'active'
        },
        metadata: {
          secret_generated: true
        },
        timestamp: new Date().toISOString()
      })

    if (auditError) {
      console.error('API Warning (createWebhook audit log):', auditError)
      // Don't throw - webhook was created successfully, audit log is secondary
    }

    return webhook
  },

  /**
   * Update webhook configuration
   * Updates name, url, events, or status
   * @param webhookId - Webhook UUID
   * @param updates - Partial webhook configuration to update
   * @returns void
   */
  async updateWebhook(
    webhookId: string,
    updates: {
      name?: string
      url?: string
      events?: string[]
      status?: 'active' | 'inactive' | 'failed'
    }
  ): Promise<void> {
    // Wait for session to ensure user_id is available for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Get current webhook state for audit log
    const { data: currentWebhook, error: fetchError } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .single()

    if (fetchError || !currentWebhook) {
      console.error('API Error (updateWebhook fetch):', fetchError)
      throw new ApiError('Webhook not found', 404)
    }

    // Update webhook
    const { error: updateError } = await supabase
      .from('webhooks')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', webhookId)

    if (updateError) {
      console.error('API Error (updateWebhook):', updateError)
      throw new ApiError(updateError.message || 'Failed to update webhook', 500)
    }

    // Write to audit log
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: currentWebhook.org_id,
        user_id: session.user.id,
        action: 'updated',
        resource_type: 'webhook',
        resource_id: webhookId,
        old_values: {
          name: currentWebhook.name,
          url: currentWebhook.url,
          events: currentWebhook.events,
          status: currentWebhook.status
        },
        new_values: updates,
        timestamp: new Date().toISOString()
      })

    if (auditError) {
      console.error('API Warning (updateWebhook audit log):', auditError)
      // Don't throw - update was successful, audit log is secondary
    }
  },

  /**
   * Delete webhook
   * Permanently removes webhook record
   * @param webhookId - Webhook UUID
   * @returns void
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    // Wait for session to ensure user_id is available for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Get webhook for audit log before deletion
    const { data: webhook, error: fetchError } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .single()

    if (fetchError || !webhook) {
      console.error('API Error (deleteWebhook fetch):', fetchError)
      throw new ApiError('Webhook not found', 404)
    }

    // Delete webhook (hard delete, not soft)
    const { error: deleteError } = await supabase
      .from('webhooks')
      .delete()
      .eq('id', webhookId)

    if (deleteError) {
      console.error('API Error (deleteWebhook):', deleteError)
      throw new ApiError(deleteError.message || 'Failed to delete webhook', 500)
    }

    // Write to audit log
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: webhook.org_id,
        user_id: session.user.id,
        action: 'deleted',
        resource_type: 'webhook',
        resource_id: webhookId,
        old_values: {
          name: webhook.name,
          url: webhook.url,
          events: webhook.events,
          status: webhook.status
        },
        timestamp: new Date().toISOString()
      })

    if (auditError) {
      console.error('API Warning (deleteWebhook audit log):', auditError)
      // Don't throw - deletion was successful, audit log is secondary
    }
  },

  /**
   * Test webhook by sending HTTP POST request
   * Sends test payload to webhook URL with signature header
   * @param webhookId - Webhook UUID
   * @returns Test result with success status and HTTP response
   */
  async testWebhook(webhookId: string): Promise<WebhookTestResult> {
    // Wait for session to ensure user_id is available for audit log
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Get webhook details
    const { data: webhook, error: fetchError } = await supabase
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .single()

    if (fetchError || !webhook) {
      console.error('API Error (testWebhook fetch):', fetchError)
      throw new ApiError('Webhook not found', 404)
    }

    // Create test payload
    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery from ClearScrub',
        webhook_id: webhookId,
        webhook_name: webhook.name
      }
    }

    // Send HTTP POST to webhook URL
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': webhook.secret || '',
          'User-Agent': 'ClearScrub-Webhooks/1.0'
        },
        body: JSON.stringify(testPayload)
      })

      const responseData = await response.text()

      // Update last_triggered_at
      await supabase
        .from('webhooks')
        .update({
          last_triggered_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', webhookId)

      // Write to audit log
      const { error: auditError } = await supabase
        .from('audit_log')
        .insert({
          org_id: webhook.org_id,
          user_id: session.user.id,
          action: 'tested',
          resource_type: 'webhook',
          resource_id: webhookId,
          metadata: {
            http_status: response.status,
            success: response.ok
          },
          timestamp: new Date().toISOString()
        })

      if (auditError) {
        console.error('API Warning (testWebhook audit log):', auditError)
        // Don't throw - test was initiated successfully, audit log is secondary
      }

      return {
        success: response.ok,
        response: {
          status: response.status,
          statusText: response.statusText,
          body: responseData
        }
      }
    } catch (error: any) {
      console.error('API Error (testWebhook HTTP request):', error)

      // Write failed test to audit log
      await supabase
        .from('audit_log')
        .insert({
          org_id: webhook.org_id,
          user_id: session.user.id,
          action: 'tested',
          resource_type: 'webhook',
          resource_id: webhookId,
          metadata: {
            success: false,
            error: error.message
          },
          timestamp: new Date().toISOString()
        })

      return {
        success: false,
        response: {
          error: error.message
        }
      }
    }
  },

  // ==========================================
  // API KEYS MANAGEMENT
  // ==========================================

  /**
   * Fetch all API keys for an organization
   * Filters out soft-deleted keys (deleted_at IS NULL)
   * @param orgId - Organization ID
   * @returns Array of API keys
   */
  async getApiKeys(orgId: string): Promise<ApiKey[]> {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, org_id, key_name, prefix, is_default, is_active, last_used_at, created_at')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('API Error (getApiKeys):', error)
      throw new ApiError(error.message || 'Failed to fetch API keys', 500)
    }

    return data as ApiKey[]
  },

  /**
   * Create a new API key for an organization
   * Generates key in format: cs_live_{48_hex_chars}
   * @param orgId - Organization ID
   * @param name - Human-readable key name
   * @returns Object containing key ID, raw key (only shown once), and prefix
   */
  async createApiKey(orgId: string, name: string): Promise<CreateApiKeyResponse> {
    // Wait for session to ensure user is authenticated
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Generate raw API key: cs_live_{48 random hex chars}
    const randomBytes = new Uint8Array(24) // 24 bytes = 48 hex chars
    crypto.getRandomValues(randomBytes)
    const randomHex = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    const rawKey = `cs_live_${randomHex}`

    // Extract prefix (first 12 chars for display: "cs_live_abc...")
    const prefix = rawKey.substring(0, 12)

    // Hash the key with SHA-256 for storage
    const encoder = new TextEncoder()
    const data = encoder.encode(rawKey)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Insert API key into database
    const { data: insertData, error: insertError } = await supabase
      .from('api_keys')
      .insert({
        org_id: orgId,
        key_name: name,
        key_hash: keyHash,
        prefix: prefix,
        is_default: false,
        is_active: true
      })
      .select('id, prefix')
      .single()

    if (insertError) {
      console.error('API Error (createApiKey - insert):', insertError)
      throw new ApiError(insertError.message || 'Failed to create API key', 500)
    }

    // Create audit log entry
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: orgId,
        user_id: session.user.id,
        action: 'created',
        resource_type: 'api_key',
        resource_id: insertData.id,
        metadata: {
          key_name: name,
          prefix: prefix
        }
      })

    if (auditError) {
      console.error('Audit log error (createApiKey):', auditError)
      // Don't throw - audit logging failure shouldn't block key creation
    }

    return {
      id: insertData.id,
      key: rawKey, // RAW KEY - only returned this one time
      prefix: insertData.prefix
    }
  },

  /**
   * Regenerate an existing API key
   * Generates new key and updates hash in database
   * @param keyId - API key ID to regenerate
   * @returns Object containing new raw key (only shown once)
   */
  async regenerateApiKey(keyId: string): Promise<RegenerateApiKeyResponse> {
    // Wait for session to ensure user is authenticated
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Get existing key to verify ownership and get org_id
    const { data: existingKey, error: fetchError } = await supabase
      .from('api_keys')
      .select('id, org_id, key_name, prefix')
      .eq('id', keyId)
      .is('deleted_at', null)
      .single()

    if (fetchError || !existingKey) {
      console.error('API Error (regenerateApiKey - fetch):', fetchError)
      throw new ApiError('API key not found', 404)
    }

    // Generate new raw API key
    const randomBytes = new Uint8Array(24)
    crypto.getRandomValues(randomBytes)
    const randomHex = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    const rawKey = `cs_live_${randomHex}`

    // Hash the new key
    const encoder = new TextEncoder()
    const data = encoder.encode(rawKey)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Update key hash in database
    const { error: updateError } = await supabase
      .from('api_keys')
      .update({
        key_hash: keyHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', keyId)

    if (updateError) {
      console.error('API Error (regenerateApiKey - update):', updateError)
      throw new ApiError(updateError.message || 'Failed to regenerate API key', 500)
    }

    // Create audit log entry
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: existingKey.org_id,
        user_id: session.user.id,
        action: 'regenerated',
        resource_type: 'api_key',
        resource_id: keyId,
        metadata: {
          key_name: existingKey.key_name,
          prefix: existingKey.prefix
        }
      })

    if (auditError) {
      console.error('Audit log error (regenerateApiKey):', auditError)
      // Don't throw - audit logging failure shouldn't block regeneration
    }

    return {
      key: rawKey // RAW KEY - only returned this one time
    }
  },

  /**
   * Revoke an API key (sets is_active = false)
   * Key remains in database but cannot be used
   * @param keyId - API key ID to revoke
   */
  async revokeApiKey(keyId: string): Promise<void> {
    // Wait for session to ensure user is authenticated
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Get existing key to verify ownership and get org_id
    const { data: existingKey, error: fetchError } = await supabase
      .from('api_keys')
      .select('id, org_id, key_name, prefix')
      .eq('id', keyId)
      .is('deleted_at', null)
      .single()

    if (fetchError || !existingKey) {
      console.error('API Error (revokeApiKey - fetch):', fetchError)
      throw new ApiError('API key not found', 404)
    }

    // Revoke the key
    const { error: updateError } = await supabase
      .from('api_keys')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', keyId)

    if (updateError) {
      console.error('API Error (revokeApiKey - update):', updateError)
      throw new ApiError(updateError.message || 'Failed to revoke API key', 500)
    }

    // Create audit log entry
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: existingKey.org_id,
        user_id: session.user.id,
        action: 'revoked',
        resource_type: 'api_key',
        resource_id: keyId,
        metadata: {
          key_name: existingKey.key_name,
          prefix: existingKey.prefix
        }
      })

    if (auditError) {
      console.error('Audit log error (revokeApiKey):', auditError)
      // Don't throw - audit logging failure shouldn't block revocation
    }
  },

  /**
   * Delete an API key (soft delete - sets deleted_at timestamp)
   * Prevents deletion of default keys
   * @param keyId - API key ID to delete
   */
  async deleteApiKey(keyId: string): Promise<void> {
    // Wait for session to ensure user is authenticated
    const session = await waitForSession()
    if (!session) {
      throw new ApiError('Unauthorized: Please log in to continue', 401)
    }

    // Get existing key to verify ownership, check if default, and get org_id
    const { data: existingKey, error: fetchError } = await supabase
      .from('api_keys')
      .select('id, org_id, key_name, prefix, is_default')
      .eq('id', keyId)
      .is('deleted_at', null)
      .single()

    if (fetchError || !existingKey) {
      console.error('API Error (deleteApiKey - fetch):', fetchError)
      throw new ApiError('API key not found', 404)
    }

    // Prevent deletion of default keys
    if (existingKey.is_default) {
      throw new ApiError('Cannot delete default API key', 400)
    }

    // Soft delete the key
    const { error: deleteError } = await supabase
      .from('api_keys')
      .update({
        deleted_at: new Date().toISOString()
      })
      .eq('id', keyId)

    if (deleteError) {
      console.error('API Error (deleteApiKey - update):', deleteError)
      throw new ApiError(deleteError.message || 'Failed to delete API key', 500)
    }

    // Create audit log entry
    const { error: auditError } = await supabase
      .from('audit_log')
      .insert({
        org_id: existingKey.org_id,
        user_id: session.user.id,
        action: 'deleted',
        resource_type: 'api_key',
        resource_id: keyId,
        metadata: {
          key_name: existingKey.key_name,
          prefix: existingKey.prefix
        }
      })

    if (auditError) {
      console.error('Audit log error (deleteApiKey):', auditError)
      // Don't throw - audit logging failure shouldn't block deletion
    }
  }
}
