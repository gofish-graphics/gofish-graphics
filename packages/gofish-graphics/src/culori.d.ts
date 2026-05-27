declare module "culori" {
  export function luv(
    color: string | object
  ): { l?: number; u?: number; v?: number } | undefined;
  export function rgb(
    color: string | object
  ): { r?: number; g?: number; b?: number; alpha?: number } | undefined;
  export function formatHex(color: object): string;
  export function formatRgb(color: object): string;
  const culori: Record<string, unknown>;
  export default culori;
}
