import React, { useMemo } from 'react';

interface FloatingCircle {
  id: number;
  color: string;
  size: string;
  animation: string;
  duration: string;
  left: string;
  top: string;
  opacity: number;
  delay: string;
}

const TILE_COLORS = ['red', 'green', 'blue', 'yellow', 'purple', 'orange'] as const;
const SIZES = ['small', 'medium', 'large', 'xlarge'] as const;
const ANIMATIONS = ['vertical', 'horizontal', 'diagonal'] as const;
const DURATIONS = ['slow', 'medium', 'fast'] as const;

const FloatingCirclesBackground: React.FC = () => {
  const circles = useMemo<FloatingCircle[]>(() => {
    return Array.from({ length: 10 }, (_, i) => ({
      id: i,
      color: TILE_COLORS[Math.floor(Math.random() * TILE_COLORS.length)],
      size: SIZES[Math.floor(Math.random() * SIZES.length)],
      animation: ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)],
      duration: DURATIONS[Math.floor(Math.random() * DURATIONS.length)],
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      opacity: 0.2 + Math.random() * 0.4, // 20-60% opacity
      delay: `${Math.random() * 3}s`,
    }));
  }, []);

  return (
    <div className="floating-circles-background">
      {circles.map((circle) => (
        <div
          key={circle.id}
          className={`floating-circle size-${circle.size} color-${circle.color} anim-${circle.animation} duration-${circle.duration}`}
          style={{
            left: circle.left,
            top: circle.top,
            opacity: circle.opacity,
            animationDelay: circle.delay,
          }}
        />
      ))}
    </div>
  );
};

export default FloatingCirclesBackground;
