import React, { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../hooks/useAuth'
import { Navigate, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { signupSchema, type SignupFormData } from '../schemas/auth'
import { Button } from '../components/ui/button'
import { Card, CardHeader, CardContent, CardFooter } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Checkbox } from '../components/ui/checkbox'
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'

export default function SignUp() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [success, setSuccess] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
    control
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    mode: 'onBlur',
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      agreedToTerms: false
    }
  })

  const email = watch('email')
  const password = watch('password')

  // Redirect if already authenticated (AFTER all hooks)
  if (isAuthenticated) {
    return <Navigate to="/companies" replace />
  }

  const onSubmit = async (data: SignupFormData) => {
    setIsSubmitting(true)
    setGlobalError(null)

    try {
      const { data: signupData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (signUpError) throw signUpError

      if (signupData.user && signupData.session) {
        // User is authenticated immediately (no email verification required)
        // Redirect to dashboard immediately
        navigate('/companies', { replace: true })
      } else if (signupData.user && !signupData.session) {
        // Email verification is required
        setSuccess(true)
      }
    } catch (err: any) {
      // Provide specific error messages
      const errorMessage = err?.message || 'An error occurred during signup'
      setGlobalError(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img
            className="h-12 w-auto"
            src="/assets/logos/logo-small.png"
            alt="ClearScrub"
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          {success ? 'Check your inbox' : 'Create your account'}
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {success
            ? 'We sent a verification link to your email'
            : 'Join ClearScrub to access your financial dashboard'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="py-8 px-6 shadow-md">
          {/* Success Screen */}
          {success ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900">Account created successfully!</h3>
                <p className="mt-2 text-sm text-gray-600">
                  We've sent a verification link to <span className="font-medium">{email}</span>
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  Click the link in your email to verify your account and get started with ClearScrub.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Can't find the email? Check your spam folder.
                </p>
                <Link
                  to="/login"
                  className="inline-block text-primary-600 hover:text-primary-700 font-medium text-sm"
                >
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            // Signup Form
            <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
              {/* Global Error Message */}
              {globalError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-6 text-14" role="alert">
                  {globalError}
                </div>
              )}

              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  disabled={isSubmitting}
                  {...register('email')}
                  aria-invalid={errors.email ? 'true' : 'false'}
                />
                {errors.email && (
                  <p className="text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    disabled={isSubmitting}
                    {...register('password')}
                    aria-invalid={errors.password ? 'true' : 'false'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-red-600">{errors.password.message}</p>
                )}
                <p className="text-xs text-gray-500">
                  Must be 8+ characters with uppercase, lowercase, and number
                </p>
              </div>

              {/* Confirm Password Field */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm password"
                    disabled={isSubmitting}
                    {...register('confirmPassword')}
                    aria-invalid={errors.confirmPassword ? 'true' : 'false'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-red-600">{errors.confirmPassword.message}</p>
                )}
              </div>

              {/* Terms Checkbox */}
              <div className="flex items-start space-x-3">
                <Controller
                  name="agreedToTerms"
                  control={control}
                  render={({ field: { value, onChange } }) => (
                    <Checkbox
                      id="agreedToTerms"
                      checked={value}
                      onCheckedChange={onChange}
                      disabled={isSubmitting}
                    />
                  )}
                />
                <label htmlFor="agreedToTerms" className="text-sm text-gray-700 cursor-pointer">
                  I agree to the{' '}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 font-medium"
                  >
                    terms and conditions
                  </a>
                </label>
              </div>
              {errors.agreedToTerms && (
                <p className="text-sm text-red-600">{errors.agreedToTerms.message}</p>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={!isValid || isSubmitting}
                className="w-full"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Sign Up'
                )}
              </Button>
            </form>
          )}

          {/* Sign In Link */}
          {!success && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-gray-500">Already have an account?</span>
                </div>
              </div>
              <div className="mt-3 text-center">
                <Link
                  to="/login"
                  className="text-primary-600 hover:text-primary-700 font-medium text-sm"
                >
                  Sign in to your account
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
