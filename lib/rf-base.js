// fetch / FormData / Blob はNodeの組み込み（Node 18以降）を使用するため、
// 外部パッケージは利用しない。
const fs = require("node:fs");
const path = require("node:path");

const API_VERSION = "2017-04-01";
// IDトークンの有効期限は10分。期限ぎりぎりでのリクエスト失敗を避けるため1分早く再取得する。
const AUTH_TOKEN_TTL_MS = 9 * 60 * 1000;

const OVERRIDABLE_POSTING_FIELDS = [
    "posting_type_id",
    "send_datetime",
    "ios_destinations",
    "android_destination_id",
    "sns_destinations",
    "sns_additional_texts",
    "delivery_condition_id",
    "action_buttons",
    "click_action",
    "use_uploaded_media_on_sns",
    "is_used_webpush",
    "devided_send_num",
    "interval_time",
];

function getServerUrl() {
    return "https://mgt-api.richflyer.net";
}

async function parseJsonSafely(response) {
    try {
        return await response.json();
    } catch (error) {
        return undefined;
    }
}

/**
 * segments をAPIが受け付ける形式に変換する。
 * 形式はエンドポイントごとに異なる。
 * - /postings               : {key, values} のみ
 * - /large-segment-postings : {key, filename} と {key, values} の両方
 *
 * allowSegmentFiles が true（セグメント値ファイル利用時）のとき、
 * 文字列はセグメント値ファイルのパスとして {key, filename} に変換する。
 * 配列は、どちらのエンドポイントでも値の指定として {key, values} に変換する。
 */
function buildSegments(segments, allowSegmentFiles) {
    return Object.entries(segments).map(([key, value]) => {
        if (allowSegmentFiles && !Array.isArray(value)) {
            return { key, filename: path.parse(value).base };
        }
        return { key, values: Array.isArray(value) ? value : [value] };
    });
}

/** セグメント値をファイルで指定しているか（文字列はファイルパスとして扱う） */
function isSegmentFile(value) {
    return !Array.isArray(value);
}

// リッチコンテンツとして登録できる形式（動画:MP4/GIF、静止画:JPEG/PNG）。
const MEDIA_MIME_TYPES = {
    ".mp4": "video/mp4",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
};

/**
 * ローカルファイルをマルチパートに追加する。
 * openAsBlob はファイルをストリーミングするため、
 * 大きな動画でも全体をメモリに読み込まない。
 * 拡張子からMIMEタイプを判定できない場合は type を指定せず、
 * 不正なContent-Typeを送らないようにする。
 */
async function appendFileToFormData(formData, fieldName, filePath, mimeType) {
    const filename = path.parse(filePath).base;
    const type = mimeType || MEDIA_MIME_TYPES[path.extname(filename).toLowerCase()];
    const blob = type
        ? await fs.openAsBlob(filePath, {type})
        : await fs.openAsBlob(filePath);
    formData.append(fieldName, blob, filename);
}

/**
 * エラーレスポンスのボディから原因を取り出す。
 * APIはエラー時に message（エラー内容）と param（該当パラメータ）を返すため、
 * これを例外メッセージに含めて原因を特定できるようにする。
 */
async function readErrorDetail(response) {
    let text;
    try {
        text = await response.text();
    } catch (error) {
        return "";
    }

    if (!text) return "";

    try {
        const json = JSON.parse(text);
        const details = [];
        if (json.message) details.push(json.message);
        if (json.param) details.push(`param: ${json.param}`);
        if (details.length > 0) return ` ${details.join(" / ")}`;
    } catch (error) {
        // JSONでない場合はボディをそのまま使う
    }

    const trimmed = text.trim().slice(0, 300);
    return trimmed ? ` ${trimmed}` : "";
}

