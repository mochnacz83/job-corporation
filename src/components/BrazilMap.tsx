import React from "react";

const BrazilMap = () => {
  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <svg viewBox="0 0 600 650" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        {/* Brazil outline simplified */}
        <path
          d="M280,30 C320,25 370,35 400,50 C430,65 460,90 480,120 C500,150 520,180 530,210 C540,240 545,270 540,300 C535,330 530,360 520,390 C510,410 500,430 490,450 C475,470 460,485 440,500 C420,510 400,520 380,530 C360,540 340,545 320,548 C300,550 280,548 260,540 C240,530 220,515 200,500 C180,480 165,460 155,440 C140,420 130,400 120,375 C110,350 105,325 100,300 C95,275 95,250 100,225 C105,200 110,175 120,155 C135,130 150,110 170,90 C190,70 210,55 230,45 C250,35 265,32 280,30Z"
          fill="hsl(var(--muted) / 0.15)"
          stroke="hsl(var(--border))"
          strokeWidth="1.5"
        />

        {/* Santa Catarina - Major highlight */}
        <g className="cursor-pointer group">
          <path
            d="M310,430 C325,425 345,428 360,432 C370,436 375,442 372,450 C368,458 358,462 345,464 C330,466 315,462 305,456 C298,450 300,440 310,430Z"
            fill="hsl(var(--primary))"
            className="drop-shadow-lg transition-all duration-300 group-hover:brightness-110"
            stroke="hsl(var(--primary-foreground))"
            strokeWidth="1.5"
          />
          <circle cx="338" cy="446" r="4" fill="hsl(var(--primary-foreground))" />
          <text x="338" y="480" textAnchor="middle" className="fill-primary font-bold text-[13px]">
            Santa Catarina
          </text>
          <text x="338" y="495" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            Base Principal
          </text>
          {/* Pulse ring */}
          <circle cx="338" cy="446" r="12" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" opacity="0.5">
            <animate attributeName="r" from="12" to="24" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* São Paulo */}
        <g className="cursor-pointer group">
          <path
            d="M280,380 C300,370 325,372 340,380 C350,386 348,396 340,404 C330,412 315,416 300,414 C285,412 274,404 272,395 C270,388 274,383 280,380Z"
            fill="hsl(var(--sidebar-background))"
            className="transition-all duration-300 group-hover:brightness-125"
            stroke="hsl(var(--sidebar-foreground) / 0.3)"
            strokeWidth="1"
          />
          <circle cx="308" cy="393" r="3" fill="hsl(var(--primary-foreground))" />
          <text x="268" y="400" textAnchor="end" className="fill-foreground font-semibold text-[11px]">
            São Paulo
          </text>
        </g>

        {/* Rio de Janeiro (Interior) */}
        <g className="cursor-pointer group">
          <path
            d="M340,365 C355,358 375,360 385,368 C392,374 390,382 382,388 C372,394 358,396 345,393 C335,390 332,380 335,372 C336,369 338,367 340,365Z"
            fill="hsl(var(--sidebar-background) / 0.75)"
            className="transition-all duration-300 group-hover:brightness-125"
            stroke="hsl(var(--sidebar-foreground) / 0.3)"
            strokeWidth="1"
          />
          <circle cx="362" cy="378" r="3" fill="hsl(var(--primary-foreground))" />
          <text x="400" y="375" textAnchor="start" className="fill-foreground font-semibold text-[11px]">
            Rio de Janeiro
          </text>
          <text x="400" y="388" textAnchor="start" className="fill-muted-foreground text-[9px]">
            Interior
          </text>
        </g>

        {/* Other states (subtle) */}
        {/* Minas Gerais */}
        <ellipse cx="330" cy="330" rx="50" ry="30" fill="hsl(var(--muted) / 0.08)" stroke="hsl(var(--border) / 0.3)" strokeWidth="0.5" />
        {/* Paraná */}
        <ellipse cx="300" cy="415" rx="35" ry="18" fill="hsl(var(--muted) / 0.08)" stroke="hsl(var(--border) / 0.3)" strokeWidth="0.5" />
        {/* RS */}
        <ellipse cx="310" cy="470" rx="30" ry="20" fill="hsl(var(--muted) / 0.08)" stroke="hsl(var(--border) / 0.3)" strokeWidth="0.5" />

        {/* Decorative labels */}
        <text x="300" y="200" textAnchor="middle" className="fill-muted-foreground/30 text-[40px] font-bold tracking-widest select-none">
          BRASIL
        </text>

        {/* Legend */}
        <g transform="translate(30, 540)">
          <rect x="0" y="0" width="12" height="12" rx="2" fill="hsl(var(--primary))" />
          <text x="18" y="10" className="fill-foreground text-[10px]">Atuação Principal</text>
          <rect x="0" y="20" width="12" height="12" rx="2" fill="hsl(var(--sidebar-background))" />
          <text x="18" y="30" className="fill-foreground text-[10px]">Atuação Regional</text>
        </g>
      </svg>
    </div>
  );
};

export default BrazilMap;
