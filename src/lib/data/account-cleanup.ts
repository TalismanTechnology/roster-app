import { DataError } from "./types";

/** Ordered, retryable steps. An incomplete cleanup never reports account deletion. */
export async function deleteAccountInOrder(steps: {
  removeNetwork: () => Promise<void>;
  removeMedia: () => Promise<void>;
  removeAccount: () => Promise<void>;
}): Promise<void> {
  await steps.removeNetwork();
  await steps.removeMedia();
  await steps.removeAccount();
}

type StorageResult<T> = { data: T | null; error: { message: string } | null };
export type AccountStorage = {
  list: (
    prefix: string,
    options: { limit: number; offset: number },
  ) => Promise<StorageResult<{ name: string; id: string | null }[]>>;
  remove: (paths: string[]) => Promise<StorageResult<unknown>>;
};

/** Storage objects are owner-prefixed. Drain page zero as deletions shrink the listing. */
export async function removeOwnedStorage(
  storage: AccountStorage,
  ownerId: string,
  retainedPaths: readonly string[] = [],
): Promise<void> {
  if (!/^[a-f0-9-]{36}$/i.test(ownerId))
    throw new DataError("invalid", "Invalid account media owner.");
  const retained = new Set(retainedPaths);
  if ([...retained].some((path) => !path.startsWith(`${ownerId}/`)))
    throw new DataError("invalid", "Invalid retained media owner.");
  async function drain(prefix: string): Promise<void> {
    let offset = 0;
    for (;;) {
      const { data, error } = await storage.list(prefix, {
        limit: 100,
        offset,
      });
      if (error || !data)
        throw new DataError(
          "unavailable",
          "Could not list account media. Account deletion was stopped.",
        );
      if (data.length === 0) return;
      const files: string[] = [];
      for (const item of data) {
        if (
          !item.name ||
          item.name.includes("/") ||
          item.name === "." ||
          item.name === ".."
        )
          throw new DataError("unavailable", "Unexpected account media path.");
        const path = `${prefix}/${item.name}`;
        if (item.id === null) {
          await drain(path);
          if ([...retained].some((keep) => keep.startsWith(`${path}/`)))
            offset++;
        } else if (retained.has(path)) offset++;
        else files.push(path);
      }
      if (files.length) {
        const result = await storage.remove(files);
        if (result.error)
          throw new DataError(
            "unavailable",
            "Could not remove account media. Account deletion was stopped.",
          );
      }
    }
  }
  await drain(ownerId);
}
