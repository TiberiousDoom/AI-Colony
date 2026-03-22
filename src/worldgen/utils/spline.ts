/**
 * Piecewise-linear spline for mapping noise values to terrain heights.
 * Control points are (input, output) pairs sorted by input.
 */
export interface SplinePoint {
  input: number
  output: number
}

export function evaluateSpline(points: SplinePoint[], value: number): number {
  if (points.length === 0) return 0
  if (points.length === 1) return points[0].output
  if (value <= points[0].input) return points[0].output
  if (value >= points[points.length - 1].input) return points[points.length - 1].output

  // Find the two surrounding control points
  for (let i = 0; i < points.length - 1; i++) {
    if (value >= points[i].input && value <= points[i + 1].input) {
      const t = (value - points[i].input) / (points[i + 1].input - points[i].input)
      return points[i].output + t * (points[i + 1].output - points[i].output)
    }
  }

  return points[points.length - 1].output
}

export function createDefaultHeightSpline(): SplinePoint[] {
  return [
    { input: -1.0, output: 0.1 },
    { input: -0.5, output: 0.25 },
    { input: -0.2, output: 0.4 },
    { input: 0.0, output: 0.5 },
    { input: 0.2, output: 0.6 },
    { input: 0.5, output: 0.75 },
    { input: 0.8, output: 0.85 },
    { input: 1.0, output: 0.95 },
  ]
}
