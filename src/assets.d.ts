// Binary glTF models are bundled by Metro as assets (see metro.config.js); importing one yields an asset id.
declare module '*.glb' {
  const asset: number;
  export default asset;
}
