export function attachBrowserErrorListeners(page, messages) {
  page.on("pageerror", (error) => messages.push(`[error] ${error.message}`));
}
