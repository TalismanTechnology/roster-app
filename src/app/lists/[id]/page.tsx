import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RowAction } from "@/components/editor/EditorForm";
import { EditListForm, MemberNoteForm } from "@/components/lists/ListForms";
import { Site } from "@/components/shell/Site";
import { Corner, CORNER, Verified } from "@/components/ui/marks";
import { deleteList, removeFromList } from "@/lib/actions/lists";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { fullDate, levelLabel } from "@/lib/format";
import { sportName } from "@/lib/sports";

export const metadata: Metadata = {
  title: "List",
  robots: { index: false, follow: false },
};

/** One list: the athletes on it, each a row like search, with a remove. */
export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/lists");

  const repo = await getRepository();
  const detail = await repo.getList(user.id, id);
  if (!detail) notFound();

  const { list, members } = detail;

  return (
    <Site>
      <main className="mx-auto w-full max-w-4xl py-6 pb-16">
        <header className="flex flex-col gap-4 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label flex items-center gap-2 text-ink-muted">
              <Corner d={CORNER.tl} />
              <Link href="/lists" className="hover:text-ink">
                Lists
              </Link>{" "}
              / {list.name}
            </p>
            <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">{list.name}</h1>
            {list.note && <p className="mt-3 max-w-xl text-ink-muted">{list.note}</p>}
          </div>
          <RowAction action={deleteList} fields={{ list_id: list.id }} label="Delete list" confirm={`Delete “${list.name}” and its private notes? Athletes’ profiles will not be deleted.`} />
        </header>

        <details className="mb-8 rounded-xl border border-rule bg-paper-raised p-5"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Edit list name and note</summary><div className="mt-4"><EditListForm id={list.id} name={list.name} note={list.note} /></div></details>
        <div className="mb-4 flex items-center justify-between"><p className="text-sm text-ink-muted">{members.length} visible {members.length === 1 ? "athlete" : "athletes"}</p><Link className="btn-outline min-h-11 text-sm" href="/search">Add athletes ↗</Link></div>

        {members.length === 0 ? (
          <p className="border-y border-rule py-8 text-ink-muted">
            Nobody here yet.{" "}
            <Link href="/search" className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
              Find athletes
            </Link>{" "}
            and save them to this list.
          </p>
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {members.map((a) => {
              const line = [a.positions.join(" / "), a.school ?? a.location, a.grad_year ? `Class of ${a.grad_year}` : null].filter(Boolean).join(" · ");
              const meta = [levelLabel(a.level), sportName(a.primary_sport), a.region].filter(Boolean).join(" · ");
              return (
                <li key={a.id} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 py-4 sm:grid-cols-[1.6fr_auto_auto]">
                  <div className="min-w-0">
                    <Link href={`/${a.handle}`} className="font-bold hover:underline">
                      {a.display_name}
                    </Link>
                    <p className="label mt-0.5 truncate text-ink-muted">{line}</p>
                    <p className="label mt-0.5 truncate text-ink-subtle">
                      {meta} · added {fullDate(a.added_at.slice(0, 10))}
                    </p>
                  </div>
                  <p className="label flex items-center gap-1.5 whitespace-nowrap" data-numeric>
                    <Verified className={a.verified_count > 0 ? "" : "opacity-30"} /> {a.verified_count} verified
                  </p>
                  <RowAction action={removeFromList} fields={{ list_id: list.id, profile_id: a.id }} label="Remove" confirm={`Remove ${a.display_name} from this list and delete your note?`} />
                  <details className="col-span-full rounded-lg border border-rule bg-paper-raised p-4"><summary className="min-h-11 cursor-pointer text-sm text-ink-muted">{a.list_note ? "Edit your private note" : "Add private note"}</summary>{a.list_note && <p className="mb-4 whitespace-pre-wrap text-sm text-ink-muted">{a.list_note}</p>}<MemberNoteForm listId={list.id} profileId={a.id} note={a.list_note} /></details>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </Site>
  );
}
