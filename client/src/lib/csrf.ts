export function getCsrfToken(): string {
  return document.cookie.split("; ")
    .find(r => r.startsWith("_csrf="))?.split("=")[1] ?? "";
}

export function csrfHeaders(): Record<string, string> {
  return { "X-CSRF-Token": getCsrfToken() };
}
