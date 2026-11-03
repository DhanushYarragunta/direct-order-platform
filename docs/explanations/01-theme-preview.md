# Update 01 — Restaurant theme and cart preview

This update makes the proposed customer ordering theme reviewable in a standalone page, [theme-preview/index.html](../../theme-preview/index.html). It follows [the original client brief](../../CLIENT_BRIEF.md) and the planned [technology stack](00-tech-stack.md). The preview uses HTML, CSS, and JavaScript; it does not change the production recommendation of Next.js/React, Tailwind CSS, shadcn/ui, and a PostgreSQL-backed application.

## 1. File purpose and scope

`theme-preview/index.html` supplies the customer homepage, menu, cart containers, and accessible controls. Its embedded CSS defines the theme, image framing, and responsive layout.

[theme-preview/preview.js](../../theme-preview/preview.js) supplies the behavior. It defines the sample dishes, local photo paths, and availability flags; constructs quantity controls; applies filters; synchronizes menu and cart quantities; calculates subtotals; and handles image-loading feedback. `index.html` loads this file after the page markup, so the elements it queries already exist. Keep the whole `theme-preview` directory together, including `assets`, when opening or sharing the preview.

The page is a design and interaction preview. It has no backend, sign-in, authoritative inventory, real orders, payment processing, or kitchen integration. A cart subtotal on this page is a demonstration, not an accepted order or a payment request.

This explanation documents the page's purpose, behavior, visual choices, assumptions, and verification limits. It is not a replacement for the later explanations of production components and server modules.

## 2. Theme and page hierarchy

The design retains the warm ivory background, forest-green text and actions, and restrained saffron accents. Food imagery and readable dish names carry the page. The main sequence is outlet selection, an introductory hero, category filters, a short menu, and the cart summary.

The customer should be able to find a dish, see its price and portion, and adjust its quantity without losing their place in the menu. Veg/non-veg marks have accompanying text. Allergen information and the statement that sample prices include 5% GST remain visible.

The layout adapts to phone and desktop widths. The customer page establishes the shared colors and visual language, but future kitchen and admin screens need layouts suited to their own jobs. Kitchen screens will require large, stable order information and clear late-order states; admin screens will require efficient editing and validation.

## 3. User-supplied food photography

The user supplied all four food photographs in the project's `Images` directory. The originals stay unchanged there. The preview uses optimized JPEG copies in `theme-preview/assets` instead of the artificial dish illustrations or provisional remote photographs. Food-image loading no longer depends on an external image host or an internet connection.

The files remain in the directory supplied by the user. Their original creators, source pages, and usage terms were not provided, so this update does not assign an author or licence to them. The former Wikimedia Commons credits described different photographs and must not be carried over to these replacements.

| Dish | Original supplied file | Preview asset | Where used |
|---|---|---|---|
| Chicken dum biryani | [Chicken dum biryani.jpg](<../../Images/Chicken dum biryani.jpg>) | `assets/chicken-biryani.jpg` | Hero, menu, and matching cart thumbnail |
| Vegetable biryani | [Vegetable biryani.jpg](<../../Images/Vegetable biryani.jpg>) | `assets/vegetable-biryani.jpg` | Menu and matching cart thumbnail |
| Mirchi ka salan | [Mirchi ka salan.jpeg](<../../Images/Mirchi ka salan.jpeg>) | `assets/mirchi-ka-salan.jpg` | Menu and matching cart thumbnail |
| Double ka meetha | [Double ka meetha.jpeg](<../../Images/Double ka meetha.jpeg>) | `assets/double-ka-meetha.jpg` | Menu and matching cart thumbnail |

The relative paths in `preview.js` begin with `assets/` and resolve from the page in `theme-preview`. Sharing the whole `theme-preview` directory therefore includes the images needed by the page; the original `Images` directory is retained separately as the source material.

The copies use JPEG quality 78. The chicken image has a maximum dimension of 1,200 pixels and the vegetable image a maximum dimension of 1,100 pixels, with proportions preserved. The salan and meetha copies retain their original dimensions. These settings reduce image weight without changing the original files. Embedded source marks are preserved. Salan uses `object-fit: contain` to keep its full composition visible; other image frames may crop to fit the layout. The photos were visually inspected and match their dish names. They remain user-selected preview images and do not establish what Company A's actual products or outlets look like.

The image mapping in `preview.js` is shared between each menu item and its cart row. This makes the item recognizable after it is added and avoids showing a different dish image in the cart. The hero also uses the chicken dish's mapping. The hero and menu show loading text and a photo-unavailable message if a file is missing or cannot be decoded.

## 4. Menu-to-cart flow

1. The customer selects an outlet and browses the sample menu. Category and vegetarian filters change which menu cards are visible.
2. An available dish shows an **Add** action. Adding it records one unit in the local cart.
3. The menu card changes to a **minus / quantity / plus** control. The dish stays in the menu, so quantities can be changed while browsing.
4. A visible cart summary shows the item count and subtotal and provides a route to the cart. The header cart count stays in sync.
5. The cart lists the selected dishes with their matching photos, quantities, and line totals. Removing the final unit removes that cart line and restores the menu card's Add action.
6. The subtotal is recalculated from the sample dish prices and selected quantities after each change. Empty-cart and quantity-limit states are handled explicitly.

Both the visible controls and the mutation logic guard sample availability. Disabling a button communicates that a dish cannot be added; checking again when applying a quantity change prevents another local control from adding an unavailable dish accidentally.

