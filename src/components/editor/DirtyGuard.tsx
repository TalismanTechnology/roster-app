"use client";

import { useEffect } from "react";

/**
 * Unsaved-changes guard for the editor.
 *
 * Each EditorForm reports whether it holds edits the server hasn't seen;
 * this keeps the set and, while it is non-empty, asks before a section link
 * or a tab close throws those edits away. The section lives in the URL, so
 * "switching sections" is a plain link click — intercepted here in the
 * capture phase, before next/link's own handler sees it.
 */

const dirty = new Set<string>();

/** Called by a form: `true` after an edit, `false` once saved or unmounted. */
export function setFormDirty(id: string, isDirty: boolean): void {
  if (isDirty) dirty.add(id);
  else dirty.delete(id);
}

const MESSAGE = "You have unsaved changes in this section. Leave without saving?";

/** True when it's fine to go: nothing unsaved, or the athlete said so. */
function confirmLeave(): boolean {
  if (dirty.size === 0) return true;
  if (!window.confirm(MESSAGE)) return false;
  // They chose to discard; the next section shouldn't ask again.
  dirty.clear();
  return true;
}

export function DirtyGuard() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (dirty.size === 0 || event.defaultPrevented || event.button !== 0) return;
      // A new tab or window keeps this one, edits and all.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      // Same page, same query — an in-page jump, nothing is lost.
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (confirmLeave()) return;
      event.preventDefault();
      event.stopPropagation();
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (dirty.size === 0) return;
      event.preventDefault();
      // Older engines still read the legacy return value.
      event.returnValue = "";
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  return null;
}
