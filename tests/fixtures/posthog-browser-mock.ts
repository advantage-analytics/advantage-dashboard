/**
 * posthog-js in the Admin › Teams browser bundles: records what reached error
 * tracking on `window.capturedExceptions`, so a spec can assert it.
 */
declare global {
  interface Window {
    capturedExceptions?: { message: string; digest: unknown }[];
  }
}

const posthog = {
  capture() {},
  captureException(error: Error, properties?: { digest?: unknown }) {
    (window.capturedExceptions ??= []).push({
      message: error.message,
      digest: properties?.digest,
    });
  },
};

export default posthog;
