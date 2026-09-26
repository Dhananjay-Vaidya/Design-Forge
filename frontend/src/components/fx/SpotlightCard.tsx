import { type HTMLAttributes, forwardRef } from "react";

import { trackSpotlight } from "./spotlight";

export const SpotlightCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = "", onPointerMove, ...props }, ref) => (
    <div
      ref={ref}
      className={`spotlight ${className}`}
      onPointerMove={(e) => {
        trackSpotlight(e);
        onPointerMove?.(e);
      }}
      {...props}
    />
  ),
);
SpotlightCard.displayName = "SpotlightCard";
