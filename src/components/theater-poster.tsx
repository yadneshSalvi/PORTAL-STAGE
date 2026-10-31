import { useId } from "react";

/** Original authored scenery. These camera plates deliberately contain no people. */
export function TheaterPoster({
  weather = "gentle",
  className = "",
  compact = false,
}: {
  weather?: "gentle" | "wild";
  className?: string;
  compact?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`theater-poster ${className}`}
      viewBox="0 0 1440 810"
      role="img"
      aria-label="Illustrated Borrowed Weather stage: two arched rooms, a patched umbrella, a luminous portal, and Pip, an original little rain creature. No live cameras."
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" x2="0" y2="1">
          <stop stopColor="#171D2D" />
          <stop offset="1" stopColor="#30243A" />
        </linearGradient>
        <linearGradient id={`${id}-left`} x2="0" y2="1">
          <stop stopColor="#244F56" />
          <stop offset="1" stopColor="#172C3B" />
        </linearGradient>
        <linearGradient id={`${id}-right`} x2="0" y2="1">
          <stop stopColor="#68505C" />
          <stop offset="1" stopColor="#30243A" />
        </linearGradient>
        <linearGradient id={`${id}-floor`} x2="0" y2="1">
          <stop stopColor="#8C6456" />
          <stop offset=".13" stopColor="#49363E" />
          <stop offset="1" stopColor="#1B1D2B" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop stopColor="#F2BC62" stopOpacity=".34" />
          <stop offset=".6" stopColor="#64D8C8" stopOpacity=".08" />
          <stop offset="1" stopColor="#64D8C8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-curtain`}>
          <stop stopColor="#261D31" />
          <stop offset=".4" stopColor="#4C3149" />
          <stop offset=".65" stopColor="#322337" />
          <stop offset="1" stopColor="#1D1929" />
        </linearGradient>
        <clipPath id={`${id}-a`}>
          <path d="M113 588V341a222 222 0 0 1 444 0v247Z" />
        </clipPath>
        <clipPath id={`${id}-b`}>
          <path d="M883 588V341a222 222 0 0 1 444 0v247Z" />
        </clipPath>
        <filter id={`${id}-blur`}>
          <feGaussianBlur stdDeviation="13" />
        </filter>
      </defs>
      <rect width="1440" height="810" fill={`url(#${id}-bg)`} />
      <ellipse cx="720" cy="398" rx="330" ry="350" fill={`url(#${id}-glow)`} />
      <g opacity=".33" fill="#F3EBDC">
        {Array.from({ length: 38 }, (_, i) => (
          <circle
            key={i}
            cx={74 + ((i * 131) % 1285)}
            cy={94 + ((i * 59) % 455)}
            r={i % 5 === 0 ? 2 : 1}
          />
        ))}
      </g>
      <g clipPath={`url(#${id}-a)`}>
        <path
          d="M113 588V341a222 222 0 0 1 444 0v247Z"
          fill={`url(#${id}-left)`}
        />
        <circle cx="260" cy="272" r="57" fill="#F3EBDC" opacity=".88" />
        <circle cx="279" cy="257" r="49" fill="#244F56" />
        <path
          d="M99 500 230 390l104 115 104-72 131 113v76H99Z"
          fill="#36646A"
        />
        <path d="m90 556 153-87 120 91 99-45 119 77v56H90Z" fill="#1D414A" />
        <path d="M116 576h441v42H116Z" fill="#355359" />
        <g fill="none" stroke="#90C0AE" strokeWidth="3" opacity=".65">
          <path d="M175 588q-5-82 26-126m-21 87-32-22m36 1 35-31m-37 65-36-14m38-33-18-32M485 588q9-107-30-142m24 85-32-18m30-6 25-33m-29 87 35-25" />
        </g>
        <path d="M356 393h96v164h-96Z" fill="#F3EBDC" opacity=".07" />
        <path
          d="M368 406h72v139h-72Z"
          fill="none"
          stroke="#B4B48C"
          opacity=".35"
        />
        <text
          x="335"
          y="548"
          fill="#D9E8DA"
          fontSize="15"
          textAnchor="middle"
          letterSpacing="3"
          fontFamily="Inter, sans-serif"
        >
          MOON GARDEN
        </text>
      </g>
      <g clipPath={`url(#${id}-b)`}>
        <path
          d="M883 588V341a222 222 0 0 1 444 0v247Z"
          fill={`url(#${id}-right)`}
        />
        <circle cx="1187" cy="269" r="58" fill="#F2BC62" opacity=".72" />
        <g fill="#D2A49A" opacity=".35">
          <path d="M849 420q49-63 99 0 39-43 78 0Z" />
          <path d="M1146 360q42-52 84 0 36-34 72 0Z" />
        </g>
        <path d="M866 570v-97h483v97" fill="#513D4C" />
        <path
          d="M899 464h411M899 489h411"
          stroke="#C9A291"
          strokeWidth="4"
          opacity=".48"
        />
        <g stroke="#C9A291" strokeWidth="3" opacity=".45">
          {Array.from({ length: 11 }, (_, i) => (
            <path key={i} d={`M${916 + i * 37} 465v108`} />
          ))}
        </g>
        <path d="M968 552h86l-5 39h-75Z" fill="#BB8D6C" />
        <g fill="none" stroke="#8EAAA0" strokeWidth="5" strokeLinecap="round">
          <path d="M1010 555q-52-51-39-79m39 79q50-59 32-91m-34 91q-9-76 9-103m-10 82-30-14m35-2 27-19" />
        </g>
        <text
          x="1105"
          y="548"
          fill="#F0D7C7"
          fontSize="15"
          textAnchor="middle"
          letterSpacing="3"
          fontFamily="Inter, sans-serif"
        >
          ROOFTOP AT DUSK
        </text>
      </g>
      <g fill="none" stroke="#E6BD79">
        <path
          d="M105 595V341a230 230 0 0 1 460 0v254"
          strokeWidth="3"
          opacity=".8"
        />
        <path d="M92 601V341a243 243 0 0 1 486 0v260" opacity=".32" />
        <path
          d="M875 595V341a230 230 0 0 1 460 0v254"
          strokeWidth="3"
          opacity=".8"
        />
        <path d="M862 601V341a243 243 0 0 1 486 0v260" opacity=".32" />
      </g>
      <g transform="translate(720 380)">
        <circle
          r="116"
          fill="#E8CF8C"
          opacity=".1"
          filter={`url(#${id}-blur)`}
        />
        <circle r="94" fill="#182C35" stroke="#F2BC62" strokeWidth="2" />
        <circle r="105" fill="none" stroke="#64D8C8" opacity=".5" />
        <circle r="113" fill="none" stroke="#F2BC62" opacity=".23" />
        <circle r="76" fill="none" stroke="#64D8C8" opacity=".14" />
        <path
          d="m0-32 7 24 25 8-25 8-7 24-8-24-24-8 24-8Z"
          fill="#F2BC62"
          opacity=".9"
        />
        <circle cx="0" cy="-105" r="5" fill="#F2BC62" />
        <circle cx="91" cy="52" r="3" fill="#64D8C8" />
        <circle cx="-91" cy="52" r="3" fill="#64D8C8" />
      </g>
      <g
        stroke={weather === "wild" ? "#9BDEDC" : "#BCE2DB"}
        strokeWidth="1.7"
        opacity={weather === "wild" ? ".52" : ".28"}
      >
        {Array.from({ length: weather === "wild" ? 100 : 42 }, (_, i) => {
          const x = 125 + ((i * 107) % 1200);
          const y = 175 + ((i * 83) % 380);
          return (
            <path
              key={i}
              d={`M${x} ${y}l${weather === "wild" ? -10 : -3} 16`}
            />
          );
        })}
      </g>
      <path d="M0 601h1440v209H0Z" fill={`url(#${id}-floor)`} />
      <path
        d="M63 608h1314M0 645h1440M0 699h1440M0 772h1440"
        stroke="#B98B6F"
        opacity=".18"
      />
      {[130, 330, 550, 890, 1110, 1310].map((x) => (
        <path
          key={x}
          d={`M${720 + (x - 720) * 0.7} 608 ${x} 810`}
          stroke="#0E1421"
          strokeWidth="2"
          opacity=".5"
        />
      ))}
      <path d="M90 596h482v16H90Zm770 0h484v16H860Z" fill="#BC8D6F" />
      <path d="M90 612h482v11H90Zm770 0h484v11H860Z" fill="#2D2531" />
      <ellipse cx="533" cy="656" rx="145" ry="14" fill="#101E29" opacity=".4" />
      <g transform="translate(491 472) rotate(-9)">
        <path
          d="M-134 0Q-110-94 0-103 111-94 134 0q-24-18-45 0-24-18-45 0-23-18-45 0-22-18-44 0-23-18-45 0Z"
          fill="#E8D5A5"
        />
        <path
          d="M0-103Q-70-69-45 0-22-18 0 0 22-18 45 0 69-73 0-103Z"
          fill="#64AFA5"
        />
        <path
          d="M0-103q100 13 134 103-24-18-45 0Q76-74 0-103Z"
          fill="#428980"
        />
        <path
          d="M51-59 80-67l17 28-29 11Z"
          fill="#F17E78"
          stroke="#FFE8D2"
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />
        <path
          d="M0 0v133q0 23 19 23t19-21"
          fill="none"
          stroke="#F2BC62"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M0-112v9"
          stroke="#F2BC62"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <g fill="#94DBCE">
          <path d="M-102 21q-8 13 0 14 8-1 0-14Zm182-4q-7 12 0 13 7-1 0-13Z" />
        </g>
      </g>
      <ellipse cx="817" cy="656" rx="53" ry="8" fill="#101E29" opacity=".45" />
      <g transform="translate(813 607)">
        <path
          d="M-21-6q-32-38-13-50 17-5 20 36M21-6q32-38 13-50-17-5-20 36"
          fill="#5AAE9F"
        />
        <ellipse cy="6" rx="38" ry="42" fill="#9CDEBD" />
        <path
          d="M-28-16q0-19 22-15"
          fill="none"
          stroke="#DBEED3"
          strokeWidth="5"
          strokeLinecap="round"
          opacity=".6"
        />
        <ellipse cx="-13" cy="4" rx="5" ry="7" fill="#192C34" />
        <ellipse cx="13" cy="4" rx="5" ry="7" fill="#192C34" />
        <circle cx="-14" cy="2" r="1.7" fill="#F3EBDC" />
        <circle cx="12" cy="2" r="1.7" fill="#F3EBDC" />
        <path
          d="M-5 17q5 5 10 0"
          fill="none"
          stroke="#355B53"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <ellipse cx="-24" cy="14" rx="7" ry="4" fill="#F17E78" opacity=".7" />
        <ellipse cx="24" cy="14" rx="7" ry="4" fill="#F17E78" opacity=".7" />
        <ellipse cx="-20" cy="43" rx="12" ry="6" fill="#609F8F" />
        <ellipse cx="20" cy="43" rx="12" ry="6" fill="#609F8F" />
      </g>
      <g fill={`url(#${id}-curtain)`}>
        <path d="M0 0h108q-5 126-35 227L39 584 0 624Z" />
        <path d="M1440 0h-108q5 126 35 227l34 357 39 40Z" />
        <path d="M0 0h1440v49q-172 73-347 1-182 86-373 3-191 83-373-3Q172 122 0 49Z" />
      </g>
      <path
        d="M77 0q-3 236-38 584M1363 0q3 236 38 584"
        fill="none"
        stroke="#9E6E5B"
        strokeWidth="2"
        opacity=".45"
      />
      <path
        d="M0 65q174 71 347-1 183 86 373 3 190 83 373-3 175 72 347 1"
        fill="none"
        stroke="#B58D61"
        opacity=".45"
      />
      <text
        x="720"
        y="112"
        fontFamily="Fraunces, Georgia, serif"
        fontSize="30"
        textAnchor="middle"
        fill="#F3EBDC"
        letterSpacing="1"
      >
        Borrowed Weather
      </text>
      <text
        x="720"
        y="752"
        fontFamily="Inter, sans-serif"
        fontSize={compact ? "19" : "15"}
        textAnchor="middle"
        fill="#B8BFC9"
        letterSpacing="2"
      >
        ILLUSTRATED REHEARSAL · NO LIVE CAMERAS
      </text>
    </svg>
  );
}
