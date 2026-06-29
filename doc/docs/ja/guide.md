# ガイド

## インストール

```sh
npm install tethr
```

## カメラの接続

Tethr は PTP (WebUSB) または Webcam (WebRTC) でカメラと通信します。ブラウザが
デバイスピッカーを表示するため、カメラのリクエストは**ユーザー操作（クリック）の中**で
行う必要があります。

```ts
import {TethrManager} from 'tethr'

const manager = new TethrManager()

// USB デバイスピッカーを表示（'webcam' なら Webcam ピッカー）
const camera = await manager.requestCamera('ptpusb')
await camera.open()
```

ページ読み込み時など、ピッカー無しで以前ペアしたカメラへ無言で再接続するには、
identifier と `{prompt: false}` を渡します。

```ts
const camera = await manager.requestCamera(savedIdentifier, {prompt: false})
```

## Config の取得と設定

各プロパティは `get` / `set` / `getDesc` でアクセスします。

```ts
const iso = await camera.get('iso')

const desc = await camera.getDesc('shutterSpeed')
// desc.writable, desc.value, desc.option（enum values か range）

await camera.set('whiteBalance', 'daylight')
```

全プロパティ名は `ConfigNameList` としてエクスポートされています。

## ライブビュー・AF・撮影

```ts
const {value: stream} = await camera.startLiveview()
videoEl.srcObject = stream
// …
await camera.stopLiveview()

await camera.runAutoFocus()

const {status, value} = await camera.takePhoto()
if (status === 'ok') {
	for (const object of value) {
		// object.blob, object.format, object.filename
	}
}
```

## Object Store

カメラのカードにあるファイルを一覧・ダウンロードできます。

```ts
const storages = await camera.getStorages()
const objects = await camera.getObjects({})
const {value} = await camera.getObject(objects[0].id)
```

## Vue 3 連携

`@tethr/vue3` パッケージは全体をリアクティブな ref でラップします。

```ts
import {useTethr} from '@tethr/vue3'

const {camera, configs, requestCamera, toggleLiveview} = useTethr()
// configs.iso.value, configs.iso.set('400'), configs.iso.option …
```

ライブな例は [機能テスト](/ja/report) と [プレイグラウンド](/ja/playground) を
参照してください。
