import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateListForm } from "@/components/lists/ListForms";
import { Site } from "@/components/shell/Site";
import { Button } from "@/components/ui/Button";
import { Corner, CORNER } from "@/components/ui/marks";
import { getRepository } from "@/lib/data";
import { getCurrentUser } from "@/lib/data/auth";
import { fullDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Lists",
  robots: { index: false, follow: false },
};

/**
 * A recruiter's lists. Owner-only; the repository never returns another
 * person's list. Athletes can reach this too — a captain keeping track of
 * teammates is a fine use — so it isn't gated on account kind.
 */
export default async function ListsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/lists");

  const repo = await getRepository();
  const lists = await repo.listLists(user.id);

  return (
    <Site>
      <main className="mx-auto w-full max-w-4xl" style={{ paddingInline: "var(--pad-x)", paddingBlock: "var(--section-py)" }}>
        <header className="flex flex-col gap-4 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label flex items-center gap-2 text-ink-muted">
              <Corner d={CORNER.tl} /> Lists
            </p>
            <h1 className="font-display text-display-lg mt-4 leading-[0.95] tracking-tight">Athletes you&rsquo;re watching.</h1>
          </div>
          <Button href="/search" variant="outline" arrow>
            Find athletes
          </Button>
        </header>

        {lists.length === 0 ? (
          <p className="border-y border-rule py-8 text-ink-muted">
            No lists yet. Create one below, or save an athlete from search and name the list there.
          </p>
        ) : (
          <ol className="divide-y divide-rule border-y border-rule">
            {lists.map((l) => (
              <li key={l.id} className="relative">
                <div className="flex items-center gap-6 py-4 transition-colors hover:bg-wash">
                  <div className="min-w-0 flex-1">
                    <Link href={`/lists/${l.id}`} className="font-display text-display-sm after:absolute after:inset-0 hover:underline">
                      {l.name}
                    </Link>
                    {l.note && <p className="mt-0.5 truncate text-sm text-ink-muted">{l.note}</p>}
                    <p className="label mt-1 text-ink-subtle">Updated {fullDate(l.updated_at.slice(0, 10))}</p>
                  </div>
                  <p className="font-display text-2xl tracking-tight" data-numeric>
                    {l.member_count}
                    <span className="label ml-1.5 font-normal text-ink-muted">{l.member_count === 1 ? "athlete" : "athletes"}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}

        <section className="mt-10 border-t border-rule pt-8" aria-labelledby="new-list">
          <h2 id="new-list" className="font-display text-display-sm">
            New list
          </h2>
          <div className="panel mt-5" style={{ padding: "clamp(1.25rem, 2.5vw, 2rem)" }}>
            <CreateListForm />
          </div>
        </section>
      </main>
    </Site>
  );
}
