import { z } from 'zod'

/**
 * Login Form Schema
 * Validates email and password fields for authentication
 */
export const loginSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .min(1, 'Email is required'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().optional().default(false)
})

export type LoginFormData = z.infer<typeof loginSchema>

/**
 * SignUp Form Schema
 * Validates email, password strength, and terms agreement
 */
export const signupSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .min(1, 'Email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z
    .string()
    .min(1, 'Please confirm your password'),
  agreedToTerms: z
    .boolean()
    .refine(val => val === true, {
      message: 'You must agree to the terms and conditions'
    })
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
})

export type SignupFormData = z.infer<typeof signupSchema>

/**
 * Organization Name Edit Schema
 * Validates organization name field
 */
export const organizationNameSchema = z.object({
  name: z
    .string()
    .min(1, 'Organization name is required')
    .min(2, 'Organization name must be at least 2 characters')
    .max(255, 'Organization name must be less than 255 characters')
})

export type OrganizationNameFormData = z.infer<typeof organizationNameSchema>

/**
 * Trigger Creation Schema
 * Validates automation trigger configuration
 */
export const triggerSchema = z.object({
  name: z
    .string()
    .min(1, 'Trigger name is required')
    .min(2, 'Trigger name must be at least 2 characters')
    .max(255, 'Trigger name must be less than 255 characters'),
  condition_type: z
    .string()
    .min(1, 'Condition type is required'),
  condition_value: z
    .string()
    .optional()
    .transform(val => {
      if (!val) return {}
      try {
        return JSON.parse(val)
      } catch {
        throw new Error('Condition value must be valid JSON')
      }
    }),
  action_type: z
    .string()
    .min(1, 'Action type is required'),
  action_target: z
    .string()
    .optional()
    .transform(val => {
      if (!val) return {}
      try {
        return JSON.parse(val)
      } catch {
        throw new Error('Action target must be valid JSON')
      }
    })
})

export type TriggerFormData = z.infer<typeof triggerSchema>
