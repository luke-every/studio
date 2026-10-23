/*
 * Commenting from a phone.
 *
 * Added to a prototype's page by the studio only when the address carries a
 * review token (the QR code on the prototype's page in the studio). Press and
 * hold anywhere to leave a comment there. The comment is posted to the studio
 * with the token, which is good for one version and nothing else.
 *
 * Plain JavaScript in a shadow root, because it runs inside someone else's
 * page: no framework, and nothing it draws takes styles from, or gives them
 * to, the prototype. The values here are literal for the same reason; the
 * studio's tokens don't exist in this page.
 */
(function () {
  var script = document.currentScript;
  if (!script || !script.dataset.token || window.__studioReview || !window.__studioAnchor) return;
  window.__studioReview = true;

  var slug = script.dataset.slug;
  var version = script.dataset.version;
  var token = script.dataset.token;
  var HOLD_MS = 450;
  var MOVE_TOLERANCE = 10;
  var NAME_KEY = "studio.review.name";

  // --- Which setup of the prototype this is: the controls' parameters, as the studio writes them. ---
  var controlParams = fetch("/p/" + slug + "/" + version + "/studio.json")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (json) {
      return json && json.controls
        ? json.controls.map(function (c) { return c.param || c.id; })
        : null;
    })
    .catch(function () { return null; });

  function setupOf(names) {
    var now = new URLSearchParams(location.search);
    var kept = new URLSearchParams();
    if (names) {
      names.forEach(function (name) { if (now.has(name)) kept.set(name, now.get(name)); });
    } else {
      now.forEach(function (value, key) { if (key !== "review" && key !== "preview") kept.set(key, value); });
    }
    var text = kept.toString();
    var made = now.get("studio-variant");
    return made ? (text ? text + "&" : "") + "studio-variant=" + made : text;
  }

  // --- Where a comment goes: the studio's own description of a place (src/lib/anchor.ts, built into
  // studio-anchor.js, which the studio adds just before this), so its pin lands on the same element. ---
  var place = window.__studioAnchor;
  var STUDIO_KEYS = ["review", "preview", "studio", "studio-variant"];
  // Which keys of the address are the studio's rather than the prototype's own; all of them while the controls are unknown.
  function studioOwns(names) {
    return function (key) { return STUDIO_KEYS.indexOf(key) !== -1 || !names || names.indexOf(key) !== -1; };
  }

  // --- Who is commenting. The studio's own choice is the default; this page keeps its own so it never disturbs it. ---
  function people() {
    try {
      var stored = JSON.parse(localStorage.getItem("studio.people") || "null");
      if (Array.isArray(stored)) {
        var names = stored.map(function (p) { return p && p.name; }).filter(Boolean);
        if (names.length) return names;
      }
    } catch { /* blocked or malformed: the seeded names */ }
    return ["Luke", "Victor"];
  }
  function savedName() {
    try {
      var own = localStorage.getItem(NAME_KEY);
      if (own !== null) return own;
      var studio = localStorage.getItem("studio.user");
      return studio === null ? null : studio;
    } catch { return null; }
  }
  // The face this person chose in the studio on this device, sent only so a notification can show it.
  function avatarOf(name) {
    try {
      var stored = JSON.parse(localStorage.getItem("studio.people") || "null");
      var me = Array.isArray(stored) && stored.find(function (p) { return p && p.name === name; });
      return me && Number.isInteger(me.avatar) ? me.avatar : undefined;
    } catch { return undefined; }
  }
  // A face on a colour, as the studio draws it: the one chosen on this device, else worked out from the name.
  var COLORS = ["#ffb9b9", "#e3dfd7", "#d9e1d5", "#d0efe8", "#d1bedc"];
  function faceOf(name) {
    if (!name) return null;
    try {
      var stored = JSON.parse(localStorage.getItem("studio.people") || "null");
      var me = Array.isArray(stored) && stored.find(function (p) { return p && p.name === name; });
      if (me && Number.isInteger(me.avatar) && Number.isInteger(me.color)) return me;
    } catch { /* the face worked out from the name */ }
    var h = 7;
    name.toLowerCase().split("").forEach(function (char) { h = (h * 31 + char.charCodeAt(0)) % 360007; });
    return { avatar: h % 58, color: Math.floor(h / 58) % COLORS.length };
  }
  function saveName(name) {
    try { localStorage.setItem(NAME_KEY, name); } catch { /* lasts until the page is left */ }
  }

  // --- What is drawn: a host that takes no touches, and the sheet inside it that does. ---
  var host = document.createElement("div");
  host.setAttribute("data-studio-review", "");
  host.style.cssText =
    "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;" +
    "font:15px/1.4 -apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;color:#121211;";
  var shadow = host.attachShadow({ mode: "open" });
  var css =
    ":host{font:15px/1.4 -apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif;color:#121211}" +
    "*{box-sizing:border-box}" +
    ".ring{position:fixed;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;border:2px solid #121211;background:rgba(18,18,17,.08);opacity:0;transform:scale(.4);pointer-events:none}" +
    ".ring.on{animation:grow " + (HOLD_MS - 120) + "ms cubic-bezier(.16,1,.3,1) forwards}" +
    "@keyframes grow{to{opacity:1;transform:scale(1)}}" +
    ".pin{position:absolute;left:0;top:0;padding:2px;border-radius:18px 18px 18px 0;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08),0 4px 10px rgba(0,0,0,.08);pointer-events:none}" +
    ".pin .face{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;overflow:hidden;background:#e3dfd7}" +
    ".pin .face img{width:74%;height:74%;object-fit:contain}" +
    ".pin.saving{animation:pulse 1.6s ease-in-out infinite}" +
    "@keyframes pulse{50%{opacity:.55}}" +
    ".scrim{position:fixed;inset:0;background:rgba(0,0,0,.28);pointer-events:auto;animation:fade .25s ease-out}" +
    ".sheet{position:fixed;left:0;right:0;bottom:0;background:#fff;border-radius:20px 20px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -8px 32px rgba(0,0,0,.18);pointer-events:auto;animation:rise .35s cubic-bezier(.16,1,.3,1)}" +
    "@keyframes rise{from{transform:translateY(24px);opacity:0}}" +
    "@keyframes fade{from{opacity:0}}" +
    "h2{margin:0 0 4px;font-size:17px;font-weight:600;letter-spacing:-.2px}" +
    "p{margin:0 0 12px;color:#6e6c67;font-size:14px}" +
    "textarea,input{width:100%;font:inherit;font-size:16px;color:inherit;background:#fff;border:1px solid #d2cfca;border-radius:12px;padding:10px 12px;outline:none;margin:0}" +
    "textarea{min-height:92px;resize:none}" +
    "textarea:focus,input:focus{border-color:#121211}" +
    ".row{display:flex;gap:8px;margin-top:12px}" +
    ".chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}" +
    "button{font:inherit;font-weight:500;border-radius:999px;border:1px solid #d2cfca;background:#fff;color:#121211;padding:0 16px;height:40px;-webkit-tap-highlight-color:transparent}" +
    "button.primary{background:#121211;border-color:#121211;color:#fff;flex:1}" +
    "button.plain{flex:1}" +
    "button:active{opacity:.7}" +
    "button:disabled{opacity:.4}" +
    ".who{font-size:13px;color:#6e6c67;margin-top:10px}" +
    ".who button{height:auto;border:0;padding:0;background:none;color:#121211;text-decoration:underline;font-size:13px;font-weight:400}" +
    ".error{color:#ff3b30;font-size:14px;margin:8px 0 0}" +
    ".toast{position:fixed;left:50%;top:calc(12px + env(safe-area-inset-top));transform:translateX(-50%);background:#121211;color:#fff;border-radius:999px;padding:8px 16px;font-size:14px;white-space:nowrap;pointer-events:none;animation:drop .3s cubic-bezier(.16,1,.3,1)}" +
    "@keyframes drop{from{opacity:0;transform:translate(-50%,-8px)}}" +
    "@media (prefers-color-scheme:dark){.sheet,textarea,input,button{background:#1b1b19;color:#faf9f7;border-color:#3a3937}.pin{background:#1b1b19}.ring{border-color:#faf9f7;background:rgba(250,249,247,.1)}button.primary{background:#faf9f7;color:#121211;border-color:#faf9f7}textarea:focus,input:focus{border-color:#faf9f7}.who button{color:#faf9f7}}" +
    "@media (prefers-reduced-motion:reduce){*{animation-duration:1ms!important}}" +
    "";
  shadow.innerHTML = "<style>" + css + "</style><div class='ring'></div><div class='layer'></div>";
  document.documentElement.appendChild(host);
  // Pins live in the page itself, at a point on the document, not on the screen: a fixed layer is moved about by the
  // keyboard and the browser's bars, and a pin has to stay where the comment was left.
  var pinHost = document.createElement("div");
  pinHost.style.cssText = "all:initial;position:absolute;left:0;top:0;width:0;height:0;overflow:visible;z-index:2147483646;pointer-events:none;";
  var pinShadow = pinHost.attachShadow({ mode: "open" });
  pinShadow.innerHTML = "<style>" + css + "</style><div class='pins'></div>";
  document.documentElement.appendChild(pinHost);
  var ring = shadow.querySelector(".ring");
  var layer = shadow.querySelector(".layer");
  var pins = pinShadow.querySelector(".pins");

  // A long press must not select text or pop the browser's own menu. iOS Safari decides that when the finger goes down,
  // so it is off for the whole page (fields excepted, so typing still works), not switched off once a hold has begun.
  var hold = document.createElement("style");
  hold.textContent =
    "html,html *:not(input):not(textarea):not([contenteditable]){-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}";
  document.head.appendChild(hold);
  document.addEventListener("selectstart", function (event) {
    var t = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
    var field = t && t.closest ? t.closest("input,textarea,[contenteditable]") : null;
    if (!field) event.preventDefault();
  }, true);

  function toast(text) {
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    shadow.appendChild(el);
    setTimeout(function () { el.remove(); }, 2400);
  }

  // --- The long press. ---
  var press = null;
  var composing = false;

  function stop() {
    if (press) clearTimeout(press.timer);
    clearTimeout(press && press.showRing);
    press = null;
    ring.classList.remove("on");
    document.documentElement.removeAttribute("data-studio-holding");
  }

  document.addEventListener("pointerdown", function (event) {
    if (composing || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    var x = event.clientX;
    var y = event.clientY;
    stop();
    press = {
      x: x,
      y: y,
      // The ring waits a moment, so a tap or the start of a scroll never flashes it.
      showRing: setTimeout(function () {
        ring.style.left = x + "px";
        ring.style.top = y + "px";
        ring.classList.add("on");
        document.documentElement.setAttribute("data-studio-holding", "");
      }, 120),
      timer: setTimeout(function () {
        stop();
        if (window.getSelection) window.getSelection().removeAllRanges();
        // The lift of the finger that follows is not a tap on whatever is under it.
        var swallow = function (e) { e.preventDefault(); e.stopPropagation(); };
        document.addEventListener("click", swallow, true);
        setTimeout(function () { document.removeEventListener("click", swallow, true); }, 600);
        compose(x, y);
      }, HOLD_MS),
    };
  }, true);

  document.addEventListener("pointermove", function (event) {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_TOLERANCE) stop();
  }, true);
  ["pointerup", "pointercancel", "scroll", "dragstart"].forEach(function (name) {
    document.addEventListener(name, function () { stop(); }, true);
  });
  document.addEventListener("contextmenu", function (event) {
    if (press || composing) event.preventDefault();
  }, true);

  // --- Leaving the comment. ---
  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key === "text") node.textContent = props[key];
      else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2), props[key]);
      else if (key in node) node[key] = props[key];
      else node.setAttribute(key, props[key]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  // A pin is set down once, at the point on the document where the press was, and never moved after: not by scrolling, by
  // the keyboard coming up, or by the browser's bars. `at` is that point, so a comment that is brought back keeps it.
  function makePin(name, at) {
    var face = faceOf(name);
    var circle = el("span", { className: "face" });
    if (face) {
      circle.style.background = COLORS[face.color];
      circle.appendChild(el("img", { src: "/avatars/" + (face.avatar + 1) + ".png", alt: "", draggable: false }));
    }
    var node = el("div", { className: "pin" }, [circle]);
    node.style.transform = "translate(" + at.x + "px," + at.y + "px) translateY(-100%)";
    pins.appendChild(node);
    return {
      saving: function (on) { node.classList.toggle("saving", on); },
      remove: function () { node.remove(); },
    };
  }

  // `again` brings back a comment that didn't save: where it was, and what was written.
  function compose(x, y, again) {
    composing = true;
    var at = again ? again.at : { x: x + window.scrollX, y: y + window.scrollY };
    // The prototype's own place in its address is added when it is posted, once the controls say which keys are theirs.
    var anchor = again ? again.anchor : place.anchorAt(document, x, y, studioOwns(null));
    var name = savedName();
    var scrim = el("div", { className: "scrim" });
    var pin = makePin(name, at);
    var sheet = el("div", { className: "sheet", role: "dialog", "aria-modal": "true" });
    layer.append(scrim, sheet);

    // The sheet rides above the keyboard, which the layout viewport doesn't know about.
    var vv = window.visualViewport;
    function fit() {
      if (!vv) return;
      sheet.style.bottom = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)) + "px";
    }
    if (vv) {
      vv.addEventListener("resize", fit);
      vv.addEventListener("scroll", fit);
    }

    function close() {
      if (vv) {
        vv.removeEventListener("resize", fit);
        vv.removeEventListener("scroll", fit);
      }
      layer.replaceChildren();
      composing = false;
    }
    function cancel() {
      pin.remove();
      close();
    }
    scrim.addEventListener("click", cancel);

    function askWho() {
      var field = el("input", { placeholder: "Someone else", autocomplete: "off", "aria-label": "Your name" });
      var chips = el("div", { className: "chips" }, people().concat([""]).map(function (person) {
        return el("button", {
          type: "button",
          text: person || "Guest",
          onclick: function () { choose(person); },
        });
      }));
      var go = el("button", {
        type: "button",
        className: "primary",
        text: "Continue",
        onclick: function () { if (field.value.trim()) choose(field.value.trim()); },
      });
      sheet.replaceChildren(
        el("h2", { text: "Who is commenting?" }),
        el("p", { text: "Asked once, so your comments carry your name." }),
        chips,
        field,
        el("div", { className: "row" }, [go])
      );
    }

    function choose(person) {
      name = person;
      saveName(person);
      pin.remove();
      pin = makePin(name, at);
      write();
    }

    function write() {
      var area = el("textarea", { placeholder: "Leave a comment", "aria-label": "Comment" });
      var error = el("p", { className: "error" });
      error.hidden = !(again && again.error);
      if (again) {
        area.value = again.text;
        error.textContent = again.error;
      }
      var post = el("button", { type: "button", className: "primary", text: "Post" });
      post.addEventListener("click", function () {
        var text = area.value.trim();
        if (!text) return area.focus();
        // Not waited for: the sheet closes at once and the pin breathes until the comment has saved.
        close();
        pin.saving(true);
        controlParams.then(function (names) {
          return fetch("/api/review/comments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              slug: slug, version: version, token: token,
              text: text, anchor: Object.assign({}, anchor, { state: place.stateOf(location, studioOwns(names)) }), variant: setupOf(names), by: name || undefined, avatar: avatarOf(name),
            }),
          });
        }).then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (body) {
            if (!response.ok) throw new Error(body.error || "That didn't save.");
          });
        }).then(function () {
          pin.saving(false);
        }).catch(function (problem) {
          // Nothing is lost: the comment comes back, as written, to try again.
          pin.remove();
          if (!composing) compose(x, y, { at: at, anchor: anchor, text: text, error: problem.message || "That didn't save." });
        });
      });
      var who = el("p", { className: "who" }, [
        document.createTextNode("Commenting as " + (name || "a guest") + " · "),
        el("button", { type: "button", text: "Change", onclick: askWho }),
      ]);
      sheet.replaceChildren(
        area,
        error,
        el("div", { className: "row" }, [el("button", { type: "button", className: "plain", text: "Cancel", onclick: cancel }), post]),
        who
      );
      area.focus();
      fit();
    }

    if (name === null) askWho();
    else write();

    // iOS only raises the keyboard for a focus that comes from a touch, and the hold that opened this is a timer. The finger
    // lifting is a touch, so the field is focused again then.
    var refocus = function () {
      var field = shadow.querySelector("textarea");
      if (field && shadow.activeElement !== field) field.focus();
    };
    ["pointerup", "touchend"].forEach(function (type) {
      document.addEventListener(type, refocus, { once: true, capture: true });
    });
  }

  // Nothing says a long press does anything, so it says so once.
  try {
    if (!localStorage.getItem("studio.review.hinted")) {
      localStorage.setItem("studio.review.hinted", "1");
      setTimeout(function () { toast("Press and hold to leave a comment"); }, 800);
    }
  } catch { /* no hint without storage */ }
})();
