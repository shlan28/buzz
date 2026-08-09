export type WebTheme = "system" | "light" | "dark";

const THEME_KEY = "buzz-web-theme";

export function loadWebTheme(): WebTheme {
  const value = localStorage.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

export function saveWebTheme(theme: WebTheme): void {
  localStorage.setItem(THEME_KEY, theme);
  applyWebTheme(theme);
}

export function applyWebTheme(theme: WebTheme): void {
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
