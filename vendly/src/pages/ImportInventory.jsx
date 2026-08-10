import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  SearchCheck,
  CircleHelp,
  CircleX,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'

const VENDLY_FIELDS = [
  { value: '', label: 'Ignore Column' },
  { value: 'card_name', label: 'Card Name' },
  { value: 'set_name', label: 'Set Name' },
  { value: 'card_number', label: 'Card Number' },
  { value: 'item_type', label: 'Item Type' },
  { value: 'condition', label: 'Condition' },
  { value: 'grade_company', label: 'Grade Company' },
  { value: 'grade', label: 'Grade' },
  { value: 'listing_price', label: 'Listing Price' },
  { value: 'purchase_price', label: 'Purchase Price' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'physical_location', label: 'Physical Location' },
]

const COLUMN_ALIASES = {
  card_name: ['card name', 'name', 'product', 'product name', 'card', 'item', 'item name'],
  set_name: ['set', 'set name', 'expansion', 'series', 'product line'],
  card_number: ['number', 'card number', 'card #', 'card no', 'collector number', 'collector #'],
  item_type: ['item type', 'type', 'card type', 'raw graded', 'raw or graded'],
  condition: ['condition', 'quality', 'card condition'],
  grade_company: ['grade company', 'grading company', 'grader', 'grading service'],
  grade: ['grade', 'score', 'numeric grade'],
  listing_price: ['listing price', 'price', 'asking price', 'sale price', 'sell price'],
  purchase_price: ['purchase price', 'cost', 'cost basis', 'buy price', 'paid'],
  quantity: ['quantity', 'qty', 'stock', 'count', 'copies'],
  physical_location: ['physical location', 'location', 'binder', 'storage location', 'box'],
}

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function guessVendlyField(header) {
  const normalized = normalizeHeader(header)

  for (const [vendlyField, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(normalized)) return vendlyField
  }

  return ''
}

function normalizeItemType(value, row) {
  const normalized = String(value || '').trim().toLowerCase()

  if (['graded', 'slab', 'slabbed'].includes(normalized)) return 'graded'
  if (['raw', 'ungraded'].includes(normalized)) return 'raw'
  if (row.grade_company || row.grade) return 'graded'

  return 'raw'
}

