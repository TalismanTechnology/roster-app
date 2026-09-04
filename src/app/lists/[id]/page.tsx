import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
export default async function ListPage({ params }: PageProps<"/lists/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/lists");

  const repo = await getRepository();
  const detail = await repo.getList(user.id, id);
  if (!detail) notFound();

  const { list, members } = detail;

  return (
    <Site>
      <main className="mx-auto w-full max-w-4xl" style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}>
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
          <form action={deleteList}>
            <input type="hidden" name="list_id" value={list.id} />
            <button type="submit" className="label cursor-pointer text-ink-subtle underline decoration-transparent underline-offset-4 transition-colors hover:text-disputed hover:decoration-disputed">
              Delete list
            </button>
          </form>
        </header>

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
                  <form action={removeFromList} className="col-span-full sm:col-span-1">
                    <input type="hidden" name="list_id" value={list.id} />
                    <input type="hidden" name="profile_id" value={a.id} />
                    <button type="submit" className="label cursor-pointer text-ink-subtle underline decoration-transparent underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">
                      Remove
                    </button>
                  </form>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </Site>
  );
}
