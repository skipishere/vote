// jsdom (our test environment) does not implement the native <dialog> modal
// methods. Production code uses the real platform API directly — this shim only
// exists so the headless test DOM can exercise the open/close/escape flow. It is
// never bundled into the app.
const proto = HTMLDialogElement.prototype;
if (typeof proto.showModal !== 'function') {
  const setOpen = (el: HTMLDialogElement, open: boolean): void => {
    if (open) el.setAttribute('open', '');
    else el.removeAttribute('open');
  };
  proto.show = function () { setOpen(this, true); };
  proto.showModal = function () { setOpen(this, true); };
  proto.close = function (returnValue?: string) {
    if (!this.open) return;
    setOpen(this, false);
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  };
}
