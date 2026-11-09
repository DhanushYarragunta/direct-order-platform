# Menu expansion review

This is the catalog for the Deccan Kitchen demonstration project. Prices and portions are sample restaurant data, not a claim that a real restaurant is operating.

## Scope

- Exactly 60 dishes across 9 categories; 40 vegetarian dishes.
- The original 7 dish records and their IDs/prices are preserved.
- The existing Kondapur, Gachibowli and Kukatpally outlets are retained.
- The approved additive import inserted 53 dishes and 159 outlet availability rows into the original seven-dish database.
- The hosted catalog rollout is complete; remaining payment, message-provider and hosting checks are tracked in `docs/RELEASE_READINESS.md`.

## Completed hosted rollout — 8 November 2026

Render deployment **`dep-dbno6jgae00c738vmtl0`** succeeded on commit **`de354569c052cfa6eabfc1b86ae87d752171be4f`**. All seven migrations are applied, including `20261108010000_password_recovery`.

The approved import inserted **53 dishes and 159 availability rows**. A subsequent dry run reported **zero changes**. All three outlets now return **60 available dishes**, and all **60 JPEG URLs returned HTTP 200**. This expansion follows the original seven-dish initialization, which inserted 33 records: three outlets, seven dishes, two add-ons and 21 availability rows. That earlier import is historical; the current hosted catalog contains all 60 reviewed dishes below.

The deployment reused the existing Render Free service and database with `DEMO_MODE=false`; no plan or resource upgrade was performed. At this rollout checkpoint, SES was sandboxed, actual SMS was unavailable, and provider acceptance was incomplete. AWS granted SES production access later on **8 November 2026**; the approval and remaining delivery checks are recorded in [release readiness](RELEASE_READINESS.md). The Free service sleeps when inactive and has no separate continuous worker; the Free PostgreSQL database expires on **5 December 2026**.

## Reviewed catalog

`prisma/catalog/menu.json` SHA-256: `ca555acbbebbd245eab1b56466dd78c3ce8dd3f2e92bd862d351c6e96be41720`

| Category | Dishes |
| --- | ---: |
| Biryani | 8 |
| Sides | 5 |
| Sweets | 7 |
| Starters | 8 |
| Kebabs | 6 |
| Curries | 8 |
| Breads | 5 |
| Rice & Meals | 5 |
| Drinks | 8 |

| Dish | Category | Price | Portion | Vegetarian |
| --- | --- | ---: | --- | --- |
| Chicken dum biryani | Biryani | ₹320 / family ₹900 | Regular · serves 1 | No |
| Cucumber raita | Sides | ₹80 | 200 ml · serves 1–2 | Yes |
| Double ka meetha | Sweets | ₹140 | 150 g · serves 1 | Yes |
| Gulab jamun | Sweets | ₹100 | 2 pieces · serves 1 | Yes |
| Mirchi ka salan | Sides | ₹120 | 250 ml · serves 1–2 | Yes |
| Mutton haleem | Sides | ₹350 | Regular | No |
| Vegetable biryani | Biryani | ₹260 | Regular · serves 1 | Yes |
| Mutton dum biryani | Biryani | ₹420 / family ₹1200 | Regular · serves 1 | No |
| Egg biryani | Biryani | ₹240 | 2 eggs · serves 1 | No |
| Prawn biryani | Biryani | ₹450 | Regular · serves 1 | No |
| Fish biryani | Biryani | ₹390 | Regular · serves 1 | No |
| Paneer biryani | Biryani | ₹310 / family ₹850 | Regular · serves 1 | Yes |
| Mushroom biryani | Biryani | ₹290 | Regular · serves 1 | Yes |
| Chicken 65 | Starters | ₹290 | 8 pieces · serves 1–2 | No |
| Chilli chicken | Starters | ₹300 | 8 pieces · serves 1–2 | No |
| Chicken pakora | Starters | ₹270 | 8 pieces · serves 1–2 | No |
| Andhra fish fry | Starters | ₹330 | 2 pieces · serves 1 | No |
| Apollo fish | Starters | ₹360 | 8 pieces · serves 1–2 | No |
| Paneer 65 | Starters | ₹260 | 8 pieces · serves 1–2 | Yes |
| Gobi 65 | Starters | ₹220 | Regular · serves 1–2 | Yes |
| Vegetable manchurian | Starters | ₹230 | 6 pieces · serves 1–2 | Yes |
| Tandoori chicken | Kebabs | ₹350 / family ₹650 | Half chicken · serves 1–2 | No |
| Chicken tikka | Kebabs | ₹320 | 6 pieces · serves 1–2 | No |
| Chicken malai tikka | Kebabs | ₹350 | 6 pieces · serves 1–2 | No |
| Tangdi kebab | Kebabs | ₹340 | 3 drumsticks · serves 1–2 | No |
| Mutton seekh kebab | Kebabs | ₹390 | 4 pieces · serves 1–2 | No |
| Paneer tikka | Kebabs | ₹290 | 6 pieces · serves 1–2 | Yes |
| Butter chicken | Curries | ₹340 | 300 ml · serves 1–2 | No |
| Chicken korma | Curries | ₹330 | 300 ml · serves 1–2 | No |
| Kadai chicken | Curries | ₹330 | 300 ml · serves 1–2 | No |
| Mutton rogan josh | Curries | ₹430 | 300 ml · serves 1–2 | No |
| Palak paneer | Curries | ₹270 | 300 ml · serves 1–2 | Yes |
| Paneer butter masala | Curries | ₹280 | 300 ml · serves 1–2 | Yes |
| Dal tadka | Curries | ₹190 | 300 ml · serves 1–2 | Yes |
| Bagara baingan | Curries | ₹230 | 300 ml · serves 1–2 | Yes |
| Tandoori roti | Breads | ₹40 | 1 piece | Yes |
| Butter naan | Breads | ₹60 | 1 piece | Yes |
| Garlic naan | Breads | ₹70 | 1 piece | Yes |
| Roomali roti | Breads | ₹45 | 1 piece | Yes |
| Laccha paratha | Breads | ₹65 | 1 piece | Yes |
| Jeera rice | Rice & Meals | ₹170 | 350 g · serves 1 | Yes |
| Bagara rice | Rice & Meals | ₹180 | 350 g · serves 1 | Yes |
| Steamed rice | Rice & Meals | ₹120 | 350 g · serves 1 | Yes |
| Curd rice | Rice & Meals | ₹160 | 350 g · serves 1 | Yes |
| Vegetable pulao | Rice & Meals | ₹220 | 350 g · serves 1 | Yes |
| Green salad | Sides | ₹90 | 200 g · serves 1–2 | Yes |
| Roasted papad | Sides | ₹40 | 2 pieces | Yes |
| Qubani ka meetha | Sweets | ₹160 | 150 g · serves 1 | Yes |
| Rasmalai | Sweets | ₹170 | 2 pieces | Yes |
| Rice kheer | Sweets | ₹130 | 180 ml · serves 1 | Yes |
| Shahi tukda | Sweets | ₹150 | 2 pieces | Yes |
| Jalebi | Sweets | ₹110 | 150 g · serves 1 | Yes |
| Sweet lassi | Drinks | ₹110 | 300 ml | Yes |
| Salted lassi | Drinks | ₹100 | 300 ml | Yes |
| Mango lassi | Drinks | ₹140 | 300 ml | Yes |
| Masala buttermilk | Drinks | ₹80 | 300 ml | Yes |
| Fresh lime soda | Drinks | ₹90 | 300 ml | Yes |
| Rose milk | Drinks | ₹110 | 300 ml | Yes |
| Irani chai | Drinks | ₹50 | 150 ml | Yes |
| Filter coffee | Drinks | ₹70 | 150 ml | Yes |

