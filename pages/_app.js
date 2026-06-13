import "../styles/globals.css";
import Head from "next/head";
import { useEffect } from "react";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return (
    <>
      <Head>
        <title>Byford Pharmacy Chalkboard</title>
        <link rel="icon" href="/favicon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#12282c" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Chalkboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
