---
home: true
title: ホーム
heroImage: /logo.svg
actions:
  - text: ガイド
    link: /ja/guide
    type: primary
  - text: 機能テスト
    link: /ja/report
    type: secondary
  - text: API
    link: /api/
    type: secondary
features:
  - title: 統一されたカメラ制御
    details: PTP-over-USB カメラと Webcam を単一の API で。capability ベースのベンダー判定。
  - title: ライブビュー & 撮影
    details: ライブビューの MediaStream 取得、オートフォーカス、撮影をブラウザから直接。
  - title: Object Store
    details: カメラ内ストレージのファイルをチャンク転送で一覧・ダウンロード・ストリーミング。
footer: MIT Licensed | Copyright © Baku Hashimoto
---

Tethr は、WebUSB (PTP) と WebRTC (webcam) を通じてブラウザからデジタルカメラを
制御する JavaScript/TypeScript ライブラリです。

```ts
import {TethrManager} from 'tethr'

const manager = new TethrManager()
const camera = await manager.requestCamera('ptpusb')
await camera.open()

await camera.set('shutterSpeed', '1/30')
const result = await camera.takePhoto()
```

接続したカメラの全機能を試すには [**機能テスト**](/ja/report)、手で触れる
デモは [**プレイグラウンド**](/ja/playground) を参照してください。
