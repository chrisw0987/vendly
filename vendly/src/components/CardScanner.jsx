import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  ImagePlus,
  RotateCcw,
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

function getGuideCrop(video, scannerMode = 'raw') {
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  const aspect =
    scannerMode === 'slab'
      ? 2.75 / 4
      : 2.5 / 3.5

  let cropWidth = sourceWidth * (scannerMode === 'slab' ? 0.76 : 0.72)
  let cropHeight = cropWidth / aspect

  if (cropHeight > sourceHeight * 0.84) {
    cropHeight = sourceHeight * 0.84
    cropWidth = cropHeight * aspect
  }

  return {
    sx: Math.max(0, (sourceWidth - cropWidth) / 2),
    sy: Math.max(0, (sourceHeight - cropHeight) / 2),
    cropWidth,
    cropHeight,
  }
}

function analyzeFrame(video, canvas, previousFrame, scannerMode = 'raw') {
  if (!video?.videoWidth || !video?.videoHeight) {
    return {
      ready: false,
      stable: false,
      sharpEnough: false,
      exposedWell: false,
      edgeEnough: false,
      frame: null,
    }
  }

  const { sx, sy, cropWidth, cropHeight } = getGuideCrop(
    video,
    scannerMode
  )

  const width = scannerMode === 'slab' ? 112 : 96
  const aspect =
    scannerMode === 'slab'
      ? 2.75 / 4
      : 2.5 / 3.5
  const height = Math.round(width / aspect)

  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  })

  if (!context) {
    return {
      ready: false,
      stable: false,
      sharpEnough: false,
      exposedWell: false,
      edgeEnough: false,
      frame: null,
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

  // Simple edge / sharpness estimate.
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

      if (edge > 48) {
        strongEdges += 1
      }
    }
  }

  const averageEdge = samples ? edgeTotal / samples : 0
  const edgeDensity = samples ? strongEdges / samples : 0

  const sharpEnough =
    averageEdge >= (scannerMode === 'slab' ? 20 : 18)
  const edgeEnough =
    edgeDensity >= (scannerMode === 'slab' ? 0.09 : 0.08)

  let stable = false

  if (previousFrame && previousFrame.length === grayscale.length) {
    let diffTotal = 0

    // Sample every other pixel. We only need a rough motion estimate.
    for (let i = 0; i < grayscale.length; i += 2) {
      diffTotal += Math.abs(grayscale[i] - previousFrame[i])
    }

    const averageDiff =
      diffTotal / Math.ceil(grayscale.length / 2)

    stable = averageDiff <= 8.5
  }

  return {
    ready: exposedWell && sharpEnough && edgeEnough,
    stable,
    sharpEnough,
    exposedWell,
    edgeEnough,
    frame: grayscale,
  }
}

