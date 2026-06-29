# 機能テスト

下のボタンからカメラを接続すると、全機能のテストレポートを生成します。接続時に
**自動で**スイープが走り、以下をプローブします。

- **Identity** — デバイス種別・名前・再接続用 identifier
- **Capabilities** — `canTakePhoto` / `canStartLiveview` / `canRunAutoFocus` / `canRunManualFocus`
- **Properties** — `ConfigNameList` の全 config: 取得可否・writable・options
- **Actions** — `startLiveview` / `runAutoFocus` / `takePhoto`
- **Object Store** — `getStorages` / `getObjects`

::: warning
レポートは `takePhoto` を含む全テストを自動実行します。対応カメラでは
**実際にシャッターが切れます**。撮影してよい状態のときに USB 接続してください。
:::

<ClientOnly>
  <CameraReport />
</ClientOnly>
