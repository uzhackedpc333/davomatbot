import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function NewSchoolPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Yangi maktab qo'shish</h1>
          <p className="text-gray-500 mt-1">Yangi maktab ma'lumotlarini kiriting</p>
        </div>
        <Link href="/admin/schools">
          <Button variant="outline">Orqaga qaytish</Button>
        </Link>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Maktab ma'lumotlari</CardTitle>
        </CardHeader>
        <CardContent>
          <form action="/api/admin/schools" method="POST" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Maktab nomi *</Label>
                <Input id="name" name="name" required placeholder="Masalan: 1-sonli davlat maktabi" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="short_name">Qisqa nom</Label>
                <Input id="short_name" name="short_name" placeholder="Masalan: 1-Maktab" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Manzil</Label>
              <Input id="address" name="address" placeholder="Toliq manzil" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" name="phone" type="tel" placeholder="+998 XX XXX XX XX" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Elektron pochta</Label>
                <Input id="email" name="email" type="email" placeholder="info@maktab.uz" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>GPS koordinatalari (davomat uchun shart)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="latitude">Kenglik (Latitude) *</Label>
                  <Input
                    id="latitude"
                    name="latitude"
                    type="number"
                    step="0.00000001"
                    required
                    placeholder="41.2995"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="longitude">Uzunlik (Longitude) *</Label>
                  <Input
                    id="longitude"
                    name="longitude"
                    type="number"
                    step="0.00000001"
                    required
                    placeholder="69.2401"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="timezone">Vaqt mintaqasi *</Label>
                <select
                  id="timezone"
                  name="timezone"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Asia/Tashkent">Asia/Tashkent (UTC+5)</option>
                  <option value="Asia/Samarkand">Asia/Samarkand (UTC+5)</option>
                  <option value="Asia/Bishkek">Asia/Bishkek (UTC+6)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="geofence_radius_meters">Geofence radius (metr) *</Label>
                <Input
                  id="geofence_radius_meters"
                  name="geofence_radius_meters"
                  type="number"
                  min="50"
                  max="1000"
                  value="200"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_gps_accuracy_meters">Maksimal GPS aniqligi (metr) *</Label>
                <Input
                  id="max_gps_accuracy_meters"
                  name="max_gps_accuracy_meters"
                  type="number"
                  min="10"
                  max="200"
                  value="50"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="checkin_opening_minutes_before">Darsdan oldin ochilishi (daqiqa) *</Label>
                <Input
                  id="checkin_opening_minutes_before"
                  name="checkin_opening_minutes_before"
                  type="number"
                  min="0"
                  max="60"
                  value="5"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="missing_grace_minutes">Kechikish chadru (daqiqa) *</Label>
                <Input
                  id="missing_grace_minutes"
                  name="missing_grace_minutes"
                  type="number"
                  min="1"
                  max="60"
                  value="5"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <Link href="/admin/schools">
                <Button type="button" variant="outline">Bekor qilish</Button>
              </Link>
              <Button type="submit">Maktabni yaratish</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}