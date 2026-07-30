/**
 * RichFlyer SDK 検証用サンプルアプリ
 *
 * SDKが提供する全APIをメニューから対話的に実行して動作確認できる。
 * 直前の実行結果（メディアID・投稿詳細ID・単発投稿ID）を保持し、
 * 次の操作のデフォルト値として使うため、
 *   メディア登録 → 投稿登録 → 承認 → 送信結果取得
 * のような一連の流れをIDのコピペなしで検証できる。
 *
 * 認証情報は環境変数から読み込む（未設定の場合は起動時に入力を求める）:
 *   CUSTOMER_ID, SERVICE_ID, API_KEY, SDK_KEY, TEMPLATE_ID
 * このファイルと同じディレクトリに .env を置くと読み込まれる（env.sample を参照）。
 */

const fs = require("fs");
const nodePath = require("path");

/**
 * .env ファイルを読み込む。
 * 依存を増やさず、かつ古いNode（--env-file 非対応）でも動くよう自前で解析する。
 * 既に設定済みの環境変数は上書きしない（シェルでの指定を優先する）。
 */
const loadEnvFile = () => {
  const envPath = nodePath.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    // 値を囲むクォートがあれば取り除く
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  console.log(`.env を読み込みました: ${envPath}`);
};

loadEnvFile();

const inquirer = require("inquirer");
const RichFlyer = require("richflyer");
const promptIds = require("./prompt_ids");

// 直前の実行結果を保持し、次の操作のデフォルト値として使う
const state = {
  mediaId: undefined,
  postingDetailId: undefined,
  oneshotPostingIds: [],
};

let rf;

/**
 * 入力プロンプトの補足説明を、プロンプト行とは別の行に表示する。
 * プロンプト行に全角の注釈を詰め込むと、行が端末幅を超えたときに
 * inquirerの再描画（カーソル移動によるその場書き換え）がずれて
 * 表示が崩れるため、注釈は独立した行に出す。
 */
const hint = (text) => {
  console.log(`  ※ ${text}`);
};

const input = async (message, defaultValue) => {
  const answers = await inquirer.prompt([
    {
      name: "value",
      message,
      type: "input",
      // 空文字を渡すと "()" と表示され、プロンプト行が無駄に伸びるため undefined にする
      default: defaultValue === "" ? undefined : defaultValue,
    },
  ]);
  return answers.value === undefined ? "" : answers.value;
};

const confirm = async (message, defaultValue = false) => {
  const answers = await inquirer.prompt([
    { name: "value", message, type: "confirm", default: defaultValue },
  ]);
  return answers.value;
};

const number = async (message, defaultValue) => {
  const answers = await inquirer.prompt([
    { name: "value", message, type: "number", default: defaultValue },
  ]);
  return answers.value;
};

const select = async (message, choices, defaultValue) => {
  const answers = await inquirer.prompt([
    { name: "value", message, type: "list", choices, default: defaultValue },
  ]);
  return answers.value;
};

/** 空文字を undefined に変換する（未指定を明示するため） */
const orUndefined = (value) => (value === "" ? undefined : value);

/**
 * カンマ区切りのID列を配列にする。
 * テンプレートのJSONからコピーした ["aaa","bbb"] 形式をそのまま貼り付けても
 * 使えるよう、角括弧・クォート・空白を取り除く。
 */
