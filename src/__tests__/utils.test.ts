import { cn } from '@/utils/cn'

describe('cn utility', () => {
  it('merges class names correctly', () => {
    expect(cn('base', 'additional')).toBe('base additional')
  })

  it('handles conditional classes', () => {
    expect(cn('base', true && 'conditional')).toBe('base conditional')
    expect(cn('base', false && 'conditional')).toBe('base')
  })

  it('handles tailwind merge conflicts', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('handles empty and undefined values', () => {
    expect(cn('base', '', undefined, null, 'end')).toBe('base end')
  })
})

describe('Attendance status labels', () => {
  const ATTENDANCE_STATUS_LABELS = {
    PRESENT: 'Keldi',
    LATE: 'Kechikdi',
    MISSING: 'Kelmadi',
  }

  it('has correct Uzbek labels', () => {
    expect(ATTENDANCE_STATUS_LABELS.PRESENT).toBe('Keldi')
    expect(ATTENDANCE_STATUS_LABELS.LATE).toBe('Kechikdi')
    expect(ATTENDANCE_STATUS_LABELS.MISSING).toBe('Kelmadi')
  })
})

describe('Membership status labels', () => {
  const MEMBERSHIP_STATUS_LABELS = {
    PENDING: 'Kutilmoqda',
    APPROVED: 'Tasdiqlangan',
    REJECTED: 'Rad etilgan',
    SUSPENDED: 'Faol emas',
  }

  it('has correct Uzbek labels', () => {
    expect(MEMBERSHIP_STATUS_LABELS.PENDING).toBe('Kutilmoqda')
    expect(MEMBERSHIP_STATUS_LABELS.APPROVED).toBe('Tasdiqlangan')
    expect(MEMBERSHIP_STATUS_LABELS.REJECTED).toBe('Rad etilgan')
    expect(MEMBERSHIP_STATUS_LABELS.SUSPENDED).toBe('Faol emas')
  })
})