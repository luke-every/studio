"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { editable, hideWords, type Part } from "@/lib/edit-part";

import { PinTarget } from "./comment-parts";
import { hideWordsIn, pageOf } from "./frame-page";

// The fonts already given to this page, so each file is added once.
const givenFonts = new Set<string>();
import { useGlass } from "./use-glass";

/**
 * A part's words, typed over where they are: the studio's own text box laid on the element, at the size the words are
 * drawn at there, so it works the same on a page the studio can't put a cursor into (a canvas screen, which is inert;
 * a live version, on another address). Enter or clicking away finishes; Escape leaves the words as they were.
 * `onDone` is given the new words, or null when nothing changed.
 */
export function TextInPlace({
  part,
  frame,
  scope,
  left,
  top,
  width,
  height,
  scale,
  onLive,
  onDone,
}: {
  part: Part;
  /** The frame the words are in. While they are typed over there, the page's own copy of them is hidden, so there aren't two. On a page at another address (a dev server) it is asked to. */
  frame?: HTMLIFrameElement | null;
  /** Or, on a static copy of the page, the copy (see `copyDocument`): its words are hidden the same way. */
  scope?: Document | null;
  left: number;
  top: number;
  width: number;
  height: number;
  /** How big the page is drawn here: its own pixels times this. */
  scale: number;
  /** Told the words as they are typed (and the original again if Escape puts them back), so every frame the part is in follows. */
  onLive?: (text: string) => void;
  onDone: (text: string | null) => void;
}) {
  // One piece of a heading with other elements among its words is covered by the box itself: hiding the element would hide the rest.
  useEffect(() => (part.node !== undefined ? undefined : frame ? hideWordsIn(frame, part.selector) : scope ? hideWords(scope, part.selector) : undefined), [frame, scope, part.selector, part.node]);
  // The words are drawn here, in the studio's page, so the prototype's fonts are given to it: the files themselves, read from the page.
  useEffect(() => {
    if (!frame) return;
    void pageOf(frame).fonts(part.css).then((faces) => {
      for (const face of faces) {
        const key = `${face.family}|${face.weight}|${face.style}|${face.unicodeRange ?? ""}|${face.data.byteLength}`;
        if (givenFonts.has(key)) continue;
        givenFonts.add(key);
        const font = new FontFace(face.family, face.data, { weight: face.weight, style: face.style, unicodeRange: face.unicodeRange });
        void font.load().then(() => document.fonts.add(font), () => givenFonts.delete(key));
      }
    });
  }, [frame, part.css]);
  const finished = useRef(false);
  const changed = useRef(false);
  const finish = (text: string | null) => {
    if (finished.current) return;
    finished.current = true;
    if (text === null && changed.current) onLive?.(part.text ?? "");
    onDone(text !== null && text !== part.text ? text : null);
  };
  const px = (property: string) => (parseFloat(part.css[property]) ? `${parseFloat(part.css[property]) * scale}px` : undefined);

  return (
    <textarea
      ref={(box) => {
        // All the words are selected as it opens, so typing replaces them.
        if (box && !box.dataset.opened) {
          box.dataset.opened = "true";
          box.focus();
          box.select();
        }
      }}
      aria-label="Text"
      defaultValue={part.text ?? ""}
      onChange={(event) => {
        changed.current = true;
        onLive?.(event.target.value);
      }}
      // Nothing typed or pressed here is the canvas's, the prototype's or a shortcut.
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") finish(null);
        else if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          finish(event.currentTarget.value);
        }
      }}
      onBlur={(event) => finish(event.target.value)}
      style={{
        left,
        top,
        width,
        minHeight: height,
        fontSize: px("font-size"),
        lineHeight: px("line-height"),
        letterSpacing: px("letter-spacing"),
        fontFamily: part.css["font-family"],
        fontWeight: part.css["font-weight"],
        color: part.css.color,
        backgroundColor: part.backdrop,
        textTransform: part.css["text-transform"] as "none",
        fontStyle: part.css["font-style"],
        textAlign: part.css["text-align"] as "left" | "center" | "right",
        paddingLeft: px("padding-left"),
        paddingRight: px("padding-right"),
        paddingTop: px("padding-top"),
        paddingBottom: px("padding-bottom"),
      }}
      className="pointer-events-auto absolute selection:bg-[var(--selection-highlight)] resize-none overflow-hidden outline-none ring-2 ring-[var(--selection)] [field-sizing:content]"
    />
  );
}

/**
 * Edit mode over a prototype the studio can't reach into: a live version, on its own dev server. A page the studio
 * serves is picked from inside its own document (`inspectDocument`); this one is asked instead, through a sheet of
 * glass of the studio's own, as comments are. The part under the pointer is outlined, a click picks it, a double-click
 * on words types over them, and the wheel still scrolls the page.
 */
export function EditLayer({
  frame,
  scale,
  part,
  onPick,
  onText,
}: {
  frame: RefObject<HTMLIFrameElement | null>;
  scale: number;
  /** The part picked, as its page last described it. */
  part: Part | null;
  onPick: (frame: HTMLIFrameElement, part: Part | null) => void;
  onText: (part: Part, text: string) => void;
}) {
  const { target, point, glass } = useGlass(frame, scale, true);
  const [typing, setTyping] = useState<Part | null>(null);

  const pick = async (event: React.MouseEvent<HTMLDivElement>, type: boolean) => {
    const element = frame.current;
    if (!element) return;
    const box = event.currentTarget.getBoundingClientRect();
    const found = await pageOf(element).partAt((event.clientX - box.left) / scale, (event.clientY - box.top) / scale);
    if (type) {
      const words = editable(found, (event.clientX - box.left) / scale, (event.clientY - box.top) / scale);
      if (words) setTyping(words);
      return;
    }
    onPick(element, found);
  };
  // Where the words are now, if the part being typed over is the one picked (which is followed as the page moves).
  const typed = typing ? (part?.selector === typing.selector && typing.node === undefined ? part : typing) : null;

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: "var(--z-raised)" }}>
      <div
        ref={glass}
        // A click on the glass never reaches the tile around the prototype, which would let go of the part again.
        onClick={(event) => (event.stopPropagation(), void pick(event, false))}
        onDoubleClick={(event) => void pick(event, true)}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          point(event.clientX - box.left, event.clientY - box.top);
        }}
        onPointerLeave={() => point(null)}
        className="pointer-events-auto absolute inset-0"
      />
      {part ? <PinTarget left={part.box.left * scale} top={part.box.top * scale} width={part.box.width * scale} height={part.box.height * scale} component={!!(part.component || part.inside)} /> : null}
      {target ? <PinTarget left={target.left * scale} top={target.top * scale} width={target.width * scale} height={target.height * scale} component={target.component} /> : null}
      {typing && typed ? (
        <TextInPlace
          part={typing}
          frame={frame.current}
          left={typed.box.left * scale}
          top={typed.box.top * scale}
          width={typed.box.width * scale}
          height={typed.box.height * scale}
          scale={scale}
          onLive={(text) => onText(typing, text)}
          onDone={(text) => {
            setTyping(null);
            if (text !== null) onText(typing, text);
          }}
        />
      ) : null}
    </div>
  );
}
