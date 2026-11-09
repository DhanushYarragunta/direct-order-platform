import { describe, expect, it } from "vitest";
import { DELIVERY_LOCALITIES } from "../src/lib/delivery";
import { customerProfileSchema, savedAddressSchema, savedAddressPatchSchema } from "../src/lib/profile-validation";

const address = {
  label: "Home", recipientName: "Asha Rao", phone: "9876543210", addressLine: "Flat 12, Garden apartments",
  area: "Kondapur", city: "Hyderabad", pincode: "500084", latitude: 17.462, longitude: 78.357, isDefault: true,
};

describe("customer profile validation", () => {
  it("normalizes names and Indian phone formats while allowing removal", () => {
    expect(customerProfileSchema.parse({ name: " Asha Rao ", phone: "+91 98765 43210" }))
      .toEqual({ name: "Asha Rao", phone: "9876543210" });
    expect(customerProfileSchema.parse({ name: "Asha Rao", phone: "" }).phone).toBeNull();
    expect(customerProfileSchema.parse({ name: "Asha Rao", phone: null }).phone).toBeNull();
  });

  it("rejects changing identity, privileges or verification state through profile edits", () => {
    for (const extra of [{ email: "other@example.test" }, { role: "ADMIN" }, { phoneVerifiedAt: new Date().toISOString() }, { userId: "someone-else" }])
      expect(customerProfileSchema.safeParse({ name: "Asha Rao", phone: null, ...extra }).success).toBe(false);
    expect(customerProfileSchema.safeParse({ name: "A", phone: "123" }).success).toBe(false);
  });

  it("derives curated locality coordinates instead of trusting supplied coordinates", () => {
    const locality = DELIVERY_LOCALITIES[0];
    expect(savedAddressSchema.parse({ ...address, localityId: locality.id, latitude: 0, longitude: 0 }))
      .toMatchObject({ latitude: locality.latitude, longitude: locality.longitude, localityId: locality.id, locationKind: "area" });
    expect(savedAddressSchema.safeParse({ ...address, localityId: "unsupported-locality" }).success).toBe(false);
  });

  it("keeps a searched point and rejects invalid coordinates, contact or pincode", () => {
    expect(savedAddressSchema.parse({ ...address, latitude: 17.44, longitude: 78.36 }))
      .toMatchObject({ latitude: 17.44, longitude: 78.36, localityId: null, locationKind: "place" });
    expect(savedAddressSchema.parse({ ...address, locationKind: "area" }))
      .toMatchObject({ localityId: null, locationKind: "area" });
    for (const extra of [{ latitude: Infinity }, { longitude: 181 }, { latitude: -91 }, { phone: "123" }, { pincode: "50008" }, { label: "Office" }])
      expect(savedAddressSchema.safeParse({ ...address, ...extra }).success).toBe(false);
  });

  it("enforces complete delivery text within the checkout address limit", () => {
    expect(savedAddressSchema.safeParse({ ...address, addressLine: "123" }).success).toBe(false);
    expect(savedAddressSchema.safeParse({ ...address, addressLine: "a".repeat(120), area: "b".repeat(130), city: "c".repeat(50) }).success).toBe(false);
    expect(savedAddressSchema.safeParse({ ...address, addressLine: "a".repeat(120), area: "b".repeat(118), city: "c".repeat(50) }).success).toBe(true);
  });

  it("accepts full edits or explicit default selection, never arbitrary partial edits", () => {
    expect(savedAddressPatchSchema.safeParse(address).success).toBe(true);
    expect(savedAddressPatchSchema.parse({ isDefault: true })).toEqual({ isDefault: true });
    for (const value of [{ isDefault: false }, { phone: address.phone }, { isDefault: true, userId: "other" }])
      expect(savedAddressPatchSchema.safeParse(value).success).toBe(false);
  });
});
