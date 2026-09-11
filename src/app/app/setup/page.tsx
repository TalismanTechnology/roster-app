import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/auth";
import { getNetworkRepository } from "@/lib/network";
import { ActionForm } from "@/components/network/ActionForm";
import { PageHeading } from "@/components/network/primitives";
export default async function Setup() {
 const user = await getCurrentUser(); if (!user) redirect("/sign-in?next=/app/setup"); const membership = await (await getNetworkRepository()).getMembership(); if (membership?.status === "active") redirect("/app");
 return <div className="network-page"><PageHeading eyebrow="WELCOME TO YOUR NEXT CHAPTER" title={membership?.status === "suspended" ? "Your access is paused." : "A community built on respect."}>{membership?.status === "suspended" ? "Your network membership has been suspended following a community review." : "A few ground rules before you join the conversation."}</PageHeading><section className="network-panel network-setup">{membership?.status === "suspended" ? <p>You can still <Link href="/settings">manage your account</Link>.</p> : <><div className="network-community-rules"><h2>Bring your best.</h2><p>Share your own work. Encourage the next person. Keep personal information private. Harassment, impersonation, and unsafe content have no place here.</p></div><ActionForm operation="join" label="Join the community"><label className="network-label">Date of birth<input name="dateOfBirth" type="date" required max={new Date().toISOString().slice(0, 10)} /></label><p className="network-help">You must be 13 or older. Your birthday is private and never appears on your profile.</p><label className="network-checkbox"><input name="participation" type="checkbox" required /><span>I agree to participate respectfully, share content I have the right to share, and follow the community rules.</span></label></ActionForm></>}</section></div>;
}
