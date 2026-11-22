# T&B Foods – setup for both iPhones

App address: https://iluxeuropeltd-bit.github.io/tb-foods/

## Bryan's phone (first)
1. Open the app address in **Safari**.
2. Tap **Set up our kitchen**. This creates your private household code.
3. Tap **Share** (square with arrow) → **Add to Home Screen** → **Add**.
4. Open T&B Foods from the home screen. Allow the camera the first time you scan.
5. Optional: More → **Load our current freezer list** to add the 22 items you already have.

## Wife's phone
1. On Bryan's phone: More → **Send by WhatsApp** (or **Copy link** and paste it into any message).
2. On her phone, tap the link so it opens in **Safari** (not inside WhatsApp; use "Open in Safari" if needed).
3. Tap **Share** → **Add to Home Screen** → **Add**. It opens already joined. If it ever asks, paste the code from More → Our household.

## Siri (each phone, about 3 minutes)
Full step-by-step with copy buttons is in the app: More → **Siri setup**.
Summary: Shortcuts app → new shortcut called **Freezer** → actions:
1. **Ask for Input** (Text, prompt "What's changed?")
2. **Get Contents of URL** → `https://dtkmhddfsbqhwsgtfrqa.supabase.co/rest/v1/rpc/tb_voice`, Method **POST**, Header `apikey` = the publishable key, Request Body **JSON**: `cmd` = Provided Input, `code` = your household code
3. **Speak Text** (Contents of URL)

Say "Hey Siri, Freezer", then for example:
- "Add 4 portions of chilli to the Beko"
- "Freeze 6 chicken fillets in the Beko" (marks frozen today)
- "Add 2 bags of peas to the freezer" / "Milk to the fridge"
- "We ate 2 chilli" / "Took out a lasagne" / "Used up all the peas"
- "What's in the Beko?" / "What needs eating soon?"

No place said means the Beko. Removing always takes the oldest batch first.

## How it works
- **Stock**: everything, oldest first; tap − when you eat one; tap an item to edit, move shelf/drawer, or mark frozen.
- **Scan / Add**: Adding mode or Eating mode. New barcodes are looked up on Open Food Facts; unknown ones you name once and they're remembered. "Freezing it today" toggle tracks home-frozen food.
- **Plan**: weeks of supply vs your 8-week target, what to eat next (first in, first out), and what's running low.
- **Spend**: enter each shop's receipt total; monthly totals, by-shop breakdown, history.
- Rotation flags: frozen food "Eat soon" after 8 weeks, "Eat now" at 3 months (home frozen) or 6 months (bought frozen).

Free tier note: Supabase pauses a free project after 7 days with no use at all. Daily use keeps it awake; if it ever pauses, sign in at supabase.com and click Restore.
