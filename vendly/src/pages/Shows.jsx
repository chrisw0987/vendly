import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import {
  CalendarDays,
  MapPin,
  Store,
  Eye,
  EyeOff,
  LogOut,
  Pencil,
  Plus,
  X,
  Lock,
  ShieldCheck,
  Upload,
} from 'lucide-react'

function Shows() {
  const [activeTab, setActiveTab] = useState('available')
  const [events, setEvents] = useState([])
  const [profiles, setProfiles] = useState([])
  const [showBooths, setShowBooths] = useState([])
  const [boothInputs, setBoothInputs] = useState({})
  const [displayNameInputs, setDisplayNameInputs] = useState({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [accountType, setAccountType] = useState('user')
  const [existingApplication, setExistingApplication] = useState(null)
  const [vendorApplication, setVendorApplication] = useState({
    businessName: '',
    proofLink: '',
    note: '',
  })
  const [editingProfile, setEditingProfile] = useState(null)
  const [editForm, setEditForm] = useState({
    booth_number: '',
    display_name: '',
    public_enabled: true,
  })

  const isVendor = accountType === 'vendor' || accountType === 'admin'
  const isPendingVendor =
    accountType === 'vendor_pending' || existingApplication?.status === 'pending'

  useEffect(() => {
    fetchData()
  }, [])

  async function getUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    return user
  }

  async function fetchAccountType(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('account_type, username, display_name')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Account type fetch error:', error.message)
      return 'user'
    }

    return data?.account_type || 'user'
  }

  async function fetchVendorApplication(userId) {
    const { data, error } = await supabase
      .from('vendor_applications')
      .select('id, business_name, proof_link, note, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Vendor application fetch error:', error.message)
      return null
    }

    return data || null
  }

  async function fetchData() {
    setLoading(true)
    setMessage('')

    const user = await getUser()

    if (!user) {
      setMessage('You must be logged in.')
      setLoading(false)
      return
    }

    setCurrentUserId(user.id)

    const type = await fetchAccountType(user.id)
    setAccountType(type)

    const application = await fetchVendorApplication(user.id)
    setExistingApplication(application)

    const { data: eventsData, error: eventsError } = await supabase
      .from('events')
      .select('id, name, city, state, venue, address, starts_at, icon_url')
      .order('starts_at', { ascending: true })

    if (eventsError) {
      setMessage(eventsError.message)
      setLoading(false)
      return
    }

    setEvents(eventsData || [])

    if (type !== 'vendor' && type !== 'admin') {
      setProfiles([])
      setShowBooths([])
      setLoading(false)
      return
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from('vendor_event_profiles')
      .select('*')

    if (profilesError) {
      setMessage(profilesError.message)
      setLoading(false)
      return
    }

    const { data: boothData, error: boothError } = await supabase
      .from('show_booths')
      .select('id, event_id, booth_code, section_label, table_number, room_name, row_order, col_order')
      .order('row_order', { ascending: true })
      .order('col_order', { ascending: true })
      .order('booth_code', { ascending: true })

    if (boothError) {
      setMessage(boothError.message)
      setLoading(false)
      return
    }

    setProfiles(profilesData || [])
    setShowBooths(boothData || [])
    setLoading(false)
  }

  function getMyProfileForEvent(eventId, userId) {
    return profiles.find(
      (profile) => profile.event_id === eventId && profile.vendor_id === userId
    )
  }

  function getEventForProfile(profile) {
    return events.find((event) => event.id === profile.event_id)
  }

  function getTakenBoothsForEvent(eventId, excludeProfileId = null) {
    return profiles
      .filter(
        (profile) =>
          profile.event_id === eventId &&
          profile.booth_number &&
          profile.id !== excludeProfileId
      )
      .map((profile) => profile.booth_number)
  }

  function getBoothOptionsForEvent(eventId) {
    return showBooths
      .filter((booth) => booth.event_id === eventId)
      .sort((a, b) => {
        const rowDiff = Number(a.row_order || 0) - Number(b.row_order || 0)
        if (rowDiff !== 0) return rowDiff

        const colDiff = Number(a.col_order || 0) - Number(b.col_order || 0)
        if (colDiff !== 0) return colDiff

        return String(a.booth_code || '').localeCompare(String(b.booth_code || ''))
      })
      .map((booth) => booth.booth_code)
      .filter(Boolean)
  }

  function getAvailableBoothsForEvent(eventId, currentBooth = '', excludeProfileId = null) {
    const boothOptionsForEvent = getBoothOptionsForEvent(eventId)
    const takenBooths = getTakenBoothsForEvent(eventId, excludeProfileId)

    return boothOptionsForEvent.filter(
      (booth) => booth === currentBooth || !takenBooths.includes(booth)
    )
  }

  function handleProfileError(error) {
    if (!error) return false

    if (error.code === '23505') {
      setMessage('This booth is already taken for this show. Please choose another booth.')
    } else {
      setMessage(error.message)
    }

    return true
  }

  async function joinShow(event) {
    if (!isVendor) {
      setMessage('Vendor access is required to join shows.')
      return
    }

    const user = await getUser()
    if (!user) return

    const boothNumber = boothInputs[event.id]?.trim()
    const displayName = displayNameInputs[event.id]?.trim()

    if (!boothNumber) {
      setMessage('Please choose a booth number.')
      return
    }

    const existingProfile = getMyProfileForEvent(event.id, user.id)

    if (existingProfile) {
      const { error } = await supabase
        .from('vendor_event_profiles')
        .update({
          booth_number: boothNumber,
          display_name: displayName || 'Vendor',
          public_enabled: true,
        })
        .eq('id', existingProfile.id)

      if (handleProfileError(error)) return

      setMessage('Show profile updated.')
    } else {
      const { error } = await supabase.from('vendor_event_profiles').insert({
        event_id: event.id,
        vendor_id: user.id,
        booth_number: boothNumber,
        display_name: displayName || 'Vendor',
        public_enabled: true,
      })

      if (handleProfileError(error)) return

      setMessage('You joined this show.')
    }

    setBoothInputs((current) => ({ ...current, [event.id]: '' }))
    setDisplayNameInputs((current) => ({ ...current, [event.id]: '' }))
    fetchData()
  }

  async function leaveShow(profile) {
    const event = getEventForProfile(profile)
    const confirmed = window.confirm(
      `Leave ${event?.name || 'this show'}? This will remove your booth profile for this event.`
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('vendor_event_profiles')
      .delete()
      .eq('id', profile.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setProfiles((current) => current.filter((item) => item.id !== profile.id))
    setMessage('You left this show.')
  }

  async function togglePublic(profile) {
    const { error } = await supabase
      .from('vendor_event_profiles')
      .update({
        public_enabled: !profile.public_enabled,
      })
      .eq('id', profile.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setProfiles((current) =>
      current.map((item) =>
        item.id === profile.id
          ? { ...item, public_enabled: !profile.public_enabled }
          : item
      )
    )
  }

  function openEditModal(profile) {
    setEditingProfile(profile)
    setEditForm({
      booth_number: profile.booth_number || '',
      display_name: profile.display_name || '',
      public_enabled: profile.public_enabled ?? true,
    })
  }

  async function saveProfileEdit() {
    if (!editingProfile) return

    if (!editForm.booth_number.trim()) {
      setMessage('Please choose a booth number.')
      return
    }

    const updates = {
      booth_number: editForm.booth_number.trim(),
      display_name: editForm.display_name.trim() || 'Vendor',
      public_enabled: editForm.public_enabled,
    }

    const { error } = await supabase
      .from('vendor_event_profiles')
      .update(updates)
      .eq('id', editingProfile.id)

    if (handleProfileError(error)) return

    setProfiles((current) =>
      current.map((profile) =>
        profile.id === editingProfile.id ? { ...profile, ...updates } : profile
      )
    )

    setEditingProfile(null)
    setMessage('Show profile updated.')
  }

  async function submitVendorApplication() {
    if (isPendingVendor) {
      setMessage('Your vendor application is already submitted. Please wait while we review it.')
      return
    }

    const cleanBusinessName = vendorApplication.businessName.trim()
    const cleanProofLink = vendorApplication.proofLink.trim()
    const cleanNote = vendorApplication.note.trim()

    if (!cleanBusinessName) {
      setMessage('Please enter your vendor or business name.')
      return
    }

    if (!cleanProofLink) {
      setMessage('Please add proof, such as a website, Instagram, seller profile, or show reference.')
      return
    }

    if (!currentUserId) {
      setMessage('You must be logged in to submit a vendor application.')
      return
    }

    setMessage('')

    const { data: applicationData, error: applicationError } = await supabase
      .from('vendor_applications')
      .insert({
        user_id: currentUserId,
        business_name: cleanBusinessName,
        proof_link: cleanProofLink,
        note: cleanNote || null,
        status: 'pending',
      })
      .select('id, business_name, proof_link, note, status, created_at')
      .single()

    if (applicationError) {
      if (applicationError.code === '23505') {
        setMessage('Your vendor application is already submitted. Please wait while we review it.')
        setAccountType('vendor_pending')
      } else {
        setMessage(applicationError.message)
      }
      return
    }

    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ account_type: 'vendor_pending' })
      .eq('id', currentUserId)

    if (userUpdateError) {
      setMessage(userUpdateError.message)
      return
    }

    setExistingApplication(applicationData)
    setAccountType('vendor_pending')
    setVendorApplication({
      businessName: '',
      proofLink: '',
      note: '',
    })
    setMessage('Your vendor application has been submitted. Please wait while we review it.')
  }

  function formatDate(date) {
    if (!date) return 'TBD'

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

  const myProfiles = useMemo(
    () => profiles.filter((profile) => profile.vendor_id === currentUserId),
    [profiles, currentUserId]
  )

  const myShowEventIds = useMemo(
    () => new Set(myProfiles.map((profile) => profile.event_id)),
    [myProfiles]
  )

  const availableShows = events
  const myShows = myProfiles
    .map((profile) => ({
      profile,
      event: getEventForProfile(profile),
    }))
    .filter((item) => item.event)

  if (!loading && !isVendor) {
    return (
      <div className="min-h-screen bg-black px-5 py-8 pb-24 text-white">
        <main className="mx-auto max-w-[430px]">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Shows</h1>
            <p className="mt-1 text-sm text-gray-400">
              Browse upcoming shows and apply for vendor access.
            </p>
          </div>

          {message && (
            <p className="mb-4 rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-gray-300">
              {message}
            </p>
          )}

          <div className="mb-5 rounded-3xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow-300 text-black">
              <Lock size={24} />
            </div>

            <h2 className="text-2xl font-bold">
              {isPendingVendor ? 'Vendor application pending' : 'Vendor access required'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">
              {isPendingVendor
                ? 'Your application is submitted. Please wait while we review your vendor access.'
                : 'Regular users can explore shows, save events, and track their collection. Joining shows, choosing booths, and assigning show inventory are reserved for approved vendors.'}
            </p>

            <div className="mt-4 rounded-2xl border border-[#222] bg-black p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 shrink-0 text-yellow-300" size={20} />
                <div>
                  <p className="font-semibold">
                    {isPendingVendor ? 'Application submitted' : 'Want to vend at shows?'}
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    {isPendingVendor
                      ? 'Once approved, this page will unlock booth management and show inventory tools.'
                      : 'Submit your vendor details below. Once approved, this page will unlock booth management and show inventory tools.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-5 rounded-3xl border border-[#222] bg-[#111] p-5">
            <h2 className="text-xl font-bold">
              {isPendingVendor ? 'Vendor application status' : 'Apply to become a vendor'}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {isPendingVendor
                ? 'You do not need to apply again. We will review your details and update your access.'
                : 'Add proof like your Instagram, business page, seller profile, or a reference from a show organizer.'}
            </p>

            {isPendingVendor ? (
              <div className="mt-4 rounded-2xl border border-yellow-900 bg-yellow-950/20 p-4">
                <p className="font-semibold text-yellow-300">Your application is submitted</p>
                <p className="mt-1 text-sm text-gray-400">
                  Please wait while we review your vendor access. Once approved, booth management and show inventory tools will unlock here.
                </p>
                {existingApplication?.created_at && (
                  <p className="mt-3 text-xs text-gray-500">
                    Submitted {formatDate(existingApplication.created_at)}
                  </p>
                )}
              </div>
            ) : existingApplication?.status === 'rejected' ? (
              <div className="mt-4 rounded-2xl border border-red-900 bg-red-950/20 p-4">
                <p className="font-semibold text-red-300">Application not approved</p>
                <p className="mt-1 text-sm text-gray-400">
                  Your last vendor application was not approved. You can update your details and submit again.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <input
                  placeholder="Vendor or business name"
                  value={vendorApplication.businessName}
                  onChange={(e) =>
                    setVendorApplication((current) => ({
                      ...current,
                      businessName: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />

                <input
                  placeholder="Proof link: Instagram, website, seller profile, etc."
                  value={vendorApplication.proofLink}
                  onChange={(e) =>
                    setVendorApplication((current) => ({
                      ...current,
                      proofLink: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />

                <textarea
                  placeholder="Optional note"
                  value={vendorApplication.note}
                  onChange={(e) =>
                    setVendorApplication((current) => ({
                      ...current,
                      note: e.target.value,
                    }))
                  }
                  rows={4}
                  className="w-full resize-none rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                />

                <button
                  onClick={submitVendorApplication}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white p-4 font-semibold text-black"
                >
                  <Upload size={16} />
                  Submit Vendor Application
                </button>
              </div>
            )}
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-[#222] bg-[#111] p-4">
              <p className="text-xs text-gray-500">Upcoming Shows</p>
              <p className="mt-1 text-2xl font-bold">{events.length}</p>
            </div>

            <div className="rounded-2xl border border-[#222] bg-[#111] p-4">
              <p className="text-xs text-gray-500">Your Access</p>
              <p className="mt-1 text-lg font-bold text-yellow-300">
                {isPendingVendor ? 'Pending' : 'User'}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {availableShows.length === 0 ? (
              <EmptyState
                title="No shows available"
                message="Add events to your events table to show upcoming events here."
              />
            ) : (
              availableShows.map((event) => (
                <div
                  key={event.id}
                  className="rounded-3xl border border-[#222] bg-[#111] p-4"
                >
                  <EventHeader event={event} formatDate={formatDate} formatTime={formatTime} />

                  <div className="mt-4 rounded-2xl border border-[#222] bg-black p-4">
                    <p className="text-sm font-semibold text-gray-300">
                      {isPendingVendor
                        ? 'Your vendor application is under review.'
                        : 'Vendor joining is locked for regular users.'}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {isPendingVendor
                        ? 'Once approved, booth selection and show inventory tools will unlock.'
                        : 'Apply above to unlock booth selection and show inventory tools.'}
                    </p>
                  </div>
                </div>
              ))
            )}
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
          <h1 className="text-3xl font-bold">Shows</h1>
          <p className="mt-1 text-sm text-gray-400">
            Join events, manage your booth, and prep show inventory.
          </p>
        </div>

        <div className="mb-5 flex rounded-2xl border border-[#222] bg-[#111] p-1">
          <button
            onClick={() => setActiveTab('available')}
            className={`w-1/2 rounded-xl py-3 text-sm font-semibold transition ${
              activeTab === 'available' ? 'bg-white text-black' : 'text-gray-400'
            }`}
          >
            Available Shows
          </button>

          <button
            onClick={() => setActiveTab('mine')}
            className={`w-1/2 rounded-xl py-3 text-sm font-semibold transition ${
              activeTab === 'mine' ? 'bg-white text-black' : 'text-gray-400'
            }`}
          >
            My Shows
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-[#222] bg-[#111] p-4">
            <p className="text-xs text-gray-500">Available</p>
            <p className="mt-1 text-2xl font-bold">{events.length}</p>
          </div>

          <div className="rounded-2xl border border-[#222] bg-[#111] p-4">
            <p className="text-xs text-gray-500">Joined</p>
            <p className="mt-1 text-2xl font-bold text-yellow-300">
              {myProfiles.length}
            </p>
          </div>
        </div>

        {message && (
          <p className="mb-4 rounded-xl border border-[#222] bg-[#111] p-3 text-sm text-gray-300">
            {message}
          </p>
        )}

        {loading && <p className="text-sm text-gray-400">Loading shows...</p>}

        {!loading && activeTab === 'available' && (
          <div className="space-y-4">
            {availableShows.length === 0 ? (
              <EmptyState
                title="No shows available"
                message="Add events to your events table to start joining shows."
              />
            ) : (
              availableShows.map((event) => {
                const profile = myProfiles.find((item) => item.event_id === event.id)
                const isJoined = myShowEventIds.has(event.id)
                const boothOptionsForEvent = getBoothOptionsForEvent(event.id)
                const availableBooths = getAvailableBoothsForEvent(event.id)

                return (
                  <div
                    key={event.id}
                    className="rounded-3xl border border-[#222] bg-[#111] p-4"
                  >
                    <EventHeader event={event} formatDate={formatDate} formatTime={formatTime} />

                    {isJoined && profile ? (
                      <div className="mt-4 rounded-2xl border border-green-900 bg-green-950/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs text-green-300">Joined</p>
                            <p className="mt-1 font-semibold">
                              Booth {profile.booth_number}
                            </p>
                            <p className="text-sm text-gray-400">
                              {profile.display_name || 'Vendor'}
                            </p>
                          </div>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              profile.public_enabled
                                ? 'bg-green-500 text-black'
                                : 'bg-[#222] text-gray-300'
                            }`}
                          >
                            {profile.public_enabled ? 'Visible' : 'Hidden'}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => openEditModal(profile)}
                            className="flex items-center justify-center gap-2 rounded-xl border border-[#222] bg-black p-3 text-sm font-semibold"
                          >
                            <Pencil size={16} />
                            Edit
                          </button>

                          <button
                            onClick={() => setActiveTab('mine')}
                            className="rounded-xl bg-white p-3 text-sm font-semibold text-black"
                          >
                            View My Shows
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2">
                        <select
                          value={boothInputs[event.id] || ''}
                          onChange={(e) =>
                            setBoothInputs((current) => ({
                              ...current,
                              [event.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                        >
                          <option value="">Choose available booth</option>
                          {availableBooths.map((booth) => (
                            <option key={booth} value={booth}>
                              {booth}
                            </option>
                          ))}
                        </select>

                        {boothOptionsForEvent.length === 0 ? (
                          <p className="rounded-xl border border-yellow-900 bg-yellow-950/20 p-3 text-sm text-yellow-300">
                            No booth layout has been added for this show yet.
                          </p>
                        ) : availableBooths.length === 0 ? (
                          <p className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                            No booths are available for this show.
                          </p>
                        ) : null}

                        <input
                          placeholder="Public display name"
                          value={displayNameInputs[event.id] || ''}
                          onChange={(e) =>
                            setDisplayNameInputs((current) => ({
                              ...current,
                              [event.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
                        />

                        <button
                          onClick={() => joinShow(event)}
                          disabled={availableBooths.length === 0}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white p-3 text-sm font-semibold text-black disabled:opacity-50"
                        >
                          <Plus size={16} />
                          Join Show
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {!loading && activeTab === 'mine' && (
          <div className="space-y-4">
            {myShows.length === 0 ? (
              <EmptyState
                title="You have not joined any shows yet"
                message="Go to Available Shows and join one with your booth number."
              />
            ) : (
              myShows.map(({ profile, event }) => (
                <div
                  key={profile.id}
                  className="rounded-3xl border border-[#222] bg-[#111] p-4"
                >
                  <EventHeader event={event} formatDate={formatDate} formatTime={formatTime} />

                  <div className="mt-4 rounded-2xl border border-[#222] bg-black p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-gray-500">Your booth</p>
                        <p className="mt-1 text-xl font-bold">
                          Booth {profile.booth_number}
                        </p>
                        <p className="text-sm text-gray-400">
                          Display name: {profile.display_name || 'Vendor'}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          profile.public_enabled
                            ? 'bg-green-500 text-black'
                            : 'bg-[#222] text-gray-300'
                        }`}
                      >
                        {profile.public_enabled ? 'Visible' : 'Hidden'}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => togglePublic(profile)}
                        className={`flex items-center justify-center gap-2 rounded-xl p-3 text-sm font-semibold ${
                          profile.public_enabled
                            ? 'bg-[#222] text-gray-300'
                            : 'bg-green-500 text-black'
                        }`}
                      >
                        {profile.public_enabled ? <EyeOff size={16} /> : <Eye size={16} />}
                        {profile.public_enabled ? 'Hide Booth' : 'Show Booth'}
                      </button>

                      <button
                        onClick={() => openEditModal(profile)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-[#222] bg-black p-3 text-sm font-semibold"
                      >
                        <Pencil size={16} />
                        Edit Booth
                      </button>
                    </div>

                    <button
                      onClick={() => leaveShow(profile)}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm font-semibold text-red-300"
                    >
                      <LogOut size={16} />
                      Leave Show
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {editingProfile && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-5">
          <div className="mx-auto mt-8 w-full max-w-sm rounded-2xl border border-[#222] bg-[#111] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Edit Booth</h2>
              <button onClick={() => setEditingProfile(null)}>
                <X size={22} />
              </button>
            </div>

            <label className="mb-2 block text-sm text-gray-400">Booth Number</label>
            <select
              value={editForm.booth_number}
              onChange={(e) =>
                setEditForm({ ...editForm, booth_number: e.target.value })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            >
              <option value="">Choose available booth</option>
              {getAvailableBoothsForEvent(
                editingProfile.event_id,
                editForm.booth_number,
                editingProfile.id
              ).map((booth) => (
                <option key={booth} value={booth}>
                  Booth {booth}
                </option>
              ))}
            </select>

            {getBoothOptionsForEvent(editingProfile.event_id).length === 0 && (
              <p className="mb-4 rounded-xl border border-yellow-900 bg-yellow-950/20 p-3 text-sm text-yellow-300">
                No booth layout has been added for this show yet.
              </p>
            )}

            <label className="mb-2 block text-sm text-gray-400">Display Name</label>
            <input
              value={editForm.display_name}
              onChange={(e) =>
                setEditForm({ ...editForm, display_name: e.target.value })
              }
              className="mb-4 w-full rounded-xl border border-[#222] bg-black p-3 text-white outline-none"
            />

            <label className="mb-5 flex items-center gap-3 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={editForm.public_enabled}
                onChange={(e) =>
                  setEditForm({ ...editForm, public_enabled: e.target.checked })
                }
              />
              Make booth visible on map
            </label>

            <button
              onClick={saveProfileEdit}
              className="w-full rounded-xl bg-white p-4 font-semibold text-black"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

      <Navbar />
    </div>
  )
}

function EventHeader({ event, formatDate, formatTime }) {
  return (
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
        <h2 className="break-words text-lg font-bold leading-tight">{event.name}</h2>
        <p className="mt-1 flex items-center gap-1 text-sm text-gray-400">
          <MapPin size={14} />
          {event.venue || 'Venue TBD'}
        </p>
        <p className="text-sm text-gray-500">
          {event.city}, {event.state}
        </p>
      </div>

      <div className="text-right">
        <CalendarDays className="ml-auto text-yellow-300" size={20} />
        <p className="mt-1 text-sm font-semibold text-yellow-300">
          {formatDate(event.starts_at)}
        </p>
        <p className="text-xs text-gray-500">{formatTime(event.starts_at)}</p>
      </div>
    </div>
  )
}

function EmptyState({ title, message }) {
  return (
    <div className="rounded-2xl border border-[#222] bg-[#111] p-6 text-center">
      <CalendarDays className="mx-auto mb-3 text-gray-500" size={36} />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-gray-400">{message}</p>
    </div>
  )
}

export default Shows