function CardScanner({ open, onClose, onConfirm, onSlabConfirm }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)
  const analysisCanvasRef = useRef(null)
  const previousFrameRef = useRef(null)
  const stableFrameCountRef = useRef(0)
  const autoCaptureLockedRef = useRef(false)
  const cameraStartedAtRef = useRef(0)

  const [cameraError, setCameraError] = useState('')
  const [capturedImage, setCapturedImage] = useState('')
  const [startingCamera, setStartingCamera] = useState(false)

  const [autoScanEnabled, setAutoScanEnabled] = useState(true)
  const [scannerMode, setScannerMode] = useState('raw')
  const [scanStatus, setScanStatus] = useState('Center card in frame')

  useEffect(() => {
    if (!open) {
      stopCamera()
      setCapturedImage('')
      setCameraError('')
      setScanStatus('Center card in frame')
      stableFrameCountRef.current = 0
      previousFrameRef.current = null
      autoCaptureLockedRef.current = false
      return
    }

    startCamera()

    return () => {
      stopCamera()
    }
  }, [open])

  useEffect(() => {
    if (
      !open ||
      !autoScanEnabled ||
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

      // Give Safari / the camera exposure a short moment to settle.
      if (Date.now() - cameraStartedAtRef.current < 1400) {
        setScanStatus('Getting camera ready...')
        return
      }

      if (!analysisCanvasRef.current) {
        analysisCanvasRef.current = document.createElement('canvas')
      }

      const analysis = analyzeFrame(
        video,
        analysisCanvasRef.current,
        previousFrameRef.current,
        scannerMode
      )

      previousFrameRef.current = analysis.frame

      if (!analysis.exposedWell) {
        stableFrameCountRef.current = 0
        setScanStatus('Adjust lighting')
        return
      }

      if (!analysis.sharpEnough || !analysis.edgeEnough) {
        stableFrameCountRef.current = 0
        setScanStatus(
          scannerMode === 'slab'
            ? 'Move closer so the PSA label is sharp'
            : 'Move closer to the card'
        )
        return
      }

      if (!analysis.stable) {
        stableFrameCountRef.current = 0
        setScanStatus('Hold card steady')
        return
      }

      stableFrameCountRef.current += 1

      if (stableFrameCountRef.current === 1) {
        setScanStatus(
          scannerMode === 'slab'
            ? 'PSA slab detected'
            : 'Card detected'
        )
      } else {
        setScanStatus('Hold steady...')
      }

      // Raw cards: ~0.75 sec. PSA slabs: ~1 sec for a sharper label.
      const requiredStableFrames =
        scannerMode === 'slab' ? 4 : 3

      if (stableFrameCountRef.current >= requiredStableFrames) {
        autoCaptureLockedRef.current = true
        setScanStatus('Capturing...')
        capturePhoto(true)
      }
    }, 250)

    return () => window.clearInterval(interval)
  }, [
    open,
    autoScanEnabled,
    capturedImage,
    startingCamera,
    cameraError,
    scannerMode,
  ])

  async function startCamera() {
    setStartingCamera(true)
    setCameraError('')
    setCapturedImage('')
    setScanStatus('Opening camera...')
    stableFrameCountRef.current = 0
    previousFrameRef.current = null
    autoCaptureLockedRef.current = false

    try {
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
        autoScanEnabled
          ? scannerMode === 'slab'
            ? 'Center PSA slab in frame'
            : 'Center card in frame'
          : 'Tap the camera button when ready'
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

  async function capturePhoto(autoCaptured = false) {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      autoCaptureLockedRef.current = false
      return
    }

    const { sx, sy, cropWidth, cropHeight } = getGuideCrop(
      video,
      scannerMode
    )

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
    stopCamera()

    if (scannerMode === 'slab' && autoCaptured) {
      setScanStatus('PSA slab captured — reading label...')

      try {
        const labelRegionDataUrl = await cropImageRegion(
          imageDataUrl,
          {
            x: 0.03,
            y: 0,
            width: 0.94,
            height: 0.36,
          }
        )

        onSlabConfirm?.({
          imageDataUrl,
          labelRegionDataUrl,
        })
      } catch (error) {
        console.error('Unable to prepare PSA label region:', error)
        onSlabConfirm?.({ imageDataUrl })
      }

      return
    }

    setScanStatus(
      autoCaptured
        ? 'Card captured automatically'
        : 'Photo captured'
    )
  }

  function retakePhoto() {
    setCapturedImage('')
    stableFrameCountRef.current = 0
    previousFrameRef.current = null
    autoCaptureLockedRef.current = false
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
      if (scannerMode === 'slab') {
        const labelRegionDataUrl = await cropImageRegion(capturedImage, {
          x: 0.03,
          y: 0,
          width: 0.94,
          height: 0.36,
        })

        onSlabConfirm?.({
          imageDataUrl: capturedImage,
          labelRegionDataUrl,
        })
        return
      }

      const numberRegionDataUrl = await cropImageRegion(capturedImage, {
        x: 0,
        y: 0.66,
        width: 1,
        height: 0.34,
      })

      onConfirm?.({
        imageDataUrl: capturedImage,
        numberRegionDataUrl,
      })
    } catch (error) {
      console.error('Unable to prepare scan regions:', error)

      if (scannerMode === 'slab') {
        onSlabConfirm?.({ imageDataUrl: capturedImage })
      } else {
        onConfirm?.({ imageDataUrl: capturedImage })
      }
    }
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
              {scannerMode === 'slab' ? 'Scan PSA Slab' : 'Scan Card'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {scannerMode === 'slab'
                ? 'Keep the PSA label at the top clear and readable.'
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
                setScannerMode('raw')
                setAutoScanEnabled(true)
                stableFrameCountRef.current = 0
                previousFrameRef.current = null
                autoCaptureLockedRef.current = false
                setScanStatus('Center card in frame')
              }}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                scannerMode === 'raw'
                  ? 'bg-yellow-300 text-black'
                  : 'text-gray-400'
              }`}
            >
              <ScanLine size={16} />
              Raw Card
            </button>

            <button
              type="button"
              onClick={() => {
                setScannerMode('slab')
                setAutoScanEnabled(true)
                stableFrameCountRef.current = 0
                previousFrameRef.current = null
                autoCaptureLockedRef.current = false
                setCapturedImage('')
                setScanStatus('Center PSA slab in frame')
              }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                scannerMode === 'slab'
                  ? 'bg-white text-black'
                  : 'text-gray-400'
              }`}
            >
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

                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-8">
                  <div
                    className={`h-auto max-h-[82%] w-[72%] max-w-[285px] rounded-2xl border-2 transition ${
                      scannerMode === 'slab' ? 'aspect-[2.75/4]' : 'aspect-[2.5/3.5]'
                    } ${
                      scannerMode === 'slab'
                        ? 'border-red-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]'
                        : scanStatus === 'Hold steady...' || scanStatus === 'Card detected'
                          ? 'border-green-400 shadow-[0_0_26px_rgba(74,222,128,0.22),0_0_0_9999px_rgba(0,0,0,0.28)]'
                          : 'border-yellow-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]'
                    }`}
                  >
                    {scannerMode === 'slab' && (
                      <div className="mx-2 mt-2 h-[24%] rounded-lg border border-red-300/80" />
                    )}
                  </div>
                </div>

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

            {!capturedImage ? (
              <>
                <p className="text-center text-xs text-gray-400">
                  {autoScanEnabled
                    ? 'Hold the card inside the frame. Vendly will capture when it is steady.'
                    : 'Fill the frame with the card and avoid glare.'}
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
                    className={`flex h-14 w-14 items-center justify-center rounded-full border-4 text-black shadow-lg disabled:opacity-40 ${
                      autoScanEnabled
                        ? 'border-white/60 bg-[#1b1b1b] text-white'
                        : 'border-white bg-yellow-300'
                    }`}
                    aria-label="Capture card manually"
                    title="Capture manually"
                  >
                    <Camera size={23} />
                  </button>
                </div>

                <p className="mt-2 text-center text-[11px] text-gray-600">
                  {scannerMode === 'slab'
                    ? 'Hold the full slab steady with the PSA label in focus. Vendly will capture automatically. Manual capture is still available.'
                    : 'Manual capture is always available. Upload Photo works for desktop testing too.'}
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
                  {scannerMode === 'slab' ? 'Read PSA Label' : 'Identify Card'}
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
