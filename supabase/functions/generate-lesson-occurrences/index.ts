import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { school_id, start_date, end_date, academic_year } = body

    if (!school_id || !start_date || !end_date || !academic_year) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get all regular lessons for this school and academic year
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, weekday')
      .eq('school_id', school_id)
      .eq('academic_year', academic_year)
      .eq('status', 'SCHEDULED')
      .eq('is_exception', false)

    if (lessonsError) throw lessonsError

    let createdCount = 0

    for (const lesson of lessons || []) {
      let currentDate = new Date(start_date)
      const endDate = new Date(end_date)

      while (currentDate <= endDate) {
        // Check if this date matches the lesson's weekday
        // JavaScript: 0=Sunday, 1=Monday, ..., 6=Saturday
        if (currentDate.getDay() === lesson.weekday) {
          const { error } = await supabase
            .from('lesson_occurrences')
            .upsert({
              lesson_id: lesson.id,
              occurrence_date: currentDate.toISOString().split('T')[0],
              status: 'SCHEDULED',
            }, { onConflict: 'lesson_id,occurrence_date' })

          if (!error) createdCount++
        }
        currentDate.setDate(currentDate.getDate() + 1)
      }
    }

    // Handle exception lessons (one-off)
    const { data: exceptionLessons } = await supabase
      .from('lessons')
      .select('id, exception_date')
      .eq('school_id', school_id)
      .eq('academic_year', academic_year)
      .eq('status', 'SCHEDULED')
      .eq('is_exception', true)
      .gte('exception_date', start_date)
      .lte('exception_date', end_date)

    for (const lesson of exceptionLessons || []) {
      const { error } = await supabase
        .from('lesson_occurrences')
        .upsert({
          lesson_id: lesson.id,
          occurrence_date: lesson.exception_date,
          status: 'SCHEDULED',
        }, { onConflict: 'lesson_id,occurrence_date' })

      if (!error) createdCount++
    }

    // Generate lesson occurrence teachers
    await supabase.rpc('generate_lesson_occurrence_teachers')

    return new Response(JSON.stringify({
      success: true,
      created_occurrences: createdCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Generate lesson occurrences error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})