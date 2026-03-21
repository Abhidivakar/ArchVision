"use client";

import { useEffect } from "react";
import { initAudio } from "@/lib/audio";

/**
 * AudioUnlock component
 * Listens for the first user interaction to unlock the Web Audio API context.
 * Browsers block audio until a user gesture occurs.
 */
export function AudioUnlock() {
  useEffect(() => {
    const handleInteraction = async () => {
      await initAudio();
      // Remove listeners after first successful unlock
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };

    window.addEventListener("click", handleInteraction);
    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("touchstart", handleInteraction);

    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };
  }, []);

  return null; // This component doesn't render anything
}
