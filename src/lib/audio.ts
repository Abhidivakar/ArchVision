/**
 * Audio utility for user notifications
 * Uses Web Audio API to generate sounds without external assets.
 */

let globalCtx: AudioContext | null = null;

const getCtx = () => {
  if (typeof window === "undefined") return null;
  if (!globalCtx) {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    globalCtx = new AudioContextClass();
  }
  return globalCtx;
};

export const initAudio = async () => {
  try {
    const ctx = getCtx();
    if (ctx && ctx.state === "suspended") {
      await ctx.resume();
      console.log("[Audio] Context unlocked successfully");
    }
  } catch (e) {
    // Silent fail
  }
};

export const playSuccessSound = async () => {

  try {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // A clean, soft "ping" sound (E5 then G5)
    osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.1); // G5

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.warn("Audio Context playback failed", e);
  }
};

export const playTfSuccessSound = async () => {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Triple beep for terraform success
    const now = ctx.currentTime;
    [0, 0.15, 0.3].forEach((t, i) => {
      osc.frequency.setValueAtTime(880, now + t); // A5
      gain.gain.setValueAtTime(0, now + t);
      gain.gain.linearRampToValueAtTime(0.1, now + t + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + t + 0.1);
    });

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(now + 0.5);
  } catch (e) {
    // Silently ignore audio failures
  }
};
