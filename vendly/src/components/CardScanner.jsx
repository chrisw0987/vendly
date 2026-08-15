import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  BadgeCheck,
  Camera,
  ImagePlus,
  RotateCcw,
  ScanBarcode,
  ScanLine,
  X,
} from 'lucide-react'

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

async function cropImageRegion(src, region) {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')

  const sx = Math.max(0, Math.round(image.width * region.x))
  const sy = Math.max(0, Math.round(image.height * region.y))
  const sw = Math.max(1, Math.round(image.width * region.width))
  const sh = Math.max(1, Math.round(image.height * region.height))

  canvas.width = sw
  canvas.height = sh

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create crop canvas.')

  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh)

  return canvas.toDataURL('image/jpeg', 0.95)
}

async function normalizeUploadedImage(file) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(objectUrl)
    const maxDimension = 1600
    const scale = Math.min(
      1,
      maxDimension / Math.max(image.width, image.height)
    )

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Unable to prepare uploaded image.')

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.92)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function extractPsaCertNumber(rawValue) {
  const raw = String(rawValue || '').trim()
  if (!raw) return ''

  // PSA barcodes may decode as the cert itself or as text/URL containing it.
  const groups = raw.match(/\d{7,12}/g) || []
  if (groups.length === 0) return ''

  return groups.sort((a, b) => b.length - a.length)[0]
}

