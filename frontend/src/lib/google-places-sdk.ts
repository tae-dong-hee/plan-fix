type GoogleMapsLoader = {
  importLibrary?: (name: string) => Promise<unknown>;
};

type GoogleSdkWindow = Window & {
  google?: { maps?: GoogleMapsLoader };
  __planFixGooglePlacesReady?: () => void;
};

let sdkLoadPromise: Promise<void> | null = null;

/** 기본 Places UI Kit만 로드한다. Google 지도나 일반 Place Photos 요청은 만들지 않는다. */
export function loadGooglePlacesUiKit(apiKey: string): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;

  const sdkWindow = window as GoogleSdkWindow;
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let script: HTMLScriptElement | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (sdkWindow.__planFixGooglePlacesReady === onReady) delete sdkWindow.__planFixGooglePlacesReady;
      if (script) script.onerror = null;
      if (error) {
        script?.remove();
        reject(error);
      } else resolve();
    };
    const onReady = () => {
      const maps = sdkWindow.google?.maps;
      if (!maps?.importLibrary) {
        finish(new Error("Google Places SDK is unavailable"));
        return;
      }
      void maps.importLibrary("places").then(() => {
        finish(window.customElements.get("gmp-place-details-compact")
          ? undefined : new Error("Google Places UI Kit is unavailable"));
      }, () => finish(new Error("Google Places SDK failed to initialize")));
    };
    const timeout = window.setTimeout(() => finish(new Error("Google Places SDK load timed out")), 12_000);

    if (sdkWindow.google?.maps?.importLibrary) {
      onReady();
      return;
    }
    sdkWindow.__planFixGooglePlacesReady = onReady;
    script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey, loading: "async", libraries: "places", v: "weekly",
      language: "ko", region: "KR", callback: "__planFixGooglePlacesReady",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => finish(new Error("Google Places SDK failed to load"));
    document.head.appendChild(script);
  });
  sdkLoadPromise = promise;
  void promise.catch(() => {
    if (sdkLoadPromise === promise) sdkLoadPromise = null;
  });
  return promise;
}
