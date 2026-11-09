import type { User } from "./types";

export type LocationSuggestion = {
  id: string;
  name: string;
  address: string;
  city: string;
  pincode: string;
  latitude: number;
  longitude: number;
  localityId?: string;
  kind: "place" | "area";
};
export type SavedAddress = {
  id: string;
  label: "Home" | "Work" | "Other";
  recipientName: string;
  phone: string;
  addressLine: string;
  area: string;
  city: string;
  pincode: string;
  latitude: number;
  longitude: number;
  localityId: string | null;
  locationKind: "place" | "area";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};
export type CustomerProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
  role: User["role"];
  addresses: SavedAddress[];
  favorites?: { itemId: string }[];
};
export type DeliverySelection = {
  addressId?: string;
  label: string;
  area: string;
  city: string;
  pincode: string;
  latitude: number;
  longitude: number;
  localityId?: string;
  addressLine?: string;
  phone?: string;
  recipientName?: string;
  kind: "place" | "area";
};
export function addressSelection(address: SavedAddress): DeliverySelection {
  return { addressId: address.id, label: address.label, area: address.area, city: address.city,
    pincode: address.pincode, latitude: address.latitude, longitude: address.longitude,
    localityId: address.localityId || undefined, addressLine: address.addressLine,
    phone: address.phone, recipientName: address.recipientName, kind: address.locationKind };
}
export function placeSelection(place: LocationSuggestion): DeliverySelection {
  return { label: place.name, area: place.address, city: place.city, pincode: place.pincode,
    latitude: place.latitude, longitude: place.longitude, localityId: place.localityId, kind: place.kind };
}
export function fullDeliveryAddress(value: Pick<SavedAddress, "addressLine" | "area" | "city" | "pincode">) {
  return [value.addressLine, value.area, value.city && !value.area.toLowerCase().includes(value.city.toLowerCase()) ? value.city : "",
    value.pincode && !value.area.includes(value.pincode) ? value.pincode : ""].filter(Boolean).join(", ");
}
