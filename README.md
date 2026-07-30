# RichFlyer SDK

## Overview
This SDK can easily use [RichFlyer API](https://richflyer.net/sdk/manual/api/index.html).<br>
[RichFlyer](https://richflyer.net) is messaging service that can send message to push notification, twitter, facebook simultaneously and can attach the rich contents like movie, gif, image.

## Installation
``` sh
npm install richflyer
```

## Requirements
* Node.js 20.0.0 or later.
  This SDK uses the built-in `fetch`, `FormData` and `fs.openAsBlob`,
  so it has **no runtime dependencies**.

## Prerequisites
* User should have RichFlyer Account. If you don't have an account, 
Please contact us from [here](https://richflyer.net).
* RichFlyer API document is [here](https://richflyer.net/sdk/manual/api/index.html).

## Usage
``` js
const RichFlyer = require('richflyer');

const rf = new RichFlyer(
    'aaaaa', // Customer Id
    'bbbbb', // Service Id
    'ccccc', // SDK Key
    'ddddd'  // API Key
);

// Upload and Register Media.
rf.registerMedia(
    "https://richflyer.net/movie.mp4", // movieUrl
    "https://richflyer.net/image.jpg") // imageUrl
    .then (async mediaId => {

    // If you will input empty value to title or message, sdk use template title or message.
    await rf.registerPosting(
        true,     // is draft
        false,    // skip approval
        'abcdef', // templateId
        'Goal!',  // title
        'Our team got a goal! Play the movie now!',// message
        mediaId)
        .then( ({ url, postingDetailId }) => {
            // Draft registration returns `url` (editor url).
            // Final registration returns `postingDetailId`, which you can pass to
            // updatePostingStatus / stopDevidedPosting / getPublishInfo.
            console.log(url, postingDetailId);
        }, error => console.log(error.message));

    }, error => console.log(error.message));
}
```

### v1 → v2 移行

**1. 対応するNode.jsのバージョン**

Node.js 20.0.0 以降が必要です。Nodeの組み込み機能（`fetch` / `FormData` /
`fs.openAsBlob`）を使うようになり、`node-fetch` や `formdata-node` などの
依存パッケージがなくなりました。

**2. 投稿登録の戻り値**

`registerPosting` / `registerPostingWithLargeSegments` の戻り値が、文字列（url）から
`{ postingDetailId, url }` のオブジェクトに変わりました。以前 `url` のみを利用していた
コードは、戻り値を分割代入するか `.url` を参照するように変更してください。

``` js
// v1
const url = await rf.registerPosting(...);

// v2
const { url, postingDetailId } = await rf.registerPosting(...);
```

## API リファレンス

すべてのメソッドは `Promise` を返す非同期関数です。エラー時は `Error` を throw します。

### 認証・テンプレート

- `getAuthenticationToken()` — IDトークンを取得する（他のメソッドは内部で自動的にトークンを
  取得・キャッシュ・再取得するため、通常は直接呼ぶ必要はない）。
- `getTemplateData(templateId)` — 管理サイトで作成したテンプレートを取得する。

### 投稿

- `registerPosting(isDraft, isSkipApproval, templateId, title, message, multiMediaId, options)`
  — 投稿を登録する。`title` / `message` / `multiMediaId` が空の場合はテンプレートの値を使用する。
  `options` で以下のテンプレートの項目を上書きできる（未指定ならテンプレート値を使用）:
  `posting_type_id`, `send_datetime`, `ios_destinations`, `android_destination_id`,
  `sns_destinations`, `sns_additional_texts`, `delivery_condition_id`,
  `action_buttons`, `click_action`, `use_uploaded_media_on_sns`, `is_used_webpush`,
  `devided_send_num`, `interval_time`。戻り値は `{ postingDetailId, url }`
  （本登録時は `postingDetailId`、下書き登録時は `url` が入る）。

  配信対象のセグメントは `options.segments` に、**セグメントキーと値**の連想配列で指定する。
  値は配列でも単一の文字列でも指定できる。

  ``` js
  await rf.registerPosting(false, true, templateId, title, message, mediaId, {
      segments: {
          prefecture: ["北海道", "青森県"],
          plan: "premium",
      },
  });
  ```

  セグメント値が512個を超える場合は、次の
  `registerPostingWithLargeSegments` を使用する。

- `registerPostingWithLargeSegments(isDraft, isSkipApproval, templateId, title, message, multiMediaId, segments, options)`
  — セグメント値が512個を超える場合に、値をファイルで指定して投稿を登録する。
  `segments` にはセグメントキーごとに以下のいずれかを指定する。

  - **文字列** … セグメント値ファイルのパス。ファイル本体が自動で添付される。
    ファイルには値を半角スペース・改行・カンマ区切りで格納する。
  - **配列** … セグメント値を直接指定する（`registerPosting` と同じ形式）。

  ``` js
  await rf.registerPostingWithLargeSegments(
      false, true, templateId, title, message, mediaId,
      {
          prefecture: "./segments/prefecture.txt", // ファイルで指定
          plan: ["premium", "standard"],           // 値を直接指定
      });
  ```

  `options` は `registerPosting` と同じ（`segments` は引数で指定するため
  `options.segments` は使用しない）。戻り値も同じ。
- `updatePostingStatus(postingDetailId, approvalStatus, comment)` — 投稿の承認ステータスを
  更新する。`approvalStatus` は `2`（承認）または `3`（却下）。`comment` は却下時のコメント。
- `stopDevidedPosting(postingDetailId)` — 配信中の分散投稿を中止する。
- `getPublishInfo(postingDetailId)` — 投稿の送信結果（時系列の起動数、プラットフォーム別の
  送信成功/失敗数）を取得する。

### 単発投稿（One-to-One プッシュ）

- `registerOneshotPosting(templateId, options)` — 単一のデバイスにテンプレートを使ってプッシュ
  通知を送信する。`options`:
  - `deviceToken` — 送信先のデバイストークン（`segment` と併用時はこちらが優先）。
  - `segment` — `{ key, value }`。該当端末が50台を超える場合はランダムに50台へ送信される。
  - `variables` — `[{ key, value }]`。テンプレート内の変数を置換する。
  - `standbyMinutes` — 配信を遅延させる分数（最大30日分）。指定時のみ戻り値に単発投稿IDが入る。

  戻り値は単発投稿IDの配列（`standbyMinutes` 未指定など、IDが発行されない場合は空配列）。
- `cancelOneshotPosting(oneshotPostingId)` — 遅延設定した単発投稿をキャンセルする。

### メディア

- `registerMedia(movieFilePath, imageFilePath)` — 動画・静止画をリッチコンテンツとして登録する。
  ローカルファイルパス・URLのどちらも指定可能。戻り値は `mediaId`。

### セグメント

- `getSegments()` — セグメント管理情報の一覧を取得する。
- `updateSegmentDescription(id, description)` — セグメントの説明を登録する。
- `updateSegmentStatus(id, isDisable)` — セグメントの投稿画面での表示/非表示を切り替える。

## License
[Please read our license.](https://richflyer.net/rules_sdk.html)


