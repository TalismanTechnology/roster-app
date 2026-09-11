import assert from "node:assert/strict";
import { test } from "node:test";
import { deleteAccountInOrder, removeOwnedStorage, type AccountStorage } from "../account-cleanup";

const owner = "11111111-1111-4111-8111-111111111111";
test("account deletion stops before auth removal when media cleanup fails", async () => {
  const calls: string[] = [];
  await assert.rejects(deleteAccountInOrder({
    removeNetwork: async () => { calls.push("network"); },
    removeMedia: async () => { calls.push("media"); throw new Error("storage unavailable"); },
    removeAccount: async () => { calls.push("auth"); },
  }));
  assert.deepEqual(calls, ["network", "media"]);
  await deleteAccountInOrder({
    removeNetwork: async () => { calls.push("network"); },
    removeMedia: async () => { calls.push("media"); },
    removeAccount: async () => { calls.push("auth"); },
  });
  assert.deepEqual(calls.slice(-3), ["network", "media", "auth"]);
});
test("storage cleanup drains multiple batches and preserves other owners", async () => {
  const objects = new Set([...Array.from({ length: 225 }, (_, n) => `${owner}/${n}.webp`), "other/keep.webp"]);
  let removals = 0;
  const storage: AccountStorage = {
    list: async (prefix, { limit, offset }) => {
      assert.equal(offset, 0);
      return { data: [...objects].filter(p => p.startsWith(`${prefix}/`)).slice(0, limit).map(p => ({ id: p, name: p.slice(prefix.length + 1) })), error: null };
    },
    remove: async paths => { removals++; for (const path of paths) objects.delete(path); return { data: [], error: null }; },
  };
  await removeOwnedStorage(storage, owner);
  assert.equal(removals, 3);
  assert.deepEqual([...objects], ["other/keep.webp"]);
});
test("storage errors propagate and invalid owners cannot broaden deletion", async () => {
  const storage: AccountStorage = { list: async () => ({ data: null, error: { message: "offline" } }), remove: async () => { throw new Error("must not remove"); } };
  await assert.rejects(removeOwnedStorage(storage, owner), /Could not list/);
  await assert.rejects(removeOwnedStorage(storage, "../other"), /Invalid account/);
});
test("storage cleanup preserves retained evidence across pagination without looping",async()=>{
 const objects=new Set([...Array.from({length:225},(_,n)=>`${owner}/${n}.webp`)]);const retained=[`${owner}/0.webp`,`${owner}/104.webp`];
 const storage:AccountStorage={list:async(prefix,{limit,offset})=>({data:[...objects].filter(p=>p.startsWith(`${prefix}/`)).slice(offset,offset+limit).map(p=>({id:p,name:p.slice(prefix.length+1)})),error:null}),remove:async paths=>{for(const p of paths)objects.delete(p);return {data:[],error:null};}};
 await removeOwnedStorage(storage,owner,retained);assert.deepEqual([...objects].sort(),retained.sort());
});
