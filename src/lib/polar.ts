import { Polar } from "@polar-sh/sdk";

let _polar: Polar | null = null;

/** Returns the Polar client, initializing it on first use. */
export function getPolar(): Polar {
  if (!_polar) {
    const accessToken = process.env.POLAR_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("POLAR_ACCESS_TOKEN environment variable is required");
    }
    _polar = new Polar({ accessToken });
  }
  return _polar;
}
