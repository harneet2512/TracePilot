import type { Page } from "@playwright/test";
import { mkdirSync } from "fs";

export function captureDir(): string {
  return process.env.EVIDENCE_CAPTURE_DIR || "playwright-artifacts/evidence-after";
}

export async function captureScreenshot(page: Page, name: string): Promise<void> {
  const dir = captureDir();
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}`, fullPage: true });
}
