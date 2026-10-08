-- MaktabDavomat - RLS Policies & Functions
-- Run this migration after 002_schedule_attendance.sql

-- ===========================
-- ENABLE RLS ON ALL TABLES
-- ===========================

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_occurrence_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_settings ENABLE ROW LEVEL SECURITY;

-- ===========================
-- HELPER FUNCTIONS FOR RLS
-- ===========================

-- Get current user's profile ID from auth
CREATE OR REPLACE FUNCTION current_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT auth.uid();
$$;

-- Check if current user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND system_role = 'SUPER_ADMIN'
    );
$$;

-- Check if current user has approved membership in a school
CREATE OR REPLACE FUNCTION has_approved_membership(school_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM school_memberships
        WHERE school_id = school_uuid
        AND profile_id = auth.uid()
        AND status = 'APPROVED'
    );
$$;

-- Check if current user is school admin for a school
CREATE OR REPLACE FUNCTION is_school_admin(school_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM school_memberships
        WHERE school_id = school_uuid
        AND profile_id = auth.uid()
        AND membership_role = 'ADMIN'
        AND status = 'APPROVED'
    );
$$;

-- Check if current user is zavuch for a school
CREATE OR REPLACE FUNCTION is_zavuch(school_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM school_memberships
        WHERE school_id = school_uuid
        AND profile_id = auth.uid()
        AND membership_role = 'ZAVUCH'
        AND status = 'APPROVED'
    );
$$;

-- Check if current user is teacher for a school
CREATE OR REPLACE FUNCTION is_teacher(school_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM school_memberships
        WHERE school_id = school_uuid
        AND profile_id = auth.uid()
        AND membership_role = 'TEACHER'
        AND status = 'APPROVED'
    );
$$;

-- Get schools where user has approved membership
CREATE OR REPLACE FUNCTION user_approved_schools()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
AS $$
    SELECT school_id FROM school_memberships
    WHERE profile_id = auth.uid()
    AND status = 'APPROVED';
$$;

-- Get schools where user is admin or zavuch
CREATE OR REPLACE FUNCTION user_admin_schools()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
AS $$
    SELECT school_id FROM school_memberships
    WHERE profile_id = auth.uid()
    AND membership_role IN ('ADMIN', 'ZAVUCH')
    AND status = 'APPROVED';
$$;

-- Get teacher's school membership ID for a school
CREATE OR REPLACE FUNCTION teacher_membership_id(school_uuid UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT id FROM school_memberships
    WHERE school_id = school_uuid
    AND profile_id = auth.uid()
    AND membership_role = 'TEACHER'
    AND status = 'APPROVED'
    LIMIT 1;
$$;

-- ===========================
-- RLS POLICIES - SCHOOLS
-- ===========================

CREATE POLICY "super_admin_all_schools" ON schools
    FOR ALL USING (is_super_admin());

CREATE POLICY "school_admin_read_schools" ON schools
    FOR SELECT USING (is_school_admin(id) OR is_zavuch(id));

CREATE POLICY "school_admin_update_schools" ON schools
    FOR UPDATE USING (is_school_admin(id));

-- ===========================
-- RLS POLICIES - PROFILES
-- ===========================

CREATE POLICY "own_profile_read" ON profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "own_profile_update" ON profiles
    FOR UPDATE USING (id = auth.uid());

CREATE POLICY "super_admin_all_profiles" ON profiles
    FOR SELECT USING (is_super_admin());

CREATE POLICY "school_admin_read_profiles" ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM school_memberships sm
            WHERE sm.profile_id = profiles.id
            AND sm.status = 'APPROVED'
            AND (is_school_admin(sm.school_id) OR is_zavuch(sm.school_id))
        )
    );

-- ===========================
-- RLS POLICIES - TEACHER PROFILES
-- ===========================

CREATE POLICY "own_teacher_profile" ON teacher_profiles
    FOR ALL USING (profile_id = auth.uid());

CREATE POLICY "super_admin_teacher_profiles" ON teacher_profiles
    FOR ALL USING (is_super_admin());

CREATE POLICY "school_admin_teacher_profiles" ON teacher_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM school_memberships sm
            WHERE sm.profile_id = teacher_profiles.profile_id
            AND sm.status = 'APPROVED'
            AND (is_school_admin(sm.school_id) OR is_zavuch(sm.school_id))
        )
    );

-- ===========================
-- RLS POLICIES - TELEGRAM ACCOUNTS
-- ===========================

CREATE POLICY "own_telegram_account" ON telegram_accounts
    FOR ALL USING (profile_id = auth.uid());

