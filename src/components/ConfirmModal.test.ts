import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import { loadUI } from "../../tests/ui.js";

const { ConfirmModal } = loadUI(new URL("./ConfirmModal.tsx", import.meta.url), {
  react: React, "react/jsx-runtime": jsxRuntime,
});

async function mount(busy = false) {
  const dom = new JSDOM('<button id="opener">Return request</button><div id="app"></div>');
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); this.focus(); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const opener = document.querySelector<HTMLButtonElement>("#opener")!;
  opener.focus();
  const root = createRoot(document.querySelector("#app")!);
  let cancelled = 0;
  let confirmed = 0;
  const render = async (saving = busy) => React.act(async () => root.render(React.createElement(ConfirmModal, {
    title: "Return request", confirmLabel: "Confirm return", busy: saving,
    onConfirm: () => confirmed++, onCancel: () => cancelled++,
    children: React.createElement("p", null, "The requester can edit and resubmit."),
  })));
  await render();
  return {
    dom, opener, render,
    cancelled: () => cancelled, confirmed: () => confirmed,
    async unmount() { await React.act(async () => root.unmount()); },
    async close() { await React.act(async () => root.unmount()); dom.window.close(); },
  };
}

test("confirmation keeps its content and explicit confirm and cancel actions", async () => {
  const ui = await mount();
  try {
    assert.match(document.body.textContent!, /The requester can edit and resubmit/);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("#app button")];
    assert.deepEqual(buttons.map((b) => b.textContent), ["Cancel", "Confirm return"]);
    await React.act(async () => buttons[1].click());
    assert.equal(ui.confirmed(), 1);
    await React.act(async () => buttons[0].click());
    assert.equal(ui.cancelled(), 1);
  } finally { await ui.close(); }
});

test("the named native dialog blocks dismissal while saving and restores focus", async () => {
  const ui = await mount(true);
  try {
    const dialog = document.querySelector("dialog")!;
    assert.ok(dialog, "uses a native dialog for keyboard focus containment");
    assert.ok(dialog.open);
    assert.equal(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent, "Return request");
    assert.equal(dialog.getAttribute("aria-busy"), "true");
    const cancel = new ui.dom.window.Event("cancel", { cancelable: true });
    await React.act(async () => { dialog.dispatchEvent(cancel); dialog.click(); });
    assert.ok(cancel.defaultPrevented);
    assert.equal(ui.cancelled(), 0);
    await ui.render(false);
    await React.act(async () => dialog.dispatchEvent(new ui.dom.window.Event("cancel", { cancelable: true })));
    assert.equal(ui.cancelled(), 1);
    await ui.unmount();
    assert.equal(ui.dom.window.document.activeElement, ui.opener);
  } finally { await ui.close(); }
});
