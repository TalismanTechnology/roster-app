"use client";
import { createList, updateList, updateListMemberNote } from "@/lib/actions/lists";
import { EditorForm } from "@/components/editor/EditorForm";
import { Field, TextInput, TextArea } from "@/components/ui/fields";
export function CreateListForm() {
 return <EditorForm action={createList} submitLabel="Create list"><div className="grid gap-5 sm:grid-cols-2"><Field label="Name" hint="Class of 2027 receivers, spring visits"><TextInput name="name" required minLength={2} maxLength={60} /></Field><Field label="Note"><TextInput name="note" maxLength={300} placeholder="Optional" /></Field></div></EditorForm>;
}
export function EditListForm({ id, name, note }: { id: string; name: string; note: string | null }) {
 return <EditorForm action={updateList} submitLabel="Save list" compact><input type="hidden" name="list_id" value={id} /><Field label="List name"><TextInput name="name" required minLength={2} maxLength={60} defaultValue={name} /></Field><Field label="List note"><TextArea name="note" maxLength={300} rows={2} defaultValue={note ?? ""} /></Field></EditorForm>;
}
export function MemberNoteForm({ listId, profileId, note }: { listId: string; profileId: string; note: string | null }) {
 return <EditorForm action={updateListMemberNote} submitLabel="Save private note" compact><input type="hidden" name="list_id" value={listId} /><input type="hidden" name="profile_id" value={profileId} /><Field label="Your private scouting note" hint="Only you can see this note."><TextArea name="note" maxLength={300} rows={2} defaultValue={note ?? ""} /></Field></EditorForm>;
}
