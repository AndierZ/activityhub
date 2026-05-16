import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleGoogleSignIn() {
    try {
      setLoading(true)
      setError(null)
      await signInWithGoogle()
      // Browser redirects to Google — nothing more to do here
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* Top section — branding */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 pt-16 pb-8">

        {/* Logo mark */}
        <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mb-6">
          <i className="ti ti-calendar-heart text-primary-600 text-3xl" aria-hidden="true" />
        </div>

        {/* Wordmark */}
        <h1 className="font-serif text-4xl text-gray-900 mb-2">
          ActivityHub
        </h1>
        <p className="text-sm text-gray-400 text-center max-w-xs leading-relaxed">
          One place to manage every child's lessons, sessions, and payments
        </p>

        {/* Illustration area — three activity chips */}
        <div className="flex gap-2 mt-8 flex-wrap justify-center">
          {[
            { icon: 'ti-music',      label: 'Piano',     color: 'bg-primary-100 text-primary-600' },
            { icon: 'ti-swimming',   label: 'Swimming',  color: 'bg-teal-50 text-teal-600' },
            { icon: 'ti-palette',    label: 'Art',       color: 'bg-orange-50 text-orange-500' },
            { icon: 'ti-ball-football', label: 'Sports', color: 'bg-green-50 text-green-600' },
          ].map(a => (
            <div
              key={a.label}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${a.color}`}
            >
              <i className={`ti ${a.icon} text-sm`} aria-hidden="true" />
              {a.label}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom section — sign in */}
      <div className="px-6 pb-12 flex flex-col gap-4">

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 text-center">
            {error}
          </div>
        )}

        {/* Google sign in button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white border border-gray-200 rounded-xl shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              Redirecting to Google…
            </>
          ) : (
            <>
              {/* Google G logo */}
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <p className="text-xs text-gray-400 text-center px-4">
          By continuing you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}
