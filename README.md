# Auto Unfollow for Instagram

Unfollows Instagram accounts that don't follow you back. It opens each profile and clicks **Following → Unfollow** with a visible cursor, the way you would by hand. It pauses between accounts, takes breaks, and keeps an Excel report of everything.

There are two ways to run it. Use the Chrome extension.

| | Chrome extension (use this) | Playwright bot (backup) |
|---|---|---|
| Runs in | Your normal Chrome, already logged in | A separate Chrome window |
| Login | Nothing to do | Log in once in that window |
| Install | Load the folder in Chrome | Python + `setup.bat` |
| Start | Panel on instagram.com | `run.bat` |

Playwright can't drive your everyday Chrome. Since Chrome 136, Chrome blocks automation tools from taking over your main profile, to protect your logged-in sessions. The extension doesn't have that problem, because it runs inside Chrome itself.

## Chrome extension

### Publish to the Chrome Web Store

**1.** Right-click `build.ps1` and pick **Run with PowerShell**. It makes `dist\ig-unfollow-helper-<version>.zip` with only the extension files.
**2.** Upload the zip in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
**3.** Fill in the listing and privacy tabs from `STORE_LISTING.md`. Host `PRIVACY.md` publicly and paste its link as the privacy policy.

For each update, raise `version` in `manifest.json` and build again.

### Install or update

**1. Open** `chrome://extensions` and turn on **Developer mode** (top right).

**2. New install:** click **Load unpacked** and pick this folder (the one with `manifest.json`). **Updating:** click the round reload arrow on the Auto Unfollow for Instagram card.

**3. Refresh** any open Instagram tabs. The **Auto Unfollow** panel shows in the bottom right corner.

### Use it

**1. Scan.** Press **Rescan** (or **Scan lists**). It reads your following and followers lists in about 3 minutes, and checks them against the counts on your profile.

**2. Review.** In "Not following you back", tick **keep** for anyone you want to keep following. You can also type usernames under Settings, "Always keep these accounts".

**3. Test.** In Settings, set **Max unfollows per day** to 5, then press **Start**. Watch it open 5 profiles and unfollow them.

**4. Run.** Set the daily max back to 1000 (the default) and press **Start**. Leave that Instagram tab open. You can use other tabs meanwhile. It stops at the daily limit, and next day you press Start again.

**To stop:** press **Stop** in the panel, in any Instagram tab.

### What it does for each account

**1.** It opens the profile in the same tab and looks at it for 1 to 3 seconds.
**2.** The red cursor moves to **Following** and clicks it.
**3.** It clicks **Unfollow** in the menu. For private accounts, it also clicks the second **Unfollow** confirm button.
**4.** It checks that the button now says **Follow**.
**5.** It waits about 5 seconds (randomly 3.5 to 6.5), then opens the next profile.
**6.** After every 5 unfollows, it reopens the last profile to check Instagram kept the unfollow. Then it takes a 1 to 2 minute break and scrolls your home feed.

It skips deleted accounts, accounts you already don't follow, and pending follow requests.

### Good to know

* **Keep the tab visible if you can.** Chrome slows down timers in background tabs. It still works there, just slower.
* **Moving around is fine.** If you reload or move the running tab, it picks up where it was. If you close it, the run stops, and Start carries on later.
* **English only.** It finds buttons by their text, so keep Instagram in English.
* **Your data stays in this browser.** Nothing is sent anywhere except Instagram.

## Safety stops (both versions)

It stops straight away when:

* Instagram shows "Try Again Later" or any "we limit how often" message.
* Instagram quietly undoes an unfollow. This is a hidden sign of a limit, and the batch check catches it.
* Instagram asks you to log in again or verify your account.
* 3 problems happen in a row, or the daily limit is reached.

It won't start if the followers scan is smaller than the follower count on your profile, so nobody who follows you gets unfollowed by mistake.

If Instagram limits you, wait at least a day, or two to be safe. Instagram doesn't allow automated actions. Slow pacing lowers the risk but can't remove it.

## The Excel report (extension)

Press **Excel** any time. It also downloads by itself when a run stops (you can turn this off in Settings).

| Sheet | What it shows |
|---|---|
| Summary | Following, followers, mutual, not following back, unfollowed, kept, left, today's count, settings |
| Following | Every account you follow and what happened to it |
| Not following back | Only the accounts that don't follow you back, with their status |
| Followers | Everyone who follows you, and whether you follow them back |
| Action log | Every scan, unfollow, skip, check and stop, with times |

## Playwright bot (backup)

Use this only if the extension stops working. It opens its own Chrome window, which is why it isn't logged in at first. Log in to Instagram in that window once and it remembers you.

**1.** Double-click `setup.bat` once. It needs Python 3.9 or newer.
**2.** Double-click `scan.bat`, log in to Instagram in the window that opens, and wait for the scan.
**3.** Open `Instagram Unfollow Report.xlsx`, type `yes` in the Keep column for anyone to keep, save and close.
**4.** Double-click `test-run.bat` (5 unfollows), then `run.bat`.

Settings are in `settings.json`, and accounts to always keep go in `keep.txt`. Its Excel report updates after every account, and `data/actions_log.csv` logs every action.

## Files

```
manifest.json, popup.*, icons/   Chrome extension
build.ps1          packs the extension into dist/ for the Chrome Web Store
PRIVACY.md, STORE_LISTING.md      privacy policy and store listing text
src/igApi.js       reads your lists from Instagram (read only)
src/core.js        settings, saved data, comparing lists, safety checks
src/ui.js          reads Instagram's page and clicks its buttons (the part to fix if Instagram changes its pages)
src/runner.js      the unfollow run, step by step, carried across page loads
src/report.js      Excel report
src/panel.js       the panel on instagram.com
lib/               SheetJS library for Excel files (Apache 2.0)

ig_unfollow.py     Playwright bot
settings.json, keep.txt, *.bat, requirements.txt   Playwright bot files
```