const parseIdList = (value) =>
  value
    .replace(/^\s*\[/, "")
    .replace(/\]\s*$/, "")
    .split(",")
    .map((id) => id.trim().replace(/^["']|["']$/g, "").trim())
    .filter((id) => id !== "");

/**
 * API呼び出しを実行し、結果またはエラーを整形して表示する。
 * 検証中に1つのAPIが失敗してもアプリが終了しないよう、エラーは捕捉する。
 */
const run = async (label, fn) => {
  console.log(`\n▶ ${label} ...`);
  try {
    const result = await fn();
    console.log(`✅ 成功`);
    if (result !== undefined) {
      console.log(JSON.stringify(result, null, 2));
    }
    return result;
  } catch (error) {
    console.log(`❌ 失敗: ${error.message}`);
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// 各APIの実行
// ---------------------------------------------------------------------------

const getAuthenticationToken = async () => {
  await run("IDトークン取得", async () => {
    const token = await rf.getAuthenticationToken();
    return { acquired: Boolean(token) };
  });
};

const getTemplateData = async () => {
  const templateId = await input("テンプレートIDを指定してください。", state.templateId);
  state.templateId = templateId;
  await run("テンプレート取得", () => rf.getTemplateData(templateId));
};

const registerMedia = async () => {
  hint("URLまたはローカルパスを指定します。使わない場合はEnterでスキップします。");
  const movie = orUndefined(await input("動画(MP4/GIF):", ""));
  if (movie) hint("動画を登録する場合、表紙の静止画は必須です。");
  const image = orUndefined(
    await input(movie ? "動画の表紙(JPEG/PNG):" : "静止画(JPEG/PNG):", "")
  );

  const mediaId = await run("メディア登録", () => rf.registerMedia(movie, image));
  if (mediaId) {
    state.mediaId = mediaId;
    console.log(`（mediaId を保持しました。投稿登録時のデフォルト値になります）`);
  }
};

/**
 * 投稿登録・セグメント値ファイル利用投稿登録の共通入力。
 * askSegmentValues が true のとき、配信対象セグメントの値を直接入力できる
 * （セグメント値ファイル利用投稿登録では、ファイルパスを別途入力するため尋ねない）。
 */
const promptPostingParams = async ({ askSegmentValues = false } = {}) => {
  const isDraft = await confirm("下書きとして登録しますか？", false);
  const isSkipApproval = isDraft
    ? false
    : await confirm("承認をスキップして即時投稿しますか？", false);

  const templateId = await input("テンプレートIDを指定してください。", state.templateId);
  state.templateId = templateId;

  hint("Enterのみで、テンプレートの値をそのまま使用します。");
  const title = await input("タイトル:", "");
  const message = await input("本文:", "");
  const mediaId = orUndefined(await input("メディアID:", state.mediaId || ""));

  const options = {};
  if (await confirm("配信先やスケジュールを指定しますか？", false)) {
    const isWebpush = await confirm("ウェブプッシュ通知を利用しますか？", false);
    if (isWebpush) options.is_used_webpush = 1;

    hint("複数指定する場合はカンマ区切り。Enterでテンプレートの値を使用します。");
    const iosDestinations = orUndefined(await input("iOS配信先ID:", ""));
    if (iosDestinations) {
      options.ios_destinations = parseIdList(iosDestinations);
    }

    const androidDestinationId = orUndefined(await input("Android配信先ID:", ""));
    if (androidDestinationId) {
      options.android_destination_id = parseIdList(androidDestinationId)[0];
    }

    if (await confirm("予約投稿にしますか？", false)) {
      const minutesLater = await number("何分後に配信しますか？", 10);
      options.posting_type_id = 1; // 1:予約
      options.send_datetime = Math.floor(Date.now() / 1000) + minutesLater * 60;
    }

    if (await confirm("分割投稿を設定しますか？", false)) {
      hint("送信数は100〜100000、間隔は300〜3600秒の範囲で指定します。");
      options.devided_send_num = await number("1回あたりの送信数:", 100);
      options.interval_time = await number("送信間隔(秒):", 300);
    }
  }

  if (askSegmentValues && (await confirm("配信対象セグメントを指定しますか？", false))) {
    hint("セグメント値はカンマ区切りで複数指定できます。");
    const segments = {};
    let addMore = true;
    while (addMore) {
      const key = await input("セグメントキー:", state.segmentId || "");
      const values = await input("セグメント値:", "");
      segments[key] = parseIdList(values);
      addMore = await confirm("別のセグメントキーを追加しますか？", false);
    }
    options.segments = segments;
  }

  return { isDraft, isSkipApproval, templateId, title, message, mediaId, options };
};

/** 投稿登録の結果から postingDetailId を保持する */
const storePostingResult = (result) => {
  if (!result) return;
  if (result.postingDetailId) {
    state.postingDetailId = result.postingDetailId;
    console.log(
      `（postingDetailId を保持しました。承認/中止/送信結果取得のデフォルト値になります）`
    );
  }
  if (result.url) {
    console.log(`下書き編集URL: ${result.url}`);
  }
};

const registerPosting = async () => {
  const p = await promptPostingParams({ askSegmentValues: true });
  const result = await run("投稿登録", () =>
    rf.registerPosting(
      p.isDraft,
      p.isSkipApproval,
      p.templateId,
      p.title,
      p.message,
      p.mediaId,
      p.options
    )
  );
  storePostingResult(result);
};

const registerPostingWithLargeSegments = async () => {
  const p = await promptPostingParams();

  console.log("\n配信対象セグメントを指定します。");
  hint("セグメントキーごとに、値ファイルのパスか値の直接指定を選べます。");
  const segments = {};
  let addMore = true;
  while (addMore) {
    const key = await input("セグメントキー:", "prefecture");
    const form = await select("セグメント値の指定方法を選択してください。", [
      { name: "ファイルで指定（512個を超える場合）", value: "file" },
      { name: "値を直接指定", value: "values" },
    ]);
    if (form === "file") {
      segments[key] = await input("セグメント値ファイルのパス:", "");
    } else {
      hint("セグメント値はカンマ区切りで複数指定できます。");
      segments[key] = parseIdList(await input("セグメント値:", ""));
    }
    addMore = await confirm("別のセグメントキーを追加しますか？", false);
  }

  const result = await run("投稿登録（セグメント値ファイル利用）", () =>
    rf.registerPostingWithLargeSegments(
      p.isDraft,
      p.isSkipApproval,
      p.templateId,
      p.title,
      p.message,
      p.mediaId,
      segments,
      p.options
    )
  );
  storePostingResult(result);
};

const updatePostingStatus = async () => {
  const postingDetailId = await input("投稿詳細IDを指定してください。", state.postingDetailId);
  const approvalStatus = await select("承認ステータスを選択してください。", [
    { name: "承認 (2)", value: 2 },
    { name: "却下 (3)", value: 3 },
  ]);
  const comment =
    approvalStatus === 3 ? orUndefined(await input("却下理由（任意）:", "")) : undefined;

  await run("投稿承認ステータス更新", () =>
    rf.updatePostingStatus(postingDetailId, approvalStatus, comment)
  );
};

const stopDevidedPosting = async () => {
  const postingDetailId = await input("投稿詳細IDを指定してください。", state.postingDetailId);
  await run("分散投稿中止", () => rf.stopDevidedPosting(postingDetailId));
};

const getPublishInfo = async () => {
  const postingDetailId = await input("投稿詳細IDを指定してください。", state.postingDetailId);
  await run("投稿送信結果取得", () => rf.getPublishInfo(postingDetailId));
};

const registerOneshotPosting = async () => {
  const templateId = await input("テンプレートIDを指定してください。", state.templateId);
  state.templateId = templateId;

  const options = {};
  const target = await select("配信対象の指定方法を選択してください。", [
    { name: "デバイストークンを指定", value: "device" },
    { name: "セグメントを指定（該当端末が50台超ならランダムに50台）", value: "segment" },
  ]);

  if (target === "device") {
    options.deviceToken = await input("デバイストークン:", "");
  } else {
    const key = await input("セグメントキー:", "");
    const value = await input("セグメント値:", "");
    options.segment = { key, value };
  }

  if (await confirm("テンプレート内の変数を置換しますか？", false)) {
    const variables = [];
    let addMore = true;
    while (addMore) {
      const key = await input("変数名:", "");
      const value = await input("置換する値:", "");
      variables.push({ key, value });
      addMore = await confirm("変数を追加しますか？", false);
    }
    options.variables = variables;
  }

  hint("遅延配信にすると単発投稿IDが発行され、配信前にキャンセルできます。");
  if (await confirm("遅延配信にしますか？", false)) {
    hint("最大30日分まで指定できます。");
    options.standbyMinutes = await number("何分後に配信しますか？", 10);
  }

  const ids = await run("単発投稿登録", () =>
    rf.registerOneshotPosting(templateId, options)
  );
  if (ids && ids.length > 0) {
    state.oneshotPostingIds = ids;
    console.log(`（単発投稿IDを保持しました。キャンセルのデフォルト値になります）`);
  } else {
    console.log(
      "（遅延配信を指定しない場合、単発投稿IDは発行されないためキャンセルできません）"
    );
  }
};

const cancelOneshotPosting = async () => {
  const defaultId = state.oneshotPostingIds[0];
  const oneshotPostingId = await input("単発投稿IDを指定してください。", defaultId);
  await run("単発投稿キャンセル", () => rf.cancelOneshotPosting(oneshotPostingId));
};

const getSegments = async () => {
  const segments = await run("セグメント管理情報一覧取得", () => rf.getSegments());
  if (segments && segments.length > 0) {
    state.segmentId = segments[0].id;
  }
};

const updateSegmentDescription = async () => {
  const id = await input("セグメント名を指定してください。", state.segmentId);
  const description = await input("セグメントの説明:", "");
  await run("セグメント説明登録", () => rf.updateSegmentDescription(id, description));
};

const updateSegmentStatus = async () => {
  const id = await input("セグメント名を指定してください。", state.segmentId);
  const isDisable = await confirm("投稿ページで非表示にしますか？", false);
  await run("セグメント表示状態登録", () => rf.updateSegmentStatus(id, isDisable));
};

// ---------------------------------------------------------------------------
// メニュー
// ---------------------------------------------------------------------------

const MENU = [
  new inquirer.Separator("--- 認証 ---"),
  { name: "IDトークン取得", value: getAuthenticationToken },
  new inquirer.Separator("--- メディア ---"),
  { name: "メディア登録/アップロード", value: registerMedia },
  new inquirer.Separator("--- 投稿 ---"),
  { name: "テンプレート取得", value: getTemplateData },
  { name: "投稿登録", value: registerPosting },
  { name: "投稿登録（セグメント値ファイル利用）", value: registerPostingWithLargeSegments },
  { name: "投稿承認ステータス更新", value: updatePostingStatus },
  { name: "分散投稿中止", value: stopDevidedPosting },
  { name: "投稿送信結果取得", value: getPublishInfo },
  new inquirer.Separator("--- 単発投稿 ---"),
  { name: "単発投稿登録", value: registerOneshotPosting },
  { name: "単発投稿キャンセル", value: cancelOneshotPosting },
  new inquirer.Separator("--- セグメント ---"),
  { name: "セグメント管理情報一覧取得", value: getSegments },
  { name: "セグメント説明登録", value: updateSegmentDescription },
  { name: "セグメント表示状態登録", value: updateSegmentStatus },
  new inquirer.Separator("---"),
  { name: "終了", value: null },
];

const printState = () => {
  const entries = [];
  if (state.mediaId) entries.push(`mediaId: ${state.mediaId}`);
  if (state.postingDetailId) entries.push(`postingDetailId: ${state.postingDetailId}`);
  if (state.oneshotPostingIds.length > 0) {
    entries.push(`oneshotPostingId: ${state.oneshotPostingIds.join(", ")}`);
  }
  if (entries.length > 0) {
    console.log(`\n保持中のID → ${entries.join(" / ")}`);
  }
};

const main = async () => {
  console.log("=== RichFlyer SDK 検証アプリ ===");
  console.log("");

  const ids = await promptIds.setIds();
  rf = new RichFlyer(ids.customerId, ids.serviceId, ids.sdkKey, ids.apiKey);
  state.templateId = process.env.TEMPLATE_ID;

  while (true) {
    printState();
    const action = await select("実行するAPIを選択してください。", MENU);
    if (!action) {
      console.log("終了します。");
      return;
    }
    await action();
    console.log("");
  }
};

main().catch((error) => {
  console.error(`予期しないエラーが発生しました: ${error.message}`);
  process.exit(1);
});
