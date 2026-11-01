import { useId } from "react";

export function ParcelPoster() {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className="theater-poster"
      viewBox="0 0 1440 810"
      role="img"
      aria-label="Original illustrated Midnight Parcel poster: a tagged parcel in a moonlit sorting office. No live cameras."
    >
      <defs>
        <linearGradient id={`${id}-night`} x2="0" y2="1">
          <stop stopColor="#202d40" />
          <stop offset="1" stopColor="#493343" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop stopColor="#eab467" stopOpacity=".3" />
          <stop offset="1" stopColor="#eab467" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-box`}>
          <stop stopColor="#d4a977" />
          <stop offset="1" stopColor="#ac7656" />
        </linearGradient>
      </defs>
      <rect width="1440" height="810" fill={`url(#${id}-night)`} />
      <ellipse cx="720" cy="430" rx="520" ry="350" fill={`url(#${id}-glow)`} />
      <path
        d="M170 570V310a190 190 0 0 1 380 0v260M890 570V310a190 190 0 0 1 380 0v260"
        fill="#1b293a"
        stroke="#ceab7555"
        strokeWidth="5"
      />
      <circle cx="1080" cy="285" r="88" fill="#e8d5ad" />
      <circle cx="1110" cy="263" r="78" fill="#1b293a" />
      {Array.from({ length: 30 }, (_, i) => (
        <circle
          key={i}
          cx={185 + ((i * 131) % 1060)}
          cy={160 + ((i * 71) % 320)}
          r={i % 4 ? 1.5 : 3}
          fill="#eedbb8"
          opacity=".55"
        />
      ))}
      {[250, 345, 440].map((y, row) => (
        <g key={y}>
          <path d={`M208 ${y}h290`} stroke="#a7785b" strokeWidth="14" />
          {Array.from({ length: 6 }, (_, i) => (
            <path
              key={i}
              d={`M${220 + i * 44} ${y - 60}h32v51h-32Z`}
              fill={["#70968d", "#b3866d", "#d0b58b"][(row + i) % 3]}
            />
          ))}
        </g>
      ))}
      <path d="M60 625h1320v28H60z" fill="#aa7759" />
      <path d="M80 653h1280v157H80z" fill="#332c38" />
      <path d="m578 329 264-18 70 56-272 25Z" fill="#e2bd8f" />
      <path d="m640 392 272-25v207l-272 35Z" fill={`url(#${id}-box)`} />
      <path d="m578 329 62 63v217l-62-59Z" fill="#a87958" />
      <path
        d="m738 320 15 60v215M583 436l56 44 272-30"
        fill="none"
        stroke="#d9857d"
        strokeWidth="20"
      />
      <g transform="translate(782 415) rotate(-9)">
        <path
          d="M0 0h143l30 56-30 55H0Z"
          fill="#f0e1bf"
          stroke="#95705a"
          strokeWidth="3"
        />
        <text
          x="15"
          y="31"
          fontFamily="Inter, Arial"
          fontSize="15"
          fill="#5c4549"
        >
          MIDNIGHT POST
        </text>
        <text
          x="15"
          y="65"
          fontFamily="Fraunces, Georgia"
          fontSize="25"
          fill="#493842"
        >
          For the other side.
        </text>
        <circle
          cx="137"
          cy="87"
          r="20"
          fill="none"
          stroke="#d58479"
          strokeWidth="3"
        />
      </g>
      <path
        d="m588 342 24 29m-31-12 25 3M891 552l-24 26m15-4-2-17"
        stroke="#805442"
        strokeWidth="3"
        fill="none"
      />
      <path
        d="M0 0h1440v52q-180 85-360 0-180 85-360 0-180 85-360 0Q180 137 0 52Z"
        fill="#342638"
      />
      <path d="M0 0h95L34 642 0 681ZM1440 0h-95l61 642 34 39Z" fill="#3c2b40" />
      <text
        x="720"
        y="118"
        textAnchor="middle"
        fontFamily="Fraunces, Georgia"
        fontSize="39"
        fill="#f3ebdc"
      >
        The Midnight Parcel
      </text>
    </svg>
  );
}