CREATE POLICY "super_admin_telegram_accounts" ON telegram_accounts
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - SCHOOL MEMBERSHIPS
-- ===========================

CREATE POLICY "own_memberships" ON school_memberships
    FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "school_admin_memberships" ON school_memberships
    FOR SELECT USING (is_school_admin(school_id) OR is_zavuch(school_id));

CREATE POLICY "school_admin_update_memberships" ON school_memberships
    FOR UPDATE USING (is_school_admin(school_id) OR is_zavuch(school_id));

CREATE POLICY "super_admin_memberships" ON school_memberships
    FOR ALL USING (is_super_admin());

CREATE POLICY "create_own_membership" ON school_memberships
    FOR INSERT WITH CHECK (profile_id = auth.uid());

-- ===========================
-- RLS POLICIES - SCHOOL STAFF ROLES
-- ===========================

CREATE POLICY "school_admin_staff_roles" ON school_staff_roles
    FOR ALL USING (is_school_admin(school_id));

CREATE POLICY "super_admin_staff_roles" ON school_staff_roles
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - SUBJECTS
-- ===========================

CREATE POLICY "school_members_read_subjects" ON subjects
    FOR SELECT USING (has_approved_membership(school_id));

CREATE POLICY "school_admin_manage_subjects" ON subjects
    FOR ALL USING (is_school_admin(school_id));

CREATE POLICY "super_admin_subjects" ON subjects
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - CLASSES
-- ===========================

CREATE POLICY "school_members_read_classes" ON classes
    FOR SELECT USING (has_approved_membership(school_id));

CREATE POLICY "school_admin_manage_classes" ON classes
    FOR ALL USING (is_school_admin(school_id));

CREATE POLICY "super_admin_classes" ON classes
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - ROOMS
-- ===========================

CREATE POLICY "school_members_read_rooms" ON rooms
    FOR SELECT USING (has_approved_membership(school_id));

CREATE POLICY "school_admin_manage_rooms" ON rooms
    FOR ALL USING (is_school_admin(school_id));

CREATE POLICY "super_admin_rooms" ON rooms
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - TEACHER SUBJECTS
-- ===========================

CREATE POLICY "school_members_read_teacher_subjects" ON teacher_subjects
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM school_memberships sm
            WHERE sm.id = teacher_subjects.school_membership_id
            AND has_approved_membership(sm.school_id)
        )
    );

CREATE POLICY "school_admin_manage_teacher_subjects" ON teacher_subjects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM school_memberships sm
            WHERE sm.id = teacher_subjects.school_membership_id
            AND is_school_admin(sm.school_id)
        )
    );

CREATE POLICY "super_admin_teacher_subjects" ON teacher_subjects
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - TEACHER CLASSES
-- ===========================

CREATE POLICY "school_members_read_teacher_classes" ON teacher_classes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM school_memberships sm
            WHERE sm.id = teacher_classes.school_membership_id
            AND has_approved_membership(sm.school_id)
        )
    );

CREATE POLICY "school_admin_manage_teacher_classes" ON teacher_classes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM school_memberships sm
            WHERE sm.id = teacher_classes.school_membership_id
            AND is_school_admin(sm.school_id)
        )
    );

CREATE POLICY "super_admin_teacher_classes" ON teacher_classes
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - LESSONS
-- ===========================

CREATE POLICY "school_members_read_lessons" ON lessons
    FOR SELECT USING (has_approved_membership(school_id));

CREATE POLICY "school_admin_manage_lessons" ON lessons
    FOR ALL USING (is_school_admin(school_id));

CREATE POLICY "super_admin_lessons" ON lessons
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - LESSON TEACHERS
-- ===========================

CREATE POLICY "school_members_read_lesson_teachers" ON lesson_teachers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM lessons l
            WHERE l.id = lesson_teachers.lesson_id
            AND has_approved_membership(l.school_id)
        )
    );

CREATE POLICY "school_admin_manage_lesson_teachers" ON lesson_teachers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM lessons l
            WHERE l.id = lesson_teachers.lesson_id
            AND is_school_admin(l.school_id)
        )
    );

CREATE POLICY "super_admin_lesson_teachers" ON lesson_teachers
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - LESSON OCCURRENCES
-- ===========================

CREATE POLICY "school_members_read_lesson_occurrences" ON lesson_occurrences
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM lessons l
            WHERE l.id = lesson_occurrences.lesson_id
            AND has_approved_membership(l.school_id)
        )
    );

