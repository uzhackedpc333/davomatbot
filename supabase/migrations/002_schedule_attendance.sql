-- MaktabDavomat - Schedule, Attendance & Security Tables
-- Run this migration after 001_initial_schema.sql

-- ===========================
-- SCHEDULE & LESSONS
-- ===========================

-- Lessons (schedule entries)
CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    academic_year TEXT NOT NULL,
    status lesson_status NOT NULL DEFAULT 'SCHEDULED',
    is_exception BOOLEAN NOT NULL DEFAULT FALSE,
    exception_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Lesson teachers (many-to-many: lesson <-> teacher membership)
CREATE TABLE lesson_teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    school_membership_id UUID NOT NULL REFERENCES school_memberships(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lesson_id, school_membership_id)
);

-- Lesson occurrences (concrete lesson instances for specific dates)
CREATE TABLE lesson_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    status lesson_status NOT NULL DEFAULT 'SCHEDULED',
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES profiles(id),
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lesson_id, occurrence_date)
);

-- Lesson occurrence teachers (which teachers assigned to this occurrence)
CREATE TABLE lesson_occurrence_teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_occurrence_id UUID NOT NULL REFERENCES lesson_occurrences(id) ON DELETE CASCADE,
    school_membership_id UUID NOT NULL REFERENCES school_memberships(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lesson_occurrence_id, school_membership_id)
);

-- ===========================
-- QR CODES (per class)
-- ===========================

CREATE TABLE class_qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    token_salt TEXT NOT NULL,
    status qr_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES profiles(id),
    revocation_reason TEXT,
    UNIQUE(class_id)
);

-- ===========================
-- ATTENDANCE
-- ===========================

CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    lesson_occurrence_id UUID NOT NULL REFERENCES lesson_occurrences(id) ON DELETE CASCADE,
    school_membership_id UUID NOT NULL REFERENCES school_memberships(id) ON DELETE CASCADE,
    class_qr_code_id UUID NOT NULL REFERENCES class_qr_codes(id) ON DELETE CASCADE,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status attendance_status NOT NULL,
    late_minutes INTEGER,
    gps_accuracy_meters NUMERIC(6, 2),
    server_calculated_distance_meters NUMERIC(8, 2),
    location_snapshot JSONB,
    validation_metadata JSONB,
    request_id UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lesson_occurrence_id, school_membership_id)
);

-- ===========================
-- SECURITY EVENTS
-- ===========================

CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type security_event_type NOT NULL,
    severity security_severity NOT NULL DEFAULT 'MEDIUM',
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    school_membership_id UUID REFERENCES school_memberships(id) ON DELETE SET NULL,
    lesson_occurrence_id UUID REFERENCES lesson_occurrences(id) ON DELETE SET NULL,
    class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT NOT NULL,
    request_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===========================
-- NOTIFICATIONS
-- ===========================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    related_entity_type TEXT,
    related_entity_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    telegram_delivery_status notification_delivery_status,
    telegram_sent_at TIMESTAMPTZ,
    telegram_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===========================
-- DOCUMENTS & REPORTS
-- ===========================

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    creator_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    document_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    mime_type TEXT,
    period_start DATE,
    period_end DATE,
    filters JSONB,
    status document_status NOT NULL DEFAULT 'GENERATING',
    error_message TEXT,
    generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===========================
-- AUDIT LOGS
-- ===========================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===========================
-- SCHOOL SETTINGS
-- ===========================

CREATE TABLE school_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
    telegram_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notify_teacher_on_approval BOOLEAN NOT NULL DEFAULT TRUE,
    notify_teacher_on_rejection BOOLEAN NOT NULL DEFAULT TRUE,
    notify_teacher_on_suspension BOOLEAN NOT NULL DEFAULT TRUE,
    notify_admin_on_pending_membership BOOLEAN NOT NULL DEFAULT TRUE,
    notify_admin_on_attendance BOOLEAN NOT NULL DEFAULT TRUE,
    notify_admin_on_security_events BOOLEAN NOT NULL DEFAULT TRUE,
    notify_admin_on_missing_attendance BOOLEAN NOT NULL DEFAULT TRUE,
    document_retention_days INTEGER NOT NULL DEFAULT 365,
    auto_generate_daily_reports BOOLEAN NOT NULL DEFAULT TRUE,
    auto_generate_monthly_reports BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===========================
-- INDEXES
-- ===========================

