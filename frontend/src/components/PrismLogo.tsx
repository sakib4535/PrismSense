import React from 'react';

/** PrismSense mark. Shared by the landing page and the workspace sidebar. */
export function PrismLogo({size = 28}: {size?: number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" role="img" aria-label="PrismSense logo" focusable="false">
      <defs>
        <linearGradient id="pl-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7c9bff"/><stop offset="1" stopColor="#3f58d6"/></linearGradient>
        <linearGradient id="pl-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a57cf0"/><stop offset="1" stopColor="#ff7355"/></linearGradient>
      </defs>
      <path d="M14 2 4 18l10 8V2z" fill="url(#pl-a)"/>
      <path d="m14 2 10 16-10 8V2z" fill="url(#pl-b)"/>
      <path d="M4 18h20l-10 8L4 18z" fill="#fff" opacity=".28"/>
    </svg>
  );
}
