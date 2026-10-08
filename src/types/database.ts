export type UserRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'ZAVUCH' | 'TEACHER'
export type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
export type MembershipRole = 'ADMIN' | 'ZAVUCH' | 'TEACHER'
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'MISSING'
export type SecurityEventType =
  | 'OUTSIDE_SCHOOL'
  | 'WRONG_CLASS'
  | 'NO_LESSON'
  | 'TOO_EARLY'
  | 'LESSON_ENDED'
  | 'LOW_ACCURACY'
  | 'LOCATION_PERMISSION_DENIED'
  | 'INVALID_QR'
  | 'DISABLED_QR'
  | 'UNAUTHORIZED_TEACHER'
  | 'DUPLICATE_SCAN'
  | 'RATE_LIMITED'
  | 'SUSPICIOUS_LOCATION'
export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type LessonStatus = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED'
export type QRStatus = 'ACTIVE' | 'DISABLED'
export type DocumentStatus = 'GENERATING' | 'COMPLETED' | 'FAILED'
export type NotificationType = 'IN_APP' | 'TELEGRAM'
export type NotificationDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  avatar_url: string | null
  system_role: UserRole
  created_at: string
  updated_at: string
}

export interface TeacherProfile {
  id: string
  profile_id: string
  employment_date: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TelegramAccount {
  id: string
  telegram_user_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  profile_id: string | null
  linked_at: string | null
  linking_status: string
  created_at: string
  updated_at: string
}

export interface School {
  id: string
  name: string
  short_name: string | null
  address: string | null
  phone: string | null
  email: string | null
  latitude: number
  longitude: number
  timezone: string
  geofence_radius_meters: number
  max_gps_accuracy_meters: number
  checkin_opening_minutes_before: number
  missing_grace_minutes: number
  status: string
  created_at: string
  updated_at: string
}

export interface SchoolMembership {
  id: string
  school_id: string
  profile_id: string
  membership_role: MembershipRole
  status: MembershipStatus
  requested_at: string
  approved_at: string | null
  approved_by: string | null
  rejection_reason: string | null
  suspended_at: string | null
  suspended_by: string | null
  suspension_reason: string | null
  created_at: string
  updated_at: string
}

export interface SchoolStaffRole {
  id: string
  school_id: string
  profile_id: string
  role: MembershipRole
  scope: Record<string, unknown> | null
  assigned_at: string
  assigned_by: string | null
}

export interface Subject {
  id: string
  school_id: string
  name: string
  code: string | null
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface Class {
  id: string
  school_id: string
  name: string
  grade: number
  section: string
  academic_year: string
  status: string
  created_at: string
  updated_at: string
}

export interface Room {
  id: string
  school_id: string
  name: string
  building: string | null
  floor: number | null
  capacity: number | null
  status: string
  created_at: string
  updated_at: string
}

export interface TeacherSubject {
  id: string
  school_membership_id: string
  subject_id: string
  created_at: string
}

export interface TeacherClass {
  id: string
  school_membership_id: string
  class_id: string
  created_at: string
}

export interface Lesson {
  id: string
  school_id: string
  subject_id: string
  class_id: string
  room_id: string | null
  weekday: number
  start_time: string
  end_time: string
  academic_year: string
  status: LessonStatus
  is_exception: boolean
  exception_date: string | null
  created_at: string
  updated_at: string
}

export interface LessonTeacher {
  id: string
  lesson_id: string
  school_membership_id: string
  created_at: string
}

export interface LessonOccurrence {
  id: string
  lesson_id: string
  occurrence_date: string
  status: LessonStatus
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
}

export interface LessonOccurrenceTeacher {
  id: string
  lesson_occurrence_id: string
  school_membership_id: string
  created_at: string
}

export interface ClassQRCode {
  id: string
  school_id: string
  class_id: string
  token_hash: string
  token_salt: string
  status: QRStatus
  created_at: string
  updated_at: string
  revoked_at: string | null
  revoked_by: string | null
  revocation_reason: string | null
}

export interface AttendanceRecord {
  id: string
  school_id: string
  lesson_occurrence_id: string
  school_membership_id: string
  class_qr_code_id: string
  scanned_at: string
  status: AttendanceStatus
  late_minutes: number | null
  gps_accuracy_meters: number | null
  server_calculated_distance_meters: number | null
  location_snapshot: Record<string, unknown> | null
  validation_metadata: Record<string, unknown> | null
  request_id: string
  created_at: string
  updated_at: string
}

export interface SecurityEvent {
  id: string
  event_type: SecurityEventType
  severity: SecuritySeverity
  school_id: string
  school_membership_id: string | null
  lesson_occurrence_id: string | null
  class_id: string | null
  occurred_at: string
  reason: string
  request_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface Notification {
  id: string
  recipient_profile_id: string
  school_id: string | null
  type: NotificationType
  title: string
  body: string
  related_entity_type: string | null
  related_entity_id: string | null
  is_read: boolean
  telegram_delivery_status: NotificationDeliveryStatus | null
  telegram_sent_at: string | null
  telegram_error: string | null
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  school_id: string
  creator_profile_id: string
  category: string
  document_type: string
  title: string
  description: string | null
  storage_path: string
  file_size_bytes: number | null
  mime_type: string | null
  period_start: string | null
  period_end: string | null
  filters: Record<string, unknown> | null
  status: DocumentStatus
  error_message: string | null
  generated_at: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  actor_profile_id: string | null
  school_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface SchoolSettings {
  id: string
  school_id: string
  telegram_notifications_enabled: boolean
  notify_teacher_on_approval: boolean
  notify_teacher_on_rejection: boolean
  notify_teacher_on_suspension: boolean
  notify_admin_on_pending_membership: boolean
  notify_admin_on_attendance: boolean
  notify_admin_on_security_events: boolean
  notify_admin_on_missing_attendance: boolean
  document_retention_days: number
  auto_generate_daily_reports: boolean
  auto_generate_monthly_reports: boolean
  created_at: string
  updated_at: string
}

// UI Display mappings
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Keldi',
  LATE: 'Kechikdi',
  MISSING: 'Kelmadi',
}

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  PENDING: 'Kutilmoqda',
  APPROVED: 'Tasdiqlangan',
  REJECTED: 'Rad etilgan',
  SUSPENDED: 'Faol emas',
}

export const SECURITY_EVENT_LABELS: Record<SecurityEventType, string> = {
  OUTSIDE_SCHOOL: 'Maktab tashqarisi',
  WRONG_CLASS: 'Noto\'g\'ri sinf',
  NO_LESSON: 'Dars yo\'q',
  TOO_EARLY: 'Juda erta',
  LESSON_ENDED: 'Dars tugagan',
  LOW_ACCURACY: 'Past aniqlik',
  LOCATION_PERMISSION_DENIED: 'Lokatsiya ruxsati yo\'q',
  INVALID_QR: 'Noto\'g\'ri QR',
  DISABLED_QR: 'O\'chirilgan QR',
  UNAUTHORIZED_TEACHER: 'Ruxsatsiz ustoz',
  DUPLICATE_SCAN: 'Takroriy skaner',
  RATE_LIMITED: 'Cheklangan so\'rov',
  SUSPICIOUS_LOCATION: 'Shubhali lokatsiya',
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  SCHOOL_ADMIN: 'Maktab Admini',
  ZAVUCH: 'Zavuch',
  TEACHER: 'Ustoz',
}