"use client";
import { useState } from "react";
import type { Category } from "@/lib/store";
const kinds = ["income", "expense", "transfer"] as const;
const NEW = "\u0000new";
/**
 * A drop-down of the owner's categories, grouped by type. Picking one reports its name and type.
 * With `allowNew`, the last option lets you type a category that is not in the list yet.
 */
export function CategoryPicker({
  value,
  categories,
  onChange,
  allowNew = false,
  disabled = false,
  label,
}: {
  value: string;
  categories: Category[];
  onChange: (name: string, kind?: Category["kind"]) => void;
  allowNew?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [typing, setTyping] = useState(false);
  const known = categories.some((c) => c.name === value);
  if (typing)
    return (
      <span>
        <input
          aria-label={label ?? "Category"}
          disabled={disabled}
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />{" "}
        <button type="button" disabled={disabled} onClick={() => setTyping(false)}>
          Pick from list
        </button>
      </span>
    );
  return (
    <select
      aria-label={label ?? "Category"}
      disabled={disabled}
      value={value}
      onChange={(e) => {
        if (e.target.value === NEW) {
          setTyping(true);
          onChange("");
          return;
        }
        onChange(e.target.value, categories.find((c) => c.name === e.target.value)?.kind);
      }}
    >
      <option value="">Choose a category…</option>
      {value && !known && (
        <option value={value}>
          {value}
          {value.toLowerCase() === "uncategorized" ? " (pick one)" : " (not in your list)"}
        </option>
      )}
      {kinds.map((k) => (
        <optgroup key={k} label={k}>
          {categories
            .filter((c) => c.kind === k)
            .map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
      {allowNew && <option value={NEW}>Other… (type a new one)</option>}
    </select>
  );
}
