import { useEffect, useRef, useState } from 'react'
import { Camera, RotateCcw, X } from 'lucide-react'
import { createWorker } from 'tesseract.js'


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

function CardScanner({ open, onClose, onConfirm }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [cameraError, setCameraError] = useState('')
  const [capturedImage, setCapturedImage] = useState('')
  const [startingCamera, setStartingCamera] = useState(false)
  const [readingCard, setReadingCard] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)

  useEffect(() => {
    if (!open) {
      stopCamera()
      setCapturedImage('')
      setCameraError('')
      return
    }

    startCamera()

    return () => {
      stopCamera()
    }
  }, [open])

  async function startCamera() {
    setStartingCamera(true)
    setCameraError('')
    setCapturedImage('')

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

  function capturePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')
    if (!context) return

    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setCapturedImage(imageDataUrl)
    stopCamera()
  }

  function retakePhoto() {
    setCapturedImage('')
    startCamera()
  }

  async function confirmPhoto() {
    if (!capturedImage || readingCard) return

    setReadingCard(true)
    setScanProgress(0)
    setCameraError('')

    let worker = null

    try {
      worker = await createWorker('eng', 1, {
        logger: (message) => {
          if (message?.status === 'recognizing text') {
            setScanProgress(Math.round(Number(message.progress || 0) * 100))
          }
        },
      })

      // Pokémon cards are fairly predictable:
      // - name is near the top
      // - collector number is near the bottom
      // We OCR those regions separately instead of treating every line equally.
      const [nameCrop, numberCrop] = await Promise.all([
        cropImageRegion(capturedImage, {
          x: 0.08,
          y: 0.02,
          width: 0.84,
          height: 0.20,
        }),
        cropImageRegion(capturedImage, {
          x: 0.03,
          y: 0.78,
          width: 0.94,
          height: 0.20,
        }),
      ])

      const nameResult = await worker.recognize(nameCrop)
      const numberResult = await worker.recognize(numberCrop)
      const fullResult = await worker.recognize(capturedImage)

      const nameText = String(nameResult?.data?.text || '').trim()
      const numberText = String(numberResult?.data?.text || '').trim()
      const fullText = String(fullResult?.data?.text || '').trim()

      if (!nameText && !numberText && !fullText) {
        setCameraError(
          'Vendly could not read enough text from this photo. Try moving closer and reducing glare.'
        )
        return
      }

      onConfirm?.({
        imageDataUrl: capturedImage,
        ocrText: fullText,
        nameOcrText: nameText,
        numberOcrText: numberText,
      })
    } catch (error) {
      console.error('Card OCR failed:', error)
      setCameraError(
        'Vendly could not read this card. Try retaking the photo with the card flat and well lit.'
      )
    } finally {
      if (worker) {
        await worker.terminate()
      }
      setReadingCard(false)
      setScanProgress(0)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col">
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <div>
            <p className="text-lg font-bold">Scan Card</p>
            <p className="mt-1 text-xs text-gray-500">
              Center one Pokémon card inside the frame.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#111]"
            aria-label="Close scanner"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 flex-col px-5 pb-6">
          <div className="relative flex min-h-[460px] flex-1 items-center justify-center overflow-hidden rounded-[28px] border border-[#242424] bg-[#0d0d0d]">
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

                <div className="pointer-events-none relative z-10 aspect-[2.5/3.5] w-[72%] max-w-[285px] rounded-2xl border-2 border-yellow-300 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]">
                  <span className="absolute -left-0.5 -top-0.5 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-yellow-300" />
                  <span className="absolute -right-0.5 -top-0.5 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-yellow-300" />
                  <span className="absolute -bottom-0.5 -left-0.5 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-yellow-300" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-yellow-300" />
                </div>

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

            {cameraError && (
              <div className="relative z-30 mx-5 rounded-2xl border border-red-900 bg-red-950/50 p-5 text-center">
                <Camera size={28} className="mx-auto text-red-300" />
                <p className="mt-3 text-sm font-semibold text-red-200">
                  {cameraError}
                </p>

                <button
                  type="button"
                  onClick={startCamera}
                  className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-bold text-black"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>

          {!cameraError && !capturedImage && (
            <div className="pt-5 text-center">
              <p className="text-sm text-gray-300">
                Keep the whole card visible and avoid glare.
              </p>

              <button
                type="button"
                onClick={capturePhoto}
                disabled={startingCamera}
                className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-yellow-300 text-black shadow-lg disabled:opacity-50"
                aria-label="Capture card"
              >
                <Camera size={25} />
              </button>
            </div>
          )}

          {capturedImage && (
            <div className="grid grid-cols-2 gap-3 pt-5">
              <button
                type="button"
                onClick={retakePhoto}
                className="flex items-center justify-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#111] p-4 text-sm font-semibold"
              >
                <RotateCcw size={17} />
                Retake
              </button>

              <button
                type="button"
                onClick={confirmPhoto}
                disabled={readingCard}
                className="rounded-xl bg-white p-4 text-sm font-bold text-black disabled:opacity-60"
              >
                {readingCard
                  ? `Reading Card${scanProgress ? ` ${scanProgress}%` : '...'}`
                  : 'Scan Card'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CardScanner
