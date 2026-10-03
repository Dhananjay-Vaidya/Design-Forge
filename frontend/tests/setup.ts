import "@testing-library/jest-dom/vitest";

// jsdom does not implement the native <dialog> modal API our Dialog component relies on.
// Mirror the observable behaviour (the `open` attribute) so tests exercise the real markup.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}
