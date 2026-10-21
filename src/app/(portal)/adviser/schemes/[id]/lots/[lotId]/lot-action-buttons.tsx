"use client";

import { useState } from "react";
import { Users, Mail } from "lucide-react";
import { DeliveryModal } from "./delivery-modal";

type DeliveryPref = {
  category: string;
  deliveryMethod: string;
  recipientType: string;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientAddress: string | null;
  recipientSuburb: string | null;
  recipientState: string | null;
  recipientPostcode: string | null;
};

export function LotActionButtons({
  schemeId,
  lotId,
  deliveryPrefs,
}: {
  schemeId: string;
  lotId: string;
  deliveryPrefs: DeliveryPref[];
}) {
  const [deliveryOpen, setDeliveryOpen] = useState(false);

  // Build initial data from saved prefs
  const annualPref = deliveryPrefs.find((p) => p.category === "ANNUAL_NOTICES");
  const generalPref = deliveryPrefs.find(
    (p) => p.category === "GENERAL_CORRESPONDENCE",
  );

  function prefToData(pref: DeliveryPref | undefined) {
    if (!pref) return undefined;
    return {
      deliveryMethod: pref.deliveryMethod,
      recipientType: pref.recipientType,
      recipientName: pref.recipientName ?? "",
      recipientEmail: pref.recipientEmail ?? "",
      recipientAddress: pref.recipientAddress ?? "",
      recipientSuburb: pref.recipientSuburb ?? "",
      recipientState: pref.recipientState ?? "",
      recipientPostcode: pref.recipientPostcode ?? "",
    };
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setDeliveryOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-full px-4 h-9 text-xs font-semibold uppercase tracking-[0.04em] transition-colors bg-white border-[1.5px] border-turquoise text-turquoise hover:bg-turquoise/5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-turquoise"
      >
        <Mail size={14} />
        Delivery
      </button>

      <DeliveryModal
        isOpen={deliveryOpen}
        onClose={() => setDeliveryOpen(false)}
        schemeId={schemeId}
        lotId={lotId}
        initialNotices={prefToData(annualPref)}
        initialCorrespondence={prefToData(generalPref)}
      />
    </>
  );
}
