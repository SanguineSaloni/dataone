# Task 04 — Apply the Veltris logo

Copy the supplied `Veltris_Logo_PNG.png` into the frontend public assets and use it through a shared brand component on the landing page, login, and dashboard.

## Acceptance criteria

- The logo has meaningful alternative text.
- The source asset is not fetched from an external host.
- Logo sizing remains usable on mobile and desktop.

## Implementation note

The supplied artwork is 3,930×668px. The shared `Brand` component must apply explicit rendered width and height classes; `w-auto h-auto` exposes the intrinsic width and can expand every navigation surface that consumes the component.
