"use client";

import { SearchPanel } from "@/components/shell/search-panel";

/** The Search tab: the same field and results as the floating search, as a page. */
export default function SearchPage() {
  return (
    <div className="w-full px-5 pb-8 pt-2">
      <SearchPanel onPick={() => {}} listClassName="grid-cols-2 sm:grid-cols-4" />
    </div>
  );
}
