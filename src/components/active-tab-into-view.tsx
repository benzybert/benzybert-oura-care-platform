"use client";

import { useEffect } from "react";

/**
 * On a phone the data tab's category bar scrolls sideways; after a click the page reloads with the bar at its start,
 * so a category far along (Oxygen, Advanced) would be out of sight. This scrolls the current one into view once.
 */
export function ActiveTabIntoView() {
  useEffect(() => {
    const link = document.querySelector<HTMLElement>('.subtabs a[aria-current="page"]');
    link?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
  return null;
}
