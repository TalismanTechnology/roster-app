"use client";
import {useActionState} from "react";
import {requestRecovery,resetPassword} from "@/lib/actions/recovery";
import {Field,TextInput} from "@/components/ui/fields";
import {SubmitButton} from "@/components/ui/SubmitButton";
export function RecoveryForm({reset=false}:{reset?:boolean}){
 const [state,action]=useActionState(reset?resetPassword:requestRecovery,{message:null,error:null});
 return <form action={action} className="my-6 space-y-5">{reset?<><Field label="New password"><TextInput name="password" type="password" autoComplete="new-password" minLength={8} required/></Field><Field label="Confirm password"><TextInput name="confirm" type="password" autoComplete="new-password" minLength={8} required/></Field></>:<Field label="Email"><TextInput name="email" type="email" autoComplete="email" required/></Field>}{state.error&&<p role="alert">{state.error}</p>}{state.message&&<p role="status">{state.message}</p>}<SubmitButton>{reset?'Set password':'Send recovery link'}</SubmitButton></form>;
}
