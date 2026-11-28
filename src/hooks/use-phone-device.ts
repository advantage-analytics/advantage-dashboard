"use client";

import { useSyncExternalStore } from "react";

/**
 * Is this a phone, whatever its viewport says?
 *
 * `MobileGate`'s CSS gate only sees viewport width, and a phone gets past it
 * two ways: turned sideways (every recent iPhone is 844–956px wide in
 * landscape) or in "Request desktop site" mode (a ~980px layout viewport).
 * Neither changes the device's physical screen, so this asks about that
 * instead: a touchscreen (any pointer coarse, so a paired mouse does not hide
 * the finger) and a screen whose short side is under
 * 600 CSS px. Every phone is ≤ ~440 there; the smallest iPad (mini, 744) and
 * an unfolded foldable stay above it, so tablets still pass.
 *
 * `screen.width` is the device's, not the layout viewport's, in both iOS and
 * Android desktop-site modes. False on the server and on the first client
 * render, so markup never depends on it during hydration.
 */
const COARSE = "(any-pointer: coarse)";
const PHONE_SHORT_SIDE_MAX = 600;

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(COARSE);
  mql.addEventListener("change", onChange);
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    mql.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

function isPhone(): boolean {
  if (!window.matchMedia(COARSE).matches) return false;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  return shortSide > 0 && shortSide < PHONE_SHORT_SIDE_MAX;
}

export function usePhoneDevice(): boolean {
  return useSyncExternalStore(subscribe, isPhone, () => false);
}
