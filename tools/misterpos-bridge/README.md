# Sagra MisterPOS Bridge Runbook

This folder contains the Java agent used to load scanned `/cassa` orders into the active MisterPOS desktop cart.

The web app deployed to Vercel does not need any of these files. The root `.vercelignore` excludes this folder from Vercel deployments.

## What To Build

From the repo root on the development Mac:

```sh
bash tools/misterpos-bridge/package.sh
```

This creates the distributable folder:

```text
tools/misterpos-bridge/dist/SagraMisterPOSBridge
```

## What To Copy To The MisterPOS Machine

Copy this entire generated folder to the Windows machine that runs MisterPOS:

```text
tools/misterpos-bridge/dist/SagraMisterPOSBridge
```

Do not copy only one file. The folder must include:

```text
README.txt
install-windows.cmd
install-windows.ps1
sagra-agent-attacher.jar
sagra-misterpos-agent.jar
start-misterpos-sagra.cmd
start-misterpos-sagra.ps1
```

The macOS `.command` files can be ignored on Windows.

## Windows Installation

On the Windows MisterPOS machine:

1. Put the copied `SagraMisterPOSBridge` folder somewhere easy to find, for example the Desktop or Downloads.
2. Double-click `install-windows.cmd`.
3. The installer copies the bridge to:

```text
%LOCALAPPDATA%\SagraMisterPOSBridge
```

4. The installer creates this Desktop launcher:

```text
MisterPOS Sagra.cmd
```

## How To Launch MisterPOS During The Event

Use only this Desktop launcher:

```text
MisterPOS Sagra.cmd
```

That launcher:

1. Finds a Java JDK 11+ installation.
2. Finds the MisterPOS folder containing `misterpos.jar`.
3. Starts MisterPOS if it is not already running.
4. Attaches the bridge into the MisterPOS Java process.
5. Checks the bridge at:

```text
http://127.0.0.1:8787/health
```

Expected result:

```json
{"ok":true}
```

## App Configuration In `/cassa`

On the phone/tablet running `/cassa`:

```text
Attiva: acceso
Host bridge desktop: IP LAN del PC MisterPOS
Porta bridge: 8787
Tavolo UI MisterPOS: leave the app default unless changed intentionally
```

Find the Windows PC LAN IP by opening Command Prompt and running:

```bat
ipconfig
```

Use the IPv4 address of the active Wi-Fi/Ethernet adapter, for example:

```text
192.168.1.50
```

Do not use `127.0.0.1` from the phone. On the phone, `127.0.0.1` means the phone itself, not the MisterPOS PC.

## Requirements On The Windows PC

- MisterPOS installed and working.
- Java JDK 11 or newer installed. A JRE alone is not enough because the bridge needs `jdk.attach`.
- The phone/tablet and MisterPOS PC must be on the same LAN.
- Windows Firewall must allow Java/MisterPOS to listen on port `8787`.

If MisterPOS is installed in a non-standard folder and the launcher cannot find it, set this Windows environment variable:

```text
MISTERPOS_DIR=C:\path\to\MisterPOS
```

The folder must contain:

```text
misterpos.jar
```

## Troubleshooting

### The `/cassa` connection test fails

Check these in order:

1. On the MisterPOS PC, open `http://127.0.0.1:8787/health`.
2. If that fails, close MisterPOS and reopen it using `MisterPOS Sagra.cmd`.
3. Check that Java JDK 11+ is installed.
4. Check Windows Firewall for Java/MisterPOS.
5. Check the phone is on the same LAN.
6. Check `/cassa` uses the PC LAN IP, not `127.0.0.1`.
7. If `/cassa` is served over HTTPS, the browser may block HTTP LAN calls as mixed content. Serve `/cassa` over HTTP on the LAN or add an HTTPS/proxy solution for the bridge.

### The launcher cannot find MisterPOS

Set `MISTERPOS_DIR` to the folder that contains `misterpos.jar`, then reopen `MisterPOS Sagra.cmd`.

### The launcher cannot find Java attach support

Install a JDK 11 or newer. The bridge cannot be attached with only a JRE.

## Logs

Windows logs are written to:

```text
%LOCALAPPDATA%\SagraMisterPOSBridge\Logs
```

Useful files:

```text
attach.log
misterpos.out.log
misterpos.err.log
```
