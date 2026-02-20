import { NextResponse } from 'next/server'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Default next destination
  let next = searchParams.get('next') ?? '/dashboard'
  if (!next.startsWith('/')) {
    // if "next" is not a relative URL, use the default
    next = '/dashboard'
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // After OAuth session is established, check if user exists in users table
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('phone, dob, state, country, role')
            .eq('id', user.id)
            .single()

          // If profile doesn't exist (first-time Google sign-in), create it
          if (profileError && profileError.code === 'PGRST116') {
            const { error: insertError } = await supabase.from("users").insert([
              {
                id: user.id,
                email: user.email,
                phone: null,
                dob: null,
                state: null,
                country: null,
                role: null,
              },
            ])

            if (insertError) {
              console.error("Error creating user profile:", insertError.message)
            } else {
              console.log("Created new user profile for Google OAuth user")
            }
            
            // New user should go to settings to complete profile
            next = '/dashboard/settings'
          } else if (profile) {
            // Existing user - check if profile is complete
            const isIncomplete = !profile.phone || !profile.dob || !profile.state || !profile.country || !profile.role

            if (isIncomplete) {
              next = '/dashboard/settings'
            }
          }
        }
      } catch (error) {
        console.error("Error in OAuth callback:", error)
        // If any error occurs, fall back to default next
      }

      const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}