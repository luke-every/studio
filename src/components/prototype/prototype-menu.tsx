"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MotionPopover } from "@/components/motion";
import { ArchiveIcon, EllipsisIcon, GithubIcon, PencilIcon, SendIcon, ShuffleIcon, SlidersIcon, UndoIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { DialogForm, fieldClass } from "@/components/ui/dialog-form";
import { useStudio } from "@/lib/data/studio-store";
import type { Prototype } from "@/lib/registry/types";

import { RemixDialog } from "./remix-dialog";

type Dialog = "rename" | "move" | "remix" | "archive";

const item =
  "flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-1.5 text-left text-nav hover:bg-surface-hover";

/** The ellipsis beside a prototype's title: remix the version on screen, rename it, move it, open its files on GitHub, archive it. Edit and Remix, the two ways of making something from it, sit together. */
export function PrototypeMenu({ prototype, version, githubUrl, onEdit }: { prototype: Prototype; version: string; githubUrl?: string; onEdit?: () => void }) {
  const { isSaving, updatePrototype } = useStudio();
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
        className="w-56"
        trigger={
          <IconButton
            label="More"
            loading={isSaving("prototype")}
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
          {prototype.archived ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                updatePrototype({ slug: prototype.slug, archived: false }, ["prototype"], "Restored");
              }}
              className={`${item} text-foreground`}
            >
              <UndoIcon />
              Unarchive
            </button>
          ) : (
            <>
              {onEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onEdit();
                  }}
                  className={`${item} text-foreground max-sm:hidden`}
                >
                  <SlidersIcon />
                  Edit design
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={() => choose("remix")} className={`${item} text-foreground`}>
                <ShuffleIcon />
                Remix
              </button>
              <div role="separator" className="my-1 h-px bg-border" />
              <button type="button" role="menuitem" onClick={() => choose("rename")} className={`${item} text-foreground`}>
                <PencilIcon />
                Rename
              </button>
              <button type="button" role="menuitem" onClick={() => choose("move")} className={`${item} text-foreground`}>
                <SendIcon />
                Move to…
              </button>
              {githubUrl ? (
                <a role="menuitem" href={githubUrl} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className={`${item} text-foreground`}>
                  <GithubIcon />
                  Open in GitHub
                </a>
              ) : null}
              <div role="separator" className="my-1 h-px bg-border" />
              <button type="button" role="menuitem" onClick={() => choose("archive")} className={`${item} text-destructive`}>
                <ArchiveIcon />
                Archive
              </button>
            </>
          )}
        </div>
      </MotionPopover>

      <RemixDialog slug={prototype.slug} version={version} name={prototype.name} open={dialog === "remix"} onClose={close} />
      {dialog === "rename" ? <RenameDialog prototype={prototype} onClose={close} /> : null}
      {dialog === "move" ? <MoveDialog prototype={prototype} onClose={close} /> : null}
            {dialog === "archive" ? <ArchiveDialog prototype={prototype} onClose={close} /> : null}
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
      disabled={!name.trim() || name.trim() === prototype.name}
      onClose={onClose}
      onSubmit={() => updatePrototype({ slug: prototype.slug, name }, ["prototype"], "Renamed")}
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
      disabled={unchanged}
      onClose={onClose}
      onSubmit={() =>
        updatePrototype({ slug: prototype.slug, teamSlug, projectSlug: projectSlug || null }, ["prototype"], "Moved")
      }
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

function ArchiveDialog({ prototype, onClose }: { prototype: Prototype; onClose: () => void }) {
  const router = useRouter();
  const { updatePrototype } = useStudio();

  return (
    <DialogForm
      title={`Archive “${prototype.name}”?`}
      description="It moves out of sight for everyone. Its versions and files stay safe, and you can bring it back any time from Archive in the Home menu."
      submitLabel="Archive"
      destructive
      onClose={onClose}
      onSubmit={() => {
        // Straight home: there is nothing left here to wait for.
        router.push("/");
        updatePrototype({ slug: prototype.slug, archived: true }, ["prototype"], "Archived");
      }}
    />
  );
}
