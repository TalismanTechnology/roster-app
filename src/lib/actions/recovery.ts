"use server";
import {redirect} from "next/navigation";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {getCurrentUser} from "@/lib/data/auth";
import {isLocalMode} from "@/lib/data";
import {authCallbackUrl} from "@/lib/auth-return";
export type RecoveryState={message:string|null;error:string|null};
export async function requestRecovery(_state:RecoveryState,form:FormData):Promise<RecoveryState>{
 const email=z.string().email().safeParse(form.get('email'));
 if(!email.success)return {message:null,error:'Enter a valid email address.'};
 if(isLocalMode())return {message:null,error:'Email recovery is available when Supabase is configured.'};
 const client=await createClient(); const {error}=await client.auth.resetPasswordForEmail(email.data,{redirectTo:authCallbackUrl('/auth/reset-password')});
 if(error)return {message:null,error:'Could not request recovery. Try again.'};
 return {message:'If that account exists, check your email for a recovery link.',error:null};
}
export async function resetPassword(_state:RecoveryState,form:FormData):Promise<RecoveryState>{
 const user=await getCurrentUser();if(!user)return {message:null,error:'Open a fresh recovery link from your email.'};
 const password=z.string().min(8).safeParse(form.get('password'));
 if(!password.success || password.data!==form.get('confirm'))return {message:null,error:'Use at least 8 characters and matching passwords.'};
 const client=await createClient();const {error}=await client.auth.updateUser({password:password.data});
 if(error)return {message:null,error:'Could not reset your password. Open a fresh recovery link.'};
 redirect('/app');
}
