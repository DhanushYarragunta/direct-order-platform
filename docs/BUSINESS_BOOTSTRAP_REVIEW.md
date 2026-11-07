# Approved test catalog import

The owner approved this catalogue on 8 November 2026. It was applied directly to the existing Render database over TLS with certificate verification, inserting exactly the 33 business records below. A subsequent dry-run reported zero missing rows and all 33 unchanged. No service configuration change or restart was needed. The default command only reads the target database and reports changes.

Bundle: `prisma/bootstrap/business-test.json`

SHA-256: `8c9e171542333978da67a8a0d8e183a588062536bb2cb960db2b01a91689062c`

| Record type | Count |
| --- | ---: |
| Outlets | 3 |
| Menu items | 7 |
| Add-ons | 2 |
| Outlet/item availability | 21 |
| City price overrides | 0 |

Outlets are Kondapur (Botanical Garden Road), Gachibowli (DLF Road) and Kukatpally (KPHB Main Road), all in Hyderabad. Existing coordinates, 5 km radius, four stations, preparation minimums of 25/25/30 minutes and delivery policy are preserved: ₹40 fee, ₹199 minimum and free delivery at ₹599. All outlets are open for the approved test setup, and all seven items are available at each outlet. Serving schedules are unrestricted.

| Dish | Regular price | Family price |
| --- | ---: | ---: |
| Chicken dum biryani | ₹320 | ₹900 |
| Vegetable biryani | ₹260 | — |
| Mutton haleem | ₹350 | — |
| Mirchi ka salan | ₹120 | — |
| Cucumber raita | ₹80 | — |
| Double ka meetha | ₹140 | — |
| Gulab jamun | ₹100 | — |

Add-ons: onion and lemon ₹20; extra raita ₹30. Descriptions, portions, dietary/allergen fields and preparation times come from the existing local catalog. All seven photos are bundled `/food/*.jpg` assets already included in the deployment image.

All licence numbers are deliberately **blank**, and every `fssaiVerified` value is **false**. This does not create or verify a restaurant licence. No accounts, passwords, sessions, customer records, orders, payment records, coupons, loyalty entries or analytics history are included.

## Reproducible execution

Validate the fixed bundle without a database connection:

```sh
node --import tsx scripts/bootstrap-business.ts --validate
```

With the approved target supplied privately through `DATABASE_URL`, the default command is a dry-run:

```sh
node --import tsx scripts/bootstrap-business.ts
```

Both dry-run and apply require `DEMO_MODE=false`, `PAYMENT_PROVIDER=razorpay`, a Razorpay **test** key ID and `ALLOW_PUBLIC_TEST_PAYMENTS=true`. Applying additionally requires `BOOTSTRAP_TEST_BUSINESS_DATA=true`, `BUSINESS_BOOTSTRAP_SHA256` matching the value above and the explicit `--apply` argument. Pass those bootstrap values only to the direct importer process. No persistent service settings or startup hook are used.

The importer validates strict field allowlists and foreign references, compares existing matching IDs, and aborts on a conflict. It creates missing rows in a single transaction and never updates or deletes existing rows. Repeating an unchanged import is a no-op. A failure commits no partial import.

After approval and import, verify `/api/menu?outlet=kondapur`, `/api/menu?outlet=gachibowli` and `/api/menu?outlet=kukatpally` return the seven dishes and two add-ons, then check the homepage and bundled photos. Do not run `prisma/seed.ts`, which also creates demonstration accounts and order history.

## Hosted verification

All three outlet menu endpoints return HTTP 200 with seven available dishes and two add-ons. All seven bundled food photos return HTTP 200 with JPEG content. A browser check confirmed the visible menu, portion/add-on selection and adding chicken biryani to the cart for ₹320. No order, account or payment was created by this verification.