-- Profiles
CREATE INDEX idx_profiles_system_role ON profiles(system_role);

-- Teacher profiles
CREATE INDEX idx_teacher_profiles_profile_id ON teacher_profiles(profile_id);

-- Telegram accounts
CREATE INDEX idx_telegram_accounts_profile_id ON telegram_accounts(profile_id);

-- School memberships
CREATE INDEX idx_school_memberships_school_id ON school_memberships(school_id);
CREATE INDEX idx_school_memberships_profile_id ON school_memberships(profile_id);
CREATE INDEX idx_school_memberships_status ON school_memberships(status);

-- School staff roles
CREATE INDEX idx_school_staff_roles_school_id ON school_staff_roles(school_id);
CREATE INDEX idx_school_staff_roles_profile_id ON school_staff_roles(profile_id);

-- Subjects
CREATE INDEX idx_subjects_school_id ON subjects(school_id);

-- Classes
CREATE INDEX idx_classes_school_id ON classes(school_id);
CREATE INDEX idx_classes_academic_year ON classes(academic_year);

-- Rooms
CREATE INDEX idx_rooms_school_id ON rooms(school_id);

-- Teacher subjects/classes
CREATE INDEX idx_teacher_subjects_school_membership_id ON teacher_subjects(school_membership_id);
CREATE INDEX idx_teacher_classes_school_membership_id ON teacher_classes(school_membership_id);

-- Lessons
CREATE INDEX idx_lessons_school_id ON lessons(school_id);
CREATE INDEX idx_lessons_subject_id ON lessons(subject_id);
CREATE INDEX idx_lessons_class_id ON lessons(class_id);
CREATE INDEX idx_lessons_weekday ON lessons(weekday);

-- Lesson teachers
CREATE INDEX idx_lesson_teachers_lesson_id ON lesson_teachers(lesson_id);
CREATE INDEX idx_lesson_teachers_school_membership_id ON lesson_teachers(school_membership_id);

-- Lesson occurrences
CREATE INDEX idx_lesson_occurrences_lesson_id ON lesson_occurrences(lesson_id);
CREATE INDEX idx_lesson_occurrences_occurrence_date ON lesson_occurrences(occurrence_date);
CREATE INDEX idx_lesson_occurrences_status ON lesson_occurrences(status);

-- Lesson occurrence teachers
CREATE INDEX idx_lesson_occurrence_teachers_lesson_occurrence_id ON lesson_occurrence_teachers(lesson_occurrence_id);
CREATE INDEX idx_lesson_occurrence_teachers_school_membership_id ON lesson_occurrence_teachers(school_membership_id);

-- Class QR codes
CREATE INDEX idx_class_qr_codes_school_id ON class_qr_codes(school_id);
CREATE INDEX idx_class_qr_codes_class_id ON class_qr_codes(class_id);

-- Attendance records
CREATE INDEX idx_attendance_records_school_id ON attendance_records(school_id);
CREATE INDEX idx_attendance_records_lesson_occurrence_id ON attendance_records(lesson_occurrence_id);
CREATE INDEX idx_attendance_records_school_membership_id ON attendance_records(school_membership_id);
CREATE INDEX idx_attendance_records_scanned_at ON attendance_records(scanned_at);
CREATE INDEX idx_attendance_records_status ON attendance_records(status);
CREATE INDEX idx_attendance_records_request_id ON attendance_records(request_id);

-- Security events
CREATE INDEX idx_security_events_school_id ON security_events(school_id);
CREATE INDEX idx_security_events_school_membership_id ON security_events(school_membership_id);
CREATE INDEX idx_security_events_lesson_occurrence_id ON security_events(lesson_occurrence_id);
CREATE INDEX idx_security_events_occurred_at ON security_events(occurred_at);
CREATE INDEX idx_security_events_event_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);

-- Notifications
CREATE INDEX idx_notifications_recipient_profile_id ON notifications(recipient_profile_id);
CREATE INDEX idx_notifications_school_id ON notifications(school_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Documents
CREATE INDEX idx_documents_school_id ON documents(school_id);
CREATE INDEX idx_documents_creator_profile_id ON documents(creator_profile_id);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_period_start ON documents(period_start);

-- Audit logs
CREATE INDEX idx_audit_logs_actor_profile_id ON audit_logs(actor_profile_id);
CREATE INDEX idx_audit_logs_school_id ON audit_logs(school_id);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);