import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { supabase } from '../lib/supabase'
import {
  ShieldCheck,
  Store,
  CheckCircle,
  XCircle,
  CalendarDays,
  Plus,
  ExternalLink,
  RefreshCcw,
  Pencil,
} from 'lucide-react'

function Admin() {
  const navigate = useNavigate()

  const [accountType, setAccountType] = useState('user')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('applications')

  const [applications, setApplications] = useState([])
  const [applicationFilter, setApplicationFilter] = useState('pending')

  const [events, setEvents] = useState([])
  const [eventForm, setEventForm] = useState({
    name: '',
    venue: '',
    address: '',
    city: '',
    state: '',
    location: '',
    starts_at: '',
    end_date: '',
    icon_url: '',
    floorplan_url: '',
    floorplan_preview_url: '',
  })

  const [editingEventId, setEditingEventId] = useState(null)
  const [editEventForm, setEditEventForm] = useState({
    name: '',
    venue: '',
    address: '',
    city: '',
    state: '',
    location: '',
    starts_at: '',
    end_date: '',
    icon_url: '',
    floorplan_url: '',
    floorplan_preview_url: '',
  })

  const isAdmin = accountType === 'admin'

  useEffect(() => {
    setupAdmin()
  }, [])

  async function getUserOrRedirect() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      navigate('/')
      return null
    }

    return user
  }

  async function setupAdmin() {
    setLoading(true)
    setMessage('')

    const user = await getUserOrRedirect()
    if (!user) return

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('account_type')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      setMessage(profileError.message)
      setLoading(false)
      return
    }

    const type = profile?.account_type || 'user'
    setAccountType(type)

    if (type !== 'admin') {
      setLoading(false)
      return
    }

    await Promise.all([fetchApplications(), fetchEvents()])
    setLoading(false)
  }

  async function fetchApplications() {
    const { data, error } = await supabase
      .from('vendor_applications')
      .select(`
        *,
        users (
          id,
          username,
          display_name,
          account_type
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    setApplications(data || [])
  }

  async function fetchEvents() {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('starts_at', { ascending: true })

    if (error) {
      setMessage(error.message)
      return
    }

    setEvents(data || [])
  }

  async function approveApplication(application) {
    const confirmed = window.confirm(
      `Approve ${application.business_name || 'this applicant'} as a vendor?`
    )

    if (!confirmed) return

    setMessage('')

    const user = await getUserOrRedirect()
    if (!user) return

    const { error: userError } = await supabase
      .from('users')
      .update({
        account_type: 'vendor',
        vendor_approved_at: new Date().toISOString(),
      })
      .eq('id', application.user_id)

    if (userError) {
      setMessage(userError.message)
      return
    }

    const { error: applicationError } = await supabase
      .from('vendor_applications')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', application.id)

    if (applicationError) {
      setMessage(applicationError.message)
      return
    }

    setApplications((current) =>
      current.map((item) =>
        item.id === application.id
          ? {
              ...item,
              status: 'approved',
              reviewed_at: new Date().toISOString(),
              reviewed_by: user.id,
              users: {
                ...item.users,
                account_type: 'vendor',
              },
            }
          : item
      )
    )

    setMessage('Vendor application approved. User is now a vendor.')
  }

  async function rejectApplication(application) {
    const confirmed = window.confirm(
      `Reject ${application.business_name || 'this application'}?`
    )

    if (!confirmed) return

    setMessage('')

    const user = await getUserOrRedirect()
    if (!user) return

    const { error: applicationError } = await supabase
      .from('vendor_applications')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', application.id)

    if (applicationError) {
      setMessage(applicationError.message)
      return
    }

    const { error: userError } = await supabase
      .from('users')
      .update({
        account_type: 'user',
      })
      .eq('id', application.user_id)

    if (userError) {
      setMessage(userError.message)
      return
    }

    setApplications((current) =>
      current.map((item) =>
        item.id === application.id
          ? {
              ...item,
              status: 'rejected',
              reviewed_at: new Date().toISOString(),
              reviewed_by: user.id,
              users: {
                ...item.users,
                account_type: 'user',
              },
            }
          : item
      )
    )

    setMessage('Vendor application rejected.')
  }


  async function removeVendorAccess(application) {
    const confirmed = window.confirm(
      `Remove vendor access for ${application.business_name || application.users?.username || 'this user'}? They will become a regular user again.`
    )

    if (!confirmed) return

    setMessage('')

    const { error: userError } = await supabase
      .from('users')
      .update({
        account_type: 'user',
        vendor_approved_at: null,
      })
      .eq('id', application.user_id)

    if (userError) {
      setMessage(userError.message)
      return
    }

    setApplications((current) =>
      current.map((item) =>
        item.id === application.id
          ? {
              ...item,
              users: {
                ...item.users,
                account_type: 'user',
              },
            }
          : item
      )
    )

    setMessage('Vendor access removed. User is now a regular user.')
  }

  async function createShow() {
    setMessage('')

    const cleanName = eventForm.name.trim()

    if (!cleanName) {
      setMessage('Please enter a show name.')
      return
    }

    const startsAt = eventForm.starts_at
      ? new Date(eventForm.starts_at).toISOString()
      : null

    const newEvent = {
      name: cleanName,
      venue: eventForm.venue.trim() || null,
      address: eventForm.address.trim() || null,
      city: eventForm.city.trim() || null,
      state: eventForm.state.trim() || null,
      location:
        eventForm.location.trim() ||
        [eventForm.city.trim(), eventForm.state.trim()].filter(Boolean).join(', ') ||
        null,
      starts_at: startsAt,
      end_date: eventForm.end_date || null,
      icon_url: eventForm.icon_url.trim() || null,
      floorplan_url: eventForm.floorplan_url.trim() || null,
      floorplan_preview_url: eventForm.floorplan_preview_url.trim() || null,
    }

    const { data, error } = await supabase
      .from('events')
      .insert(newEvent)
      .select()
      .single()

    if (error) {
      setMessage(error.message)
      return
    }

    setEvents((current) => [...current, data].sort(sortEventsByDate))
    setEventForm({
      name: '',
      venue: '',
      address: '',
      city: '',
      state: '',
      location: '',
      starts_at: '',
      end_date: '',
      icon_url: '',
      floorplan_url: '',
      floorplan_preview_url: '',
    })
    setMessage('Show created.')
  }

  function toDatetimeLocalValue(value) {
    if (!value) return ''

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''

    const offsetMs = date.getTimezoneOffset() * 60000
    const localDate = new Date(date.getTime() - offsetMs)

    return localDate.toISOString().slice(0, 16)
  }

  function openEditShow(event) {
    setEditingEventId(event.id)
    setEditEventForm({
      name: event.name || '',
      venue: event.venue || '',
      address: event.address || '',
      city: event.city || '',
      state: event.state || '',
      location: event.location || '',
      starts_at: toDatetimeLocalValue(event.starts_at),
      end_date: event.end_date || '',
      icon_url: event.icon_url || '',
      floorplan_url: event.floorplan_url || '',
      floorplan_preview_url: event.floorplan_preview_url || '',
    })
  }

  function cancelEditShow() {
    setEditingEventId(null)
    setEditEventForm({
      name: '',
      venue: '',
      address: '',
      city: '',
      state: '',
      location: '',
      starts_at: '',
      end_date: '',
      icon_url: '',
      floorplan_url: '',
      floorplan_preview_url: '',
    })
  }

  async function saveShowEdit(event) {
    setMessage('')

    const cleanName = editEventForm.name.trim()

    if (!cleanName) {
      setMessage('Please enter a show name.')
      return
    }

    const startsAt = editEventForm.starts_at
      ? new Date(editEventForm.starts_at).toISOString()
      : null

    const updates = {
      name: cleanName,
      venue: editEventForm.venue.trim() || null,
      address: editEventForm.address.trim() || null,
      city: editEventForm.city.trim() || null,
      state: editEventForm.state.trim() || null,
      location:
        editEventForm.location.trim() ||
        [editEventForm.city.trim(), editEventForm.state.trim()].filter(Boolean).join(', ') ||
        null,
      starts_at: startsAt,
      end_date: editEventForm.end_date || null,
      icon_url: editEventForm.icon_url.trim() || null,
      floorplan_url: editEventForm.floorplan_url.trim() || null,
      floorplan_preview_url: editEventForm.floorplan_preview_url.trim() || null,
    }

    const { data, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', event.id)
      .select()
      .single()

    if (error) {
      setMessage(error.message)
      return
    }

    setEvents((current) =>
      current
        .map((item) => (item.id === event.id ? data : item))
        .sort(sortEventsByDate)
    )

    cancelEditShow()
    setMessage('Show updated.')
  }

  async function deleteShow(event) {
    const confirmed = window.confirm(`Delete ${event.name}?`)

    if (!confirmed) return

    const { error } = await supabase.from('events').delete().eq('id', event.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setEvents((current) => current.filter((item) => item.id !== event.id))
    setMessage('Show deleted.')
  }

  function sortEventsByDate(a, b) {
    return new Date(a.starts_at || 0).getTime() - new Date(b.starts_at || 0).getTime()
  }

  function formatDate(date) {
    if (!date) return 'Date TBD'

    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function formatTime(date) {
    if (!date) return ''

    return new Date(date).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function formatStatus(status) {
    switch (status) {
      case 'approved':
        return 'Approved'
      case 'rejected':
        return 'Rejected'
      default:
        return 'Pending'
    }
  }

  function statusClasses(status) {
    switch (status) {
      case 'approved':
        return 'bg-green-500 text-black'
      case 'rejected':
        return 'bg-red-500 text-white'
      default:
        return 'bg-yellow-300 text-black'
    }
  }

  const filteredApplications = useMemo(() => {
    if (applicationFilter === 'all') return applications
    return applications.filter((application) => application.status === applicationFilter)
  }, [applications, applicationFilter])

  const applicationCounts = {
    all: applications.length,
    pending: applications.filter((item) => item.status === 'pending').length,
    approved: applications.filter((item) => item.status === 'approved').length,
    rejected: applications.filter((item) => item.status === 'rejected').length,
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black px-5 py-8 pb-24 text-white">
        <main className="mx-auto max-w-[430px]">
          <p className="text-sm text-gray-400">Loading admin...</p>
        </main>
        <Navbar />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black px-5 py-8 pb-24 text-white">
        <main className="mx-auto max-w-[430px]">
          <div className="rounded-3xl border border-[#222] bg-[#111] p-6 text-center">
            <ShieldCheck className="mx-auto mb-3 text-gray-500" size={40} />
            <h1 className="text-2xl font-bold">Admin access required</h1>
            <p className="mt-2 text-sm text-gray-400">
              This page is only available to admin accounts.
            </p>
          </div>
        </main>
        <Navbar />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black px-5 py-8 pb-24 text-white">
      <main className="mx-auto max-w-[430px]">
        <div className="mb-6">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-300 text-black">
            <ShieldCheck size={24} />
          </div>

          <h1 className="text-3xl font-bold">Admin</h1>
          <p className="mt-1 text-sm text-gray-400">
            Review vendor applications and create shows.
          </p>
        </div>

        <div className="mb-5 flex rounded-2xl border border-[#222] bg-[#111] p-1">
          <button
            onClick={() => setActiveTab('applications')}
            className={`w-1/2 rounded-xl py-3 text-sm font-semibold transition ${
              activeTab === 'applications' ? 'bg-white text-black' : 'text-gray-400'
            }`}
          >
            Applications
          </button>

          <button
            onClick={() => setActiveTab('shows')}
            className={`w-1/2 rounded-xl py-3 text-sm font-semibold transition ${
              activeTab === 'shows' ? 'bg-white text-black' : 'text-gray-400'
            }`}
          >
            Shows
          </button>
        </div>

        {message && (
          <p
            className={`mb-4 rounded-xl border p-3 text-sm font-bold ${
              message.toLowerCase().includes('approved') ||
              message.toLowerCase().includes('created') ||
              message.toLowerCase().includes('deleted') ||
              message.toLowerCase().includes('updated') ||
              message.toLowerCase().includes('rejected')
                ? 'border-green-900 bg-green-950/40 text-green-300'
                : 'border-red-900 bg-red-950/40 text-red-300'
            }`}
          >
            {message}
          </p>
        )}

        {activeTab === 'applications' && (
          <section>
            <div className="mb-4 grid grid-cols-4 gap-2">
              {[
                ['pending', 'Pending'],
                ['approved', 'Approved'],
                ['rejected', 'Rejected'],
                ['all', 'All'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setApplicationFilter(value)}
                  className={`rounded-xl border p-3 text-xs font-bold ${
                    applicationFilter === value
                      ? 'border-white bg-white text-black'
                      : 'border-[#222] bg-[#111] text-gray-400'
                  }`}
                >
                  {label}
                  <span className="mt-1 block text-sm">
                    {applicationCounts[value]}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={fetchApplications}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#222] bg-[#111] p-3 text-sm font-semibold text-gray-300"
            >
              <RefreshCcw size={16} />
              Refresh Applications
            </button>

            {filteredApplications.length === 0 ? (
              <EmptyState
                icon={<Store className="mx-auto mb-3 text-gray-500" size={36} />}
                title="No applications found"
                message="Vendor applications will appear here after users apply from Shows."
              />
            ) : (
              <div className="space-y-3">
                {filteredApplications.map((application) => (
                  <div
                    key={application.id}
                    className="rounded-3xl border border-[#222] bg-[#111] p-4"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold">
                          {application.business_name}
                        </h2>
                        <p className="mt-1 text-sm text-gray-400">
                          @{application.users?.username || 'unknown user'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {application.users?.display_name || 'No email found'}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-yellow-300">
                          Access: {application.users?.account_type || 'user'}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusClasses(
                          application.status
                        )}`}
                      >
                        {formatStatus(application.status)}
                      </span>
                    </div>

                    {application.proof_link && (
                      <a
                        href={application.proof_link}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-3 flex items-center gap-2 rounded-xl border border-[#222] bg-black p-3 text-sm font-semibold text-yellow-300"
                      >
                        <ExternalLink size={16} />
                        View Proof
                      </a>
                    )}

                    {application.note && (
                      <p className="mb-3 rounded-xl border border-[#222] bg-black p-3 text-sm text-gray-300">
                        {application.note}
                      </p>
                    )}

                    <p className="mb-3 text-xs text-gray-500">
                      Applied {formatDate(application.created_at)} {formatTime(application.created_at)}
                    </p>

                    {application.status === 'pending' && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => approveApplication(application)}
                          className="flex items-center justify-center gap-2 rounded-xl bg-green-500 p-3 text-sm font-bold text-black"
                        >
                          <CheckCircle size={16} />
                          Approve
                        </button>

                        <button
                          onClick={() => rejectApplication(application)}
                          className="flex items-center justify-center gap-2 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm font-bold text-red-300"
                        >
                          <XCircle size={16} />
                          Reject
                        </button>
                      </div>
                    )}
                    {application.users?.account_type === 'vendor' && (
                      <button
                        onClick={() => removeVendorAccess(application)}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm font-bold text-red-300"
                      >
                        <XCircle size={16} />
                        Remove Vendor Access
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'shows' && (
          <section>
            <div className="mb-5 rounded-3xl border border-[#222] bg-[#111] p-5">
              <h2 className="text-xl font-bold">Create Show</h2>
              <p className="mt-1 text-sm text-gray-400">
                Add a show to the public event list.
              </p>

              <div className="mt-4 space-y-3">
                <input
                  placeholder="Show name"
                  value={eventForm.name}
                  onChange={(e) =>
                    setEventForm((current) => ({ ...current, name: e.target.value }))
                  }
                  className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />

                <input
                  placeholder="Venue"
                  value={eventForm.venue}
                  onChange={(e) =>
                    setEventForm((current) => ({ ...current, venue: e.target.value }))
                  }
                  className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />

                <input
                  placeholder="Address"
                  value={eventForm.address}
                  onChange={(e) =>
                    setEventForm((current) => ({ ...current, address: e.target.value }))
                  }
                  className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />

                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="City"
                    value={eventForm.city}
                    onChange={(e) =>
                      setEventForm((current) => ({ ...current, city: e.target.value }))
                    }
                    className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                  />

                  <input
                    placeholder="State"
                    value={eventForm.state}
                    onChange={(e) =>
                      setEventForm((current) => ({ ...current, state: e.target.value }))
                    }
                    className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                  />
                </div>

                <input
                  placeholder="Location label, optional"
                  value={eventForm.location}
                  onChange={(e) =>
                    setEventForm((current) => ({
                      ...current,
                      location: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />

                <div>
                  <label className="mb-2 block text-sm text-gray-400">
                    Start date and time
                  </label>
                  <input
                    type="datetime-local"
                    value={eventForm.starts_at}
                    onChange={(e) =>
                      setEventForm((current) => ({
                        ...current,
                        starts_at: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-gray-400">
                    End date
                  </label>
                  <input
                    type="date"
                    value={eventForm.end_date}
                    onChange={(e) =>
                      setEventForm((current) => ({
                        ...current,
                        end_date: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                  />
                </div>

                <input
                  placeholder="Icon URL, optional"
                  value={eventForm.icon_url}
                  onChange={(e) =>
                    setEventForm((current) => ({
                      ...current,
                      icon_url: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />

                <input
                  placeholder="Floorplan URL, optional"
                  value={eventForm.floorplan_url}
                  onChange={(e) =>
                    setEventForm((current) => ({
                      ...current,
                      floorplan_url: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />

                <input
                  placeholder="Floorplan preview URL, optional"
                  value={eventForm.floorplan_preview_url}
                  onChange={(e) =>
                    setEventForm((current) => ({
                      ...current,
                      floorplan_preview_url: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />

                <button
                  onClick={createShow}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white p-4 font-bold text-black"
                >
                  <Plus size={16} />
                  Create Show
                </button>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold">Existing Shows</h2>
              <button
                onClick={fetchEvents}
                className="rounded-xl border border-[#222] bg-[#111] p-3 text-gray-300"
              >
                <RefreshCcw size={16} />
              </button>
            </div>

            {events.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="mx-auto mb-3 text-gray-500" size={36} />}
                title="No shows yet"
                message="Create your first show above."
              />
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-3xl border border-[#222] bg-[#111] p-4"
                  >
                    <div className="flex gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#222] bg-black">
                        {event.icon_url ? (
                          <img
                            src={event.icon_url}
                            alt={event.name}
                            className="h-10 w-10 rounded-xl object-cover"
                          />
                        ) : (
                          <Store className="text-gray-500" size={26} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-lg font-bold leading-tight">
                          {event.name}
                        </h3>
                        <p className="mt-1 text-sm text-gray-400">
                          {event.venue || 'Venue TBD'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {[event.city, event.state].filter(Boolean).join(', ') || 'Location TBD'}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-yellow-300">
                          {formatDate(event.starts_at)} {formatTime(event.starts_at)}
                        </p>
                      </div>
                    </div>

                    {editingEventId === event.id ? (
                      <div className="mt-4 rounded-2xl border border-[#222] bg-black p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="font-bold">Edit Show</h4>
                          <button
                            onClick={cancelEditShow}
                            className="rounded-lg p-2 text-gray-500 hover:bg-[#1a1a1a] hover:text-white"
                          >
                            <XCircle size={18} />
                          </button>
                        </div>

                        <div className="space-y-3">
                          <input
                            placeholder="Show name"
                            value={editEventForm.name}
                            onChange={(e) =>
                              setEditEventForm((current) => ({
                                ...current,
                                name: e.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
                          />

                          <input
                            placeholder="Venue"
                            value={editEventForm.venue}
                            onChange={(e) =>
                              setEditEventForm((current) => ({
                                ...current,
                                venue: e.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
                          />

                          <input
                            placeholder="Address"
                            value={editEventForm.address}
                            onChange={(e) =>
                              setEditEventForm((current) => ({
                                ...current,
                                address: e.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
                          />

                          <div className="grid grid-cols-2 gap-2">
                            <input
                              placeholder="City"
                              value={editEventForm.city}
                              onChange={(e) =>
                                setEditEventForm((current) => ({
                                  ...current,
                                  city: e.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
                            />

                            <input
                              placeholder="State"
                              value={editEventForm.state}
                              onChange={(e) =>
                                setEditEventForm((current) => ({
                                  ...current,
                                  state: e.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
                            />
                          </div>

                          <input
                            placeholder="Location label, optional"
                            value={editEventForm.location}
                            onChange={(e) =>
                              setEditEventForm((current) => ({
                                ...current,
                                location: e.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
                          />

                          <div>
                            <label className="mb-2 block text-sm text-gray-400">
                              Start date and time
                            </label>
                            <input
                              type="datetime-local"
                              value={editEventForm.starts_at}
                              onChange={(e) =>
                                setEditEventForm((current) => ({
                                  ...current,
                                  starts_at: e.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm text-gray-400">
                              End date
                            </label>
                            <input
                              type="date"
                              value={editEventForm.end_date}
                              onChange={(e) =>
                                setEditEventForm((current) => ({
                                  ...current,
                                  end_date: e.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
                            />
                          </div>

                          <input
                            placeholder="Icon URL, optional"
                            value={editEventForm.icon_url}
                            onChange={(e) =>
                              setEditEventForm((current) => ({
                                ...current,
                                icon_url: e.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
                          />

                          <input
                            placeholder="Floorplan URL, optional"
                            value={editEventForm.floorplan_url}
                            onChange={(e) =>
                              setEditEventForm((current) => ({
                                ...current,
                                floorplan_url: e.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
                          />

                          <input
                            placeholder="Floorplan preview URL, optional"
                            value={editEventForm.floorplan_preview_url}
                            onChange={(e) =>
                              setEditEventForm((current) => ({
                                ...current,
                                floorplan_preview_url: e.target.value,
                              }))
                            }
                            className="w-full rounded-xl border border-[#222] bg-[#111] p-3 text-white outline-none"
                          />

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => saveShowEdit(event)}
                              className="rounded-xl bg-white p-3 text-sm font-bold text-black"
                            >
                              Save
                            </button>

                            <button
                              onClick={cancelEditShow}
                              className="rounded-xl border border-[#333] bg-[#111] p-3 text-sm font-bold text-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => openEditShow(event)}
                          className="flex items-center justify-center gap-2 rounded-xl border border-[#222] bg-black p-3 text-sm font-bold text-gray-300"
                        >
                          <Pencil size={16} />
                          Edit Show
                        </button>

                        <button
                          onClick={() => deleteShow(event)}
                          className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm font-bold text-red-300"
                        >
                          Delete Show
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <Navbar />
    </div>
  )
}

function EmptyState({ icon, title, message }) {
  return (
    <div className="rounded-2xl border border-[#222] bg-[#111] p-6 text-center">
      {icon}
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-gray-400">{message}</p>
    </div>
  )
}

export default Admin
