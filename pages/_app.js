import "../styles/globals.css";
import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Byford Pharmacy Chalkboard</title>
    <link rel="icon" href="/favicon.png" />

      </Head>
      <Component {...pageProps} />
    </>
  );
}