The **maximum of 20 units per dish per order** is a separate demonstration limit. It is not a statement that the kitchen has 20 units in stock. Reaching that cap disables further increases while keeping decreases available.

The preview saves the selected outlet, category, vegetarian filter, and cart state in the browser's `localStorage` under `company-a-theme-preview:v1`. On restoration, it accepts only known choices and available dish IDs with positive integer quantities up to the limit. If reading, parsing, or writing browser storage fails, the page continues with an in-memory cart. Storage access can be unavailable when a browser opens a local file. The cart panel starts closed on reload even when saved items are restored.

In production, browser checks will remain useful for feedback, but the server must recheck outlet availability, permitted quantities, and current prices before accepting an order. A customer can alter client-side code or keep a page open after availability changes.

## 5. Reference project and production direction

The user supplied [Restaurant-POS-System](https://github.com/VedantManek16/Restaurant-POS-System) as a reference. Its README describes separation between outlets, categories/dishes/orders, and a kitchen display system using Server-Sent Events (SSE). This is a README-level reference, not a code audit or a claim that the repository's implementation has been verified.

Those concepts help frame later work in this project:

- Central menu administration will organize categories and dishes and control availability by outlet.
- Accepted orders will belong to the correct outlet, and server authorization will restrict staff operations to their permitted scope.
- A kitchen display will receive order updates through an authenticated event stream, with reconnection and state recovery designed explicitly.

This preview does not copy the reference repository's source code, adopt its stack, or add restaurant POS, table management, or billing features. The client's ordering-to-kitchen core remains the priority. The existing Next.js/React and SSE proposal remains in place.

## 6. Open the page locally

From the project directory on macOS:

```sh
open theme-preview/index.html
```

Alternatively, open `theme-preview/index.html` directly in a browser, keeping `preview.js` and the `assets` subdirectory with it. Share the whole `theme-preview` folder so relative photo paths continue to resolve. No package installation or application build is required for this standalone preview. The food photographs and cart logic are local; the Lucide icon script still requires an internet connection. Icon loading is separate from the local cart logic.

Try adding more than one dish, adjusting a quantity on a menu card, checking the corresponding cart row, and removing the last unit. Also try the category and vegetarian filters, change the outlet, and narrow the browser to phone width. These actions exercise the preview; none places an order.

## 7. Verification and practical limits

Verification is limited to source review and JavaScript syntax/static checks. **No browser checks have been performed on this updated standalone page.** A static review of `preview.js` found no blocking issue in the quantity guards, saved-state validation, menu/cart synchronization, or event wiring. These findings are not a browser test.

The syntax check is:

```sh
node --check theme-preview/preview.js
```

This check passed after the local-photo replacement. Static HTML checks also found valid element references, five image slots, and no remaining canvas illustrations. All four optimized JPEG paths resolve to existing files with valid JPEG signatures. The original photos were decoded and visually inspected. The in-conversation version uses the same photos and cart logic, with embedded image data and conversation state storage; it also passed JavaScript syntax and element-reference checks.

All four requested photo files have been supplied and visually inspected; their content matches the dish names. Opening the updated page for browser verification was blocked when automatic permission review timed out. Source-photo inspection and syntax checks alone cannot establish that the page loads every image, crops look right in the layout, controls fit at narrow widths, or keyboard interactions behave correctly in a browser.

The useful browser checks for this change are:

- Every real photo loads and remains recognizable in the hero, menu, and cart crop.
- Add, plus, minus, item counts, and subtotals remain synchronized, including removal to zero.
- Unavailable items cannot be added; the per-order maximum does not block decreases.
- Keyboard focus stays usable as Add actions become quantity controls and cart rows change.
- The page has no horizontal clipping at phone widths, and dish details remain readable.

The preview assumes sample prices, portions, allergen data, outlet availability, and ordering limits. These must be checked against real menu and outlet data before production use. The displayed FSSAI field remains a placeholder for a verified outlet licence number. Filtering does not change actual inventory, and selecting an outlet does not perform location or delivery-radius validation.

The selected source files are real photographs, but their rendering is unverified, and they do not establish the accuracy of the sample dish descriptions or allergens. The cart is local interface state, not inventory reservation. `localStorage` is not a database or an authoritative order record, and saved cart values remain under the customer's control.

No Git commit or push is made by this documentation update.

## 8. Quick revision summary

- **Purpose:** Review the customer theme and a usable menu-to-cart interaction before building the full application.
- **Design:** Ivory, forest green, and saffron, with the user's four local food photographs.
- **Files:** `index.html` supplies markup/styles; `preview.js` supplies photo mapping, filtering, cart behavior, and guarded localStorage persistence; `assets` supplies optimized local photos. Original user files remain unchanged in `Images`.
- **Interaction:** Add becomes a quantity stepper; menu, visible cart summary, and photo-backed cart rows stay in sync.
- **Availability:** Guard unavailable dishes; treat the 20-unit per-order cap separately from stock.
- **Architecture:** The standalone preview does not replace the proposed production stack or implement backend ordering.
- **Reference:** Use the supplied POS project's README concepts for future outlet, menu, order, and kitchen work; do not treat them as audited code or expand this preview into POS billing.
- **Verification:** Source photos were visually inspected and match their dish names. Current static/syntax checks passed and local JPEG files were verified. Browser verification was blocked by an automatic permission-review timeout. Food images no longer require an external host; the standalone Lucide icon script still does.