module.exports = class RichFlyerBase {
    constructor(customerId, serviceId, sdkKey, apiKey) {
        this.customerId = customerId;
        this.serviceId = serviceId;
        this.sdkKey = sdkKey;
        this.apiKey = apiKey;
        this._authToken = null;
        this._authTokenExpiresAt = 0;
    }

    async checkParameter() {
        const paramErrorCode = 999;
        if (!this.customerId) {
            throw new Error(`A customerId is required.(${paramErrorCode})`);
        }
        if (!this.serviceId) {
            throw new Error(`A serviceId is required.(${paramErrorCode})`);
        }
        if (!this.apiKey) {
            throw new Error(`An apiKey is required.(${paramErrorCode})`);
        }
        if (!this.sdkKey) {
            throw new Error(`A sdkKey is required.(${paramErrorCode})`);
        }
    }

    async getAuthenticationToken() {
        await this.checkParameter();

        const url = getServerUrl() + `/v1/customers/${this.customerId}/services/${this.serviceId}/${this.apiKey}/authentication-tokens`;

        const fetchOptions = {
            method: "POST",
            headers: {
                "X-API-Version": API_VERSION,
                "X-Service-Key": this.sdkKey,
            }
        };

        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            throw new Error(
                `Get token failed.(${response.status})${await readErrorDetail(response)}`
            );
        }

        const json = await response.json();
        return json.id_token;
    }

    async _getValidAuthenticationToken() {
        const now = Date.now();
        if (!this._authToken || now >= this._authTokenExpiresAt) {
            this._authToken = await this.getAuthenticationToken();
            this._authTokenExpiresAt = now + AUTH_TOKEN_TTL_MS;
        }
        return this._authToken;
    }

    // customer/service/apiKeyに紐づくエンドポイントへの共通リクエスト処理。
    // JSON bodyのAPIは body にプレーンオブジェクトを、
    // multipartのAPIは body に FormData を渡す。
    async _request(pathSuffix, options = {}) {
        const {
            method = "GET",
            query,
            body,
            errorLabel = "Request",
        } = options;

        await this.checkParameter();
        const token = await this._getValidAuthenticationToken();

        let url = getServerUrl() + `/v1/customers/${this.customerId}/services/${this.serviceId}/${this.apiKey}${pathSuffix}`;

        if (query) {
            const params = new URLSearchParams();
            for (const key in query) {
                if (query[key] !== undefined && query[key] !== null) {
                    params.append(key, query[key]);
                }
            }
            const qs = params.toString();
            if (qs) url += `?${qs}`;
        }

        const headers = {
            Accept: "application/json",
            "X-API-Version": API_VERSION,
            "X-Service-Key": this.sdkKey,
            Authorization: "Bearer " + token,
        };

        const fetchOptions = { method, headers };

        if (body !== undefined) {
            if (body instanceof FormData) {
                // Content-Type は boundary 付きで fetch が自動設定するため指定しない
                fetchOptions.body = body;
            } else {
                headers["Content-Type"] = "application/json;charset=UTF-8";
                fetchOptions.body = JSON.stringify(body);
            }
        }

        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            throw new Error(
                `${errorLabel} failed.(${response.status})${await readErrorDetail(response)}`
            );
        }
        return response;
    }

    async getTemplateData(templateId) {
        const response = await this._request(`/template/${templateId}`, {
            method: "GET",
            errorLabel: "Get template data",
        });
        return parseJsonSafely(response);
    }

    // title / message は未指定（undefined, null, 空文字）の場合テンプレートの値を使うため、
    // 長さ検証は値が指定されている場合のみ行う。
    _validateTitleAndMessage(title, message) {
        if (title && title.length > 30) {
            throw new Error('The title should be 30 characters or less.');
        }

        if (message && message.length > 320) {
            throw new Error('The message should be 320 characters or less.');
        }
    }

    async createPostingData(templateId, title, message, multiMediaId, segments, options = {}, allowSegmentFiles = false) {
        let template = await this.getTemplateData(templateId);

        template.title = title || template.title;
        template.body = message || template.body;
        template.multimedia = multiMediaId !== undefined ? multiMediaId : template.multimedia;

        if (segments) {
            template.segments = buildSegments(segments, allowSegmentFiles);
        }

        for (const field of OVERRIDABLE_POSTING_FIELDS) {
            if (options[field] !== undefined) {
                template[field] = options[field];
            }
        }

        return template;
    }

    async registerPosting(isDraft, isSkipApproval, templateId, title, message, multiMediaId, options = {}) {
        this._validateTitleAndMessage(title, message);

        let postingData = await this.createPostingData(templateId, title, message, multiMediaId, options.segments, options);

        const response = await this._request("/postings", {
            method: "POST",
            query: { is_draft: Number(isDraft), is_skip_approved: Number(isSkipApproval) },
            body: postingData,
            errorLabel: "Register message",
        });

        const json = response.status === 201 ? await parseJsonSafely(response) : undefined;

        return {
            postingDetailId: json ? json.posting_detail_id : undefined,
            url: json ? json.url : undefined,
        };
    }

    async registerPostingWithLargeSegments(isDraft, isSkipApproval, templateId, title, message, multiMediaId, segments, options = {}) {
        this._validateTitleAndMessage(title, message);

        // このAPIでは文字列をセグメント値ファイルのパスとして扱う
        let postingData = await this.createPostingData(templateId, title, message, multiMediaId, segments, options, true);

        const formData = new FormData();
        formData.append("payload", JSON.stringify(postingData));

        // ファイル指定したセグメントのみ本体を添付する。
        // 配列で値を直接指定したセグメントはペイロードに含まれるため添付しない。
        for (const key in segments) {
            if (isSegmentFile(segments[key])) {
                await appendFileToFormData(formData, key, segments[key], "text/plain");
            }
        }

        const response = await this._request("/large-segment-postings", {
            method: "POST",
            query: { is_draft: Number(isDraft), is_skip_approved: Number(isSkipApproval) },
            body: formData,
            errorLabel: "Register message",
        });

        const json = response.status === 201 ? await parseJsonSafely(response) : undefined;

        return {
            postingDetailId: json ? json.posting_detail_id : undefined,
            url: json ? json.url : undefined,
        };
    }

    async updatePostingStatus(postingDetailId, approvalStatus, comment) {
        await this._request(`/postings/${postingDetailId}/status`, {
            method: "PUT",
            body: { approval_status: approvalStatus, comment },
            errorLabel: "Update posting status",
        });
    }

    async stopDevidedPosting(postingDetailId) {
        await this._request(`/postings/${postingDetailId}/stop-devide-posting`, {
            method: "PUT",
            errorLabel: "Stop devided posting",
        });
    }

    async getPublishInfo(postingDetailId) {
        const response = await this._request(`/publishInfo/${postingDetailId}`, {
            method: "GET",
            errorLabel: "Get publish info",
        });
        return parseJsonSafely(response);
    }

    async registerOneshotPosting(templateId, options = {}) {
        const { deviceToken, segment, variables, standbyMinutes } = options;

        const body = { posting_template_id: templateId };
        if (deviceToken !== undefined) body.device_token = deviceToken;
        if (segment !== undefined) body.segment = segment;
        if (variables !== undefined) body.variables = variables;
        if (standbyMinutes !== undefined) body.standby_time = { value: standbyMinutes, unit: "m" };

        const response = await this._request("/oneshot-posting", {
            method: "POST",
            body,
            errorLabel: "Register oneshot posting",
        });

        const json = await parseJsonSafely(response);
        if (!json || !json.ids) return [];
        return json.ids.map(entry => entry.oneshot_posting_id);
    }

    async cancelOneshotPosting(oneshotPostingId) {
        await this._request(`/oneshot-posting/${oneshotPostingId}`, {
            method: "DELETE",
            errorLabel: "Cancel oneshot posting",
        });
    }

    async registerMedia(movieFilePath, imageFilePath) {
        // どちらも未指定だと空のマルチパートを送ってしまい、
        // サーバ側でバリデーションエラー(422)になるため事前に弾く。
        if (!movieFilePath && !imageFilePath) {
            throw new Error("A movieFile or imageFile is required.");
        }

        if (movieFilePath && !imageFilePath) {
            throw new Error("A imageFile is required, if you will register movie.");
        }

        var movieFileUrl;
        if (movieFilePath &&
            (movieFilePath.indexOf("http://") == 0 || movieFilePath.indexOf("https://") == 0)) {
            movieFileUrl = movieFilePath;
        }

        var imageFileUrl;
        if (imageFilePath &&
            (imageFilePath.indexOf("http://") == 0 || imageFilePath.indexOf("https://") == 0)) {
            imageFileUrl = imageFilePath;
        }

        const formData = new FormData();
        if (movieFileUrl) {
            formData.append("movieUrl", movieFileUrl);
        } else if (movieFilePath) {
            await appendFileToFormData(formData, "movie", movieFilePath);
        }

        if (imageFileUrl) {
            formData.append("imageUrl", imageFileUrl);
        } else if (imageFilePath) {
            await appendFileToFormData(formData, "image", imageFilePath);
        }

        const response = await this._request("/media", {
            method: "POST",
            body: formData,
            errorLabel: "Register media",
        });

        const json = await response.json();
        return json.media_id;
    }

    async getSegments() {
        const response = await this._request("/segments/control/list", {
            method: "GET",
            errorLabel: "Get segments",
        });
        const json = await parseJsonSafely(response);
        if (!json) return null;
        return json.segmentControl;
    }

    async updateSegmentDescription(id, description) {
        await this._request("/segments/control/description", {
            method: "POST",
            body: { id, description },
            errorLabel: "Update description of segment",
        });
    }

    async updateSegmentStatus(id, isDisable) {
        await this._request("/segments/control/disabled", {
            method: "POST",
            body: { id, disabled: isDisable ? "1" : "0" },
            errorLabel: "Update status of segment",
        });
    }
}
