# Capability Report

Connect a camera below to generate a full capability report. The sweep runs
**automatically** on connect and probes:

- **Identity** — device type, name, and the reconnect identifier
- **Capabilities** — `canTakePhoto`, `canStartLiveview`, `canRunAutoFocus`, `canRunManualFocus`
- **Properties** — every config in `ConfigNameList`: gettable? writable? what options?
- **Actions** — `startLiveview` / `runAutoFocus` / `takePhoto`
- **Object Store** — `getStorages` / `getObjects`

::: warning
The report runs every test automatically, including `takePhoto` — this
**fires the physical shutter** on cameras that support it. Connect over USB only
when you're ready to take a frame.
:::

<ClientOnly>
  <CameraReport />
</ClientOnly>
