import Link from "next/link";
import { getRepository, DataError } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { VerifyForm } from "@/components/verify/VerifyForm";

export const metadata = {title:"Verify an entry",robots:{index:false,follow:false}};
export default async function VerifyPage({params}: PageProps<"/verify/[token]">) {
 const {token}=await params; const user=await getCurrentUser();
 const signIn=`/sign-in?next=${encodeURIComponent(`/verify/${token}`)}`;
 if(!user) return <main className="mx-auto max-w-xl p-8"><h1 className="text-3xl font-bold">Coach verification</h1><p className="my-6">Sign in with the coach email invited by the athlete. Your confirmed account identifies who stands behind this claim.</p><Link className="btn-primary" href={signIn}>Sign in to review</Link></main>;
 const repo=await getRepository(); let request;
 try {request=await repo.getVerificationRequest(token);} catch(error){if(!(error instanceof DataError)) throw error; return <main className="mx-auto max-w-xl p-8"><h1 className="text-3xl font-bold">Use the invited coach account</h1><p className="my-6">This account cannot review this request. Confirm your email and use the exact email invited by the athlete.</p><Link href="/settings">Account settings</Link></main>;}
 if(!request) return <main className="p-8">This verification request is unavailable.</main>;
 const profile=await repo.getProfileById(user.id);
 const expired=request.status==='expired'||(request.status==='pending'&&Date.parse(request.expires_at)<=Date.now());
 const eligible=user.emailConfirmed&&profile?.account_kind==='coach'&&request.profile_id!==user.id&&request.recipient_email?.toLowerCase()===user.email.toLowerCase();
 if(!eligible && request.profile_id!==user.id) return <main className="mx-auto max-w-xl p-8"><h1 className="text-3xl font-bold">Use the invited coach account</h1><p className="my-6">Confirm your email and sign in with the exact coach address invited by the athlete.</p></main>;
 return <main className="mx-auto max-w-2xl p-8"><p className="label">Coach verification</p><h1 className="mt-4 text-3xl font-bold">{request.athlete.display_name}: {request.entry.title}</h1><p className="my-6">{request.entry.value_display} · {request.entry.achieved_on}</p><p>{request.entry.detail}</p><div className="mt-8">{expired?<p>This request expired or the athlete edited the claim. Ask for a new link.</p>:request.status!=='pending'?<p>This request was already answered: {request.status}.</p>:!eligible?<p>Only the invited coach’s confirmed account can respond. You cannot verify your own record.</p>:<VerifyForm token={token} coachName={profile.display_name} coachRole="Coach"/>}</div></main>;
}
