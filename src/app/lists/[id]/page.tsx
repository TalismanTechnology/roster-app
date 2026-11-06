import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ListNoteForm, RenameListForm } from "@/components/lists/ListForms";
import { Avatar } from "@/components/record/Avatar";
import { Site } from "@/components/shell/Site";
import { Corner, CORNER, Verified } from "@/components/ui/marks";
import { homePathFor } from "@/lib/accounts";
import { deleteList, moveToList, removeFromList } from "@/lib/actions/lists";
import { idSchema } from "@/lib/actions/schemas";
import { getRepository } from "@/lib/data";
import { getCurrentProfile, getCurrentUser } from "@/lib/data/auth";
import { isRecruiterKind } from "@/lib/data/rules";
import { fullDate, levelLabel } from "@/lib/format";
import { heightLabel, weightLabel } from "@/lib/measurables";
import { signInHref } from "@/lib/safe-next";
import { sportName } from "@/lib/sports";

export const metadata: Metadata = {
  title: "List",
  robots: { index: false, follow: false },
};

/**
 * One list: the athletes on it, each a row like search with the recruiter's
 * note inline (#86), a move to another list and a remove (#89), and the
 * whole list as a CSV.
 */
export default async function ListPage({ params }: PageProps<"/lists/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(signInHref(`/lists/${id}`));
  const viewer = await getCurrentProfile();
  if (!viewer) redirect("/onboarding");
  if (!isRecruiterKind(viewer.account_kind)) redirect(homePathFor(viewer.account_kind));
  if (!idSchema.safeParse(id).success) notFound();

  const repo = await getRepository();
  const [detail, lists] = await Promise.all([repo.getList(user.id, id), repo.listLists(user.id)]);
  if (!detail) notFound();

  const { list, members } = detail;
  const others = lists.filter((l) => l.id !== list.id);

  return (
    <Site>
      <main className="mx-auto w-full max-w-4xl" style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}>
        <header className="flex flex-col gap-4 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label flex items-center gap-2 text-ink-muted">
              <Corner d={CORNER.tl} />
              <Link href="/lists" className="-my-3 inline-flex min-h-10 items-center py-3 hover:text-ink sm:my-0 sm:min-h-0 sm:py-0">
                Lists
              </Link>{" "}
              / {list.name}
            </p>
            <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">{list.name}</h1>
            {list.note && <p className="mt-3 max-w-xl text-ink-muted">{list.note}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {members.length > 0 && (
              // A plain link: the route answers with an attachment.
              <a href={`/lists/${list.id}/export`} download className="btn-outline min-h-10 whitespace-nowrap px-4 text-sm">
                Export CSV
              </a>
            )}
            <form action={deleteList}>
              <input type="hidden" name="list_id" value={list.id} />
              <button type="submit" className="btn-row btn-row-danger whitespace-nowrap">
                Delete list
              </button>
            </form>
          </div>
        </header>

        <details className="group mb-8 border-t border-rule pt-4">
          <summary className="btn-row w-fit list-none text-ink-muted [&::-webkit-details-marker]:hidden group-open:border-ink group-open:bg-wash group-open:text-ink">
            Rename list
          </summary>
          <div className="mt-4 max-w-md">
            <RenameListForm listId={list.id} name={list.name} />
          </div>
        </details>

        {members.length === 0 ? (
          <p className="border-y border-rule py-8 text-ink-muted">
            Nobody here yet.{" "}
            <Link href="/search" className="tap-inline text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
              Find athletes
            </Link>{" "}
            and save them to this list.
          </p>
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {members.map((a) => {
              const line = [a.positions.join(" / "), a.school ?? a.location, a.grad_year ? `Class of ${a.grad_year}` : null].filter(Boolean).join(" · ");
              const meta = [levelLabel(a.level), sportName(a.primary_sport), a.region, heightLabel(a.height_cm), weightLabel(a.weight_kg)]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-4 sm:grid-cols-[auto_1.6fr_auto_auto] sm:gap-x-5 sm:gap-y-2">
                  <Avatar url={a.avatar_url} name={a.display_name} className="size-12" sizes="48px" />
                  <div className="min-w-0">
                    <Link href={`/${a.handle}`} className="-my-2.5 inline-flex min-h-10 max-w-full items-center font-bold hover:underline sm:my-0 sm:min-h-0">
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
                  <form action={removeFromList} className="col-span-full max-sm:order-last sm:col-span-1">
                    <input type="hidden" name="list_id" value={list.id} />
                    <input type="hidden" name="profile_id" value={a.id} />
                    <button type="submit" className="btn-row btn-row-danger">
                      Remove
                    </button>
                  </form>
                  <div className="col-span-full flex flex-wrap items-center gap-x-6 gap-y-3 sm:col-start-2">
                    <div className="min-w-0 flex-1 basis-full sm:basis-72">
                      <ListNoteForm listId={list.id} profileId={a.id} note={a.list_note} athleteName={a.display_name} />
                    </div>
                    {others.length > 0 && (
                      <form action={moveToList} className="flex w-full items-center gap-2 sm:w-auto">
                        <input type="hidden" name="list_id" value={list.id} />
                        <input type="hidden" name="profile_id" value={a.id} />
                        <select
                          name="to_list_id"
                          aria-label={`Move ${a.display_name} to`}
                          className="label min-h-10 min-w-0 flex-1 cursor-pointer rounded-(--radius-input) border border-rule-strong bg-paper-raised/60 px-2 py-1.5 text-ink focus:border-ink focus:outline-none max-sm:min-h-11 sm:flex-none"
                        >
                          {others.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn-row shrink-0">
                          Move
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </Site>
  );
}
