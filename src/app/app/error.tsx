"use client";
import Link from "next/link";
export default function NetworkError({ reset }: { reset: () => void }) {
  return <div className="network-page"><div className="network-empty" role="alert"><h1 style={{ fontSize: 26, fontWeight: 650, marginBottom: 12 }}>We couldn’t load this page.</h1><p>Your saved work is still there. Check your connection and try again.</p><div className="network-row" style={{ justifyContent: "center" }}><button className="network-button" onClick={reset}>Try again</button><Link className="network-button-quiet" href="/app">Back to home</Link></div></div></div>;
}
