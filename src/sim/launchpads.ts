// Launchpads de BNB Chain que se reconocen por la dirección del token: sus contratos se despliegan con
// direcciones "vanity". Flap.sh (…7777) usa impuestos de venta dinámicos que pueden llegar al 100 %;
// four.meme usa …4444 o …ffff. Así se sabe el origen aunque la fuente de datos solo diga "pancakeswap".
export function bscLaunchpad(address: string): string | undefined {
  const a = address.toLowerCase();
  if (a.endsWith("7777")) return "flap.sh";
  if (a.endsWith("4444") || a.endsWith("ffff")) return "four.meme";
  return undefined;
}

/** El launchpad de un token: el que se deduce de la dirección (BNB Chain) o el que dé la fuente. */
export function launchpadOf(venue: string, address: string, reported?: string): string | undefined {
  return (venue === "bsc" ? bscLaunchpad(address) : undefined) ?? reported;
}
