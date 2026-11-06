// Tethr is browser-only: importing it touches window (IFD.ts), and open() binds
// beforeunload.
globalThis.window = {addEventListener: () => {}} as never
