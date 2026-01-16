import { useRef, useLayoutEffect, useCallback } from 'react';

interface AnimationState {
  frameId: number;
  lastTime: number;
  isRunning: boolean;
}

/**
 * Custom hook for managing requestAnimationFrame lifecycle with delta time calculation.
 *
 * Uses useLayoutEffect (not useEffect) for RAF cleanup to prevent timing issues
 * where cleanup might run after a new animation frame has already been scheduled.
 *
 * @param callback - Function called each frame with delta time in milliseconds
 * @param paused - When true, animation stops
 */
export function useAnimationFrame(
  callback: (deltaTime: number) => void,
  paused: boolean = false
): void {
  const animationRef = useRef<AnimationState>({
    frameId: 0,
    lastTime: 0,
    isRunning: false,
  });

  // Store callback in ref to avoid recreating the loop function
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const tick = useCallback((currentTime: number) => {
    const animation = animationRef.current;
    if (!animation.isRunning) return;

    // Calculate delta time
    let deltaTime = currentTime - animation.lastTime;

    // Handle first frame - cap at 100ms to prevent huge jumps
    // This can happen after tab switch or on first frame
    if (animation.lastTime === 0 || deltaTime > 100) {
      deltaTime = 16.67; // Assume 60fps for first frame
    }

    animation.lastTime = currentTime;

    // Call the callback with delta time
    callbackRef.current(deltaTime);

    // Schedule next frame if still running
    if (animation.isRunning) {
      animation.frameId = requestAnimationFrame(tick);
    }
  }, []);

  useLayoutEffect(() => {
    const animation = animationRef.current;

    if (!paused) {
      animation.isRunning = true;
      animation.lastTime = 0; // Reset to handle first-frame delta gracefully
      animation.frameId = requestAnimationFrame(tick);
    }

    // Cleanup: cancel RAF on unmount or when paused
    return () => {
      animation.isRunning = false;
      if (animation.frameId) {
        cancelAnimationFrame(animation.frameId);
        animation.frameId = 0;
      }
    };
  }, [paused, tick]);
}
