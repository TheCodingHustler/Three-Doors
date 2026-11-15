let bootstrap;
export function loadSdk(key) {
  if (!bootstrap) {
    bootstrap = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://static.matterport.com/showcase-sdk/bootstrap/3.1.0-0-g1cd7e0997a/sdk.js?applicationKey=${encodeURIComponent(key)}`;
      script.onload = () => window.MP_SDK ? resolve(window.MP_SDK) : reject(new Error("SDK unavailable"));
      script.onerror = () => { script.remove(); reject(new Error("SDK download failed")); };
      document.head.appendChild(script);
    }).catch((error) => { bootstrap = null; throw error; });
  }
  return bootstrap;
}
