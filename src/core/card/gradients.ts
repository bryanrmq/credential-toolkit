/** Black at `alpha`, `at` of the way along the gradient (0–1). */
export interface GradientStop {
  at: number;
  alpha: number;
}

/**
 * A shading layer a wallet draws over the card colour (iOS `CredentialCard.swift`, Android `Gradients.kt`).
 * Points and radii are fractions of the card's width and height.
 */
export type Gradient =
  | { kind: 'linear'; start: [number, number]; end: [number, number]; stops: GradientStop[]; opacity: number }
  | { kind: 'radial'; center: [number, number]; radius: number; radiusOf: 'width' | 'shorterSide'; stops: GradientStop[] }
  | { kind: 'ellipse'; center: [number, number]; radii: [number, number]; stops: GradientStop[]; opacity: number; blur: number };

/** A CSS background image with the layer's opacity and blur (px). */
export interface GradientLayer {
  image: string;
  opacity: number;
  blur: number;
}

const round = (value: number) => Math.round(value * 100) / 100;
const black = (alpha: number) => `rgba(0, 0, 0, ${alpha})`;

/** The gradient as CSS for a card of `width` × `height` px. */
export function gradientLayer(gradient: Gradient, width: number, height: number): GradientLayer {
  switch (gradient.kind) {
    case 'linear':
      return { image: linear(gradient, width, height), opacity: gradient.opacity, blur: 0 };
    case 'radial': {
      const radius = gradient.radius * (gradient.radiusOf === 'width' ? width : Math.min(width, height));
      const stops = gradient.stops.map(({ at, alpha }) => `${black(alpha)} ${round(at * radius)}px`);
      const [x, y] = [gradient.center[0] * width, gradient.center[1] * height];
      return { image: `radial-gradient(circle ${round(radius)}px at ${round(x)}px ${round(y)}px, ${stops.join(', ')})`, opacity: 1, blur: 0 };
    }
    case 'ellipse': {
      const [rx, ry] = [gradient.radii[0] * width, gradient.radii[1] * height];
      const [x, y] = [gradient.center[0] * width, gradient.center[1] * height];
      const stops = gradient.stops.map(({ at, alpha }) => `${black(alpha)} ${round(at * 100)}%`);
      return {
        image: `radial-gradient(ellipse ${round(rx)}px ${round(ry)}px at ${round(x)}px ${round(y)}px, ${stops.join(', ')})`,
        opacity: gradient.opacity,
        blur: gradient.blur,
      };
    }
  }
}

/**
 * SwiftUI and Compose draw a linear gradient along the line from `start` to `end`. CSS takes an angle and runs
 * the gradient line through the centre, so the stops are moved to where the two end points project onto it.
 */
function linear({ start, end, stops }: Extract<Gradient, { kind: 'linear' }>, width: number, height: number): string {
  const [x0, y0] = [start[0] * width, start[1] * height];
  const [x1, y1] = [end[0] * width, end[1] * height];
  const angle = Math.atan2(x1 - x0, -(y1 - y0)); // clockwise from "to top", as CSS counts
  const [ux, uy] = [Math.sin(angle), -Math.cos(angle)];
  const length = Math.abs(width * ux) + Math.abs(height * uy);
  const along = (x: number, y: number) => ((x - width / 2) * ux + (y - height / 2) * uy) / length + 0.5;
  const [from, to] = [along(x0, y0), along(x1, y1)];
  const parts = stops.map(({ at, alpha }) => `${black(alpha)} ${round((from + at * (to - from)) * 100)}%`);
  return `linear-gradient(${round((angle * 180) / Math.PI)}deg, ${parts.join(', ')})`;
}
