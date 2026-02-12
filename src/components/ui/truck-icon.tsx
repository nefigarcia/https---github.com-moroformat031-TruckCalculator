import { cn } from "@/lib/utils";

interface TruckIconProps {
  type: 'LTL' | 'Half Truck' | 'Full Truck' | 'Mixed' | string;
  className?: string;
  occupancy?: number; // 0..1
}

export function TruckIcon({ type, className }: TruckIconProps) {
  // Use the specific dark blue-gray from your image or 'currentColor' to match UI
  const strokeColor = "currentColor"; 

  return (
    <svg
      viewBox="0 0 120 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-20 w-20", className)}
    >
      {/* 1. THE CABIN (Identical across all types) */}
      <g stroke={strokeColor} strokeWidth="3" strokeLinejoin="round">
        <path d="M15 45H40V28H28L15 38V45Z" fill="white" /> {/* Outer Shell */}
        <path d="M25 31H34V39H19L25 31Z" fill="#E5E7EB" strokeWidth="1.5" /> {/* Window */}
        <rect x="12" y="42" width="6" height="3" rx="1" fill={strokeColor} stroke="none" /> {/* Bumper */}
      </g>

      {/* 2. THE TRAILER / CARGO BOX */}
      <g stroke={strokeColor} strokeWidth="3" strokeLinejoin="round">
        {type === 'LTL' ? (
          // Smaller LTL Box
          <>
            <rect x="40" y="24" width="55" height="21" fill="white" />
            {/* occupancy bar for LTL: overlay grey rect width based on occupancy prop */}
            {/* occupancy handled by outer code via className width or via prop; default empty here */}
            <line x1="48" y1="30" x2="58" y2="30" strokeOpacity="0.3" strokeWidth="2" />
            <line x1="48" y1="35" x2="65" y2="35" strokeOpacity="0.3" strokeWidth="2" />
            <line x1="65" y1="30" x2="85" y2="30" strokeOpacity="0.3" strokeWidth="2" />
          </>
        ) : (
          // Larger Semi Trailer
          <>
            <rect x="40" y="20" width="65" height="25" fill="white" />
            {/* Cargo occupancy overlay will be injected by parent by drawing a rect with desired width via a group */}
            {type === 'Half Truck' && (
              <rect x="40" y="20" width="32" height="25" fill="#E6EEF8" stroke="none" />
            )}
            {type === 'Full Truck' && (
              <rect x="40" y="20" width="65" height="25" fill="#E6EEF8" stroke="none" />
            )}
          </>
        )}
      </g>

      {/* 3. THE WHEELS (Positioned exactly as in image) */}
      <g fill="#D1D5DB" stroke={strokeColor} strokeWidth="3">
        {type === 'LTL' ? (
          <>
            <circle cx="28" cy="48" r="5" />
            <circle cx="82" cy="48" r="5" />
          </>
        ) : (
          <>
            <circle cx="28" cy="48" r="5" />
            <circle cx="80" cy="48" r="5" />
            <circle cx="95" cy="48" r="5" />
          </>
        )}
      </g>
    </svg>
  );
}