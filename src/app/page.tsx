import type { Metadata } from "next";

import { FinalCta } from "@/components/landing/FinalCta";
import { ForCoaches } from "@/components/landing/ForCoaches";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ResumeDemo } from "@/components/landing/ResumeDemo";
import { Sports } from "@/components/landing/Sports";
import { Ticker } from "@/components/landing/Ticker";
import { Visibility } from "@/components/landing/Visibility";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { currentHeaderUser } from "@/components/shell/Site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * The landing. One page for everyone: a signed-in athlete sees the same
 * story with the header pointing at their own resume. The demo record and
 * the coach search inside it are live reads from the repository, so the
 * page never promises a rendering the app can't produce.
 */
export default async function HomePage() {
  const user = await currentHeaderUser();

  return (
    <>
      <SiteHeader user={user} variant="landing" />
      <main>
        <Hero />
        <Ticker />
        <ResumeDemo />
        <HowItWorks />
        <Sports />
        <ForCoaches />
        <Visibility />
        <FinalCta signedIn={user !== null} />
      </main>
      <SiteFooter />
    </>
  );
}
