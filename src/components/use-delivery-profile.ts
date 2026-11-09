"use client";
import { useEffect, useRef, useState } from "react";
import { useResource } from "@/lib/client";
import { deliveryOutlet } from "@/lib/delivery";
import { addressSelection, type CustomerProfile, type DeliverySelection, type SavedAddress } from "@/lib/profile-types";
import type { Outlet, User } from "@/lib/types";

export function useDeliveryProfile(user: User | null, authReady: boolean, outlets: Outlet[] | undefined,
  setOutletId: (id: string) => void, setToast: (message: string) => void) {
  const resource = useResource<CustomerProfile>(user ? `/api/account/profile?account=${encodeURIComponent(user.id)}` : null);
  // Never expose the previous person's profile during an account switch.
  const profile = { ...resource, data: resource.data?.id === user?.id ? resource.data : null };
  const owner = authReady ? user?.id || "guest" : "loading";
  const [chosen, setChosen] = useState<{ owner: string; addressId?: string; location?: DeliverySelection } | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const addresses = profile.data?.addresses || [];
  const defaultAddress = addresses.find((address) => address.isDefault);
  const current = chosen?.owner === owner ? chosen : null;
  const saved = current?.addressId ? addresses.find((address) => address.id === current.addressId) : null;
  const deliveryLocation = saved ? addressSelection(saved) : current?.location || (defaultAddress ? addressSelection(defaultAddress) : null);
  const lastRoute = useRef("");
  const outletPolicy = JSON.stringify(outlets?.map(outlet => [outlet.id, outlet.open, outlet.latitude, outlet.longitude, outlet.radiusKm]) || []);
  const routeKey = deliveryLocation ? `${owner}:${deliveryLocation.latitude}:${deliveryLocation.longitude}:${deliveryLocation.localityId || ""}:${outletPolicy}` : "";
  const routeLocation = deliveryLocation;
  useEffect(() => {
    if (!routeKey) { lastRoute.current = ""; return; }
    if (!outlets?.length || !routeLocation || lastRoute.current === routeKey) return;
    lastRoute.current = routeKey;
    try { setOutletId(deliveryOutlet(outlets, routeLocation).id); }
    catch { setToast("This address is outside our open delivery areas. You can choose another address or order for pickup."); }
  }, [routeKey, outlets]);
  useEffect(() => { setLocationOpen(false); }, [owner]);
  function selectDeliveryLocation(location: DeliverySelection) {
    setChosen({ owner, location });
  }
  function selectSavedAddress(id: string) {
    setChosen({ owner, addressId: id });
  }
  function adoptSavedAddress(address: SavedAddress) {
    resource.mutate(currentProfile => currentProfile?.id === user?.id && currentProfile ? {
      ...currentProfile, addresses: [...currentProfile.addresses.filter(item => item.id !== address.id)
        .map(item => address.isDefault ? { ...item, isDefault: false } : item), address],
    } : currentProfile);
  }
  function forgetSavedAddress(id: string) {
    resource.mutate(currentProfile => {
      if (!currentProfile || currentProfile.id !== user?.id) return currentProfile;
      const addresses = currentProfile.addresses.filter(address => address.id !== id).map(address => ({ ...address }));
      if (addresses.length && !addresses.some(address => address.isDefault)) {
        const first = [...addresses].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
        first.isDefault = true;
      }
      return { ...currentProfile, addresses };
    });
  }
  return { profile, deliveryLocation, locationOpen, setLocationOpen, selectDeliveryLocation, selectSavedAddress, adoptSavedAddress, forgetSavedAddress };
}
