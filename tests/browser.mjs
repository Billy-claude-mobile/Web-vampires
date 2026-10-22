import { chromium } from 'playwright';

/** Lance Chromium ; CHROMIUM_PATH permet d'utiliser un binaire déjà installé. */
export function launchBrowser() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
}