## Local validation and seeding

Validate the catalog and bundled photo paths without opening a database connection:

```sh
node --import tsx scripts/expand-menu.ts --validate
```

`prisma/seed.ts` reads the same catalog. Its existing upsert behavior preserves stored item edits. Use the seed only for local/test setup; use the explicit additive importer for an already populated staging database.

## Additive staging import

The importer requires `DEMO_MODE=false`, `PAYMENT_PROVIDER=razorpay`, a Razorpay test key (`rzp_test_…`) and `ALLOW_PUBLIC_TEST_PAYMENTS=true`. The database URL must already point to the intended test staging database. Do not print or copy secret environment values into review output.

Review the database plan first (default behavior is a dry run):

```sh
node --env-file=.env --import tsx scripts/expand-menu.ts --dry-run
```

After the catalog and target database have been reviewed, apply explicitly:

```sh
APPLY_MENU_EXPANSION=true MENU_EXPANSION_SHA256=ca555acbbebbd245eab1b56466dd78c3ce8dd3f2e92bd862d351c6e96be41720 node --env-file=.env --import tsx scripts/expand-menu.ts --apply
```

The importer uses a serializable transaction and an advisory lock. It only inserts missing new dish and availability records. It never overwrites the original seven dishes, outlet settings, existing availability (including unavailable dishes), accounts, orders or coupons. Repeating an unchanged import produces zero new rows. If an added dish ID already exists with different data, the entire import stops and preserves that administrator edit. Unrelated existing dishes also stop the import, so it never deletes records to force a total of 60.

## Photography

The 53 new photographs are bundled under `public/food/`. They depict the named dishes and are illustrative; actual preparation and presentation can vary. Their original file pages, authors, licenses, transformations and local SHA-256 checksums are recorded in `prisma/catalog/photo-sources.json` and displayed on `/photo-credits`. Attribution and share-alike terms must be retained when distributing the applicable images. Existing supplied photographs remain unchanged.

## Verification

- The exact deployed commit passed [GitHub Actions run 42408895843](https://github.com/DhanushYarragunta/direct-order-platform/actions/runs/42408895843), job `128512527152`, on **8 November 2026 at 01:38:07 IST**: **162 unit tests, 107 database tests and 33 browser scenarios** (28 core, one gateway and four registration/recovery), plus TypeScript, production build, Docker build and cleanup.
- Catalog tests cover exact totals, category coverage, original records, vegetarian counts, portions/prices, local assets and import guards.
- Integration tests cover 53/159 additions, dry runs, repeat imports, conflicts, preservation of existing administrative changes, and retained unavailable flags.
- Browser menu checks cover all nine category filters and the 60-card catalog.