function normalizeCondition(value) {
  const normalized = String(value || '').trim().toUpperCase()

  const aliases = {
    'NEAR MINT': 'NM',
    NM: 'NM',
    'LIGHTLY PLAYED': 'LP',
    LP: 'LP',
    'MODERATELY PLAYED': 'MP',
    MP: 'MP',
    'HEAVILY PLAYED': 'HP',
    HP: 'HP',
    DAMAGED: 'DMG',
    DMG: 'DMG',
  }

  return aliases[normalized] || normalized || ''
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null

  const cleaned = String(value)
    .replace(/[$,%]/g, '')
    .replace(/,/g, '')
    .trim()

  if (!cleaned) return null

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function PreviewStat({ label, value }) {
  return (
    <div className="rounded-xl bg-black p-3">
      <p className="text-gray-600">{label}</p>
      <p className="mt-1 break-words font-semibold text-gray-300">{String(value)}</p>
    </div>
  )
}

function ImportInventory() {
  const navigate = useNavigate()
  const location = useLocation()
  const fileInputRef = useRef(null)
  const imageCacheInFlightRef = useRef(new Set())

  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [columnMap, setColumnMap] = useState({})
  const [parseErrors, setParseErrors] = useState([])
  const [message, setMessage] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [matching, setMatching] = useState(false)
  const [matchSummary, setMatchSummary] = useState(null)
  const [matchResults, setMatchResults] = useState([])
  const [showColumnSetup, setShowColumnSetup] = useState(false)
  const [loadingMoreRows, setLoadingMoreRows] = useState({})
  const [candidatePages, setCandidatePages] = useState({})
  const [noMoreCandidateRows, setNoMoreCandidateRows] = useState({})
  const [visibleCandidateCounts, setVisibleCandidateCounts] = useState({})

  const [inventoryLists, setInventoryLists] = useState([])
  const [selectedInventoryListId, setSelectedInventoryListId] = useState(
    location.state?.inventoryListId || ''
  )
  const [vendorShows, setVendorShows] = useState([])
  const [selectedShowIds, setSelectedShowIds] = useState([])
  const [makePublic, setMakePublic] = useState(false)
  const [loadingImportSettings, setLoadingImportSettings] = useState(true)
  const [removedRowNumbers, setRemovedRowNumbers] = useState([])
  const [manualRows, setManualRows] = useState([])
  const [rowOverrides, setRowOverrides] = useState({})
  const [addingCard, setAddingCard] = useState(false)
  const [newCardDraft, setNewCardDraft] = useState({
    card_name: '',
    set_name: '',
    card_number: '',
    item_type: 'raw',
    condition: 'NM',
    grade_company: 'PSA',
    grade: '10',
    listing_price: '',
    purchase_price: '',
    quantity: 1,
    physical_location: '',
  })
  const [newCardSearching, setNewCardSearching] = useState(false)
  const [newCardMatchResult, setNewCardMatchResult] = useState(null)
  const [newCardVisibleCount, setNewCardVisibleCount] = useState(10)
  const [editingIdentityRow, setEditingIdentityRow] = useState(null)
  const [identityDraft, setIdentityDraft] = useState({
    card_name: '',
    set_name: '',
    card_number: '',
    item_type: 'raw',
    condition: 'NM',
    grade_company: 'PSA',
    grade: '10',
  })
  const [retryingRowNumber, setRetryingRowNumber] = useState(null)
  const [creatingList, setCreatingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [savingNewList, setSavingNewList] = useState(false)
  const [committingImport, setCommittingImport] = useState(false)
  const [importComplete, setImportComplete] = useState(null)

  useEffect(() => {
    loadImportSettings()
  }, [])

  async function loadImportSettings() {
    setLoadingImportSettings(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setLoadingImportSettings(false)
      return
    }

    const [{ data: listData }, { data: showData }] = await Promise.all([
      supabase
        .from('inventory_lists')
        .select('id, name')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('vendor_event_profiles')
        .select(`
          event_id,
          booth_number,
          events (
            id,
            name,
            venue,
            city,
            state,
            starts_at
          )
        `)
        .eq('vendor_id', user.id),
    ])

    const nextLists = listData || []
    setInventoryLists(nextLists)

    setSelectedInventoryListId((current) => {
      if (current && nextLists.some((list) => list.id === current)) {
        return current
      }

      return nextLists[0]?.id || ''
    })

    const nextShows =
      showData
        ?.map((profile) => ({
          ...profile.events,
          booth_number: profile.booth_number,
        }))
        .filter(Boolean)
        .sort(
          (a, b) =>
            new Date(a.starts_at || 0).getTime() -
            new Date(b.starts_at || 0).getTime()
        ) || []

    setVendorShows(nextShows)
    setLoadingImportSettings(false)
  }

  const hasFile = rawRows.length > 0 || headers.length > 0

  const mappedFields = useMemo(
    () => new Set(Object.values(columnMap).filter(Boolean)),
    [columnMap]
  )

  const recognizedColumnCount = useMemo(
    () => Object.values(columnMap).filter(Boolean).length,
    [columnMap]
  )

  const ignoredHeaders = useMemo(
    () => headers.filter((header) => !columnMap[header]),
    [headers, columnMap]
  )

  const hasCardNameMapping = mappedFields.has('card_name')
  const columnSetupNeedsHelp = hasFile && !hasCardNameMapping

  const normalizedRows = useMemo(() => {
    const csvRows = rawRows.map((rawRow, index) => {
      const mapped = {}

      Object.entries(columnMap).forEach(([csvHeader, vendlyField]) => {
        if (!vendlyField) return
        mapped[vendlyField] = rawRow[csvHeader]
      })

      const rowNumber = index + 2
      const override = rowOverrides[rowNumber] || {}

      const normalized = {
        row_number: rowNumber,
        source_type: 'csv',
        card_name: String(
          override.card_name !== undefined
            ? override.card_name
            : mapped.card_name || ''
        ).trim(),
        set_name: String(
          override.set_name !== undefined
            ? override.set_name
            : mapped.set_name || ''
        ).trim(),
        card_number: String(
          override.card_number !== undefined
            ? override.card_number
            : mapped.card_number || ''
        ).trim(),
        item_type:
          override.item_type ||
          normalizeItemType(mapped.item_type, {
            ...mapped,
            grade_company:
              override.grade_company !== undefined
                ? override.grade_company
                : mapped.grade_company,
            grade:
              override.grade !== undefined ? override.grade : mapped.grade,
          }),
        condition: normalizeCondition(
          override.condition !== undefined
            ? override.condition
            : mapped.condition
        ),
        grade_company: String(
          override.grade_company !== undefined
            ? override.grade_company
            : mapped.grade_company || ''
        ).trim(),
        grade: String(
          override.grade !== undefined ? override.grade : mapped.grade || ''
        ).trim(),
        listing_price: parseNumber(mapped.listing_price),
        purchase_price: parseNumber(mapped.purchase_price),
        quantity: Math.max(Math.floor(parseNumber(mapped.quantity) || 1), 1),
        physical_location: String(mapped.physical_location || '').trim(),
      }

      const issues = []
      const warnings = []

      if (!normalized.card_name) issues.push('Missing card name')

      if (
        normalized.item_type === 'raw' &&
        normalized.condition &&
        !['NM', 'LP', 'MP', 'HP', 'DMG'].includes(normalized.condition)
      ) {
        issues.push('Unrecognized condition')
      }

      // Missing grading metadata should NOT stop card identity matching.
      // The Pokémon card can still be identified from its name/set/number.
      // We keep this as a warning so the vendor can fill it before final import.
      if (
        normalized.item_type === 'graded' &&
        (!normalized.grade_company || !normalized.grade)
      ) {
        warnings.push('Graded item needs company and grade before final import')
      }

      if (
        mapped.listing_price !== undefined &&
        mapped.listing_price !== '' &&
        normalized.listing_price === null
      ) {
        issues.push('Invalid listing price')
      }

      if (
        mapped.purchase_price !== undefined &&
        mapped.purchase_price !== '' &&
        normalized.purchase_price === null
      ) {
        issues.push('Invalid purchase price')
      }

      return {
        ...normalized,
        issues,
        warnings,
        ready: issues.length === 0,
      }
    })

    const normalizedManualRows = manualRows.map((row) => {
      const override = rowOverrides[Number(row.row_number)] || {}

      const normalized = {
        ...row,
        ...override,
        source_type: 'manual',
        card_name: String(
          override.card_name !== undefined ? override.card_name : row.card_name || ''
        ).trim(),
        set_name: String(
          override.set_name !== undefined ? override.set_name : row.set_name || ''
        ).trim(),
        card_number: String(
          override.card_number !== undefined
            ? override.card_number
            : row.card_number || ''
        ).trim(),
        item_type: override.item_type || row.item_type || 'raw',
        condition: normalizeCondition(
          override.condition !== undefined ? override.condition : row.condition
        ),
        grade_company: String(
          override.grade_company !== undefined
            ? override.grade_company
            : row.grade_company || ''
        ).trim(),
        grade: String(
          override.grade !== undefined ? override.grade : row.grade || ''
        ).trim(),
        listing_price: parseNumber(row.listing_price),
        purchase_price: parseNumber(row.purchase_price),
        quantity: Math.max(Math.floor(parseNumber(row.quantity) || 1), 1),
        physical_location: String(row.physical_location || '').trim(),
      }

      const issues = []
      const warnings = []

      if (!normalized.card_name) issues.push('Missing card name')

      if (
        normalized.item_type === 'raw' &&
        normalized.condition &&
        !['NM', 'LP', 'MP', 'HP', 'DMG'].includes(normalized.condition)
      ) {
        issues.push('Unrecognized condition')
      }

      if (
        normalized.item_type === 'graded' &&
        (!normalized.grade_company || !normalized.grade)
      ) {
        warnings.push('Graded item needs company and grade before final import')
      }

      return {
        ...normalized,
        issues,
        warnings,
        ready: issues.length === 0,
      }
    })

    return [...csvRows, ...normalizedManualRows].filter(
      (row) => !removedRowNumbers.includes(Number(row.row_number))
    )
  }, [rawRows, columnMap, manualRows, rowOverrides, removedRowNumbers])

  const readyCount = normalizedRows.filter((row) => row.ready).length
  const issueCount = normalizedRows.length - readyCount

  const matchResultsByRow = useMemo(() => {
    return new Map(
      matchResults.map((result) => [Number(result.row_number), result])
    )
  }, [matchResults])

  const resolvedMatchSummary = useMemo(() => {
    if (!matchResults.length) return matchSummary

    return {
      total_rows: matchResults.length,
      matched: matchResults.filter((item) => item.status === 'matched').length,
      needs_review: matchResults.filter((item) => item.status === 'needs_review').length,
      not_found: matchResults.filter((item) => item.status === 'not_found').length,
      invalid: matchResults.filter((item) => item.status === 'invalid').length,
    }
  }, [matchResults, matchSummary])

  const matchedRowCount = matchResults.filter(
    (result) => result.status === 'matched' && result.card
  ).length

  const matchedQuantityTotal = useMemo(() => {
    return normalizedRows.reduce((total, row) => {
      const result = matchResultsByRow.get(Number(row.row_number))
      if (result?.status !== 'matched' || !result?.card) return total
      return total + Number(row.quantity || 1)
    }, 0)
  }, [normalizedRows, matchResultsByRow])

  const importableRows = useMemo(() => {
    return normalizedRows.filter((row) => {
      const result = matchResultsByRow.get(Number(row.row_number))

      if (result?.status !== 'matched' || !result?.card) return false

      if (
        row.item_type === 'graded' &&
        (!row.grade_company || !row.grade)
      ) {
        return false
      }

      return true
    })
  }, [normalizedRows, matchResultsByRow])

  const importableQuantityTotal = useMemo(
    () =>
      importableRows.reduce(
        (total, row) => total + Number(row.quantity || 1),
        0
      ),
    [importableRows]
  )

  const skippedRowCount = Math.max(
    normalizedRows.length - importableRows.length,
    0
  )

  function toggleShowSelection(showId) {
    setSelectedShowIds((current) =>
      current.includes(showId)
        ? current.filter((id) => id !== showId)
        : [...current, showId]
    )
  }

  function buildInitialColumnMap(csvHeaders) {
    const guessed = {}
    csvHeaders.forEach((header) => {
      guessed[header] = guessVendlyField(header)
    })
    return guessed
  }

  function parseCsvFile(file) {
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setMessage('Please upload a CSV file.')
      return
    }

    setMessage('')
    setParseErrors([])
    setMatchSummary(null)
    setMatchResults([])
    setImportComplete(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const parsedHeaders = results.meta?.fields || []
        const rows = (results.data || []).filter((row) =>
          Object.values(row || {}).some((value) => String(value ?? '').trim() !== '')
        )

        const initialMap = buildInitialColumnMap(parsedHeaders)

        setFileName(file.name)
        setHeaders(parsedHeaders)
        setRawRows(rows)
        setColumnMap(initialMap)
        setParseErrors(results.errors || [])
        setShowColumnSetup(!Object.values(initialMap).includes('card_name'))

        if (rows.length === 0) {
          setMessage('This CSV does not contain any inventory rows.')
        }
      },
      error: (error) => {
        console.error('CSV parse failed:', error)
        setMessage('Vendly could not read this CSV. Please check the file and try again.')
      },
    })
  }

  function handleFileInput(event) {
    const file = event.target.files?.[0]
    parseCsvFile(file)
    event.target.value = ''
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    parseCsvFile(file)
  }

  function updateColumnMapping(csvHeader, vendlyField) {
    setMatchSummary(null)
    setMatchResults([])

    setColumnMap((current) => {
      const next = { ...current }

      if (vendlyField) {
        Object.keys(next).forEach((header) => {
          if (header !== csvHeader && next[header] === vendlyField) {
            next[header] = ''
          }
        })
      }

      next[csvHeader] = vendlyField
      return next
    })
  }

  function resetImport() {
    setFileName('')
    setHeaders([])
    setRawRows([])
    setColumnMap({})
    setParseErrors([])
    setMessage('')
    setMatching(false)
    setMatchSummary(null)
    setMatchResults([])
    setShowColumnSetup(false)
    setLoadingMoreRows({})
    setCandidatePages({})
    setNoMoreCandidateRows({})
    setVisibleCandidateCounts({})
    setRemovedRowNumbers([])
    setManualRows([])
    setRowOverrides({})
    setAddingCard(false)
    setEditingIdentityRow(null)
    setIdentityDraft({
      card_name: '',
      set_name: '',
      card_number: '',
      item_type: 'raw',
      condition: 'NM',
      grade_company: 'PSA',
      grade: '10',
    })
    setRetryingRowNumber(null)
    setNewCardDraft({
      card_name: '',
      set_name: '',
      card_number: '',
      item_type: 'raw',
      condition: 'NM',
      grade_company: 'PSA',
      grade: '10',
      listing_price: '',
      purchase_price: '',
      quantity: 1,
      physical_location: '',
    })
    setNewCardSearching(false)
    setNewCardMatchResult(null)
    setNewCardVisibleCount(10)
    setCreatingList(false)
    setNewListName('')
    setCommittingImport(false)
    setImportComplete(null)
    imageCacheInFlightRef.current.clear()
  }

  function applyCachedImageToMatchResults(cardId, imageUrl) {
    if (!cardId || !imageUrl) return

    setMatchResults((current) =>
      current.map((result) => {
        const updatedMatches = Array.isArray(result.matches)
          ? result.matches.map((candidate) =>
              candidate?.card_id === cardId
                ? { ...candidate, image_url: imageUrl }
                : candidate
            )
          : result.matches

        const updatedCard =
          result.card?.card_id === cardId
            ? { ...result.card, image_url: imageUrl }
            : result.card

        return {
          ...result,
          card: updatedCard,
          matches: updatedMatches,
        }
      })
    )
  }

  async function cacheCandidateImage(candidate) {
    const cardId = candidate?.card_id

    if (!cardId || candidate?.image_url) return
    if (imageCacheInFlightRef.current.has(cardId)) return

    imageCacheInFlightRef.current.add(cardId)

    try {
      const { data, error } = await supabase.functions.invoke(
        'pokewallet-cache-image',
        {
          body: { id: cardId },
        }
      )

      if (error) {
        console.warn(
          `CSV candidate image cache failed for ${cardId}:`,
          error.message
        )
        return
      }

      if (!data?.image_url) return

      applyCachedImageToMatchResults(cardId, data.image_url)
    } finally {
      imageCacheInFlightRef.current.delete(cardId)
    }
  }

  async function cacheMatchResultImages(results) {
    const candidatesById = new Map()

    results.forEach((result) => {
      if (result?.card?.card_id && !result.card.image_url) {
        candidatesById.set(result.card.card_id, result.card)
      }

      ;(result?.matches || []).forEach((candidate) => {
        if (candidate?.card_id && !candidate.image_url) {
          candidatesById.set(candidate.card_id, candidate)
        }
      })
    })

    const candidates = Array.from(candidatesById.values())

    const workerCount = Math.min(4, candidates.length)
    let nextIndex = 0

    async function worker() {
      while (nextIndex < candidates.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        await cacheCandidateImage(candidates[currentIndex])
      }
    }

    await Promise.all(
      Array.from({ length: workerCount }, () => worker())
    )
  }

  async function matchCards() {
    if (matching) return

    const rowsToMatch = normalizedRows.filter((row) => row.ready)

    if (rowsToMatch.length === 0) {
      setMessage('Fix the CSV rows marked for review before matching cards.')
      return
    }

    if (rowsToMatch.length > 250) {
      setMessage('Please match no more than 250 valid rows at a time.')
      return
    }

    setMatching(true)
    setMessage('')
    setMatchSummary(null)
    setMatchResults([])
    setLoadingMoreRows({})
    setCandidatePages({})
    setNoMoreCandidateRows({})
    setVisibleCandidateCounts({})

    const payloadRows = rowsToMatch.map((row) => ({
      row_number: row.row_number,
      card_name: row.card_name,
      set_name: row.set_name,
      card_number: row.card_number,
    }))

    const { data, error } = await supabase.functions.invoke(
      'import-inventory-match',
      {
        body: {
          rows: payloadRows,
        },
      }
    )

    console.log('CSV card match data:', data)
    console.log('CSV card match error:', error)

    if (error) {
      console.error('CSV matching failed:', error)
      setMessage('Card matching failed. Please try again.')
      setMatching(false)
      return
    }

    const nextResults = Array.isArray(data?.results) ? data.results : []

    setMatchSummary(data?.summary || null)
    setMatchResults(nextResults)

    const initialVisibleCounts = {}
    nextResults.forEach((result) => {
      if (result?.status === 'needs_review') {
        initialVisibleCounts[Number(result.row_number)] = Math.min(
          10,
          result.matches?.length || 0
        )
      }
    })
    setVisibleCandidateCounts(initialVisibleCounts)

    setMatching(false)

    // Candidate data appears immediately; missing images load in the background.
    if (nextResults.length > 0) {
      cacheMatchResultImages(nextResults)
    }
  }

  async function showMoreCandidates(row) {
    const rowNumber = Number(row.row_number)

    if (loadingMoreRows[rowNumber]) {
      return
    }

    const currentResult = matchResults.find(
      (result) => Number(result.row_number) === rowNumber
    )

    const totalLoaded = currentResult?.matches?.length || 0
    const currentlyVisible = visibleCandidateCounts[rowNumber] || Math.min(10, totalLoaded)

    // First reveal already-loaded candidates 10 at a time.
    // This costs zero additional API calls.
    if (currentlyVisible < totalLoaded) {
      setVisibleCandidateCounts((current) => ({
        ...current,
        [rowNumber]: Math.min(currentlyVisible + 10, totalLoaded),
      }))
      return
    }

    // Only request another PokeWallet page after every currently loaded
    // candidate has already been shown.
    if (noMoreCandidateRows[rowNumber]) {
      return
    }

    const nextPage = (candidatePages[rowNumber] || 1) + 1

    setLoadingMoreRows((current) => ({
      ...current,
      [rowNumber]: true,
    }))

    const { data, error } = await supabase.functions.invoke(
      'import-inventory-match',
      {
        body: {
          mode: 'more_candidates',
          page: nextPage,
          row: {
            card_name: row.card_name,
            set_name: row.set_name,
            card_number: row.card_number,
          },
        },
      }
    )

    if (error) {
      console.error('Show more candidates failed:', error)
      setLoadingMoreRows((current) => ({
        ...current,
        [rowNumber]: false,
      }))
      return
    }

    const moreResults = Array.isArray(data?.results) ? data.results : []

    setCandidatePages((current) => ({
      ...current,
      [rowNumber]: nextPage,
    }))

    if (moreResults.length === 0) {
      setNoMoreCandidateRows((current) => ({
        ...current,
        [rowNumber]: true,
      }))
    } else {
      let addedCount = 0

      setMatchResults((current) =>
        current.map((result) => {
          if (Number(result.row_number) !== rowNumber) {
            return result
          }

          const seen = new Set(
            (result.matches || []).map((candidate) => candidate.card_id)
          )

          const uniqueNewResults = moreResults.filter(
            (candidate) => !seen.has(candidate.card_id)
          )

          addedCount = uniqueNewResults.length

          return {
            ...result,
            matches: [
              ...(result.matches || []),
              ...uniqueNewResults,
            ],
          }
        })
      )

      if (addedCount === 0) {
        setNoMoreCandidateRows((current) => ({
          ...current,
          [rowNumber]: true,
        }))
      } else {
        // Reveal only the next 10 newly available choices.
        setVisibleCandidateCounts((current) => ({
          ...current,
          [rowNumber]: currentlyVisible + Math.min(10, addedCount),
        }))

        cacheMatchResultImages([
          {
            row_number: rowNumber,
            matches: moreResults,
          },
        ])
      }
    }

    setLoadingMoreRows((current) => ({
      ...current,
      [rowNumber]: false,
    }))
  }

  function chooseCandidate(rowNumber, card) {
    setMatchResults((current) =>
      current.map((result) =>
        Number(result.row_number) === Number(rowNumber)
          ? {
              ...result,
              status: 'matched',
              card,
              reason: null,
              manually_selected: true,
            }
          : result
      )
    )
  }

  function reselectCandidate(rowNumber) {
    setMatchResults((current) =>
      current.map((result) =>
        Number(result.row_number) === Number(rowNumber)
          ? {
              ...result,
              status: 'needs_review',
              card: null,
              reason: 'Choose the correct card.',
              manually_selected: false,
            }
          : result
      )
    )
  }

  function removeImportRow(rowNumber) {
    const numericRow = Number(rowNumber)

    setRemovedRowNumbers((current) =>
      current.includes(numericRow) ? current : [...current, numericRow]
    )

    setMatchResults((current) =>
      current.filter((result) => Number(result.row_number) !== numericRow)
    )
  }

  async function searchNewCard() {
    const cardName = newCardDraft.card_name.trim()

    if (!cardName || newCardSearching) {
      if (!cardName) {
        setMessage('Enter a card name before searching.')
      }
      return
    }

    setNewCardSearching(true)
    setNewCardMatchResult(null)
    setNewCardVisibleCount(10)
    setMessage('')

    const temporaryRowNumber = 999999

    const { data, error } = await supabase.functions.invoke(
      'import-inventory-match',
      {
        body: {
          rows: [
            {
              row_number: temporaryRowNumber,
              card_name: cardName,
              set_name: newCardDraft.set_name.trim(),
              card_number: newCardDraft.card_number.trim(),
            },
          ],
        },
      }
    )

    if (error) {
      console.error('Add-card search failed:', error)
      setMessage('Vendly could not search for that card. Please try again.')
      setNewCardSearching(false)
      return
    }

    const result = Array.isArray(data?.results) ? data.results[0] : null

    if (!result) {
      setMessage('Vendly could not find a match result for that card.')
      setNewCardSearching(false)
      return
    }

    setNewCardMatchResult(result)
    setNewCardSearching(false)
    cacheMatchResultImages([result])
  }

  function finalizeManualCard(candidate) {
    if (!candidate) return

    const existingRowNumbers = [
      ...rawRows.map((_, index) => index + 2),
      ...manualRows.map((row) => Number(row.row_number) || 0),
    ]

    const nextRowNumber = Math.max(1, ...existingRowNumbers) + 1

    const manualRow = {
      row_number: nextRowNumber,
      card_name: newCardDraft.card_name.trim(),
      set_name: newCardDraft.set_name.trim(),
      card_number: newCardDraft.card_number.trim(),
      item_type: newCardDraft.item_type,
      condition:
        newCardDraft.item_type === 'raw'
          ? newCardDraft.condition
          : '',
      grade_company:
        newCardDraft.item_type === 'graded'
          ? newCardDraft.grade_company
          : '',
      grade:
        newCardDraft.item_type === 'graded'
          ? newCardDraft.grade
          : '',
      listing_price: newCardDraft.listing_price,
      purchase_price: newCardDraft.purchase_price,
      quantity: newCardDraft.quantity,
      physical_location: newCardDraft.physical_location.trim(),
    }

    setManualRows((current) => [...current, manualRow])

    setMatchResults((current) => [
      ...current.filter(
        (result) => Number(result.row_number) !== Number(nextRowNumber)
      ),
      {
        row_number: nextRowNumber,
        status: 'matched',
        card: candidate,
        matches: [candidate],
        reason: null,
        manually_selected: true,
      },
    ])

    setNewCardDraft({
      card_name: '',
      set_name: '',
      card_number: '',
      item_type: 'raw',
      condition: 'NM',
      grade_company: 'PSA',
      grade: '10',
      listing_price: '',
      purchase_price: '',
      quantity: 1,
      physical_location: '',
    })
    setNewCardMatchResult(null)
    setNewCardVisibleCount(10)
    setAddingCard(false)
    setMessage('')
  }


  function openIdentityEditor(row) {
    setEditingIdentityRow(row)
    setIdentityDraft({
      card_name: row.card_name || '',
      set_name: row.set_name || '',
      card_number: row.card_number || '',
      item_type: row.item_type || 'raw',
      condition: row.condition || 'NM',
      grade_company: row.grade_company || 'PSA',
      grade: row.grade || '10',
    })
  }

  function saveEditedIdentityLocally(rowNumber, updates) {
    const numericRow = Number(rowNumber)

    setRowOverrides((current) => ({
      ...current,
      [numericRow]: {
        ...(current[numericRow] || {}),
        card_name: updates.card_name,
        set_name: updates.set_name,
        card_number: updates.card_number,
        item_type: updates.item_type,
        condition: updates.condition,
        grade_company: updates.grade_company,
        grade: updates.grade,
      },
    }))
  }

  async function retrySingleRowMatch(row) {
    if (retryingRowNumber) return

    const cardName = identityDraft.card_name.trim()

    if (!cardName) {
      setMessage('Card name is required.')
      return
    }

    const updatedRow = {
      ...row,
      card_name: cardName,
      set_name: identityDraft.set_name.trim(),
      card_number: identityDraft.card_number.trim(),
      item_type: identityDraft.item_type,
      condition:
        identityDraft.item_type === 'raw'
          ? identityDraft.condition
          : '',
      grade_company:
        identityDraft.item_type === 'graded'
          ? identityDraft.grade_company
          : '',
      grade:
        identityDraft.item_type === 'graded'
          ? identityDraft.grade
          : '',
    }

    setRetryingRowNumber(Number(row.row_number))
    setMessage('')

    const { data, error } = await supabase.functions.invoke(
      'import-inventory-match',
      {
        body: {
          rows: [
            {
              row_number: updatedRow.row_number,
              card_name: updatedRow.card_name,
              set_name: updatedRow.set_name,
              card_number: updatedRow.card_number,
            },
          ],
        },
      }
    )

    if (error) {
      console.error('Single-row retry failed:', error)
      setMessage('Vendly could not retry this card. Please try again.')
      setRetryingRowNumber(null)
      return
    }

    const retriedResult = Array.isArray(data?.results)
      ? data.results[0]
      : null

    saveEditedIdentityLocally(updatedRow.row_number, updatedRow)

    if (retriedResult) {
      setMatchResults((current) => {
        const withoutRow = current.filter(
          (result) =>
            Number(result.row_number) !== Number(updatedRow.row_number)
        )

        return [...withoutRow, retriedResult]
      })

      if (retriedResult.status === 'needs_review') {
        setVisibleCandidateCounts((current) => ({
          ...current,
          [Number(updatedRow.row_number)]: Math.min(
            10,
            retriedResult.matches?.length || 0
          ),
        }))
      }

      cacheMatchResultImages([retriedResult])
    }

    setEditingIdentityRow(null)
    setRetryingRowNumber(null)
  }


  async function commitImport() {
    if (committingImport) return

    if (!selectedInventoryListId) {
      setMessage('Choose an inventory list before importing.')
      return
    }

    if (importableRows.length === 0) {
      setMessage('There are no fully matched cards ready to import.')
      return
    }

    const rows = importableRows.map((row) => {
      const result = matchResultsByRow.get(Number(row.row_number))
      const card = result?.card

      return {
        row_number: row.row_number,
        card_id: card?.card_id || null,
        card_name: card?.card_name || row.card_name,
        set_name: card?.set_name || row.set_name || null,
        card_number: card?.card_number || row.card_number || null,
        rarity: card?.rarity || null,
        image_url: card?.image_url || null,
        market_price:
          card?.market_price === null || card?.market_price === undefined
            ? null
            : Number(card.market_price),
        item_type: row.item_type || 'raw',
        condition: row.item_type === 'raw' ? row.condition || null : null,
        grade_company:
          row.item_type === 'graded' ? row.grade_company || null : null,
        grade:
          row.item_type === 'graded' ? row.grade || null : null,
        listing_price:
          row.listing_price === null || row.listing_price === undefined
            ? null
            : Number(row.listing_price),
        purchase_price:
          row.purchase_price === null || row.purchase_price === undefined
            ? null
            : Number(row.purchase_price),
        quantity: Math.max(Number(row.quantity || 1), 1),
        physical_location: row.physical_location || null,
      }
    })

    setCommittingImport(true)
    setMessage('')
    setImportComplete(null)

    const { data, error } = await supabase.functions.invoke(
      'import-inventory-commit',
      {
        body: {
          inventory_list_id: selectedInventoryListId,
          make_public: makePublic,
          show_ids: selectedShowIds,
          rows,
        },
      }
    )

    console.log('Inventory import commit data:', data)
    console.log('Inventory import commit error:', error)

    if (error) {
      console.error('Inventory import commit failed:', error)
      setMessage('Inventory import failed. Nothing was added. Please try again.')
      setCommittingImport(false)
      return
    }

    if (!data?.success) {
      setMessage(data?.error || 'Inventory import failed. Please try again.')
      setCommittingImport(false)
      return
    }

    setImportComplete(data)
    setCommittingImport(false)
  }

  async function createInventoryList() {
    const name = newListName.trim()
    if (!name || savingNewList) return

    setSavingNewList(true)
    setMessage('')

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setMessage('You must be logged in to create an inventory list.')
      setSavingNewList(false)
      return
    }

    const { data, error } = await supabase
      .from('inventory_lists')
      .insert({
        owner_id: user.id,
        name,
      })
      .select('id, name')
      .single()

    if (error) {
      console.error('Create inventory list failed:', error)
      setMessage('Vendly could not create that inventory list. Please try again.')
      setSavingNewList(false)
      return
    }

    setInventoryLists((current) => [...current, data])
    setSelectedInventoryListId(data.id)
    setNewListName('')
    setCreatingList(false)
    setSavingNewList(false)
  }

  function formatEventDate(date) {
    if (!date) return 'Date TBD'

    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function getMatchTone(status) {
    switch (status) {
      case 'matched':
        return {
          border: 'border-green-900',
          background: 'bg-green-950/10',
          text: 'text-green-300',
          label: 'Matched',
          icon: CheckCircle2,
        }
      case 'needs_review':
        return {
          border: 'border-yellow-900',
          background: 'bg-yellow-950/10',
          text: 'text-yellow-300',
          label: 'Needs Review',
          icon: CircleHelp,
        }
      case 'not_found':
        return {
          border: 'border-red-900',
          background: 'bg-red-950/10',
          text: 'text-red-300',
          label: 'Not Found',
          icon: CircleX,
        }
      case 'invalid':
        return {
          border: 'border-red-900',
          background: 'bg-red-950/10',
          text: 'text-red-300',
          label: 'Invalid',
          icon: AlertTriangle,
        }
      default:
        return {
          border: 'border-[#222]',
          background: 'bg-[#111]',
          text: 'text-gray-400',
          label: 'Not Matched Yet',
          icon: SearchCheck,
        }
    }
  }

  return (
    <div className="min-h-screen bg-black pb-16 text-white">
      <main className="mx-auto max-w-[760px] px-5 py-8">
        <button
          type="button"
          onClick={() => navigate('/inventory')}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-gray-400 transition hover:text-white"
        >
          <ArrowLeft size={17} />
          Back to Inventory
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">Import Inventory</h1>
          <p className="mt-2 max-w-xl text-sm text-gray-400">
            Upload your spreadsheet and Vendly will do the setup for you.
            You only need to step in if something looks wrong.
          </p>
        </div>

        {message && (
          <div className="mb-5 rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm font-semibold text-red-300">
            {message}
          </div>
        )}

        {!hasFile ? (
          <section>
            <div
              onDragEnter={(event) => {
                event.preventDefault()
                setDragActive(true)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={(event) => {
                event.preventDefault()
                setDragActive(false)
              }}
              onDrop={handleDrop}
              className={`rounded-3xl border border-dashed p-8 text-center transition ${
                dragActive
                  ? 'border-yellow-300 bg-yellow-300/5'
                  : 'border-[#333] bg-[#111]'
              }`}
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1a1a1a]">
                <FileSpreadsheet className="text-yellow-300" size={28} />
              </div>

              <h2 className="text-xl font-bold">Upload inventory CSV</h2>

              <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
                Drag your inventory CSV here or choose a file. Vendly will
                automatically recognize the columns and prepare the cards.
              </p>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black"
              >
                <Upload size={17} />
                Choose CSV
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>

            <div className="mt-5 rounded-2xl border border-[#222] bg-[#111] p-4">
              <p className="text-sm font-semibold">Minimal setup</p>
              <p className="mt-2 text-sm text-gray-500">
                Card name is the only must-have. Set name and card number help
                Vendly pick the exact printing automatically.
              </p>
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-[#222] bg-[#111] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    Uploaded File
                  </p>
                  <p className="mt-1 break-all font-semibold">{fileName}</p>
                  <p className="mt-1 text-sm text-gray-400">
                    {rawRows.length} inventory row{rawRows.length === 1 ? '' : 's'} ·{' '}
                    {headers.length} column{headers.length === 1 ? '' : 's'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={resetImport}
                  className="rounded-xl border border-[#333] bg-black p-2 text-gray-400 hover:text-white"
                  aria-label="Remove uploaded CSV"
                >
                  <X size={18} />
                </button>
              </div>

              {parseErrors.length > 0 && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-yellow-900 bg-yellow-950/20 p-3 text-sm text-yellow-200">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                  <p>
                    Papa Parse reported {parseErrors.length} CSV warning
                    {parseErrors.length === 1 ? '' : 's'}. Review your preview
                    before continuing.
                  </p>
                </div>
              )}
            </section>

            <section className={`rounded-2xl border p-4 ${
              columnSetupNeedsHelp
                ? 'border-yellow-900 bg-yellow-950/10'
                : 'border-green-900/60 bg-green-950/10'
            }`}>
              <div className="flex items-start gap-3">
                {columnSetupNeedsHelp ? (
                  <AlertTriangle size={20} className="mt-0.5 shrink-0 text-yellow-300" />
                ) : (
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-300" />
                )}

                <div className="min-w-0 flex-1">
                  <h2 className="font-bold">
                    {columnSetupNeedsHelp
                      ? 'Vendly needs one quick fix'
                      : 'Spreadsheet recognized'}
                  </h2>

                  <p className="mt-1 text-sm text-gray-400">
                    {columnSetupNeedsHelp
                      ? 'We could not tell which column contains the card name. Choose it below and Vendly will handle the rest.'
                      : `Vendly automatically recognized ${recognizedColumnCount} of ${headers.length} columns. No setup is required.`}
                  </p>

                  {!columnSetupNeedsHelp && ignoredHeaders.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      {ignoredHeaders.length} unneeded column
                      {ignoredHeaders.length === 1 ? '' : 's'} will be ignored automatically.
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowColumnSetup((current) => !current)}
                className="mt-4 flex w-full items-center justify-between rounded-xl border border-[#2a2a2a] bg-black px-4 py-3 text-sm font-semibold text-gray-300"
              >
                <span>
                  {columnSetupNeedsHelp ? 'Fix column setup' : 'Review column setup'}
                </span>
                <ChevronDown
                  size={17}
                  className={`transition ${showColumnSetup ? 'rotate-180' : ''}`}
                />
              </button>

              {showColumnSetup && (
                <div className="mt-3 overflow-hidden rounded-xl border border-[#222] bg-[#111]">
                  {headers.map((header, index) => (
                    <div
                      key={header}
                      className={`grid gap-2 p-3 sm:grid-cols-[1fr_1fr] ${
                        index !== headers.length - 1 ? 'border-b border-[#222]' : ''
                      }`}
                    >
                      <div>
                        <p className="text-xs text-gray-500">Your column</p>
                        <p className="mt-1 font-semibold">{header}</p>
                      </div>

                      <div>
                        <p className="mb-1 text-xs text-gray-500">Vendly uses it as</p>

                        <select
                          value={columnMap[header] || ''}
                          onChange={(event) =>
                            updateColumnMapping(header, event.target.value)
                          }
                          className="w-full rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                        >
                          {VENDLY_FIELDS.map((field) => (
                            <option
                              key={field.value || 'ignore'}
                              value={field.value}
                              disabled={
                                field.value &&
                                field.value !== columnMap[header] &&
                                mappedFields.has(field.value)
                              }
                            >
                              {field.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[#222] bg-[#111] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black">
                  <SearchCheck size={20} className="text-blue-300" />
                </div>

                <div>
                  <h2 className="font-bold">Identify Your Cards</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Vendly will find the exact Pokémon cards for you. You only
                    need to review cards that Vendly is unsure about.
                  </p>
                </div>
              </div>

              {issueCount > 0 && (
                <div className="mt-4 rounded-xl border border-yellow-900 bg-yellow-950/20 p-3 text-sm text-yellow-200">
                  {issueCount} row{issueCount === 1 ? '' : 's'} need a quick
                  fix. Vendly will handle the other {readyCount}.
                </div>
              )}

              <button
                type="button"
                onClick={matchCards}
                disabled={matching || readyCount === 0}
                className="mt-4 w-full rounded-xl bg-white p-4 text-sm font-bold text-black disabled:opacity-50"
              >
                {matching
                  ? `Finding ${readyCount} card${readyCount === 1 ? '' : 's'}...`
                  : `Find My ${readyCount} Card${readyCount === 1 ? '' : 's'}`}
              </button>
            </section>

            <section>
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">Cards Found</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Vendly prepared these rows from your spreadsheet.
                  </p>
                </div>

                <div className="shrink-0 text-right text-xs">
                  <p className="font-bold text-green-300">{readyCount} ready</p>
                  {issueCount > 0 && (
                    <p className="mt-1 font-bold text-yellow-300">
                      {issueCount} need review
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {normalizedRows.slice(0, 25).map((row) => (
                  <div
                    key={row.row_number}
                    className={`rounded-2xl border p-4 ${
                      row.ready
                        ? 'border-[#222] bg-[#111]'
                        : 'border-yellow-900 bg-yellow-950/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {row.ready ? (
                            <CheckCircle2 size={16} className="shrink-0 text-green-300" />
                          ) : (
                            <AlertTriangle size={16} className="shrink-0 text-yellow-300" />
                          )}

                          <p className="break-words font-bold">
                            {row.card_name || `Row ${row.row_number}`}
                          </p>
                        </div>

                        <p className="mt-1 text-sm text-gray-400">
                          {[row.set_name, row.card_number && `#${row.card_number}`]
                            .filter(Boolean)
                            .join(' · ') || 'Set/card number not provided'}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-black px-3 py-1 text-xs font-bold text-gray-300">
                          {row.item_type === 'graded' ? 'Graded' : 'Raw'}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeImportRow(row.row_number)}
                          className="rounded-lg border border-[#333] bg-black p-2 text-gray-500 transition hover:border-red-900 hover:text-red-300"
                          aria-label={`Remove ${row.card_name || `row ${row.row_number}`}`}
                          title="Remove card"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <PreviewStat
                        label="Condition / Grade"
                        value={
                          row.item_type === 'graded'
                            ? [row.grade_company, row.grade].filter(Boolean).join(' ') || 'Missing'
                            : row.condition || 'Not provided'
                        }
                      />
                      <PreviewStat
                        label="Listing Price"
                        value={
                          row.listing_price === null
                            ? 'Not provided'
                            : `$${row.listing_price.toFixed(2)}`
                        }
                      />
                      <PreviewStat label="Quantity" value={row.quantity} />
                      <PreviewStat
                        label="Location"
                        value={row.physical_location || 'Not provided'}
                      />
                    </div>

                    {row.warnings?.length > 0 && (
                      <div className="mt-3 rounded-xl border border-yellow-900/60 bg-yellow-950/10 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-yellow-200">
                            {row.warnings.join(' · ')}
                          </p>

                          <button
                            type="button"
                            onClick={() => openIdentityEditor(row)}
                            className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 hover:text-white"
                          >
                            <Pencil size={13} />
                            Add grade
                          </button>
                        </div>
                      </div>
                    )}

                    {!row.ready && (
                      <div className="mt-3 rounded-xl bg-black/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-yellow-200">
                            {row.issues.join(' · ')}
                          </p>

                          <button
                            type="button"
                            onClick={() => openIdentityEditor(row)}
                            className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 hover:text-white"
                          >
                            <Pencil size={13} />
                            Edit details
                          </button>
                        </div>
                      </div>
                    )}

                    {row.ready && matchResultsByRow.has(row.row_number) && (() => {
                      const result = matchResultsByRow.get(row.row_number)
                      const tone = getMatchTone(result?.status)
                      const MatchIcon = tone.icon
                      const matchedCard = result?.card || null

                      return (
                        <div
                          className={`mt-3 rounded-xl border p-3 ${tone.border} ${tone.background}`}
                        >
                          <div className="flex items-center gap-2">
                            <MatchIcon size={16} className={tone.text} />
                            <p className={`text-xs font-bold ${tone.text}`}>
                              {tone.label}
                            </p>
                          </div>

                          {result?.status === 'matched' && (
                            <div className="mt-2 flex items-center justify-between gap-3">
                              {result?.manually_selected ? (
                                <p className="text-xs font-semibold text-green-300">
                                  You selected this match.
                                </p>
                              ) : (
                                <p className="text-xs text-[#8ea3c7]">
                                  Vendly matched this card automatically.
                                </p>
                              )}

                              <button
                                type="button"
                                onClick={() => reselectCandidate(row.row_number)}
                                className={
                                  result?.manually_selected
                                    ? 'shrink-0 rounded-lg border border-[#333] bg-black px-3 py-2 text-xs font-bold text-white transition hover:border-[#555]'
                                    : 'shrink-0 text-xs font-semibold text-[#78b7ff] transition hover:text-white'
                                }
                              >
                                {result?.manually_selected
                                  ? 'Re-select'
                                  : 'Not the right card?'}
                              </button>
                            </div>
                          )}

                          {matchedCard && (
                            <div className="mt-3 flex gap-3">
                              {matchedCard.image_url ? (
                                <img
                                  src={matchedCard.image_url}
                                  alt={matchedCard.card_name}
                                  className="h-24 w-16 shrink-0 rounded-lg bg-black object-contain"
                                />
                              ) : (
                                <div className="h-24 w-16 shrink-0 rounded-lg bg-black" />
                              )}

                              <div className="min-w-0">
                                <p className="font-semibold text-white">
                                  {matchedCard.card_name}
                                </p>
                                <p className="mt-1 text-xs text-gray-400">
                                  {[matchedCard.set_name, matchedCard.card_number && `#${matchedCard.card_number}`]
                                    .filter(Boolean)
                                    .join(' · ') || 'Set/card number unavailable'}
                                </p>

                                {matchedCard.rarity && (
                                  <p className="mt-1 text-xs text-gray-500">
                                    {matchedCard.rarity}
                                  </p>
                                )}

                                {matchedCard.market_price !== null &&
                                  matchedCard.market_price !== undefined && (
                                    <p className="mt-2 text-xs font-bold text-yellow-300">
                                      ${Number(matchedCard.market_price).toFixed(2)} market
                                    </p>
                                  )}
                              </div>
                            </div>
                          )}

                          {result?.status === 'needs_review' && (
                            <div className="mt-3">
                              <p className="text-sm font-bold text-yellow-200">
                                Tap the correct card
                              </p>
                              <div className="mt-1 flex items-center justify-between gap-3">
                                <p className="text-xs text-gray-500">
                                  Vendly found {result.matches?.length || 0} possible match
                                  {(result.matches?.length || 0) === 1 ? '' : 'es'}.
                                  {' '}Showing up to 10 at a time.
                                </p>

                                <button
                                  type="button"
                                  onClick={() => openIdentityEditor(row)}
                                  className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 hover:text-white"
                                >
                                  <Pencil size={13} />
                                  Edit details
                                </button>
                              </div>

                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {(result.matches || [])
                                  .slice(
                                    0,
                                    visibleCandidateCounts[row.row_number] ||
                                      Math.min(10, result.matches?.length || 0)
                                  )
                                  .map((candidate) => (
                                  <button
                                    key={candidate.card_id}
                                    type="button"
                                    onClick={() =>
                                      chooseCandidate(row.row_number, candidate)
                                    }
                                    className="flex items-center gap-3 rounded-xl border border-[#333] bg-black p-3 text-left transition hover:border-yellow-600"
                                  >
                                    {candidate.image_url ? (
                                      <img
                                        src={candidate.image_url}
                                        alt={candidate.card_name}
                                        className="h-20 w-14 shrink-0 rounded-lg bg-[#111] object-contain"
                                      />
                                    ) : (
                                      <div className="h-20 w-14 shrink-0 rounded-lg bg-[#111]" />
                                    )}

                                    <div className="min-w-0">
                                      <p className="break-words text-sm font-bold text-white">
                                        {candidate.card_name}
                                      </p>
                                      <p className="mt-1 text-xs text-gray-400">
                                        {[
                                          candidate.set_name,
                                          candidate.card_number && `#${candidate.card_number}`,
                                        ]
                                          .filter(Boolean)
                                          .join(' · ') || 'Set/card number unavailable'}
                                      </p>

                                      {candidate.market_price !== null &&
                                        candidate.market_price !== undefined && (
                                          <p className="mt-1 text-xs font-bold text-yellow-300">
                                            ${Number(candidate.market_price).toFixed(2)} market
                                          </p>
                                        )}

                                      <p className="mt-2 text-xs font-bold text-blue-300">
                                        Choose this card
                                      </p>
                                    </div>
                                  </button>
                                ))}
                              </div>

                              {(() => {
                                const totalLoaded = result.matches?.length || 0
                                const visibleCount =
                                  visibleCandidateCounts[row.row_number] ||
                                  Math.min(10, totalLoaded)
                                const hiddenLoaded = Math.max(
                                  totalLoaded - visibleCount,
                                  0
                                )

                                if (hiddenLoaded > 0) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => showMoreCandidates(row)}
                                      className="mt-3 w-full rounded-xl border border-[#333] bg-[#111] p-3 text-sm font-bold text-white"
                                    >
                                      Load More
                                    </button>
                                  )
                                }

                                if (!noMoreCandidateRows[row.row_number]) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => showMoreCandidates(row)}
                                      disabled={!!loadingMoreRows[row.row_number]}
                                      className="mt-3 w-full rounded-xl border border-[#333] bg-[#111] p-3 text-sm font-bold text-white disabled:opacity-50"
                                    >
                                      {loadingMoreRows[row.row_number]
                                        ? 'Loading more...'
                                        : 'Load More'}
                                    </button>
                                  )
                                }

                                return (
                                  <p className="mt-3 text-center text-xs text-gray-500">
                                    No more matching cards found.
                                  </p>
                                )
                              })()}
                            </div>
                          )}

                          {(result?.status === 'not_found' ||
                            result?.status === 'invalid') && (
                            <div className="mt-2 flex items-center justify-between gap-3">
                              <p className="text-xs text-red-200">
                                {result.reason || 'Vendly could not match this row.'}
                              </p>

                              <button
                                type="button"
                                onClick={() => openIdentityEditor(row)}
                                className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 hover:text-white"
                              >
                                <Pencil size={13} />
                                Edit details
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ))}
              </div>

              {normalizedRows.length > 25 && (
                <p className="mt-3 text-center text-xs text-gray-500">
                  Showing the first 25 of {normalizedRows.length} rows.
                </p>
              )}

              {!addingCard ? (
                <button
                  type="button"
                  onClick={() => setAddingCard(true)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#444] bg-[#0d0d0d] p-4 text-sm font-bold text-gray-300 transition hover:border-[#666] hover:text-white"
                >
                  <Plus size={17} />
                  Add Card
                </button>
              ) : (
                <div className="mt-4 rounded-2xl border border-[#333] bg-[#111] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">Add a missing card</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Card name is enough. This adds a new row without changing your CSV.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingCard(false)
                        setNewCardMatchResult(null)
                        setNewCardVisibleCount(10)
                      }}
                      className="rounded-lg p-2 text-gray-500 hover:text-white"
                    >
                      <X size={17} />
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input
                      value={newCardDraft.card_name}
                      onChange={(event) => {
                        setNewCardDraft((current) => ({ ...current, card_name: event.target.value }))
                        setNewCardMatchResult(null)
                      }}
                      placeholder="Card name *"
                      className="rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                    />
                    <input
                      value={newCardDraft.set_name}
                      onChange={(event) => {
                        setNewCardDraft((current) => ({ ...current, set_name: event.target.value }))
                        setNewCardMatchResult(null)
                      }}
                      placeholder="Set name (optional)"
                      className="rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                    />
                    <input
                      value={newCardDraft.card_number}
                      onChange={(event) => {
                        setNewCardDraft((current) => ({ ...current, card_number: event.target.value }))
                        setNewCardMatchResult(null)
                      }}
                      placeholder="Card number (optional)"
                      className="rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                    />
                    <div className="grid grid-cols-2 rounded-xl border border-[#333] bg-black p-1 sm:col-span-2">
                      <button
                        type="button"
                        onClick={() =>
                          setNewCardDraft((current) => ({
                            ...current,
                            item_type: 'raw',
                          }))
                        }
                        className={`rounded-lg px-3 py-3 text-sm font-bold ${
                          newCardDraft.item_type === 'raw'
                            ? 'bg-white text-black'
                            : 'text-gray-500'
                        }`}
                      >
                        Raw
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNewCardDraft((current) => ({
                            ...current,
                            item_type: 'graded',
                          }))
                        }
                        className={`rounded-lg px-3 py-3 text-sm font-bold ${
                          newCardDraft.item_type === 'graded'
                            ? 'bg-white text-black'
                            : 'text-gray-500'
                        }`}
                      >
                        Graded
                      </button>
                    </div>

                    {newCardDraft.item_type === 'raw' ? (
                      <select
                        value={newCardDraft.condition}
                        onChange={(event) =>
                          setNewCardDraft((current) => ({
                            ...current,
                            condition: event.target.value,
                          }))
                        }
                        className="rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none sm:col-span-2"
                      >
                        <option value="NM">Near Mint</option>
                        <option value="LP">Lightly Played</option>
                        <option value="MP">Moderately Played</option>
                        <option value="HP">Heavily Played</option>
                        <option value="DMG">Damaged</option>
                      </select>
                    ) : (
                      <>
                        <select
                          value={newCardDraft.grade_company}
                          onChange={(event) =>
                            setNewCardDraft((current) => ({
                              ...current,
                              grade_company: event.target.value,
                            }))
                          }
                          className="rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                        >
                          <option value="PSA">PSA</option>
                          <option value="CGC">CGC</option>
                          <option value="Beckett">Beckett</option>
                          <option value="SGC">SGC</option>
                          <option value="TAG">TAG</option>
                          <option value="Other">Other</option>
                        </select>

                        <select
                          value={newCardDraft.grade}
                          onChange={(event) =>
                            setNewCardDraft((current) => ({
                              ...current,
                              grade: event.target.value,
                            }))
                          }
                          className="rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                        >
                          {['10','9.5','9','8.5','8','7.5','7','6.5','6','5','4','3','2','1'].map(
                            (grade) => (
                              <option key={grade} value={grade}>
                                {grade}
                              </option>
                            )
                          )}
                        </select>
                      </>
                    )}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newCardDraft.listing_price}
                      onChange={(event) =>
                        setNewCardDraft((current) => ({ ...current, listing_price: event.target.value }))
                      }
                      placeholder="Listing price (optional)"
                      className="rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                    />
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={newCardDraft.quantity}
                      onChange={(event) =>
                        setNewCardDraft((current) => ({ ...current, quantity: event.target.value }))
                      }
                      placeholder="Quantity"
                      className="rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                    />
                    <input
                      value={newCardDraft.physical_location}
                      onChange={(event) =>
                        setNewCardDraft((current) => ({ ...current, physical_location: event.target.value }))
                      }
                      placeholder="Physical location (optional)"
                      className="rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none sm:col-span-2"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={searchNewCard}
                    disabled={newCardSearching || !newCardDraft.card_name.trim()}
                    className="mt-3 w-full rounded-xl bg-white p-3 text-sm font-bold text-black disabled:opacity-50"
                  >
                    {newCardSearching ? 'Searching...' : 'Find Card'}
                  </button>

                  {newCardMatchResult && (
                    <div className="mt-4 rounded-xl border border-[#333] bg-black p-3">
                      {newCardMatchResult.status === 'matched' &&
                        newCardMatchResult.card && (
                          <>
                            <p className="text-xs font-bold text-green-300">
                              Match Found
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                finalizeManualCard(newCardMatchResult.card)
                              }
                              className="mt-3 flex w-full items-center gap-3 rounded-xl border border-green-900 bg-green-950/20 p-3 text-left"
                            >
                              {newCardMatchResult.card.image_url ? (
                                <img
                                  src={newCardMatchResult.card.image_url}
                                  alt={newCardMatchResult.card.card_name}
                                  className="h-20 w-14 shrink-0 rounded-lg object-contain"
                                />
                              ) : (
                                <div className="h-20 w-14 shrink-0 rounded-lg bg-[#111]" />
                              )}

                              <div className="min-w-0">
                                <p className="font-bold">
                                  {newCardMatchResult.card.card_name}
                                </p>
                                <p className="mt-1 text-xs text-gray-400">
                                  {[
                                    newCardMatchResult.card.set_name,
                                    newCardMatchResult.card.card_number &&
                                      `#${newCardMatchResult.card.card_number}`,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ') || 'Set/card number unavailable'}
                                </p>
                                <p className="mt-2 text-xs font-bold text-green-300">
                                  Use this card
                                </p>
                              </div>
                            </button>
                          </>
                        )}

                      {newCardMatchResult.status === 'needs_review' && (
                        <>
                          <p className="text-xs font-bold text-yellow-300">
                            Choose the correct card
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Vendly found {newCardMatchResult.matches?.length || 0} possible matches.
                          </p>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {(newCardMatchResult.matches || [])
                              .slice(0, newCardVisibleCount)
                              .map((candidate) => (
                                <button
                                  key={candidate.card_id}
                                  type="button"
                                  onClick={() => finalizeManualCard(candidate)}
                                  className="flex items-center gap-3 rounded-xl border border-[#333] bg-[#111] p-3 text-left transition hover:border-yellow-700"
                                >
                                  {candidate.image_url ? (
                                    <img
                                      src={candidate.image_url}
                                      alt={candidate.card_name}
                                      className="h-20 w-14 shrink-0 rounded-lg object-contain"
                                    />
                                  ) : (
                                    <div className="h-20 w-14 shrink-0 rounded-lg bg-black" />
                                  )}

                                  <div className="min-w-0">
                                    <p className="text-sm font-bold">
                                      {candidate.card_name}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-400">
                                      {[
                                        candidate.set_name,
                                        candidate.card_number &&
                                          `#${candidate.card_number}`,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ') || 'Set/card number unavailable'}
                                    </p>
                                    <p className="mt-2 text-xs font-bold text-blue-300">
                                      Choose this card
                                    </p>
                                  </div>
                                </button>
                              ))}
                          </div>

                          {newCardVisibleCount <
                            (newCardMatchResult.matches?.length || 0) && (
                            <button
                              type="button"
                              onClick={() =>
                                setNewCardVisibleCount((current) => current + 10)
                              }
                              className="mt-3 w-full rounded-xl border border-[#333] bg-[#111] p-3 text-sm font-bold"
                            >
                              Load More
                            </button>
                          )}
                        </>
                      )}

                      {(newCardMatchResult.status === 'not_found' ||
                        newCardMatchResult.status === 'invalid') && (
                        <div>
                          <p className="text-xs font-bold text-red-300">
                            Card not found
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Add a set name or card number above and search again.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>


            {editingIdentityRow && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5">
                <div className="w-full max-w-sm rounded-2xl border border-[#333] bg-[#111] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold">Edit Card Details</h2>
                      <p className="mt-1 text-xs text-gray-500">
                        Add only what you know. More detail can help Vendly find the exact card.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingIdentityRow(null)}
                      className="rounded-lg p-2 text-gray-500 hover:text-white"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <label className="mt-4 block text-xs font-semibold text-gray-400">
                    Card Name
                  </label>
                  <input
                    value={identityDraft.card_name}
                    onChange={(event) =>
                      setIdentityDraft((current) => ({
                        ...current,
                        card_name: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                  />

                  <label className="mt-3 block text-xs font-semibold text-gray-400">
                    Set Name
                  </label>
                  <input
                    value={identityDraft.set_name}
                    onChange={(event) =>
                      setIdentityDraft((current) => ({
                        ...current,
                        set_name: event.target.value,
                      }))
                    }
                    placeholder="Optional"
                    className="mt-1 w-full rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                  />

                  <label className="mt-3 block text-xs font-semibold text-gray-400">
                    Card Number
                  </label>
                  <input
                    value={identityDraft.card_number}
                    onChange={(event) =>
                      setIdentityDraft((current) => ({
                        ...current,
                        card_number: event.target.value,
                      }))
                    }
                    placeholder="Optional"
                    className="mt-1 w-full rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                  />

                  <p className="mt-4 text-xs font-semibold text-gray-400">
                    Card Type
                  </p>
                  <div className="mt-1 grid grid-cols-2 rounded-xl border border-[#333] bg-black p-1">
                    <button
                      type="button"
                      onClick={() =>
                        setIdentityDraft((current) => ({
                          ...current,
                          item_type: 'raw',
                        }))
                      }
                      className={`rounded-lg px-3 py-2 text-sm font-bold ${
                        identityDraft.item_type === 'raw'
                          ? 'bg-white text-black'
                          : 'text-gray-500'
                      }`}
                    >
                      Raw
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIdentityDraft((current) => ({
                          ...current,
                          item_type: 'graded',
                        }))
                      }
                      className={`rounded-lg px-3 py-2 text-sm font-bold ${
                        identityDraft.item_type === 'graded'
                          ? 'bg-white text-black'
                          : 'text-gray-500'
                      }`}
                    >
                      Graded
                    </button>
                  </div>

                  {identityDraft.item_type === 'raw' ? (
                    <>
                      <label className="mt-3 block text-xs font-semibold text-gray-400">
                        Condition
                      </label>
                      <select
                        value={identityDraft.condition}
                        onChange={(event) =>
                          setIdentityDraft((current) => ({
                            ...current,
                            condition: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                      >
                        <option value="NM">Near Mint</option>
                        <option value="LP">Lightly Played</option>
                        <option value="MP">Moderately Played</option>
                        <option value="HP">Heavily Played</option>
                        <option value="DMG">Damaged</option>
                      </select>
                    </>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-gray-400">
                          Grade Company
                        </label>
                        <select
                          value={identityDraft.grade_company}
                          onChange={(event) =>
                            setIdentityDraft((current) => ({
                              ...current,
                              grade_company: event.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                        >
                          <option value="PSA">PSA</option>
                          <option value="CGC">CGC</option>
                          <option value="Beckett">Beckett</option>
                          <option value="SGC">SGC</option>
                          <option value="TAG">TAG</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-400">
                          Grade
                        </label>
                        <select
                          value={identityDraft.grade}
                          onChange={(event) =>
                            setIdentityDraft((current) => ({
                              ...current,
                              grade: event.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                        >
                          {['10','9.5','9','8.5','8','7.5','7','6.5','6','5','4','3','2','1'].map(
                            (grade) => (
                              <option key={grade} value={grade}>
                                {grade}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => retrySingleRowMatch(editingIdentityRow)}
                    disabled={
                      retryingRowNumber === Number(editingIdentityRow.row_number) ||
                      !identityDraft.card_name.trim()
                    }
                    className="mt-4 w-full rounded-xl bg-white p-3 text-sm font-bold text-black disabled:opacity-50"
                  >
                    {retryingRowNumber === Number(editingIdentityRow.row_number)
                      ? 'Trying Again...'
                      : 'Try Again'}
                  </button>
                </div>
              </div>
            )}

            {matchResults.length > 0 && matchedRowCount > 0 && (
              <section className="rounded-2xl border border-[#222] bg-[#111] p-4">
                <div className="mb-4">
                  <h2 className="text-lg font-bold">Import Settings</h2>
                  <p className="mt-1 text-sm text-gray-400">
                    Vendly already filled in the safe defaults. Change something
                    only if you want to.
                  </p>
                </div>

                <label className="mb-2 block text-sm font-semibold text-gray-300">
                  Inventory List
                </label>

                {loadingImportSettings ? (
                  <div className="mb-4 rounded-xl border border-[#222] bg-black p-3 text-sm text-gray-500">
                    Loading your inventory lists...
                  </div>
                ) : (
                  <>
                    <select
                      value={creatingList ? '__create_new__' : selectedInventoryListId}
                      onChange={(event) => {
                        if (event.target.value === '__create_new__') {
                          setCreatingList(true)
                          return
                        }

                        setCreatingList(false)
                        setSelectedInventoryListId(event.target.value)
                      }}
                      className="mb-3 w-full rounded-xl border border-[#333] bg-black p-3 text-sm text-white outline-none"
                    >
                      {inventoryLists.map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.name}
                        </option>
                      ))}
                      <option value="__create_new__">+ Create New Inventory List</option>
                    </select>

                    {creatingList && (
                      <div className="mb-4 rounded-xl border border-[#333] bg-black p-3">
                        <p className="text-sm font-semibold">New Inventory List</p>
                        <div className="mt-2 flex gap-2">
                          <input
                            value={newListName}
                            onChange={(event) => setNewListName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                createInventoryList()
                              }
                            }}
                            placeholder="Example: Show Inventory"
                            className="min-w-0 flex-1 rounded-lg border border-[#333] bg-[#111] px-3 py-2 text-sm text-white outline-none"
                          />
                          <button
                            type="button"
                            onClick={createInventoryList}
                            disabled={!newListName.trim() || savingNewList}
                            className="rounded-lg bg-white px-4 py-2 text-xs font-bold text-black disabled:opacity-50"
                          >
                            {savingNewList ? 'Creating...' : 'Create'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCreatingList(false)
                              setNewListName('')
                            }}
                            className="rounded-lg border border-[#333] px-3 py-2 text-xs font-bold text-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="mb-4">
                  <p className="mb-2 text-sm font-semibold text-gray-300">
                    Visibility
                  </p>

                  <div className="grid grid-cols-2 rounded-xl border border-[#222] bg-black p-1">
                    <button
                      type="button"
                      onClick={() => setMakePublic(false)}
                      className={`rounded-lg px-3 py-3 text-sm font-bold ${
                        !makePublic
                          ? 'bg-white text-black'
                          : 'text-gray-500'
                      }`}
                    >
                      Keep Private
                    </button>

                    <button
                      type="button"
                      onClick={() => setMakePublic(true)}
                      className={`rounded-lg px-3 py-3 text-sm font-bold ${
                        makePublic
                          ? 'bg-white text-black'
                          : 'text-gray-500'
                      }`}
                    >
                      Make Public
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    Private is the default so a bulk upload never publishes cards
                    by accident.
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-300">
                      Assign to Show
                    </p>
                    <span className="text-xs text-gray-600">Optional</span>
                  </div>

                  {vendorShows.length === 0 ? (
                    <div className="rounded-xl border border-[#222] bg-black p-3 text-sm text-gray-500">
                      No joined shows found. You can assign these cards later.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {vendorShows.map((event) => {
                        const selected = selectedShowIds.includes(event.id)

                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={() => toggleShowSelection(event.id)}
                            className={`w-full rounded-xl border p-3 text-left transition ${
                              selected
                                ? 'border-blue-800 bg-blue-950/30'
                                : 'border-[#222] bg-black'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold">{event.name}</p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {[event.venue, event.city, event.state]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                                <p className="mt-1 text-xs text-gray-600">
                                  {formatEventDate(event.starts_at)}
                                  {event.booth_number
                                    ? ` · Booth ${event.booth_number}`
                                    : ''}
                                </p>
                              </div>

                              <span
                                className={`rounded-full px-3 py-1 text-xs font-bold ${
                                  selected
                                    ? 'bg-blue-400 text-black'
                                    : 'bg-[#1a1a1a] text-gray-500'
                                }`}
                              >
                                {selected ? 'Assigned' : 'Add'}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-green-900/60 bg-green-950/10 p-4">
                  <p className="text-sm font-bold text-green-300">
                    Ready to Import
                  </p>
                  <p className="mt-2 text-2xl font-bold">
                    {importableQuantityTotal} card
                    {importableQuantityTotal === 1 ? '' : 's'}
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    {importableRows.length} ready row
                    {importableRows.length === 1 ? '' : 's'}
                    {skippedRowCount > 0
                      ? ` · ${skippedRowCount} row${skippedRowCount === 1 ? '' : 's'} will be skipped`
                      : ' · Everything is ready'}
                  </p>

                  <button
                    type="button"
                    onClick={commitImport}
                    disabled={
                      committingImport ||
                      importableRows.length === 0 ||
                      !selectedInventoryListId ||
                      creatingList
                    }
                    className="mt-4 w-full rounded-xl bg-white p-4 text-sm font-bold text-black disabled:opacity-50"
                  >
                    {committingImport
                      ? 'Importing...'
                      : `Import ${importableQuantityTotal} Card${importableQuantityTotal === 1 ? '' : 's'}`}
                  </button>

                  {skippedRowCount > 0 && (
                    <p className="mt-2 text-center text-xs text-yellow-500">
                      Needs Review, Not Found, Invalid, and incomplete graded rows
                      will not be imported.
                    </p>
                  )}
                </div>
              </section>
            )}

            {importComplete && (
              <section className="rounded-2xl border border-green-900 bg-green-950/20 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    size={22}
                    className="mt-0.5 shrink-0 text-green-300"
                  />

                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-green-200">
                      Inventory Imported
                    </h2>
                    <p className="mt-1 text-sm text-gray-300">
                      {importComplete.inserted_items || 0} inventory row
                      {(importComplete.inserted_items || 0) === 1 ? '' : 's'} added
                      {importComplete.list_name
                        ? ` to ${importComplete.list_name}`
                        : ''}.
                    </p>

                    {(importComplete.show_assignments || 0) > 0 && (
                      <p className="mt-1 text-xs text-gray-500">
                        {importComplete.show_assignments} show assignment
                        {importComplete.show_assignments === 1 ? '' : 's'} created.
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => navigate('/inventory')}
                  className="mt-4 w-full rounded-xl bg-white p-3 text-sm font-bold text-black"
                >
                  View Inventory
                </button>
              </section>
            )}

            {resolvedMatchSummary && (
              <section className="rounded-2xl border border-[#222] bg-[#111] p-4">
                <h2 className="text-lg font-bold">Match Results</h2>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <PreviewStat
                    label="Matched"
                    value={resolvedMatchSummary.matched || 0}
                  />
                  <PreviewStat
                    label="Needs Review"
                    value={resolvedMatchSummary.needs_review || 0}
                  />
                  <PreviewStat
                    label="Not Found"
                    value={resolvedMatchSummary.not_found || 0}
                  />
                  <PreviewStat
                    label="Invalid"
                    value={resolvedMatchSummary.invalid || 0}
                  />
                </div>

                <p className="mt-3 text-sm text-gray-500">
                  Any yellow cards above only need one tap. Pick the right printing
                  and Vendly will mark it as matched.
                </p>
              </section>
            )}

            {!importComplete && (
              <div className="rounded-2xl border border-blue-900 bg-blue-950/20 p-4 text-sm text-blue-200">
                Review the matched cards and import settings carefully. Only fully
                matched, valid rows will be submitted.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default ImportInventory