CREATE POLICY "school_admin_manage_lesson_occurrences" ON lesson_occurrences
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM lessons l
            WHERE l.id = lesson_occurrences.lesson_id
            AND is_school_admin(l.school_id)
        )
    );

CREATE POLICY "super_admin_lesson_occurrences" ON lesson_occurrences
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - LESSON OCCURRENCE TEACHERS
-- ===========================

CREATE POLICY "school_members_read_lot" ON lesson_occurrence_teachers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM lesson_occurrences lo
            JOIN lessons l ON l.id = lo.lesson_id
            WHERE lo.id = lesson_occurrence_teachers.lesson_occurrence_id
            AND has_approved_membership(l.school_id)
        )
    );

CREATE POLICY "school_admin_manage_lot" ON lesson_occurrence_teachers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM lesson_occurrences lo
            JOIN lessons l ON l.id = lo.lesson_id
            WHERE lo.id = lesson_occurrence_teachers.lesson_occurrence_id
            AND is_school_admin(l.school_id)
        )
    );

CREATE POLICY "super_admin_lot" ON lesson_occurrence_teachers
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - CLASS QR CODES
-- ===========================

CREATE POLICY "school_members_read_qr" ON class_qr_codes
    FOR SELECT USING (has_approved_membership(school_id));

CREATE POLICY "school_admin_manage_qr" ON class_qr_codes
    FOR ALL USING (is_school_admin(school_id));

CREATE POLICY "super_admin_qr" ON class_qr_codes
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - ATTENDANCE RECORDS
-- ===========================

CREATE POLICY "teacher_own_attendance" ON attendance_records
    FOR SELECT USING (school_membership_id = teacher_membership_id(school_id));

CREATE POLICY "teacher_insert_attendance" ON attendance_records
    FOR INSERT WITH CHECK (school_membership_id = teacher_membership_id(school_id));

CREATE POLICY "school_admin_attendance" ON attendance_records
    FOR SELECT USING (is_school_admin(school_id) OR is_zavuch(school_id));

CREATE POLICY "school_admin_update_attendance" ON attendance_records
    FOR UPDATE USING (is_school_admin(school_id));

CREATE POLICY "super_admin_attendance" ON attendance_records
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - SECURITY EVENTS
-- ===========================

CREATE POLICY "school_admin_security_events" ON security_events
    FOR SELECT USING (is_school_admin(school_id) OR is_zavuch(school_id));

CREATE POLICY "super_admin_security_events" ON security_events
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - NOTIFICATIONS
-- ===========================

CREATE POLICY "own_notifications" ON notifications
    FOR SELECT USING (recipient_profile_id = auth.uid());

CREATE POLICY "update_own_notifications" ON notifications
    FOR UPDATE USING (recipient_profile_id = auth.uid());

CREATE POLICY "school_admin_notifications" ON notifications
    FOR SELECT USING (
        school_id IS NOT NULL AND (is_school_admin(school_id) OR is_zavuch(school_id))
    );

CREATE POLICY "super_admin_notifications" ON notifications
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - DOCUMENTS
-- ===========================

CREATE POLICY "school_admin_documents" ON documents
    FOR ALL USING (is_school_admin(school_id) OR is_zavuch(school_id));

CREATE POLICY "super_admin_documents" ON documents
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - AUDIT LOGS
-- ===========================

CREATE POLICY "school_admin_audit_logs" ON audit_logs
    FOR SELECT USING (
        school_id IS NOT NULL AND (is_school_admin(school_id) OR is_zavuch(school_id))
    );

CREATE POLICY "super_admin_audit_logs" ON audit_logs
    FOR ALL USING (is_super_admin());

-- ===========================
-- RLS POLICIES - SCHOOL SETTINGS
-- ===========================

CREATE POLICY "school_admin_settings" ON school_settings
    FOR ALL USING (is_school_admin(school_id));

CREATE POLICY "super_admin_settings" ON school_settings
    FOR ALL USING (is_super_admin());

-- ===========================
-- TRIGGERS FOR UPDATED_AT
-- ===========================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teacher_profiles_updated_at BEFORE UPDATE ON teacher_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_telegram_accounts_updated_at BEFORE UPDATE ON telegram_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_school_memberships_updated_at BEFORE UPDATE ON school_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_school_staff_roles_updated_at BEFORE UPDATE ON school_staff_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subjects_updated_at BEFORE UPDATE ON subjects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON lessons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lesson_occurrences_updated_at BEFORE UPDATE ON lesson_occurrences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_qr_codes_updated_at BEFORE UPDATE ON class_qr_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendance_records_updated_at BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_school_settings_updated_at BEFORE UPDATE ON school_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();