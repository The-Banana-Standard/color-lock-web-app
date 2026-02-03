import React from 'react';

interface GradientTitleProps {
  className?: string;
  fontSize?: string;
}

const GradientTitle: React.FC<GradientTitleProps> = ({
  className = '',
  fontSize = '3.5rem'
}) => {
  return (
    <svg
      className={className}
      viewBox="0 0 380 60"
      style={{ height: fontSize, width: 'auto' }}
      aria-label="Color Lock"
      role="heading"
    >
      <defs>
        <linearGradient id="grad-co" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#fb997f" />
          <stop offset="100%" stopColor="#fea474" />
        </linearGradient>
        <linearGradient id="grad-lo-color" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f7ac4b" />
          <stop offset="100%" stopColor="#f6b252" />
        </linearGradient>
        <linearGradient id="grad-r" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#afc053" />
          <stop offset="100%" stopColor="#b9c255" />
        </linearGradient>
        <linearGradient id="grad-lo-lock" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4ca9ea" />
          <stop offset="100%" stopColor="#38bdfe" />
        </linearGradient>
        <linearGradient id="grad-ck" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#d16381" />
          <stop offset="100%" stopColor="#db757f" />
        </linearGradient>
      </defs>

      <text
        x="190"
        y="45"
        textAnchor="middle"
        fontFamily="'Arvo', Georgia, serif"
        fontSize="48"
        fontStyle="italic"
        fontWeight="700"
      >
        <tspan fill="url(#grad-co)">Co</tspan>
        <tspan fill="url(#grad-lo-color)">lo</tspan>
        <tspan fill="url(#grad-r)">r</tspan>
        <tspan dx="10"> </tspan>
        <tspan fill="url(#grad-lo-lock)">Lo</tspan>
        <tspan fill="url(#grad-ck)">ck</tspan>
      </text>
    </svg>
  );
};

export default GradientTitle;
