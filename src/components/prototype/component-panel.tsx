"use client";

import { useEffect, useReducer, useState } from "react";

import { Check, Field, PanelButton, Section, SelectField } from "@/components/prototype/edit-fields";
import type { EditSession } from "@/components/prototype/use-edit-session";
import type { Part } from "@/lib/edit-part";
import { designSystemOf } from "@/lib/registry/actions";
import type { PropSpec } from "@/lib/registry/design-system";

const input = "h-7 w-full rounded-[var(--r-md)] bg-surface-inset px-1.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]";

/**
 * Edit mode's panel for a design-system component instance on a live version: no style fields, since its look is the
 * design system's, only its props, which are read from the page and, changed, previewed on it.
 */
export function ComponentPanel({ part, slug, session }: { part: Part & { component: NonNullable<Part["component"]> }; slug: string; session: EditSession }) {
  const { name, props, preview } = part.component;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [loaded, setLoaded] = useState<{ name: string; specs: PropSpec[] } | null>(null);
  useEffect(() => {
    let stale = false;
    void designSystemOf(slug, name).then((result) => {
      if (!stale && result.ok) setLoaded({ name, specs: result.value.props });
    });
    return () => {
      stale = true;
    };
  }, [slug, name]);
  const specs = loaded?.name === name ? loaded.specs : [];

  /** The value now: what was changed here, else the page's own. */
  const valueOf = (prop: string) => {
    for (const edit of session.edits) if (edit.kind === "prop" && edit.selector === part.selector && edit.prop === prop) return edit.value;
    return props[prop];
  };
  const set = (prop: string, value: string | number | boolean) => {
    session.setProp(part, prop, value);
    bump();
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex h-12 items-center justify-between gap-3 border-b border-divider px-4">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span aria-hidden className="size-2 rounded-full bg-[var(--component)]" />
          {name}
        </p>
        {session.has(part.selector) ? (
          <PanelButton
            label="Reset this component"
            onClick={() => {
              session.reset(part.selector);
              bump();
            }}
          >
            Reset
          </PanelButton>
        ) : null}
      </div>
      <Section title="Props">
        <p className="text-xs text-foreground-muted">Its look is set by the design system, so only its props can change here.</p>
        {preview ? null : <p className="text-xs text-foreground-muted">This prototype can&apos;t preview props yet.</p>}
        {typeof props.children === "string" ? (
          <Field caption="Text">
            <input
              key={String(valueOf("children"))}
              aria-label="Text"
              defaultValue={String(valueOf("children"))}
              onBlur={(event) => {
                if (event.target.value !== valueOf("children")) set("children", event.target.value);
              }}
              className={input}
            />
          </Field>
        ) : null}
        {specs.map((spec) => {
          const value = valueOf(spec.name);
          if (spec.kind === "options") {
            return (
              <SelectField
                key={spec.name}
                caption={spec.name}
                label={spec.name}
                value={String(value ?? "")}
                options={(spec.options ?? []).map((option) => ({ value: option, label: option }))}
                onChange={(next) => set(spec.name, next)}
              />
            );
          }
          if (spec.kind === "boolean") return <Check key={spec.name} label={spec.name} checked={value === true} onChange={(next) => set(spec.name, next)} />;
          if (spec.name === "children") return null;
          if (spec.kind === "string" || spec.kind === "number") {
            const shown = String(value ?? "");
            return (
              <Field key={spec.name} caption={spec.name}>
                <input
                  key={shown}
                  aria-label={spec.name}
                  defaultValue={shown}
                  inputMode={spec.kind === "number" ? "decimal" : undefined}
                  onBlur={(event) => {
                    const text = event.target.value;
                    if (text === shown) return;
                    if (spec.kind === "string") return set(spec.name, text);
                    const number = parseFloat(text);
                    if (!Number.isNaN(number)) set(spec.name, number);
                  }}
                  className={input}
                />
              </Field>
            );
          }
          return null;
        })}
      </Section>
    </div>
  );
}
