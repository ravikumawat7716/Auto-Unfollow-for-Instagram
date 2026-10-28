# Chrome Web Store listing

Copy these into the Developer Dashboard.

## Store listing tab

**Name:** Auto Unfollow for Instagram

**Summary (132 chars max):**
Find Instagram accounts that don't follow you back and unfollow them at a pace you set, with an Excel report.

**Category:** Social & Communication

**Language:** English

**Description:**

See who doesn't follow you back on Instagram, then unfollow them without clicking through every profile yourself.

HOW IT WORKS
1. Open instagram.com. The Auto Unfollow panel shows in the bottom right corner.
2. Press Scan. It reads your following and followers lists and checks them against the counts on your profile.
3. Review the "Not following you back" list. Tick "keep" for anyone you want to keep following.
4. Press Start. It opens each profile and clicks Following > Unfollow, the way you would by hand.

FEATURES
• Waits between unfollows (5 seconds by default) and takes a longer break after every 5
• Daily limit (1000 by default), all adjustable in Settings
• Keep list, plus an option to always keep verified accounts
• Safety stops: it stops straight away if Instagram shows "Try Again Later", asks you to log in again, or quietly undoes an unfollow
• Won't start if the followers scan looks incomplete, so nobody who follows you gets unfollowed by mistake
• Excel report with Summary, Following, Not following back, Followers and Action log sheets
• Picks up where it left off if you reload the tab

PRIVACY
Everything stays in your browser. No servers, no analytics, no accounts. The extension only talks to instagram.com, as you.

NOTE
This extension is not affiliated with, endorsed by or connected to Instagram or Meta. Instagram limits how fast accounts can act. If you get a "Try Again Later" message, lower the daily limit and raise the wait time. Use at your own risk.

**Graphics you need to make:**
* Store icon: 128×128 (use icons/icon128.png)
* At least 1 screenshot: 1280×800 or 640×400, e.g. the panel on instagram.com after a scan
* Small promo tile (optional): 440×280

## Privacy practices tab

**Single purpose:**
Helps the user find Instagram accounts that don't follow them back and unfollow those accounts from the user's own logged-in Instagram session.

**Permission justifications:**
* storage: Saves the user's scanned following/followers lists, settings, keep list and activity log locally so a run can continue across page loads and days.
* Host permission (https://www.instagram.com/*): The extension's panel runs on instagram.com. It reads the user's own following and followers lists and clicks the Unfollow button on profiles the user chose to unfollow.

**Remote code:** No, I am not using remote code. (SheetJS is bundled in lib/.)

**Data usage:** tick "Personally identifiable information" (Instagram username and user ID) and "Website content" (follower lists). Then tick all three certifications:
* I do not sell or transfer user data to third parties, outside of the approved use cases
* I do not use or transfer user data for purposes that are unrelated to my item's single purpose
* I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** host PRIVACY.md publicly (a GitHub Gist or GitHub Pages works) and paste the link.
