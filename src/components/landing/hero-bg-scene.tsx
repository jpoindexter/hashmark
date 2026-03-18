import { WheatStalks } from "./hero-wheat";

export function HeroBgScene() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        viewBox="0 0 430 900"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Sky gradient */}
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ABFCB" />
            <stop offset="45%" stopColor="#7EC8D8" />
            <stop offset="100%" stopColor="#C2E8F0" />
          </linearGradient>

          {/* Hill gradient */}
          <linearGradient id="hillGrad1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C8A84B" />
            <stop offset="100%" stopColor="#A8882A" />
          </linearGradient>
          <linearGradient id="hillGrad2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4B55A" />
            <stop offset="100%" stopColor="#B89838" />
          </linearGradient>
          <linearGradient id="hillFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8FAF62" />
            <stop offset="100%" stopColor="#6E8F44" />
          </linearGradient>

          {/* Wheat foreground gradient */}
          <linearGradient id="wheatGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C8961E" />
            <stop offset="100%" stopColor="#7A5C10" />
          </linearGradient>

          {/* Building glass */}
          <linearGradient id="glassGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(180,220,230,0.5)" />
            <stop offset="100%" stopColor="rgba(140,190,210,0.2)" />
          </linearGradient>

          {/* Cloud filter for softness */}
          <filter id="cloudBlur">
            <feGaussianBlur stdDeviation="2" />
          </filter>
          <filter id="softBlur">
            <feGaussianBlur stdDeviation="1" />
          </filter>
        </defs>

        {/* ── SKY ─────────────────────────────────────── */}
        <rect width="430" height="900" fill="url(#skyGrad)" />

        {/* ── CLOUDS ──────────────────────────────────── */}
        {/* Main large cloud cluster - center */}
        <g opacity="0.95">
          <ellipse cx="180" cy="110" rx="90" ry="55" fill="white" />
          <ellipse cx="240" cy="95" rx="75" ry="48" fill="white" />
          <ellipse cx="155" cy="125" rx="65" ry="40" fill="white" />
          <ellipse cx="200" cy="130" rx="80" ry="42" fill="white" />
          <ellipse cx="270" cy="120" rx="55" ry="35" fill="#F5F5F5" />
          <ellipse cx="130" cy="115" rx="50" ry="32" fill="white" />
          <ellipse cx="310" cy="135" rx="45" ry="30" fill="#F0F0F0" />
        </g>

        {/* Secondary cloud left */}
        <g opacity="0.85">
          <ellipse cx="50" cy="145" rx="55" ry="32" fill="white" />
          <ellipse cx="80" cy="132" rx="45" ry="28" fill="white" />
          <ellipse cx="20" cy="155" rx="35" ry="22" fill="#EFEFEF" />
        </g>

        {/* Secondary cloud right */}
        <g opacity="0.8">
          <ellipse cx="390" cy="130" rx="45" ry="28" fill="white" />
          <ellipse cx="415" cy="120" rx="30" ry="22" fill="#F5F5F5" />
        </g>

        {/* Cloud shadows / depth */}
        <ellipse cx="185" cy="148" rx="78" ry="18" fill="rgba(180,210,220,0.3)" />
        <ellipse cx="245" cy="138" rx="60" ry="14" fill="rgba(180,210,220,0.2)" />

        {/* ── FAR HILLS ───────────────────────────────── */}
        <path
          d="M0,290 C40,255 90,240 130,252 C170,264 200,248 250,250 C300,252 360,262 430,255 L430,320 L0,320 Z"
          fill="url(#hillFar)"
          opacity="0.7"
        />
        <path
          d="M0,295 C50,265 100,252 150,258 C200,264 240,255 280,258 C330,262 380,268 430,260 L430,325 L0,325 Z"
          fill="#7DA85A"
          opacity="0.5"
        />

        {/* ── NEAR HILLS / PLAINS ─────────────────────── */}
        <path
          d="M0,310 C60,290 120,285 180,292 C240,299 300,288 370,294 C400,297 420,300 430,298 L430,380 L0,380 Z"
          fill="url(#hillGrad2)"
        />
        <path
          d="M0,330 C50,315 130,308 200,318 C270,328 350,312 430,320 L430,390 L0,390 Z"
          fill="url(#hillGrad1)"
        />

        {/* ── BUILDING STRUCTURE (right side) ─────────── */}
        {/* Roof overhang */}
        <path
          d="M280,160 L430,140 L430,185 L280,205 Z"
          fill="#E8E2D8"
          stroke="#D0CAC0"
          strokeWidth="0.5"
        />
        {/* Roof edge underside shadow */}
        <path
          d="M280,203 L430,183 L430,188 L280,208 Z"
          fill="#C8C2B8"
          opacity="0.6"
        />

        {/* Main wall / column right */}
        <rect x="400" y="170" width="30" height="450" fill="#D8D2C8" />
        <rect x="398" y="170" width="4" height="450" fill="#C0BAB0" />

        {/* Glass railing / walkway platform */}
        <rect x="270" y="200" width="160" height="4" fill="#C8D8E0" opacity="0.9" />
        <rect x="270" y="200" width="160" height="60" fill="url(#glassGrad)" />
        <rect x="270" y="258" width="160" height="3" fill="#A8C0CC" opacity="0.6" />

        {/* Railing vertical posts */}
        {[275, 300, 325, 350, 375, 400].map((x) => (
          <rect key={x} x={x} y={200} width="1.5" height="62" fill="rgba(160,190,200,0.6)" />
        ))}

        {/* Column left of railing */}
        <rect x="270" y="200" width="8" height="380" fill="#D0CCC2" />
        <rect x="268" y="200" width="3" height="380" fill="#B8B4AA" opacity="0.8" />

        {/* Secondary column further left */}
        <rect x="305" y="240" width="6" height="340" fill="#D4D0C6" opacity="0.8" />

        {/* Building interior wall hint */}
        <rect x="270" y="260" width="160" height="300" fill="rgba(220,215,205,0.3)" />

        {/* ── WIRE / CABLE SCULPTURE ───────────────────── */}
        <g stroke="#A8A090" strokeWidth="1.5" fill="none" opacity="0.85">
          {/* Main looping wire */}
          <path d="M418,175 C425,200 430,230 422,260 C414,290 418,320 425,350 C432,380 428,410 420,440" />
          <path d="M422,175 C430,205 435,238 426,268 C418,298 422,328 430,358 C437,388 432,418 424,448" />
          {/* Loop detail */}
          <path d="M418,220 C435,225 440,240 430,252 C420,264 415,258 418,245 C421,232 432,228 435,238" />
          <path d="M420,300 C440,308 444,326 432,338 C420,350 414,342 418,328 C422,314 436,312 438,324" />
          {/* Hanging element */}
          <line x1="418" y1="175" x2="418" y2="165" />
          <circle cx="418" cy="162" r="4" fill="#A8A090" />
        </g>

        {/* ── PEOPLE ON WALKWAY ────────────────────────── */}
        {/* Person 1 - walking left to right */}
        <g transform="translate(312, 188)">
          <circle cx="0" cy="-14" r="5" fill="#5A5048" />
          <line x1="0" y1="-9" x2="0" y2="2" stroke="#5A5048" strokeWidth="2.5" />
          <line x1="0" y1="-3" x2="-7" y2="4" stroke="#5A5048" strokeWidth="1.5" />
          <line x1="0" y1="-3" x2="6" y2="1" stroke="#5A5048" strokeWidth="1.5" />
          <line x1="0" y1="2" x2="-5" y2="11" stroke="#5A5048" strokeWidth="1.5" />
          <line x1="0" y1="2" x2="5" y2="9" stroke="#5A5048" strokeWidth="1.5" />
        </g>

        {/* Person 2 - slightly behind */}
        <g transform="translate(338, 190)">
          <circle cx="0" cy="-12" r="4.5" fill="#7A6A58" />
          <line x1="0" y1="-8" x2="0" y2="2" stroke="#7A6A58" strokeWidth="2" />
          <line x1="0" y1="-2" x2="-5" y2="3" stroke="#7A6A58" strokeWidth="1.5" />
          <line x1="0" y1="-2" x2="4" y2="2" stroke="#7A6A58" strokeWidth="1.5" />
          <line x1="0" y1="2" x2="-4" y2="10" stroke="#7A6A58" strokeWidth="1.5" />
          <line x1="0" y1="2" x2="4" y2="9" stroke="#7A6A58" strokeWidth="1.5" />
        </g>

        {/* ── WHEAT FIELD FLOOR (mid ground) ──────────── */}
        <rect x="0" y="370" width="430" height="30" fill="#C8961E" opacity="0.6" />

        {/* ── FURNITURE VIGNETTE ───────────────────────── */}
        {/* Gravel / ground circle */}
        <ellipse cx="175" cy="480" rx="90" ry="22" fill="#C0B090" opacity="0.6" />

        {/* Wooden planter boxes - left */}
        <rect x="55" y="420" width="28" height="35" rx="2" fill="#7A5C30" />
        <rect x="55" y="418" width="28" height="6" rx="1" fill="#8A6C40" />
        {/* Plant in box left */}
        <path d="M60,418 C58,400 55,385 62,375" stroke="#4A7030" strokeWidth="2" fill="none" />
        <path d="M72,418 C74,398 78,382 72,370" stroke="#4A7030" strokeWidth="2" fill="none" />
        <ellipse cx="62" cy="374" rx="8" ry="5" fill="#5A8038" opacity="0.8" />
        <ellipse cx="72" cy="370" rx="7" ry="4" fill="#4A7030" opacity="0.8" />

        {/* TV / monitor setup */}
        <rect x="120" y="430" width="50" height="32" rx="2" fill="#1A1A1A" />
        <rect x="122" y="432" width="46" height="26" rx="1" fill="#1E3A5A" />
        {/* Screen glow */}
        <rect x="122" y="432" width="46" height="26" rx="1" fill="#2060A0" opacity="0.5" />
        <circle cx="145" cy="445" r="8" fill="#1040A0" opacity="0.4" />
        <circle cx="145" cy="445" r="5" fill="#3080D0" opacity="0.3" />
        {/* TV stand */}
        <rect x="141" y="462" width="8" height="8" fill="#2A2A2A" />
        <rect x="134" y="469" width="22" height="3" rx="1" fill="#2A2A2A" />

        {/* Green sofa / chair - main */}
        <rect x="160" y="450" width="55" height="28" rx="4" fill="#7AB060" />
        <rect x="160" y="440" width="55" height="14" rx="3" fill="#8AC070" />
        <rect x="158" y="438" width="8" height="38" rx="2" fill="#6A9850" />
        <rect x="209" y="438" width="8" height="38" rx="2" fill="#6A9850" />
        {/* Cushion detail */}
        <rect x="163" y="451" width="22" height="20" rx="3" fill="#88B868" opacity="0.7" />
        <rect x="188" y="451" width="22" height="20" rx="3" fill="#88B868" opacity="0.7" />

        {/* Small side chair */}
        <rect x="225" y="456" width="32" height="22" rx="3" fill="#8ABE68" />
        <rect x="225" y="448" width="32" height="10" rx="2" fill="#9ACE78" />
        <rect x="223" y="446" width="6" height="30" rx="2" fill="#6A9850" />
        <rect x="253" y="446" width="6" height="30" rx="2" fill="#6A9850" />

        {/* Tall palm plant right of furniture */}
        <path d="M260,470 C258,440 256,410 260,385" stroke="#5A7830" strokeWidth="3" fill="none" />
        <path d="M260,385 C252,372 240,368 232,372" stroke="#5A7830" strokeWidth="2" fill="none" />
        <path d="M260,385 C268,370 280,366 288,372" stroke="#5A7830" strokeWidth="2" fill="none" />
        <path d="M260,390 C250,378 245,368 248,360" stroke="#4A6820" strokeWidth="1.5" fill="none" />
        <path d="M260,390 C272,378 276,368 274,360" stroke="#4A6820" strokeWidth="1.5" fill="none" />
        <ellipse cx="232" cy="374" rx="10" ry="5" fill="#6A9038" opacity="0.8" transform="rotate(-20,232,374)" />
        <ellipse cx="288" cy="374" rx="10" ry="5" fill="#6A9038" opacity="0.8" transform="rotate(20,288,374)" />
        <ellipse cx="248" cy="360" rx="8" ry="4" fill="#5A8028" opacity="0.7" transform="rotate(-30,248,360)" />
        <ellipse cx="274" cy="360" rx="8" ry="4" fill="#5A8028" opacity="0.7" transform="rotate(30,274,360)" />

        {/* Planter pot for palm */}
        <path d="M252,470 L268,470 L265,490 L255,490 Z" fill="#8A6040" />
        <rect x="250" y="468" width="20" height="5" rx="1" fill="#9A7050" />

        {/* Power pole / lamp post center */}
        <rect x="195" y="295" width="3" height="130" fill="#8A8078" />
        <rect x="191" y="293" width="11" height="4" rx="1" fill="#7A7068" />
        <rect x="185" y="291" width="8" height="3" rx="1" fill="#9A9088" />

        {/* ── WHEAT STALKS FOREGROUND ─────────────────── */}
        <WheatStalks />

        {/* ── FADE TO CREAM AT BOTTOM ──────────────────── */}
        <defs>
          <linearGradient id="fadeOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(253,252,249,0)" />
            <stop offset="55%" stopColor="rgba(253,252,249,0.5)" />
            <stop offset="85%" stopColor="rgba(253,252,249,0.92)" />
            <stop offset="100%" stopColor="rgba(253,252,249,1)" />
          </linearGradient>
        </defs>
        <rect width="430" height="900" fill="url(#fadeOut)" />
      </svg>
    </div>
  );
}
