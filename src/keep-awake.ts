// Mientras hay una misión en marcha, el equipo no se puede dormir: con Windows en suspensión se para todo
// (órdenes, cierre por plazo, el agente) y al despertar la misión se cierra con precios de mucho después.
// En la M8 de la v0.35.4 el PC se durmió un minuto antes del plazo y el corto se cerró 56 minutos tarde.
//
// En Windows se lanza un PowerShell que pide al sistema que no suspenda (SetThreadExecutionState) y que sigue
// vivo solo mientras viva este proceso. Al acabar la misión se cierra y Windows vuelve a su configuración.
import { spawn, type ChildProcess } from "node:child_process";

const ES_CONTINUOUS = 0x80000000;
const ES_SYSTEM_REQUIRED = 0x00000001;
// En los equipos con "modo de espera moderno", apagar la pantalla lleva a la suspensión: hay que mantenerla.
const ES_DISPLAY_REQUIRED = 0x00000002;
const FLAGS = (ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED) >>> 0;

let child: ChildProcess | null = null;

function script(parentPid: number) {
  return [
    `Add-Type -Namespace Cryptoagent -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'`,
    `[void][Cryptoagent.Power]::SetThreadExecutionState([uint32]${FLAGS})`,
    `while (Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 20 }`,
  ].join("; ");
}

/** Activa o suspende la petición de "no dormir". Solo actúa en Windows; en el resto no hace nada. */
export function keepAwake(on: boolean, platform: NodeJS.Platform = process.platform): "on" | "off" | "unsupported" {
  if (platform !== "win32") return "unsupported";
  if (on && !child) {
    child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script(process.pid)], { stdio: "ignore", windowsHide: true });
    child.on("exit", () => (child = null));
    child.on("error", () => (child = null));
  } else if (!on && child) {
    child.kill();
    child = null;
  }
  return child ? "on" : "off";
}

process.on("exit", () => child?.kill());
