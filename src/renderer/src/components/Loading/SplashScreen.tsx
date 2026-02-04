import { useState, useEffect, type JSX } from 'react'
import './SplashScreen.css'

// Logo path from public folder - use relative path for production builds
const logoPath = './icon.png'

interface SplashScreenProps {
  /** Whether the app has finished initializing */
  isReady: boolean
  /** Minimum time to show splash screen (ms) */
  minDisplayTime?: number
  /** Callback when splash screen finishes */
  onComplete?: () => void
}

/**
 * SplashScreen component that displays the app logo with a fade-in animation
 * on a black background, then fades out when the app is ready.
 */
export default function SplashScreen({
  isReady,
  minDisplayTime = 2500,
  onComplete
}: SplashScreenProps): JSX.Element | null {
  const [phase, setPhase] = useState<'fade-in' | 'visible' | 'fade-out' | 'hidden'>('fade-in')
  const [minTimeElapsed, setMinTimeElapsed] = useState(false)

  // Ensure minimum display time
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true)
    }, minDisplayTime)

    return () => clearTimeout(timer)
  }, [minDisplayTime])

  // Handle fade-in completion
  useEffect(() => {
    if (phase !== 'fade-in') {
      return
    }
    const timer = setTimeout(() => {
      setPhase('visible')
    }, 1800) // Match CSS animation duration (logo 1.5s + title 1s with 0.8s delay)

    return () => clearTimeout(timer)
  }, [phase])

  // Start fade-out when ready and minimum time has elapsed
  useEffect(() => {
    if (isReady && minTimeElapsed && phase === 'visible') {
      setPhase('fade-out')
    }
  }, [isReady, minTimeElapsed, phase])

  // Handle fade-out completion
  useEffect(() => {
    if (phase !== 'fade-out') {
      return
    }
    const timer = setTimeout(() => {
      setPhase('hidden')
      onComplete?.()
    }, 500) // Match CSS fade-out duration

    return () => clearTimeout(timer)
  }, [phase, onComplete])

  // Don't render when hidden
  if (phase === 'hidden') {
    return null
  }

  return (
    <div className={`splash-screen splash-screen--${phase}`}>
      <div className="splash-screen__content">
        <img
          src={logoPath}
          alt="DAGent"
          className={`splash-screen__logo splash-screen__logo--${phase}`}
        />
        <h1 className={`splash-screen__title splash-screen__title--${phase}`}>
          DAGent
        </h1>
      </div>
    </div>
  )
}
