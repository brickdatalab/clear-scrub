import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../hooks/useAuth'
import { Navigate, Link, useNavigate } from 'react-router-dom'
import { loginSchema, type LoginFormData } from '../schemas/auth'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardHeader, CardContent, CardFooter } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Loader2 } from 'lucide-react'

export default function Login() {
  const { isAuthenticated, signIn } = useAuth()
  const navigate = useNavigate()
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch
  } = useForm({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false
    }
  })

  const rememberMeValue = watch('rememberMe')

  // Redirect if already authenticated (AFTER all hooks)
  if (isAuthenticated) {
    return <Navigate to="/companies" replace />
  }

  const onSubmit = async (data: any) => {
    setIsSubmitting(true)
    setGlobalError(null)

    try {
      await signIn(data.email.trim(), data.password)

      // Handle remember me
      if (data.rememberMe) {
        localStorage.setItem('clearscrub_remembered_email', data.email)
      } else {
        localStorage.removeItem('clearscrub_remembered_email')
      }

      // Navigate after successful login
      navigate('/companies', { replace: true })
    } catch (err: any) {
      console.error('Login error:', err)

      if (err?.message?.includes('Invalid login credentials')) {
        setGlobalError('Invalid email or password. Please try again.')
      } else if (err?.message?.includes('Email not confirmed')) {
        setGlobalError('Please confirm your email address before signing in.')
      } else {
        setGlobalError(err?.message || 'An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Header Section */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img
            className="h-12 w-auto"
            src="/assets/logos/logo-small.png"
            alt="ClearScrub"
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Access your financial dashboard
        </p>
      </div>

      {/* Form Section */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="py-8 px-6 shadow-md">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {/* Global Error */}
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
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                disabled={isSubmitting}
                {...register('password')}
                aria-invalid={errors.password ? 'true' : 'false'}
              />
              {errors.password && (
                <p className="text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            {/* Remember Me & Forgot Password Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  {...register('rememberMe')}
                  disabled={isSubmitting}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-600 border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="remember-me" className="ml-2 block text-14 text-gray-700 cursor-pointer">
                  Remember me
                </label>
              </div>

              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  alert('Password reset functionality will be available soon.')
                }}
                className="font-medium text-primary-600 hover:text-primary-700 transition-colors text-14"
              >
                Forgot password?
              </a>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Sign Up Link */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">Need an account?</span>
              </div>
            </div>
            <div className="mt-3 text-center">
              <Link
                to="/signup"
                className="text-primary-600 hover:text-primary-700 font-medium text-sm"
              >
                Create a new account
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
