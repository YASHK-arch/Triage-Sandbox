import React from "react";

function StreamBoxLogo({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="StreamBox"
    >
      <defs>
        <linearGradient id="sbGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E50914" />
          <stop offset="100%" stopColor="#B00610" />
        </linearGradient>
      </defs>

      {/* Play glyph */}
      <path
        d="M6 4.6a3 3 0 0 1 4.5-2.6l17 9.8a3 3 0 0 1 0 5.2l-17 9.8a3 3 0 0 1-4.5-2.6V4.6Z"
        fill="url(#sbGrad)"
      />

      {/* Wordmark */}
      <text
        x="38"
        y="23.5"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="19"
        fontWeight="800"
        letterSpacing="0.5"
        fill="#fff"
      >
        StreamBox
      </text>
    </svg>
  );
}

export default StreamBoxLogo;
