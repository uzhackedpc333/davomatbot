import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes that require authentication
  const protectedPaths = ['/admin', '/teacher', '/miniapp']
  const isProtectedPath = protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path))

  if (isProtectedPath && !user) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Role-based route protection
  if (user) {
    // Get user profile to check role
    const { data: profile } = await supabase.from('profiles').select('system_role').eq('id', user.id).single()

    // Admin routes - require SUPER_ADMIN, SCHOOL_ADMIN, or ZAVUCH
    if (request.nextUrl.pathname.startsWith('/admin')) {
      if (!profile || !['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ZAVUCH'].includes(profile.system_role)) {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
    }

    // Teacher routes - require TEACHER role
    if (request.nextUrl.pathname.startsWith('/teacher')) {
      if (!profile || profile.system_role !== 'TEACHER') {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
    }

    // MiniApp routes - require TEACHER role with approved membership
    if (request.nextUrl.pathname.startsWith('/miniapp')) {
      if (!profile || profile.system_role !== 'TEACHER') {
        return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}