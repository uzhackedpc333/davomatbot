import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'

const CATEGORIES = [
  { value: 'all', label: 'Barchasi' },
  { value: 'attendance', label: 'Davomat' },
  { value: 'schedule', label: 'Jadval' },
  { value: 'workload', label: 'Ish yuklamasi' },
  { value: 'security', label: 'Xavfsizlik' },
  { value: 'teacher', label: 'Ustoz' },
]

const DOCUMENT_TYPES = [
  { value: 'all', label: 'Barchasi' },
  { value: 'daily', label: 'Kundalik' },
  { value: 'weekly', label: 'Haftalik' },
  { value: 'monthly', label: 'Oylik' },
  { value: 'custom', label: 'Maxsus' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'Barchasi' },
  { value: 'GENERATING', label: 'Yaratilmoqda' },
  { value: 'COMPLETED', label: 'Tayyor' },
  { value: 'FAILED', label: 'Xatolik' },
]

async function getDocuments(supabase: any, schoolId: string, searchParams: {
  page?: string; category?: string; document_type?: string; status?: string; date_from?: string; date_to?: string;
}) {
  const page = parseInt(searchParams.page || '1')
  const limit = 15
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('documents')
    .select('*', { count: 'exact' })
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (searchParams.category && searchParams.category !== 'all') {
    query = query.eq('category', searchParams.category)
  }

  if (searchParams.document_type && searchParams.document_type !== 'all') {
    query = query.eq('document_type', searchParams.document_type)
  }

  if (searchParams.status && searchParams.status !== 'all') {
    query = query.eq('status', searchParams.status)
  }

  if (searchParams.date_from) {
    query = query.gte('created_at', searchParams.date_from)
  }

  if (searchParams.date_to) {
    query = query.lte('created_at', searchParams.date_to + 'T23:59:59')
  }

  const { data, count, error } = await query

  if (error) throw error

  return {
    documents: data || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / limit),
    currentPage: page,
  }
}

