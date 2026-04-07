import React from "react";

const BrazilMap = () => {
  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <svg viewBox="0 0 700 750" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        {/* Brazil realistic outline */}
        <path
          d="M330,45 L360,40 L390,42 L420,50 L445,60 L470,75 L490,90 L505,105 
             L520,125 L535,150 L548,175 L558,200 L565,225 L570,250 L572,275 
             L570,300 L565,325 L558,350 L548,370 L540,385 L530,400 L518,415 
             L505,430 L490,442 L475,455 L458,465 L440,475 L420,485 L400,492 
             L380,498 L360,502 L340,505 L325,508 L310,512 L295,518 L280,525 
             L265,535 L250,548 L238,560 L225,575 L215,590 L205,600 L195,608 
             L182,612 L170,610 L160,602 L152,590 L148,575 L145,558 L140,540 
             L135,520 L128,500 L120,480 L112,458 L105,435 L100,410 L96,385 
             L94,360 L93,335 L94,310 L96,285 L100,260 L106,238 L115,215 
             L125,195 L138,175 L152,158 L168,142 L185,128 L202,115 L220,105 
             L238,95 L255,85 L272,75 L290,65 L308,55 L330,45Z"
          fill="hsl(var(--muted) / 0.12)"
          stroke="hsl(var(--border))"
          strokeWidth="1.5"
        />

        {/* State boundaries - subtle internal lines */}
        {/* Minas Gerais region */}
        <ellipse cx="380" cy="360" rx="55" ry="35" fill="hsl(var(--muted) / 0.06)" stroke="hsl(var(--border) / 0.2)" strokeWidth="0.5" strokeDasharray="3,3" />
        {/* Paraná region */}
        <ellipse cx="320" cy="465" rx="40" ry="22" fill="hsl(var(--muted) / 0.06)" stroke="hsl(var(--border) / 0.2)" strokeWidth="0.5" strokeDasharray="3,3" />
        {/* Rio Grande do Sul region */}
        <ellipse cx="290" cy="545" rx="45" ry="30" fill="hsl(var(--muted) / 0.06)" stroke="hsl(var(--border) / 0.2)" strokeWidth="0.5" strokeDasharray="3,3" />

        {/* São Paulo - highlighted state */}
        <path
          d="M310,410 C330,400 360,402 378,412 C388,420 386,432 376,440 C364,448 346,452 328,449 C312,446 302,436 300,425 C298,418 303,413 310,410Z"
          fill="hsl(var(--accent))"
          stroke="hsl(var(--border))"
          strokeWidth="1"
          className="transition-all duration-300 hover:brightness-110"
        />
        <circle cx="345" cy="425" r="3.5" fill="hsl(var(--primary))" />
        <text x="345" y="425" dy="-10" textAnchor="middle" className="fill-foreground font-semibold text-[11px]">
          São Paulo
        </text>

        {/* Rio de Janeiro (Interior) - highlighted state */}
        <path
          d="M390,385 C408,378 430,381 442,390 C450,397 447,407 438,413 C427,420 412,422 397,418 C385,414 380,404 383,395 C384,391 387,388 390,385Z"
          fill="hsl(var(--accent))"
          stroke="hsl(var(--border))"
          strokeWidth="1"
          className="transition-all duration-300 hover:brightness-110"
        />
        <circle cx="415" cy="400" r="3.5" fill="hsl(var(--primary))" />
        <text x="460" y="395" textAnchor="start" className="fill-foreground font-semibold text-[11px]">
          Rio de Janeiro
        </text>
        <text x="460" y="408" textAnchor="start" className="fill-muted-foreground text-[9px]">
          Interior
        </text>

        {/* Santa Catarina - Major highlight with glow */}
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="cursor-pointer group">
          <path
            d="M285,490 C305,483 330,486 350,492 C365,497 372,506 368,516 C363,526 350,532 332,534 C314,536 296,531 284,522 C275,514 274,502 285,490Z"
            fill="hsl(var(--primary))"
            className="drop-shadow-lg transition-all duration-300 group-hover:brightness-110"
            stroke="hsl(var(--primary-foreground))"
            strokeWidth="1.5"
            filter="url(#glow)"
          />
          <circle cx="325" cy="510" r="5" fill="hsl(var(--primary-foreground))" />
          <text x="325" y="550" textAnchor="middle" className="fill-primary font-bold text-[14px]">
            Santa Catarina
          </text>
          <text x="325" y="565" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            Base Principal
          </text>
          {/* Pulse ring */}
          <circle cx="325" cy="510" r="14" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" opacity="0.5">
            <animate attributeName="r" from="14" to="28" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* Watermark */}
        <text x="340" y="230" textAnchor="middle" className="fill-muted-foreground/20 text-[44px] font-bold tracking-[0.2em] select-none">
          BRASIL
        </text>

        {/* Legend */}
        <g transform="translate(40, 640)">
          <rect x="0" y="0" width="14" height="14" rx="3" fill="hsl(var(--primary))" />
          <text x="22" y="11" className="fill-foreground text-[11px]">Atuação Principal</text>
          <rect x="160" y="0" width="14" height="14" rx="3" fill="hsl(var(--accent))" stroke="hsl(var(--border))" strokeWidth="0.5" />
          <text x="182" y="11" className="fill-foreground text-[11px]">Atuação Regional</text>
        </g>
      </svg>
    </div>
  );
};

export default BrazilMap;