function CardScanner({
  open,
  onClose,
  onConfirm,
  onPsaCert,
}) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)

  const analysisCanvasRef = useRef(null)
  const previousFrameRef = useRef(null)
  const stableFrameCountRef = useRef(0)
  const autoCaptureLockedRef = useRef(false)
  const cameraStartedAtRef = useRef(0)

  const barcodeReaderRef = useRef(null)
  const barcodeCanvasRef = useRef(null)
  const barcodeTimerRef = useRef(null)
  const barcodeLockedRef = useRef(false)

  const [cameraError, setCameraError] = useState('')
  const [capturedImage, setCapturedImage] = useState('')
  const [startingCamera, setStartingCamera] = useState(false)

  // Keep the two top-level tabs simple:
  // Auto Scan = raw-card vision flow.
  // PSA Slab = barcode/cert flow.
  const [scanMode, setScanMode] = useState('auto')
  const [scanStatus, setScanStatus] = useState('Center card in frame')
  const [psaCertInput, setPsaCertInput] = useState('')
  const [psaBarcodeValue, setPsaBarcodeValue] = useState('')

  useEffect(() => {
    if (!open) {
      stopBarcodeScan()
      stopCamera()
      setCapturedImage('')
      setCameraError('')
      setScanStatus('Center card in frame')
      setPsaCertInput('')
      setPsaBarcodeValue('')
      stableFrameCountRef.current = 0
      previousFrameRef.current = null
      autoCaptureLockedRef.current = false
      barcodeLockedRef.current = false
      return
    }

    startCamera()

    return () => {
      stopBarcodeScan()
      stopCamera()
    }
  }, [open])

  useEffect(() => {
    if (!open || startingCamera || cameraError || capturedImage) return

    if (scanMode === 'psa') {
      startBarcodeScan()
    } else {
      stopBarcodeScan()
    }

    return () => {
      if (scanMode === 'psa') stopBarcodeScan()
    }
  }, [open, scanMode, startingCamera, cameraError, capturedImage])

  useEffect(() => {
    if (
      !open ||
      scanMode !== 'auto' ||
      capturedImage ||
      startingCamera ||
      cameraError
    ) {
      return
    }

    const interval = window.setInterval(() => {
      const video = videoRef.current
      if (!video?.videoWidth || !video?.videoHeight) return
      if (autoCaptureLockedRef.current) return

      if (Date.now() - cameraStartedAtRef.current < 1400) {
        setScanStatus('Getting camera ready...')
        return
      }

      const analysis = analyzeFrame(video)

      if (!analysis.exposedWell) {
        stableFrameCountRef.current = 0
        setScanStatus('Adjust lighting')
        return
      }

      if (!analysis.sharpEnough || !analysis.edgeEnough) {
        stableFrameCountRef.current = 0
        setScanStatus('Move closer to the card')
        return
      }

      if (!analysis.stable) {
        stableFrameCountRef.current = 0
        setScanStatus('Hold card steady')
        return
      }

      stableFrameCountRef.current += 1

      setScanStatus(
        stableFrameCountRef.current === 1
          ? 'Card detected'
          : 'Hold steady...'
      )

      if (stableFrameCountRef.current >= 3) {
        autoCaptureLockedRef.current = true
        setScanStatus('Capturing...')
        capturePhoto(true)
      }
    }, 250)

    return () => window.clearInterval(interval)
  }, [
    open,
    scanMode,
    capturedImage,
    startingCamera,
    cameraError,
  ])

  function getGuideCrop(video) {
    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    const cardAspect = 2.5 / 3.5

    let cropWidth = sourceWidth * 0.72
    let cropHeight = cropWidth / cardAspect

    if (cropHeight > sourceHeight * 0.82) {
      cropHeight = sourceHeight * 0.82
      cropWidth = cropHeight * cardAspect
    }

    return {
      sx: Math.max(0, (sourceWidth - cropWidth) / 2),
      sy: Math.max(0, (sourceHeight - cropHeight) / 2),
      cropWidth,
      cropHeight,
    }
  }

  function analyzeFrame(video) {
    if (!analysisCanvasRef.current) {
      analysisCanvasRef.current = document.createElement('canvas')
    }

    const canvas = analysisCanvasRef.current

    if (!video?.videoWidth || !video?.videoHeight) {
      return {
        stable: false,
        sharpEnough: false,
        exposedWell: false,
        edgeEnough: false,
      }
    }

    const { sx, sy, cropWidth, cropHeight } = getGuideCrop(video)

    const width = 96
    const height = Math.round(width / (2.5 / 3.5))

    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d', {
      willReadFrequently: true,
    })

    if (!context) {
      return {
        stable: false,
        sharpEnough: false,
        exposedWell: false,
        edgeEnough: false,
      }
    }

    context.drawImage(
      video,
      sx,
      sy,
      cropWidth,
      cropHeight,
      0,
      0,
      width,
      height
    )

    const imageData = context.getImageData(0, 0, width, height)
    const pixels = imageData.data
    const grayscale = new Uint8Array(width * height)

    let brightnessTotal = 0

    for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
      const gray =
        pixels[i] * 0.299 +
        pixels[i + 1] * 0.587 +
        pixels[i + 2] * 0.114

      grayscale[p] = gray
      brightnessTotal += gray
    }

    const averageBrightness = brightnessTotal / grayscale.length
    const exposedWell =
      averageBrightness >= 45 &&
      averageBrightness <= 220

    let edgeTotal = 0
    let strongEdges = 0
    let samples = 0

    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const index = y * width + x

        const gx =
          Math.abs(grayscale[index + 1] - grayscale[index - 1])

        const gy =
          Math.abs(grayscale[index + width] - grayscale[index - width])

        const edge = gx + gy
        edgeTotal += edge
        samples += 1

        if (edge > 48) strongEdges += 1
      }
    }

    const averageEdge = samples ? edgeTotal / samples : 0
    const edgeDensity = samples ? strongEdges / samples : 0

    const sharpEnough = averageEdge >= 18
    const edgeEnough = edgeDensity >= 0.08

    let stable = false

    if (
      previousFrameRef.current &&
      previousFrameRef.current.length === grayscale.length
    ) {
      let diffTotal = 0

      for (let i = 0; i < grayscale.length; i += 2) {
        diffTotal += Math.abs(
          grayscale[i] - previousFrameRef.current[i]
        )
      }

      const averageDiff =
        diffTotal / Math.ceil(grayscale.length / 2)

      stable = averageDiff <= 8.5
    }

    previousFrameRef.current = grayscale

    return {
      stable,
      sharpEnough,
      exposedWell,
      edgeEnough,
    }
  }

  async function startCamera() {
    setStartingCamera(true)
    setCameraError('')
    setCapturedImage('')
    stableFrameCountRef.current = 0
    previousFrameRef.current = null
    autoCaptureLockedRef.current = false
    barcodeLockedRef.current = false

    try {
      stopBarcodeScan()
      stopCamera()

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      cameraStartedAtRef.current = Date.now()

      setScanStatus(
        scanMode === 'psa'
          ? 'Aim at the PSA barcode'
          : 'Center card in frame'
      )
    } catch (error) {
      console.error('Unable to open camera:', error)

      const message =
        error?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access and try again.'
          : error?.name === 'NotFoundError'
          ? 'No camera was found on this device.'
          : 'Unable to open your camera. Please try again.'

      setCameraError(message)
    } finally {
      setStartingCamera(false)
    }
  }

  function stopCamera() {
    if (!streamRef.current) return

    streamRef.current.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  function stopBarcodeScan() {
    if (barcodeTimerRef.current) {
      window.clearInterval(barcodeTimerRef.current)
      barcodeTimerRef.current = null
    }
  }

  function startBarcodeScan() {
    stopBarcodeScan()

    if (!barcodeReaderRef.current) {
      barcodeReaderRef.current = new BrowserMultiFormatReader()
    }

    if (!barcodeCanvasRef.current) {
      barcodeCanvasRef.current = document.createElement('canvas')
    }

    setScanStatus('Aim at the PSA barcode')

    barcodeTimerRef.current = window.setInterval(async () => {
      const video = videoRef.current

      if (
        !video?.videoWidth ||
        !video?.videoHeight ||
        barcodeLockedRef.current ||
        scanMode !== 'psa'
      ) {
        return
      }

      const canvas = barcodeCanvasRef.current
      const context = canvas.getContext('2d')
      if (!context) return

      // Wide horizontal crop matching the PSA barcode guide.
      const sourceWidth = video.videoWidth
      const sourceHeight = video.videoHeight

      const cropWidth = sourceWidth * 0.9
      const cropHeight = sourceHeight * 0.38
      const sx = (sourceWidth - cropWidth) / 2
      const sy = (sourceHeight - cropHeight) / 2

      const outputWidth = 900
      const outputHeight = Math.round(
        outputWidth * (cropHeight / cropWidth)
      )

      canvas.width = outputWidth
      canvas.height = outputHeight

      context.drawImage(
        video,
        sx,
        sy,
        cropWidth,
        cropHeight,
        0,
        0,
        outputWidth,
        outputHeight
      )

      try {
        const result =
          barcodeReaderRef.current.decodeFromCanvas(canvas)

        const rawValue =
          typeof result?.getText === 'function'
            ? result.getText()
            : String(result?.text || '')

        const certNumber = extractPsaCertNumber(rawValue)

        if (!certNumber) {
          setScanStatus('Barcode found — move closer')
          return
        }

        barcodeLockedRef.current = true
        stopBarcodeScan()
        setPsaBarcodeValue(rawValue)
        setPsaCertInput(certNumber)
        setScanStatus(`PSA cert ${certNumber} detected`)

        window.setTimeout(() => {
          onPsaCert?.({
            certNumber,
            rawValue,
          })
        }, 250)
      } catch {
        // No barcode on this frame. Keep scanning quietly.
      }
    }, 350)
  }

  function capturePhoto(autoCaptured = false) {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      autoCaptureLockedRef.current = false
      return
    }

    const { sx, sy, cropWidth, cropHeight } = getGuideCrop(video)

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(cropWidth)
    canvas.height = Math.round(cropHeight)

    const context = canvas.getContext('2d')
    if (!context) {
      autoCaptureLockedRef.current = false
      return
    }

    context.drawImage(
      video,
      sx,
      sy,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height
    )

    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.95)

    setCapturedImage(imageDataUrl)
    setScanStatus(
      autoCaptured
        ? 'Card captured automatically'
        : 'Photo captured'
    )
    stopCamera()
  }

  function retakePhoto() {
    setCapturedImage('')
    stableFrameCountRef.current = 0
    previousFrameRef.current = null
    autoCaptureLockedRef.current = false
    barcodeLockedRef.current = false
    startCamera()
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!file.type.startsWith('image/')) {
      setCameraError('Please choose an image file.')
      return
    }

    try {
      setCameraError('')
      stopCamera()

      const imageDataUrl = await normalizeUploadedImage(file)
      setCapturedImage(imageDataUrl)
      setStartingCamera(false)
      setScanStatus('Photo uploaded')
    } catch (error) {
      console.error('Unable to prepare uploaded card photo:', error)
      setCameraError('Unable to open that image. Please try another photo.')
    }
  }

  async function confirmPhoto() {
    if (!capturedImage) return

    try {
      const numberRegionDataUrl = await cropImageRegion(
        capturedImage,
        {
          x: 0,
          y: 0.66,
          width: 1,
          height: 0.34,
        }
      )

      onConfirm?.({
        imageDataUrl: capturedImage,
        numberRegionDataUrl,
      })
    } catch (error) {
      console.error('Unable to prepare scan regions:', error)

      onConfirm?.({
        imageDataUrl: capturedImage,
      })
    }
  }

  function submitManualCert() {
    const certNumber = extractPsaCertNumber(psaCertInput)

    if (!certNumber) {
      setScanStatus('Enter a valid PSA cert number')
      return
    }

    barcodeLockedRef.current = true
    stopBarcodeScan()

    onPsaCert?.({
      certNumber,
      rawValue: psaBarcodeValue || certNumber,
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] overflow-hidden bg-black text-white">
      <div
        className="mx-auto flex h-[100dvh] w-full max-w-[520px] flex-col overflow-hidden"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3">
          <div className="min-w-0">
            <p className="text-lg font-bold">
              {scanMode === 'psa' ? 'Scan PSA Slab' : 'Scan Card'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {scanMode === 'psa'
                ? 'Aim the camera at the PSA barcode.'
                : 'Center one Pokémon card inside the frame.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#111]"
            aria-label="Close scanner"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5">
          <div className="mb-3 grid shrink-0 grid-cols-2 rounded-xl border border-[#242424] bg-[#111] p-1">
            <button
              type="button"
              onClick={() => {
                setScanMode('auto')
                stopBarcodeScan()
                barcodeLockedRef.current = false
                stableFrameCountRef.current = 0
                previousFrameRef.current = null
                autoCaptureLockedRef.current = false
                setScanStatus('Center card in frame')
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                scanMode === 'auto'
                  ? 'bg-white text-black'
                  : 'text-gray-400'
              }`}
            >
              <ScanLine size={16} />
              Auto Scan
            </button>

            <button
              type="button"
              onClick={() => {
                setScanMode('psa')
                stableFrameCountRef.current = 0
                previousFrameRef.current = null
                autoCaptureLockedRef.current = false
                barcodeLockedRef.current = false
                setCapturedImage('')
                setScanStatus('Aim at the PSA barcode')

                window.setTimeout(() => {
                  if (streamRef.current) startBarcodeScan()
                }, 100)
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                scanMode === 'psa'
                  ? 'bg-white text-black'
                  : 'text-gray-400'
              }`}
            >
              <ScanBarcode size={16} />
              PSA Slab
            </button>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[28px] border border-[#242424] bg-[#0d0d0d]">
            {!capturedImage && (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="absolute inset-0 h-full w-full object-cover"
                />

                <div className="pointer-events-none absolute inset-0 bg-black/20" />

                {scanMode === 'auto' ? (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-8">
                    <div
                      className={`aspect-[2.5/3.5] h-auto max-h-[82%] w-[72%] max-w-[285px] rounded-2xl border-2 transition ${
                        scanStatus === 'Hold steady...' ||
                        scanStatus === 'Card detected'
                          ? 'border-green-400 shadow-[0_0_26px_rgba(74,222,128,0.22),0_0_0_9999px_rgba(0,0,0,0.28)]'
                          : 'border-yellow-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]'
                      }`}
                    />
                  </div>
                ) : (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-7">
                    <div className="relative h-[32%] w-full max-w-[420px] rounded-2xl border-2 border-red-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.30)]">
                      <div className="absolute inset-x-6 top-1/2 h-[2px] -translate-y-1/2 bg-red-400/80 shadow-[0_0_12px_rgba(248,113,113,0.8)]" />
                    </div>
                  </div>
                )}

                {!startingCamera && !cameraError && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-5">
                    <div className="rounded-full border border-white/10 bg-black/75 px-4 py-2 text-xs font-semibold text-white backdrop-blur">
                      {scanStatus}
                    </div>
                  </div>
                )}

                {startingCamera && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
                    <div className="text-center">
                      <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-white/15 border-t-yellow-300" />
                      <p className="mt-3 text-sm text-gray-300">
                        Opening camera...
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {capturedImage && (
              <img
                src={capturedImage}
                alt="Captured Pokémon card"
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}

            {cameraError && !capturedImage && (
              <div className="absolute inset-x-5 top-1/2 z-30 -translate-y-1/2 rounded-2xl border border-red-900 bg-red-950/90 p-5 text-center">
                <Camera size={28} className="mx-auto text-red-300" />
                <p className="mt-3 text-sm font-semibold text-red-200">
                  {cameraError}
                </p>

                <button
                  type="button"
                  onClick={startCamera}
                  className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-bold text-black"
                >
                  Try Camera Again
                </button>
              </div>
            )}
          </div>

          <div className="shrink-0 pt-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />

            {scanMode === 'psa' ? (
              <div>
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#222] bg-[#111] px-3 py-2">
                  <BadgeCheck size={17} className="shrink-0 text-red-300" />
                  <input
                    inputMode="numeric"
                    placeholder="Or enter PSA cert number"
                    value={psaCertInput}
                    onChange={(event) =>
                      setPsaCertInput(
                        event.target.value.replace(/[^\d]/g, '')
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        submitManualCert()
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-600"
                  />
                  <button
                    type="button"
                    onClick={submitManualCert}
                    disabled={!psaCertInput.trim()}
                    className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
                  >
                    Verify
                  </button>
                </div>

                <p className="text-center text-xs text-gray-400">
                  Hold the PSA barcode inside the red guide. Vendly will verify the cert automatically.
                </p>

                <p className="mt-2 text-center text-[11px] text-gray-600">
                  Cert entry is included for desktop testing or hard-to-read labels.
                </p>
              </div>
            ) : !capturedImage ? (
              <>
                <p className="text-center text-xs text-gray-400">
                  Hold the card inside the frame. Vendly will capture when it is steady.
                </p>

                <div className="mt-3 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#111] px-4 text-sm font-semibold text-gray-200"
                  >
                    <ImagePlus size={18} />
                    Upload Photo
                  </button>

                  <button
                    type="button"
                    onClick={() => capturePhoto(false)}
                    disabled={startingCamera || !!cameraError}
                    className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white/60 bg-[#1b1b1b] text-white shadow-lg disabled:opacity-40"
                    aria-label="Capture card manually"
                    title="Capture manually"
                  >
                    <Camera size={23} />
                  </button>
                </div>

                <p className="mt-2 text-center text-[11px] text-gray-600">
                  Manual capture is always available. Upload Photo works for desktop testing too.
                </p>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={retakePhoto}
                  className="flex items-center justify-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#111] p-3 text-sm font-semibold"
                >
                  <RotateCcw size={17} />
                  Retake
                </button>

                <button
                  type="button"
                  onClick={confirmPhoto}
                  className="rounded-xl bg-white p-3 text-sm font-bold text-black"
                >
                  Identify Card
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#111] p-3 text-sm font-semibold text-gray-300"
                >
                  <ImagePlus size={17} />
                  Choose Different Photo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default CardScanner