async function generateDocument(supabase: any, schoolId: string, userId: string, params: {
  category: string; document_type: string; period_start: string; period_end: string;
}) {
  // Call Edge Function for document generation
  const { data, error } = await supabase.functions.invoke('generate-document', {
    body: {
      school_id: schoolId,
      category: params.category,
      document_type: params.document_type,
      period_start: params.period_start,
      period_end: params.period_end,
      filters: {},
    },
  })

  if (error) throw error

  return data
}

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; category?: string; document_type?: string; status?: string; date_from?: string; date_to?: string }>
}) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id: schoolId } = await params
  const resolvedParams = await searchParams

  // Check access
  const { data: membership } = await supabase
    .from('school_memberships')
    .select('membership_role, status')
    .eq('school_id', schoolId)
    .eq('profile_id', user.id)
    .single()

  const { data: profile } = await supabase
    .from('profiles')
    .select('system_role')
    .eq('id', user.id)
    .single()

  const isSuperAdmin = profile?.system_role === 'SUPER_ADMIN'
  const isSchoolAdmin = membership?.membership_role === 'ADMIN' && membership?.status === 'APPROVED'
  const isZavuch = membership?.membership_role === 'ZAVUCH' && membership?.status === 'APPROVED'

  if (!isSuperAdmin && !isSchoolAdmin && !isZavuch) {
    redirect('/unauthorized')
  }

  const { documents, totalCount, totalPages, currentPage } = await getDocuments(supabase, schoolId, resolvedParams)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href={`/admin/schools/${schoolId}`} className="text-sm text-gray-500 hover:text-gray-700 mb-1 inline-block">
            ← Maktabga qaytish
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Hujjatlar va arxiv</h1>
          <p className="text-gray-500 mt-1">Yaratilgan hujjatlarni ko'rish va yuklab olish</p>
        </div>
        <Button onClick={() => handleGenerateNew(schoolId)}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Yangi hujjat yaratish
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-col lg:flex-row gap-4" id="filter-form">
            <select
              name="category"
              value={resolvedParams.category || 'all'}
              className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              name="document_type"
              value={resolvedParams.document_type || 'all'}
              className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DOCUMENT_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              name="status"
              value={resolvedParams.status || 'all'}
              className="w-full sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <div className="flex space-x-2">
              <Input
                name="date_from"
                type="date"
                value={resolvedParams.date_from || ''}
                className="w-full sm:w-40"
                placeholder="Sana dan"
              />
              <Input
                name="date_to"
                type="date"
                value={resolvedParams.date_to || ''}
                className="w-full sm:w-40"
                placeholder="Sana gacha"
              />
            </div>

            <Button type="submit">Filtrlash</Button>
            <a
              href={`/admin/schools/${schoolId}/documents`}
              className="h-10 flex items-center justify-center px-4"
            >
              <Button type="button" variant="outline">Tozalash</Button>
            </a>
          </form>
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nomi</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kategoriya</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Turi</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Davr</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hajmi</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Holat</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Yaratilgan</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Harakatlar</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    Hujjatlar topilmadi
                  </td>
                </tr>
              ) : (
                documents.map((doc: any) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{doc.title}</div>
                      {doc.description && <div className="text-xs text-gray-500">{doc.description}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{doc.category}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{doc.document_type}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {doc.period_start && doc.period_end
                        ? `${format(new Date(doc.period_start), 'dd.MM.yyyy')} - ${format(new Date(doc.period_end), 'dd.MM.yyyy')}`
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {doc.file_size_bytes
                        ? `${(doc.file_size_bytes / 1024).toFixed(1)} KB`
                        : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        doc.status === 'COMPLETED' && 'bg-green-100 text-green-800',
                        doc.status === 'GENERATING' && 'bg-yellow-100 text-yellow-800',
                        doc.status === 'FAILED' && 'bg-red-100 text-red-800'
                      )}>
                        {doc.status === 'COMPLETED' && 'Tayyor'}
                        {doc.status === 'GENERATING' && 'Yaratilmoqda'}
                        {doc.status === 'FAILED' && 'Xatolik'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {format(new Date(doc.created_at), 'dd.MM.yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium space-x-2">
                      {doc.status === 'COMPLETED' && (
                        <Button variant="ghost" size="sm" onClick={() => downloadDocument(doc)}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </Button>
                      )}
                      {doc.status === 'FAILED' && doc.error_message && (
                        <Button variant="ghost" size="sm" onClick={() => alert(doc.error_message)} className="text-red-600">
                          Xato
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {totalCount} ta hujjatdan {(currentPage - 1) * 15 + 1} - {Math.min(currentPage * 15, totalCount)} gacha ko'rsatilmoqda
            </div>
            <div className="flex space-x-2">
              {currentPage > 1 && (
                <a
                  href={`?page=${currentPage - 1}&category=${resolvedParams.category || ''}&document_type=${resolvedParams.document_type || ''}&status=${resolvedParams.status || ''}&date_from=${resolvedParams.date_from || ''}&date_to=${resolvedParams.date_to || ''}`}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Oldingi
                </a>
              )}
              {currentPage < totalPages && (
                <a
                  href={`?page=${currentPage + 1}&category=${resolvedParams.category || ''}&document_type=${resolvedParams.document_type || ''}&status=${resolvedParams.status || ''}&date_from=${resolvedParams.date_from || ''}&date_to=${resolvedParams.date_to || ''}`}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Keyingi
                </a>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function handleGenerateNew(schoolId: string) {
  // Would open a modal for generating new document
  alert('Yangi hujjat yaratish modali ochiladi')
}

function downloadDocument(doc: any) {
  if (doc.storage_path) {
    // In real app, would generate signed URL and download
    alert(`Hujjat yuklab olinmoqda: ${doc.title}`)
  }
}