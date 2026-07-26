import { useMemo } from 'react';
import type { EnrichedRoute } from '../routing/types';
import { TrendingUp, Mountain, MapPin } from 'lucide-react';
import { useT } from '../i18n';

type Props = {
  route: EnrichedRoute | null;
  currentDistanceMeters: number;
  currentElevationMeters?: number;
};

export function ElevationProfile({
  route,
  currentDistanceMeters,
  currentElevationMeters,
}: Props) {
  const t = useT();

  const data = useMemo(() => {
    if (!route || !route.samples || route.samples.length < 2) return null;

    const samples = route.samples;
    const totalDist = route.distanceMeters || samples[samples.length - 1].distanceMeters;

    let minElev = route.minElevMeters;
    let maxElev = route.maxElevMeters;

    // Pad elevation range for nicer chart boundaries
    const elevSpan = Math.max(maxElev - minElev, 20);
    const yMin = Math.max(0, Math.floor(minElev - elevSpan * 0.1));
    const yMax = Math.ceil(maxElev + elevSpan * 0.15);
    const rangeY = yMax - yMin;

    const width = 800;
    const height = 140;
    const paddingY = 10;
    const chartH = height - paddingY * 2;

    const points = samples.map((pt) => {
      const x = (pt.distanceMeters / totalDist) * width;
      const y = height - paddingY - ((pt.elevationMeters - yMin) / rangeY) * chartH;
      return { x, y, grade: pt.gradePercent, dist: pt.distanceMeters, elev: pt.elevationMeters };
    });

    // Build SVG area path
    const areaPath = [
      `M ${points[0].x},${height}`,
      `L ${points[0].x},${points[0].y}`,
      ...points.slice(1).map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`),
      `L ${width},${height}`,
      'Z',
    ].join(' ');

    // Build SVG stroke path
    const linePath = [
      `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`,
      ...points.slice(1).map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    ].join(' ');

    // Calculate current rider marker position
    const clampedDist = Math.min(Math.max(0, currentDistanceMeters), totalDist);
    const progressRatio = clampedDist / totalDist;
    const riderX = progressRatio * width;

    // Find rider Y by interpolating between nearest sample points
    let riderY = points[0].y;
    let riderElev = points[0].elev;
    for (let i = 0; i < points.length - 1; i++) {
      if (clampedDist >= points[i].dist && clampedDist <= points[i + 1].dist) {
        const segDist = points[i + 1].dist - points[i].dist;
        const factor = segDist > 0 ? (clampedDist - points[i].dist) / segDist : 0;
        riderY = points[i].y + factor * (points[i + 1].y - points[i].y);
        riderElev = points[i].elev + factor * (points[i + 1].elev - points[i].elev);
        break;
      }
    }

    // Build color gradient segments based on slope grade
    const segments: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      let color = 'var(--grade-flat)'; // cyan/teal for flat
      if (p1.grade > 8) color = 'var(--grade-steep)'; // red
      else if (p1.grade > 4) color = 'var(--grade-climb)'; // orange/yellow
      else if (p1.grade < -2) color = 'var(--grade-down)'; // blue

      segments.push({
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        color,
      });
    }

    return {
      width,
      height,
      minElev,
      maxElev,
      yMin,
      yMax,
      areaPath,
      linePath,
      segments,
      riderX,
      riderY,
      riderElev: currentElevationMeters ?? riderElev,
      progressRatio,
    };
  }, [route, currentDistanceMeters, currentElevationMeters]);

  if (!route || !data) return null;

  return (
    <div className="elevation-profile-container" aria-label="Elevation Profile">
      <div className="elevation-profile-header">
        <div className="profile-title">
          <Mountain className="icon-sm" />
          <span>{t('hud.elevation')} Profile</span>
        </div>
        <div className="profile-stats">
          <span className="stat-item">
            <TrendingUp className="icon-xs" /> ↑{route.elevGainMeters}m
          </span>
          <span className="stat-item">
            <MapPin className="icon-xs" /> {Math.round(data.riderElev)}m elev
          </span>
          <span className="stat-item muted">
            Max {route.maxElevMeters}m
          </span>
        </div>
      </div>

      <div className="elevation-chart-wrapper">
        <svg
          viewBox={`0 0 ${data.width} ${data.height}`}
          preserveAspectRatio="none"
          className="elevation-svg"
        >
          <defs>
            <linearGradient id="elevationAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(94, 225, 255, 0.25)" />
              <stop offset="70%" stopColor="rgba(94, 225, 255, 0.05)" />
              <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
            </linearGradient>
            <filter id="riderGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background fill area */}
          <path d={data.areaPath} fill="url(#elevationAreaGrad)" />

          {/* Color-coded grade stroke segments */}
          {data.segments.map((seg, idx) => (
            <line
              key={idx}
              x1={seg.x1.toFixed(1)}
              y1={seg.y1.toFixed(1)}
              x2={seg.x2.toFixed(1)}
              y2={seg.y2.toFixed(1)}
              stroke={seg.color}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          ))}

          {/* Rider Position Line & Marker */}
          <line
            x1={data.riderX.toFixed(1)}
            y1="0"
            x2={data.riderX.toFixed(1)}
            y2={data.height}
            stroke="var(--accent)"
            strokeWidth="1"
            strokeDasharray="2,2"
            opacity="0.6"
          />

          {/* Rider Pulsing Marker */}
          <circle
            cx={data.riderX.toFixed(1)}
            cy={data.riderY.toFixed(1)}
            r="8"
            fill="rgba(94, 225, 255, 0.3)"
            className="rider-pulse-ring"
          />
          <circle
            cx={data.riderX.toFixed(1)}
            cy={data.riderY.toFixed(1)}
            r="4"
            fill="#ffffff"
            stroke="var(--accent)"
            strokeWidth="2"
            filter="url(#riderGlow)"
          />
        </svg>
      </div>
    </div>
  );
}
