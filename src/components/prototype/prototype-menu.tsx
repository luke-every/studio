"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { EllipsisIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { DialogForm, fieldClass } from "@/components/ui/dialog-form";
import { useStudio } from "@/lib/data/studio-store";
import type { Prototype } from "@/lib/registry/types";

import { LinksDialog } from "./prototype-links";

type Dialog = "rename" | "move" | "links" | "delete";

const item =
  "flex w-full items-center rounded-[var(--r-sm)] px-2.5 py-1.5 text-left text-nav hover:bg-surface-hover";

/** The ellipsis beside a prototype's title: rename it, move it, edit its links, delete it. */
export function PrototypeMenu({ prototype }: { prototype: Prototype }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const choose = (next: Dialog) => {
    setOpen(false);
    setDialog(next);
  };
  const close = () => setDialog(null);

  return (
    <>
      <MotionPopover
        open={open}
        onClose={() => setOpen(false)}
        className="w-48"
        trigger={
          <IconButton
            label="More"
            variant="ghost"
            tooltipAlign="end"
            onClick={() => setOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <EllipsisIcon className="size-5" />
          </IconButton>
        }
      >
        <div role="menu" className="flex flex-col">
          <button type="button" role="menuitem" onClick={() => choose("rename")} className={`${item} text-foreground`}>
            Rename
          </button>
          <button type="button" role="menuitem" onClick={() => choose("move")} className={`${item} text-foreground`}>
            Move to…
          </button>
          <button type="button" role="menuitem" onClick={() => choose("links")} className={`${item} text-foreground`}>
            Edit links
          </button>
          <button type="button" role="menuitem" onClick={() => choose("delete")} className={`${item} text-destructive`}>
            Delete
          </button>
        </div>
      </MotionPopover>

      {dialog === "rename" ? <RenameDialog prototype={prototype} onClose={close} /> : null}
      {dialog === "move" ? <MoveDialog prototype={prototype} onClose={close} /> : null}
      {dialog === "links" ? <LinksDialog prototype={prototype} kinds={["figma", "notion"]} onClose={close} /> : null}
      {dialog === "delete" ? <DeleteDialog prototype={prototype} onClose={close} /> : null}
    </>
  );
}

function RenameDialog({ prototype, onClose }: { prototype: Prototype; onClose: () => void }) {
  const { updatePrototype } = useStudio();
  const [name, setName] = useState(prototype.name);

  return (
    <DialogForm
      title="Rename"
      description="Only the name changes. Its address and its versions stay as they are."
      submitLabel="Rename"
      busyLabel="Renaming…"
      disabled={!name.trim() || name.trim() === prototype.name}
      onClose={onClose}
      onSubmit={() => updatePrototype({ slug: prototype.slug, name })}
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Name"
        autoFocus
        className={fieldClass}
      />
    </DialogForm>
  );
}

function MoveDialog({ prototype, onClose }: { prototype: Prototype; onClose: () => void }) {
  const { teams, projects, updatePrototype } = useStudio();
  const [teamSlug, setTeamSlug] = useState(prototype.teamSlug);
  const [projectSlug, setProjectSlug] = useState(prototype.projectSlug ?? "");

  const teamProjects = projects.filter((project) => project.teamSlug === teamSlug);
  const unchanged = teamSlug === prototype.teamSlug && projectSlug === (prototype.projectSlug ?? "");

  return (
    <DialogForm
      title="Move"
      description="Choose a team, and a project inside it if you like."
      submitLabel="Move"
      busyLabel="Moving…"
      disabled={unchanged}
      onClose={onClose}
      onSubmit={() => updatePrototype({ slug: prototype.slug, teamSlug, projectSlug: projectSlug || null })}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Team</span>
        <select
          value={teamSlug}
          onChange={(event) => {
            setTeamSlug(event.target.value);
            setProjectSlug("");
          }}
          className={fieldClass}
        >
          {teams.map((team) => (
            <option key={team.slug} value={team.slug}>
              {team.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow">Project</span>
        <select value={projectSlug} onChange={(event) => setProjectSlug(event.target.value)} className={fieldClass}>
          <option value="">No project</option>
          {teamProjects.map((project) => (
            <option key={project.slug} value={project.slug}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
    </DialogForm>
  );
}

function DeleteDialog({ prototype, onClose }: { prototype: Prototype; onClose: () => void }) {
  const router = useRouter();
  const { updatePrototype } = useStudio();

  return (
    <DialogForm
      title={`Delete “${prototype.name}”?`}
      description="It disappears from the studio for everyone. Its versions and files stay safe in the content repository, and pushing to it again brings it back."
      submitLabel="Delete"
      busyLabel="Deleting…"
      destructive
      onClose={onClose}
      onSubmit={async () => {
        const ok = await updatePrototype({ slug: prototype.slug, archived: true });
        if (ok) router.push("/");
        return ok;
      }}
    />
  );
}
