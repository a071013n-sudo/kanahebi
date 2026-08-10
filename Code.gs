/**
 * カナヘビ観察日記 - GASプロキシ(Gemini API版)
 *
 * 役割:
 *   1. PWA側から送られてきた写真(base64)を受け取る
 *   2. Gemini API(Vision)に解析を依頼する
 *   3. 結果をJSONでPWAに返す
 *
 * セットアップ:
 *   1. このコードを新規Apps Scriptプロジェクトに貼り付ける
 *   2. 左メニュー「プロジェクトの設定」→「スクリプト プロパティ」で
 *      キー: GEMINI_API_KEY / 値: あなたのAPIキー を追加
 *      (キーは https://aistudio.google.com/apikey で発行できます)
 *   3. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」
 *        実行するユーザー: 自分
 *        アクセスできるユーザー: 全員
 *      でデプロイし、発行されたURL(/exec)を控える
 *   4. そのURLをPWA側の設定画面に入力する
 */

var MODEL = 'gemini-3.6-flash';
var API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOutput({ error: 'リクエストの本文が空です。' });
    }

    var body = JSON.parse(e.postData.contents);
    var imageBase64 = body.image;
    var mimeType = body.mimeType || 'image/jpeg';

    if (!imageBase64) {
      return jsonOutput({ error: '画像データがありません。' });
    }

    var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return jsonOutput({ error: 'スクリプトプロパティに GEMINI_API_KEY が設定されていません。' });
    }

    var systemPrompt = buildSystemPrompt();
    var userText = buildUserPrompt();

    var payload = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: userText }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4
      }
    };

    var url = API_BASE + MODEL + ':generateContent';
    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-goog-api-key': apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var status = response.getResponseCode();
    var responseText = response.getContentText();

    if (status !== 200) {
      return jsonOutput({ error: 'Gemini APIエラー (status ' + status + ')', detail: responseText });
    }

    var data = JSON.parse(responseText);

    if (!data.candidates || !data.candidates.length) {
      return jsonOutput({ error: 'Geminiから有効な応答が得られませんでした。', detail: responseText });
    }

    var parts = data.candidates[0].content.parts || [];
    var text = '';
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].text) text += parts[i].text;
    }
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    var result;
    try {
      result = JSON.parse(text);
    } catch (parseErr) {
      return jsonOutput({ error: 'AI応答の解析に失敗しました。', raw: text });
    }

    return jsonOutput(result);

  } catch (err) {
    return jsonOutput({ error: 'サーバーエラー: ' + err.message });
  }
}

function doGet(e) {
  return jsonOutput({ status: 'ok', message: 'カナヘビ観察日記 API(Gemini版) は動作しています。POSTでリクエストしてください。' });
}

function buildSystemPrompt() {
  return [
    'あなたは爬虫類(ニホンカナヘビ)の飼育経験が豊富な観察アシスタントです。',
    '送られた写真から、体調管理の参考になりそうな「見た目の兆候」を落ち着いた口調で指摘してください。',
    '',
    '重要な制約:',
    '- あなたは獣医ではなく、写真からの診断には限界があります。断定的な病名の診断は行わないでください。',
    '- 内臓疾患・寄生虫など写真から判断できないことは「わからない」と正直に述べてください。',
    '- ぐったりしている、目が開かない、口が閉じない、出血、著しい痩せなど緊急性が疑われる所見があれば',
    '  vet_recommended を true にし、理由を明確に書いてください。',
    '- 出力は必ず以下のJSON形式のみで、説明文やコードブロック記号は付けないこと。',
    '',
    '{',
    '  "overall_impression": "写真全体から受ける印象を1〜2文で",',
    '  "findings": [',
    '    { "item": "脱皮", "status": "良好|注意|判断不可", "detail": "具体的な所見" },',
    '    { "item": "目", "status": "良好|注意|判断不可", "detail": "..." },',
    '    { "item": "口・鼻先", "status": "良好|注意|判断不可", "detail": "..." },',
    '    { "item": "体型・痩せ", "status": "良好|注意|判断不可", "detail": "..." },',
    '    { "item": "皮膚・外傷", "status": "良好|注意|判断不可", "detail": "..." },',
    '    { "item": "尻尾", "status": "良好|注意|判断不可", "detail": "..." }',
    '  ],',
    '  "care_advice": ["今日から実践できる世話のアドバイスを2〜4個、具体的に"],',
    '  "vet_recommended": false,',
    '  "vet_reason": "vet_recommendedがtrueの場合のみ理由を記載、falseなら空文字",',
    '  "disclaimer": "この結果は写真からの参考情報であり、獣医による診断の代わりにはなりません、という趣旨の一文"',
    '}'
  ].join('\n');
}

function buildUserPrompt() {
  return 'この写真は自宅で飼育しているニホンカナヘビです。写真から読み取れる範囲で健康状態の気になる点と、今日からできる世話のアドバイスを教えてください。指定のJSON形式のみで回答してください。';
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
