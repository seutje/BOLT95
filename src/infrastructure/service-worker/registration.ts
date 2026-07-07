export interface ServiceWorkerRegistrationStatus {
  readonly supported: boolean;
  readonly registered: boolean;
  readonly scope?: string;
  readonly error?: string;
}

function baseUrl(): string {
  return import.meta.env.BASE_URL || "/";
}

export function serviceWorkerUrl(): string {
  return `${baseUrl()}sw.js`;
}

export function serviceWorkerScope(): string {
  return baseUrl();
}

export async function registerAppShellServiceWorker(): Promise<ServiceWorkerRegistrationStatus> {
  if (!navigator.serviceWorker) {
    return { supported: false, registered: false };
  }

  try {
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl(), {
      scope: serviceWorkerScope(),
      updateViaCache: "none",
    });
    await registration.update();
    return {
      supported: true,
      registered: true,
      scope: registration.scope,
    };
  } catch (error) {
    return {
      supported: true,
      registered: false,
      error: error instanceof Error ? error.message : "Service worker registration failed",
    };
  }
}
