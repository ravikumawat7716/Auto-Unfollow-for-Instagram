# Chrome Web Store listing

Copy these into the Developer Dashboard.

## Store listing tab

**Name:** Auto Unfollow for Instagram

**Summary (132 chars max):**
Find Instagram accounts that don't follow you back and unfollow them at a pace you set, with an Excel report.

**Category:** Social & Communication

**Language:** English

**Description:**

See who doesn't follow you back on Instagram, then unfollow them at a steady pace you control, without clicking through hundreds of profiles yourself.

Auto Unfollow for Instagram adds a small panel to instagram.com. It scans your following and followers lists, shows you exactly who doesn't follow you back, lets you choose who to keep, and then unfollows the rest one profile at a time, the same way you would by hand. Every step is logged, and you can download a full Excel report whenever you like.

It works inside the Chrome you already use, with the Instagram account you're already logged in to. There's nothing to sign up for, no password to type in, and no server in between.


HOW IT WORKS

1. Open instagram.com. The Auto Unfollow panel shows in the bottom right corner of the page.
2. Press Scan. The extension reads your following and followers lists, usually in a few minutes, and checks the totals against the counts on your profile.
3. Review the "Not following you back" list. Tick "keep" next to anyone you still want to follow: friends, family, brands, creators you like.
4. For a first test, set "Max unfollows per day" to 5 in Settings and press Start. Watch it open five profiles and unfollow them.
5. When you're happy, raise the daily limit and press Start again. Leave the Instagram tab open while it works. You can use other tabs meanwhile.
6. Press Stop at any time, from any Instagram tab.


WHAT IT DOES FOR EACH ACCOUNT

• Opens the profile in the same tab and stays on it for a moment
• Moves a visible red cursor to the Following button and clicks it
• Clicks Unfollow in the menu, and the extra confirm button for private accounts
• Checks that the button now says Follow, so it knows the unfollow worked
• Waits before the next profile (5 seconds by default, randomly varied up or down)
• After every few unfollows, reopens the last profile to make sure Instagram kept the change, then takes a longer break and can scroll your home feed

It skips deleted accounts, accounts you no longer follow, and follow requests that are still pending.


FEATURES

• Not-following-back finder: compares your following and followers lists and shows who doesn't follow you back
• Keep list: tick "keep" in the list, or type usernames under "Always keep these accounts"
• Keep verified accounts: one checkbox to never unfollow blue-tick accounts
• Pacing you control: wait time between unfollows, how many unfollows before a break, and how long each break lasts
• Daily limit: stops by itself when it reaches your daily maximum (1000 by default), and you press Start again the next day
• Batch check: after each batch, it reopens the last profile to confirm the unfollow stuck
• Resumes after reloads: if you reload the tab or move around Instagram, the run picks up where it left off
• Live activity feed: the panel shows what it's doing right now and what it did recently
• Excel report: download any time, and optionally automatically when a run stops
• Works in your normal browser session: no separate login, no password, no extra app


SAFETY STOPS

Instagram limits how fast accounts can follow and unfollow. The extension is built to stop rather than push through. It stops straight away when:

• Instagram shows "Try Again Later" or any "we limit how often" message
• Instagram quietly undoes an unfollow, which is a hidden sign of a limit (the batch check catches this)
• Instagram asks you to log in again or verify your account
• Three problems happen in a row
• Your daily limit is reached

It also won't start if the followers scan came back smaller than the follower count on your profile. An incomplete scan could make someone who follows you look like they don't, so the extension refuses to run until the scan is complete. Nobody who follows you gets unfollowed by mistake.


THE EXCEL REPORT

The report is built in your browser and saved to your computer. It has five sheets:

• Summary: following, followers, mutual, not following back, unfollowed, kept, left to go, today's count and your settings
• Following: every account you follow and what happened to it
• Not following back: only the accounts that don't follow you back, with their status
• Followers: everyone who follows you, and whether you follow them back
• Action log: every scan, unfollow, skip, check and stop, with times


TIPS

• Start small. Run 5 unfollows first to see how it works, then raise the limit.
• If you see "Try Again Later", stop for at least a day, or two to be safe. Then lower the daily limit and raise the wait time.
• Keep the tab visible if you can. Chrome slows timers in background tabs, so it still works there, just more slowly.
• Keep Instagram set to English. The extension finds buttons by their text.
• Rescan now and then. Your lists change over time, and a fresh scan keeps the "not following back" list accurate.


PRIVACY

Everything stays in your browser.

• No servers, no analytics, no tracking, no accounts
• Your lists, settings, keep list and activity log are saved only in Chrome's local extension storage on your computer
• The only network requests go to instagram.com, from your browser, as you
• The extension never asks for or sees your Instagram password
• Remove the extension and Chrome deletes everything it stored

Permissions:
• Storage: saves your scan, settings and log on your computer so a run can continue across page loads and days
• Access to instagram.com: shows the panel on Instagram, reads your own following and followers lists, and clicks Unfollow on the accounts you chose


FREQUENTLY ASKED QUESTIONS

Do I need to give it my password?
No. It uses the Instagram tab you're already logged in to.

Will it unfollow people I want to keep?
Not if you tick "keep" next to them or add their username to "Always keep these accounts". You can also keep every verified account with one checkbox. Review the list before you press Start.

Can I close the tab while it runs?
Closing the tab stops the run. Press Start later and it carries on from where it stopped. Reloading or moving around Instagram in that tab is fine.

How many accounts can it unfollow per day?
As many as you set in "Max unfollows per day". The default is 1000, but Instagram's own limits vary from account to account. Newer accounts, and accounts that unfollowed a lot recently, often get limited sooner. A lower limit with longer waits is less likely to trigger one.

Does it follow anyone or like posts?
No. It only reads your lists and unfollows the accounts you chose not to keep.

Does it work on mobile or in other languages?
It works in Chrome on desktop, with Instagram set to English.


IMPORTANT

This extension is not affiliated with, endorsed by or connected to Instagram or Meta. Instagram's terms don't allow automated actions, and Instagram may temporarily limit accounts that unfollow too quickly. Slow pacing and the safety stops lower that risk but can't remove it. Use it at your own risk and at a pace you're comfortable with.

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
